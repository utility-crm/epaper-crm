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

// ── Renewal / expiry notices ────────────────────────────────────────────────

export interface RenewalMailInput {
  to: string;
  /** Publication name — From display name and body heading. */
  brandName: string;
  /** When access ends (or ended). Formatted for display, not parsed by the reader. */
  endAt: string;
  /** false = "expires in N days" warning, true = "has ended". */
  expired: boolean;
  /** Publication support address, for the reactivation reply. */
  supportEmail?: string | null;
}

/**
 * Pre-expiry warning and expiry notice for reader subscriptions.
 *
 * ponytail: sender is `noreply@<RESEND_DOMAIN>`, not the `noreply-<slug>@` form the
 * refund mail uses — a single shared address, as specified. Per-publication identity
 * still rides on the From display name + Reply-To, so it reads the same to the reader.
 * Best-effort like every other send here: a mail failure must not stop the sweep.
 */
export async function sendRenewalMail(
  apiKey: string | undefined,
  domain: string | undefined,
  input: RenewalMailInput,
): Promise<boolean> {
  const from = `noreply@${domain || 'payments.epaperspace.com'}`;
  return sendEmail(apiKey, from, {
    to: input.to,
    fromName: input.brandName,
    replyTo: input.supportEmail ?? undefined,
    tags: [{ name: 'lane', value: input.expired ? 'sub_expired' : 'sub_expiring' }],
    subject: input.expired
      ? `Your ${input.brandName} subscription has ended`
      : `Your ${input.brandName} subscription expires on ${formatDay(input.endAt)}`,
    html: renewalEmailHtml(input),
  });
}

// Day-precision is all a renewal notice needs, and it dodges timezone confusion that
// a rendered clock time would create for a reader in another zone.
function formatDay(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function renewalEmailHtml(input: RenewalMailInput): string {
  const brand = escapeHtml(input.brandName);
  const day = escapeHtml(formatDay(input.endAt));
  const heading = input.expired ? 'Your subscription has ended' : 'Your subscription is about to expire';
  const intro = input.expired
    ? `Access to ${brand} ended on ${day}. Renew from your account page to pick up where you left off.`
    : `Access to ${brand} ends on ${day}. If your subscription is set to auto-renew, no action is needed — this is just a heads-up.`;
  // Reactivation for anything the online mandate can't take (cash, cheque, bank
  // transfer, enterprise terms) is a conversation with the publication, not a button.
  const offline = input.supportEmail
    ? `<p style="margin:0 0 8px">Paying by cash, bank transfer, or on enterprise terms? Reply to this email or write to <a href="mailto:${escapeHtml(input.supportEmail)}">${escapeHtml(input.supportEmail)}</a> and we'll reactivate it for you.</p>`
    : `<p style="margin:0 0 8px">Paying by cash, bank transfer, or on enterprise terms? Reply to this email and we'll reactivate it for you.</p>`;
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;line-height:1.5">
    <div style="max-width:520px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">${brand}</h2>
      <h3 style="margin:0 0 8px;color:#374151">${heading}</h3>
      <p style="margin:0 0 16px">${intro}</p>
      ${offline}
    </div>
  </body></html>`;
}
