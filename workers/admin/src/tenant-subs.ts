import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { requireSuperadmin } from './platform-config';
import { recordAudit } from './audit';
import { ok, err, ErrorCode } from '@epaper/types';

/**
 * Superadmin control over a *publisher's* subscription to the platform: activate a plan
 * for a fixed window, extend it, or end it now.
 *
 * The Razorpay e-mandate (workers/billing-platform) covers publications that pay online.
 * It cannot represent one paying by cheque, bank transfer or enterprise contract, nor a
 * pilot on a fixed free window — so a grant here sets `tenants.plan` directly and records
 * `manual_until` as the window's end. The sweep in index.ts downgrades the tenant to Free
 * once that datetime passes, which is what makes "activate until X" mean anything.
 *
 * Reader subscriptions are not this: publisher staff grant those in their own portal
 * (workers/billing-tenant/src/admin-grants.ts), against their own tenant DB.
 */
export const tenantSubsRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

tenantSubsRouter.use('/*', adminAuth, requireSuperadmin);

// Idempotent guard so a control DB that has not taken migration 0014 yet does not 500 the
// first grant. ADD COLUMN throws when the column exists, hence the swallow — migration
// 0014 is the real owner, this only covers the ordering gap.
let manualColumnsReady = false;
async function ensureManualColumns(db: D1Database) {
  if (manualColumnsReady) return;
  manualColumnsReady = true;
  for (const col of ['manual_until DATETIME', 'manual_since DATETIME', 'manual_granted_by TEXT', 'manual_note TEXT']) {
    await db.prepare(`ALTER TABLE tenants ADD COLUMN ${col}`).run().catch(() => {});
  }
}

/**
 * Normalise a caller-supplied datetime to a UTC ISO string.
 *
 * The CRM sends `<input type="datetime-local">` values ('2026-08-01T09:30'), which carry
 * no zone. Date.parse reads those as local time *in the worker* — always UTC on
 * Cloudflare — so a bare value is pinned to UTC deliberately rather than left to the
 * runtime, and a client wanting another zone sends an explicit offset. Same rule as
 * toIso() in workers/billing-tenant/src/admin-grants.ts.
 */
function toIso(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const raw = v.trim();
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw}Z` : raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Tell the publication its platform plan changed.
 *
 * The admin worker holds no Resend credentials; billing-platform does, along with the
 * `email_events` monitoring lane. So the send is delegated over the existing service
 * binding. Always fire-and-forget: the grant is the operation of record and must survive
 * a mail outage, so every caller ignores the result and only logs.
 */
export async function notifyPlanChange(
  env: Env,
  slug: string,
  payload: { kind: 'granted' | 'extended' | 'ended'; plan: string; until?: string | null },
): Promise<void> {
  try {
    const res = await env.BILLING_PLATFORM_WORKER.fetch(new Request(
      `http://billing/internal/billing/platform/${encodeURIComponent(slug)}/plan-change`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    ));
    // A service-binding fetch resolves for 4xx/5xx too, so without this an unreachable
    // route or a rejected payload logged nothing and looked exactly like a delivered mail.
    if (!res.ok) {
      console.error(
        `[admin] plan-change mail rejected for ${slug}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`,
      );
    }
  } catch (e) {
    console.error(`[admin] plan-change mail failed for ${slug}`, e);
  }
}

type TenantRow = {
  id: string; slug: string; name: string; email: string; plan: string; status: string;
  razorpay_sub_id: string | null; razorpay_plan_id: string | null;
  manual_since: string | null; manual_until: string | null;
  manual_granted_by: string | null; manual_note: string | null;
};

const SELECT_COLS =
  `id, slug, name, email, plan, status, razorpay_sub_id, razorpay_plan_id,
   manual_since, manual_until, manual_granted_by, manual_note`;

