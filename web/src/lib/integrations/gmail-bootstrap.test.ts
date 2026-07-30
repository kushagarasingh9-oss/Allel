import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGmailBootstrapCandidates, buildGmailBootstrapQuery } from './gmail-bootstrap'
import type { GmailThread } from './gmail'

function buildThread(overrides: Partial<GmailThread> = {}): GmailThread {
  return {
    threadId: 'thread_123',
    subject: 'Need help with billing',
    from: 'Sarah Chen <sarah@acme.com>',
    to: 'Founder <founder@company.com>',
    snippet: 'Can you help with this invoice?',
    date: '2026-04-08T10:00:00.000Z',
    isUnread: true,
    messageCount: 2,
    lastMessageAt: '2026-04-08T10:00:00.000Z',
    lastMessageId: 'msg_123',
    lastSenderEmail: 'sarah@acme.com',
    participantEmails: ['sarah@acme.com', 'founder@company.com'],
    ...overrides,
  }
}

test('buildGmailBootstrapQuery focuses on recent inbox threads and excludes noisy categories', () => {
  assert.equal(
    buildGmailBootstrapQuery(90),
    'in:inbox newer_than:90d -category:promotions -category:social -category:forums -category:updates'
  )
})

test('buildGmailBootstrapCandidates groups work-domain contacts into a single account', () => {
  const candidates = buildGmailBootstrapCandidates(
    [
      buildThread(),
      buildThread({
        threadId: 'thread_456',
        from: 'Mike Ross <mike@acme.com>',
        lastSenderEmail: 'mike@acme.com',
        participantEmails: ['mike@acme.com', 'founder@company.com'],
      }),
    ],
    'founder@company.com'
  )

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.accountName, 'Acme')
  assert.deepEqual(
    candidates[0]?.contacts.map((contact) => contact.email).sort(),
    ['mike@acme.com', 'sarah@acme.com']
  )
})

test('buildGmailBootstrapCandidates skips internal and no-reply senders', () => {
  const candidates = buildGmailBootstrapCandidates(
    [
      buildThread({
        from: 'Ops <noreply@vendor.com>',
        lastSenderEmail: 'noreply@vendor.com',
        participantEmails: ['noreply@vendor.com', 'founder@company.com'],
      }),
      buildThread({
        from: 'Teammate <teammate@company.com>',
        lastSenderEmail: 'teammate@company.com',
        participantEmails: ['teammate@company.com', 'founder@company.com'],
      }),
    ],
    'founder@company.com'
  )

  assert.equal(candidates.length, 0)
})
