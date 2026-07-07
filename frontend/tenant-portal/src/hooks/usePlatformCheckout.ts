import { useCallback, useRef } from 'react';
import { portalApi } from '../lib/api';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const existing = document.getElementById('razorpay-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = CHECKOUT_SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

interface UsePlatformCheckoutOptions {
  slug: string;
  token: string;
  orgName: string;
  email: string;
  onSuccess: (plan: string) => void;
  onError: (message: string) => void;
}

/**
 * Hook that manages the Razorpay Subscription checkout flow for platform billing.
 * Mirrors the reader subscription pattern in billing-tenant.
 *
 * Flow:
 *   1. Load Razorpay checkout.js lazily
 *   2. Call POST /api/billing/platform/subscribe → { subscription_id, key_id }
 *   3. Open Razorpay modal in subscription mode (enables e-mandate / NACH auto-debit)
 *   4. On payment.success → POST /api/billing/platform/verify-payment
 *   5. On payment.failed or dismiss → call onError
 */
export function usePlatformCheckout({
  slug,
  token,
  orgName,
  email,
  onSuccess,
  onError,
}: UsePlatformCheckoutOptions) {
  const checkoutRef = useRef<any>(null);

  const openCheckout = useCallback(
    async (planId: string, planName: string) => {
      try {
        // 1. Load Razorpay checkout.js
        await loadRazorpayScript();

        // 2. Create subscription on backend → returns subscription_id + key_id
        const res = await portalApi.subscribeToPlatformPlan(slug, planId, token);
        if (!res.ok || !res.data) {
          onError(res.error?.message ?? 'Failed to initiate subscription');
          return;
        }

        const { subscription_id, key_id } = res.data;

        // 3. Open Razorpay modal in subscription mode
        //    Using subscription_id (not order_id) triggers e-mandate / NACH auto-debit setup.
        const options = {
          key: key_id,
          subscription_id,
          name: 'ePaper CMS',
          description: `${planName} Plan`,
          prefill: {
            name: orgName,
            email,
          },
          notes: {
            slug,
            plan_id: planId,
          },
          theme: { color: '#6366f1' },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_subscription_id: string;
            razorpay_signature: string;
          }) => {
            // 4. Verify signature on backend — do NOT mark as paid without this step
            const verifyRes = await portalApi.verifyPlatformPayment(
              {
                slug,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              },
              token
            );

            if (verifyRes.ok && verifyRes.data?.verified) {
              onSuccess(verifyRes.data.plan);
            } else {
              onError(verifyRes.error?.message ?? 'Payment verification failed. Contact support.');
            }
          },
          modal: {
            ondismiss: () => {
              // User closed the modal without paying — not an error, just reset state.
              onError('');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp: any) => {
          onError(resp.error?.description ?? 'Payment failed. Please try again.');
        });
        checkoutRef.current = rzp;
        rzp.open();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Unexpected error. Please try again.');
      }
    },
    [slug, token, orgName, email, onSuccess, onError]
  );

  return { openCheckout };
}
