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

test('sanitizeStoredPersonaMessages keeps user turns and trusted assistant history only', () => {
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
        parts: [{ type: 'text', text: 'stale unsigned reply' }],
      },
      createAssistantMessage('assistant-other-workspace', 'wrong workspace', {
        workspaceId: 'workspace-2',
        personaId: 'alex',
      }),
      createAssistantMessage('assistant-other-persona', 'wrong persona', {
        workspaceId: 'workspace-1',
        personaId: 'henry',
      }),
    ],
    {
      workspaceId: 'workspace-1',
      personaId: 'alex',
    }
  )

  assert.deepEqual(
    messages.map((message) => message.id),
    ['user-1', 'assistant-1']
  )
})
