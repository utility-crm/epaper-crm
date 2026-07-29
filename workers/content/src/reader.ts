import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode, ReaderJwtPayload } from '@epaper/types';
import { signJwt, verifyJwt } from './jwt';
import { hashPassword, verifyPassword } from './password';
import { mintToken, consumeToken, sendAuthMail, allowSend, type TokenPurpose } from '@epaper/auth-mail';

type ReaderEnv = {
  ORG_JWT_SECRET: string;
  PUBLIC_API_BASE?: string;
  // Auth mail (packages/auth-mail): sending subdomain is a var so it can be rotated
  // without a rebuild; PUBLIC_APP_BASE is the reader link base for publications
  // with no verified custom domain.
  RESEND_API_KEY?: string;
  AUTH_MAIL_DOMAIN?: string;
  PUBLIC_APP_BASE?: string;
  CONTROL_DB: D1Database;
} & Record<string, unknown>;

// Public reader-facing API. Mounted OUTSIDE the orgUserAuth guard: free content and
// signup/login must work without a staff token. Premium pages are gated per-request.
export const readerRouter = new Hono<{ Bindings: ReaderEnv }>();

async function getReader(c: any, slug: string): Promise<ReaderJwtPayload | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJwt(auth.substring(7), c.env.ORG_JWT_SECRET);
  if (!payload || payload.aud !== 'reader' || payload.tenantSlug !== slug || typeof payload.sub !== 'string') return null;
  return payload as unknown as ReaderJwtPayload;
}

// Does this reader hold an active subscription to the given tier right now?
async function hasActiveSub(db: D1Database, readerId: string, tierId: string | null): Promise<boolean> {
  if (!tierId) {
    const row = await db.prepare(
      `SELECT id FROM reader_subscriptions
       WHERE reader_id = ? AND status = 'active' AND datetime(current_end) > CURRENT_TIMESTAMP
       LIMIT 1`
    ).bind(readerId).first();
    return !!row;
  }
  const row = await db.prepare(
    `SELECT id FROM reader_subscriptions
     WHERE reader_id = ? AND tier_id = ? AND status = 'active' AND datetime(substr(current_end, 1, 19)) > CURRENT_TIMESTAMP
     LIMIT 1`
  ).bind(readerId, tierId).first();
  return !!row;
}

// ── Signed page-access tokens ────────────────────────────────────────────────
// Premium pages must not hit D1 on every image request (page turns need to be
// instant and edge-cacheable). Instead, the subscription check runs ONCE when
// getPaper builds the paper metadata; for each premium page the viewer is
// entitled to, we mint a short-lived HMAC token bound to (paperId, page_no).
// The raw page endpoint then verifies the signature with pure crypto — no DB.
const PAGE_TOKEN_TTL_SEC = 60 * 60 * 6; // 6h — long enough for a reading session

