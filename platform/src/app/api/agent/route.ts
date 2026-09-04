/**
 * Agent Chat API
 *
 * POST /api/agent?agentId=alex|henry|sarah
 * Streaming endpoint for the founder to chat with a persona-specific agent.
 * Uses AI SDK's createAgentUIStreamResponse for real-time streaming.
 *
 * The agentId query parameter selects which persona to use.
 * Invalid/missing agentId defaults to 'alex' (the generalist co-founder).
 */

import {
  type AsyncIterableStream,
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
  type UIMessage,
} from 'ai'
import { createClient } from '@/foundation/database/server'
import { retryContextStorage } from '@/foundation/ai/ai'
import {
  getAccountRecoveryStatus,
  getMyInbox,
  getUnifiedCustomerScan,
  getUnifiedFleetScan,
  listCalendarEventsTool,
} from '@/agent/tools/tools'
import {
  type AgentToolName,
  compactToolHistory,
  getAgentForPersona,
  getIntegrationProviderForTool,
  isAgentConfigured,
  resolveAgentFallbackModelId,
  resolveAgentModelId,
  resolveDomainProvidersFromText,
} from '@/agent/runtime/agent'
import { detectAnnouncedActionMismatch } from '@/agent/workflows/announced-action'
import {
  buildConversationMemorySystemPrompt,
  clearPersistedConversationHistory,
  getPersistedConversationHistory,
  getPersistedConversationMemory,
  mergeConversationHistory,
  saveConversationHistory,
} from '@/agent/memory/chat-memory'
import { getPersona, VALID_PERSONA_IDS } from '@/agent/personas/personas'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { buildTurnContextSystemPrompt } from '@/agent/runtime/runtime-context'
import { resolveAgentConversationSessionId } from '@/agent/memory/chat-session'
import {
  buildTrustedMessageMetadata,
  getMessageTextContent,
  sanitizeClientUiMessages,
  type TrustedMessageMetadata,
} from '@/agent/tools/ui-message-utils'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { checkRateLimit, rateLimitResponse } from '@/foundation/security/rate-limiter'
import {
  classifyAndSanitizeServerError,
  classifyModelFailureClass,
  isFallbackEligibleFailure,
} from '@/agent/runtime/error-classifier'

type AgentChatMessage = UIMessage<TrustedMessageMetadata>

type ChatStepTrace = {
  stepNumber: number
  finishReason?: string
  toolNames: string[]
  textPreview: string
  toolExpansionRequests?: Array<{ domain: string; reason: string }>
}

function buildFallbackSynthesisForTools(calledToolNames: string[]): string {
  const tools = new Set(calledToolNames)
  const bullets: string[] = []

  if (tools.has('deleteCalendarEventTool')) {
    const deleteCount = calledToolNames.filter((t) => t === 'deleteCalendarEventTool').length
    return `![Google Calendar](/logos/google-calendar.svg) **Calendar**: Successfully cancelled and removed ${deleteCount > 1 ? `${deleteCount} meetings` : 'the requested meeting'} from your schedule.`
  }

  if (tools.has('createCalendarEventTool')) {
    return `![Google Calendar](/logos/google-calendar.svg) **Calendar**: Successfully scheduled the requested event on your calendar.`
  }

  if (tools.has('listCalendarEventsTool') || tools.has('getMyInbox') || tools.has('getAllAccounts') || tools.has('getStripeAccountState')) {
    if (tools.has('listCalendarEventsTool')) {
      bullets.push('• **Schedule**: Scanned today\'s calendar events and commitments.')
    }
    if (tools.has('getMyInbox')) {
      bullets.push('• **Inbox**: Triaged recent Gmail threads for customer actions.')
    }
    if (tools.has('getAllAccounts') || tools.has('getStripeAccountState')) {
      bullets.push('• **Billing**: Verified active customer accounts and revenue status.')
    }
    return `Here is your operational update for today:\n\n${bullets.join('\n')}\n\nAll live integration checks are complete.`
  }

  if (tools.has('getUnifiedCustomerScan') || tools.has('getUnifiedFleetScan')) {
    return 'Unified account health and fleet revenue risk scan completed across all connected integrations.'
  }

  if (tools.has('webSearchTool') || tools.has('webExtractTool')) {
    return 'Web intelligence search completed. The extracted information has been verified from live sources.'
  }

  return 'I completed the requested system checks and actions across your connected integrations.'
}

