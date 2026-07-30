import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeInstructionBlock,
  buildTurnContextSystemPrompt,
} from './runtime-context'

test('runtime instruction block exposes current tools and overrides stale examples', () => {
  const prompt = buildRuntimeInstructionBlock({
    personaId: 'alex',
    personaName: 'Alex',
    channel: 'chat',
    runType: 'chat_message',
    availableToolNames: ['getAccountDetails', 'generateFollowUpDraft'],
  })

  assert.match(prompt, /getAccountDetails/)
  assert.match(prompt, /generateFollowUpDraft/)
  assert.match(prompt, /Only call tools in the available list/)
  assert.match(prompt, /approveDraft/)
  assert.match(prompt, /Founder approval and final sending happen outside/)
})

test('turn context prompt anchors newest request without losing runtime metadata', () => {
  const prompt = buildTurnContextSystemPrompt({
    channel: 'automation',
    runType: 'daily_review',
    stage: 'analyze',
    nowIso: '2026-05-01T00:00:00.000Z',
    latestUserText: 'Please check Acme risk now.',
  })

  assert.match(prompt, /2026-05-01T00:00:00.000Z/)
  assert.match(prompt, /daily_review/)
  assert.match(prompt, /Workflow stage: analyze/)
  assert.match(prompt, /Please check Acme risk now/)
})
