import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmailSearchQuery,
  classifyEmailThread,
  extractEmailAddress,
  getGoogleOAuthScopes,
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

test('Google Calendar OAuth requests one complete Calendar scope', () => {
  assert.deepEqual(getGoogleOAuthScopes('google_calendar'), [
    'https://www.googleapis.com/auth/calendar',
  ])
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

test('classifyEmailThread filters automated digests before support-like keywords', () => {
  const ftmo = classifyEmailThread({
    from: 'FTMO <newsletter@ftmo.com>',
    subject: 'The massive Yen short squeeze | Weekly Market Recap',
    snippet: 'You received this email because you subscribed. Unsubscribe anytime.',
  })
  const gitlab = classifyEmailThread({
    from: 'GitLab <noreply@gitlab.com>',
    subject: 'Your code is in. Here is what to try next',
    snippet: 'Explore the latest product update.',
  })
  const wispr = classifyEmailThread({
    from: 'Wispr Flow <hello@wisprflow.ai>',
    subject: 'One quick question for you',
    snippet: 'A product update from Wispr Flow.',
  })
  const unicoin = classifyEmailThread({
    from: 'Alex Konanykhin <alex@unicoin.example>',
    subject: "UNICOIN / Defining Crypto's Place in the U.S. Financial System",
  })

  for (const classification of [ftmo, gitlab, wispr, unicoin]) {
    assert.equal(classification.category, 'marketing_digest')
    assert.equal(classification.needsReply, false)
    assert.equal(classification.priority, 'low')
    assert.ok(typeof classification.score === 'number')
  }
})

test('classifyEmailThread only escalates an explicit human customer problem', () => {
  const customerProblem = classifyEmailThread({
    from: 'Ava Customer <ava@acme.com>',
    subject: "I can't access my account",
    snippet: 'I am locked out after upgrading. Can you help me get back in?',
  })
  const vendorSupportUpdate = classifyEmailThread({
    from: 'Support <support@vendor.example>',
    subject: 'Your support ticket update',
    snippet: 'We have updated your request.',
  })

  assert.equal(customerProblem.category, 'customer_support_issue')
  assert.equal(customerProblem.needsReply, true)
  assert.equal(customerProblem.priority, 'critical')
  assert.ok(customerProblem.score >= 80)

  assert.equal(vendorSupportUpdate.category, 'direct_human_email')
  assert.equal(vendorSupportUpdate.needsReply, true)
  assert.equal(vendorSupportUpdate.priority, 'medium')
  assert.ok(typeof vendorSupportUpdate.score === 'number')
})

test('classifyEmailThread keeps transactional alerts and networking separate from replies', () => {
  const fin = classifyEmailThread({
    from: 'Billing <no-reply@payments.example>',
    subject: 'Payment failed for your subscription',
  })
  assert.equal(fin.category, 'financial_revenue_event')
  assert.equal(fin.needsReply, false)
  assert.equal(fin.priority, 'high')
  assert.equal(fin.score, 85)

  const invite = classifyEmailThread({
    from: 'LinkedIn <messages-noreply@linkedin.com>',
    subject: 'Navya Trivedi wants to connect with you',
  })

  assert.equal(invite.category, 'linkedin_invite')
  assert.equal(invite.needsReply, false)
  assert.equal(invite.priority, 'medium')
  assert.equal(invite.personName, 'Navya Trivedi')
})