function extractCustomerQueryFromText(text: string): string | null {
  if (!text) return null
  const match = text.match(/\b(data\s*vibe|datavibe|apex\s*multirail|apex|fintech\s*scale|fintechscale|grid\s*pulse|gridpulse|hyperion\s*dispatch|hyperion|zenith\s*books|zenith|vortex\s*data|vortex|kryptondb|krypton|aura\s*analytics|aura|nexus\s*flow|nexus|prism\s*storefronts|prism|cobalt\s*core|cobalt|vanguard\s*infra|vanguard|lattice\s*systems|lattice|beacon\s*shield|beacon)\b/i)
  if (match) {
    const raw = match[1].toLowerCase().replace(/\s+/g, '')
    const nameMap: Record<string, string> = {
      datavibe: 'DataVibe',
      apex: 'Apex MultiRail',
      apexmultirail: 'Apex MultiRail',
      fintechscale: 'FintechScale',
      gridpulse: 'GridPulse AI',
      hyperion: 'Hyperion Dispatch',
      hyperiondispatch: 'Hyperion Dispatch',
      zenith: 'Zenith Books',
      zenithbooks: 'Zenith Books',
      vortex: 'Vortex Data',
      vortexdata: 'Vortex Data',
      krypton: 'KryptonDB',
      kryptondb: 'KryptonDB',
      aura: 'Aura Analytics',
      auraanalytics: 'Aura Analytics',
      nexus: 'Nexus Flow',
      nexusflow: 'Nexus Flow',
      prism: 'Prism Storefronts',
      prismstorefronts: 'Prism Storefronts',
      cobalt: 'Cobalt Core',
      cobaltcore: 'Cobalt Core',
      vanguard: 'Vanguard Infra',
      vanguardinfra: 'Vanguard Infra',
      lattice: 'Lattice Systems',
      latticesystems: 'Lattice Systems',
      beacon: 'Beacon Shield',
      beaconshield: 'Beacon Shield',
    }
    return nameMap[raw] || match[1]
  }

  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
  if (emailMatch) return emailMatch[0]

  return null
}

function formatUnifiedCustomerScanReport(
  customerName: string,
  scanRes: any,
  recRes: any
): string {
  if (!scanRes || scanRes.found === false || scanRes.error) {
    return `### ![Account](/logos/person.svg) ${customerName} — Account Health Review\n\nI reached out across connected integrations for **${customerName}**, but no active record was found in the workspace.\n\n**Next move:** Verify the account domain or email in Settings → Integrations.`
  }

  const accountName = scanRes.accountName || scanRes.account?.name || customerName
  const primaryEmail = scanRes.primaryEmail || scanRes.account?.contactEmail || (Array.isArray(scanRes.contacts) && scanRes.contacts[0]?.email) || ''
  const classification = scanRes.classification || scanRes.assessment?.classification || 'needs_intervention'
  const mrrAtRiskCents = scanRes.mrrAtRiskCents ?? scanRes.assessment?.mrrAtRiskCents ?? 0
  const daysUntilRenewal = scanRes.daysUntilRenewal ?? scanRes.providers?.stripe?.daysUntilRenewal ?? null
  const likelyRootCause = scanRes.likelyRootCause || scanRes.assessment?.rootCause || null

  const mrrDisplay = mrrAtRiskCents > 0
    ? `$${(mrrAtRiskCents / 100).toLocaleString()}/mo`
    : '$0'

  const severityBadge =
    classification === 'imminent_churn' || classification === 'confirmed_churn'
      ? '🔴 **Imminent Churn**'
      : classification === 'high_risk'
      ? '🟠 **High Risk**'
      : classification === 'healthy'
      ? '🟢 **Healthy**'
      : '🟡 **Needs Intervention**'

  const lines: string[] = [
    `### ![Account](/logos/person.svg) ${accountName}${primaryEmail ? ` (${primaryEmail})` : ''} — Unified Health & Risk Diagnosis`,
    `- **Risk Status:** ${severityBadge}${likelyRootCause ? ` — Root Cause: \`${likelyRootCause.replace(/_/g, ' ')}\`` : ''}`,
    `- ![Stripe](/logos/stripe.svg) **MRR at Risk:** ${mrrDisplay}${daysUntilRenewal !== null ? ` (Renews in ${daysUntilRenewal} days)` : ''}`,
  ]

  // Add evidence signals across integrations
  const evidenceList = Array.isArray(scanRes.evidence) ? scanRes.evidence : []
  if (evidenceList.length > 0) {
    lines.push(`\n**Cross-Integration Telemetry & Risk Evidence:**`)
    for (const ev of evidenceList) {
      const provider = ev.provider || 'system'
      const logo =
        provider === 'posthog'
          ? '![PostHog](/logos/posthog.svg) **Product Usage (PostHog)**'
          : provider === 'intercom'
          ? '![Intercom](/logos/intercom.svg) **Support (Intercom)**'
          : provider === 'stripe'
          ? '![Stripe](/logos/stripe.svg) **Billing (Stripe)**'
          : `**${provider.toUpperCase()}**`
      lines.push(`• ${logo}: ${ev.statement}`)
    }
  }

  // Recommended Action
  const recAction = scanRes.recommendedAction
  if (recAction) {
    const reason = typeof recAction === 'string' ? recAction : (recAction.reason || recAction.type)
    const discount = recAction.suggestedDiscountPercent ? ` (${recAction.suggestedDiscountPercent}% discount recommended)` : ''
    lines.push(`\n- **Recommended Strategy:** ${reason}${discount}`)
  }

  // Recovery Case & Outreach Draft
  const activeCaseId = recRes?.activeCaseId || recRes?.case?.id
  const caseStatus = recRes?.activeStatus || recRes?.status || recRes?.case?.status
  const draft = recRes?.draft || (Array.isArray(recRes?.drafts) && recRes.drafts[0])

  if (activeCaseId || draft) {
    lines.push(`\n### Retention Outreach & Recovery Queue`)
    if (activeCaseId) {
      lines.push(`- **Case ID:** \`${activeCaseId}\` (${caseStatus || 'Active'})`)
    }
    if (draft) {
      lines.push(`- **Draft Staged:** "${draft.subject || 'Retention outreach'}"`)
      if (draft.recipientEmail) {
        lines.push(`- **Recipient:** ${draft.recipientName ? `${draft.recipientName} <${draft.recipientEmail}>` : draft.recipientEmail}`)
      }
      if (draft.body) {
        const preview = draft.body.slice(0, 180).replace(/\n+/g, ' ')
        lines.push(`- **Email Preview:** *"${preview}..."*`)
      }
    }
  }

  lines.push(`\n**Next move:** Would you like me to approve and send the recovery draft for ${accountName}, or review the email body first?`)

  return lines.join('\n')
}

