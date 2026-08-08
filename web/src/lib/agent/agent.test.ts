import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateAgentCost,
  getAvailableToolNamesForPersona,
  getIntegrationProviderForTool,
  MANUAL_APPROVAL_REQUIRED_TOOL_NAMES,
} from './agent'

test('estimateAgentCost uses model-aware pricing for supported model families', () => {
  assert.equal(estimateAgentCost('gpt-4o-mini', 1_000_000, 1_000_000), 75)
  assert.equal(estimateAgentCost('gpt-4.1-mini', 1_000_000, 1_000_000), 200)
  assert.equal(estimateAgentCost('gpt-5.4-mini', 1_000_000, 1_000_000), 525)
  assert.equal(estimateAgentCost('gpt-5.5', 1_000_000, 1_000_000), 3500)
})

test('estimateAgentCost falls back to the default family for unknown aliases', () => {
  const cost = estimateAgentCost('unknown-model-alias', 1_000_000, 1_000_000)
  assert.ok(cost > 0)
})

test('getAvailableToolNamesForPersona excludes manual-approval tools from agent access', () => {
  const alexTools = new Set(getAvailableToolNamesForPersona('alex'))

  for (const toolName of MANUAL_APPROVAL_REQUIRED_TOOL_NAMES) {
    assert.equal(alexTools.has(toolName), false, `${toolName} should not be agent-accessible`)
  }

  assert.equal(alexTools.has('getAccountDetails'), true)
  assert.equal(alexTools.has('generateFollowUpDraft'), true)
})

test('allel chat exposes every live integration surface behind a provider guard', () => {
  const chatTools = new Set(
    getAvailableToolNamesForPersona('alex', undefined, { channel: 'chat' })
  )
  const representativeTools = {
    stripe: 'getStripeBalanceTool',
    posthog: 'listPostHogInsights',
    gmail: 'getMyInbox',
    slack: 'getSlackHistory',
    intercom: 'listIntercomConvos',
    hubspot: 'searchHubSpotContactsTool',
    sentry: 'listSentryIssuesTool',
    linear: 'searchLinearIssuesTool',
    google_calendar: 'listCalendarEventsTool',
    notion: 'searchNotionTool',
    airtable: 'listAirtableBasesTool',
  } as const

  for (const [provider, toolName] of Object.entries(representativeTools)) {
    assert.equal(chatTools.has(toolName), true, `${toolName} should be available to Allel chat`)
    assert.equal(
      getIntegrationProviderForTool(toolName),
      provider,
      `${toolName} should enforce the ${provider} connection state`
    )
  }
})
