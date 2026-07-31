import { Hono, Context, Next } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';

type AdminCtx = Context<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>;

// Platform-wide billing configuration (superadmin-owned). Currently: the metered
// SMS rate (USD per SMS) and a USD->INR fallback used when the live FX call fails.
export const platformConfigRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

export const requireSuperadmin = async (c: AdminCtx, next: Next) => {
  if (c.var.adminRole !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  // Re-verify against the DB — a stale JWT for a demoted admin must not pass.
  const cur = await c.env.CONTROL_DB.prepare('SELECT role FROM admins WHERE id = ?')
    .bind(c.var.adminId).first<{ role: string }>();
  if (!cur || cur.role !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  await next();
};

// Idempotent: create the singleton config table + seed one row. CREATE TABLE IF NOT
// EXISTS is safe to run repeatedly (unlike ADD COLUMN), so no migration file needed.
export async function ensurePlatformConfig(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS platform_config (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    sms_rate_usd REAL NOT NULL DEFAULT 0.10,
    usd_inr_fallback REAL NOT NULL DEFAULT 88.0,
    sms_daily_cap INTEGER NOT NULL DEFAULT 50,
    sms_disabled INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run().catch(() => {});
  await db.prepare("INSERT OR IGNORE INTO platform_config (id) VALUES ('singleton')").run().catch(() => {});
}

platformConfigRouter.get('/', adminAuth, requireSuperadmin, async (c) => {
  await ensurePlatformConfig(c.env.CONTROL_DB);
  const row = await c.env.CONTROL_DB.prepare('SELECT * FROM platform_config WHERE id = ?').bind('singleton').first();
  return c.json(ok(row ?? { id: 'singleton', sms_rate_usd: 0.10, usd_inr_fallback: 88.0 }));
});

platformConfigRouter.patch('/', adminAuth, requireSuperadmin, async (c) => {
  await ensurePlatformConfig(c.env.CONTROL_DB);
  const body = await c.req.json().catch(() => ({}));

  const rate = body.sms_rate_usd;
  if (rate === undefined || typeof rate !== 'number' || !isFinite(rate) || rate < 0) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'sms_rate_usd must be a non-negative number'), 400);
  }
  // Optional fallback FX override.
  const fallback = body.usd_inr_fallback;
  if (fallback !== undefined && (typeof fallback !== 'number' || !isFinite(fallback) || fallback <= 0)) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'usd_inr_fallback must be a positive number'), 400);
  }
  // SMS abuse controls. Cap is per tenant per UTC day; 0 blocks that tenant outright,
  // sms_disabled is the platform-wide kill switch.
  const cap = body.sms_daily_cap;
  if (cap !== undefined && (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0)) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'sms_daily_cap must be a non-negative integer'), 400);
  }
  const disabled = body.sms_disabled;
  if (disabled !== undefined && typeof disabled !== 'boolean') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'sms_disabled must be a boolean'), 400);
  }

  await c.env.CONTROL_DB.prepare(
    'UPDATE platform_config SET sms_rate_usd = ?, usd_inr_fallback = COALESCE(?, usd_inr_fallback),' +
    ' sms_daily_cap = COALESCE(?, sms_daily_cap), sms_disabled = COALESCE(?, sms_disabled),' +
    ' updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(rate, fallback ?? null, cap ?? null, disabled === undefined ? null : (disabled ? 1 : 0), c.var.adminId, 'singleton').run();

  const row = await c.env.CONTROL_DB.prepare('SELECT * FROM platform_config WHERE id = ?').bind('singleton').first();
  return c.json(ok(row));
});
