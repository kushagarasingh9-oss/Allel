import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scanCustomer, scanFleet } from './customer-scan-service'

describe('Unified Customer & Fleet Scan Service', () => {
  it('1. scanCustomer resolves account by email, runs classifier, and returns validated schema', async () => {
    const mockSupabase = {
      from: (table: string) => {
        const filters: Record<string, any> = {}
        const chain: any = {
          select: () => chain,
          eq: (field: string, val: any) => {
            filters[field] = val
            return chain
          },
          maybeSingle: async () => {
            if (table === 'account_contacts') {
              return {
                data: {
                  customer_account_id: '550e8400-e29b-41d4-a716-446655440000',
                  is_provisional: false,
                },
                error: null,
              }
            }
            if (table === 'customer_accounts') {
              return {
                data: {
                  id: '550e8400-e29b-41d4-a716-446655440000',
                  workspace_id: 'ws-test',
                  name: 'HighScale Systems',
                  account_status: 'past_due',
                  mrr_cents: 250000,
                  renewal_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                  is_provisional: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
              },
              error: null,
            }
          }
          if (table === 'account_features') {
            return {
              data: {
                customer_account_id: '550e8400-e29b-41d4-a716-446655440000',
                billing_available: true,
                payment_failure_count_7d: 3,
                subscription_status: 'past_due',
                usage_available: true,
                usage_current_7d: 50,
                usage_previous_7d: 50,
                usage_delta_percent: 0,
                support_available: false,
                open_support_conversation_count: 0,
                has_frustration_signals: false,
              },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        then: (resolve: (v: any) => any) => {
          if (table === 'account_contacts') {
            return resolve({
              data: [{ email: 'founder@highscale.io', is_primary: true, is_provisional: false }],
              error: null,
            })
          }
          if (table === 'provider_identities') {
            return resolve({
              data: [{ provider: 'stripe', identity_type: 'customer_id', normalized_external_id: 'cus_123', verification_status: 'verified' }],
              error: null,
            })
          }
          return resolve({ data: [], error: null })
        },
      }
      return chain
    },
  } as any

    const result = await scanCustomer(
      'ws-test',
      { email: 'founder@highscale.io' },
      { supabaseClient: mockSupabase }
    )

    assert.equal(result.accountId, '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(result.accountName, 'HighScale Systems')
    assert.equal(result.primaryEmail, 'founder@highscale.io')
    assert.equal(result.classification, 'imminent_churn')
    assert.equal(result.severity, 'critical')
    assert.equal(result.mrrAtRiskCents, 250000)
    assert.equal(result.likelyRootCause, 'payment_failure')
    assert.equal(result.recommendedAction.discountEligible, false)
    assert.ok(result.evidence.length >= 1)
  })

  it('2. scanFleet aggregates multiple accounts and sorts by severity and MRR', async () => {
    const mockAccounts = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        workspace_id: 'ws-test',
        name: 'Account 1 (Healthy)',
        account_status: 'active',
        mrr_cents: 10000,
        renewal_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        is_provisional: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        workspace_id: 'ws-test',
        name: 'Account 2 (Imminent Churn)',
        account_status: 'past_due',
        mrr_cents: 300000,
        renewal_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        is_provisional: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]

    const mockSupabase = {
      from: (table: string) => {
        const filters: Record<string, any> = {}
        const chain: any = {
          select: () => chain,
          eq: (field: string, val: any) => {
            filters[field] = val
            return chain
          },
          maybeSingle: async () => {
            if (table === 'customer_accounts') {
              const accountId = filters['id']
              const found = mockAccounts.find((a) => a.id === accountId)
              return { data: found ?? null, error: null }
            }
            if (table === 'account_features') {
              const accountId = filters['customer_account_id']
              if (accountId === '550e8400-e29b-41d4-a716-446655440002') {
                return {
                  data: {
                    customer_account_id: '550e8400-e29b-41d4-a716-446655440002',
                    billing_available: true,
                    payment_failure_count_7d: 2,
                    subscription_status: 'past_due',
                    usage_available: true,
                    usage_current_7d: 5,
                  },
                  error: null,
                }
              }
              if (accountId === '550e8400-e29b-41d4-a716-446655440001') {
                return {
                  data: {
                    customer_account_id: '550e8400-e29b-41d4-a716-446655440001',
                    billing_available: true,
                    subscription_status: 'active',
                    usage_available: true,
                    usage_current_7d: 50,
                  },
                  error: null,
                }
              }
            }
            return { data: null, error: null }
          },
          then: (resolve: (v: any) => any) => {
            if (table === 'customer_accounts') {
              return resolve({ data: mockAccounts, error: null })
            }
            if (table === 'account_contacts') {
              return resolve({ data: [{ email: 'user@example.com', is_primary: true, is_provisional: false }], error: null })
            }
            return resolve({ data: [], error: null })
          },
        }
        return chain
      },
    } as any

    const fleet = await scanFleet('ws-test', { supabaseClient: mockSupabase })

    assert.equal(fleet.totalAccountsScanned, 2)
    assert.equal(fleet.breakdown.imminentChurn, 1)
    assert.equal(fleet.breakdown.healthy, 1)
    assert.equal(fleet.totalMrrAtRiskCents, 300000)
    assert.equal(fleet.totalMrrProtectedCents, 10000)
    assert.equal(fleet.topAtRiskAccounts.length, 1)
    assert.equal(fleet.topAtRiskAccounts[0].accountId, '550e8400-e29b-41d4-a716-446655440002')
  })
})
