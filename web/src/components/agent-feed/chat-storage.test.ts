import assert from 'node:assert/strict'
import test from 'node:test'
import type { UIMessage } from 'ai'
import { buildTrustedMessageMetadata } from '@/lib/agent/ui-message-utils'
import { buildAgentChatStorageScope } from '@/lib/agent/chat-session'
import {
  buildLastPersonaStorageKey,
  buildPersonaThreadChatId,
  buildPersonaThreadStorageKey,
  sanitizeStoredPersonaMessages,
} from './chat-storage'

process.env.AGENT_HISTORY_SIGNING_SECRET = 'test-chat-storage-secret'

type StoredUIMessage = UIMessage<{
  trustedHistory?: {
    version: 1
    workspaceId: string
    personaId: string
    contentSha256: string
    signature: string
  }
}>

function createUserMessage(id: string, text: string): StoredUIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

function createAssistantMessage(
  id: string,
  text: string,
  options: {
    workspaceId?: string
    personaId?: 'alex' | 'henry' | 'sarah'
  } = {}
): StoredUIMessage {
  const workspaceId = options.workspaceId ?? 'workspace-1'
  const personaId = options.personaId ?? 'alex'
  const message: StoredUIMessage = {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  }

  return {
    ...message,
    metadata: buildTrustedMessageMetadata({
      workspaceId,
      personaId,
      message,
    }),
  }
}

test('chat storage keys are scoped by user and workspace', () => {
  const firstScope = buildAgentChatStorageScope({
    userId: 'user-1',
    workspaceId: 'workspace-1',
  }, 'session-1')
  const secondScope = buildAgentChatStorageScope({
    userId: 'user-2',
    workspaceId: 'workspace-2',
  }, 'session-2')

  assert.notEqual(
    buildPersonaThreadStorageKey(firstScope),
    buildPersonaThreadStorageKey(secondScope)
  )
  assert.notEqual(
    buildLastPersonaStorageKey(firstScope),
    buildLastPersonaStorageKey(secondScope)
  )
})

test('chat ids are deterministic within a scope and differ across workspaces', () => {
  const firstScope = buildAgentChatStorageScope(
    {
      userId: 'user-1',
      workspaceId: 'workspace-1',
    },
    'session-1'
  )
  const secondScope = buildAgentChatStorageScope(
    {
      userId: 'user-1',
      workspaceId: 'workspace-2',
    },
    'session-2'
  )

  assert.equal(
    buildPersonaThreadChatId('alex', firstScope),
    'persona-thread:user-1:workspace-1:session-1:alex'
  )
  assert.notEqual(
    buildPersonaThreadChatId('alex', firstScope),
    buildPersonaThreadChatId('alex', secondScope)
  )
})

test('sanitizeStoredPersonaMessages preserves valid UI messages in client cache', () => {
  const messages = sanitizeStoredPersonaMessages(
    [
      createUserMessage('user-1', 'hey there'),
      createAssistantMessage('assistant-1', 'How can I help?', {
        workspaceId: 'workspace-1',
        personaId: 'alex',
      }),
      {
        id: 'assistant-unsigned',
        role: 'assistant',
        parts: [{ type: 'text', text: 'live streaming reply' }],
      },
      null,
      'invalid-string',
      { noId: true },
    ],
    {
      workspaceId: 'workspace-1',
      personaId: 'alex',
    }
  )

  assert.deepEqual(
    messages.map((message) => message.id),
    ['user-1', 'assistant-1', 'assistant-unsigned']
  )
})

test('B5: server history wins and locally-appended turns survive', async () => {
  const { reconcileConversationHistory } = await import('./chat-storage')

  const server = [
    { id: 'm1', role: 'user' },
    { id: 'm2', role: 'assistant' },
    { id: 'm3', role: 'user' },
    { id: 'm4', role: 'assistant' },
  ]
  // The lossy local copy: the assistant turns failed signature verification and
  // were dropped, plus one message appended after the last save.
  const local = [
    { id: 'm1', role: 'user' },
    { id: 'm3', role: 'user' },
    { id: 'm5', role: 'user' },
  ]

  const merged = reconcileConversationHistory(local, server)

  assert.deepEqual(
    merged.map((m) => m.id),
    ['m1', 'm2', 'm3', 'm4', 'm5'],
    'Server ordering is preserved and the local-only turn is appended'
  )
  assert.equal(
    new Set(merged.map((m) => m.id)).size,
    merged.length,
    'No duplicate ids'
  )
})

test('B5: reconciliation handles either side being empty', async () => {
  const { reconcileConversationHistory } = await import('./chat-storage')

  const local = [{ id: 'a', role: 'user' }]
  const server = [{ id: 'b', role: 'user' }]

  assert.deepEqual(reconcileConversationHistory(local, []), local, 'No server record keeps local')
  assert.deepEqual(reconcileConversationHistory([], server), server, 'No local cache keeps server')
  assert.deepEqual(reconcileConversationHistory([], []), [])
})

test('B8: signature failure is reported rather than silently dropping history', async () => {
  const { sanitizeClientUiMessagesWithOutcome } = await import('@/lib/agent/ui-message-utils')

  const context = { workspaceId: 'ws_1', personaId: 'alex' }
  const messages = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'check my mail' }] },
    // Signed under a different secret, so verification fails.
    {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Here is your inbox' }],
      metadata: {
        trustedHistory: {
          version: 1,
          workspaceId: 'ws_1',
          personaId: 'alex',
          contentSha256: 'stale-hash',
          signature: 'stale-signature',
        },
      },
    },
  ]

  const outcome = sanitizeClientUiMessagesWithOutcome(messages, context)

  assert.equal(outcome.messages.length, 1, 'Only the user message survives')
  assert.equal(
    outcome.rejectedAssistantCount,
    1,
    'The drop must be countable so it can be logged instead of looking like memory loss'
  )
})
