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

  try {
    // Resolve identity deterministically: firebase_uid is the primary key. Fall back
    // to a verified email or a present phone ONLY when that value uniquely maps to a
    // single reader that isn't already bound to a different Firebase uid. Permissive
    // OR-matching with empty-string binds (the previous approach) could splice two
    // separate accounts together or overwrite another reader's uid.
    let reader = await db.prepare(
      'SELECT id, email, name, firebase_uid FROM readers WHERE firebase_uid = ?'
    ).bind(uid).first<{ id: string; email: string | null; name: string; firebase_uid: string | null }>();

    if (!reader) {
      const candidates: { id: string; email: string | null; name: string; firebase_uid: string | null }[] = [];
      if (linkEmail) {
        const r = await db.prepare(
          'SELECT id, email, name, firebase_uid FROM readers WHERE email = ?'
        ).bind(linkEmail).first<{ id: string; email: string | null; name: string; firebase_uid: string | null }>();
        if (r) candidates.push(r);
      }
      if (phone) {
        const r = await db.prepare(
          'SELECT id, email, name, firebase_uid FROM readers WHERE phone_number = ?'
        ).bind(phone).first<{ id: string; email: string | null; name: string; firebase_uid: string | null }>();
        if (r) candidates.push(r);
      }
      // Reject if the identifiers point at different readers, or at one already
      // linked to another Firebase account.
      const distinctIds = new Set(candidates.map((r) => r.id));
      if (distinctIds.size > 1) {
        return c.json(err(ErrorCode.CONFLICT, 'Account identifiers conflict. Please contact support.'), 409);
      }
      if (candidates.length && candidates[0].firebase_uid && candidates[0].firebase_uid !== uid) {
        return c.json(err(ErrorCode.CONFLICT, 'This email or phone is linked to a different account.'), 409);
      }
      reader = candidates[0] ?? null;
    }

    let readerId: string;
    let readerEmail: string = email || '';

    if (reader) {
      readerId = reader.id;
      readerEmail = reader.email || email || '';
      await db.prepare(
        'UPDATE readers SET firebase_uid = ?, email_verified = ?, auth_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(uid, emailVerified, provider, readerId).run();
    } else {
      readerId = crypto.randomUUID();
      await db.prepare(
        'INSERT INTO readers (id, email, password_hash, name, firebase_uid, phone_number, email_verified, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(readerId, email, null, name, uid, phone, emailVerified, provider).run();
    }

    const token = await signReaderToken(c.env.ORG_JWT_SECRET, readerId, slug, readerEmail);
    return c.json(ok({ token, reader: { id: readerId, email: readerEmail, name } }));
  } catch (e) {
    // The publication exists (binding resolved); this is an operational failure
    // (D1, schema, unique-constraint race, JWT secret). Surface as 500, not 404.
    console.error('Verify firebase reader failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Authentication failed. Please try again.'), 500);
  }
});
