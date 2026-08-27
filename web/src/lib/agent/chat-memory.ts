import type { UIMessage } from 'ai'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getMessageTextContent,
  sanitizePersistedDatabaseMessages,
  type TrustedMessageMetadata,
} from './ui-message-utils'
import type { PersonaId } from './personas'

export type TrustedUIMessage = UIMessage<TrustedMessageMetadata>

export const MAX_PERSISTED_AGENT_MESSAGES = 40
export const MAX_COMPACTED_SUMMARY_CHARS = 1_800
export const MAX_COMPACTED_GOALS = 3
export const MAX_COMPACTED_ACCOUNT_IDS = 4

type ConversationHistoryOptions = {
  workspaceId: string
  userId: string
  personaId: PersonaId
  sessionId: string
}

type PersistedConversationMemoryRow = {
  conversation_summary: string | null
  summary_message_count: number | null
  last_compacted_at: string | null
  account_context: unknown
  last_user_message_at?: string | null
  last_assistant_message_at?: string | null
}

export type ConversationAccountContext = {
  mentionedAccountIds: string[]
  recentUserGoals: string[]
  assistantCommitments: string[]
}

export type ConversationMemorySnapshot = {
  summary: string
  summaryMessageCount: number
  lastCompactedAt: string | null
  accountContext: ConversationAccountContext
  lastUserMessageAt: string | null
  lastAssistantMessageAt: string | null
}

function isMissingAgentConversationTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string; message?: string }

  return (
    candidate.code === 'PGRST205' ||
    candidate.message?.includes('agent_conversations') === true
  )
}

function isMissingAgentConversationColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { message?: string }

  return (
    candidate.message?.includes('conversation_summary') === true ||
    candidate.message?.includes('summary_message_count') === true ||
    candidate.message?.includes('last_compacted_at') === true ||
    candidate.message?.includes('account_context') === true
  )
}

function isMissingAgentConversationSessionColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { message?: string }

  return candidate.message?.includes('session_id') === true
}

