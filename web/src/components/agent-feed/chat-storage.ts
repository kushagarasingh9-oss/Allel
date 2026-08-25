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
  if (!trustedHistory) return false

  return (
    trustedHistory.version === 1 &&
    trustedHistory.workspaceId === options.workspaceId &&
    trustedHistory.personaId === options.personaId &&
    typeof trustedHistory.contentSha256 === "string" &&
    trustedHistory.contentSha256.length > 0 &&
    typeof trustedHistory.signature === "string" &&
    trustedHistory.signature.length > 0
  )
}

function buildChatSessionStorageKey(scope: ChatStorageScope) {
  return `allel.chat-session.${AGENT_CHAT_STORAGE_VERSION}:${scope.userId}:${scope.workspaceId}`
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
    return window.localStorage || window.sessionStorage
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
  return `allel.persona-threads.${AGENT_CHAT_STORAGE_VERSION}:${scope.userId}:${scope.workspaceId}:${scope.sessionId}`
}

export function buildLastPersonaStorageKey(scope: ResolvedChatStorageScope) {
  return `allel.last-persona.${AGENT_CHAT_STORAGE_VERSION}:${scope.userId}:${scope.workspaceId}:${scope.sessionId}`
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

/**
 * Merge a locally cached thread with the server's copy, server-first.
 *
 * The server record is canonical: `chat-memory.ts` merges server-first when
 * persisting, and the local copy is lossy by design — `sanitizeStoredPersonaMessages`
 * drops any assistant message whose signature is missing, version-mismatched, or
 * scoped to another workspace. Letting a partially-signed local copy win is what
 * made reloads lose earlier turns.
 *
 * Local messages are not discarded outright though: a turn appended after the
 * last successful save exists only locally, and dropping it would lose the
 * founder's most recent message. So server ordering is preserved and local-only
 * messages are appended after it.
 *
 * Pure, so the merge is testable without React.
 */
export function reconcileConversationHistory<T extends { id?: string; role?: string; parts?: unknown[]; content?: unknown }>(
  localMessages: readonly T[],
  serverMessages: readonly T[]
): T[] {
  if (serverMessages.length === 0) return [...localMessages]
  if (localMessages.length === 0) return [...serverMessages]

  const serverIds = new Set(
    serverMessages
      .map((message) => message.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  )

  const getMessageText = (m: T): string => {
    if (Array.isArray(m.parts)) {
      return (m.parts as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join(" ")
        .trim()
    }
    if (typeof m.content === "string") return m.content.trim()
    return ""
  }

  const serverAssistantTexts = new Set(
    serverMessages
      .filter((m) => m.role === "assistant")
      .map((m) => getMessageText(m))
      .filter((t) => t.length > 0)
  )

  // A local message with no id cannot be matched, so it is treated as local-only
  // rather than silently dropped, unless it's an assistant message whose text is already in server record.
  const localOnly = localMessages.filter((message) => {
    if (typeof message.id === "string" && serverIds.has(message.id)) {
      return false
    }
    if (message.role === "assistant") {
      const text = getMessageText(message)
      if (text.length > 0 && serverAssistantTexts.has(text)) {
        return false
      }
    }
    return true
  })

  return [...serverMessages, ...localOnly]
}