const hmacKeyCache = new Map<string, Promise<CryptoKey>>();
function getHmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacKeyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    hmacKeyCache.set(secret, k);
  }
  return k;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function signPageToken(secret: string, paperId: string, pageNo: number, exp: number): Promise<string> {
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${paperId}:${pageNo}:${exp}`));
  return toHex(sig);
}

// Constant-time-ish comparison of two hex strings.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPageToken(secret: string, paperId: string, pageNo: number, exp: number, sig: string): Promise<boolean> {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await signPageToken(secret, paperId, pageNo, exp);
  return safeEqual(expected, sig);
}

// --- Reader accounts ---

// Per-IP signup throttle backed by D1. Caps verification-email sends per IP in a
// rolling window so the public signup route can't relay branded mail to arbitrary
// addresses. Schema + indexes live in migration 0012; expired rows are swept by the
// content worker's scheduled handler. This request path is limited to one atomic
// insert-if-under-limit statement, so concurrent requests for the same IP can't both
// pass the cap. Fails OPEN on a storage error — throttling must not break real signups.
const SIGNUP_MAX_PER_WINDOW = 5;
const SIGNUP_WINDOW_SEC = 60 * 60;
async function allowSignup(db: D1Database, ip: string): Promise<boolean> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - SIGNUP_WINDOW_SEC;
    // Single atomic statement: insert only while this IP is under the cap within the
    // window. SQLite runs it as one statement, so no COUNT/INSERT race. changes===0
    // means the cap was already reached (row not inserted) → deny.
    const res = await db.prepare(
      `INSERT INTO signup_throttle (ip, ts)
       SELECT ?, ?
       WHERE (SELECT COUNT(*) FROM signup_throttle WHERE ip = ? AND ts >= ?) < ?`
    ).bind(ip, now, ip, cutoff, SIGNUP_MAX_PER_WINDOW).run();
    return (res.meta?.changes ?? 0) > 0;
  } catch (e) {
    // Fail open, but surface it: a persistent D1 error silently disables the relay
    // guard. No IP logged. Wire to Analytics Engine / alerting if one is added.
    console.error('[signup-throttle] D1 error, failing open:', e instanceof Error ? e.name : 'unknown');
    return true;
  }
}

readerRouter.post('/:slug/signup', async (c) => {
  const slug = c.req.param('slug');
  const { email, password, name } = await c.req.json();
  if (!email || !password || !name || password.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid input (password min 8 chars)'), 400);
  }
  try {
    const db = getTenantDb(c.env, slug);
    if (!(await readerPasswordAuthEnabled(db))) {
      return c.json(err(ErrorCode.FORBIDDEN, 'Email sign-up is not enabled for this publication.'), 403);
    }

    // Throttle the public signup relay: cap verification emails per IP per hour so
    // it can't be used to spam arbitrary third-party addresses.
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    if (!(await allowSignup(db, ip))) {
      return c.json(err(ErrorCode.RATE_LIMITED, 'Too many sign-up attempts. Please try again later.'), 429);
    }

    const existing = await db.prepare('SELECT id FROM readers WHERE email = ?').bind(email).first();
    if (existing) return c.json(err(ErrorCode.CONFLICT, 'Email already registered'), 409);

    // Verification email required — fail before creating the reader if unconfigured.
    if (!c.env.PUBLIC_API_BASE) {
      return c.json(err(ErrorCode.INTERNAL_ERROR, 'Server misconfiguration: PUBLIC_API_BASE not set'), 500);
    }

    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO readers (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .bind(id, email, await hashPassword(password), name).run();

    // Mail the verification link in the background. Signup stays soft: a slow or
    // failing send must not delay the response, and must not land in the catch below
    // where a created account would be reported as "publication not found".
    c.executionCtx?.waitUntil(
      mailReaderToken(c.env, db, slug, id, email, 'verify_email')
        .catch((e) => console.error('auth-mail: reader signup verification send failed:', e))
    );

    const token = await signReaderToken(c, id, slug, email);
    return c.json(ok({ token, reader: { id, email, name }, email_verified: false }), 201);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

readerRouter.post('/:slug/login', async (c) => {
  const slug = c.req.param('slug');
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing credentials'), 400);
  try {
    const db = getTenantDb(c.env, slug);
    if (!(await readerPasswordAuthEnabled(db))) {
      return c.json(err(ErrorCode.FORBIDDEN, 'Email sign-in is not enabled for this publication.'), 403);
    }
    const reader = await db.prepare('SELECT id, email, password_hash, name FROM readers WHERE email = ?')
      .bind(email).first<{ id: string; email: string; password_hash: string; name: string }>();
    if (!reader || !(await verifyPassword(password, reader.password_hash))) {
      return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid credentials'), 401);
    }
    const token = await signReaderToken(c, reader.id, slug, reader.email);
    return c.json(ok({ token, reader: { id: reader.id, email: reader.email, name: reader.name } }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

readerRouter.get('/:slug/verify-email', async (c) => {
  const slug = c.req.param('slug');
  const token = c.req.query('token');
  if (!token) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing token'), 400);
  try {
    const payload = await verifyJwt(token, c.env.ORG_JWT_SECRET);
    if (!payload || payload.aud !== 'reader-verify' || payload.tenantSlug !== slug || typeof payload.sub !== 'string') {
      return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid or expired verification link'), 401);
    }
    const db = getTenantDb(c.env, slug);
    // Pre-0011 tenants may lack email_verified; add it (idempotent) before the UPDATE.
    await db.prepare('ALTER TABLE readers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0').run().catch(() => {});
    await db.prepare('UPDATE readers SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(payload.sub).run();
    return c.html('<p>Email verified! You can now close this tab and subscribe.</p>');
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// May a reader use email+password (signup/login) for this tenant? Mirrors the auth
// worker's server-side policy (reader-auth.ts): password is an email-method credential,
// so it's allowed only when email auth is enabled AND the tenant is not OTP-only.
// Defaults to enabled when the config columns are absent (un-migrated tenant). FAILS
// CLOSED on a read error (D1 down, table missing) — a crafted request must not slip
// through password auth during OTP-only mode or an unreadable-settings outage.
// SELECT * so missing flag columns yield undefined -> safe defaults without throwing.
async function readerPasswordAuthEnabled(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT * FROM tenant_settings WHERE id = ?')
    .bind('singleton').first<Record<string, unknown>>();
  const emailEnabled = ((row?.reader_auth_email_enabled as number | undefined) ?? 1) === 1;
  const otpOnly = ((row?.reader_auth_otp_only as number | undefined) ?? 0) === 1;
  return emailEnabled && !otpOnly;
}

async function signReaderToken(c: any, id: string, slug: string, email: string): Promise<string> {
  const payload: ReaderJwtPayload = { aud: 'reader', sub: id, tenantSlug: slug, email, exp: Math.floor(Date.now() / 1000) + 604800 };
  return signJwt(payload as unknown as Record<string, unknown>, c.env.ORG_JWT_SECRET);
}

// ── Reader email verification + password reset ───────────────────────────────
// Tokens live in THIS publication's database keyed by reader id (see
// packages/auth-mail), so a link minted for one paper cannot act on another.
//
// Verification is deliberately SOFT: confirming an address records the flag and
// nothing else — reading, signing in and subscribing never depend on it. Only the
// password credential path is involved; Google/phone readers arrive pre-verified
// from Firebase and have no password to reset.

const GENERIC_SEND = 'If that address has an account, an email is on its way.';

// Where the publication's own front door is. Read from the tenant record rather than
// the request's Origin/Referer: those are caller-controlled, and trusting them would
// let someone plant their own host in a link we send under the publisher's name.
// Mirrors the public-link rule the portal shows publishers (OrgDashboard).
async function readerMailTarget(env: ReaderEnv, slug: string): Promise<{ brandName: string; base: string }> {
  const row = await env.CONTROL_DB.prepare(
    'SELECT name, custom_domain, domain_verified FROM tenants WHERE slug = ?'
  ).bind(slug).first<{ name: string; custom_domain: string | null; domain_verified: number }>();
  const base = row?.custom_domain && row.domain_verified
    ? `https://${row.custom_domain}`
    : `${env.PUBLIC_APP_BASE || 'https://epaperspace.com'}/read/${slug}`;
  return { brandName: row?.name || 'ePaper', base };
}

