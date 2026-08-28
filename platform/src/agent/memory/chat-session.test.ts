import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAgentChatId,
  LEGACY_AGENT_CHAT_SESSION_ID,
  resolveAgentConversationSessionId,
  sanitizeAgentChatSessionId,
} from '@/agent/memory/chat-session'

test('sanitizeAgentChatSessionId accepts safe session ids and rejects invalid ones', () => {
  assert.equal(sanitizeAgentChatSessionId('session_123-abc'), 'session_123-abc')
  assert.equal(sanitizeAgentChatSessionId(' bad session id '), null)
  assert.equal(sanitizeAgentChatSessionId(''), null)
})

test('resolveAgentConversationSessionId prefers an explicit body session id', () => {
  assert.equal(
    resolveAgentConversationSessionId({
      sessionId: 'session-42',
      id: buildAgentChatId({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        sessionId: 'session-from-chat-id',
        personaId: 'alex',
      }),
    }),
    'session-42'
  )
})

test('resolveAgentConversationSessionId falls back to parsing the chat id', () => {
  assert.equal(
    resolveAgentConversationSessionId({
      id: buildAgentChatId({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        sessionId: 'session-99',
        personaId: 'henry',
      }),
    }),
    'session-99'
  )
})

test('resolveAgentConversationSessionId uses the legacy fallback when nothing valid is provided', () => {
  assert.equal(resolveAgentConversationSessionId({}), LEGACY_AGENT_CHAT_SESSION_ID)
  assert.equal(resolveAgentConversationSessionId(null), LEGACY_AGENT_CHAT_SESSION_ID)
})
