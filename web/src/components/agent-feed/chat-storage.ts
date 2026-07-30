import type { UIMessage } from "ai"
import type { PersonaId } from "@/lib/agent/personas"
import {
  AGENT_CHAT_STORAGE_VERSION,
  buildAgentChatId,
  buildAgentChatStorageScope,
  LEGACY_AGENT_CHAT_SESSION_ID,
  sanitizeAgentChatSessionId,
  type AgentChatScope,
} from "@/lib/agent/chat-session"

export type ChatStorageScope = {
  userId: string
  workspaceId: string
}

export type ResolvedChatStorageScope = AgentChatScope

type StoredTrustedHistory = {
  version: 1
  workspaceId: string
  personaId: PersonaId
  contentSha256: string
  signature: string
}

type StoredMessageMetadata = {
  trustedHistory?: StoredTrustedHistory
}

type StoredUIMessage = UIMessage<StoredMessageMetadata>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isStoredUIMessage(value: unknown): value is StoredUIMessage {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string") return false
  if (value.role !== "user" && value.role !== "assistant") return false
  if (!Array.isArray(value.parts)) return false
  return true
}

function hasScopedTrustedHistory(
  message: StoredUIMessage,
  options: {
    workspaceId: string
    personaId: PersonaId
  }
) {
  const trustedHistory = message.metadata?.trustedHistory

  return (
    trustedHistory?.version === 1 &&
    trustedHistory.workspaceId === options.workspaceId &&
    trustedHistory.personaId === options.personaId &&
    typeof trustedHistory.contentSha256 === "string" &&
    trustedHistory.contentSha256.length > 0 &&
    typeof trustedHistory.signature === "string" &&
    trustedHistory.signature.length > 0
  )
}

function buildChatSessionStorageKey(scope: ChatStorageScope) {
  return `cofounder.chat-session.${AGENT_CHAT_STORAGE_VERSION}:${scope.userId}:${scope.workspaceId}`
}

function getFallbackSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `session-${Date.now().toString(36)}`
}

function getSessionStorage() {
  if (typeof window === "undefined") return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function resolveChatStorageScope(
  scope: ChatStorageScope | null | undefined
): ResolvedChatStorageScope | null {
  if (!scope) return null

  const storage = getSessionStorage()

  if (!storage) {
    return buildAgentChatStorageScope(scope, LEGACY_AGENT_CHAT_SESSION_ID)
  }

  const storageKey = buildChatSessionStorageKey(scope)
  const existingSessionId = sanitizeAgentChatSessionId(storage.getItem(storageKey))
  const sessionId = existingSessionId ?? getFallbackSessionId()

  if (!existingSessionId) {
    storage.setItem(storageKey, sessionId)
  }

  return buildAgentChatStorageScope(scope, sessionId)
}

export function buildPersonaThreadStorageKey(scope: ResolvedChatStorageScope) {
  return `cofounder.persona-threads.${AGENT_CHAT_STORAGE_VERSION}:${scope.userId}:${scope.workspaceId}:${scope.sessionId}`
}

export function buildLastPersonaStorageKey(scope: ResolvedChatStorageScope) {
  return `cofounder.last-persona.${AGENT_CHAT_STORAGE_VERSION}:${scope.userId}:${scope.workspaceId}:${scope.sessionId}`
}

export function buildPersonaThreadChatId(
  personaId: PersonaId,
  scope: ResolvedChatStorageScope | null | undefined
) {
  if (!scope) {
    return buildAgentChatId({
      userId: "anonymous",
      workspaceId: "anonymous",
      sessionId: LEGACY_AGENT_CHAT_SESSION_ID,
      personaId,
    })
  }

  return buildAgentChatId({
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    sessionId: scope.sessionId,
    personaId,
  })
}

export function sanitizeStoredPersonaMessages(
  messages: unknown,
  options: {
    workspaceId: string
    personaId: PersonaId
  }
) {
  if (!Array.isArray(messages)) {
    return [] as StoredUIMessage[]
  }

  return messages.filter((message): message is StoredUIMessage => {
    if (!isStoredUIMessage(message)) return false
    if (message.role === "user") return true
    return hasScopedTrustedHistory(message, options)
  })
}
