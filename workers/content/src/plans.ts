import { Hono } from 'hono';
import { getTenantDb } from './db';
import { ok, err, ErrorCode, SubscriptionInterval } from '@epaper/types';

// Tenant-facing management of content tiers and reader subscription plans.
// Mounted under the orgUserAuth guard (see index.ts).
export const plansRouter = new Hono<{ Bindings: Record<string, unknown>; Variables: { userId: string } }>();

const VALID_INTERVALS: SubscriptionInterval[] = ['monthly', '6month', '12month'];

// --- Tiers ---

plansRouter.get('/:slug/tiers', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const rows = await db.prepare('SELECT * FROM tiers ORDER BY created_at DESC').all();
    return c.json(ok({ items: rows.results }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

plansRouter.post('/:slug/tiers', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  if (!body.name) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing tier name'), 400);
  try {
    const db = getTenantDb(c.env, slug);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO tiers (id, name, description) VALUES (?, ?, ?)')
      .bind(id, body.name, body.description ?? null).run();
    return c.json(ok({ id }), 201);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

plansRouter.delete('/:slug/tiers/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  try {
    const db = getTenantDb(c.env, slug);
    await db.prepare('DELETE FROM tiers WHERE id = ?').bind(id).run();
    return c.json(ok({ deleted: true }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

// --- Plans ---

plansRouter.get('/:slug/plans', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const rows = await db.prepare(
      `SELECT p.*, t.name AS tier_name FROM plans p JOIN tiers t ON t.id = p.tier_id ORDER BY p.created_at DESC`
    ).all();
    return c.json(ok({ items: rows.results }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

function validatePlan(body: any): string | null {
  if (!body.tier_id) return 'Missing tier';
  if (!body.name) return 'Missing plan name';
  if (typeof body.price_paise !== 'number' || body.price_paise < 0) return 'Invalid price';
  if (!VALID_INTERVALS.includes(body.interval)) return 'Invalid interval';
  if (body.offer_pct != null && (body.offer_pct < 0 || body.offer_pct > 100)) return 'Invalid offer percent';
  return null;
}

plansRouter.post('/:slug/plans', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const invalid = validatePlan(body);
  if (invalid) return c.json(err(ErrorCode.BAD_REQUEST, invalid), 400);
  try {
    const db = getTenantDb(c.env, slug);
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO plans (id, tier_id, name, interval, price_paise, offer_pct, offer_label, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, body.tier_id, body.name, body.interval, body.price_paise,
           body.offer_pct ?? 0, body.offer_label ?? null, body.active === false ? 0 : 1).run();
    return c.json(ok({ id }), 201);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

plansRouter.patch('/:slug/plans/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const body = await c.req.json();
  try {
    const db = getTenantDb(c.env, slug);
    const existing = await db.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first<any>();
    if (!existing) return c.json(err(ErrorCode.NOT_FOUND, 'Plan not found'), 404);

    const merged = {
      name: body.name ?? existing.name,
      interval: body.interval ?? existing.interval,
      price_paise: body.price_paise ?? existing.price_paise,
      offer_pct: body.offer_pct ?? existing.offer_pct,
      offer_label: body.offer_label !== undefined ? body.offer_label : existing.offer_label,
      active: body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
    };
    if (!VALID_INTERVALS.includes(merged.interval)) return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid interval'), 400);

    await db.prepare(
      `UPDATE plans SET name=?, interval=?, price_paise=?, offer_pct=?, offer_label=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(merged.name, merged.interval, merged.price_paise, merged.offer_pct, merged.offer_label, merged.active, id).run();
    return c.json(ok({ updated: true }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

plansRouter.delete('/:slug/plans/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  try {
    const db = getTenantDb(c.env, slug);
    await db.prepare('DELETE FROM plans WHERE id = ?').bind(id).run();
    return c.json(ok({ deleted: true }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});
