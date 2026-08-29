import assert from 'node:assert/strict'
import test from 'node:test'
import { detectAnnouncedActionMismatch, textAnnouncesAction } from '@/agent/workflows/announced-action'

// Minimal stand-ins for the real resolvers so this stays a pure unit test.
const TOOL_PROVIDERS: Record<string, string> = {
  getMyInbox: 'gmail',
  sendGmailReply: 'gmail',
  listCalendarEventsTool: 'google_calendar',
  deleteCalendarEventTool: 'google_calendar',
  getAllAccounts: 'stripe',
}
const resolveToolProvider = (toolName: string) => TOOL_PROVIDERS[toolName] ?? null

const TEXT_PROVIDERS: Array<{ provider: string; regex: RegExp }> = [
  { provider: 'gmail', regex: /\b(inbox|mail|email)\b/i },
  { provider: 'google_calendar', regex: /\b(calendar|meeting|schedule)\b/i },
]
const resolveTextProviders = (text: string) =>
  TEXT_PROVIDERS.filter((entry) => entry.regex.test(text)).map((entry) => entry.provider)

test('B7: an announcement followed by zero tool calls is a mismatch', () => {
  const result = detectAnnouncedActionMismatch({
    outputText: 'Your calendar token is still expired. Let me check your inbox now.',
    toolNames: [],
    resolveToolProvider,
    resolveTextProviders,
  })

  assert.equal(result.mismatch, true)
  assert.equal(result.mismatch && result.reason, 'no_tool_calls')
})

test('B7: announcing one provider and calling another is a mismatch', () => {
  // This is the reproduction the founder hit: asked for mail, answered about
  // calendar. Zero-tool-call detection alone would have called this turn clean.
  const result = detectAnnouncedActionMismatch({
    outputText: 'Let me check your inbox now.',
    toolNames: ['listCalendarEventsTool'],
    resolveToolProvider,
    resolveTextProviders,
  })

  assert.equal(result.mismatch, true)
  assert.equal(result.mismatch && result.reason, 'wrong_domain')
  assert.deepEqual(result.mismatch && result.announcedProviders, ['gmail'])
  assert.deepEqual(result.mismatch && result.calledProviders, ['google_calendar'])
})

test('B7: an announcement served by the matching provider is not a mismatch', () => {
  const result = detectAnnouncedActionMismatch({
    outputText: "Let me check your inbox now.",
    toolNames: ['getMyInbox'],
    resolveToolProvider,
    resolveTextProviders,
  })

  assert.equal(result.mismatch, false)
})

test('B7: a reply with no announcement is never a mismatch', () => {
  const result = detectAnnouncedActionMismatch({
    outputText: 'You have three at-risk accounts. Acme is the most urgent.',
    toolNames: [],
    resolveToolProvider,
    resolveTextProviders,
  })

  assert.equal(result.mismatch, false)
})

test('B7: announcement detection covers first-person future forms', () => {
  const announcements = [
    'Let me check your inbox now.',
    "I'll check your calendar.",
    'I will look at your billing.',
    "I'm going to pull your recent events.",
    'One moment while I gather that.',
    'Give me a second.',
    'Fetching your latest threads.',
  ]

  for (const text of announcements) {
    assert.equal(textAnnouncesAction(text), true, `should be an announcement: ${text}`)
  }
})

test('B7: a question about acting is not a commitment to act', () => {
  const nonAnnouncements = [
    'Should I check your inbox?',
    'Do you want me to look at the calendar?',
    'I checked your inbox and found two threads.',
    'Your calendar is clear tomorrow.',
  ]

  for (const text of nonAnnouncements) {
    assert.equal(textAnnouncesAction(text), false, `should not be an announcement: ${text}`)
  }
})

test('B7: unmapped tools cannot contradict an announcement', () => {
  // Account lookups and web research have no provider, so a turn that used only
  // those has nothing to contradict.
  const result = detectAnnouncedActionMismatch({
    outputText: 'Let me check your inbox now.',
    toolNames: ['getAccountMemory'],
    resolveToolProvider,
    resolveTextProviders,
  })

  assert.equal(result.mismatch, false)
})
