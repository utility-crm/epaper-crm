// Metered SMS billing. Firebase charges the platform ~$0.10 per verification SMS;
// we pass that through to the publisher who sent them. Runs on a monthly cron.
//
// Metering source: audit_log rows with action='auth.sms_send_requested', performed_by=slug.
// Phase 3 already blocks OTP sends for tenants who disabled phone auth, so the log only
// contains billable sends — no need to read per-tenant reader-auth config here.
//
// Idempotency: each (tenant, YYYY-MM) is billed at most once. The idempotency key is
// stored as the UNIQUE razorpay_event_id on platform_billing_events, so a re-run (or an
// overlapping cron) that tries to bill the same cycle hits the UNIQUE constraint and skips.

interface SmsBillingEnv {
  CONTROL_DB: D1Database;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  // Optional access key for exchangerate.host (the free keyless tier was retired).
  // When absent, the FX call is still attempted and falls back to the configured rate.
  EXCHANGERATE_ACCESS_KEY?: string;
}

interface RateConfig {
  smsRateUsd: number;
  usdInrFallback: number;
}

// fetch() with an AbortController timeout so a hung external call can't stall the sweep.
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Read the superadmin-configured SMS rate + FX fallback. Defaults match platform-config.ts.
async function loadRateConfig(db: D1Database): Promise<RateConfig> {
  try {
    const row = await db.prepare('SELECT sms_rate_usd, usd_inr_fallback FROM platform_config WHERE id = ?')
      .bind('singleton').first<{ sms_rate_usd: number; usd_inr_fallback: number }>();
    return {
      smsRateUsd: row?.sms_rate_usd ?? 0.10,
      usdInrFallback: row?.usd_inr_fallback ?? 88.0,
    };
  } catch {
    return { smsRateUsd: 0.10, usdInrFallback: 88.0 };
  }
}

// Live USD->INR via exchangerate.host. Fall back to the configured rate on any failure
// (timeout, HTTP error, missing/expired key, or no usable INR rate) — billing must not
// silently skip because an FX call flaked.
async function fetchUsdInr(fallback: number, accessKey?: string): Promise<{ rate: number; source: string }> {
  try {
    const params = new URLSearchParams({ base: 'USD', symbols: 'INR' });
    if (accessKey) params.set('access_key', accessKey);
    const res = await fetchWithTimeout(`https://api.exchangerate.host/latest?${params.toString()}`, {}, 8000);
    if (res.ok) {
      const data = await res.json() as { rates?: { INR?: number } };
      const rate = data.rates?.INR;
      if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
        return { rate, source: 'exchangerate.host' };
      }
    }
    console.error('FX fetch returned no usable INR rate; using fallback');
  } catch (e) {
    console.error('FX fetch failed; using fallback:', e);
  }
  return { rate: fallback, source: 'fallback' };
}

