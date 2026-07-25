// Minimal Resend client for the content worker.
export async function sendEmail(
  apiKey: string | undefined,
  from: string | undefined,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY / RESEND_FROM not configured — skipping send');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) { console.error('[email] Resend failed', res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error('[email] Resend threw', e);
    return false;
  }
}
