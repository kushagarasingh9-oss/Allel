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
import { createClient } from '@/lib/supabase/server'
import {
  type AgentToolName,
  compactToolHistory,
  getAgentForPersona,
  getIntegrationProviderForTool,
  isAgentConfigured,
  resolveAgentFallbackModelId,
  resolveAgentModelId,
  resolveDomainProvidersFromText,
} from '@/lib/agent/agent'
import { detectAnnouncedActionMismatch } from '@/lib/agent/announced-action'
import {
  buildConversationMemorySystemPrompt,
  clearPersistedConversationHistory,
  getPersistedConversationHistory,
  getPersistedConversationMemory,
  mergeConversationHistory,
  saveConversationHistory,
} from '@/lib/agent/chat-memory'
import { getPersona, VALID_PERSONA_IDS } from '@/lib/agent/personas'
import { logAgentRun } from '@/lib/agent/run-logger'
import { buildTurnContextSystemPrompt } from '@/lib/agent/runtime-context'
import { resolveAgentConversationSessionId } from '@/lib/agent/chat-session'
import {
  buildTrustedMessageMetadata,
  getMessageTextContent,
  sanitizeClientUiMessages,
  type TrustedMessageMetadata,
} from '@/lib/agent/ui-message-utils'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limiter'
import {
  classifyAndSanitizeServerError,
  classifyModelFailureClass,
  isFallbackEligibleFailure,
} from '@/lib/agent/error-classifier'

type AgentChatMessage = UIMessage<TrustedMessageMetadata>

type ChatStepTrace = {
  stepNumber: number
  finishReason?: string
  toolNames: string[]
  textPreview: string
  toolExpansionRequests?: Array<{ domain: string; reason: string }>
}

