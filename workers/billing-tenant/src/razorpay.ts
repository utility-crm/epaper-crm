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
