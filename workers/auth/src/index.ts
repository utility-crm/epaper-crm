import { Hono } from 'hono';
import { Env } from './middleware';
import { adminAuthRouter } from './admin-auth';
import { orgAuthRouter } from './org-auth';
import { firebaseAuthRouter } from './firebase-auth';
import { readerAuthRouter } from './reader-auth';
import { profileRouter } from './profile';
import { err, ErrorCode, ok } from '@epaper/types';

const app = new Hono<{ Bindings: Env }>();

// Credential / token / firebase endpoints (admin, publisher, verify-org, sms-audit).
app.route('/api/auth', adminAuthRouter);
app.route('/api/auth', orgAuthRouter);
app.route('/api/auth', firebaseAuthRouter);
// Publisher self-service profile (GET /profile, POST /add-phone) — orgUserAuth-guarded.
app.route('/api/auth', profileRouter);

// Public reader auth (token exchange for Firebase-verified readers).
app.route('/api/read', readerAuthRouter);

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'auth' })));

app.notFound((c) => {
  return c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404);
});

export default {
  fetch: app.fetch,
};
