import assert from 'node:assert/strict'
import test from 'node:test'
import { isProviderAuthFailure } from '@/integrations/_core/integration-health'

test('C3: auth failures are detected across provider error shapes', () => {
  const authFailures = [
    new Error('Calendar API error: 401 Unauthorized'),
    new Error('Gmail threads fetch failed: 401 invalid credentials'),
    new Error('Notion request failed: 401 API token is invalid'),
    new Error('Airtable error: 403 Forbidden'),
    new Error('Failed to refresh Google Calendar token: 400 invalid_grant'),
    new Error('Token has been expired or revoked'),
    new Error('Request had insufficient permission for this scope'),
  ]

  for (const error of authFailures) {
    assert.equal(
      isProviderAuthFailure(error),
      true,
      `should treat as auth failure: ${error.message}`
    )
  }
})

test('C3: non-auth failures must never mark a connection unhealthy', () => {
  const nonAuthFailures = [
    new Error('Calendar API error: 404 Not Found'),
    new Error('Airtable error: 422 invalid field name'),
    new Error('Gmail send failed: 400 recipient address required'),
    new Error('Network request failed: ECONNRESET'),
    new Error('Calendar API error: 500 Internal Server Error'),
    new Error(''),
  ]

  for (const error of nonAuthFailures) {
    assert.equal(
      isProviderAuthFailure(error),
      false,
      `should not be an auth failure: ${error.message || '(empty)'}`
    )
  }
})

test('C3: a rate limit outranks an auth marker', () => {
  // Google answers 403 for quota breaches. Treating that as a broken connection
  // would tell the founder to reconnect a perfectly healthy integration and
  // block every later call behind the connection guard.
  assert.equal(
    isProviderAuthFailure(new Error('403 userRateLimitExceeded: Rate Limit Exceeded')),
    false
  )
  assert.equal(isProviderAuthFailure(new Error('429 Too Many Requests')), false)
  assert.equal(
    isProviderAuthFailure(new Error('403 quota exceeded for this project')),
    false
  )
})
