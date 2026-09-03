import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkspaceScan } from './run-workspace-scan'

describe('Block 6: Workspace Scan Orchestrator', () => {
  it('1. runWorkspaceScan coordinates multi-provider sync and returns fleet risk scan', async () => {
    let stripeCalled = false
    let posthogCalled = false
    let intercomCalled = false

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: (v: any) => any) => resolve({ data: [], error: null }),
          }),
        }),
      }),
    } as any

    const result = await runWorkspaceScan('ws-orchestrator-test', {
      supabaseClient: mockSupabase,
      syncOverrides: {
        stripe: async (wsId) => {
          stripeCalled = true
          return { syncedAccounts: 10 }
        },
        posthog: async (wsId) => {
          posthogCalled = true
          return { syncedPersons: 8 }
        },
        intercom: async (wsId) => {
          intercomCalled = true
          return { syncedContacts: 5 }
        },
      },
    })

    assert.equal(stripeCalled, true)
    assert.equal(posthogCalled, true)
    assert.equal(intercomCalled, true)
    assert.equal(result.workspaceId, 'ws-orchestrator-test')
    assert.equal(result.syncSummary.stripe.status, 'synced')
    assert.equal(result.syncSummary.stripe.syncedCount, 10)
    assert.equal(result.syncSummary.posthog.status, 'synced')
    assert.equal(result.syncSummary.posthog.syncedCount, 8)
    assert.equal(result.syncSummary.intercom.status, 'synced')
    assert.equal(result.syncSummary.intercom.syncedCount, 5)
    assert.ok(result.fleet)
    assert.equal(result.fleet.workspaceId, 'ws-orchestrator-test')
  })

  it('2. runWorkspaceScan with skipSync: true bypasses provider sync calls', async () => {
    let providerCalled = false

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: (v: any) => any) => resolve({ data: [], error: null }),
          }),
        }),
      }),
    } as any

    const result = await runWorkspaceScan('ws-orchestrator-test', {
      skipSync: true,
      supabaseClient: mockSupabase,
      syncOverrides: {
        stripe: async () => { providerCalled = true; return {} },
        posthog: async () => { providerCalled = true; return {} },
        intercom: async () => { providerCalled = true; return {} },
      },
    })

    assert.equal(providerCalled, false)
    assert.equal(result.syncSummary.stripe.status, 'skipped')
    assert.equal(result.syncSummary.posthog.status, 'skipped')
    assert.equal(result.syncSummary.intercom.status, 'skipped')
    assert.ok(result.fleet)
  })

  it('3. runWorkspaceScan isolates provider errors gracefully without failing scan', async () => {
    let posthogCalled = false
    let intercomCalled = false

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: (v: any) => any) => resolve({ data: [], error: null }),
          }),
        }),
      }),
    } as any

    const result = await runWorkspaceScan('ws-orchestrator-test', {
      supabaseClient: mockSupabase,
      syncOverrides: {
        stripe: async () => {
          throw new Error('Stripe API 401 Unauthorized (Invalid API Key)')
        },
        posthog: async () => {
          posthogCalled = true
          return { syncedPersons: 4 }
        },
        intercom: async () => {
          intercomCalled = true
          return { syncedContacts: 3 }
        },
      },
    })

    assert.equal(result.syncSummary.stripe.status, 'failed')
    assert.match(result.syncSummary.stripe.error || '', /Stripe API 401 Unauthorized/)
    assert.equal(posthogCalled, true)
    assert.equal(result.syncSummary.posthog.status, 'synced')
    assert.equal(intercomCalled, true)
    assert.equal(result.syncSummary.intercom.status, 'synced')
    assert.ok(result.fleet)
  })

  it('4. runWorkspaceScan filters sync to only specified providers', async () => {
    let stripeCalled = false
    let posthogCalled = false
    let intercomCalled = false

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: (v: any) => any) => resolve({ data: [], error: null }),
          }),
        }),
      }),
    } as any

    const result = await runWorkspaceScan('ws-orchestrator-test', {
      providers: ['posthog'],
      supabaseClient: mockSupabase,
      syncOverrides: {
        stripe: async () => { stripeCalled = true; return {} },
        posthog: async () => { posthogCalled = true; return { syncedPersons: 5 } },
        intercom: async () => { intercomCalled = true; return {} },
      },
    })

    assert.equal(stripeCalled, false)
    assert.equal(posthogCalled, true)
    assert.equal(intercomCalled, false)
    assert.equal(result.syncSummary.stripe.status, 'skipped')
    assert.equal(result.syncSummary.posthog.status, 'synced')
    assert.equal(result.syncSummary.intercom.status, 'skipped')
  })
})
