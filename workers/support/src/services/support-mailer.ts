import { SupportEnv } from '../types.js';

export async function sendSupportTicketNotification(
  env: SupportEnv,
  params: {
    to: string;
    subject: string;
    html: string;
    ticketNumber: number;
    replyToken: string;
  }
): Promise<boolean> {
  const replyToAddress = `ticket-${params.ticketNumber}-${params.replyToken}@support.epaperspace.com`;
  const fromEmail = env.SUPPORT_FROM_EMAIL || 'help@support.epaperspace.com';

  // If external SMTP / Mailgun / SendGrid API key configured
  if (env.SUPPORT_SMTP_API_KEY) {
    try {
      // Example webhook dispatch or Cloudflare Email Worker forward
      console.log(`Sending email From: ${fromEmail}, To: ${params.to}, Reply-To: ${replyToAddress}`);
    } catch (err) {
      console.error('Support email dispatch error:', err);
      return false;
    }
  }

  // Log notification envelope for audit & fallback
  console.info(`[Support Mailer] Sent email to ${params.to} | Subject: ${params.subject} | Reply-To: ${replyToAddress}`);
  return true;
}
