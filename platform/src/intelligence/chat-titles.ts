/**
 * Centralized Chat Session Title Generation Utility
 *
 * Used by both frontend (ChatProvider, Sidebar) and backend (/api/agent/sessions)
 * to ensure 100% consistent, refined, and intelligent conversation naming across the entire app.
 */

export interface GenericChatMessage {
  role?: string;
  source?: string;
  content?: string;
  text?: string;
  parts?: Array<{ type?: string; text?: string }>;
}

const GREETING_ONLY_REGEX = /^(hey|hi|hello|yo|heyyy|bruv|bro|heybro|hey\s+bro|sup|hey\s+there|hi\s+there|good\s+morning|good\s+afternoon|good\s+evening|howdy|hey\s+allel|hey\s+alex|hi\s+alex|hey\s+bot|hi\s+bot|gm|gn|alle|allel)\b[.,!?\s]*$/i;

export function generateChatSessionTitle(messages: GenericChatMessage[] | null | undefined): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return "New Conversation";
  }

  // Filter for user messages
  const userMsgs = messages.filter(
    (m) => m.role === "user" || m.source === "USER_EXPLICIT"
  );
  if (userMsgs.length === 0) return "New Conversation";

  // Collect raw text content from user messages
  const userTexts: string[] = [];
  for (const m of userMsgs) {
    let txt = "";
    if (Array.isArray(m.parts)) {
      const textPart = m.parts.find((p) => p.type === "text" && typeof p.text === "string");
      if (textPart?.text) txt = textPart.text;
    }
    if (!txt && typeof m.content === "string") {
      txt = m.content;
    }
    if (!txt && typeof m.text === "string") {
      txt = m.text;
    }

    if (txt.trim().length > 0) {
      userTexts.push(txt.trim());
    }
  }

  if (userTexts.length === 0) return "New Conversation";

  const combinedRaw = userTexts.join(" ").trim();

  // Check for pure greeting-only or bot-name messages
  if (GREETING_ONLY_REGEX.test(combinedRaw.replace(/[^a-zA-Z0-9\s]/g, "").trim())) {
    return "Casual Greeting";
  }

  // Strip leading punctuation, greetings, agent mentions, question words, filler prefixes
  let cleaned = combinedRaw
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(hey|hi|hello|yo|heyyy|bruv|bro|heybro|sup|please|can\s+you|could\s+you|would\s+you|will\s+you)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(allel|alex|bot|ai|agent)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(how\s+are\s+my|how\s+are\s+our|how\s+is\s+my|how\s+is\s+our|how\s+do|how\s+does|how\s+can|how\s+to|how\s+my|how\s+our|how\s+is|how\s+are|how)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(what\s+is\s+the|what\s+are\s+the|what\s+about|what\s+is|what\s+are|what)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(where\s+is|where\s+are|where|when\s+is|when\s+will|why\s+is|why\s+are)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(tell\s+me\s+about|tell\s+me|show\s+me|get\s+me|check\s+on|check|scan|audit|inspect|look\s+at|give\s+me|find)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(my|our|the|all|any)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim();

  // If stripping left nothing or only greetings, return Casual Greeting
  if (!cleaned || GREETING_ONLY_REGEX.test(cleaned)) {
    return "Casual Greeting";
  }

  const lower = (cleaned + " " + combinedRaw).toLowerCase();

  // ── High-Level Domain Matching Rules ──
  if (/\b(customers?|clients?|accounts?|subscribers?|users?)\b/i.test(lower) && /\b(health|status|doing|overview|risk|mrr|churn|active|recovering|support)\b/i.test(lower)) {
    return "Customer Accounts & Health";
  }
  if (/\b(customers?|clients?|accounts?)\b/i.test(lower)) {
    return "Customer Accounts & Health";
  }
  if (/\b(e?mails?|inbox|gmail|gamil|mials?|drafts?|threads?|repl(y|ies)|newsletters?)\b/i.test(lower)) {
    return "Email & Inbox Management";
  }
  if (/\b(stri?pe?|bills?|billing|mrr|churn|revenues?|subscri(be|ption|ptions)|invoices?|payments?)\b/i.test(lower)) {
    return "Billing & Revenue";
  }
  if (/\b(posthogs?|analytics?|telemetr(y|ies)|cohorts?|events?|funnels?|metrics?|insights?|tracking|retention)\b/i.test(lower)) {
    return "Product Analytics";
  }
  if (/\b(intercoms?|crisp|zendesk|support|tickets?|helpdesk|conversations?|chats?)\b/i.test(lower)) {
    return "Customer Support & Intercom";
  }
  if (/\b(calendars?|meetings?|schedules?|events?|briefs?|agendas?|sync)\b/i.test(lower)) {
    return "Calendar & Meetings";
  }
  if (/\b(notions?|knowledges?|docs?|wikis?|pages?|notes?)\b/i.test(lower)) {
    return "Knowledge Base";
  }
  if (/\b(linears?|issues?|bugs?|tickets?|sprints?|tasks?|projects?)\b/i.test(lower)) {
    return "Issue Tracking";
  }
  if (/\b(sentry|errors?|crash(es)?|exceptions?|monitors?|alerts?)\b/i.test(lower)) {
    return "Error Monitoring";
  }
  if (/\b(hubspots?|crms?|contacts?|deals?|sales?|leads?|pipelines?|prospects?)\b/i.test(lower)) {
    return "CRM & Sales";
  }
  if (/\b(automations?|workflows?|triggers?|cron|flows?)\b/i.test(lower)) {
    return "Automations & Workflows";
  }
  if (/\b(integrations?|connections?|api\s+keys?|webhooks?|oauth)\b/i.test(lower)) {
    return "Connections & Integrations";
  }

  // Fallback: Clean capitalization of the stripped prompt keywords
  const words = cleaned
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  if (words.length > 0) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  return "New Session";
}

// Backward compatibility alias
export const generateRefinedTitle = generateChatSessionTitle;
