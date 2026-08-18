// Self-check for the pure notes→row mapping in reader-sub-row.ts. No framework, no
// fixtures, no network, no D1 — the repo has no test runner, so this is the one runnable
// guard on the webhook recovery path's money logic.
//
// Run: node workers/billing-tenant/src/reader-sub-row.selfcheck.mjs

import assert from 'node:assert/strict';
import { recoveredSubRow, subscriptionTerm } from './reader-sub-row.ts';

// The local plans row is authoritative for tier + interval; notes only names the plan.
const plan = { id: 'plan_local', tier_id: 'tier_daily', interval: '6month' };
const notes = { plan_id: 'plan_local', tier_id: 'tier_ATTACKER', reader_id: 'reader_1' };
const now = new Date('2026-01-15T10:00:00.000Z');
const base = { subId: 'sub_rzp_1', notes, plan, paymentId: 'pay_1', now };

// A charged event with good notes mints a full active-term row.
const charged = recoveredSubRow({ ...base, event: 'subscription.charged' });
assert.deepEqual(charged, {
  reader_id: 'reader_1',
  razorpay_sub_id: 'sub_rzp_1',
  plan_type: '6month',
  tier_id: 'tier_daily',            // from plans, NOT the tier_id in notes
  plan_id: 'plan_local',
  current_start: '2026-01-15T10:00:00.000Z',
  current_end: '2026-07-15T10:00:00.000Z',   // 6month => +6 months
  last_payment_id: 'pay_1',
});

// activated also means money moved (mandate live off its first charge).
assert.equal(recoveredSubRow({ ...base, event: 'subscription.activated' }).tier_id, 'tier_daily');
// ...but a bare mandate with nothing charged must never grant access.
assert.equal(recoveredSubRow({ ...base, event: 'subscription.authenticated' }), null);
assert.equal(recoveredSubRow({ ...base, event: 'subscription.cancelled' }), null);

// Validation: no reader_id, no plan_id, notes that name a different plan, unknown plan
// (D1 lookup missed), missing subscription id, and Razorpay's empty-notes-as-[] all bail.
const bad = [
  { notes: { plan_id: 'plan_local' } },
  { notes: { reader_id: 'reader_1' } },
  { notes: { reader_id: 'reader_1', plan_id: 'plan_other' } },
  { notes: { reader_id: '  ', plan_id: 'plan_local' } },
  { notes: { reader_id: 'reader_1', plan_id: 42 } },
  { notes: [] },
  { notes: undefined },
  { plan: null },
  { subId: undefined },
];
for (const patch of bad) {
  assert.equal(recoveredSubRow({ ...base, event: 'subscription.charged', ...patch }), null, `should bail: ${JSON.stringify(patch)}`);
}

// Payment id is optional — activated often arrives without a payment entity.
assert.equal(recoveredSubRow({ ...base, event: 'subscription.activated', paymentId: null }).last_payment_id, null);

// Term math matches what /reader/verify writes, per interval, and tolerates junk intervals.
assert.equal(subscriptionTerm('monthly', now).end, '2026-02-15T10:00:00.000Z');
assert.equal(subscriptionTerm('12month', now).end, '2027-01-15T10:00:00.000Z');
assert.equal(subscriptionTerm('nonsense', now).end, '2026-02-15T10:00:00.000Z'); // falls back to 1 month

console.log('reader-sub-row self-check: ok');
