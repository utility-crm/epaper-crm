import { Hono } from 'hono';
import { Env } from './middleware';
import { ok, err, ErrorCode, ReaderJwtPayload } from '@epaper/types';
import { signJwt } from './jwt';
import { verifyFirebaseToken } from './verifyFirebaseToken';
import { getTenantDb } from './db';

// Public reader-facing auth. Mounted OUTSIDE any staff guard: reader signup/login
// must work without a token. Tenant DB is reached directly via {SLUG}_DB bindings.
export const readerAuthRouter = new Hono<{ Bindings: Env }>();

async function signReaderToken(secret: string, id: string, slug: string, email: string): Promise<string> {
  const payload: ReaderJwtPayload = { aud: 'reader', sub: id, tenantSlug: slug, email, exp: Math.floor(Date.now() / 1000) + 604800 };
  return signJwt(payload as unknown as Record<string, unknown>, secret);
}

readerAuthRouter.post('/:slug/verify-firebase', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const idToken = body.idToken;
  const projectId = c.env.FIREBASE_PROJECT_ID || 'epaperspace';

  if (!idToken || !projectId) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing ID token'), 400);
  }

  const claims = await verifyFirebaseToken(idToken, projectId);
  if (!claims) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid Firebase token'), 401);
  }

  const provider = claims.firebase?.sign_in_provider || 'unknown';
  if (provider === 'password' && !claims.email_verified) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Please verify your email address before logging in.'), 403);
  }

  const uid = claims.sub;
  const email = claims.email || null;
  const phone = claims.phone_number || null;
  const name = claims.name || (phone ? `Reader (${phone})` : (email ? email.split('@')[0] : 'Reader'));
  const emailVerified = claims.email_verified ? 1 : 0;

  // Only a verified email is trusted as a linking identifier. An unverified email
  // claim must not let this token adopt an existing email-based reader account.
  const linkEmail = email && emailVerified ? email : null;

  let db: D1Database;
  try {
    db = getTenantDb(c.env, slug);
  } catch (e) {
    // No binding for this slug -> the publication genuinely doesn't exist here.
    console.error('Reader verify-firebase: unknown publication', slug, e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found'), 404);
  }

  // Server-side enforcement of the publisher's reader-auth config. The dialog hides
  // disabled methods, but a crafted request could still present, say, a phone token
  // to a publisher who turned OTP off — so re-check here.
  //
  // SELECT * (not named columns) so an un-migrated tenant whose flag columns don't
  // exist yet yields `undefined` -> safe defaults (OTP off, email on) WITHOUT throwing.
  // That leaves any thrown error as a genuine operational failure (D1 down, table
  // missing), which we FAIL CLOSED on — never fall through and allow a disabled method.
  let otpEnabled: number;
  let emailEnabled: number;
  let otpOnly: number;
  try {
    const cfg = await db.prepare(
      'SELECT * FROM tenant_settings WHERE id = ?'
    ).bind('singleton').first<Record<string, unknown>>();
    otpEnabled = (cfg?.reader_auth_otp_enabled as number | undefined) ?? 0;
    emailEnabled = (cfg?.reader_auth_email_enabled as number | undefined) ?? 1;
    otpOnly = (cfg?.reader_auth_otp_only as number | undefined) ?? 0;
  } catch (e) {
    console.error('Reader auth config read failed (rejecting):', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Sign-in temporarily unavailable. Please try again.'), 503);
  }

  // phone token -> OTP method; everything else (password, google.com, …) -> email/Google method.
  // OTP-only mode disables every email/Google method even while the email flag is set,
  // matching the password routes (content/reader.ts) and the reader UI.
  const isPhoneMethod = provider === 'phone' || (!!phone && !email);
  if (isPhoneMethod && !otpEnabled) {
    return c.json(err(ErrorCode.FORBIDDEN, 'Phone sign-in is not enabled for this publication.'), 403);
  }
  if (!isPhoneMethod && (!emailEnabled || otpOnly)) {
    return c.json(err(ErrorCode.FORBIDDEN, 'Email / Google sign-in is not enabled for this publication.'), 403);
  }

  try {
    // Resolve identity deterministically. firebase_uid is the primary key; a verified
    // email or a present phone are secondary. A Firebase token carrying both email and
    // phone means Firebase verified both belong to THIS user, so an email row and a
    // phone row pointing at that user are the same person — we merge them into one.
    type ReaderRow = { id: string; email: string | null; phone_number: string | null; name: string; firebase_uid: string | null; created_at: string };

    let reader = await db.prepare(
      'SELECT id, email, phone_number, name, firebase_uid, created_at FROM readers WHERE firebase_uid = ?'
    ).bind(uid).first<ReaderRow>();

    if (!reader) {
      const candidates: ReaderRow[] = [];
      if (linkEmail) {
        const r = await db.prepare(
          'SELECT id, email, phone_number, name, firebase_uid, created_at FROM readers WHERE email = ?'
        ).bind(linkEmail).first<ReaderRow>();
        if (r) candidates.push(r);
      }
      if (phone) {
        const r = await db.prepare(
          'SELECT id, email, phone_number, name, firebase_uid, created_at FROM readers WHERE phone_number = ?'
        ).bind(phone).first<ReaderRow>();
        if (r) candidates.push(r);
      }

      // Security guard (kept even with auto-merge): a candidate already bound to a
      // DIFFERENT firebase_uid is a different Firebase identity — refuse rather than
      // hijack it. Backfilling onto a row with no uid, or the same uid, is fine.
      if (candidates.some((r) => r.firebase_uid && r.firebase_uid !== uid)) {
        return c.json(err(ErrorCode.CONFLICT, 'This email or phone is already linked to a different account.'), 409);
      }

      const distinct = [...new Map(candidates.map((r) => [r.id, r])).values()];
      if (distinct.length > 1) {
        // Two pre-existing rows, Firebase-confirmed same person -> merge into one.
        // Survivor: the row holding an active subscription; else the older row.
        let survivor = distinct[0];
        let loser = distinct[1];
        const activeFor = async (rid: string) => !!(await db.prepare(
          "SELECT id FROM reader_subscriptions WHERE reader_id = ? AND status = 'active' AND current_end > CURRENT_TIMESTAMP LIMIT 1"
        ).bind(rid).first());
        const aActive = await activeFor(survivor.id);
        const bActive = await activeFor(loser.id);
        if (bActive && !aActive) { [survivor, loser] = [loser, survivor]; }
        else if (aActive === bActive && loser.created_at < survivor.created_at) { [survivor, loser] = [loser, survivor]; }

        // Atomic: re-point the loser's subscriptions, delete the loser (freeing its
        // UNIQUE email/phone), then backfill those identifiers onto the survivor.
        await db.batch([
          db.prepare('UPDATE reader_subscriptions SET reader_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reader_id = ?').bind(survivor.id, loser.id),
          db.prepare('DELETE FROM readers WHERE id = ?').bind(loser.id),
          db.prepare('UPDATE readers SET email = COALESCE(email, ?), phone_number = COALESCE(phone_number, ?) WHERE id = ?').bind(loser.email, loser.phone_number, survivor.id),
        ]);
        reader = { ...survivor, email: survivor.email ?? loser.email, phone_number: survivor.phone_number ?? loser.phone_number };
      } else {
        reader = distinct[0] ?? null;
      }
    }

    let readerId: string;
    let readerEmail: string = email || '';

    if (reader) {
      readerId = reader.id;
      readerEmail = reader.email || email || '';
      // Backfill the missing identifier from the token too (e.g. an email-only row
      // logging in with a phone token gains its phone_number), and bind the uid.
      await db.prepare(
        'UPDATE readers SET firebase_uid = ?, email = COALESCE(email, ?), phone_number = COALESCE(phone_number, ?), email_verified = ?, auth_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(uid, linkEmail, phone, emailVerified, provider, readerId).run();
    } else {
      readerId = crypto.randomUUID();
      await db.prepare(
        'INSERT INTO readers (id, email, password_hash, name, firebase_uid, phone_number, email_verified, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(readerId, email, null, name, uid, phone, emailVerified, provider).run();
    }

    const token = await signReaderToken(c.env.ORG_JWT_SECRET, readerId, slug, readerEmail);

    // Record a BILLABLE SMS event only for a verified phone token. This is the one
    // server-attributable signal: the token exists only because Firebase sent an OTP
    // SMS and the reader confirmed it, and `slug` comes from the URL (gateway-routed),
    // not a client-supplied body — so it can't be forged against another publication.
    // (The public /audit/sms-send hook is rate-limiting/telemetry only, never billed.)
    if (isPhoneMethod) {
      await c.env.CONTROL_DB.prepare(
        'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        crypto.randomUUID(), null, 'auth.sms_billable', slug,
        JSON.stringify({ stage: 'reader', provider })
      ).run().catch((e: unknown) => console.error('Failed to record billable SMS event:', e));
    }

    return c.json(ok({ token, reader: { id: readerId, email: readerEmail, name } }));
  } catch (e) {
    // The publication exists (binding resolved); this is an operational failure
    // (D1, schema, unique-constraint race, JWT secret). Surface as 500, not 404.
    console.error('Verify firebase reader failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Authentication failed. Please try again.'), 500);
  }
});
