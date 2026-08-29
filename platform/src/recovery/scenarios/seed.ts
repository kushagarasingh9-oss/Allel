import { SupabaseClient } from '@supabase/supabase-js';
import { SCENARIO_MANIFEST_V1 } from './manifest.v1';
import { upsertProviderIdentity } from '../identity';
import { projectAccountFeatures } from '../features';
import { createScenarioRun } from './runs';

export async function seedScenarios(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: { scenarioRunId?: string; testMode?: boolean }
): Promise<{ seededCount: number; accountIds: Record<string, string>; scenarioRunId: string }> {
  const scenarioRunId = await createScenarioRun(supabase, {
    workspaceId,
    scenarioRunId: options?.scenarioRunId,
    testMode: options?.testMode ?? true,
    metadata: { manifest: 'v1' },
  });
  const accountIds: Record<string, string> = {};

  for (const def of SCENARIO_MANIFEST_V1) {
    const domain = `${def.scenarioId.toLowerCase()}.example.com`;

    // 1. Find existing account by domain or name
    const { data: existingAccount } = await supabase
      .from('customer_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('scenario_run_id', scenarioRunId)
      .eq('scenario_id', def.scenarioId)
      .limit(1)
      .maybeSingle();

    const accountPayload = {
      workspace_id: workspaceId,
      name: def.accountName,
      account_status: def.featuresPatch.billingStatus === 'cancelled' ? 'cancelled' : def.featuresPatch.billingStatus === 'past_due' ? 'past_due' : 'active',
      mrr_cents: def.featuresPatch.currentMrrCents ?? def.initialMrrCents,
      risk_score: def.expectedRisk ? (def.expectedSeverity === 'critical' ? 95 : 75) : 20,
      risk_level: def.expectedSeverity === 'critical' ? 'high' : def.expectedSeverity,
      domain,
      contact_email: def.contactEmail,
      scenario_id: def.scenarioId,
      scenario_run_id: scenarioRunId,
      updated_at: new Date().toISOString(),
    };

    let accountId: string;
    if (existingAccount?.id) {
      const { error: updateError } = await supabase
        .from('customer_accounts')
        .update(accountPayload)
        .eq('id', existingAccount.id);
      if (updateError) {
        throw new Error(`Failed to update account ${def.accountName}: ${updateError.message}`);
      }
      accountId = existingAccount.id;
    } else {
      const { data: newAcc, error: insertError } = await supabase
        .from('customer_accounts')
        .insert(accountPayload)
        .select('id')
        .single();
      if (insertError || !newAcc) {
        throw new Error(`Failed to insert account ${def.accountName}: ${insertError?.message}`);
      }
      accountId = newAcc.id;
    }

    accountIds[def.scenarioId] = accountId;

    // 2. Upsert account_contact
    const { data: existingContact } = await supabase
      .from('account_contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .limit(1)
      .maybeSingle();

    const contactPayload = {
      workspace_id: workspaceId,
      customer_account_id: accountId,
      name: `${def.accountName} Primary`,
      email: def.contactEmail.toLowerCase(),
      role: 'Owner',
      is_primary: true,
      external_ids: {
        stripe_customer_id: def.stripeCustomerId,
        posthog_distinct_ids: [def.posthogDistinctId],
      },
      scenario_id: def.scenarioId,
      scenario_run_id: scenarioRunId,
      updated_at: new Date().toISOString(),
    };

    if (existingContact?.id) {
      await supabase
        .from('account_contacts')
        .update(contactPayload)
        .eq('id', existingContact.id);
    } else {
      await supabase
        .from('account_contacts')
        .insert(contactPayload);
    }

    // 3. Upsert provider identities
    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: accountId,
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: def.stripeCustomerId,
      isPrimary: true,
      source: 'scenario_seed',
      scenarioId: def.scenarioId,
      scenarioRunId,
    });

    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: accountId,
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: def.posthogDistinctId,
      isPrimary: true,
      source: 'scenario_seed',
      scenarioId: def.scenarioId,
      scenarioRunId,
    });

    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: accountId,
      provider: 'gmail',
      identityType: 'email_address',
      externalId: def.contactEmail,
      isPrimary: true,
      source: 'scenario_seed',
      scenarioId: def.scenarioId,
      scenarioRunId,
    });

    // 4. Upsert contact policy if present
    if (def.contactPolicy) {
      const { error: policyError } = await supabase.from('contact_policies').upsert(
        {
          workspace_id: workspaceId,
          customer_account_id: accountId,
          channel: 'email',
          address: def.contactEmail.toLowerCase(),
          policy: def.contactPolicy,
          reason: 'Configured scenario policy',
          source: 'scenario_seed',
          scenario_id: def.scenarioId,
          scenario_run_id: scenarioRunId,
        },
        { onConflict: 'workspace_id,customer_account_id,channel' }
      );
      if (policyError) {
        throw new Error(`Failed to persist scenario contact policy: ${policyError.message}`);
      }
    }

    // 5. Project canonical features
    await projectAccountFeatures(supabase, {
      workspaceId,
      customerAccountId: accountId,
      patch: {
        ...def.featuresPatch,
        stripeCustomerId: def.stripeCustomerId,
        billingFreshAt: new Date().toISOString(),
        usageFreshAt: new Date().toISOString(),
        communicationFreshAt: new Date().toISOString(),
      },
      scenarioRunId,
    });
  }

  return { seededCount: SCENARIO_MANIFEST_V1.length, accountIds, scenarioRunId };
}
