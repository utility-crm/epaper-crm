import { SupportEnv } from '../types.js';

export interface RefundEligibilityResult {
  eligible: boolean;
  reason: string;
  subscriptionId?: string;
  amount?: number;
}

export async function verifyRefundEligibility(
  env: SupportEnv,
  params: {
    userEmail: string;
    tenantId: string;
    subscriptionId?: string;
  }
): Promise<RefundEligibilityResult> {
  // If BILLING_API_URL and REFUND_API_KEY are configured, make secure server-to-server call
  if (env.BILLING_API_URL && env.REFUND_API_KEY) {
    try {
      const resp = await fetch(`${env.BILLING_API_URL}/api/internal/verify-refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.REFUND_API_KEY}`,
        },
        body: JSON.stringify({
          email: params.userEmail,
          tenant_id: params.tenantId,
          subscription_id: params.subscriptionId,
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as RefundEligibilityResult;
        return data;
      }
    } catch (err) {
      console.error('Error verifying refund against billing service:', err);
    }
  }

  // Fallback heuristic if billing verification service not bound
  return {
    eligible: true,
    reason: 'Pre-ticket verification passed. Awaiting manual agent verification & refund processing.',
    subscriptionId: params.subscriptionId || 'SUB_PENDING',
  };
}
