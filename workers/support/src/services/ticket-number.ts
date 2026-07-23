import { SupportEnv } from '../types.js';

// Monotonic ticket numbers without the MAX()+1 race. A single counter row is
// bumped atomically via UPDATE ... RETURNING; concurrent chats/webhooks each get
// a distinct value instead of colliding on the same MAX() snapshot. The row is
// seeded lazily starting at 1000 so the first ticket is #1001 (matches prior
// behaviour). Requires the support_counters table from migration 0002.
export async function nextTicketNumber(env: SupportEnv): Promise<number> {
  // Ensure the seed row exists (no-op after first call).
  await env.SUPPORT_DB.prepare(
    `INSERT INTO support_counters (name, value) VALUES ('ticket_number', 1000)
     ON CONFLICT(name) DO NOTHING`
  ).run();

  const row = await env.SUPPORT_DB.prepare(
    `UPDATE support_counters SET value = value + 1 WHERE name = 'ticket_number' RETURNING value`
  ).first<{ value: number }>();

  if (!row) {
    // Should never happen after the seed insert, but fail loud rather than dupe.
    throw new Error('Failed to allocate ticket number');
  }
  return row.value;
}
