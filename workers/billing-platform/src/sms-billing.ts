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
}

interface RateConfig {
  smsRateUsd: number;
  usdInrFallback: number;
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

// Live USD->INR via exchangerate.host (free, keyless). Fall back to the configured rate
// on any failure — billing must not silently skip because an FX call flaked.
async function fetchUsdInr(fallback: number): Promise<{ rate: number; source: string }> {
  try {
    const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=INR');
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

async function razorpayOrder(env: SmsBillingEnv, amountPaise: number, notes: Record<string, string>) {
  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', notes }),
  });
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

  // Count only READER-stage sends — the OTP the publisher opted into for their readers.
  // Publisher-stage SMS (the owner's own signup/login/add-phone) is not metered to them.
  // stage lives in the details JSON blob written by auth/firebase-auth.ts.
  const countRow = await env.CONTROL_DB.prepare(
    `SELECT COUNT(*) AS n FROM audit_log
     WHERE action = 'auth.sms_send_requested' AND performed_by = ?
       AND created_at > ? AND created_at <= ?
       AND json_extract(details, '$.stage') = 'reader'`
  ).bind(tenant.slug, since, nowIso).first<{ n: number }>();
  const count = countRow?.n ?? 0;

  if (count === 0) {
    // Nothing to bill; still advance the marker so the window doesn't grow unbounded.
    await env.CONTROL_DB.prepare('UPDATE tenants SET sms_last_billed_at = ? WHERE id = ?').bind(nowIso, tenant.id).run();
    return `${tenant.slug}: 0 SMS, skipped`;
  }

  const { rate: usdInr, source: fxSource } = await fetchUsdInr(cfg.usdInrFallback);
  const amountUsd = count * cfg.smsRateUsd;
  const amountPaise = Math.round(amountUsd * usdInr * 100);

  // Idempotency key — one charge per tenant per calendar month.
  const idempotencyKey = `sms-${tenant.id}-${monthKey}`;

  // Guard BEFORE calling Razorpay: if this cycle was already billed, don't create a
  // second order. (The UNIQUE insert below is the hard backstop.)
  const already = await env.CONTROL_DB.prepare(
    'SELECT id FROM platform_billing_events WHERE razorpay_event_id = ?'
  ).bind(idempotencyKey).first();
  if (already) return `${tenant.slug}: cycle ${monthKey} already billed, skipped`;

  const order = await razorpayOrder(env, amountPaise, {
    kind: 'sms_metered',
    slug: tenant.slug,
    cycle: monthKey,
    sms_count: String(count),
  });

  // Record the charge. The exact FX rate + count are stamped on the row for audit.
  // INSERT OR IGNORE on the UNIQUE razorpay_event_id makes concurrent runs safe.
  const res = await env.CONTROL_DB.prepare(
    'INSERT OR IGNORE INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(), tenant.id, 'sms.metered', idempotencyKey, amountPaise,
    JSON.stringify({ order_id: order.id, sms_count: count, sms_rate_usd: cfg.smsRateUsd, usd_inr: usdInr, fx_source: fxSource, cycle: monthKey })
  ).run();

  if (!res.meta.changes) {
    // Lost an idempotency race — another run inserted first. Order was created but the
    // dedupe key already exists; leave the marker to that run.
    return `${tenant.slug}: cycle ${monthKey} raced, skipped`;
  }

  await env.CONTROL_DB.prepare('UPDATE tenants SET sms_last_billed_at = ? WHERE id = ?').bind(nowIso, tenant.id).run();
  return `${tenant.slug}: ${count} SMS -> ${amountPaise} paise (order ${order.id}, fx ${usdInr} via ${fxSource})`;
}

// Cron entry: bill every active tenant. Called from the worker's scheduled handler.
export async function runSmsBillingSweep(env: SmsBillingEnv, nowIso: string, monthKey: string): Promise<void> {
  // Idempotent marker column (control DB may predate this).
  await env.CONTROL_DB.prepare('ALTER TABLE tenants ADD COLUMN sms_last_billed_at DATETIME').run().catch(() => {});

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
