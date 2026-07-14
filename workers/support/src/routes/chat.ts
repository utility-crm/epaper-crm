import { Hono } from 'hono';
import { SupportEnv } from '../types.js';
import { searchMemory } from '../services/rag-memory.js';
import { runSupportChat, ChatMessage } from '../services/cloudflare-ai.js';
import { verifyWidgetToken } from '../auth.js';
import { resolveTenantFromHost } from '../tenant.js';

export const chatRouter = new Hono<{ Bindings: SupportEnv }>();

chatRouter.post('/', async (c) => {
  const body = await c.req.json<{
    message: string;
    messages?: ChatMessage[];
    userEmail?: string;
    userName?: string;
    token?: string;
  }>();

  // Tenant scope is derived from a VERIFIED source only — never a client-supplied
  // tenantId. Preferred: the signed widget token. Fallback: the request Origin
  // matched against a verified custom_domain in the control DB.
  const token = c.req.header('X-Support-Token') || body.token;
  const claims = await verifyWidgetToken(c.env, token);

  let tenantId: string | null = null;
  let customDomain: string | null = null;

  if (claims) {
    tenantId = claims.tenant_id;
    customDomain = claims.custom_domain ?? null;
  } else {
    const origin = c.req.header('origin') || c.req.header('referer') || '';
    const resolved = await resolveTenantFromHost(c.env, origin);
    if (resolved) {
      tenantId = resolved.slug;
      customDomain = resolved.customDomain;
    }
  }

  if (!tenantId) {
    return c.json(
      { success: false, error: 'Unrecognized support origin. A valid widget token or registered custom domain is required.' },
      401
    );
  }

  const userEmail = body.userEmail || 'reader@example.com';
  const messages: ChatMessage[] = body.messages || [{ role: 'user', content: body.message }];

  // RAG vector search scoped to the resolved tenant.
  const ragKnowledge = await searchMemory(c.env, {
    tenantId,
    query: body.message,
    topK: 3,
  });

  const chatResult = await runSupportChat(c.env, {
    tenantId,
    customDomain,
    userEmail,
    userName: body.userName,
    messages,
    ragKnowledge,
  });

  return c.json({
    success: true,
    tenantId,
    customDomain,
    reply: chatResult.reply,
    ticketCreated: chatResult.ticketCreated || null,
  });
});