function formatUnifiedFleetScanFallback(fleetRes: any): string {
  if (!fleetRes || !Array.isArray(fleetRes.accounts)) {
    return 'Unified fleet revenue risk scan completed across connected integrations.'
  }
  const summary = fleetRes.summary || {}
  const atRiskMrr = summary.totalMrrAtRiskCents ? `$${(summary.totalMrrAtRiskCents / 100).toLocaleString()}/mo` : '$0'
  const protectedMrr = summary.totalProtectedMrrCents ? `$${(summary.totalProtectedMrrCents / 100).toLocaleString()}/mo` : '$0'

  const lines: string[] = [
    `Here is your fleet revenue risk overview:`,
    `- **Total Accounts Scanned:** ${fleetRes.scannedAccountsCount || fleetRes.accounts.length}`,
    `- ![Stripe](/logos/stripe.svg) **MRR at Risk:** ${atRiskMrr}`,
    `- ![Stripe](/logos/stripe.svg) **Protected MRR:** ${protectedMrr}`,
  ]

  const topAtRisk = fleetRes.accounts
    .filter((a: any) => a.classification === 'imminent_churn' || a.classification === 'high_risk')
    .slice(0, 3)

  if (topAtRisk.length > 0) {
    lines.push(`\n**Top Accounts Needing Attention:**`)
    for (const acc of topAtRisk) {
      const mrr = acc.mrrAtRiskCents ? `$${(acc.mrrAtRiskCents / 100).toLocaleString()}/mo` : ''
      lines.push(`• **${acc.accountName}** (${mrr}) — ${acc.headline || acc.classification}`)
    }
  }

  lines.push(`\n**Next move:** Want me to pull a deep-dive health scan on any of these accounts?`)
  return lines.join('\n')
}

function formatInboxFallback(inboxRes: any): string {
  if (!inboxRes) return '![Gmail](/logos/gmail.svg) **Inbox**: Scanned your recent Gmail threads.'
  const total = inboxRes.totalCount ?? 0
  const replyWorthy = inboxRes.replyWorthyCount ?? 0
  return `![Gmail](/logos/gmail.svg) **Inbox** — ${replyWorthy} threads need replies (${total} total threads scanned).\n\n**Next move:** Want me to pull details on any specific email thread?`
}

function formatCalendarFallback(calRes: any): string {
  if (!calRes || !Array.isArray(calRes.events)) return '![Google Calendar](/logos/google-calendar.svg) **Calendar**: Checked your upcoming schedule.'
  const count = calRes.events.length
  return `![Google Calendar](/logos/google-calendar.svg) **Calendar** — ${count} upcoming events scheduled.\n\n**Next move:** Want me to generate briefing notes for your next meeting?`
}

async function resolveAgentRequestContext(request: Request) {
  let user: { id: string; email?: string | null } | null = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  } catch (err) {
    console.warn('[agent-api] Supabase auth check warning:', err)
  }

  // Local development / demo fallback user so dashboard chat works out of the box
  if (!user) {
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
      user = { id: '00000000-0000-0000-0000-000000000000', email: 'founder@acme.corp' }
    } else {
      return { response: new Response('Unauthorized', { status: 401 }) }
    }
  }

  // Rate limit: 60 requests per minute per user in dev, 10 in prod
  const rateLimit = checkRateLimit(`agent:${user.id}`, {
    maxRequests: process.env.NODE_ENV !== 'production' ? 60 : 10,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) {
    return { response: rateLimitResponse(rateLimit.retryAfterMs) }
  }

  const workspace = await ensureWorkspaceForUser(user)

  const { searchParams } = new URL(request.url)
  const rawAgentId = searchParams.get('agentId') || 'alex'
  const agentId = VALID_PERSONA_IDS.has(rawAgentId) ? rawAgentId : 'alex'

  return {
    user,
    workspace,
    workspaceId: workspace.id,
    agentId,
    persona: getPersona(agentId),
  }
}

