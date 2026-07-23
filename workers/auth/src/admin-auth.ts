import { Hono, Context, Next } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok, err, ErrorCode, AdminJwtPayload, AdminRow } from '@epaper/types';
import { signJwt } from './jwt';
import { hashPassword, verifyPassword } from './password';

type AdminCtx = Context<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>;

export const adminAuthRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

// Re-check privilege against the DB, not just the JWT: a 7-day token issued to an
// admin who was since deleted or demoted must not still authorize privileged ops.
const requireSuperadmin = async (c: AdminCtx, next: Next) => {
  if (c.var.adminRole !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  const current = await c.env.CONTROL_DB.prepare('SELECT role FROM admins WHERE id = ?')
    .bind(c.var.adminId).first<{ role: string }>();
  if (!current || current.role !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  await next();
};

adminAuthRouter.get('/setup-status', async (c) => {
  const countRes = await c.env.CONTROL_DB.prepare('SELECT count(*) as count FROM admins').first<{ count: number }>();
  return c.json(ok({ setupDone: (countRes?.count ?? 0) > 0 }));
});

adminAuthRouter.post('/setup', async (c) => {
  const body = await c.req.json();
  const email = body.email;
  const password = body.password;

  if (!email || !password || password.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid email or password (min 8 chars)'), 400);
  }

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);

  // Atomic first-admin guard: the row is inserted only if the table is still empty.
  // Two concurrent setup calls can't both win — the second inserts 0 rows. (A prior
  // count-then-insert check was racy: distinct emails both passed and created two superadmins.)
  const res = await c.env.CONTROL_DB.prepare(
    `INSERT INTO admins (id, email, password_hash, role, is_setup_done)
     SELECT ?, ?, ?, 'superadmin', 1
     WHERE NOT EXISTS (SELECT 1 FROM admins)`
  ).bind(id, email, hash).run();

  if (!res.meta.changes) {
    return c.json(err(ErrorCode.CONFLICT, 'Setup already completed'), 409);
  }

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
  const role = body.role ?? 'admin';

  if (!email || !password || password.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid email or password (min 8 chars)'), 400);
  }

  // Only the two known admin roles may be assigned; reject anything else so a caller
  // can't mint an account with an unrecognised (and thus unguarded) role string.
  if (role !== 'admin' && role !== 'superadmin') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid role'), 400);
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
