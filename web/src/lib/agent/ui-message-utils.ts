import { createHash, createHmac } from "crypto"
import type { UIMessage } from "ai"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAllowedRole(role: unknown): role is UIMessage["role"] {
  return role === "user" || role === "assistant"
}

export type TrustedMessageMetadata = {
  trustedHistory?: {
    version: 1
    workspaceId: string
    personaId: string
    contentSha256: string
    signature: string
  }
  /**
   * Set when the reply promised an action the turn did not perform, or performed
   * against a different provider than it announced.
   *
   * A sibling of `trustedHistory`, not part of it: the signature covers
   * `{ id, role, parts }`, so adding this does not affect verification. It is a
   * server observation about the turn, used only to render the turn honestly —
   * never trusted as input.
   */
  announcedActionMismatch?: {
    reason: 'no_tool_calls' | 'wrong_domain'
    announcedProviders: string[]
    calledProviders: string[]
  }
}

type MessageSanitizationContext = {
  workspaceId: string
  personaId: string
}

type TrustedUIMessage = UIMessage<TrustedMessageMetadata>

export function getMessageTextContent(message: UIMessage) {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text"
      )
      .map((part) => part.text)
      .join("\n")
  }
  
  if ('content' in message && typeof message.content === 'string') {
    return message.content
  }
  
  return ""
}

function getHistorySigningSecret() {
  const dedicatedSecret = process.env.AGENT_HISTORY_SIGNING_SECRET

  if (dedicatedSecret) return dedicatedSecret

  // Falling back to the model API key couples conversation memory to an
  // unrelated credential: rotating the OpenAI key silently invalidates every
  // stored assistant message. Acceptable for local development, never in
  // production — fail loudly at boot instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing AGENT_HISTORY_SIGNING_SECRET. Generate one with `openssl rand -hex 32`. " +
        "Do not rely on the OPENAI_API_KEY fallback in production: rotating that key " +
        "would invalidate all stored assistant history."
    )
  }

  const fallbackSecret = process.env.OPENAI_API_KEY

  if (!fallbackSecret) {
    throw new Error(
      "Missing AGENT_HISTORY_SIGNING_SECRET or OPENAI_API_KEY for agent history verification"
    )
  }

  return fallbackSecret
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSignature(item))
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))

    return Object.fromEntries(
      sortedEntries.map(([key, entryValue]) => [
        key,
        normalizeForSignature(entryValue),
      ])
    )
  }

  return value
}

function getAssistantMessageCanonicalPayload(message: TrustedUIMessage) {
  return JSON.stringify(
    normalizeForSignature({
      id: message.id,
      role: message.role,
      parts: message.parts,
    })
  )
}

function getAssistantMessageContentSha256(message: TrustedUIMessage) {
  return createHash("sha256")
    .update(getAssistantMessageCanonicalPayload(message))
    .digest("hex")
}

function signAssistantMessage(options: {
  workspaceId: string
  personaId: string
  message: TrustedUIMessage
}) {
  const contentSha256 = getAssistantMessageContentSha256(options.message)
  const signaturePayload = [
    options.workspaceId,
    options.personaId,
    options.message.id,
    contentSha256,
  ].join(":")

  const signature = createHmac("sha256", getHistorySigningSecret())
    .update(signaturePayload)
    .digest("hex")

  return {
    contentSha256,
    signature,
  }
}

export function buildTrustedMessageMetadata(options: {
  workspaceId: string
  personaId: string
  message: TrustedUIMessage
}): TrustedMessageMetadata {
  const { contentSha256, signature } = signAssistantMessage(options)

  return {
    trustedHistory: {
      version: 1,
      workspaceId: options.workspaceId,
      personaId: options.personaId,
      contentSha256,
      signature,
    },
  }
}

