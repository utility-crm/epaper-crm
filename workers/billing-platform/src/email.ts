// Minimal Resend client. One platform-owned sending domain serves every publication:
// per-publication identity is carried by the From display name + Reply-To (the tenant's
// own support inbox), NOT by a per-tenant domain. Deliverability rides on the single
// authenticated sending domain (SPF/DKIM/DMARC set up once on RESEND_FROM's domain).

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  // Optional display name to prefix the From address, e.g. "Local Press".
  fromName?: string;
  // Optional Reply-To — set to the publication's real support address so replies
  // land in the tenant's inbox, not the platform's.
  replyTo?: string;
  // Optional Resend tags (echoed back on webhook events) for portal attribution.
  tags?: { name: string; value: string }[];
}

// Returns true on success. Never throws — email is best-effort and must not fail a refund.
export async function sendEmail(
  apiKey: string | undefined,
  from: string | undefined,
  input: SendEmailInput,
): Promise<boolean> {
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY / RESEND_FROM not configured — skipping send');
    return false;
  }
  // Compose the From header: "Display Name <sender@domain>" when a name is supplied.
  const fromHeader = input.fromName ? `${sanitizeName(input.fromName)} <${from}>` : from;
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
    });
    if (!res.ok) {
      console.error('[email] Resend send failed', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] Resend send threw', e);
    return false;
  }
}

// Strip characters that could break the From header; keep it a plain display name.
function sanitizeName(name: string): string {
  return name.replace(/[<>"\r\n]/g, '').trim().slice(0, 78);
}

// Build a simple branded refund email body. Used by both refund lanes.
export function refundEmailHtml(opts: {
  brandName: string;
  approved: boolean;
  amountRupees?: string;
  message: string;
}): string {
  const heading = opts.approved ? 'Your refund has been processed' : 'Update on your refund request';
  const amountLine = opts.approved && opts.amountRupees
    ? `<p style="font-size:18px;margin:16px 0"><strong>Refund amount: ₹${opts.amountRupees}</strong></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;line-height:1.5">
    <div style="max-width:520px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">${escapeHtml(opts.brandName)}</h2>
      <h3 style="margin:0 0 8px;color:#374151">${heading}</h3>
      ${amountLine}
      <p style="white-space:pre-wrap">${escapeHtml(opts.message)}</p>
      <p style="color:#6b7280;font-size:13px;margin-top:24px">If you have questions, just reply to this email.</p>
    </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
