// Manual subscription grants: activating, extending, and deactivating reader access
// with an explicit start/end datetime, outside the Razorpay mandate.
//
// Two callers, one implementation:
//   • superadmin, via a service binding from the admin worker (/internal/*)
//   • publisher staff, with their own tenant-portal JWT (/:slug/manual-subscriptions)
// Both land in the same helpers below, so a grant made from the CRM and one made from
// the publisher portal are the same row — which is what "reflected on the publisher
// side" means in practice.
//
// Why manual grants exist: the e-mandate cannot take cash at a counter, a cheque, a
// bank transfer, or enterprise terms. Those readers still need access, and when an
// online subscription lapses (see the expiry sweep in index.ts) reactivation by
// arrangement is the only route back.

import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { getTenantDb } from './db';
import { verifyJwt } from './jwt';

export interface GrantsEnv {
  ORG_JWT_SECRET: string;
  // Shared with the admin worker; the only thing standing between the internal routes
  // and the public internet if this worker is ever given a route of its own.
  INTERNAL_SECRET?: string;
  [key: string]: unknown;
}

export const grantsRouter = new Hono<{ Bindings: GrantsEnv }>();

const BASE = '/api/billing/tenant';

type SubRow = {
  id: string;
  reader_id: string;
  razorpay_sub_id: string | null;
  status: string;
  current_start: string;
  current_end: string;
  grant_type: string;
};

// Same defensive pattern as ensureBillingColumns: a tenant DB that hasn't taken
// migration 0013 yet must not 500 the first grant.
export async function ensureGrantColumns(db: D1Database) {
  await db.prepare("ALTER TABLE reader_subscriptions ADD COLUMN grant_type TEXT NOT NULL DEFAULT 'razorpay'").run().catch(() => {});
  await db.prepare('ALTER TABLE reader_subscriptions ADD COLUMN granted_by TEXT').run().catch(() => {});
  await db.prepare('ALTER TABLE reader_subscriptions ADD COLUMN grant_note TEXT').run().catch(() => {});
  await db.prepare('ALTER TABLE reader_subscriptions ADD COLUMN renewal_notified_at DATETIME').run().catch(() => {});
}

/**
 * Normalise a caller-supplied datetime to a UTC ISO string.
 *
 * The portal sends `<input type="datetime-local">` values ('2026-08-01T09:30'), which
 * have no zone. Date.parse reads those as local time *in the worker* — always UTC on
 * Cloudflare — so a bare value is treated as UTC deliberately and consistently, and a
 * client wanting a specific zone sends an offset. Storing ISO matches what
 * /reader/verify writes, so the substr(...,1,19) comparisons in the access checks work
 * on manual and Razorpay rows alike.
 */
function toIso(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const raw = v.trim();
  // Bare datetime-local: pin it to UTC rather than letting the runtime guess.
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw}Z` : raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// getTenantDb throws only for an unresolvable slug (see db.ts). Everything else caught by
// these routes is a real fault — a D1 write failure, a constraint violation — and reporting
// it as "Tenant DB not found" sends operators looking at bindings instead of the error.
function dbError(c: any, e: unknown) {
  if (e instanceof Error && e.message.startsWith('Database binding not found')) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
  console.error('[billing-tenant] grants route failed', c.req.method, c.req.path, e);
  return c.json(err(ErrorCode.INTERNAL_ERROR, 'Could not complete the request'), 500);
}

/** Create or extend a manual grant for one reader. Returns the row id. */
async function grantManual(
  db: D1Database,
  input: { readerId: string; tierId: string | null; planType: string; startAt: string; endAt: string; grantedBy: string; note: string | null },
): Promise<{ id: string; reactivated: boolean }> {
  // Reuse the reader's existing manual row instead of stacking one per cash payment —
  // otherwise "is this reader active?" becomes a question about which row wins.
  const existing = await db.prepare(
    "SELECT id FROM reader_subscriptions WHERE reader_id = ? AND grant_type = 'manual' ORDER BY created_at DESC LIMIT 1"
  ).bind(input.readerId).first<{ id: string }>();

  if (existing) {
    await db.prepare(
      `UPDATE reader_subscriptions
       SET status='active', tier_id=?, plan_type=?, current_start=?, current_end=?,
           granted_by=?, grant_note=?, cancelled_at=NULL, renewal_notified_at=NULL,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(input.tierId, input.planType, input.startAt, input.endAt, input.grantedBy, input.note, existing.id).run();
    return { id: existing.id, reactivated: true };
  }

  const id = crypto.randomUUID();
  // razorpay_sub_id is UNIQUE NOT NULL (0001_init) and relaxing it would mean rebuilding
  // the table in every tenant DB. A synthetic id keeps the constraint honest; grant_type
  // is what code branches on, never this prefix.
  await db.prepare(
    `INSERT INTO reader_subscriptions
       (id, reader_id, razorpay_sub_id, plan_type, tier_id, status, current_start, current_end, grant_type, granted_by, grant_note)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 'manual', ?, ?)`
  ).bind(id, input.readerId, `manual:${crypto.randomUUID()}`, input.planType, input.tierId,
         input.startAt, input.endAt, input.grantedBy, input.note).run();
  return { id, reactivated: false };
}