function hasValidTrustedMetadata(
  message: TrustedUIMessage,
  context: MessageSanitizationContext
) {
  const trustedHistory = message.metadata?.trustedHistory
  if (!trustedHistory) return false
  if (trustedHistory.version !== 1) return false
  if (trustedHistory.workspaceId !== context.workspaceId) return false
  if (trustedHistory.personaId !== context.personaId) return false

  const { contentSha256, signature } = signAssistantMessage({
    workspaceId: context.workspaceId,
    personaId: context.personaId,
    message,
  })

  return (
    trustedHistory.contentSha256 === contentSha256 &&
    trustedHistory.signature === signature
  )
}

export type SanitizationOutcome = {
  messages: TrustedUIMessage[]
  /** Assistant messages dropped because their signature did not verify. */
  rejectedAssistantCount: number
}

/**
 * Same filtering as `sanitizeClientUiMessages`, but reports what it dropped.
 *
 * The count matters because signature failure is silent and total: if
 * `AGENT_HISTORY_SIGNING_SECRET` changes — including the implicit change from
 * rotating `OPENAI_API_KEY`, which it falls back to — every stored assistant
 * message stops verifying and the conversation reads as user messages only. The
 * rows are still intact in the database; only verification fails. Without a
 * count that looks like the agent forgetting rather than a config change.
 */
export function sanitizeClientUiMessagesWithOutcome(
  messages: unknown,
  context?: MessageSanitizationContext
): SanitizationOutcome {
  if (!Array.isArray(messages)) return { messages: [], rejectedAssistantCount: 0 }

  let rejectedAssistantCount = 0

  const sanitized = messages.filter((message): message is TrustedUIMessage => {
    if (!isRecord(message)) return false
    if (typeof message.id !== "string") return false
    if (!isAllowedRole(message.role)) return false
    if (!Array.isArray(message.parts) || message.parts.length === 0) {
      if (typeof message.content === 'string' && message.content.trim().length > 0) {
        message.parts = [{ type: 'text', text: message.content }]
      } else {
        return false
      }
    }

    if (!Array.isArray(message.parts) || message.parts.length === 0) {
      return false
    }

    const candidate = message as unknown as TrustedUIMessage

    if (candidate.role === "user") return true

    if (!context) {
      rejectedAssistantCount += 1
      return false
    }

    if (hasValidTrustedMetadata(candidate, context)) return true

    rejectedAssistantCount += 1
    return false
  })

  return { messages: sanitized, rejectedAssistantCount }
}

export function sanitizeClientUiMessages(
  messages: unknown,
  context?: MessageSanitizationContext
): TrustedUIMessage[] {
  const { messages: sanitized, rejectedAssistantCount } =
    sanitizeClientUiMessagesWithOutcome(messages, context)

  if (rejectedAssistantCount > 0) {
    console.warn(
      `[agent-history] Dropped ${rejectedAssistantCount} assistant message(s) that failed signature verification. ` +
        `If this is every message in the thread, AGENT_HISTORY_SIGNING_SECRET has changed since they were stored ` +
        `(it falls back to OPENAI_API_KEY when unset, so rotating that key has the same effect).`
    )
  }

  return sanitized
}

/**
 * Safely parse and restore messages directly from the server's Supabase database.
 * Unlike client HTTP input, database rows are already authenticated and written by
 * the server, so valid assistant messages are preserved rather than rejected.
 */
export function sanitizePersistedDatabaseMessages(messages: unknown): TrustedUIMessage[] {
  if (!Array.isArray(messages)) return []

  return messages.filter((message): message is TrustedUIMessage => {
    if (!isRecord(message)) return false
    if (typeof message.id !== "string") return false
    if (!isAllowedRole(message.role)) return false
    if (!Array.isArray(message.parts) || message.parts.length === 0) {
      if (typeof message.content === 'string' && message.content.trim().length > 0) {
        message.parts = [{ type: 'text', text: message.content }]
      } else {
        return false
      }
    }
    return true
  })
}