async function resolveAgentRequestContext(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: new Response('Unauthorized', { status: 401 }) }
  }

  // Rate limit: 10 requests per minute per user
  const rateLimit = checkRateLimit(`agent:${user.id}`, {
    maxRequests: 10,
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
  const uiMessages = sanitizeClientUiMessages(body.messages, {
    workspaceId,
    personaId: persona.id,
  })
  const mergedMessages = mergeConversationHistory({
    persistedMessages,
    incomingMessages: uiMessages,
  })
  const latestUserMessage = [...mergedMessages].reverse().find((m) => m.role === 'user') ?? null
  // Keep enough conversation history for the agent to resolve referents from
  // prior turns (thread IDs, event IDs, sender addresses). With prompt-level
  // tool filtering the total payload stays under ~15K tokens. (Bug 1.2 fix)
  const recentMessages = mergedMessages.slice(-20)

  // ── Security & Tool Integration Context ──
  const workspaceSystemContent = `Workspace context: workspace_id=${workspaceId}. Persona: ${persona.name} (${persona.role}).

DYNAMIC VIBE, NATURAL CONVERSATION & INTENT CORE:
1. NATURAL DYNAMIC CONVERSATION (Cool, Real, Human Vibe):
   - Match the user's mood, tone, and vibe naturally. Be cool, friendly, sharp, and conversational like a real co-founder.
   - NEVER repeat rigid script templates! DO NOT repeatedly say the same exact sentence for every message.
   - If the user asks "how are you", answer naturally ("Doing awesome! Ready to dive into whatever you need today. How are you holding up?").
   - If the user types casual greetings ("hi", "yo", "sup", "hey b"), reply dynamically with a cool, natural vibe without calling tools.
   - If the user types a typo greeting ("heyyyxb d"), acknowledge it smoothly ("Hey there! Looks like a keyboard slip haha, what are we tackling today?").

2. CAPABILITY RESPONSES ONLY (Explicit "what can you do"):
   - ONLY when the user EXPLICITLY asks "what can you do?", "what are your features?", or "help", format as a clean, spacious numbered list (1., 2., 3.) where each capability uses its OFFICIAL SVG BRAND LOGO IMAGE markdown (no generic emojis before titles!):
     1. ![Gmail](/logos/gmail.svg) **Email Management (Gmail)**: Check your inbox, draft emails, and manage customer communications.
     2. ![Stripe](/logos/stripe.svg) **Billing & Revenue (Stripe)**: Monitor billing statuses, manage subscriptions, and handle invoices.
     3. ![PostHog](/logos/posthog.svg) **Product Usage & Analytics (PostHog)**: Analyze user engagement, track events, and assess product performance.
     4. ![Notion](/logos/notion.svg) **Knowledge Base & Docs (Notion)**: Manage documents, create tasks, and update project statuses.
     5. ![HubSpot](/logos/hubspot.svg) **CRM & Sales (HubSpot)**: Handle contacts, deals, and customer relationships.
     6. ![Linear](/logos/linear.svg) **Issue & Project Tracking (Linear)**: Create and manage issues, track progress, and collaborate with the team.
     7. ![Sentry](/logos/sentry-light.svg) **Error Monitoring (Sentry)**: Monitor errors, resolve issues, and track system performance.

3. PLATFORM & INTEGRATION BRAND LOGOS IN SUMMARIES:
   - When presenting platform sections, daily updates, morning briefs, or tool summaries, ALWAYS include the official SVG brand logo directly before the platform name/header:
     - Google Calendar: ![Google Calendar](/logos/google-calendar.svg) **Calendar** (e.g. ![Google Calendar](/logos/google-calendar.svg) **Calendar is clear today**)
     - Gmail / Inbox: ![Gmail](/logos/gmail.svg) **Inbox** (e.g. ![Gmail](/logos/gmail.svg) **Inbox has 15 threads needing replies**)
     - Stripe / Billing: ![Stripe](/logos/stripe.svg) **Billing** (e.g. ![Stripe](/logos/stripe.svg) **Billing is clean ($9,135 MRR)**)
     - Slack: ![Slack](/logos/slack.svg) **Slack**
     - PostHog: ![PostHog](/logos/posthog.svg) **Product Analytics**
     - Linear: ![Linear](/logos/linear.svg) **Linear Issues**
     - Sentry: ![Sentry](/logos/sentry-light.svg) **Sentry Errors**
     - Notion: ![Notion](/logos/notion.svg) **Knowledge Base**
     - HubSpot: ![HubSpot](/logos/hubspot.svg) **CRM & Pipeline**
     - Intercom: ![Intercom](/logos/intercom.svg) **Support & Tickets**

4. TYPO-RESILIENT INTENT MATCHING (DO NOT DUMP CAPABILITIES ON DOMAIN QUERIES):
   - "knowlee base" / "knowledge base" / "docs" / "notion": The user wants to search Notion docs or internal knowledge base! Call searchNotionTool or answer about internal docs. NEVER treat "knowlee base" as a capability question or dump capability lists!
   - "gamil" / "mial" / "inbox" / "email" / "mail" / "help me with mail": User wants to check email! Call getMyInbox immediately!
   - "strpi" / "mrr" / "billing" / "revenue" / "churn": User wants a workspace billing overview! Call getAllAccounts immediately. It fetches live Stripe data and reports live MRR. For a named customer, call getStripeAccountState with the Stripe customer ID returned by getAllAccounts.
   - "posthog" / "usage" / "analytics": User wants workspace PostHog analytics! Call listPostHogInsights immediately. Use getPostHogAccountUsage only after you have a real linked internal account ID.
   - "linear" / "issues" / "bugs": User wants Linear tickets! Call searchLinearIssuesTool immediately!
   - "slack" / "team messages": User wants current Slack context! Call getSlackHistory immediately; use searchSlack for a stated topic.
   - "intercom" / "support" / "tickets": User wants current support context! Call listIntercomConvos immediately.
   - "sentry" / "errors" / "crashes": User wants live error context! Call listSentryIssuesTool immediately.
   - "daily brief" / "morning brief" / "update for today" / "what's happening today" / "overview": The founder wants an executive morning update! Concurrently call \`listCalendarEventsTool\` (today's schedule), \`getMyInbox\` (inbox triage), and \`getAllAccounts\` (billing/risk status) to build a comprehensive founder brief.
   - "search web" / "google" / "internet" / "research" / "who is" / "what is" / "competitor" / "trends" / "latest news": The founder wants real-time web intelligence! IMMEDIATELY CALL \`webSearchTool\` to search the internet! For a specific URL or in-depth page text, call \`webExtractTool\`.
   - "calendar" / "meeting" / "schedule": User wants their live schedule! Call listCalendarEventsTool immediately.
   - "airtable": User wants live Airtable data! Call listAirtableBasesTool before selecting tables or records.
   - "hubspot" / "crm": Call the relevant HubSpot search tool using the named entity; without a named entity, call listHubSpotPipelinesTool.

5. AUTONOMOUS AGENTIC EXECUTION DOCTRINE (NEVER BE A PASSIVE CHATBOT):
   - When a founder asks for help with ANY domain ("help me with the mail", "check inbox", "look at billing", "check churn", "search docs", "research competitor", "search web"):
     DO NOT ASK PASSIVE QUESTIONS (e.g. "What do you want me to do?", "Are you looking to check your inbox?").
     IMMEDIATELY CALL THE RELEVANT TOOL AUTOMATICALLY IN STEP 1!
     - "research competitor" / "search web" / "look up online": IMMEDIATELY CALL webSearchTool!
     - "morning brief" / "update for today": IMMEDIATELY CALL listCalendarEventsTool + getMyInbox + getAllAccounts!
     - "help me with mail" / "email" / "inbox": IMMEDIATELY CALL getMyInbox!
     - "billing" / "revenue" / "churn" / "mrr": IMMEDIATELY CALL getAllAccounts! This is live Stripe data, not a Supabase account cache.
     - "analytics" / "usage": IMMEDIATELY CALL listPostHogInsights!
     - "docs" / "knowledge base": IMMEDIATELY CALL searchNotionTool!
   - Execute the tool, analyze the output, and present the immediate actionable summary directly to the founder!

6. INTELLIGENT DATA INTERPRETATION (NEVER DUMP RAW TOOL OUTPUT):
   - NEVER regurgitate raw tool results as-is! You are an OPERATOR, not a data pipe.
   - Treat output tagged stripe_live, posthog_live, or gmail live API results as the only external operational truth. A $0 value from a live tool is a real result, not an excuse to invent placeholder data.
   - Stored account history, drafts, memory, and timelines are workflow context only; never present them as current third-party integration facts. Fetch the relevant live tool first when current truth matters.
   - When a tool reports "not connected" or "needs attention": State it directly — "Your [Gmail/Stripe/PostHog] integration isn't ready for live use. Open Settings > Connections to connect or repair it."
   - A result marked dataSource="connection_guard" means no provider request was made; it is not an empty or zero-valued business result. A result marked dataSource="live_provider_api" came from the connected provider call.
   - When data IS real: Analyze it like a sharp co-founder. Identify the ONE most important insight, the biggest risk, and the single highest-leverage action. Do NOT list every account with the same boilerplate description.
   - PATTERN RECOGNITION: If every single account has the exact same status (same MRR, same risk, same "no founder touch"), that's a data quality signal — either the integration isn't live or the data is stale. Call it out.

7. FOUNDER-QUALITY INBOX & TOOL RESPONSE FORMAT (STRICT FORMAT BAN):
   - ABSOLUTE BAN: NEVER output key-value metadata labels such as "From:", "Subject:", "Priority:", "Action Needed:", or "Last Message:". NEVER dump raw email/ticket/tool transcripts or metadata blocks.
   - Output MUST be formatted in either:
     a) SHORT PARAGRAPH TYPE: A sharp, natural 2 to 3-sentence executive summary explaining the high-leverage findings and the immediate recommended action.
     b) CRISP BULLET TYPE: Short 1-line bullet points focusing purely on actionable insights (e.g. "• **Matthew Brown**: Asking about the AI Wharton professor breakdown — draft reply ready").
   - Digest and marketing emails are background noise: summarize them in a single count (e.g., "Cleared 8 background digests").
    - Always prefix platform sections in updates and summaries with their official SVG brand logo (e.g. ![Google Calendar](/logos/google-calendar.svg) **Calendar**, ![Gmail](/logos/gmail.svg) **Inbox**, ![Stripe](/logos/stripe.svg) **Billing**, ![Slack](/logos/slack.svg) **Slack**).
    - Talk like a sharp chief of staff: "I scanned your inbox. 1 thread needs your reply today regarding account access, and 8 promotional updates were filtered out. Should I draft a response now?"

8. EXECUTIVE CONFIDENCE (NO APOLOGETIC PHRASING):
   - Never say "so I couldn't", "unfortunately", "I'm sorry", "you might want to check yourself". State facts directly and professionally.`
  
  const emojiToneContent = `Saved Emoji Palette: 🥳 🥰 😊 🙂 🤩 😎 🙁 😩 🫡 👾 👍🏻 ✌🏻 🦁 💥 💫 ⚡️ 💸 📧 📈 📉 ❤️ 🩷 ♾️ 👌🏻 🧑‍💻 👩🏻‍💻 🤷🏻‍♂️ 🔨 💰 📤 📩 ❕ ❔ 🕑 🌱 🌙 🌞
Incorporate these emojis naturally into your status summaries and action recommendations.`

  // ── Inject turn context anchor and conversation memory ──
  const latestUserText = latestUserMessage ? getMessageTextContent(latestUserMessage) : null
  const turnContextPrompt = buildTurnContextSystemPrompt({
    channel: 'chat',
    runType: 'chat_message',
    nowIso: new Date().toISOString(),
    latestUserText,
  })
  const memoryPrompt = buildConversationMemorySystemPrompt(persistedMemory)

  const enrichedMessages = [
    {
      id: `system-workspace-${workspaceId}`,
      role: 'system' as const,
      parts: [{ type: 'text' as const, text: workspaceSystemContent }],
    },
    {
      id: `system-emoji-palette-${persona.id}`,
      role: 'system' as const,
      parts: [{ type: 'text' as const, text: emojiToneContent }],
    },
    {
      id: `system-turn-context-${persona.id}`,
      role: 'system' as const,
      parts: [{ type: 'text' as const, text: turnContextPrompt }],
    },
    // Include persisted conversation memory as a system message
    ...(memoryPrompt
      ? [{
          id: `system-conversation-memory-${persona.id}`,
          role: 'system' as const,
          parts: [{ type: 'text' as const, text: memoryPrompt }],
        }]
      : []),
    // Pillar 3: Compact old tool results in history to prevent O(N²) token growth.
    // Keeps the last tool exchange verbatim; earlier large payloads are truncated to
    // a 1-line preview + char count. User/assistant messages are never touched.
    // Double-cast via unknown[] — compactToolHistory returns same objects at runtime.
    ...(compactToolHistory(recentMessages as unknown as Array<{ role: string; parts?: Array<{ type: string; text?: string }>; [key: string]: unknown }>)
      .filter((m) => Array.isArray(m.parts) && (m.parts?.length ?? 0) > 0) as unknown as AgentChatMessage[]),

  ]


  // Build conversation context from ALL user messages in the window,
  // not just the latest one. This ensures follow-ups like "yeah reply"
  // retain Gmail tools from earlier turns. (Bug 1.6 fix)
  const conversationText = recentMessages
    .filter((m) => m.role === 'user')
    .flatMap((m) => (m.parts ?? []).filter((p) => p.type === 'text').map((p) => (p as { text: string }).text))
    .join('\n')

  const modelId = resolveAgentModelId({
    personaId: persona.id,
    runType: 'chat_message',
    channel: 'chat',
  })
  const agent = getAgentForPersona(agentId, {
    modelId,
    channel: 'chat',
    runType: 'chat_message',
    prompt: conversationText,
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

            try {
              const outputText = getMessageTextContent(responseMessage as AgentChatMessage)
              const calledToolNames = stepTrace.flatMap((step) => step.toolNames)

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
                  `[agent-route] Announced action mismatch (${mismatchResult.reason}): announced ${
                    mismatchResult.announcedProviders.join(', ') || 'unspecified'
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

      const mergeAgentStream = (agentStream: unknown) => {
        writer.merge(
          agentStream as AsyncIterableStream<InferUIMessageChunk<AgentChatMessage>>
        )
      }

      try {
        mergeAgentStream(await startAgentStream(agent))
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
            mergeAgentStream(await startAgentStream(fallbackAgent))
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
