import { SupportEnv } from './types.js';
import { signJwt, verifyJwt } from './jwt.js';

// Two trust paths into the support service:
//
// 1. Widget token — a per-tenant HMAC token minted from the tenant portal (see
//    /api/widget-token, gated by the org JWT). It is embedded in the public
//    embed snippet and carries a signed `tenant_id`, so the public chat path
//    never has to trust a client-supplied tenantId or a spoofable Origin host.
//
// 2. Org staff JWT — the existing tenant-portal token (aud 'tenant-portal',
//    HS256 over ORG_JWT_SECRET). Gates the agent desk (tickets) and the
//    knowledge-base editor (memory), scoped to the staffer's own tenantSlug.

export interface WidgetTokenClaims {
  aud: 'support-widget';
  tenant_id: string;
  custom_domain?: string;
  iat: number;
}

export interface OrgStaff {
  tenantSlug: string;
  sub: string;
  role: string;
}

// Mint a widget token for a tenant. Called only from the org-authenticated
// /api/widget-token route — never from public input.
export async function mintWidgetToken(
  env: SupportEnv,
  tenantId: string,
  customDomain?: string
): Promise<string> {
  const claims: WidgetTokenClaims = {
    aud: 'support-widget',
    tenant_id: tenantId,
    custom_domain: customDomain,
    iat: Math.floor(Date.now() / 1000),
  };
  return signJwt(claims as unknown as Record<string, unknown>, env.SUPPORT_WIDGET_SECRET);
}

// Verify a widget token and return its tenant scope, or null if forged/invalid.
export async function verifyWidgetToken(
  env: SupportEnv,
  token: string | undefined
): Promise<WidgetTokenClaims | null> {
  if (!token) return null;
  const payload = await verifyJwt(token, env.SUPPORT_WIDGET_SECRET);
  if (!payload || payload.aud !== 'support-widget' || typeof payload.tenant_id !== 'string') {
    return null;
  }
  return payload as unknown as WidgetTokenClaims;
}

// Resolve an org staff member from an Authorization: Bearer <org JWT> header.
// Mirrors billing-tenant getOrgStaff: requires aud 'tenant-portal'.
export async function getOrgStaff(c: any, env: SupportEnv): Promise<OrgStaff | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJwt(auth.substring(7), env.ORG_JWT_SECRET);
  if (
    !payload ||
    payload.aud !== 'tenant-portal' ||
    typeof payload.tenantSlug !== 'string' ||
    typeof payload.sub !== 'string'
  ) {
    return null;
  }
  return { tenantSlug: payload.tenantSlug, sub: payload.sub, role: (payload.role as string) || 'member' };
}