async function mailReaderToken(
  env: ReaderEnv,
  db: D1Database,
  slug: string,
  readerId: string,
  email: string,
  purpose: TokenPurpose,
): Promise<void> {
  const code = await mintToken(db, { purpose, subject: readerId, slug });
  const { brandName, base } = await readerMailTarget(env, slug);
  await sendAuthMail(env, {
    to: email,
    slug,
    brandName,
    purpose,
    url: `${base}/auth/${purpose === 'verify_email' ? 'verify' : 'reset'}?code=${code}`,
  });
}

readerRouter.post('/:slug/verify-email/send', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Not signed in'), 401);

  let db: D1Database;
  try {
    db = getTenantDb(c.env, slug);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }

  if (allowSend(`reader-verify:${slug}:${reader.sub}`)) {
    const row = await db.prepare('SELECT email, email_verified FROM readers WHERE id = ?')
      .bind(reader.sub).first<{ email: string | null; email_verified: number }>().catch(() => null);
    if (row?.email && !row.email_verified) {
      await mailReaderToken(c.env, db, slug, reader.sub, row.email, 'verify_email');
    }
  }

  return c.json(ok({ message: GENERIC_SEND }));
});

readerRouter.post('/:slug/verify-email/confirm', async (c) => {
  const slug = c.req.param('slug');
  const { code } = await c.req.json().catch(() => ({ code: undefined }));

  let db: D1Database;
  try {
    db = getTenantDb(c.env, slug);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }

  const claim = await consumeToken(db, code, 'verify_email');
  if (!claim) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'This link is invalid, expired, or already used. Request a new one.'), 400);
  }

  await db.prepare('UPDATE readers SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(claim.subject).run();

  return c.json(ok({ verified: true }));
});

