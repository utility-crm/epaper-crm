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

  try {
    const db = getTenantDb(c.env, slug);

    let reader = await db.prepare(
      'SELECT id, email, name FROM readers WHERE firebase_uid = ? OR (email IS NOT NULL AND email = ?) OR (phone_number IS NOT NULL AND phone_number = ?)'
    ).bind(uid, email || '', phone || '').first<{ id: string; email: string | null; name: string }>();

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
    console.error('Verify firebase reader failed:', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Publication not found or database error'), 404);
  }
});
