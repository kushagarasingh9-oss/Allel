import assert from 'node:assert/strict'
import test from 'node:test'
import { describeReasoningBatch } from './timeline-nodes'

test('B6: a turn that promised an action and did nothing reads as unfulfilled', () => {
  const label = describeReasoningBatch({
    isExecuting: false,
    stepsCount: 0,
    announcedActionMismatch: true,
  })

  assert.equal(label.isUnfulfilled, true)
  assert.match(label.text, /not executed/i)
  assert.equal(
    label.text.includes('Direct response'),
    false,
    'A broken promise must not read as an intentional tool-free answer'
  )
})

test('B6: a genuine tool-free answer stays neutral', () => {
  const label = describeReasoningBatch({ isExecuting: false, stepsCount: 0 })

  assert.equal(label.isUnfulfilled, false)
  assert.equal(label.text, 'Executive reasoning & analysis')
})

test('B6: completed tool work reports its step count with correct pluralization', () => {
  assert.equal(
    describeReasoningBatch({ isExecuting: false, stepsCount: 1 }).text,
    'Identifying user needs and intent (1 step)'
  )
  assert.equal(
    describeReasoningBatch({ isExecuting: false, stepsCount: 3 }).text,
    'Identifying user needs and intent (3 steps)'
  )
})

test('B6: an in-flight turn is never labelled unfulfilled', () => {
  // The mismatch is only known once the turn finishes; flagging mid-stream would
  // accuse the agent of breaking a promise it may still keep.
  const label = describeReasoningBatch({
    isExecuting: true,
    stepsCount: 0,
    announcedActionMismatch: true,
  })

  assert.equal(label.isUnfulfilled, false)
  assert.equal(label.text, 'Identifying user needs and intent')
})
