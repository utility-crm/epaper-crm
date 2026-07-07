import { Hono } from 'hono';
import { ok, err, ErrorCode, OrgUserRow } from '@epaper/types';
import { getTenantDb } from './db';

const encoder = new TextEncoder();

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return derivedHex === hashHex;
}

export const internalRouter = new Hono<{ Bindings: Record<string, unknown> }>();

// Internal endpoint for admin worker to verify org user credentials after provisioning
internalRouter.post('/internal/:slug/verify-owner', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ email: string; password: string }>();
  
  try {
    const db = getTenantDb(c.env, slug);
    const user = await db.prepare(
      'SELECT id, email, password_hash, name, role FROM org_users WHERE email = ?'
    ).bind(body.email).first<Pick<OrgUserRow, 'id' | 'email' | 'password_hash' | 'name' | 'role'>>();
    
    if (!user) {
      return c.json(ok({ valid: false, role: null, userId: null }));
    }
    
    const valid = await verifyPassword(body.password, user.password_hash);
    return c.json(ok({ valid, role: valid ? user.role : null, userId: valid ? user.id : null }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not available'), 403);
  }
});