readerRouter.post('/:slug/password-reset/request', async (c) => {
  const slug = c.req.param('slug');
  const { email } = await c.req.json().catch(() => ({ email: undefined }));
  if (!email || typeof email !== 'string') return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);

  let db: D1Database;
  try {
    db = getTenantDb(c.env, slug);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
  // A publication that has switched off password auth has no password flow at all.
  if (!(await readerPasswordAuthEnabled(db))) {
    return c.json(err(ErrorCode.FORBIDDEN, 'Email sign-in is not enabled for this publication.'), 403);
  }

  if (allowSend(`reader-reset:${slug}:${email}`)) {
    const row = await db.prepare('SELECT id, password_hash FROM readers WHERE email = ?')
      .bind(email).first<{ id: string; password_hash: string | null }>();
    // No stored password means a Google/phone reader: nothing to reset, and a reset
    // link would only confuse them.
    if (row?.password_hash) {
      await mailReaderToken(c.env, db, slug, row.id, email, 'password_reset');
    }
  }

  // Same answer either way — this endpoint must not reveal who has an account here.
  return c.json(ok({ message: 'If that address has an account, a reset link is on its way.' }));
});

readerRouter.post('/:slug/password-reset/confirm', async (c) => {
  const slug = c.req.param('slug');
  const { code, newPassword } = await c.req.json().catch(() => ({ code: undefined, newPassword: undefined }));

  // Matches the minimum /:slug/signup enforces, so a reset cannot set a password
  // that signup would have rejected.
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Password must be at least 8 characters'), 400);
  }

  let db: D1Database;
  try {
    db = getTenantDb(c.env, slug);
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
  if (!(await readerPasswordAuthEnabled(db))) {
    return c.json(err(ErrorCode.FORBIDDEN, 'Email sign-in is not enabled for this publication.'), 403);
  }

  // Checked before the code is spent, so a rejected password leaves the link usable.
  const claim = await consumeToken(db, code, 'password_reset');
  if (!claim) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'This link is invalid, expired, or already used. Request a new one.'), 400);
  }

  await db.prepare('UPDATE readers SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(await hashPassword(newPassword), claim.subject).run();

  return c.json(ok({ reset: true }));
});

