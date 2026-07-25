// Minimal Resend client for the content worker. Mirrors the billing-tenant
// sendEmail signature (object param + fromName/replyTo/tags). Never throws —
// email is best-effort and must not fail the caller.
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

const SEND_TIMEOUT_MS = 10_000;

function sanitizeName(name: string): string {
  return name.replace(/[<>"\r\n]/g, '').trim().slice(0, 78);
}

export async function sendEmail(
  apiKey: string | undefined,
  from: string | undefined,
  input: SendEmailInput,
): Promise<boolean> {
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY / RESEND_FROM not configured — skipping send');
    return false;
  }
  const fromHeader = input.fromName ? `${sanitizeName(input.fromName)} <${from}>` : from;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: fromHeader,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) { console.error('[email] Resend failed', res.status); return false; }
    return true;
  } catch (e) {
    console.error('[email] Resend threw', e instanceof Error ? e.name : 'unknown');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Escape untrusted values before embedding in HTML email bodies.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}
