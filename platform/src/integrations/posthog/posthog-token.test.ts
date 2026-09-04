import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveProjectToken,
  identifyUser,
  captureEvent,
  validateAndResolvePostHog,
} from './posthog'

describe('PostHog Project Write Token Resolution & Ingestion', () => {
  it('1. resolveProjectToken returns phc_ project key directly if passed', async () => {
    const token = await resolveProjectToken('phc_test_write_token', '123')
    assert.equal(token, 'phc_test_write_token')
  })

  it('2. resolveProjectToken fetches api_token from project details with personal key', async () => {
    const originalFetch = global.fetch
    try {
      global.fetch = async (url: any, options: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/projects/999/')) {
          assert.equal(options.headers.Authorization, 'Bearer phx_test_personal_key')
          return {
            ok: true,
            json: async () => ({
              id: 999,
              name: 'Test Project',
              api_token: 'phc_resolved_project_token_999',
            }),
          } as any
        }
        return { ok: false, status: 404 } as any
      }

      const token = await resolveProjectToken('phx_test_personal_key', '999')
      assert.equal(token, 'phc_resolved_project_token_999')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('3. identifyUser uses resolved project token in capture request, not personal key', async () => {
    const originalFetch = global.fetch
    let capturedBody: any = null

    try {
      global.fetch = async (url: any, options: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/projects/123/')) {
          return {
            ok: true,
            json: async () => ({
              id: 123,
              api_token: 'phc_valid_write_token_123',
            }),
          } as any
        }
        if (urlStr.includes('/capture/')) {
          capturedBody = JSON.parse(options.body)
          return {
            ok: true,
            text: async () => '{"status":1}',
          } as any
        }
        return { ok: true, json: async () => ({}) } as any
      }

      const result = await identifyUser('phx_my_personal_key', '123', {
        distinctId: 'rohan',
        properties: { plan: 'enterprise', role: 'admin' },
      })

      assert.equal(result.success, true)
      assert.equal(result.distinctId, 'rohan')
      assert.ok(capturedBody, 'Must have made a capture call')
      assert.equal(capturedBody.api_key, 'phc_valid_write_token_123')
      assert.equal(capturedBody.token, 'phc_valid_write_token_123')
      assert.equal(capturedBody.event, '$identify')
      assert.deepEqual(capturedBody.properties.$set, { plan: 'enterprise', role: 'admin' })
    } finally {
      global.fetch = originalFetch
    }
  })

  it('4. captureEvent transmits with resolved project token', async () => {
    const originalFetch = global.fetch
    let capturedBody: any = null

    try {
      global.fetch = async (url: any, options: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/projects/123/')) {
          return {
            ok: true,
            json: async () => ({
              id: 123,
              api_token: 'phc_valid_write_token_123',
            }),
          } as any
        }
        if (urlStr.includes('/capture/')) {
          capturedBody = JSON.parse(options.body)
          return {
            ok: true,
            text: async () => '{"status":1}',
          } as any
        }
        return { ok: true, json: async () => ({}) } as any
      }

      const result = await captureEvent('phx_my_personal_key', '123', {
        distinctId: 'rohan',
        event: 'plan_upgraded',
        properties: { tier: 'enterprise' },
      })

      assert.equal(result.success, true)
      assert.equal(capturedBody.api_key, 'phc_valid_write_token_123')
      assert.equal(capturedBody.event, 'plan_upgraded')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('5. validateAndResolvePostHog captures resolvedProjectToken', async () => {
    const originalFetch = global.fetch
    try {
      global.fetch = async (url: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/projects/')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  id: 456,
                  name: 'Prod',
                  api_token: 'phc_project_456_token',
                },
              ],
            }),
          } as any
        }
        return { ok: false, status: 404 } as any
      }

      const res = await validateAndResolvePostHog('phx_key_456', '456')
      assert.equal(res.valid, true)
      assert.equal(res.resolvedProjectToken, 'phc_project_456_token')
    } finally {
      global.fetch = originalFetch
    }
  })
})
