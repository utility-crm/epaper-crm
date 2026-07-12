// Minimal Razorpay Orders API client + payment-signature verification.
// Uses the TENANT's own key pair (decrypted from razorpay_config) — reader money flows to
// the tenant, never the platform.

const encoder = new TextEncoder();

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createOrder(
  keyId: string,
  keySecret: string,
  amountPaise: number,
  notes: Record<string, string>
): Promise<RazorpayOrder> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', notes }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Razorpay order failed (${res.status}): ${detail}`);
  }
  return res.json();
}

// Verify Razorpay Checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret).
export async function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(keySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${orderId}|${paymentId}`));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}

// ── Recurring subscriptions (e-mandate / autopay) ──────────────────────────
// Reader subscriptions are recurring like the platform tier subscriptions.
// All calls use the TENANT's own key pair so money flows to the tenant.

function authHeader(keyId: string, keySecret: string): string {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

const PERIOD_BY_INTERVAL: Record<string, { period: string; interval: number }> = {
  monthly: { period: 'monthly', interval: 1 },
  '6month': { period: 'monthly', interval: 6 },
  '12month': { period: 'yearly', interval: 1 },
};

// Create a Razorpay plan for a reader plan. amountPaise is the per-cycle charge.
export async function createRazorpayPlan(
  keyId: string,
  keySecret: string,
  name: string,
  interval: string,
  amountPaise: number
): Promise<string> {
  const p = PERIOD_BY_INTERVAL[interval] ?? PERIOD_BY_INTERVAL.monthly;
  const res = await fetch('https://api.razorpay.com/v1/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(keyId, keySecret) },
    body: JSON.stringify({
      period: p.period,
      interval: p.interval,
      item: { name, amount: amountPaise, currency: 'INR' },
    }),
  });
  if (!res.ok) throw new Error(`Razorpay plan create failed (${res.status}): ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export interface RazorpaySubscription { id: string; status: string; }

// Create a subscription (mandate) on a plan. total_count caps recurring cycles.
export async function createSubscription(
  keyId: string,
  keySecret: string,
  planId: string,
  totalCount: number,
  notes: Record<string, string>
): Promise<RazorpaySubscription> {
  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(keyId, keySecret) },
    body: JSON.stringify({ plan_id: planId, total_count: totalCount, customer_notify: 1, notes }),
  });
  if (!res.ok) throw new Error(`Razorpay subscription create failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Cancel a subscription. immediate=false cancels at cycle end.
export async function cancelSubscription(
  keyId: string,
  keySecret: string,
  subscriptionId: string,
  immediate: boolean
): Promise<boolean> {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(keyId, keySecret) },
    body: JSON.stringify({ cancel_at_cycle_end: immediate ? 0 : 1 }),
  });
  return res.ok;
}

// Subscription checkout signature: HMAC_SHA256(payment_id|subscription_id, key_secret).
export async function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(keySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${paymentId}|${subscriptionId}`));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}
