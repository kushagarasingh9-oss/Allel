import test from 'node:test'
import assert from 'node:assert/strict'
import type { UIMessage } from 'ai'
import {
  MAX_PERSISTED_AGENT_MESSAGES,
  buildConversationMemorySystemPrompt,
  compactConversationState,
  extractConversationAccountIds,
  getConversationActivityTimestamps,
  mergeConversationHistory,
  trimConversationHistory,
} from './chat-memory'
import {
  buildTrustedMessageMetadata,
  type TrustedMessageMetadata,
} from './ui-message-utils'

type TrustedUIMessage = UIMessage<TrustedMessageMetadata>

process.env.AGENT_HISTORY_SIGNING_SECRET = 'test-agent-memory-secret'

function createUserMessage(id: string, text: string): TrustedUIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

function createAssistantMessage(id: string, text: string): TrustedUIMessage {
  const message: TrustedUIMessage = {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  }

  return {
    ...message,
    metadata: buildTrustedMessageMetadata({
      workspaceId: 'workspace-123',
      personaId: 'alex',
      message,
    }),
  }
}

test('mergeConversationHistory appends new user messages to persisted history', () => {
  const persisted = [
    createUserMessage('user-1', 'first'),
    createAssistantMessage('assistant-1', 'response'),
  ]

  const incoming = [createUserMessage('user-2', 'follow up')]

  const merged = mergeConversationHistory({
    persistedMessages: persisted,
    incomingMessages: incoming,
  })

  assert.deepEqual(
    merged.map((message) => message.id),
    ['user-1', 'assistant-1', 'user-2']
  )
})

test('mergeConversationHistory respects overlap and avoids duplicating prior messages', () => {
  const persisted = [
    createUserMessage('user-1', 'first'),
    createAssistantMessage('assistant-1', 'response'),
    createUserMessage('user-2', 'second'),
  ]

  const incoming = [
    createAssistantMessage('assistant-1', 'response'),
    createUserMessage('user-2', 'second'),
    createAssistantMessage('assistant-2', 'new response'),
  ]

  const merged = mergeConversationHistory({
    persistedMessages: persisted,
    incomingMessages: incoming,
  })

  assert.deepEqual(
    merged.map((message) => message.id),
    ['user-1', 'assistant-1', 'user-2', 'assistant-2']
  )
})

test('trimConversationHistory keeps a bounded trailing window and drops orphaned assistant prefixes', () => {
  const oversized = Array.from(
    { length: MAX_PERSISTED_AGENT_MESSAGES + 4 },
    (_, index) =>
      index % 2 === 0
        ? createUserMessage(`user-${index}`, `user ${index}`)
        : createAssistantMessage(`assistant-${index}`, `assistant ${index}`)
  )

  const trimmed = trimConversationHistory(oversized)

  assert.ok(trimmed.length <= MAX_PERSISTED_AGENT_MESSAGES)
  assert.equal(trimmed[0]?.role, 'user')
})

test('compactConversationState summarizes older messages and retains extracted account context', () => {
  const accountId = '123e4567-e89b-12d3-a456-426614174000'
  const oversized = Array.from(
    { length: MAX_PERSISTED_AGENT_MESSAGES + 6 },
    (_, index) =>
      index % 2 === 0
        ? createUserMessage(
            `user-${index}`,
            index === 0
              ? `Please keep track of account ${accountId} and draft a rescue plan.`
              : `user message ${index}`
          )
        : createAssistantMessage(`assistant-${index}`, `assistant reply ${index}`)
  )

  const compacted = compactConversationState({
    messages: oversized,
  })

  assert.ok(compacted.compactedMessageCount > 0)
  assert.ok(compacted.summary.includes('User focus:'))
  assert.ok(
    compacted.accountContext.mentionedAccountIds.includes(accountId.toLowerCase())
  )
  assert.ok(compacted.accountContext.recentUserGoals.length > 0)
})

test('extractConversationAccountIds finds UUID account references inside chat text', () => {
  const accountId = '123e4567-e89b-12d3-a456-426614174000'
  const messages = [
    createUserMessage('user-1', `Can you review account ${accountId}?`),
    createAssistantMessage('assistant-1', 'Yes, I will review it.'),
  ]

  assert.deepEqual(extractConversationAccountIds(messages), [accountId.toLowerCase()])
})

test('buildConversationMemorySystemPrompt turns compacted memory into a server-only context block', () => {
  const prompt = buildConversationMemorySystemPrompt({
    summary:
      'User focus: Review churn risk for Acme. Assistant context: Prior plan was to inspect billing and usage.',
    summaryMessageCount: 16,
    lastCompactedAt: new Date().toISOString(),
    accountContext: {
      mentionedAccountIds: ['123e4567-e89b-12d3-a456-426614174000'],
      recentUserGoals: ['Review churn risk for Acme'],
      assistantCommitments: ['Inspect billing and usage before drafting'],
    },
    lastUserMessageAt: null,
    lastAssistantMessageAt: null,
  })

  assert.ok(prompt)
  assert.match(prompt ?? '', /Compacted earlier messages: 16\./)
  assert.match(prompt ?? '', /Persistent user goals:/)
  assert.match(prompt ?? '', /Mentioned account IDs:/)
})

test('getConversationActivityTimestamps advances both user and assistant recency on a normal turn save', () => {
  const nowIso = '2026-04-24T12:00:00.000Z'
  const timestamps = getConversationActivityTimestamps(
    [
      createUserMessage('user-1', 'Can you help with churn risk?'),
      createAssistantMessage('assistant-1', 'Yes, I will review the account.'),
    ],
    {
      summary: '',
      summaryMessageCount: 0,
      lastCompactedAt: null,
      accountContext: {
        mentionedAccountIds: [],
        recentUserGoals: [],
        assistantCommitments: [],
      },
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    },
    nowIso
  )

  assert.deepEqual(timestamps, {
    lastUserMessageAt: nowIso,
    lastAssistantMessageAt: nowIso,
  })
})