readerRouter.get('/:slug/me', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Not signed in'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    const subs = await db.prepare(
      `SELECT id, tier_id, plan_id, status, current_end FROM reader_subscriptions
       WHERE reader_id = ? AND status = 'active' AND datetime(current_end) > CURRENT_TIMESTAMP`
    ).bind(reader.sub).all();
    // email_verified drives the dismissible "verify your email" banner only — nothing
    // on the reader side is gated on it. A pre-0011 tenant lacking the column must
    // still get its account page, so a failed read just means "no banner".
    const row = await db.prepare('SELECT email_verified FROM readers WHERE id = ?')
      .bind(reader.sub).first<{ email_verified: number }>().catch(() => null);
    return c.json(ok({
      reader: { id: reader.sub, email: reader.email, emailVerified: !!row?.email_verified },
      subscriptions: subs.results,
    }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// --- Public catalog ---

// Tiers + active plans, for the paywall / pricing display.
readerRouter.get('/:slug/plans', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const rows = await db.prepare(
      `SELECT p.id, p.tier_id, p.name, p.interval, p.price_paise, p.offer_pct, p.offer_label,
              t.name AS tier_name, t.description AS tier_description
       FROM plans p JOIN tiers t ON t.id = p.tier_id
       WHERE p.active = 1 ORDER BY t.name, p.price_paise`
    ).all();
    return c.json(ok({ items: rows.results }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// Published papers with their edition + tier, newest first.
readerRouter.get('/:slug/papers', async (c) => {
  const slug = c.req.param('slug');
  const url = new URL(c.req.url);
  const edition_id = url.searchParams.get('edition_id');
  const start_date = url.searchParams.get('start_date');
  const end_date = url.searchParams.get('end_date');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '12', 10);
  const offset = (page - 1) * limit;

  try {
    const db = getTenantDb(c.env, slug);
    let q = `SELECT e.id, e.title, e.publish_date, e.is_free, e.page_count, e.free_page_count, e.cover_key,
              ed.id AS edition_id, ed.title AS edition_title, ed.tier_id
       FROM epapers e JOIN editions ed ON ed.id = e.edition_id
       WHERE e.status = 'published' AND ed.status != 'archived'`;
    const params: any[] = [];
    
    if (edition_id) { q += ' AND ed.id = ?'; params.push(edition_id); }
    if (start_date) { q += ' AND e.publish_date >= ?'; params.push(start_date); }
    if (end_date) { q += ' AND e.publish_date <= ?'; params.push(end_date); }
    
    const countRows = await db.prepare(q.replace('SELECT e.id, e.title, e.publish_date, e.is_free, e.page_count, e.free_page_count, e.cover_key,\n              ed.id AS edition_id, ed.title AS edition_title, ed.tier_id', 'SELECT COUNT(*) as c')).bind(...params).first<{ c: number }>();
    const total = countRows ? countRows.c : 0;

    q += ' ORDER BY e.publish_date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = await db.prepare(q).bind(...params).all();
    return c.json(ok({ items: rows.results, total, page, limit }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

readerRouter.get('/:slug/today', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const today = new Date().toISOString().split('T')[0];
    
    const { results } = await db.prepare(
      `SELECT e.id, e.is_default_for_day, e.publish_date, ed.title as edition_title
       FROM epapers e JOIN editions ed ON ed.id = e.edition_id
       WHERE e.status = 'published' AND ed.status != 'archived' AND e.publish_date = ? 
       ORDER BY e.created_at ASC`
    ).bind(today).all<{ id: string, is_default_for_day: number, publish_date: string, edition_title: string }>();
    
    if (!results || results.length === 0) {
      return c.json(err(ErrorCode.NOT_FOUND, 'No papers available for today'), 404);
    }
    
    const defaultPaper = results.find(p => p.is_default_for_day === 1);
    const paper = defaultPaper || results[0];
    
    return c.json(ok({
      paper_id: paper.id,
      publish_date: paper.publish_date,
      edition_title: paper.edition_title,
      multiple_available: results.length > 1 && !defaultPaper
    }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

async function ensureClickmasksColReader(db: D1Database) {
  try {
    await db.prepare('SELECT clickmasks FROM epaper_pages LIMIT 1').first();
  } catch {
    try {
      await db.prepare("ALTER TABLE epaper_pages ADD COLUMN clickmasks TEXT DEFAULT '[]'").run();
    } catch {}
  }
}

// Single paper metadata + whether the current viewer can access premium pages.
readerRouter.get('/:slug/papers/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  try {
    const db = getTenantDb(c.env, slug);
    const paper = await db.prepare(
      `SELECT e.id, e.title, e.publish_date, e.is_free, e.page_count, e.free_page_count, ed.tier_id, ed.title AS edition_title
       FROM epapers e JOIN editions ed ON ed.id = e.edition_id
       WHERE e.id = ? AND e.status = 'published'`
    ).bind(id).first<any>();
    if (!paper) return c.json(err(ErrorCode.NOT_FOUND, 'Paper not found'), 404);

    const reader = await getReader(c, slug);
    const unlocked = !!paper.is_free || (reader ? await hasActiveSub(db, reader.sub, paper.tier_id) : false);

    await ensureClickmasksColReader(db);
    const pageRows = await db.prepare(
      'SELECT page_no, clickmasks FROM epaper_pages WHERE epaper_id = ? ORDER BY page_no ASC'
    ).bind(id).all<{ page_no: number; clickmasks: string | null }>();

    // Premium pages the viewer is entitled to get a short-lived signed URL, so the
    // raw endpoint can serve + edge-cache them without re-checking D1 per request.
    const tokenExp = Math.floor(Date.now() / 1000) + PAGE_TOKEN_TTL_SEC;

    const pages = await Promise.all((pageRows.results ?? []).map(async p => {
      let masks: any[] = [];
      try {
        masks = p.clickmasks ? JSON.parse(p.clickmasks) : [];
      } catch {
        masks = [];
      }

      const isFreePage = !!paper.is_free || p.page_no <= (paper.free_page_count || 0);
      const isLocked = !isFreePage && !unlocked;

      let imageUrl: string;
      if (isLocked) {
        imageUrl = `/api/read/${slug}/papers/${id}/pages/${p.page_no}/blurred`;
      } else if (isFreePage) {
        // Free pages are public and need no token.
        imageUrl = `/api/read/${slug}/papers/${id}/pages/${p.page_no}`;
      } else {
        // Premium page, viewer is entitled: sign it.
        const sig = await signPageToken(c.env.ORG_JWT_SECRET, id, p.page_no, tokenExp);
        imageUrl = `/api/read/${slug}/papers/${id}/pages/${p.page_no}?exp=${tokenExp}&sig=${sig}`;
      }

      return { page_no: p.page_no, clickmasks: masks, image_url: imageUrl, is_locked: isLocked };
    }));

    return c.json(ok({ ...paper, unlocked, signed_in: !!reader, pages }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

readerRouter.get('/:slug/papers/:id/clickmasks', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  try {
    const db = getTenantDb(c.env, slug);
    await ensureClickmasksColReader(db);
    const pages = await db.prepare(
      'SELECT page_no, clickmasks FROM epaper_pages WHERE epaper_id = ? ORDER BY page_no ASC'
    ).bind(id).all<{ page_no: number; clickmasks: string | null }>();

    const items = (pages.results ?? []).map(p => {
      let masks: any[] = [];
      try {
        masks = p.clickmasks ? JSON.parse(p.clickmasks) : [];
      } catch {
        masks = [];
      }
      return { page_no: p.page_no, clickmasks: masks };
    });

    return c.json(ok({ items }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

readerRouter.get('/:slug/editions', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const { results } = await db.prepare(
      `SELECT id, title FROM editions WHERE status != 'archived' ORDER BY title ASC`
    ).all();
    return c.json(ok({ items: results }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// Public cover thumbnail — always served without auth, even for premium papers.
// For PDF-based papers, cover_key points to the first page PDF.
// For image-based papers, cover_key points to a separate copy of the first image.
readerRouter.get('/:slug/papers/:id/cover', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  try {
    const db = getTenantDb(c.env, slug);
    const paper = await db.prepare(
      `SELECT cover_key FROM epapers WHERE id = ? AND status = 'published'`
    ).bind(id).first<{ cover_key: string | null }>();
    if (!paper?.cover_key) return c.json(err(ErrorCode.NOT_FOUND, 'No cover available'), 404);
    const bucket = getTenantBucket(c.env, slug);
    const obj = await bucket.get(paper.cover_key);
    if (!obj) return c.json(err(ErrorCode.NOT_FOUND, 'Cover file missing'), 404);
    const ct = obj.httpMetadata?.contentType ?? 'application/octet-stream';
    return new Response(obj.body, {
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// Serve one page. Free pages are public; locked pages require an active subscription.
readerRouter.get('/:slug/papers/:id/pages/:n', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const n = parseInt(c.req.param('n'), 10);
  if (!Number.isInteger(n) || n < 1) return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid page'), 400);

  try {
    const db = getTenantDb(c.env, slug);
    const paper = await db.prepare(
      `SELECT e.is_free, e.free_page_count, e.page_count, ed.tier_id
       FROM epapers e JOIN editions ed ON ed.id = e.edition_id
       WHERE e.id = ? AND e.status = 'published'`
    ).bind(id).first<{ is_free: number; free_page_count: number; page_count: number; tier_id: string | null }>();
    if (!paper) return c.json(err(ErrorCode.NOT_FOUND, 'Paper not found'), 404);
    if (n > paper.page_count) return c.json(err(ErrorCode.NOT_FOUND, 'Page not found'), 404);

    const isFreePage = !!paper.is_free || n <= paper.free_page_count;
    // Free pages are public. Premium pages require a valid signed token minted by
    // getPaper (which already verified the subscription) — this keeps the hot image
    // path free of any D1 subscription lookup while preventing raw-URL paywall bypass.
    if (!isFreePage) {
      const url = new URL(c.req.url);
      const exp = parseInt(url.searchParams.get('exp') || '', 10);
      const sig = url.searchParams.get('sig') || '';
      const valid = sig && await verifyPageToken(c.env.ORG_JWT_SECRET, id, n, exp, sig);
      if (!valid) return c.json(err(ErrorCode.FORBIDDEN, 'Premium page requires a valid access token'), 403);
    }

    const page = await db.prepare('SELECT r2_key FROM epaper_pages WHERE epaper_id = ? AND page_no = ?')
      .bind(id, n).first<{ r2_key: string }>();
    if (!page) return c.json(err(ErrorCode.NOT_FOUND, 'Page not available'), 404);

    const bucket = getTenantBucket(c.env, slug);
    const obj = await bucket.get(page.r2_key);
    if (!obj) return c.json(err(ErrorCode.NOT_FOUND, 'Page file missing'), 404);

    // Count a pageview (best-effort).
    c.executionCtx?.waitUntil(
      db.prepare('UPDATE tenant_stats SET pageviews = pageviews + 1 WHERE id = 1').run().catch(() => {})
    );

    // Use the content-type that was stored when the file was uploaded (pdf or image).
    const ct = obj.httpMetadata?.contentType ?? 'application/pdf';
    // Free pages are shared-cacheable forever; premium pages carry a per-session
    // signed URL, so cache privately in the browser for the token's lifetime only.
    const cacheControl = isFreePage
      ? 'public, max-age=31536000, immutable'
      : 'private, max-age=21600';
    return new Response(obj.body, {
      headers: { 'Content-Type': ct, 'Cache-Control': cacheControl },
    });
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// ── GET /:slug/papers/:id/pages/:n/blurred ──────────────────────────────────────────────
// Fast, lightweight endpoint that ONLY returns the blurred thumbnail of a premium page.
// Used by frontend for lazy-loading premium pages without hitting the database for subscription checks.
readerRouter.get('/:slug/papers/:id/pages/:n/blurred', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const n = parseInt(c.req.param('n'), 10);
  if (isNaN(n) || n < 1) return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid page number'), 400);

  try {
    const db = getTenantDb(c.env, slug);
    const page = await db.prepare('SELECT r2_key FROM epaper_pages WHERE epaper_id = ? AND page_no = ?')
      .bind(id, n).first<{ r2_key: string }>();
    if (!page) return c.json(err(ErrorCode.NOT_FOUND, 'Page not available'), 404);

    const bucket = getTenantBucket(c.env, slug);
    // Replace .webp/.png/.jpg with -blurred.webp
    const blurredKey = page.r2_key.replace(/\.([a-z]+)$/, '-blurred.webp');
    const obj = await bucket.get(blurredKey);
    if (!obj) {
      // If blurred version isn't found (e.g. old paper), return 404
      return c.json(err(ErrorCode.NOT_FOUND, 'Blurred page missing'), 404);
    }

    // Blurred pages are public (they have the paywall baked in)
    return new Response(obj.body, {
      headers: { 
        'Content-Type': 'image/webp', 
        'Cache-Control': 'public, max-age=31536000, immutable' 
      },
    });
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }
});

// Upload a cropped clipping PNG image so social media crawlers (Facebook, X, WhatsApp) can preview it
readerRouter.post('/:slug/clips', async (c) => {
  const slug = c.req.param('slug');
  try {
    const bucket = getTenantBucket(c.env, slug);
    const blob = await c.req.blob();
    if (!blob || blob.size === 0 || blob.size > 5 * 1024 * 1024) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid clip image'), 400);
    }
    const id = crypto.randomUUID();
    const key = `clips/${id}.png`;
    await bucket.put(key, blob, {
      httpMetadata: { contentType: 'image/png' },
    });
    const apiBase = c.env.PUBLIC_API_BASE || 'https://api.epaperspace.com';
    return c.json(ok({ id, url: `${apiBase}/api/read/${slug}/clips/${id}.png` }));
  } catch (e) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to save clip'), 500);
  }
});

// Serve a cropped clipping PNG image
readerRouter.get('/:slug/clips/:filename', async (c) => {
  const slug = c.req.param('slug');
  const filename = c.req.param('filename');
  try {
    const bucket = getTenantBucket(c.env, slug);
    const obj = await bucket.get(`clips/${filename}`);
    if (!obj) return c.json(err(ErrorCode.NOT_FOUND, 'Clip not found'), 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return c.json(err(ErrorCode.NOT_FOUND, 'Clip not found'), 404);
  }
});