// Current platform-subscription state for one publication, plus the tier list the CRM
// needs to pick a plan. Razorpay's own status is deliberately not fetched here: the
// existing /api/admin/billing/platform/:slug/status route already does that.
tenantSubsRouter.get('/:slug', async (c) => {
  await ensureManualColumns(c.env.CONTROL_DB);
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare(`SELECT ${SELECT_COLS} FROM tenants WHERE slug = ?`)
    .bind(slug).first<TenantRow>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  const tiers = await c.env.CONTROL_DB.prepare('SELECT id, name FROM platform_tiers ORDER BY name').all();
  return c.json(ok({ tenant, tiers: tiers.results ?? [] }));
});

// Activate (or extend) a manual platform subscription: set the plan and the window it is
// good for. A tenant on a live Razorpay mandate is rejected — overriding the plan under
// an active mandate would disagree with the next subscription.charged webhook, and the
// existing tier-change route (PATCH /api/tenants/:slug) is the tool for that case.
tenantSubsRouter.post('/:slug', async (c) => {
  await ensureManualColumns(c.env.CONTROL_DB);
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));

  if (typeof body.plan !== 'string' || !body.plan.trim()) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'plan is required'), 400);
  }
  const startAt = toIso(body.start_at) ?? new Date().toISOString();
  const endAt = toIso(body.end_at);
  if (!endAt) return c.json(err(ErrorCode.BAD_REQUEST, 'end_at must be a valid date/datetime'), 400);
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'end_at must be after start_at'), 400);
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const tenant = await c.env.CONTROL_DB.prepare(`SELECT ${SELECT_COLS} FROM tenants WHERE slug = ?`)
    .bind(slug).first<TenantRow>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  if (tenant.razorpay_sub_id) {
    return c.json(err(ErrorCode.CONFLICT, 'Tenant is on a Razorpay mandate — cancel it before granting manually'), 409);
  }
  // The plan name is matched against a real tier: tenants.plan drives the limit lookup in
  // billing-platform's status route (LEFT JOIN platform_tiers ON LOWER(t.plan) = LOWER(p.name)),
  // so a typo here would silently leave the publication with no limits at all.
  const tier = await c.env.CONTROL_DB.prepare('SELECT name FROM platform_tiers WHERE LOWER(name) = LOWER(?)')
    .bind(body.plan.trim()).first<{ name: string }>();
  if (!tier) return c.json(err(ErrorCode.BAD_REQUEST, 'plan does not match any platform tier'), 400);

  // A suspended publication is reactivated by the grant — an operator opening access is
  // saying it should be serving content again.
  const nextStatus = tenant.status === 'suspended' ? 'active' : tenant.status;
  await c.env.CONTROL_DB.prepare(
    `UPDATE tenants SET plan = ?, status = ?, manual_since = ?, manual_until = ?,
       manual_granted_by = ?, manual_note = ?, updated_at = CURRENT_TIMESTAMP
     WHERE slug = ?`
  ).bind(tier.name, nextStatus, startAt, endAt, `admin:${c.var.adminId}`, note, slug).run();

  await recordAudit(c.env.CONTROL_DB, `admin:${c.var.adminId}`, 'tenant_subscription.manual_grant',
    JSON.stringify({ slug, plan: tier.name, start_at: startAt, end_at: endAt, note }), tenant.id);

  // Extending an existing window reads as "extended" to the publisher; a first grant, or one
  // that changes the plan, reads as "granted".
  const kind = tenant.manual_until && tenant.plan?.toLowerCase() === tier.name.toLowerCase() ? 'extended' : 'granted';
  c.executionCtx.waitUntil(notifyPlanChange(c.env, slug, { kind, plan: tier.name, until: endAt }));

  const row = await c.env.CONTROL_DB.prepare(`SELECT ${SELECT_COLS} FROM tenants WHERE slug = ?`)
    .bind(slug).first<TenantRow>();
  return c.json(ok(row));
});

