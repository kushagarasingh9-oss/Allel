import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { linkContactSafely, upsertProviderIdentity } from '@/recovery/identity';

describe('Stripe Sync identity resolution safety contracts', () => {
  it('linkContactSafely links a new billing contact when absent', async () => {
    let insertedContact: any = null;

    const supabase = {
      from: (table: string) => {
        if (table === 'account_contacts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: async (payload: any) => {
              insertedContact = payload;
              return { data: { id: 'contact-new' }, error: null };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await linkContactSafely(supabase, {
      workspaceId: 'ws-stripe-1',
      customerAccountId: 'acc-stripe-1',
      email: 'billing@acme.corp',
      name: 'Acme Billing',
      role: 'billing',
      isPrimary: true,
      externalIds: { stripe_customer_id: 'cus_123' },
      source: 'stripe_sync',
      isProvisional: false,
    });

    assert.equal(result.status, 'ok');
    assert.notEqual(insertedContact, null);
    assert.equal(insertedContact.email, 'billing@acme.corp');
    assert.equal(insertedContact.customer_account_id, 'acc-stripe-1');
    assert.equal(insertedContact.is_provisional, false);
  });

  it('linkContactSafely records conflict when email already belongs to another account', async () => {
    let conflictRecorded: any = null;

    const supabase = {
      from: (table: string) => {
        if (table === 'account_contacts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'contact-existing',
                      customer_account_id: 'acc-original-owner',
                      email: 'shared@acme.corp',
                    },
                    error: null,
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
                  single: async () => ({ data: { id: 'conf-1' }, error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await linkContactSafely(supabase, {
      workspaceId: 'ws-stripe-1',
      customerAccountId: 'acc-intruder',
      email: 'shared@acme.corp',
      source: 'stripe_sync',
    });

    assert.equal(result.status, 'conflict');
    assert.notEqual(conflictRecorded, null);
    assert.equal(conflictRecorded.existing_account_id, 'acc-original-owner');
    assert.equal(conflictRecorded.candidate_account_id, 'acc-intruder');
  });

  it('upsertProviderIdentity does not verify identity on name-match provisional accounts', async () => {
    // When an account is matched by name only, the sync skips calling upsertProviderIdentity with 'verified'
    // This test verifies that upsertProviderIdentity with 'inferred' correctly sets the verification_status.
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
      workspaceId: 'ws-stripe-1',
      customerAccountId: 'acc-name-match',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_name_matched_123',
      source: 'stripe_sync',
      verificationStatus: 'inferred',
    });

    assert.equal(result.status, 'ok');
    assert.equal(insertedIdentity.verification_status, 'inferred');
  });
});
