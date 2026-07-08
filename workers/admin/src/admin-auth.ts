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

const requireSuperadmin = async (c: any, next: any) => {
  if (c.var.adminRole !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  await next();
};

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
    exp: Math.floor(Date.now() / 1000) + 604800
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
    exp: Math.floor(Date.now() / 1000) + 604800
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

adminAuthRouter.patch('/me/password', adminAuth, async (c) => {
  const body = await c.req.json();
  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;
  
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid password (min 8 chars)'), 400);
  }
  
  const adminId = c.var.adminId;
  const admin = await c.env.CONTROL_DB.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(adminId).first<AdminRow>();
  if (!admin) return c.json(err(ErrorCode.NOT_FOUND, 'Admin not found'), 404);
  
  const isValid = await verifyPassword(currentPassword, admin.password_hash);
  if (!isValid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid current password'), 401);
  
  const hash = await hashPassword(newPassword);
  await c.env.CONTROL_DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(hash, adminId).run();
  
  return c.json(ok({ success: true }));
});

adminAuthRouter.get('/admins', adminAuth, requireSuperadmin, async (c) => {
  const { results } = await c.env.CONTROL_DB.prepare('SELECT id, email, role, created_at FROM admins ORDER BY created_at DESC').all();
  return c.json(ok(results));
});

adminAuthRouter.post('/admins', adminAuth, requireSuperadmin, async (c) => {
  const body = await c.req.json();
  const email = body.email;
  const password = body.password;
  const role = body.role || 'admin';
  
  if (!email || !password || password.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid email or password (min 8 chars)'), 400);
  }
  
  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  
  try {
    await c.env.CONTROL_DB.prepare(
      'INSERT INTO admins (id, email, password_hash, role, is_setup_done) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, email, hash, role, 1).run();
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json(err(ErrorCode.CONFLICT, 'Email already exists'), 409);
    throw e;
  }
  
  return c.json(ok({ id, email, role }));
});

adminAuthRouter.delete('/admins/:id', adminAuth, requireSuperadmin, async (c) => {
  const targetId = c.req.param('id');
  if (targetId === c.var.adminId) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Cannot delete yourself'), 400);
  }
  await c.env.CONTROL_DB.prepare('DELETE FROM admins WHERE id = ?').bind(targetId).run();
  return c.json(ok({ success: true }));
});