// Shift the end date, or end the grant now. Only ever touches a manual grant: a Razorpay
// tenant has no manual_until to move, and its plan is the mandate's to decide.
tenantSubsRouter.patch('/:slug', async (c) => {
  await ensureManualColumns(c.env.CONTROL_DB);
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));

  const endAt = body.end_at === undefined ? undefined : toIso(body.end_at);
  if (body.end_at !== undefined && !endAt) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'end_at must be a valid date/datetime'), 400);
  }
  const deactivate = body.deactivate === true;
  if (endAt === undefined && !deactivate) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Provide end_at or deactivate:true'), 400);
  }

  const tenant = await c.env.CONTROL_DB.prepare(`SELECT ${SELECT_COLS} FROM tenants WHERE slug = ?`)
    .bind(slug).first<TenantRow>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  if (!tenant.manual_until) {
    return c.json(err(ErrorCode.NOT_FOUND, 'No manual subscription on this tenant'), 404);
  }

  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  if (deactivate) {
    // Clearing the window and dropping to Free is the same end state the sweep produces,
    // so an immediate deactivation and a lapsed one leave identical rows.
    await c.env.CONTROL_DB.prepare(
      `UPDATE tenants SET plan = 'Free', manual_until = NULL, manual_since = NULL,
         manual_granted_by = ?, manual_note = COALESCE(?, manual_note),
         updated_at = CURRENT_TIMESTAMP WHERE slug = ?`
    ).bind(`admin:${c.var.adminId}`, note, slug).run();
  } else {
    await c.env.CONTROL_DB.prepare(
      `UPDATE tenants SET manual_until = ?, manual_granted_by = ?,
         manual_note = COALESCE(?, manual_note), updated_at = CURRENT_TIMESTAMP WHERE slug = ?`
    ).bind(endAt, `admin:${c.var.adminId}`, note, slug).run();
  }

  await recordAudit(c.env.CONTROL_DB, `admin:${c.var.adminId}`,
    deactivate ? 'tenant_subscription.manual_deactivate' : 'tenant_subscription.manual_patch',
    JSON.stringify({ slug, end_at: endAt, note }), tenant.id);

  c.executionCtx.waitUntil(notifyPlanChange(c.env, slug, deactivate
    ? { kind: 'ended', plan: tenant.plan }
    : { kind: 'extended', plan: tenant.plan, until: endAt }));

  const row = await c.env.CONTROL_DB.prepare(`SELECT ${SELECT_COLS} FROM tenants WHERE slug = ?`)
    .bind(slug).first<TenantRow>();
  return c.json(ok(row));
});

/**
 * Downgrade publications whose manual window has closed. Runs on the admin worker's
 * existing 5-minute cron, so "active until 2026-08-01T09:30Z" stops being true within a
 * few minutes of that instant instead of whenever someone next looks.
 *
 * substr(...,1,19) drops the fractional seconds and Z that toISOString() emits — SQLite's
 * datetime() returns NULL on those, which would make every comparison false and the sweep
 * a silent no-op. Same reason the reader access checks slice their timestamps.
 *
 * Returns the rows it downgraded (slug + the plan they lost) so the caller can mail them;
 * the SELECT runs first because the UPDATE erases the very columns that identify them.
 * What is returned is the SELECT's plan intersected with the slugs the UPDATE actually
 * changed: the two statements are not atomic, so a grant extended or a Razorpay sub
 * attached in between makes a row stop matching DUE, and mailing "your plan ended" to a
 * publication that is still on it would be wrong. RETURNING alone cannot supply the plan —
 * it reports post-update values, which are all 'Free' by then.
 */
export async function sweepExpiredTenantGrants(db: D1Database): Promise<{ slug: string; plan: string }[]> {
  const DUE = `manual_until IS NOT NULL
       AND razorpay_sub_id IS NULL
       AND datetime(substr(manual_until, 1, 19)) <= datetime('now')`;

  const due = await db.prepare(`SELECT slug, plan FROM tenants WHERE ${DUE}`).all<{ slug: string; plan: string }>();
  if (!due.results?.length) return [];
  const priorPlan = new Map(due.results.map((r) => [r.slug, r.plan]));

  const changed = await db.prepare(
    `UPDATE tenants SET plan = 'Free', manual_until = NULL, manual_since = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE ${DUE}
     RETURNING slug`
  ).all<{ slug: string }>();

  return (changed.results ?? [])
    .filter((r) => priorPlan.has(r.slug))
    .map((r) => ({ slug: r.slug, plan: priorPlan.get(r.slug)! }));
}
