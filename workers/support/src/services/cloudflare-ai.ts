import { SupportEnv } from '../types.js';
import { verifyRefundEligibility } from './refund-verifier.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResult {
  reply: string;
  ticketCreated?: {
    id: string;
    ticketNumber: number;
    category: string;
    refundEligible: boolean | null;
  };
}

export async function runSupportChat(
  env: SupportEnv,
  params: {
    tenantId: string;
    customDomain: string | null;
    userEmail: string;
    userName?: string;
    messages: ChatMessage[];
    ragKnowledge: Array<{ title: string; content: string }>;
  }
): Promise<ChatResult> {
  const latestUserMessage = params.messages[params.messages.length - 1]?.content || '';

  // 1. Build RAG knowledge block
  const knowledgeText = params.ragKnowledge
    .map((k, idx) => `[Knowledge ${idx + 1}: ${k.title}]\n${k.content}`)
    .join('\n\n');

  // 2. Build system instruction
  const systemPrompt = `You are an AI Support Assistant for the publication/organization "${params.tenantId}".
Always be polite, concise, and helpful. Answer questions accurately based on the Organization Knowledge Base provided below.

Organization Knowledge Base:
${knowledgeText || 'No custom FAQs available. Provide general courteous support.'}

IMPORTANT RULES:
1. If the user asks for a refund, first check eligibility rules. If they confirm they want a refund ticket created, inform them that you are creating a Refund Ticket for manual verification by our support team.
2. If the user reports a technical issue or problem that requires human agent assistance, let them know you have raised a support ticket for them.`;

  // Check user intent
  const lowerMsg = latestUserMessage.toLowerCase();
  const wantsRefund = lowerMsg.includes('refund') || lowerMsg.includes('money back') || lowerMsg.includes('cancel and refund');
  const wantsTicketTrigger = lowerMsg.includes('ticket') || lowerMsg.includes('human') || lowerMsg.includes('support agent') || lowerMsg.includes('not working') || lowerMsg.includes('issue');

  // Gather all substantive user messages across the conversation
  const userMessages = params.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter((txt) => {
      const l = txt.toLowerCase();
      return l !== 'hi' && l !== 'hello' && l !== 'hey' && l !== 'raise ticket' && l !== 'ticket' && l !== 'help';
    });

  const fullProblemContext = userMessages.length > 0 ? userMessages.join(' | ') : latestUserMessage;
  const hasSubstantiveContext = userMessages.length > 0 && fullProblemContext.length > 10;

  // If user asked to raise ticket but provided zero problem context, ask for details first!
  if (wantsTicketTrigger && !hasSubstantiveContext && !wantsRefund) {
    return {
      reply: `I would be glad to open a support ticket for you! Could you please describe the specific issue or problem you are experiencing so I can provide full context to our support team?`,
    };
  }

  // Auto-create ticket if explicit problem/refund requested with context
  if (wantsRefund || (wantsTicketTrigger && hasSubstantiveContext)) {
    const category = wantsRefund ? 'refund' : 'support';
    let refundEligible: boolean | null = null;
    let eligibilityNotes: string | null = null;

    if (wantsRefund) {
      const eligibility = await verifyRefundEligibility(env, {
        userEmail: params.userEmail,
        tenantId: params.tenantId,
      });
      refundEligible = eligibility.eligible;
      eligibilityNotes = eligibility.reason;
    }

    const ticketId = crypto.randomUUID();
    const replyToken = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();

    const maxRow = await env.SUPPORT_DB.prepare(
      `SELECT MAX(ticket_number) as maxNum FROM tickets`
    ).first<{ maxNum: number | null }>();
    const ticketNumber = (maxRow?.maxNum || 1000) + 1;

    // Derive a clean subject from actual problem context
    const cleanContext = fullProblemContext.replace(/^(raise ticket|please raise ticket|ticket)\s*/i, '').trim();
    const subjectTitle = cleanContext.length > 0 ? cleanContext.slice(0, 65) : latestUserMessage.slice(0, 65);
    const subject = wantsRefund
      ? `Refund Request: ${subjectTitle}`
      : `Support Issue: ${subjectTitle}`;

    await env.SUPPORT_DB.prepare(
      `INSERT INTO tickets (id, ticket_number, tenant_id, custom_domain, user_email, user_name, subject, category, status, priority, reply_token, refund_eligible, refund_eligibility_notes, ai_summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        ticketId,
        ticketNumber,
        params.tenantId,
        params.customDomain,
        params.userEmail,
        params.userName || 'Customer',
        subject,
        category,
        wantsRefund ? 'high' : 'medium',
        replyToken,
        refundEligible !== null ? (refundEligible ? 1 : 0) : null,
        eligibilityNotes,
        `Compiled User Context: ${fullProblemContext}`,
        now,
        now
      )
      .run();

    await env.SUPPORT_DB.prepare(
      `INSERT INTO ticket_messages (id, ticket_id, sender_type, sender_email, sender_name, message_body, created_at)
       VALUES (?, ?, 'customer', ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        ticketId,
        params.userEmail,
        params.userName || 'Customer',
        fullProblemContext,
        now
      )
      .run();

    const replyMsg = wantsRefund
      ? `I have created Refund Request Ticket #${ticketNumber} for your account (${params.userEmail}). Eligibility check: ${refundEligible ? 'Eligible' : 'Needs Review'}. Our support team will manually review and process your refund.`
      : `I have raised Support Ticket #${ticketNumber} regarding: "${subjectTitle}". Our support team has been notified with your full problem context and will reply to your email (${params.userEmail}) shortly.`;

    return {
      reply: replyMsg,
      ticketCreated: {
        id: ticketId,
        ticketNumber,
        category,
        refundEligible,
      },
    };
  }

  // 3. Normalize messages for Llama 3.1 (must start with 'user' after 'system')
  const cleanMessages = params.messages.filter((m, idx) => {
    // Drop leading 'assistant' messages before the first user message
    if (idx === 0 && m.role === 'assistant') return false;
    return true;
  });

  if (env.AI) {
    try {
      const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          ...cleanMessages,
        ],
      });

      if (response && (response as any).response) {
        return { reply: (response as any).response };
      }
    } catch (err) {
      console.error('Edge LLM generation error:', err);
    }
  }

  // 4. Intelligent Conversational RAG Fallback (when local AI proxy is offline or throws)
  if (params.ragKnowledge.length > 0) {
    const bestMatch = params.ragKnowledge[0];
    return {
      reply: `Here is information from our ${params.tenantId} knowledge base regarding "${bestMatch.title}":\n\n${bestMatch.content}\n\nDo you need me to open a support ticket or check refund eligibility for you?`,
    };
  }

  // Dynamic local conversational responses based on user query intent
  if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
    return {
      reply: `Hello there! Welcome to ${params.tenantId} Support. You can ask me about reading articles, subscription plans, digital editions, or type "refund" or "raise ticket" if you need account assistance.`,
    };
  }

  if (lowerMsg.includes('time') || lowerMsg.includes('date')) {
    return {
      reply: `The current server time is ${new Date().toUTCString()}. Our digital editions and ePaper issues are published daily at 05:00 UTC.`,
    };
  }

  if (lowerMsg.includes('read') || lowerMsg.includes('epaper') || lowerMsg.includes('newspaper') || lowerMsg.includes('article')) {
    return {
      reply: `To read ${params.tenantId} ePaper editions, simply click on any edition date on the main portal. You can use left/right arrows to flip pages or click any article box to open clean reader view.`,
    };
  }

  if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('plan') || lowerMsg.includes('subscribe')) {
    return {
      reply: `We offer Monthly and Annual digital subscription plans for ${params.tenantId}. Subscribers get full access to daily ePaper archives and ad-free reading.`,
    };
  }

  return {
    reply: `I understand you're asking about "${latestUserMessage}". While I don't have an exact FAQ entry for that in the local database right now, I can raise a priority support ticket for our team to email you directly—just type "raise ticket" or let me know!`,
  };
}
