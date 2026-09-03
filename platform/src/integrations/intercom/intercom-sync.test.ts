import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syncIntercomWorkspace } from './intercom-sync';

const mockCreds = {
  accessToken: 'tok-123',
  apiBaseUrl: 'https://api.intercom.io',
};

describe('Intercom Workspace Sync Full Orchestration', () => {
  it('1. Inferred contact ID is not trusted canonically', async () => {
    let queriedVerifiedOnly = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = (field: string, val: any) => {
          if (table === 'provider_identities' && field === 'verification_status' && val === 'verified') {
            queriedVerifiedOnly = true;
          }
          return chain;
        };
        chain.delete = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: null, error: null });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => chain;
        chain.then = (resolve: (v: any) => any) => resolve({ data: [], error: null });
        return chain;
      },
      rpc: async () => ({ data: { status: 'ok' }, error: null }),
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/contacts')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'intercom-c-1',
                email: 'unmapped@external.io',
                name: 'External User',
              },
            ],
          }),
        } as any;
      }
      if (urlStr.includes('/conversations')) {
        return { ok: true, json: async () => ({ conversations: [] }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    };

    const result = await syncIntercomWorkspace('ws-test-intercom', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(queriedVerifiedOnly, true);
    assert.equal(result.syncedContacts, 0);
  });

  it('2. Exact verified email establishes verified Intercom contact ID', async () => {
    let writtenStatus: string | null = null;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.contains = () => chain;
        chain.eq = () => chain;
        chain.delete = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: null, error: null });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = () => chain;
        chain.then = (resolve: (v: any) => any) => {
          if (table === 'account_contacts') {
            return resolve({
              data: [
                {
                  email: 'founder@target.io',
                  customer_account_id: 'acc-verified-owner',
                  is_primary: true,
                  is_provisional: false,
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        if (fn === 'link_provider_identity_safely') {
          writtenStatus = args.p_verification_status;
        }
        return { data: { status: 'ok', accountId: args.p_customer_account_id }, error: null };
      },
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/contacts')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'intercom-c-2',
                email: 'founder@target.io',
                name: 'Target Founder',
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ conversations: [] }) } as any;
    };

    const result = await syncIntercomWorkspace('ws-test-intercom', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(writtenStatus, 'verified');
    assert.equal(result.syncedContacts, 1);
  });

  it('3. Identity conflict prevents conversation attribution', async () => {
    let conversationAttributed = false;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.contains = () => chain;
        chain.eq = () => chain;
        chain.delete = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: null, error: null });
        chain.insert = () => chain;
        chain.update = () => {
          if (table === 'customer_accounts') conversationAttributed = true;
          return chain;
        };
        chain.upsert = () => chain;
        chain.then = (resolve: (v: any) => any) => {
          if (table === 'account_contacts') {
            return resolve({
              data: [
                {
                  email: 'disputed@target.io',
                  customer_account_id: 'acc-owner',
                  is_primary: true,
                  is_provisional: false,
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
      rpc: async (fn: string, args: any) => {
        if (fn === 'link_provider_identity_safely') {
          return {
            data: {
              status: 'conflict',
              conflictId: 'conf-intercom-1',
              existingAccountId: 'acc-other',
              candidateAccountId: args.p_customer_account_id,
              reason: 'Intercom contact ID claimed by other account',
            },
            error: null,
          };
        }
        return { data: { status: 'ok' }, error: null };
      },
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/contacts')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'intercom-disputed-1',
                email: 'disputed@target.io',
                name: 'Disputed User',
              },
            ],
          }),
        } as any;
      }
      if (urlStr.includes('/conversations')) {
        return {
          ok: true,
          json: async () => ({
            conversations: [
              {
                id: 'convo-1',
                contacts: {
                  contacts: [{ id: 'intercom-disputed-1', email: 'disputed@target.io' }],
                },
                source: { body: 'I need help!' },
                updated_at: Math.floor(Date.now() / 1000),
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    };

    const result = await syncIntercomWorkspace('ws-test-intercom', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(result.identityConflicts, 1);
    assert.equal(result.syncedAccounts, 0);
    assert.equal(conversationAttributed, false);
  });

  it('4. Attributed support conversations enqueue project_account_features with frustration signals', async () => {
    let enqueuedJobPayload: any = null;

    const mockSupabase = {
      from: (table: string) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.contains = () => chain;
        chain.eq = () => chain;
        chain.delete = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.single = async () => ({ data: null, error: null });
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.upsert = (payload: any) => {
          if (table === 'workflow_jobs') enqueuedJobPayload = payload;
          return chain;
        };
        chain.then = (resolve: (v: any) => any) => {
          if (table === 'account_contacts') {
            return resolve({
              data: [
                {
                  email: 'support@cloudscale.io',
                  customer_account_id: 'acc-cloudscale-1',
                  is_primary: true,
                  is_provisional: false,
                },
              ],
              error: null,
            });
          }
          if (table === 'provider_identities') {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: null, error: null });
        };
        return chain;
      },
      rpc: async () => ({
        data: { status: 'ok', accountId: 'acc-cloudscale-1' },
        error: null,
      }),
    } as any;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/contacts')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'intercom-c-scale',
                email: 'support@cloudscale.io',
                name: 'Scale Admin',
              },
            ],
          }),
        } as any;
      }
      if (urlStr.includes('/conversations')) {
        return {
          ok: true,
          json: async () => ({
            conversations: [
              {
                id: 'convo-urgent-1',
                title: 'CRITICAL BUG: Workflow engine completely broken and failing',
                contacts: {
                  contacts: [{ id: 'intercom-c-scale', email: 'support@cloudscale.io' }],
                },
                source: { body: 'This is terrible and completely broken, we are extremely frustrated!' },
                updated_at: Math.floor(Date.now() / 1000),
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    };

    const result = await syncIntercomWorkspace('ws-test-intercom', {
      refreshBrief: false,
      supabaseClient: mockSupabase,
      credentialsOverride: mockCreds,
    });

    assert.equal(result.syncedAccounts, 1);
    assert.equal(result.openConversations, 1);
    assert.notEqual(enqueuedJobPayload, null);

    const patch = enqueuedJobPayload.payload.patch;
    assert.equal(patch.supportAvailable, true);
    assert.equal(patch.openSupportConversationCount, 1);
    assert.equal(patch.hasFrustrationSignals, true);
    assert.notEqual(patch.lastSupportTicketAt, null);
  });
});
