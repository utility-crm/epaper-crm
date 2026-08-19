// Pure row shaping for reader_subscriptions — the term math shared by /reader/verify and
// the webhook, plus the notes→row mapping the webhook recovery path needs.
//
// It lives outside index.ts for one reason: nothing here may import Hono, D1, or the
// tenant DB, so reader-sub-row.selfcheck.mjs can exercise it under plain `node`. The repo
// has no test framework, and index.ts is unimportable outside a bundler (extensionless
// module specifiers), so this is the only seam where the money-path mapping is checkable.

import type { SubscriptionInterval } from '@epaper/types';

// Months of access one paid cycle buys.
const INTERVAL_MONTHS: Record<SubscriptionInterval, number> = { monthly: 1, '6month': 6, '12month': 12 };

// One paid term, starting at `start`. Shared so a browser callback (/reader/verify) and a
// webhook racing on the same subscription write the same period instead of two different
// ones — they converge on the ON CONFLICT update either way round.
export function subscriptionTerm(interval: SubscriptionInterval, start: Date = new Date()): { start: string; end: string } {
  const end = new Date(start);
  end.setMonth(end.getMonth() + (INTERVAL_MONTHS[interval] ?? 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// Events that mean the reader has actually paid: 'charged' is a cycle debit, 'activated' is
// the mandate going live off its first charge. 'subscription.authenticated' is deliberately
// absent — the mandate exists but no money has moved, and an active entitlement for an
// unpaid mandate is free premium access.
const ENTITLING_EVENTS = new Set(['subscription.charged', 'subscription.activated']);

export interface RecoveredSubRow {
  reader_id: string;
  razorpay_sub_id: string;
  plan_type: SubscriptionInterval;
  tier_id: string;
  plan_id: string;
  current_start: string;
  current_end: string;
  last_payment_id: string | null;
}

/**
 * The reader_subscriptions row a webhook must create when the subscription it reports has
 * no local row. Returns null when this event must not mint an entitlement — the caller
 * logs and returns its normal "unmatched" 2xx rather than throwing.
 *
 * `notes` is what we sent at subscribe time (razorpay.ts createSubscription) and Razorpay
 * echoes back. The webhook signature proves the body came from Razorpay, not that its
 * contents are ours to trust, so notes only decide WHICH reader and WHICH plan: tier_id and
 * the interval are read off the local `plans` row by the caller, because tier_id is the
 * thing that actually unlocks premium pages and must never be caller-supplied.
 *
 * The reader_id can only be checked for shape here (readers lookup needs D1) — the caller
 * must confirm it exists before inserting.
 */
export function recoveredSubRow(input: {
  event: string;
  subId: string | undefined;
  notes: unknown;
  // Local plans row, looked up by notes.plan_id. null when notes named no plan we know.
  plan: { id: string; tier_id: string; interval: SubscriptionInterval } | null;
  paymentId?: string | null;
  now?: Date;
}): RecoveredSubRow | null {
  if (!ENTITLING_EVENTS.has(input.event)) return null;
  if (!input.subId || !input.plan) return null;

  // Razorpay sends absent notes as [] as well as {}, so read defensively.
  const notes = (input.notes ?? {}) as Record<string, unknown>;
  const readerId = typeof notes.reader_id === 'string' ? notes.reader_id.trim() : '';
  const notedPlanId = typeof notes.plan_id === 'string' ? notes.plan_id.trim() : '';
  // Both ids must be present, and the plan handed in must be the one notes named.
  if (!readerId || !notedPlanId || notedPlanId !== input.plan.id) return null;

  const term = subscriptionTerm(input.plan.interval, input.now ?? new Date());
  return {
    reader_id: readerId,
    razorpay_sub_id: input.subId,
    plan_type: input.plan.interval,
    tier_id: input.plan.tier_id,
    plan_id: input.plan.id,
    current_start: term.start,
    current_end: term.end,
    last_payment_id: input.paymentId ?? null,
  };
}
