// Razorpay Subscription checkout signature verification for the platform worker.
// Subscription flow: payment_id + "|" + subscription_id  (differs from Order flow
// which uses order_id + "|" + payment_id).
// Uses the PLATFORM's own key pair (env secrets), not per-tenant keys.

const encoder = new TextEncoder();

/**
 * Verify the Razorpay Subscription checkout callback signature.
 * Algorithm: HMAC-SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, key_secret)
 */
export async function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${paymentId}|${subscriptionId}`)
  );
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature;
}
