import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CALENDAR_TOKEN_EXPIRY_MARGIN_MS,
  executeWithCalendarAccessToken,
  isCalendarAccessTokenUsable,
  type CalendarAccessDeps,
} from '@/integrations/google-calendar/google-calendar'

const NOW = Date.parse('2026-08-29T12:00:00.000Z')

function createDeps(
  overrides: Partial<CalendarAccessDeps> = {}
): CalendarAccessDeps & {
  tokenCalls: boolean[]
  succeeded: string[]
  failed: string[]
} {
  const tokenCalls: boolean[] = []
  const succeeded: string[] = []
  const failed: string[] = []

  return {
    tokenCalls,
    succeeded,
    failed,
    getAccessToken: async (_workspaceId: string, forceRefresh: boolean) => {
      tokenCalls.push(forceRefresh)
      return forceRefresh ? 'fresh-token' : 'cached-token'
    },
    markAuthSucceeded: async (workspaceId: string) => {
      succeeded.push(workspaceId)
    },
    markAuthFailed: async (_workspaceId: string, errorMessage: string) => {
      failed.push(errorMessage)
    },
    ...overrides,
  }
}

test('a missing expires_at is treated as expired', () => {
  assert.equal(isCalendarAccessTokenUsable(null, NOW), false)
  assert.equal(isCalendarAccessTokenUsable(undefined, NOW), false)
})

test('an unparseable expires_at (NaN) is treated as expired', () => {
  assert.equal(isCalendarAccessTokenUsable('not-a-timestamp', NOW), false)
})

test('the 60-second safety margin expires tokens before their nominal expiry', () => {
  const insideMargin = new Date(NOW + CALENDAR_TOKEN_EXPIRY_MARGIN_MS - 1_000).toISOString()
  const outsideMargin = new Date(NOW + CALENDAR_TOKEN_EXPIRY_MARGIN_MS + 1_000).toISOString()

  assert.equal(CALENDAR_TOKEN_EXPIRY_MARGIN_MS, 60_000)
  assert.equal(isCalendarAccessTokenUsable(insideMargin, NOW), false)
  assert.equal(isCalendarAccessTokenUsable(outsideMargin, NOW), true)
})

test('executeWithCalendarAccessToken uses the cached token when the call succeeds', async () => {
  const deps = createDeps()
  const tokens: string[] = []

  const result = await executeWithCalendarAccessToken(
    'workspace-1',
    async (accessToken) => {
      tokens.push(accessToken)
      return 'ok'
    },
    deps
  )

  assert.equal(result, 'ok')
  assert.deepEqual(tokens, ['cached-token'])
  assert.deepEqual(deps.tokenCalls, [false])
  assert.deepEqual(deps.succeeded, ['workspace-1'])
})

test('executeWithCalendarAccessToken refreshes and retries once on a 401', async () => {
  const deps = createDeps()
  const tokens: string[] = []

  const result = await executeWithCalendarAccessToken(
    'workspace-1',
    async (accessToken) => {
      tokens.push(accessToken)
      if (accessToken === 'cached-token') {
        throw new Error('Google Calendar API error: 401 Unauthorized')
      }
      return 'ok'
    },
    deps
  )

  assert.equal(result, 'ok')
  assert.deepEqual(tokens, ['cached-token', 'fresh-token'])
  assert.deepEqual(deps.tokenCalls, [false, true])
  assert.deepEqual(deps.succeeded, ['workspace-1'])
})

test('executeWithCalendarAccessToken refreshes and retries once on invalid_grant', async () => {
  const deps = createDeps()
  let attempts = 0

  const result = await executeWithCalendarAccessToken(
    'workspace-1',
    async () => {
      attempts += 1
      if (attempts === 1) throw new Error('invalid_grant: token has been expired or revoked')
      return 'ok'
    },
    deps
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 2)
})

test('executeWithCalendarAccessToken retries at most once and marks the failure', async () => {
  const deps = createDeps()
  let attempts = 0

  await assert.rejects(
    () =>
      executeWithCalendarAccessToken(
        'workspace-1',
        async () => {
          attempts += 1
          throw new Error('401 Unauthorized')
        },
        deps
      ),
    /401 Unauthorized/
  )

  assert.equal(attempts, 2)
  assert.deepEqual(deps.succeeded, [])
  assert.equal(deps.failed.length, 1)
  assert.match(deps.failed[0], /Google Calendar 401 retry failed/)
})

test('executeWithCalendarAccessToken does not retry a 403 rate limit', async () => {
  const deps = createDeps()
  let attempts = 0

  await assert.rejects(
    () =>
      executeWithCalendarAccessToken(
        'workspace-1',
        async () => {
          attempts += 1
          throw new Error('Google Calendar API error: 403 Rate Limit Exceeded')
        },
        deps
      ),
    /Rate Limit Exceeded/
  )

  assert.equal(attempts, 1)
  assert.deepEqual(deps.tokenCalls, [false])
  assert.deepEqual(deps.succeeded, [])
  assert.deepEqual(deps.failed, [])
})
