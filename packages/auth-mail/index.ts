// Single-use email tokens + auth-mail delivery, shared by the two surfaces that own
// credentials: the auth worker (publishers, CONTROL_DB) and the content worker
// (readers, per-tenant D1). Both must behave identically — an expiry or single-use
// rule that drifted between them would be a real security hole — so the logic lives
// here once instead of being copied into each worker.
//
// Auth mail is sent from its own subdomain (AUTH_MAIL_DOMAIN, e.g. e-auth.epaperspace.com),
// separate from the transactional/marketing sending domain. If that domain is ever
// abused, it can be rotated by changing one worker var — no code change, no rebuild,
// and the main domain's reputation is untouched.

export type TokenPurpose = 'verify_email' | 'password_reset';

// Verification links are long-lived (people check mail hours later); reset links are
// short-lived because they hand over an account.
export const TOKEN_TTL_SEC: Record<TokenPurpose, number> = {
  verify_email: 24 * 60 * 60,
  password_reset: 60 * 60,
};

const CODE_BYTES = 32;
const CODE_RE = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

/**
 * Create a token and return the RAW code (the only copy — the DB holds just its
 * SHA-256, so a leaked database dump cannot be replayed as a live link).
 *
 * Minting also consumes any outstanding token of the same purpose for the same
 * subject: requesting a new link must invalidate the previous one, so an older
 * email sitting in an inbox (or an intercepted one) stops working.
 *
 * `subject` identifies the account within its own database — the publisher's email
 * for CONTROL_DB, the reader id for a tenant DB. `slug` records which publication
 * the request came from.
 */
export async function mintToken(
  db: D1Database,
  opts: { purpose: TokenPurpose; subject: string; slug?: string | null },
): Promise<string> {
  const code = toHex(crypto.getRandomValues(new Uint8Array(CODE_BYTES)));
  const hash = await sha256Hex(code);
  await db.batch([
    db
      .prepare(
        `UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP
         WHERE purpose = ? AND subject = ? AND consumed_at IS NULL`,
      )
      .bind(opts.purpose, opts.subject),
    db
      .prepare(
        `INSERT INTO auth_tokens (id, token_hash, purpose, subject, slug, expires_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
      )
      .bind(
        crypto.randomUUID(),
        hash,
        opts.purpose,
        opts.subject,
        opts.slug ?? null,
        `+${TOKEN_TTL_SEC[opts.purpose]} seconds`,
      ),
  ]);
  return code;
}

/**
 * Redeem a code, or return null if it is unknown, expired, already used, or of the
 * wrong purpose (a verification link must never be redeemable as a password reset).
 *
 * The check and the consume are a single UPDATE ... RETURNING, so two concurrent
 * clicks on the same link cannot both succeed — SQLite serialises the write and the
 * loser sees no row. Expiry is compared with datetime('now') on both sides to stay
 * in SQLite's own format (an ISO string compares wrongly against CURRENT_TIMESTAMP).
 */
export async function consumeToken(
  db: D1Database,
  code: string | undefined | null,
  purpose: TokenPurpose,
): Promise<{ subject: string; slug: string | null } | null> {
  if (!code || !CODE_RE.test(code)) return null;
  const hash = await sha256Hex(code);
  const row = await db
    .prepare(
      `UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP
       WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > datetime('now')
       RETURNING subject, slug`,
    )
    .bind(hash, purpose)
    .first<{ subject: string; slug: string | null }>();
  return row ?? null;
}

// ── Delivery ────────────────────────────────────────────────────────────────

// Local-part is built from the slug, which is already URL/DNS-safe; re-filter anyway
// so a hand-edited slug can never inject a second address into the From header.
export function authSender(slug: string, domain: string): string {
  const local = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48) || 'noreply';
  return `noreply-${local}@${domain}`;
}

export interface AuthMailInput {
  to: string;
  slug: string;
  /** Publication name — shown as the From display name and in the body. */
  brandName: string;
  purpose: TokenPurpose;
  /** Full link including the raw code. Built server-side, never from a request header. */
  url: string;
  /** Optional publication support address, so replies reach the publisher. */
  replyTo?: string;
}

export interface AuthMailEnv {
  RESEND_API_KEY?: string;
  AUTH_MAIL_DOMAIN?: string;
}

/**
 * Send an auth mail. Returns false instead of throwing: a mail failure must not turn
 * a successful signup into a 500 (the user can always request a fresh link), and the
 * caller decides whether to surface it.
 */
export async function sendAuthMail(env: AuthMailEnv, input: AuthMailInput): Promise<boolean> {
  const domain = env.AUTH_MAIL_DOMAIN;
  if (!env.RESEND_API_KEY || !domain) {
    console.warn('[auth-mail] RESEND_API_KEY / AUTH_MAIL_DOMAIN not configured — skipping send');
    return false;
  }
  const isVerify = input.purpose === 'verify_email';
  const body = {
    from: `${sanitizeName(input.brandName)} <${authSender(input.slug, domain)}>`,
    to: [input.to],
    subject: isVerify ? `Verify your email for ${input.brandName}` : `Reset your ${input.brandName} password`,
    html: authMailHtml(input),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    tags: [{ name: 'kind', value: input.purpose }],
  };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[auth-mail] Resend send failed', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[auth-mail] Resend send threw', e);
    return false;
  }
}

// Strip anything that could break out of the From header into a second address.
function sanitizeName(name: string): string {
  return name.replace(/[<>"\r\n]/g, '').trim().slice(0, 78) || 'ePaper';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function authMailHtml(input: Pick<AuthMailInput, 'brandName' | 'purpose' | 'url'>): string {
  const isVerify = input.purpose === 'verify_email';
  const heading = isVerify ? 'Confirm your email address' : 'Reset your password';
  const intro = isVerify
    ? 'Tap the button below to confirm this email address belongs to you.'
    : 'Tap the button below to choose a new password. If you did not ask for this, you can ignore this email — your password stays unchanged.';
  const expiry = isVerify ? 'This link expires in 24 hours.' : 'This link expires in 1 hour and can be used once.';
  const brand = escapeHtml(input.brandName);
  // Inline styles + a plain <a> button: email clients strip <style> blocks and most
  // ignore anything cleverer than this.
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;line-height:1.5;background:#f6f7f9;margin:0;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">
      <h2 style="margin:0 0 4px;font-size:18px">${brand}</h2>
      <h3 style="margin:0 0 12px;color:#374151;font-size:16px">${heading}</h3>
      <p style="margin:0 0 20px">${intro}</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${isVerify ? 'Verify email' : 'Reset password'}</a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 8px">${expiry}</p>
      <p style="color:#6b7280;font-size:12px;word-break:break-all;margin:0">If the button does not work, paste this into your browser:<br>${escapeHtml(input.url)}</p>
    </div>
  </body></html>`;
}

// ── Send throttling ─────────────────────────────────────────────────────────

// ponytail: per-isolate in-memory counter, mirroring the SMS-audit limiter in
// workers/auth/src/firebase-auth.ts. It bounds a single isolate's mail volume, which
// is enough to stop a loop hammering one address; a distributed attacker spread over
// many isolates gets proportionally more. Move to a D1/KV counter if abuse shows up.
const sendHits = new Map<string, number[]>();

/** True when the caller is within budget (and records the hit); false when throttled. */
export function allowSend(key: string, max = 5, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const recent = (sendHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    sendHits.set(key, recent);
    return false;
  }
  recent.push(now);
  sendHits.set(key, recent);
  if (sendHits.size > 5000) sendHits.clear(); // crude bound; isolates are short-lived
  return true;
}