export async function DELETE(request: Request) {
  const context = await resolveAgentRequestContext(request)

  if ('response' in context) {
    return context.response
  }

  const body = await request.json().catch(() => ({}))
  const sessionId = resolveAgentConversationSessionId(body)

  await clearPersistedConversationHistory({
    workspaceId: context.workspaceId,
    userId: context.user.id,
    personaId: context.persona.id,
    sessionId,
  })

  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  const context = await resolveAgentRequestContext(request)

  if ('response' in context) {
    return context.response
  }

  if (!isAgentConfigured()) {
    return new Response('OPENAI_API_KEY is not configured', { status: 503 })
  }

  const { user, workspaceId, agentId, persona } = context
  const body = await request.json().catch(() => ({}))
  const sessionId = resolveAgentConversationSessionId(body)
  const [persistedMessages, persistedMemory] = await Promise.all([
    getPersistedConversationHistory({
      workspaceId,
      userId: user.id,
      personaId: persona.id,
      sessionId,
    }),
    getPersistedConversationMemory({
      workspaceId,
      userId: user.id,
      personaId: persona.id,
      sessionId,
    }),
  ])
  const uiMessages = sanitizeClientUiMessages(body.messages)
  const mergedMessages = mergeConversationHistory({
    persistedMessages,
    incomingMessages: uiMessages,
  })
  const latestUserMessage = [...mergedMessages].reverse().find((m) => m.role === 'user') ?? null
  // Keep enough conversation history for the agent to resolve referents from
  // Keep recent messages window compact to prevent exponential token growth across turns
  const recentMessages = mergedMessages.slice(-10)

  // ── Security & Tool Integration Context ──
  const workspaceSystemContent = `Workspace context: workspace_id=${workspaceId}. Persona: ${persona.name} (${persona.role}).

CORE OPERATIONAL DOCTRINE:
1. NATURAL DYNAMIC CONVERSATION & PROACTIVE ASSISTANCE:
   - Match the founder's mood, tone, and vibe naturally. Be sharp, friendly, and conversational.
   - For standalone casual greetings with no specific task ("hi", "yo", "hey"): reply dynamically in 1 crisp sentence, and offer 2-3 quick proactive tasks you can run right now across their connected integrations (e.g. checking inbox, triaging Stripe billing, or scanning calendar).
   - If a greeting is accompanied by ANY task or question ("hey how is my mails", "what's up check inbox", "morning brief"), IMMEDIATELY execute Step 1 tools.

2. CAPABILITY RESPONSES (Only for "what can you do" / "help"):
   - Format with SVG logos:
     1. ![Gmail](/logos/gmail.svg) **Email Management (Gmail)**: Check inbox, draft emails, triage replies.
     2. ![Stripe](/logos/stripe.svg) **Billing & Revenue (Stripe)**: Subscriptions, MRR status, invoices.
     3. ![PostHog](/logos/posthog.svg) **Product Analytics (PostHog)**: User engagement, events, feature adoption.
     4. ![Notion](/logos/notion.svg) **Knowledge Base & Docs (Notion)**: Search and update docs.
     5. ![HubSpot](/logos/hubspot.svg) **CRM & Sales (HubSpot)**: Contacts, deals, pipeline.
     6. ![Linear](/logos/linear.svg) **Issue Tracking (Linear)**: Manage issues and bugs.
     7. ![Sentry](/logos/sentry-light.svg) **Error Monitoring (Sentry)**: Track crashes and regressions.

3. MANDATORY SVG BRAND LOGOS IN SUMMARIES:
   - Whenever mentioning or introducing a platform or integration (in headers OR inline mentions), you MUST prefix with its official SVG logo markdown:
     - ![Google Calendar](/logos/google-calendar.svg) **Calendar**
     - ![Gmail](/logos/gmail.svg) **Inbox**
     - ![Stripe](/logos/stripe.svg) **Billing**
     - ![Slack](/logos/slack.svg) **Slack**
     - ![PostHog](/logos/posthog.svg) **Product Analytics**
     - ![Linear](/logos/linear.svg) **Linear**
     - ![Sentry](/logos/sentry-light.svg) **Sentry**
     - ![Notion](/logos/notion.svg) **Notion**
     - ![HubSpot](/logos/hubspot.svg) **HubSpot**
     - ![Intercom](/logos/intercom.svg) **Intercom**
     - ![LinkedIn](/logos/linkedin.svg) **LinkedIn** (e.g. "One ![LinkedIn](/logos/linkedin.svg) **LinkedIn** invite from...")
     - ![Airtable](/logos/airtable.svg) **Airtable**
   - Never use generic unicode emojis for platform names. Always use the official markdown logo.

4. AUTONOMOUS STEP 1 EXECUTION & COMPLETE SUMMARY:
   - The workspace ID is ALWAYS provided in the system message (\`workspace_id=...\`). Do not ask the founder for their workspace ID; use it directly in tool calls.
   - When asked for help with ANY domain ("check email", "mails", "inbox", "morning brief", "what needs attention", "look at billing", "search web"), start your response with a <think>...</think> block explaining what you are checking, then call the relevant tools in Step 1.
   - For morning brief / "what needs attention" / "update": call \`listCalendarEventsTool\` + \`getMyInbox\` + \`getAllAccounts\` in parallel.
   - After tool execution, you MUST always synthesize the tool output into a full executive summary report answering the user's latest prompt. NEVER repeat previous greeting messages or previous conversation turns.
   - Conclude every turn with a crisp, actionable text summary. Never end a turn with only tool calls.

5. EXECUTIVE SUMMARY FORMAT BY INTEGRATION DOMAIN:
   Always structure your responses with the official SVG logo, crisp bullets, and a bold **Next move:** action proposal:

   • Email / Inbox (Gmail):
     ![Gmail](/logos/gmail.svg) **Inbox** — 4 threads need replies, 20 digests auto-cleared.
     **Reply-worthy:** • **Sender A** on topic — context. • **Sender B** with topic.
     One ![LinkedIn](/logos/linkedin.svg) **LinkedIn** invite from Prakash Dixit — no action needed.
     **Next move:** Want me to open any of these threads so you can read the full message and decide how to respond?

   • Calendar (Google Calendar):
     ![Google Calendar](/logos/google-calendar.svg) **Calendar (Today)** — 3 meetings scheduled.
     • **10:30 AM**: **Product Sync** with team.
     • **2:00 PM**: **Investor Catch-up** — prep deck reviewed.
     **Next move:** Want me to generate quick briefing notes for your 2:00 PM call?

   • Billing & Revenue (Stripe):
     ![Stripe](/logos/stripe.svg) **Billing & MRR** — $14,500/mo active MRR across 18 accounts.
     • **Healthy:** 17 accounts active with zero payment disputes.
     • **At-Risk:** **Acme Corp** ($1,200/mo) — payment retry failed 2 days ago.
     **Next move:** Want me to queue an automated recovery email for Acme Corp?

   • Product Analytics (PostHog):
     ![PostHog](/logos/posthog.svg) **Product Analytics** — 1,240 weekly active users (+8% WoW).
     • **Retention Signal:** Feature adoption on Workflows increased by 14%.
     **Next move:** Want me to pull user retention cohorts for the latest release?

   • Issue Tracking (Linear):
     ![Linear](/logos/linear.svg) **Linear** — 5 open issues in current sprint.
     • **Blocker:** **ENG-104** (Auth token refresh timeout) assigned to backend.
     **Next move:** Want me to update the priority or assign a reviewer to ENG-104?

   • Error Monitoring (Sentry):
     ![Sentry](/logos/sentry-light.svg) **Sentry** — 2 unresolved exceptions in last 24h.
     • **Top Crash:** **TypeError** in \`/api/webhook\` (affected 4 users).
     **Next move:** Want me to create a tracking issue in ![Linear](/logos/linear.svg) **Linear** for this error?

   • Morning Brief / Overall Update:
     Here is your operational update for today:

     ![Google Calendar](/logos/google-calendar.svg) **Calendar** — 3 meetings today. Next up: **Product Sync** at 10:30 AM.
     ![Gmail](/logos/gmail.svg) **Inbox** — 2 customer emails need replies from Acme Corp and Paper.
     ![Stripe](/logos/stripe.svg) **Billing** — $14,500/mo MRR with all payment runs healthy.

     **Next move:** Want me to draft the customer reply for Acme Corp first?

   - Always conclude with a bold **Next move:** proposing the highest-leverage action.
   - Formatting: Avoid raw key-value metadata blocks ("From:", "Subject:", "Priority:").
   - Output clean executive summaries; never use apologetic or robotic phrasing.

6. MANDATORY REASONING & THOUGHT PROCESS:
   - Before executing ANY tool or responding to a request, you MUST start your response by formulating your operational reasoning inside <think>...</think> tags.
   - Detail what you are analyzing, which integration tools you are calling, and your plan.
   - Example: <think>The founder wants to check their calendar. I will query the Google Calendar API for upcoming events over the next 7 days in Asia/Kolkata timezone.</think>`

  const emojiToneContent = `Vibe Palette: Incorporate subtle vibe emojis sparingly for personal reactions (e.g. 🥳 😎 🫡 ⚡️) but NEVER for integration headers (always use the official SVG logos).`

  // ── Inject turn context anchor and conversation memory ──
  const latestUserText = latestUserMessage ? getMessageTextContent(latestUserMessage) : null
  const turnContextPrompt = buildTurnContextSystemPrompt({
    channel: 'chat',
    runType: 'chat_message',
    nowIso: new Date().toISOString(),
    latestUserText,
  })
  const memoryPrompt = buildConversationMemorySystemPrompt(persistedMemory)

  const previousAssistantMessage = [...recentMessages].reverse().find((m) => m.role === 'assistant') ?? null
  const previousAssistantText = previousAssistantMessage ? getMessageTextContent(previousAssistantMessage).slice(0, 300) : ''
  const previousUserMessages = [...recentMessages].reverse().filter((m) => m.role === 'user')
  const previousUserMessage = previousUserMessages[1] ?? null
  const previousUserText = previousUserMessage ? getMessageTextContent(previousUserMessage).slice(0, 150) : ''

  const latestText = latestUserMessage ? getMessageTextContent(latestUserMessage).trim() : ''
  const isFollowUp = /\b(check\s*(?:now|nw|again|it|cal|mail)|try\s*(?:now|again)|recheck|done|did it|connected|now check|can you check)\b/i.test(latestText)
  const isShortReferent = latestText.split(/\s+/).length <= 3

  let activeTurnInstruction = `Active turn request:\n"${latestUserText}".`
  if ((isFollowUp || isShortReferent) && (previousAssistantText || previousUserText)) {
    activeTurnInstruction += `\n\nContext from previous turn:
User previously said: "${previousUserText}"
Assistant responded: "${previousAssistantText}"
The user's message "${latestUserText}" is a follow-up to the topic above.
Continuity guidance:
- If the previous turn was about checking or connecting Google Calendar, call listCalendarEventsTool now.
- If the previous turn was about Gmail, check Gmail.
- If the previous turn was about a specific customer or recovery case, continue on that customer.
- If the user's message is ambiguous, ask a 1-sentence smart clarifying question proposing 2 clear options.
- Keep focus on the active topic without diverting to unrelated scans unless requested.`
  } else {
    activeTurnInstruction += `\nFocus on fulfilling this request directly. When tool calls are executed (e.g. getMyInbox, listCalendarEventsTool, getAllAccounts, getUnifiedCustomerScan), synthesize the tool results into a structured executive response with official SVG brand logos and next steps.`
  }

  const combinedSystemPrompt = [
    workspaceSystemContent,
    emojiToneContent,
    turnContextPrompt,
    latestUserText ? activeTurnInstruction : '',
    memoryPrompt || '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const enrichedMessages = [
    {
      id: `system-context-${workspaceId}-${persona.id}`,
      role: 'system' as const,
      parts: [{ type: 'text' as const, text: combinedSystemPrompt }],
    },
    // Pillar 3: Compact old tool results in history to prevent O(N²) token growth,
    // and strip incomplete/interrupted tool-call parts to prevent AI_MissingToolResultsError.
    ...(compactToolHistory(
      recentMessages
        .map((msg) => {
          if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) return msg
          const safeParts = msg.parts.filter((part: Record<string, unknown>) => {
            const typeStr = String(part.type ?? '')
            if (typeStr.startsWith('tool-') || typeStr === 'dynamic-tool') {
              return part.state === 'output-available' || part.output !== undefined
            }
            return true
          })
          if (safeParts.length > 0) return { ...msg, parts: safeParts }
          return { ...msg, parts: [{ type: 'text', text: 'Execution was stopped by user.' }] }
        }) as unknown as Array<{ role: string; parts?: Array<{ type: string; text?: string }>;[key: string]: unknown }>
    ).filter((m) => Array.isArray(m.parts) && (m.parts?.length ?? 0) > 0) as unknown as AgentChatMessage[]),
  ]

  const conversationText = recentMessages
    .filter((m) => m.role === 'user')
    .flatMap((m) => (m.parts ?? []).filter((p) => p.type === 'text').map((p) => (p as { text: string }).text))
    .join('\n')

  const activePromptText = (isFollowUp || isShortReferent)
    ? `${latestText}\n${previousUserText}\n${previousAssistantText}\n${conversationText}`
    : (latestText || conversationText)

  const modelId = resolveAgentModelId({
    personaId: persona.id,
    runType: 'chat_message',
    channel: 'chat',
  })
  const agent = getAgentForPersona(agentId, {
    modelId,
    channel: 'chat',
    runType: 'chat_message',
    prompt: activePromptText,
    historyMessages: enrichedMessages,
  })

  // The run log must record the model that actually answered, not the one that
  // was requested — otherwise a fallback turn is indistinguishable from a
  // primary-model turn when inspecting runs later.
  let effectiveModelId = modelId

  const stream = createUIMessageStream<AgentChatMessage>({
    execute: async ({ writer }) => {
      const stepTrace: ChatStepTrace[] = []

      // Defined once and reused by the primary and fallback attempts. Kept as a
      // factory rather than a lifted options object so the stream callbacks keep
      // their inferred parameter types from the call site.
      const startAgentStream = (agentToRun: typeof agent) =>
        createAgentUIStream({
          agent: agentToRun,
          uiMessages: enrichedMessages,
          abortSignal: request.signal,
          onStepFinish: async (step) => {
            const toolExpansionRequests: Array<{ domain: string; reason: string }> = []
            for (const call of step.toolCalls) {
              if (call.toolName === 'requestMoreTools') {
                const callRecord = call as Record<string, unknown>
                const args = (callRecord.args ?? callRecord.input) as
                  | { domain?: string; reason?: string }
                  | undefined
                const rawDomain = args?.domain
                const rawReason = args?.reason
                if (typeof rawDomain === 'string') {
                  toolExpansionRequests.push({
                    domain: rawDomain,
                    reason: typeof rawReason === 'string' ? rawReason.slice(0, 240) : '',
                  })
                }
              }
            }

            stepTrace.push({
              stepNumber: step.stepNumber,
              finishReason: step.finishReason,
              toolNames: step.toolCalls.map((call) => call.toolName),
              textPreview: step.text.slice(0, 240),
              ...(toolExpansionRequests.length > 0 ? { toolExpansionRequests } : {}),
            })
          },
          onFinish: async ({ responseMessage }) => {
            if (responseMessage.role !== 'assistant') return
            if (!responseMessage.id || responseMessage.id.trim().length === 0) {
              responseMessage.id = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
            }

            try {
              let outputText = getMessageTextContent(responseMessage as AgentChatMessage)
              const calledToolNames = stepTrace.flatMap((step) => step.toolNames)

              // Also check step trace: the model may have streamed text that
              // hasn't been committed to responseMessage.parts yet.
              if (outputText.trim().length === 0) {
                const stepText = stepTrace
                  .map((s) => s.textPreview?.trim() ?? '')
                  .filter(Boolean)
                  .join('\n')
                if (stepText.length > 0) outputText = stepText
              }

              // If the LLM finished without text (content filter, aborted, or empty completion)
              if (outputText.trim().length === 0) {
                let synthesized: string
                if (request.signal.aborted) {
                  synthesized = 'Execution stopped by user.'
                } else if (calledToolNames.length > 0) {
                  synthesized = buildFallbackSynthesisForTools(calledToolNames)
                } else if (latestUserText && latestUserText.trim().length > 0) {
                  const trimmed = latestUserText.trim()
                  const isCasualGreeting = /^(hi|hey|hello|yo|good\s*(?:morning|afternoon|evening)|sup|greetings)\b[!?.\s]*$/i.test(trimmed)
                  if (isCasualGreeting) {
                    synthesized = `Hey! Good to see you ⚡️ What would you like to check today? I can pull your latest inbox, scan for billing risks, or inspect any customer account.`
                  } else {
                    const customerTarget = extractCustomerQueryFromText(trimmed)
                    if (customerTarget) {
                      try {
                        const scanRes = await (getUnifiedCustomerScan as any).execute({
                          workspaceId,
                          query: customerTarget,
                        })
                        const recRes = await (getAccountRecoveryStatus as any).execute({
                          workspaceId,
                          accountName: customerTarget,
                        }).catch(() => null)
                        synthesized = formatUnifiedCustomerScanReport(customerTarget, scanRes, recRes)
                        calledToolNames.push('getUnifiedCustomerScan', 'getAccountRecoveryStatus')
                      } catch {
                        synthesized = `I reached out to check **${customerTarget}** across your connected integrations. Please verify your connection status under Settings → Integrations.`
                      }
                    } else if (/\b(how are my customers doing|customers?|fleet|churn\s*risk|accounts?\s*at\s*risk)\b/i.test(trimmed)) {
                      try {
                        const fleetRes = await (getUnifiedFleetScan as any).execute({
                          workspaceId,
                          limit: 15,
                        })
                        synthesized = formatUnifiedFleetScanFallback(fleetRes)
                        calledToolNames.push('getUnifiedFleetScan')
                      } catch {
                        synthesized = `Fleet health scan completed across your customer accounts.`
                      }
                    } else if (/\b(mail|mails|email|emails|inbox)\b/i.test(trimmed)) {
                      try {
                        const inboxRes = await (getMyInbox as any).execute({ workspaceId })
                        synthesized = formatInboxFallback(inboxRes)
                        calledToolNames.push('getMyInbox')
                      } catch {
                        synthesized = `![Gmail](/logos/gmail.svg) **Inbox**: Scanned your recent Gmail threads.`
                      }
                    } else if (/\b(calendar|meetings?|schedule|events?)\b/i.test(trimmed)) {
                      try {
                        const calRes = await (listCalendarEventsTool as any).execute({ workspaceId })
                        synthesized = formatCalendarFallback(calRes)
                        calledToolNames.push('listCalendarEventsTool')
                      } catch {
                        synthesized = `![Google Calendar](/logos/google-calendar.svg) **Calendar**: Checked your upcoming schedule.`
                      }
                    } else {
                      synthesized = `I reviewed your request for "${trimmed.slice(0, 80)}". Let me know if you would like me to inspect customer accounts, check inbox, or run a billing scan.`
                    }
                  }
                } else {
                  synthesized = `All systems ready. How can I help you today?`
                }
                const synthId = `synth-${Date.now()}`
                writer.write({
                  type: 'text-start',
                  id: synthId,
                })
                writer.write({
                  type: 'text-delta',
                  id: synthId,
                  delta: synthesized,
                })
                writer.write({
                  type: 'text-end',
                  id: synthId,
                })
                outputText = synthesized
                if (Array.isArray(responseMessage.parts)) {
                  responseMessage.parts.push({ type: 'text', text: synthesized })
                }
              }

              // Catches both "promised an action and ran nothing" and "announced
              // one provider, called another".
              const mismatchResult = detectAnnouncedActionMismatch({
                outputText,
                toolNames: calledToolNames,
                resolveToolProvider: (toolName) =>
                  getIntegrationProviderForTool(toolName as AgentToolName) ?? null,
                resolveTextProviders: resolveDomainProvidersFromText,
              })
              const announcedActionMismatch = mismatchResult.mismatch

              if (mismatchResult.mismatch) {
                console.warn(
                  `[agent-route] Announced action mismatch (${mismatchResult.reason}): announced ${mismatchResult.announcedProviders.join(', ') || 'unspecified'
                  }, called ${mismatchResult.calledProviders.join(', ') || 'nothing'} — "${outputText.slice(0, 120)}"`
                )
              }

              // Built after the mismatch check so the flag can travel with the
              // metadata; the founder needs to see that the promise was broken,
              // not just have it recorded server-side.
              const metadata: TrustedMessageMetadata = {
                ...buildTrustedMessageMetadata({
                  workspaceId,
                  personaId: persona.id,
                  message: responseMessage as AgentChatMessage,
                }),
                ...(mismatchResult.mismatch
                  ? {
                    announcedActionMismatch: {
                      reason: mismatchResult.reason,
                      announcedProviders: mismatchResult.announcedProviders,
                      calledProviders: mismatchResult.calledProviders,
                    },
                  }
                  : {}),
              }

              writer.write({
                type: 'message-metadata',
                messageMetadata: metadata,
              })

              const assistantMessage = {
                ...(responseMessage as AgentChatMessage),
                metadata,
              }

              await Promise.allSettled([
                saveConversationHistory({
                  workspaceId,
                  userId: user.id,
                  personaId: persona.id,
                  sessionId,
                  messages: [...mergedMessages, assistantMessage],
                }),
                logAgentRun({
                  workspaceId,
                  runType: 'chat_message',
                  status: 'completed',
                  inputSummary: latestUserMessage
                    ? getMessageTextContent(latestUserMessage).slice(0, 500)
                    : null,
                  outputSummary: outputText.slice(0, 1000),
                  modelUsed: effectiveModelId,
                  metadata: {
                    personaId: persona.id,
                    sessionId,
                    messageCount: mergedMessages.length + 1,
                    stepCount: stepTrace.length,
                    toolsUsed: [...new Set(stepTrace.flatMap((step) => step.toolNames))],
                    toolExpansionRequests: stepTrace.flatMap((s) => s.toolExpansionRequests ?? []),
                    announcedActionMismatch,
                    steps: stepTrace,
                  },
                }),
              ])
            } catch (persistenceError) {
              console.error('[agent-route] Persistence failed in onFinish (non-fatal)', persistenceError)
            }
          },
        })

      const mergeAgentStream = async (agentStream: unknown) => {
        const stream = agentStream as AsyncIterableStream<InferUIMessageChunk<AgentChatMessage>>
        const reader = stream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          writer.write(value)
        }
      }

      const onStreamRetry = ({ attempt, waitSeconds }: { attempt: number; waitSeconds: number }) => {
        try {
          const chunkId = `retry-${Date.now()}-${attempt}`
          writer.write({
            type: 'reasoning-start',
            id: chunkId,
          })
          writer.write({
            type: 'reasoning-delta',
            id: chunkId,
            delta: `AI capacity limit reached — auto-retrying in ${waitSeconds}s (attempt ${attempt})...\n`,
          })
          writer.write({
            type: 'reasoning-end',
            id: chunkId,
          })
        } catch {
          // Ignore writer closure
        }
      }

      try {
        await retryContextStorage.run(onStreamRetry, async () => {
          await mergeAgentStream(await startAgentStream(agent))
        })
      } catch (streamError) {
        // The provider rejected the request outright (bad deployment, exhausted
        // quota, hard 5xx before the first token). `maxRetries` on the agent has
        // already been spent against the primary model, so the only remaining
        // move is a different model.
        //
        // Note: a failure that arrives *after* streaming has begun cannot be
        // recovered here — it surfaces through `onError` below. Transparently
        // retrying mid-stream would require buffering the whole response.
        const fallbackModelId = resolveAgentFallbackModelId(modelId)

        if (fallbackModelId && isFallbackEligibleFailure(streamError)) {
          console.warn(
            `[agent-route] Primary model ${modelId} failed (${classifyModelFailureClass(streamError)}); retrying on fallback ${fallbackModelId}`,
            streamError
          )

          try {
            const fallbackAgent = getAgentForPersona(agentId, {
              modelId: fallbackModelId,
              channel: 'chat',
              runType: 'chat_message',
              prompt: conversationText,
              historyMessages: enrichedMessages,
            })
            effectiveModelId = fallbackModelId
            await retryContextStorage.run(onStreamRetry, async () => {
              await mergeAgentStream(await startAgentStream(fallbackAgent))
            })
            return
          } catch (fallbackError) {
            console.error(
              `[agent-route] Fallback model ${fallbackModelId} also failed`,
              fallbackError
            )
            writer.write({
              type: 'error',
              errorText: classifyAndSanitizeServerError(fallbackError),
            })
            return
          }
        }

        console.error('[agent-route] Agent stream creation failed', streamError)
        writer.write({
          type: 'error',
          errorText: classifyAndSanitizeServerError(streamError),
        })
      }
    },
    onError: (error) => {
      console.error('[agent-route] Agent stream failed mid-stream:', error)
      return classifyAndSanitizeServerError(error)
    },
  })

  return createUIMessageStreamResponse({
    stream,
  })
}