async function razorpayOrder(env: SmsBillingEnv, amountPaise: number, notes: Record<string, string>, receipt?: string) {
  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const body: Record<string, unknown> = { amount: amountPaise, currency: 'INR', notes };
  if (receipt) body.receipt = receipt;

  const res = await fetchWithTimeout('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 8000);
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
  return await res.json() as { id: string };
}

// Bill one tenant for SMS sent since its last billed timestamp. Returns a short status.
export async function billTenantSms(
  env: SmsBillingEnv,
  tenant: { id: string; slug: string; sms_last_billed_at: string | null },
  cfg: RateConfig,
  nowIso: string,
  monthKey: string,
): Promise<string> {
  // Window start: last billed marker, or epoch for a first-ever run.
  const since = tenant.sms_last_billed_at ?? '1970-01-01T00:00:00Z';

  // Count billable SMS since the last billed marker. auth.sms_billable is emitted by
  // the auth worker only on a verified reader phone-token exchange (server-attributed,
  // already reader-stage) — so no JSON filtering is needed here. Uses the dedicated
  // idx_audit_billable index (see runSmsBillingSweep) rather than the tenant_id index,
  // which SMS rows can't use (their tenant_id is null).
  //
  // Normalize both sides with datetime(): audit_log.created_at is written as SQLite
  // CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS') while since/nowIso are ISO-8601 with a
  // 'T' and 'Z'. A raw string compare would be wrong ('T' > ' '), so run both through
  // datetime() to compare as real timestamps. Bounds unchanged: exclusive lower (>),
  // inclusive upper (<=).
  const countRow = await env.CONTROL_DB.prepare(
    `SELECT COUNT(*) AS n FROM audit_log
     WHERE action = 'auth.sms_billable' AND performed_by = ?
       AND datetime(created_at) > datetime(?) AND datetime(created_at) <= datetime(?)`
  ).bind(tenant.slug, since, nowIso).first<{ n: number }>();
  const count = countRow?.n ?? 0;

  // Idempotency key — one charge per tenant per calendar month.
  const idempotencyKey = `sms-${tenant.id}-${monthKey}`;

  const advanceMarker = () =>
    env.CONTROL_DB.prepare('UPDATE tenants SET sms_last_billed_at = ? WHERE id = ?').bind(nowIso, tenant.id).run();

  const { rate: usdInr, source: fxSource } = await fetchUsdInr(cfg.usdInrFallback, env.EXCHANGERATE_ACCESS_KEY);
  const amountPaise = Math.round(count * cfg.smsRateUsd * usdInr * 100);

  // Free period: nothing metered, or a zero/sub-paise charge (e.g. rate set to 0).
  // Record a zero-amount event for audit and advance the marker WITHOUT calling
  // Razorpay — a 0-paise order would be rejected, stalling the window and causing a
  // catch-up charge if the rate is later raised. This treats the period as free.
  if (count === 0 || amountPaise <= 0) {
    await env.CONTROL_DB.prepare(
      'INSERT OR IGNORE INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(), tenant.id, 'sms.metered', idempotencyKey, 0,
      JSON.stringify({ order_id: null, sms_count: count, sms_rate_usd: cfg.smsRateUsd, usd_inr: usdInr, fx_source: fxSource, cycle: monthKey, free: true })
    ).run();
    await advanceMarker();
    return `${tenant.slug}: ${count} SMS, ${amountPaise} paise (free period, no charge)`;
  }

  // RESERVE the cycle key BEFORE the external call. The reservation is self-healing:
  //  - Fresh cycle: the INSERT wins and we hold the claim.
  //  - Orphaned 'pending' row (a prior run created an order-less reservation and its
  //    lease expired): the ON CONFLICT ... DO UPDATE ... WHERE status='pending' AND lease_expires_at < now
  //    RECLAIMS it by overwriting `id` with our token — so a failed cleanup can no
  //    longer block the cycle forever.
  //  - Finalized row ('ordered', or a terminal 'free' row with no status): the WHERE
  //    fails, nothing is written, and the ownership check below sends us to skip.
  // Concurrency stays safe: two sweeps racing the same key both upsert, the last write
  // wins `id`, and only the run whose token survived proceeds to Razorpay.
  const reservationId = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const receipt = idempotencyKey.length > 40
    ? `${idempotencyKey.slice(0, 39 - monthKey.length)}-${monthKey}`
    : idempotencyKey;

  const payload = JSON.stringify({
    order_id: null, status: 'pending', sms_count: count, sms_rate_usd: cfg.smsRateUsd,
    usd_inr: usdInr, fx_source: fxSource, cycle: monthKey, lease_expires_at: leaseExpiresAt
  });

  await env.CONTROL_DB.prepare(
    `INSERT INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(razorpay_event_id) DO UPDATE SET
       id = excluded.id,
       amount_paise = excluded.amount_paise,
       payload = excluded.payload
     WHERE json_extract(platform_billing_events.payload, '$.status') = 'pending'
       AND json_extract(platform_billing_events.payload, '$.lease_expires_at') < ?`
  ).bind(
    reservationId, tenant.id, 'sms.metered', idempotencyKey, amountPaise, payload, nowIso
  ).run();

  // Confirm WE hold the claim. If a finalized row already exists, or a concurrent run's
  // token overwrote ours, the stored id won't match — skip without hitting Razorpay.
  const claim = await env.CONTROL_DB.prepare(
    'SELECT id FROM platform_billing_events WHERE razorpay_event_id = ?'
  ).bind(idempotencyKey).first<{ id: string }>();
  if (claim?.id !== reservationId) {
    return `${tenant.slug}: cycle ${monthKey} already billed/reserved, skipped`;
  }

  let order: { id: string };
  try {
    order = await razorpayOrder(env, amountPaise, {
      kind: 'sms_metered', slug: tenant.slug, cycle: monthKey, sms_count: String(count),
    }, receipt);
  } catch (e) {
    // Order failed after we reserved the key. Best-effort release so the NEXT run can
    // retry immediately; if this DELETE also fails, the row stays 'pending' and a later
    // sweep reclaims it via the upsert above — the cycle is never permanently blocked.
    // Scope the delete to OUR reservation id so a concurrent reclaim isn't clobbered.
    await env.CONTROL_DB.prepare('DELETE FROM platform_billing_events WHERE razorpay_event_id = ? AND id = ?')
      .bind(idempotencyKey, reservationId).run()
      .catch(delErr => console.error(`[sms-billing] ${tenant.slug}: failed to release reservation for cycle ${monthKey} (will be reclaimed next sweep):`, delErr));
    throw e;
  }

  // Order created — finalize the reserved row with the order id AND advance the marker
  // in one batch, so a crash can't leave the row finalized but the billing window
  // un-advanced (which would re-count the same SMS next run).
  await env.CONTROL_DB.batch([
    env.CONTROL_DB.prepare(
      'UPDATE platform_billing_events SET payload = ? WHERE razorpay_event_id = ?'
    ).bind(
      JSON.stringify({ order_id: order.id, status: 'ordered', sms_count: count, sms_rate_usd: cfg.smsRateUsd, usd_inr: usdInr, fx_source: fxSource, cycle: monthKey }),
      idempotencyKey
    ),
    env.CONTROL_DB.prepare('UPDATE tenants SET sms_last_billed_at = ? WHERE id = ?').bind(nowIso, tenant.id),
  ]);

  return `${tenant.slug}: ${count} SMS -> ${amountPaise} paise (order ${order.id}, fx ${usdInr} via ${fxSource})`;
}

// Cron entry: bill every active tenant. Called from the worker's scheduled handler.
export async function runSmsBillingSweep(env: SmsBillingEnv, nowIso: string, monthKey: string): Promise<void> {
  // Idempotent marker column (control DB may predate this).
  await env.CONTROL_DB.prepare('ALTER TABLE tenants ADD COLUMN sms_last_billed_at DATETIME').run().catch(() => {});

  // Dedicated index for the metering count. SMS audit rows have a null tenant_id, so
  // the existing idx_audit_log_tenant_id can't serve this query — without this index
  // each tenant's COUNT would full-scan audit_log, which grows unbounded. Ordered
  // (action, performed_by, created_at) to match the WHERE + range predicate exactly.
  await env.CONTROL_DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_audit_billable ON audit_log(action, performed_by, created_at)'
  ).run().catch(() => {});

  const { results } = await env.CONTROL_DB.prepare(
    "SELECT id, slug, sms_last_billed_at FROM tenants WHERE status = 'active'"
  ).all<{ id: string; slug: string; sms_last_billed_at: string | null }>();

  const cfg = await loadRateConfig(env.CONTROL_DB);

  for (const t of results ?? []) {
    try {
      const status = await billTenantSms(env, t, cfg, nowIso, monthKey);
      console.log(`[sms-billing] ${status}`);
    } catch (e) {
      // One tenant's failure must not abort the sweep for the rest.
      console.error(`[sms-billing] ${t.slug}: FAILED`, e);
    }
  }
}
