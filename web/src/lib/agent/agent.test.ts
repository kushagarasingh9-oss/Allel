import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateAgentCost,
  getAvailableToolNamesForPersona,
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
