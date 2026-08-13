import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyAndSanitizeServerError } from './error-classifier'
import { formatCleanErrorMessage } from '../../components/agent-feed/agent-feed'
import {
  estimateAgentCost,
  getAgentForPersona,
  getAvailableToolNamesForPersona,
  getIntegrationProviderForTool,
  MANUAL_APPROVAL_REQUIRED_TOOL_NAMES,
  selectRelevantToolsForPrompt,
} from './agent'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'dummy-service-role-key'

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

test('Task 1: getAgentForPersona derives cache key from selected tool set, not prompt prefix', () => {
  const turn1Prompt = 'schedule a meeting with Alex tomorrow at 10am'
  const turn2Prompt = 'schedule a meeting with Alex tomorrow at 10am\ncheck out my inbox for emails'

  const agent1 = getAgentForPersona('alex', { prompt: turn1Prompt, channel: 'chat' })
  const agent2 = getAgentForPersona('alex', { prompt: turn2Prompt, channel: 'chat' })

  // Agent 2 MUST expose Gmail tools because turn 2 requested inbox/emails
  assert.ok('getMyInbox' in (agent2 as any).tools, 'Turn 2 agent must expose getMyInbox tool')

  // Calling with identical prompt/selection returns the cached instance
  const agent1Repeat = getAgentForPersona('alex', { prompt: turn1Prompt, channel: 'chat' })
  assert.equal(agent1, agent1Repeat, 'Identical tool selection must hit the agent cache')
})

test('Task 2.1: selectRelevantToolsForPrompt matches keywords on word boundaries for automation channel', () => {
  const available = getAvailableToolNamesForPersona('alex', undefined, { channel: 'automation' })
  const selected = selectRelevantToolsForPrompt('who is on the team?', available, undefined, { channel: 'automation' })

  assert.equal(selected.includes('listCalendarEventsTool'), false, 'Calendar tools should not match "team"')
})

test('Task 2.2: selectRelevantToolsForPrompt preserves full tool set for chat channel sessions', () => {
  const available = getAvailableToolNamesForPersona('alex', undefined, { channel: 'chat' })

  // Turn 1 prompt: scan emails and do tasks
  const sel1 = selectRelevantToolsForPrompt('scan my emails and do the tasks', available, undefined, { channel: 'chat' })
  assert.ok(sel1.includes('getMyInbox'), 'Chat mode must expose Gmail tools')
  assert.ok(sel1.includes('listCalendarEventsTool'), 'Chat mode must preserve Calendar tools for multi-prompt sessions')
  assert.ok(sel1.includes('searchLinearIssuesTool'), 'Chat mode must preserve Linear tools')

  // Turn 2 prompt in same session tab: see my calendar
  const sel2 = selectRelevantToolsForPrompt('see my calendar', available, undefined, { channel: 'chat' })
  assert.ok(sel2.includes('listCalendarEventsTool'), 'Chat mode must expose Calendar tools on turn 2')
  assert.ok(sel2.includes('getMyInbox'), 'Chat mode must retain Gmail tools on turn 2')
})

test('Task 2.3: selectRelevantToolsForPrompt includes keyword groups for Intercom, HubSpot, Sentry, Airtable, tasks, agenda, notes', () => {
  const available = getAvailableToolNamesForPersona('alex', undefined, { channel: 'automation' })

  assert.ok(selectRelevantToolsForPrompt('check support ticket', available, undefined, { channel: 'automation' }).includes('listIntercomConvos'))
  assert.ok(selectRelevantToolsForPrompt('search deals', available, undefined, { channel: 'automation' }).includes('searchHubSpotDealsTool'))
  assert.ok(selectRelevantToolsForPrompt('check sentry error', available, undefined, { channel: 'automation' }).includes('listSentryIssuesTool'))
  assert.ok(selectRelevantToolsForPrompt('list airtable bases', available, undefined, { channel: 'automation' }).includes('listAirtableBasesTool'))
  assert.ok(selectRelevantToolsForPrompt('do the tasks', available, undefined, { channel: 'automation' }).includes('searchLinearIssuesTool'))
  assert.ok(selectRelevantToolsForPrompt('show my agenda', available, undefined, { channel: 'automation' }).includes('listCalendarEventsTool'))
  assert.ok(selectRelevantToolsForPrompt('check my notes', available, undefined, { channel: 'automation' }).includes('searchNotionTool'))
})

test('Task 2.4: selectRelevantToolsForPrompt fallback returns full tool set when no domain matches', () => {
  const available = getAvailableToolNamesForPersona('alex', undefined, { channel: 'automation' })
  const selected = selectRelevantToolsForPrompt('hello how are you', available, undefined, { channel: 'automation' })

  assert.equal(selected.length, available.length, 'No domain match should return full available tool set')
})

test('Task 3.2: classifyAndSanitizeServerError strips vendor URLs and request IDs', () => {
  const syntheticError = new Error(
    'Azure inference error 500: see https://support.azure.com/help or contact support with request id: apim-req-99999'
  )
  const sanitized = classifyAndSanitizeServerError(syntheticError)

  assert.equal(sanitized.includes('https://support.azure.com'), false, 'Sanitized error must not contain vendor URLs')
  assert.equal(sanitized.includes('apim-req-99999'), false, 'Sanitized error must not contain request IDs')
  assert.match(sanitized, /temporarily unavailable/i, '500 error should classify as temporarily unavailable')
})

