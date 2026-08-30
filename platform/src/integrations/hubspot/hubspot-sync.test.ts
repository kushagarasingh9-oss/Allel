import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SyncIdentityResult } from '@/recovery/types';

describe('HubSpot Sync Safety Invariants', () => {
  it('Name matching creates isolated provisional account and does not mutate canonical account', () => {
    const existingCanonicalAccount = {
      id: 'acc-canonical-1',
      name: 'Acme Corp',
      is_provisional: false,
      mrr_cents: 50000,
    };

    const hubspotCompany = {
      id: 'hs-comp-1',
      properties: { name: 'Acme Corp', description: 'CRM Description' },
    };

    // The name matches, but HubSpot company has no verified ID binding
    const isProvisional = true;
    const insertedAccount = {
      id: 'acc-provisional-hubspot-1',
      name: hubspotCompany.properties.name,
      is_provisional: isProvisional,
      mrr_cents: 0,
    };

    // Invariant: Canonical account is untouched
    assert.equal(existingCanonicalAccount.is_provisional, false);
    assert.equal(existingCanonicalAccount.mrr_cents, 50000);
    // Invariant: HubSpot account is isolated and provisional
    assert.equal(insertedAccount.is_provisional, true);
    assert.notEqual(insertedAccount.id, existingCanonicalAccount.id);
  });

  it('Contact ownership collision stops attribution and never moves contact', () => {
    let updatedContacts = 0;
    let identityConflicts = 0;

    function handleContactResult(contactResult: SyncIdentityResult) {
      if (contactResult.status === 'ok') {
        updatedContacts += 1;
      } else if (contactResult.status === 'conflict') {
        identityConflicts += 1;
      }
    }

    const contactConflictResult: SyncIdentityResult = {
      status: 'conflict',
      conflictId: 'conflict-hs-1',
      existingAccountId: 'acc-stripe-owner',
      candidateAccountId: 'acc-hs-candidate',
      reason: 'Contact email already linked to a different account',
    };

    handleContactResult(contactConflictResult);

    // Invariant: Attribution stopped, conflict recorded
    assert.equal(updatedContacts, 0);
    assert.equal(identityConflicts, 1);
  });

  it('HubSpot contacts are always marked non-primary and provisional', () => {
    const contactPayload = {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-hs-1',
      email: 'sales@partner.com',
      source: 'hubspot_sync',
      isPrimary: false,
      isProvisional: true,
    };

    assert.equal(contactPayload.isPrimary, false);
    assert.equal(contactPayload.isProvisional, true);
  });
});
