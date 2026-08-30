import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syncPostHogWorkspace } from './posthog-sync';

const mockCreds = { apiKey: 'ph-key-1', projectId: 'proj-1', apiHost: null };

describe('PostHog Workspace Sync Full Orchestration', () => {
  it('1. Same-name person creates isolated provisional state and does not mutate canonical account', async () => {
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
            return {
              data: {
                id: 'acc-provisional-new',
                name: 'Acme Corp',
                account_status: 'active',
                mrr_cents: 0,
                risk_level: null,
                risk_score: null,
                usage_delta_percent: 0,
                open_issue: null,
                next_action: null,
                summary: null,
                last_touch_at: null,
                renewal_at: null,
                is_provisional: true,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        chain.insert = (payload: any) => {
          if (table === 'customer_accounts') createdAccountPayload = payload;
          return chain;
        };
        chain.update = () => {
          if (table === 'customer_accounts') mutatedExistingAccount = true;
          return chain;
        };
        chain.upsert = () => chain;
        chain.then = (resolve: (v: any) => any) => {
          if (table === 'customer_accounts') {
            return resolve({
              data: [
                {
                  id: 'acc-canonical-existing',
                  name: 'Acme Corp',
                  account_status: 'active',
                  mrr_cents: 20000,
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
        return { data: { status: 'ok', accountId: args.p_customer_account_id }, error: null };
      },
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/persons')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'ph-person-1',
                properties: { company: 'Acme Corp', email: 'user@acme.corp' },
                distinct_ids: ['dist_1'],
                created_at: new Date().toISOString(),
              },
            ],
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({ results: [] }),
      } as any;
    };

    const result = await syncPostHogWorkspace('ws-test-ph', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(result.provisionalAccounts, 1);
    assert.equal(result.identityConflicts, 1); // Reported name candidate conflict
    assert.equal(mutatedExistingAccount, false);
    assert.notEqual(createdAccountPayload, null);
    assert.equal(createdAccountPayload.is_provisional, true);
    assert.equal(result.syncedAccounts, 0); // Provisional accounts do not count as synced canonical accounts
  });

  it('2. Provisional account does not enqueue feature/scoring jobs', async () => {
    let enqueuedJobs = 0;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({
          data: {
            id: 'acc-provisional-1',
            name: 'Beta User',
            is_provisional: true,
          },
          error: null,
        });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => {
          if (table === 'workflow_jobs') enqueuedJobs += 1;
          return chain;
        };
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async (fn: string, args: any) => ({
        data: { status: 'ok', accountId: args.p_customer_account_id },
        error: null,
      }),
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/persons')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'ph-person-2',
                properties: { name: 'Beta User' },
                distinct_ids: ['dist_beta'],
                created_at: new Date().toISOString(),
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ results: [] }) } as any;
    };

    const result = await syncPostHogWorkspace('ws-test-ph', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(result.provisionalAccounts, 1);
    assert.equal(enqueuedJobs, 0); // Zero jobs enqueued for provisional accounts
  });

  it('3. Conflicting distinct IDs do not enter maps or aggregates', async () => {
    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({
          data: { id: 'acc-provisional-conflict', name: 'Conflicting Co', is_provisional: true },
          error: null,
        });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => chain;
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        if (fn === 'link_provider_identity_safely') {
          return {
            data: {
              status: 'conflict',
              conflictId: 'conf-ph-dist',
              existingAccountId: 'acc-original-owner',
              candidateAccountId: args.p_customer_account_id,
              reason: 'Distinct ID already linked to original owner',
            },
            error: null,
          };
        }
        return { data: { status: 'ok', accountId: args.p_customer_account_id }, error: null };
      },
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/persons')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'ph-person-conflict',
                properties: { company: 'Conflicting Co' },
                distinct_ids: ['dist_stolen'],
                created_at: new Date().toISOString(),
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ results: [] }) } as any;
    };

    const result = await syncPostHogWorkspace('ws-test-ph', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(result.identityConflicts, 1);
    assert.equal(result.syncedAccounts, 0);
  });
});