function dedupeMessages(messages: TrustedUIMessage[]) {
  const deduped: TrustedUIMessage[] = []
  const seenIds = new Set<string>()

  for (const message of messages) {
    if (seenIds.has(message.id)) continue

    // Drop consecutive same-role messages with identical text content.
    // These arise when the fallback synthesis duplicates a response that
    // was also streamed by the model in the same turn.
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1]
      if (prev.role === message.role) {
        const prevText = getMessageTextContent(prev).trim()
        const curText = getMessageTextContent(message).trim()
        if (prevText.length > 0 && prevText === curText) {
          // Keep the one with more parts (tool results, etc.)
          const prevParts = prev.parts?.length ?? 0
          const curParts = message.parts?.length ?? 0
          if (curParts > prevParts) {
            deduped[deduped.length - 1] = message
          }
          seenIds.add(message.id)
          continue
        }
      }
    }

    deduped.push(message)
    seenIds.add(message.id)
  }

  return deduped
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3).trimEnd()}...`
}

function coerceStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0)
    : []
}

function normalizeAccountContext(value: unknown): ConversationAccountContext {
  if (!value || typeof value !== 'object') {
    return {
      mentionedAccountIds: [],
      recentUserGoals: [],
      assistantCommitments: [],
    }
  }

  const candidate = value as Record<string, unknown>

  return {
    mentionedAccountIds: coerceStringList(candidate.mentionedAccountIds).slice(
      0,
      MAX_COMPACTED_ACCOUNT_IDS
    ),
    recentUserGoals: coerceStringList(candidate.recentUserGoals).slice(
      0,
      MAX_COMPACTED_GOALS
    ),
    assistantCommitments: coerceStringList(candidate.assistantCommitments).slice(
      0,
      MAX_COMPACTED_GOALS
    ),
  }
}

function uniqueRecent(values: string[], maxItems: number) {
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = normalizeWhitespace(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }

  return deduped.slice(-maxItems)
}

function extractMessageText(message: TrustedUIMessage) {
  return truncateText(normalizeWhitespace(getMessageTextContent(message)), 220)
}

export function extractConversationAccountIds(messages: TrustedUIMessage[]) {
  const uuidPattern =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  const ids = new Set<string>()

  for (const message of messages) {
    const text = getMessageTextContent(message)
    const matches = text.match(uuidPattern)
    if (!matches) continue

    for (const match of matches) {
      ids.add(match.toLowerCase())
    }
  }

  return [...ids].slice(0, MAX_COMPACTED_ACCOUNT_IDS)
}

function buildSummaryChunk(messages: TrustedUIMessage[]) {
  const compactedMessages = messages
    .map((message) => ({
      role: message.role,
      text: extractMessageText(message),
    }))
    .filter((message) => message.text.length > 0)

  if (compactedMessages.length === 0) {
    return ''
  }

  const recentUserGoals = uniqueRecent(
    compactedMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.text),
    MAX_COMPACTED_GOALS
  )
  const assistantCommitments = uniqueRecent(
    compactedMessages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.text),
    MAX_COMPACTED_GOALS
  )

  const lines: string[] = []

  if (recentUserGoals.length > 0) {
    lines.push(`User focus: ${recentUserGoals.join(' | ')}`)
  }

  if (assistantCommitments.length > 0) {
    lines.push(`Assistant context: ${assistantCommitments.join(' | ')}`)
  }

  return truncateText(lines.join('\n'), 900)
}

function mergeConversationSummary(existingSummary: string | null, nextChunk: string) {
  const pieces = [existingSummary?.trim(), nextChunk.trim()].filter(Boolean)

  if (pieces.length === 0) {
    return ''
  }

  return truncateText(pieces.join('\n'), MAX_COMPACTED_SUMMARY_CHARS)
}

function mergeConversationAccountContext(
  existing: ConversationAccountContext,
  messages: TrustedUIMessage[]
) {
  const nextMentionedAccountIds = [
    ...existing.mentionedAccountIds,
    ...extractConversationAccountIds(messages),
  ]

  const nextUserGoals = [
    ...existing.recentUserGoals,
    ...messages
      .filter((message) => message.role === 'user')
      .map((message) => extractMessageText(message)),
  ]

  const nextAssistantCommitments = [
    ...existing.assistantCommitments,
    ...messages
      .filter((message) => message.role === 'assistant')
      .map((message) => extractMessageText(message)),
  ]

  return {
    mentionedAccountIds: uniqueRecent(
      nextMentionedAccountIds,
      MAX_COMPACTED_ACCOUNT_IDS
    ),
    recentUserGoals: uniqueRecent(nextUserGoals, MAX_COMPACTED_GOALS),
    assistantCommitments: uniqueRecent(
      nextAssistantCommitments,
      MAX_COMPACTED_GOALS
    ),
  }
}

export function trimConversationHistory(
  messages: TrustedUIMessage[],
  maxMessages: number = MAX_PERSISTED_AGENT_MESSAGES
) {
  if (messages.length <= maxMessages) {
    return messages
  }

  const trimmed = messages.slice(-maxMessages)
  const firstUserMessageIndex = trimmed.findIndex(
    (message) => message.role === 'user'
  )

  if (firstUserMessageIndex <= 0) {
    return trimmed
  }

  return trimmed.slice(firstUserMessageIndex)
}

export function compactConversationState(options: {
  messages: TrustedUIMessage[]
  existingSummary?: string | null
  existingSummaryMessageCount?: number | null
  existingAccountContext?: ConversationAccountContext
  maxMessages?: number
}) {
  const deduped = dedupeMessages(options.messages)
  const trimmedMessages = trimConversationHistory(
    deduped,
    options.maxMessages ?? MAX_PERSISTED_AGENT_MESSAGES
  )

  const compactedMessageCount = deduped.length - trimmedMessages.length
  const compactedMessages =
    compactedMessageCount > 0 ? deduped.slice(0, compactedMessageCount) : []
  const existingAccountContext = options.existingAccountContext ?? {
    mentionedAccountIds: [],
    recentUserGoals: [],
    assistantCommitments: [],
  }
  const nextSummaryChunk = buildSummaryChunk(compactedMessages)
  const nextSummary =
    compactedMessages.length > 0
      ? mergeConversationSummary(options.existingSummary ?? null, nextSummaryChunk)
      : options.existingSummary?.trim() ?? ''
  const nextAccountContext =
    compactedMessages.length > 0
      ? mergeConversationAccountContext(existingAccountContext, compactedMessages)
      : mergeConversationAccountContext(existingAccountContext, trimmedMessages)

  return {
    trimmedMessages,
    summary: nextSummary,
    summaryMessageCount:
      (options.existingSummaryMessageCount ?? 0) + compactedMessages.length,
    lastCompactedAt: compactedMessages.length > 0 ? new Date().toISOString() : null,
    accountContext: nextAccountContext,
    compactedMessageCount,
  }
}

export function mergeConversationHistory(options: {
  persistedMessages: TrustedUIMessage[]
  incomingMessages: TrustedUIMessage[]
}) {
  const { persistedMessages, incomingMessages } = options

  if (persistedMessages.length === 0) {
    return trimConversationHistory(dedupeMessages(incomingMessages))
  }

  if (incomingMessages.length === 0) {
    return trimConversationHistory(dedupeMessages(persistedMessages))
  }

  // Server-first merge: treat persisted messages as the canonical truth.
  // Only append incoming messages whose IDs are not already in the
  // persisted set. This prevents the old overlap-based slice from
  // accidentally dropping assistant messages when the overlap index
  // resolves to 0 (first message).
  const persistedIds = new Set(
    persistedMessages.map((message) => message.id)
  )

  const newIncoming = incomingMessages.filter(
    (message) => !persistedIds.has(message.id)
  )

  const merged = [...persistedMessages, ...newIncoming]

  return trimConversationHistory(dedupeMessages(merged))
}

async function selectConversationRow<T>(
  options: ConversationHistoryOptions,
  select: string
) {
  const supabase = createServiceClient()

  const runQuery = async (includeSessionId: boolean) => {
    let query = supabase
      .from('agent_conversations')
      .select(select)
      .eq('workspace_id', options.workspaceId)
      .eq('user_id', options.userId)
      .eq('persona_id', options.personaId)

    if (includeSessionId) {
      query = query.eq('session_id', options.sessionId)
    }

    return query.maybeSingle<T>()
  }

  const result = await runQuery(true)

  if (result.error && isMissingAgentConversationSessionColumnError(result.error)) {
    return runQuery(false)
  }

  return result
}

export async function getPersistedConversationHistory(
  options: ConversationHistoryOptions
) {
  const { data, error } = await selectConversationRow<{
    message_history: unknown
  }>(options, 'message_history')

  if (error) {
    if (isMissingAgentConversationTableError(error)) {
      console.warn(
        '[agent-chat-memory] agent_conversations table is unavailable; continuing without persisted history'
      )
      return []
    }

    throw error
  }

  return sanitizePersistedDatabaseMessages(data?.message_history ?? [])
}

export async function getPersistedConversationMemory(
  options: ConversationHistoryOptions
): Promise<ConversationMemorySnapshot | null> {
  const { data, error } = await selectConversationRow<PersistedConversationMemoryRow>(
    options,
    'conversation_summary, summary_message_count, last_compacted_at, account_context, last_user_message_at, last_assistant_message_at'
  )

  if (error) {
    if (
      isMissingAgentConversationTableError(error) ||
      isMissingAgentConversationColumnError(error) ||
      isMissingAgentConversationSessionColumnError(error)
    ) {
      return null
    }

    throw error
  }

  if (!data) return null

  return {
    summary: data.conversation_summary?.trim() ?? '',
    summaryMessageCount: data.summary_message_count ?? 0,
    lastCompactedAt: data.last_compacted_at ?? null,
    accountContext: normalizeAccountContext(data.account_context),
    lastUserMessageAt: data.last_user_message_at ?? null,
    lastAssistantMessageAt: data.last_assistant_message_at ?? null,
  }
}

export function buildConversationMemorySystemPrompt(
  memory: ConversationMemorySnapshot | null
) {
  if (!memory) return null

  const lines = [
    'Conversation memory from earlier messages. Use it for continuity, but prioritize the newest user request and live tool data.',
  ]

  if (memory.summaryMessageCount > 0) {
    lines.push(
      `Compacted earlier messages: ${memory.summaryMessageCount}.`
    )
  }

  if (memory.summary.length > 0) {
    lines.push(`Prior context:\n${memory.summary}`)
  }

  if (memory.accountContext.recentUserGoals.length > 0) {
    lines.push(
      `Persistent user goals: ${memory.accountContext.recentUserGoals.join(' | ')}`
    )
  }

  if (memory.accountContext.assistantCommitments.length > 0) {
    lines.push(
      `Prior assistant commitments: ${memory.accountContext.assistantCommitments.join(
        ' | '
      )}`
    )
  }

  if (memory.accountContext.mentionedAccountIds.length > 0) {
    lines.push(
      `Mentioned account IDs: ${memory.accountContext.mentionedAccountIds.join(', ')}`
    )
  }

  return lines.join('\n\n')
}

export function getConversationActivityTimestamps(
  messages: TrustedUIMessage[],
  existingMemory: ConversationMemorySnapshot | null,
  nowIso: string
) {
  const hasUserMessage = messages.some((message) => message.role === 'user')
  const hasAssistantMessage = messages.some((message) => message.role === 'assistant')

  return {
    lastUserMessageAt: hasUserMessage
      ? nowIso
      : existingMemory?.lastUserMessageAt ?? null,
    lastAssistantMessageAt: hasAssistantMessage
      ? nowIso
      : existingMemory?.lastAssistantMessageAt ?? null,
  }
}

export async function saveConversationHistory(
  options: ConversationHistoryOptions & {
    messages: TrustedUIMessage[]
  }
) {
  const supabase = createServiceClient()
  const existingMemory = await getPersistedConversationMemory(options)
  const compacted = compactConversationState({
    messages: options.messages,
    existingSummary: existingMemory?.summary ?? '',
    existingSummaryMessageCount: existingMemory?.summaryMessageCount ?? 0,
    existingAccountContext: existingMemory?.accountContext,
  })
  const nowIso = new Date().toISOString()
  const { lastUserMessageAt, lastAssistantMessageAt } =
    getConversationActivityTimestamps(
      compacted.trimmedMessages,
      existingMemory,
      nowIso
    )

  const basePayload = {
    workspace_id: options.workspaceId,
    user_id: options.userId,
    persona_id: options.personaId,
    session_id: options.sessionId,
    message_history: compacted.trimmedMessages,
    last_user_message_at: lastUserMessageAt,
    last_assistant_message_at: lastAssistantMessageAt,
  }

  const extendedPayload = {
    ...basePayload,
    conversation_summary: compacted.summary,
    summary_message_count: compacted.summaryMessageCount,
    last_compacted_at:
      compacted.lastCompactedAt ?? existingMemory?.lastCompactedAt ?? null,
    account_context: compacted.accountContext,
  }

  let { error } = await supabase
    .from('agent_conversations')
    .upsert(extendedPayload, {
      onConflict: 'workspace_id,user_id,persona_id,session_id',
    })

  if (error && isMissingAgentConversationSessionColumnError(error)) {
    const { session_id, ...legacyExtendedPayload } = extendedPayload
    void session_id
    const fallback = await supabase
      .from('agent_conversations')
      .upsert(legacyExtendedPayload, {
        onConflict: 'workspace_id,user_id,persona_id',
      })
    error = fallback.error
  }

  if (error && isMissingAgentConversationColumnError(error)) {
    const { session_id, ...legacyBasePayload } = basePayload
    void session_id
    const fallback = await supabase
      .from('agent_conversations')
      .upsert(legacyBasePayload, {
        onConflict: 'workspace_id,user_id,persona_id',
      })
    error = fallback.error
  }

  if (error) {
    if (isMissingAgentConversationTableError(error)) {
      console.warn(
        '[agent-chat-memory] agent_conversations table is unavailable; skipping conversation persistence'
      )
      return
    }

    throw error
  }
}

export async function clearPersistedConversationHistory(
  options: ConversationHistoryOptions
) {
  const supabase = createServiceClient()
  let { error } = await supabase
    .from('agent_conversations')
    .delete()
    .eq('workspace_id', options.workspaceId)
    .eq('user_id', options.userId)
    .eq('persona_id', options.personaId)
    .eq('session_id', options.sessionId)

  if (error && isMissingAgentConversationSessionColumnError(error)) {
    const fallback = await supabase
      .from('agent_conversations')
      .delete()
      .eq('workspace_id', options.workspaceId)
      .eq('user_id', options.userId)
      .eq('persona_id', options.personaId)
    error = fallback.error
  }

  if (!error) {
    return
  }

  if (isMissingAgentConversationTableError(error)) {
    console.warn(
      '[agent-chat-memory] agent_conversations table is unavailable; skipping conversation reset'
    )
    return
  }

  throw error
}
