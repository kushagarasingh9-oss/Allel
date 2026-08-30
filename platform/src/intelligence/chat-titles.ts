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

const GREETING_ONLY_REGEX = /^(hey|hi|hello|yo|heyyy|bruv|bro|sup|hey\s+bro|hey\s+there|hi\s+there|good\s+morning|good\s+afternoon|good\s+evening|howdy|hey\s+allel|hey\s+alex|hi\s+alex|hey\s+bot|hi\s+bot|gm|gn)\b[.,!?\s]*$/i;

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

  // Check for pure greeting-only messages
  if (GREETING_ONLY_REGEX.test(combinedRaw.replace(/[^a-zA-Z0-9\s]/g, "").trim())) {
    return "Casual Greeting";
  }

  // Strip leading punctuation, greetings, agent mentions, filler prefixes
  let cleaned = combinedRaw
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(hey|hi|hello|yo|heyyy|bruv|bro|sup|please|can\s+you|could\s+you|get\s+me|show\s+me|check|triage|look\s+at)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(allel|alex|bot|ai|agent)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(hey|hi|hello|get\s+me|show\s+me|check)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim();

  // If stripping left nothing or only greetings, return Casual Greeting
  if (!cleaned || GREETING_ONLY_REGEX.test(cleaned)) {
    return "Casual Greeting";
  }

  const lower = (cleaned + " " + combinedRaw).toLowerCase();

  // ── Domain matching rules ──
  if (/\b(e?mails?|inbox|gmail|gamil|mials?|drafts?|threads?|repl(y|ies)|newsletters?)\b/i.test(lower)) {
    return "Email & Inbox Management";
  }
  if (/\b(stri?pe?|bills?|billing|mrr|churn|revenues?|subscri(be|ption|ptions)|invoices?|payments?)\b/i.test(lower)) {
    return "Billing & Revenue";
  }
  if (/\b(posthogs?|analytics?|telemetr(y|ies)|cohorts?|events?|funnels?|metrics?|insights?|tracking)\b/i.test(lower)) {
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
  if (/\b(hubspots?|crms?|contacts?|deals?|sales?|leads?|pipelines?)\b/i.test(lower)) {
    return "CRM & Sales";
  }

  // Fallback: Capitalize first 4 words of cleaned prompt
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

// Alias for backwards compatibility
export const generateRefinedTitle = generateChatSessionTitle;
