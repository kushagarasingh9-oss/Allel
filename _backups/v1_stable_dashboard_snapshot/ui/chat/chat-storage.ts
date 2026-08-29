import type { UIMessage } from "ai"
import type { PersonaId } from "@/agent/personas/personas"
import {
  AGENT_CHAT_STORAGE_VERSION,
  buildAgentChatId,
  buildAgentChatStorageScope,
  LEGACY_AGENT_CHAT_SESSION_ID,
  sanitizeAgentChatSessionId,
  type AgentChatScope,
} from "@/agent/memory/chat-session"

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
  options?: {
    workspaceId?: string
    personaId?: PersonaId
  }
) {
  const trustedHistory = message.metadata?.trustedHistory
  if (!trustedHistory) return false

  return (
    trustedHistory.version === 1 &&
    (!options?.workspaceId || trustedHistory.workspaceId === options.workspaceId) &&
    (!options?.personaId || trustedHistory.personaId === options.personaId) &&
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

  const storageKey = buildChatSessionStorageKey(scope)
  let existingSessionId: string | null = null

  if (typeof window !== "undefined") {
    try {
      existingSessionId = sanitizeAgentChatSessionId(
        window.sessionStorage?.getItem(storageKey) ||
        window.localStorage?.getItem(storageKey) ||
        window.sessionStorage?.getItem("allel.current-session-id") ||
        window.localStorage?.getItem("allel.current-session-id")
      )
    } catch {
      // ignore
    }
  }

  const sessionId = existingSessionId ?? getFallbackSessionId()

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage?.setItem(storageKey, sessionId)
      window.localStorage?.setItem(storageKey, sessionId)
      window.sessionStorage?.setItem("allel.current-session-id", sessionId)
      window.localStorage?.setItem("allel.current-session-id", sessionId)
    } catch {
      // ignore
    }
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
  _options?: {
    workspaceId?: string
    personaId?: PersonaId
  }
) {
  if (!Array.isArray(messages)) {
    return [] as StoredUIMessage[]
  }

  // Preserve ALL messages — both user and assistant — in the local cache.
  // The old approach dropped assistant messages missing a trusted HMAC
  // signature (`trustedHistory`). That was over-aggressive: sessionStorage
  // is a UI-only cache, not a security boundary. The real HMAC check
  // happens server-side in `sanitizeClientUiMessages`. Dropping assistants
  // here meant local restore produced user-only arrays, and subsequent
  // reconciliation with the server record grouped user messages at the top
  // with assistant responses stacked below — instead of proper interleaving.
  return messages.filter((message): message is StoredUIMessage => {
    return isStoredUIMessage(message)
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

  const serverUserTexts = new Set(
    serverMessages
      .filter((m) => m.role === "user")
      .map((m) => getMessageText(m))
      .filter((t) => t.length > 0)
  )

  const serverAssistantTexts = new Set(
    serverMessages
      .filter((m) => m.role === "assistant")
      .map((m) => getMessageText(m))
      .filter((t) => t.length > 0)
  )

  // A local message with no id cannot be matched, so it is treated as local-only
  // rather than silently dropped, unless its text is already in server record.
  const localOnly = localMessages.filter((message) => {
    if (typeof message.id === "string" && serverIds.has(message.id)) {
      return false
    }
    const text = getMessageText(message)
    if (text.length > 0) {
      if (message.role === "assistant" && serverAssistantTexts.has(text)) {
        return false
      }
      if (message.role === "user" && serverUserTexts.has(text)) {
        return false
      }
    }
    return true
  })

  return [...serverMessages, ...localOnly]
}
