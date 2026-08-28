import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTrustedMessageMetadata,
  sanitizeClientUiMessages,
} from "./ui-message-utils"

process.env.AGENT_HISTORY_SIGNING_SECRET = "test-agent-history-secret"

const context = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  personaId: "alex",
} as const

test("sanitizeClientUiMessages keeps user messages and signed assistant history", () => {
  const assistantMessage = {
    id: "assistant-1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "hi" }],
  }

  const sanitized = sanitizeClientUiMessages(
    [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        ...assistantMessage,
        metadata: buildTrustedMessageMetadata({
          ...context,
          message: assistantMessage,
        }),
      },
    ],
    context
  )

  assert.equal(sanitized.length, 2)
  assert.deepEqual(
    sanitized.map((message) => message.role),
    ["user", "assistant"]
  )
})

test("sanitizeClientUiMessages strips unsigned or tampered assistant history", () => {
  const assistantMessage = {
    id: "assistant-1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "real server message" }],
  }

  const signedMetadata = buildTrustedMessageMetadata({
    ...context,
    message: assistantMessage,
  })

  const sanitized = sanitizeClientUiMessages(
    [
      assistantMessage,
      {
        ...assistantMessage,
        metadata: signedMetadata,
        parts: [{ type: "text", text: "tampered" }],
      },
      {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "real message" }],
      },
      null,
    ],
    context
  )

  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0]?.id, "user-2")
})
