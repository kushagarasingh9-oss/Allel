import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmailSearchQuery,
  extractEmailAddress,
  threadNeedsReply,
  type GmailThread,
} from './gmail'

function buildThread(overrides: Partial<GmailThread> = {}): GmailThread {
  return {
    threadId: 'thread_123',
    subject: 'Need help with billing',
    from: 'Customer <customer@acme.com>',
    to: 'Founder <founder@company.com>',
    snippet: 'Can you help with this invoice?',
    date: '2026-04-08T10:00:00.000Z',
    isUnread: true,
    messageCount: 2,
    lastMessageAt: '2026-04-08T10:00:00.000Z',
    lastMessageId: 'msg_123',
    lastSenderEmail: 'customer@acme.com',
    participantEmails: ['customer@acme.com', 'founder@company.com'],
    ...overrides,
  }
}

test('extractEmailAddress returns the normalized mailbox address', () => {
  assert.equal(
    extractEmailAddress('Founder Ops <Hello+Team@Example.COM>'),
    'hello+team@example.com'
  )
})

test('buildEmailSearchQuery scopes to sender or recipient within a lookback window', () => {
  assert.equal(
    buildEmailSearchQuery('customer@acme.com', 90),
    'newer_than:90d (from:customer@acme.com OR to:customer@acme.com)'
  )
})

test('threadNeedsReply returns true when the latest inbound message is newer than founder touch', () => {
  const thread = buildThread()

  assert.equal(
    threadNeedsReply(thread, 'founder@company.com', '2026-04-07T09:00:00.000Z'),
    true
  )
})

test('threadNeedsReply returns false when the founder sent the latest message', () => {
  const thread = buildThread({
    lastSenderEmail: 'founder@company.com',
    isUnread: false,
  })

  assert.equal(
    threadNeedsReply(thread, 'founder@company.com', '2026-04-08T11:00:00.000Z'),
    false
  )
})

test('threadNeedsReply returns false when the thread is older than the latest founder touch', () => {
  const thread = buildThread({
    isUnread: false,
    lastMessageAt: '2026-04-05T10:00:00.000Z',
  })

  assert.equal(
    threadNeedsReply(thread, 'founder@company.com', '2026-04-07T10:00:00.000Z'),
    false
  )
})
