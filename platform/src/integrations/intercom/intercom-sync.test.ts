import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { linkContactSafely, upsertProviderIdentity } from '@/recovery/identity';

describe('Intercom Sync identity resolution safety contracts', () => {
  it('Intercom contact linkage enforces is_primary=false and role=support', async () => {
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
              return { data: { id: 'contact-support-1' }, error: null };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await linkContactSafely(supabase, {
      workspaceId: 'ws-intercom-1',
      customerAccountId: 'acc-intercom-1',
      email: 'user@acme.corp',
      name: 'User Support Contact',
      role: 'support',
      isPrimary: true, // Intercom caller attempts isPrimary=true, but helper MUST enforce false
      source: 'intercom_sync',
      isProvisional: false,
    });

    assert.equal(result.status, 'ok');
    assert.notEqual(insertedContact, null);
    assert.equal(insertedContact.is_primary, false); // Enforced to false
    assert.equal(insertedContact.role, 'support');
  });

  it('Intercom contact collision writes conflict and prevents attribution', async () => {
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
                      id: 'existing-contact',
                      customer_account_id: 'acc-original',
                      email: 'user@acme.corp',
                      is_primary: true,
                      is_provisional: false,
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
                  single: async () => ({ data: { id: 'conflict-intercom-99' }, error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await linkContactSafely(supabase, {
      workspaceId: 'ws-intercom-1',
      customerAccountId: 'acc-candidate-2',
      email: 'user@acme.corp',
      name: 'User Support Contact',
      role: 'support',
      source: 'intercom_sync',
    });

    assert.equal(result.status, 'conflict');
    assert.notEqual(conflictRecorded, null);
    assert.equal(conflictRecorded.existing_account_id, 'acc-original');
    assert.equal(conflictRecorded.candidate_account_id, 'acc-candidate-2');
  });

  it('Intercom contact ID identity write writes inferred status', async () => {
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
              return { data: { id: 'id-row-1' }, error: null };
            },
          };
        }
        return {};
      },
    } as any;

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-intercom-1',
      customerAccountId: 'acc-intercom-1',
      provider: 'intercom',
      identityType: 'contact_id',
      externalId: 'int_contact_12345',
      isPrimary: false,
      verificationStatus: 'inferred',
      source: 'intercom_sync',
    });

    assert.equal(result.status, 'ok');
    assert.notEqual(insertedIdentity, null);
    assert.equal(insertedIdentity.verification_status, 'inferred');
    assert.equal(insertedIdentity.is_primary, false);
  });
});