/** Shift an end date or deactivate. Only ever touches manual rows. */
async function patchManual(
  db: D1Database,
  subId: string,
  // endAt null/undefined both mean "leave the end date alone" — toIso() yields null for a
  // body that omitted it, and the callers pass that straight through.
  input: { endAt?: string | null; status?: 'active' | 'cancelled'; grantedBy: string; note?: string | null },
): Promise<SubRow | null> {
  const row = await db.prepare('SELECT * FROM reader_subscriptions WHERE id = ?').bind(subId).first<SubRow>();
  if (!row) return null;
  // A Razorpay row's dates are owned by the mandate: editing them here would silently
  // disagree with what the next subscription.charged webhook writes back.
  if (row.grant_type !== 'manual') return null;

  const nextStatus = input.status ?? row.status;
  const nextEnd = input.endAt ?? row.current_end;
  await db.prepare(
    `UPDATE reader_subscriptions
     SET status=?, current_end=?, granted_by=?,
         grant_note=COALESCE(?, grant_note),
         -- COALESCE keeps the original cancellation time: patching only end_at on an
         -- already-cancelled row must not restamp it, since the refund window reads it.
         cancelled_at=CASE WHEN ?='cancelled' THEN COALESCE(cancelled_at, CURRENT_TIMESTAMP) ELSE NULL END,
         renewal_notified_at=NULL, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(nextStatus, nextEnd, input.grantedBy, input.note ?? null, nextStatus, subId).run();

  return db.prepare('SELECT * FROM reader_subscriptions WHERE id = ?').bind(subId).first<SubRow>();
}

// Validate a create body once for both callers.
function readGrantBody(body: any): { readerId: string; tierId: string | null; planType: string; startAt: string; endAt: string; note: string | null } | string {
  if (typeof body?.reader_id !== 'string' || !body.reader_id) return 'reader_id is required';
  const startAt = toIso(body.start_at) ?? new Date().toISOString();
  const endAt = toIso(body.end_at);
  if (!endAt) return 'end_at must be a valid date/datetime';
  if (Date.parse(endAt) <= Date.parse(startAt)) return 'end_at must be after start_at';
  return {
    readerId: body.reader_id,
    tierId: typeof body.tier_id === 'string' && body.tier_id ? body.tier_id : null,
    // plan_type is a display/interval label; manual grants aren't on an interval at all.
    planType: typeof body.plan_type === 'string' && body.plan_type ? body.plan_type : 'manual',
    startAt,
    endAt,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null,
  };
}

// ── Superadmin path (service binding from the admin worker) ─────────────────

// Constant-time compare so a wrong secret can't be recovered a byte at a time.
function secretOk(env: GrantsEnv, header: string | undefined): boolean {
  const expected = env.INTERNAL_SECRET;
  if (!expected || !header || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

grantsRouter.use(`${BASE}/internal/*`, async (c, next) => {
  if (!secretOk(c.env, c.req.header('X-Internal-Secret'))) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Internal call only'), 401);
  }
  await next();
});

grantsRouter.post(`${BASE}/internal/:slug/subscriptions`, async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const parsed = readGrantBody(body);
  if (typeof parsed === 'string') return c.json(err(ErrorCode.BAD_REQUEST, parsed), 400);
  const grantedBy = typeof body.granted_by === 'string' ? body.granted_by : 'admin:unknown';
  try {
    const db = getTenantDb(c.env, slug);
    await ensureGrantColumns(db);
    const reader = await db.prepare('SELECT id FROM readers WHERE id = ?').bind(parsed.readerId).first();
    if (!reader) return c.json(err(ErrorCode.NOT_FOUND, 'Reader not found'), 404);
    const res = await grantManual(db, { ...parsed, grantedBy });
    return c.json(ok({ ...res, current_start: parsed.startAt, current_end: parsed.endAt }), res.reactivated ? 200 : 201);
  } catch (e) {
    return dbError(c, e);
  }
});

grantsRouter.patch(`${BASE}/internal/:slug/subscriptions/:id`, async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const endAt = body.end_at === undefined ? undefined : toIso(body.end_at);
  if (body.end_at !== undefined && !endAt) return c.json(err(ErrorCode.BAD_REQUEST, 'end_at must be a valid date/datetime'), 400);
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'cancelled') {
    return c.json(err(ErrorCode.BAD_REQUEST, "status must be 'active' or 'cancelled'"), 400);
  }
  try {
    const db = getTenantDb(c.env, slug);
    await ensureGrantColumns(db);
    const row = await patchManual(db, c.req.param('id'), {
      endAt, status: body.status,
      grantedBy: typeof body.granted_by === 'string' ? body.granted_by : 'admin:unknown',
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    });
    if (!row) return c.json(err(ErrorCode.NOT_FOUND, 'No manual subscription with that id'), 404);
    return c.json(ok(row));
  } catch (e) {
    return dbError(c, e);
  }
});

// Superadmin support flow: a reader writes in with an email address, not a UUID, and
// the CRM has no tenant D1 binding to list readers with. One lookup returns the reader
// and every subscription row, which is all the CRM needs to grant, extend or end one.
grantsRouter.get(`${BASE}/internal/:slug/reader-lookup`, async (c) => {
  const email = c.req.query('email');
  if (!email) return c.json(err(ErrorCode.BAD_REQUEST, 'email is required'), 400);
  try {
    const db = getTenantDb(c.env, c.req.param('slug'));
    await ensureGrantColumns(db);
    const reader = await db.prepare('SELECT id, email, name FROM readers WHERE email = ?')
      .bind(email).first<{ id: string; email: string; name: string }>();
    if (!reader) return c.json(err(ErrorCode.NOT_FOUND, 'No reader with that email'), 404);
    const rows = await db.prepare(
      `SELECT id, tier_id, plan_type, status, current_start, current_end, grant_type, granted_by, grant_note
       FROM reader_subscriptions WHERE reader_id = ? ORDER BY created_at DESC`
    ).bind(reader.id).all();
    return c.json(ok({ reader, items: rows.results ?? [] }));
  } catch (e) {
    return dbError(c, e);
  }
});

// ── Publisher path (tenant-portal JWT) ──────────────────────────────────────

// The JWT is checked against the slug in the URL, and getTenantDb only resolves the
// binding for that slug, so a publisher cannot reach another publication's readers.
async function staffFor(c: any, slug: string): Promise<{ sub: string; role: string; permissions: string[] | null } | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const p = await verifyJwt(auth.substring(7), c.env.ORG_JWT_SECRET);
  if (!p || p.aud !== 'tenant-portal' || p.tenantSlug !== slug || typeof p.sub !== 'string') return null;
  // Same shape rule as parsePermissions in workers/auth/src/middleware.ts: a non-empty
  // array of strings, or no explicit grant (null) and may() falls back to role.
  const claim = p.permissions;
  const perms = Array.isArray(claim) && claim.length && claim.every((s) => typeof s === 'string')
    ? (claim as string[]) : null;
  return {
    sub: p.sub as string,
    role: (p.role as string) ?? 'editor',
    permissions: perms,
  };
}

// ABAC check for tenant-portal callers. An explicit permissions array is authoritative;
// without one we fall back to role. See can() in workers/auth/src/middleware.ts for the
// same rule. Exported so index.ts gates its reader routes on the same logic.
export function may(staff: { role: string; permissions: string[] | null }, perm: string): boolean {
  // An empty array is an unconfigured column, not a deny-all — otherwise it would lock
  // an owner out of their own portal with no UI to undo it.
  if (staff.permissions?.length) return staff.permissions.includes(perm);
  return staff.role === 'owner' || staff.role === 'admin';
}

// Cash grants are money changing hands off-platform: not every editor should be able
// to open access.
function mayGrant(staff: { role: string; permissions: string[] | null }): boolean {
  return may(staff, 'grant_subs');
}

grantsRouter.post(`${BASE}/:slug/manual-subscriptions`, async (c) => {
  const slug = c.req.param('slug');
  const staff = await staffFor(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  if (!mayGrant(staff)) return c.json(err(ErrorCode.FORBIDDEN, 'Not allowed to grant subscriptions'), 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = readGrantBody(body);
  if (typeof parsed === 'string') return c.json(err(ErrorCode.BAD_REQUEST, parsed), 400);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureGrantColumns(db);
    const reader = await db.prepare('SELECT id FROM readers WHERE id = ?').bind(parsed.readerId).first();
    if (!reader) return c.json(err(ErrorCode.NOT_FOUND, 'Reader not found'), 404);
    const res = await grantManual(db, { ...parsed, grantedBy: `org:${staff.sub}` });
    return c.json(ok({ ...res, current_start: parsed.startAt, current_end: parsed.endAt }), res.reactivated ? 200 : 201);
  } catch (e) {
    return dbError(c, e);
  }
});

grantsRouter.patch(`${BASE}/:slug/manual-subscriptions/:id`, async (c) => {
  const slug = c.req.param('slug');
  const staff = await staffFor(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  if (!mayGrant(staff)) return c.json(err(ErrorCode.FORBIDDEN, 'Not allowed to change subscriptions'), 403);

  const body = await c.req.json().catch(() => ({}));
  const endAt = body.end_at === undefined ? undefined : toIso(body.end_at);
  if (body.end_at !== undefined && !endAt) return c.json(err(ErrorCode.BAD_REQUEST, 'end_at must be a valid date/datetime'), 400);
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'cancelled') {
    return c.json(err(ErrorCode.BAD_REQUEST, "status must be 'active' or 'cancelled'"), 400);
  }
  try {
    const db = getTenantDb(c.env, slug);
    await ensureGrantColumns(db);
    const row = await patchManual(db, c.req.param('id'), {
      endAt, status: body.status, grantedBy: `org:${staff.sub}`,
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    });
    if (!row) return c.json(err(ErrorCode.NOT_FOUND, 'No manual subscription with that id'), 404);
    return c.json(ok(row));
  } catch (e) {
    return dbError(c, e);
  }
});

// One reader's subscriptions, both lanes, so the portal and the CRM can show what is
// actually granting access right now instead of guessing from the readers list.
grantsRouter.get(`${BASE}/:slug/readers/:readerId/subscriptions`, async (c) => {
  const slug = c.req.param('slug');
  const staff = await staffFor(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureGrantColumns(db);
    const rows = await db.prepare(
      `SELECT id, tier_id, plan_type, status, current_start, current_end, grant_type, granted_by, grant_note
       FROM reader_subscriptions WHERE reader_id = ? ORDER BY created_at DESC`
    ).bind(c.req.param('readerId')).all();
    return c.json(ok({ items: rows.results ?? [] }));
  } catch (e) {
    return dbError(c, e);
  }
});
