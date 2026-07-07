import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok, err, ErrorCode, AdminJwtPayload, AdminRow } from '@epaper/types';
import { signJwt } from './jwt';

export const adminAuthRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

const encoder = new TextEncoder();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return derivedHex === hashHex;
}

adminAuthRouter.get('/setup-status', async (c) => {
  const countRes = await c.env.CONTROL_DB.prepare('SELECT count(*) as count FROM admins').first<{ count: number }>();
  return c.json(ok({ setupDone: (countRes?.count ?? 0) > 0 }));
});

adminAuthRouter.post('/setup', async (c) => {
  const countRes = await c.env.CONTROL_DB.prepare('SELECT count(*) as count FROM admins').first<{ count: number }>();
  if ((countRes?.count ?? 0) > 0) {
    return c.json(err(ErrorCode.CONFLICT, 'Setup already completed'), 409);
  }
  
  const body = await c.req.json();
  const email = body.email;
  const password = body.password;
  
  if (!email || !password || password.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid email or password (min 8 chars)'), 400);
  }
  
  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  
  await c.env.CONTROL_DB.prepare(
    'INSERT INTO admins (id, email, password_hash, role, is_setup_done) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email, hash, 'superadmin', 1).run();
  
  const payload: AdminJwtPayload = {
    aud: 'crm',
    sub: id,
    role: 'superadmin',
    exp: Math.floor(Date.now() / 1000) + 28800
  };
  const token = await signJwt(payload as unknown as Record<string, unknown>, c.env.ADMIN_JWT_SECRET);
  
  return c.json(ok({ token }), 201);
});

adminAuthRouter.post('/admin-login', async (c) => {
  const body = await c.req.json();
  const email = body.email;
  const password = body.password;
  
  if (!email || !password) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing credentials'), 400);
  }
  
  const admin = await c.env.CONTROL_DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first<AdminRow>();
  if (!admin) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid credentials'), 401);
  }
  
  const isValid = await verifyPassword(password, admin.password_hash);
  if (!isValid) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid credentials'), 401);
  }
  
  const payload: AdminJwtPayload = {
    aud: 'crm',
    sub: admin.id,
    role: admin.role,
    exp: Math.floor(Date.now() / 1000) + 28800
  };
  const token = await signJwt(payload as unknown as Record<string, unknown>, c.env.ADMIN_JWT_SECRET);
  
  return c.json(ok({ token }));
});

adminAuthRouter.get('/me', adminAuth, async (c) => {
  const adminId = c.var.adminId;
  const admin = await c.env.CONTROL_DB.prepare('SELECT id, email, role, is_setup_done, created_at FROM admins WHERE id = ?').bind(adminId).first();
  if (!admin) {
    return c.json(err(ErrorCode.NOT_FOUND, 'Admin not found'), 404);
  }
  return c.json(ok(admin));
});
