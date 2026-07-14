import { Hono } from 'hono';
import { SupportEnv } from '../types.js';
import { ingestMemory, listMemories, deleteMemory } from '../services/rag-memory.js';
import { getOrgStaff } from '../auth.js';

export const memoryRouter = new Hono<{ Bindings: SupportEnv; Variables: { tenantId: string } }>();

// All knowledge-base routes require an authenticated org staff member. The tenant
// scope is taken from the verified JWT (tenantSlug), never from client input, so
// one tenant can never read or mutate another tenant's memory.
memoryRouter.use('/*', async (c, next) => {
  const staff = await getOrgStaff(c, c.env);
  if (!staff) return c.json({ success: false, error: 'Unauthorized' }, 401);
  c.set('tenantId', staff.tenantSlug);
  await next();
});

// GET /api/memory
memoryRouter.get('/', async (c) => {
  const memories = await listMemories(c.env, c.var.tenantId);
  return c.json({ success: true, memories });
});

// POST /api/memory
memoryRouter.post('/', async (c) => {
  const body = await c.req.json<{ title: string; content: string }>();

  if (!body.title || !body.content) {
    return c.json({ success: false, error: 'Missing title or content' }, 400);
  }

  const memory = await ingestMemory(c.env, {
    tenantId: c.var.tenantId,
    title: body.title,
    content: body.content,
  });

  return c.json({ success: true, memory });
});

// DELETE /api/memory/:id
memoryRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await deleteMemory(c.env, id, c.var.tenantId);
  return c.json({ success: deleted });
});
