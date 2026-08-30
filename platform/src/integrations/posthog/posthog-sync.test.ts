import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { upsertProviderIdentity, linkContactSafely } from '@/recovery/identity';

describe('PostHog Sync identity resolution safety contracts', () => {
  it('upsertProviderIdentity writes person_email as inferred (never verified)', async () => {
    let insertedIdentity: any = null;

    const supabase = {
      from: (table: string) => {
        if (table === 'provider_identities') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async (payload: any) => {
              insertedIdentity = payload;
              return { error: null };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-ph-1',
      customerAccountId: 'acc-ph-1',
      provider: 'posthog',
      identityType: 'person_email',
      externalId: 'user@client.com',
      source: 'posthog_sync',
      verificationStatus: 'inferred',
    });

    assert.equal(result.status, 'ok');
    assert.notEqual(insertedIdentity, null);
    assert.equal(insertedIdentity.verification_status, 'inferred');
    assert.equal(insertedIdentity.normalized_external_id, 'user@client.com');
  });

  it('upsertProviderIdentity writes distinct_id as inferred when resolved by name only', async () => {
    let insertedIdentity: any = null;

    const supabase = {
      from: (table: string) => {
        if (table === 'provider_identities') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async (payload: any) => {
              insertedIdentity = payload;
              return { error: null };
            },
          };
        }
        return {};
      },
    } as any;

    const isNameMatchOnly = true;
    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-ph-1',
      customerAccountId: 'acc-ph-name-only',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'distinct_user_999',
      isPrimary: true,
      verificationStatus: isNameMatchOnly ? 'inferred' : 'verified',
      source: 'posthog_sync',
    });

    assert.equal(result.status, 'ok');
    assert.notEqual(insertedIdentity, null);
    assert.equal(insertedIdentity.verification_status, 'inferred');
  });

  it('upsertProviderIdentity detects distinct_id collision and surfaces conflict', async () => {
    let conflictRecorded: any = null;

    const supabase = {
      from: (table: string) => {
        if (table === 'provider_identities') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: 'pi-1',
                          customer_account_id: 'acc-original-ph-owner',
                          verification_status: 'verified',
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'identity_conflicts') {
          return {
            insert: (payload: any) => {
              conflictRecorded = payload;
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'conf-ph-1' }, error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-ph-1',
      customerAccountId: 'acc-intruder',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'distinct_user_999',
      source: 'posthog_sync',
    });

    assert.equal(result.status, 'conflict');
    assert.notEqual(conflictRecorded, null);
    assert.equal(conflictRecorded.existing_account_id, 'acc-original-ph-owner');
    assert.equal(conflictRecorded.candidate_account_id, 'acc-intruder');
  });
});
