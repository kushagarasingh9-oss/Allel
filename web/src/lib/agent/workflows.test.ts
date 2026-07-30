import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ANALYZE_WRITE_WORKFLOW_TOOLS,
  buildDailyReviewJobs,
  buildPostHogWebhookFollowUpPrompt,
  buildPostHogWebhookJobs,
  buildStripeWebhookFollowUpPrompt,
  buildStripeWebhookJobs,
  DRAFT_WRITE_WORKFLOW_TOOLS,
  getWorkflowStageAllowedTools,
  READ_ONLY_WORKFLOW_TOOLS,
} from './workflows'

test('buildDailyReviewJobs decomposes the daily review into detect, analyze, draft, and verify jobs', () => {
  const jobs = buildDailyReviewJobs({
    accountCount: 12,
    syncSummary: {
      stripe: '4 accounts',
      posthog: '25 people',
    },
  })

  assert.deepEqual(
    jobs.map((job) => job.stage),
    ['detect', 'analyze', 'draft', 'verify']
  )
  assert.match(jobs[0]?.prompt ?? '', /There are 12 accounts in this workspace\./)
  assert.match(jobs[0]?.prompt ?? '', /stripe: 4 accounts/)
})

test('buildStripeWebhookFollowUpPrompt preserves the no-direct-brief rule and email context', () => {
  const prompt = buildStripeWebhookFollowUpPrompt(
    'invoice.payment_failed',
    'founder@example.com'
  )

  assert.match(prompt, /invoice\.payment_failed/)
  assert.match(prompt, /Customer email: founder@example\.com\./)
  assert.match(prompt, /Do NOT update the founder brief directly\./)
})

test('buildStripeWebhookJobs decomposes webhook follow-up into four jobs', () => {
  const jobs = buildStripeWebhookJobs('invoice.payment_failed', 'founder@example.com')

  assert.deepEqual(
    jobs.map((job) => job.stage),
    ['detect', 'analyze', 'draft', 'verify']
  )
})

test('buildPostHogWebhookFollowUpPrompt asks for risk analysis without handing brief ownership to the agent', () => {
  const prompt = buildPostHogWebhookFollowUpPrompt(
    'Cancellation page visited by founder@example.com'
  )

  assert.match(prompt, /Cancellation page visited by founder@example\.com/)
  assert.match(prompt, /Assess whether this changes churn or renewal risk\./)
  assert.match(prompt, /Do NOT update the founder brief directly\./)
})

test('buildPostHogWebhookJobs decomposes follow-up into detect, analyze, draft, and verify jobs', () => {
  const jobs = buildPostHogWebhookJobs(
    'Cancellation page visited by founder@example.com'
  )

  assert.deepEqual(
    jobs.map((job) => job.stage),
    ['detect', 'analyze', 'draft', 'verify']
  )
})

test('workflow stage allowlists enforce read-only detect and verify phases', () => {
  const detectTools = new Set(getWorkflowStageAllowedTools('detect'))
  const verifyTools = new Set(getWorkflowStageAllowedTools('verify'))

  assert.ok(detectTools.has('getAccountDetails'))
  assert.ok(detectTools.has('webSearchTool'))
  assert.equal(detectTools.has('generateFollowUpDraft'), false)
  assert.equal(detectTools.has('updateAccountRisk'), false)
  assert.equal(verifyTools.has('generateFollowUpDraft'), false)
  assert.equal(verifyTools.has('sendGmailReply'), false)
})

test('workflow stage allowlists keep analyze and draft capabilities separate', () => {
  const analyzeTools = new Set(getWorkflowStageAllowedTools('analyze'))
  const draftTools = new Set(getWorkflowStageAllowedTools('draft'))

  assert.ok(READ_ONLY_WORKFLOW_TOOLS.includes('getExistingDrafts'))
  assert.ok(ANALYZE_WRITE_WORKFLOW_TOOLS.includes('updateAccountRisk'))
  assert.ok(DRAFT_WRITE_WORKFLOW_TOOLS.includes('generateFollowUpDraft'))
  assert.ok(analyzeTools.has('updateAccountRisk'))
  assert.equal(analyzeTools.has('generateFollowUpDraft'), false)
  assert.ok(draftTools.has('generateFollowUpDraft'))
  assert.equal(draftTools.has('updateAccountRisk'), false)
  assert.equal(draftTools.has('sendGmailReply'), false)
})
