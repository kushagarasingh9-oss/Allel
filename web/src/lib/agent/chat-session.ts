import type { PersonaId } from './personas'

export const AGENT_CHAT_STORAGE_VERSION = 'v3'
export const LEGACY_AGENT_CHAT_SESSION_ID = 'legacy'

const AGENT_CHAT_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/

type AgentChatBody = {
  id?: unknown
  sessionId?: unknown
}

export type AgentChatScope = {
  userId: string
  workspaceId: string
  sessionId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function sanitizeAgentChatSessionId(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!AGENT_CHAT_SESSION_ID_PATTERN.test(trimmed)) {
    return null
  }

  return trimmed
}

export function buildAgentChatStorageScope(
  scope: Pick<AgentChatScope, 'userId' | 'workspaceId'>,
  sessionId: string
): AgentChatScope {
  return {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    sessionId:
      sanitizeAgentChatSessionId(sessionId) ?? LEGACY_AGENT_CHAT_SESSION_ID,
  }
}

export function buildAgentChatId(options: {
  userId: string
  workspaceId: string
  sessionId: string
  personaId: PersonaId
}) {
  return [
    'persona-thread',
    options.userId,
    options.workspaceId,
    sanitizeAgentChatSessionId(options.sessionId) ??
      LEGACY_AGENT_CHAT_SESSION_ID,
    options.personaId,
  ].join(':')
}

export function extractSessionIdFromAgentChatId(chatId: unknown) {
  if (typeof chatId !== 'string') return null

  const [prefix, userId, workspaceId, sessionId, personaId, ...rest] =
    chatId.split(':')

  if (rest.length > 0) return null
  if (prefix !== 'persona-thread') return null
  if (!userId || !workspaceId || !personaId) return null

  return sanitizeAgentChatSessionId(sessionId)
}

export function resolveAgentConversationSessionId(body: unknown) {
  if (!isRecord(body)) {
    return LEGACY_AGENT_CHAT_SESSION_ID
  }

  const candidate = body as AgentChatBody

  return (
    sanitizeAgentChatSessionId(candidate.sessionId) ??
    extractSessionIdFromAgentChatId(candidate.id) ??
    LEGACY_AGENT_CHAT_SESSION_ID
  )
}
