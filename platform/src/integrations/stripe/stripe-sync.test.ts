import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syncStripeWorkspace } from './stripe-sync';

const mockSyncSubscriptions = async (workspaceId: string) => {
  return [
    {
      subscriptionId: 'sub_123',
      stripeCustomerId: 'cus_123',
      customerEmail: 'billing@acme.corp',
      customerName: 'Acme Corp',
      planName: 'Enterprise',
      status: 'active',
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      mrrCents: 50000,
    },
  ];
};

describe('Stripe Workspace Sync Full Orchestration', () => {
  it('1. Same-name account is never mutated without verified identity (creates isolated account)', async () => {
    let createdAccountPayload: any = null;
    let mutatedExistingAccount = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => {
          if (table === 'customer_accounts') {
            return { data: { id: 'acc-isolated-new' }, error: null };
          }
          return { data: null, error: null };
        };
        chain.insert = (payload: any) => {
          if (table === 'customer_accounts') createdAccountPayload = payload;
          return chain;
        };
        chain.update = (payload: any) => {
          if (table === 'customer_accounts') mutatedExistingAccount = true;
          return chain;
        };
        chain.upsert = () => chain;
        chain.then = (resolve: (v: any) => any) => {
          if (table === 'customer_accounts') {
            // Existing account with same name 'Acme Corp' but no matching stripe_id
            return resolve({
              data: [
                {
                  id: 'acc-existing-same-name',
                  name: 'Acme Corp',
                  account_status: 'active',
                  mrr_cents: 10000,
                  risk_level: 'low',
                  risk_score: 10,
                  usage_delta_percent: 0,
                  is_provisional: false,
                },
              ],
              error: null,
            });
          }
          if (table === 'account_contacts') return resolve({ data: [], error: null });
          if (table === 'provider_identities') return resolve({ data: [], error: null });
          return resolve({ data: null, error: null });
        };
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        return {
          data: { status: 'ok', accountId: args.p_customer_account_id ?? 'acc-isolated-new', created: true },
          error: null,
        };
      },
    } as any;

    const result = await syncStripeWorkspace('ws-test-stripe', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      syncSubscriptionsFn: mockSyncSubscriptions,
    });

    assert.equal(result.syncedAccounts, 1);
    assert.equal(result.identityConflicts, 1); // Reported name candidate conflict
    assert.equal(mutatedExistingAccount, false); // Never mutated existing account
    assert.notEqual(createdAccountPayload, null);
    assert.equal(createdAccountPayload.is_provisional ?? false, false);
  });

  it('2. Primary customer-ID conflict/error produces no billing update, signal, timeline, or workflow job', async () => {
    let mutatedAccount = false;
    let createdSignal = false;
    let createdTimeline = false;
    let createdJob = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: { id: 'acc-new-temp' }, error: null });
        chain.insert = () => {
          if (table === 'account_signals') createdSignal = true;
          if (table === 'account_timeline') createdTimeline = true;
          return chain;
        };
        chain.update = () => {
          if (table === 'customer_accounts') mutatedAccount = true;
          return chain;
        };
        chain.upsert = () => {
          if (table === 'workflow_jobs') createdJob = true;
          return chain;
        };
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        if (fn === 'link_provider_identity_safely') {
          // Simulate customer-ID conflict
          return {
            data: {
              status: 'conflict',
              conflictId: 'conf-1',
              existingAccountId: 'acc-other',
              candidateAccountId: args.p_customer_account_id,
              reason: 'Customer ID already belongs to other account',
            },
            error: null,
          };
        }
        return { data: { status: 'ok' }, error: null };
      },
    } as any;

    const result = await syncStripeWorkspace('ws-test-stripe', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      syncSubscriptionsFn: mockSyncSubscriptions,
    });

    assert.equal(result.syncedAccounts, 0); // Not counted as synced
    assert.equal(result.identityConflicts, 1);
    assert.equal(mutatedAccount, false);
    assert.equal(createdSignal, false);
    assert.equal(createdTimeline, false);
    assert.equal(createdJob, false);
  });

  it('3. Contact conflict produces no downstream projection', async () => {
    let createdJob = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: { id: 'acc-new-temp' }, error: null });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => {
          if (table === 'workflow_jobs') createdJob = true;
          return chain;
        };
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        if (fn === 'link_provider_identity_safely') {
          return { data: { status: 'ok', accountId: args.p_customer_account_id }, error: null };
        }
        if (fn === 'link_account_contact_safely') {
          // Contact conflict
          return {
            data: {
              status: 'conflict',
              conflictId: 'contact-conf-1',
              existingAccountId: 'acc-other',
              candidateAccountId: args.p_customer_account_id,
              reason: 'Email already mapped elsewhere',
            },
            error: null,
          };
        }
        return { data: { status: 'ok' }, error: null };
      },
    } as any;

    const result = await syncStripeWorkspace('ws-test-stripe', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      syncSubscriptionsFn: mockSyncSubscriptions,
    });

    assert.equal(result.syncedAccounts, 0);
    assert.equal(result.identityConflicts, 1);
    assert.equal(result.updatedContacts, 0);
    assert.equal(createdJob, false);
  });

  it('4. Subscription-ID conflict halts downstream projection', async () => {
    let createdJob = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: { id: 'acc-new-temp' }, error: null });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => {
          if (table === 'workflow_jobs') createdJob = true;
          return chain;
        };
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        if (fn === 'link_provider_identity_safely' && args.p_identity_type === 'subscription_id') {
          return {
            data: {
              status: 'conflict',
              conflictId: 'sub-conf-1',
              existingAccountId: 'acc-other',
              candidateAccountId: args.p_customer_account_id,
              reason: 'Subscription ID already mapped elsewhere',
            },
            error: null,
          };
        }
        return { data: { status: 'ok', accountId: args.p_customer_account_id }, error: null };
      },
    } as any;

    const result = await syncStripeWorkspace('ws-test-stripe', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      syncSubscriptionsFn: mockSyncSubscriptions,
    });

    assert.equal(result.syncedAccounts, 0);
    assert.equal(result.identityConflicts, 1);
    assert.equal(createdJob, false);
  });

  it('5. Successful verified flow updates the intended account only', async () => {
    let createdJob = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: { id: 'acc-verified-123' }, error: null });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => {
          if (table === 'workflow_jobs') createdJob = true;
          return chain;
        };
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        return { data: { status: 'ok', accountId: args.p_customer_account_id }, error: null };
      },
    } as any;

    const result = await syncStripeWorkspace('ws-test-stripe', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      syncSubscriptionsFn: mockSyncSubscriptions,
    });

    assert.equal(result.syncedAccounts, 1);
    assert.equal(result.updatedContacts, 1);
    assert.equal(result.identityConflicts, 0);
    assert.equal(createdJob, true);
  });
});
