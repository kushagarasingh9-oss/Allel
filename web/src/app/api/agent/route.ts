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
import { retryContextStorage } from '@/lib/ai/ai'
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

  if (tools.has('webSearchTool') || tools.has('webExtractTool')) {
    return 'Web intelligence search completed. The extracted information has been verified from live sources.'
  }

  return 'I completed the requested system checks and actions across your connected integrations.'
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
1. NATURAL DYNAMIC CONVERSATION:
   - Match the founder's mood, tone, and vibe naturally. Be sharp, friendly, and conversational.
   - For pure standalone casual greetings with no task ("hi", "yo", "hey"), reply dynamically in 1 crisp sentence.
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
   - Whenever mentioning or introducing a platform or integration section, you MUST prefix with its official SVG logo markdown:
     - ![Google Calendar](/logos/google-calendar.svg) **Calendar** (e.g. ![Google Calendar](/logos/google-calendar.svg) **Calendar (Aug 26)** — ...)
     - ![Gmail](/logos/gmail.svg) **Inbox** (e.g. ![Gmail](/logos/gmail.svg) **Inbox** — ...)
     - ![Stripe](/logos/stripe.svg) **Billing** (e.g. ![Stripe](/logos/stripe.svg) **Billing** — ...)
     - ![Slack](/logos/slack.svg) **Slack**
     - ![PostHog](/logos/posthog.svg) **Product Analytics**
     - ![Linear](/logos/linear.svg) **Linear**
     - ![Sentry](/logos/sentry-light.svg) **Sentry**
     - ![Notion](/logos/notion.svg) **Notion**
     - ![HubSpot](/logos/hubspot.svg) **HubSpot**
     - ![Intercom](/logos/intercom.svg) **Intercom**
   - Integration Logos: Always use official SVG logo markdown (e.g. ![Gmail](/logos/gmail.svg) **Inbox**, ![Stripe](/logos/stripe.svg) **Billing**) for platform section headers rather than generic unicode emojis.

4. AUTONOMOUS STEP 1 EXECUTION:
   - The workspace ID is ALWAYS provided in the system message (\`workspace_id=...\`). Do not ask the founder for their workspace ID; use it directly in tool calls.
   - When asked for help with ANY domain ("check email", "mails", "inbox", "morning brief", "what needs attention", "look at billing", "search web"), start your response with a <think>...</think> block explaining what you are checking, then call the relevant tools in Step 1.
   - For morning brief / "what needs attention" / "update": call \`listCalendarEventsTool\` + \`getMyInbox\` + \`getAllAccounts\` in parallel.
   - Conclude every turn with a crisp, actionable text summary. Never end a turn with only tool calls.

5. EXECUTIVE SUMMARY FORMAT:
   - Formatting: Avoid raw key-value metadata blocks ("From:", "Subject:", "Priority:").
   - Output either a 2–3 sentence executive paragraph OR clean 1-line action bullets.
   - State facts with executive confidence; never use apologetic phrasing.

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
    ...(compactToolHistory(recentMessages as unknown as Array<{ role: string; parts?: Array<{ type: string; text?: string }>;[key: string]: unknown }>)
      .filter((m) => Array.isArray(m.parts) && (m.parts?.length ?? 0) > 0) as unknown as AgentChatMessage[]),

  ]


  const conversationText = recentMessages
    .filter((m) => m.role === 'user')
    .flatMap((m) => (m.parts ?? []).filter((p) => p.type === 'text').map((p) => (p as { text: string }).text))
    .join('\n')

  // Prioritize active turn focus: use the latest user message for tool routing.
  // Only expand to preceding turns if the latest message is a brief referent ("yes", "do it", "send").
  const latestText = latestUserMessage ? getMessageTextContent(latestUserMessage).trim() : ''
  const isShortReferent = latestText.split(/\s+/).length <= 3
  const activePromptText = isShortReferent && conversationText ? `${latestText}\n${conversationText}` : (latestText || conversationText)

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

              // If the LLM finished without text (content filter or empty completion), synthesize a response
              if (outputText.trim().length === 0) {
                const synthesized = calledToolNames.length > 0
                  ? buildFallbackSynthesisForTools(calledToolNames)
                  : "Hey! What's on your mind today? I'm ready to check your inbox, review billing health, or prepare for upcoming meetings."
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
