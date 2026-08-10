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
  const secret =
    process.env.AGENT_HISTORY_SIGNING_SECRET ?? process.env.OPENAI_API_KEY

  if (!secret) {
    throw new Error(
      "Missing AGENT_HISTORY_SIGNING_SECRET or OPENAI_API_KEY for agent history verification"
    )
  }

  return secret
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

export function sanitizeClientUiMessages(
  messages: unknown,
  context?: MessageSanitizationContext
): TrustedUIMessage[] {
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

    if (!Array.isArray(message.parts) || message.parts.length === 0) {
      return false
    }

    const candidate = message as unknown as TrustedUIMessage

    if (candidate.role === "user") return true
    if (!context) return false

    return hasValidTrustedMetadata(candidate, context)
  })
}