test('Task 5: inspectIntegrationConnectionsTool maps provider connection status and guard verdicts', async () => {
  const { resolveConnectionStatus, isUnverifiedConnection } = require('../integrations/connection-guard')

  const connectionRow = {
    provider: 'google_calendar',
    status: 'connected' as const,
    last_synced_at: null,
    metadata: {
      connected_via: 'workspace_connect',
      last_error: 'Token expired',
      last_error_at: '2026-05-01T12:00:00.000Z',
    },
  }

  const isUnverified = isUnverifiedConnection(connectionRow)
  const verificationVerdict = resolveConnectionStatus(connectionRow)

  assert.equal(isUnverified, true, 'workspace_connect calendar connection must be unverified')
  assert.equal(verificationVerdict, 'disconnected', 'unverified calendar connection verdict must resolve to disconnected')
  assert.equal(connectionRow.metadata.last_error, 'Token expired')
})

test('Task 8.1: resolveConnectionStatus unifies status verdicts with the chat guard', () => {
  const { resolveConnectionStatus, isUnverifiedConnection } = require('../integrations/connection-guard')

  const unverifiedCalendar = {
    provider: 'google_calendar',
    status: 'connected' as const,
    metadata: { connected_via: 'workspace_connect' },
  }
  assert.equal(isUnverifiedConnection(unverifiedCalendar), true, 'Unverified calendar must be flagged by guard')
  assert.equal(resolveConnectionStatus(unverifiedCalendar), 'disconnected', 'Resolver must reject unverified calendar')

  const verifiedOAuthCalendar = {
    provider: 'google_calendar',
    status: 'connected' as const,
    metadata: { connected_via: 'google_oauth', oauth_verified_at: '2026-05-01T00:00:00.000Z' },
  }
  assert.equal(isUnverifiedConnection(verifiedOAuthCalendar), false, 'Verified OAuth calendar is allowed')
  assert.equal(resolveConnectionStatus(verifiedOAuthCalendar), 'connected', 'Resolver must approve verified OAuth calendar')
})

test('Task 9: getGmailThreadDetailTool is registered and mapped to gmail provider', () => {
  const { ALL_TOOLS, getIntegrationProviderForTool } = require('./agent')
  assert.ok(ALL_TOOLS.getGmailThreadDetailTool, 'getGmailThreadDetailTool must be registered in ALL_TOOLS')
  assert.equal(
    getIntegrationProviderForTool('getGmailThreadDetailTool'),
    'gmail',
    'getGmailThreadDetailTool must map to gmail provider'
  )
})

test('Task 10: scoreEmailThread ranks direct actionable human mail above newsletters', () => {
  const { scoreEmailThread } = require('@/lib/integrations/gmail')
  const humanEmailFromBrandDomain = scoreEmailThread({
    from: 'John Doe <john@notion.so>',
    subject: 'Can we schedule a call about the API integration?',
    snippet: 'Hey team, I would like to discuss our product roadmap and API partnership.',
  })
  const newsletterDigest = scoreEmailThread({
    from: 'Weekly Digest <no-reply@notion.so>',
    subject: 'Weekly Market Recap & Product Updates',
    snippet: 'Unsubscribe anytime. Here is what happened this week in crypto and SaaS.',
  })

  assert.ok(
    humanEmailFromBrandDomain > newsletterDigest,
    `Human email from brand domain (${humanEmailFromBrandDomain}) must rank higher than newsletter digest (${newsletterDigest})`
  )
})

test('Task 11: Google Docs tools return non-fixture not-implemented results', async () => {
  const { searchGoogleDocsTool, readGoogleDocTool, createGoogleDocTool } = require('./tools')
  const searchRes = await searchGoogleDocsTool.execute({ workspaceId: 'ws_1', query: 'roadmap' })
  const readRes = await readGoogleDocTool.execute({ workspaceId: 'ws_1', documentId: 'doc_1' })
  const createRes = await createGoogleDocTool.execute({ workspaceId: 'ws_1', title: 'New Doc', content: 'hello' })

  assert.equal(searchRes.success, false, 'searchGoogleDocsTool must fail with false success')
  assert.equal(readRes.success, false, 'readGoogleDocTool must fail with false success')
  assert.equal(createRes.success, false, 'createGoogleDocTool must fail with false success')
  assert.ok(searchRes.error.includes('planned provider'), 'Error message must specify planned provider')
})

test('extractToolNamesFromHistory extracts tool names from nested toolInvocation parts', () => {
  const { extractToolNamesFromHistory } = require('./agent')
  const sampleMessages = [
    {
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Let me check your calendar' },
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolCallId: 'call_1',
            toolName: 'listCalendarEventsTool',
            args: { workspaceId: 'ws_1' },
            result: {},
          },
        },
      ],
    },
  ]
  const extracted = extractToolNamesFromHistory(sampleMessages)
  assert.ok(extracted.includes('listCalendarEventsTool'), 'Must extract listCalendarEventsTool from nested toolInvocation')
})



