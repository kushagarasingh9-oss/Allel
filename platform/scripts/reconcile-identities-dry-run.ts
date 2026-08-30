#!/usr/bin/env npx ts-node
/**
 * reconcile-identities-dry-run.ts
 * Read-only reconciliation script. Reports data quality issues without mutating anything.
 *
 * Usage:
 *   npx ts-node platform/scripts/reconcile-identities-dry-run.ts [workspace-uuid]
 *
 * If a workspace UUID is provided as the first argument, the report is scoped to that workspace.
 */
import { createServiceClient } from '../src/foundation/database/service'

interface ReconciliationReport {
  scannedAt: string
  workspaceFilter: string | null
  orphanIdentities: Array<{ id: string; provider: string; identityType: string; normalizedExternalId: string; customerAccountId: string }>
  duplicateAccounts: Array<{ workspaceId: string; provider: string; normalizedExternalId: string; accountIds: string[] }>
  namematchOnlyAccounts: Array<{ id: string; name: string; workspaceId: string; isProvisional: boolean }>
  contactConflicts: Array<{ workspaceId: string; email: string; accountIds: string[] }>
  testLiveLeakage: Array<{ id: string; workspaceId: string; provider: string; scenarioId: string; customerAccountId: string }>
  pendingConflicts: Array<{ id: string; workspaceId: string; provider: string; existingAccountId: string; candidateAccountId: string; reason: string; createdAt: string }>
}

async function main() {
  const workspaceId = process.argv[2] ?? null
  const supabase = createServiceClient()
  const report: ReconciliationReport = {
    scannedAt: new Date().toISOString(),
    workspaceFilter: workspaceId,
    orphanIdentities: [],
    duplicateAccounts: [],
    namematchOnlyAccounts: [],
    contactConflicts: [],
    testLiveLeakage: [],
    pendingConflicts: [],
  }

  // 1. Orphan provider_identities (linked to non-existent account)
  {
    let q = supabase
      .from('provider_identities')
      .select('id, provider, identity_type, normalized_external_id, customer_account_id')
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: allIdentities } = await q
    const { data: allAccounts } = await supabase
      .from('customer_accounts')
      .select('id')
    const accountIds = new Set((allAccounts ?? []).map((a: { id: string }) => a.id))
    report.orphanIdentities = ((allIdentities as Array<{ id: string; provider: string; identity_type: string; normalized_external_id: string; customer_account_id: string }> | null) ?? [])
      .filter((i) => !accountIds.has(i.customer_account_id))
      .map((i) => ({
        id: i.id,
        provider: i.provider,
        identityType: i.identity_type,
        normalizedExternalId: i.normalized_external_id,
        customerAccountId: i.customer_account_id,
      }))
  }

  // 2. Duplicate accounts sharing a Stripe/PostHog identity
  {
    let q = supabase
      .from('provider_identities')
      .select('workspace_id, provider, identity_type, normalized_external_id, customer_account_id')
      .in('identity_type', ['customer_id', 'distinct_id'])
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: identities } = await q
    const grouped = new Map<string, string[]>()
    for (const row of (identities as Array<{ workspace_id: string; provider: string; identity_type: string; normalized_external_id: string; customer_account_id: string }> | null) ?? []) {
      const key = `${row.workspace_id}:${row.provider}:${row.identity_type}:${row.normalized_external_id}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row.customer_account_id)
    }
    for (const [key, accountIds] of grouped.entries()) {
      if (accountIds.length > 1) {
        const [wsId, provider, , normalizedExternalId] = key.split(':')
        report.duplicateAccounts.push({ workspaceId: wsId, provider, normalizedExternalId, accountIds })
      }
    }
  }

  // 3. Name-match-only accounts (no provider_identities rows)
  {
    let q = supabase.from('customer_accounts').select('id, name, workspace_id, is_provisional')
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: accounts } = await q
    const { data: identities } = await supabase
      .from('provider_identities')
      .select('customer_account_id')
    const accountsWithIdentity = new Set(
      ((identities as Array<{ customer_account_id: string }> | null) ?? []).map((i) => i.customer_account_id)
    )
    report.namematchOnlyAccounts = ((accounts as Array<{ id: string; name: string; workspace_id: string; is_provisional: boolean }> | null) ?? [])
      .filter((a) => !accountsWithIdentity.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        workspaceId: a.workspace_id,
        isProvisional: a.is_provisional,
      }))
  }

  // 4. Contact email conflicts (same email mapped to 2+ accounts in same workspace)
  {
    let q = supabase.from('account_contacts').select('workspace_id, email, customer_account_id')
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: contacts } = await q
    const grouped = new Map<string, Set<string>>()
    for (const row of (contacts as Array<{ workspace_id: string; email: string; customer_account_id: string }> | null) ?? []) {
      const key = `${row.workspace_id}:${row.email}`
      if (!grouped.has(key)) grouped.set(key, new Set())
      grouped.get(key)!.add(row.customer_account_id)
    }
    for (const [key, accountIds] of grouped.entries()) {
      if (accountIds.size > 1) {
        const [wsId, email] = key.split(':')
        report.contactConflicts.push({ workspaceId: wsId, email, accountIds: Array.from(accountIds) })
      }
    }
  }

  // 5. Test/live leakage: scenario_id set on rows linked to non-provisional accounts
  {
    let q = supabase
      .from('provider_identities')
      .select('id, workspace_id, provider, scenario_id, customer_account_id')
      .not('scenario_id', 'is', null)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: scenarioIdentities } = await q
    const { data: provisionalAccounts } = await supabase
      .from('customer_accounts')
      .select('id, is_provisional')
    const provisionalSet = new Set(
      ((provisionalAccounts as Array<{ id: string; is_provisional: boolean }> | null) ?? [])
        .filter((a) => a.is_provisional)
        .map((a) => a.id)
    )
    report.testLiveLeakage = ((scenarioIdentities as Array<{ id: string; workspace_id: string; provider: string; scenario_id: string; customer_account_id: string }> | null) ?? [])
      .filter((i) => !provisionalSet.has(i.customer_account_id))
      .map((i) => ({
        id: i.id,
        workspaceId: i.workspace_id,
        provider: i.provider,
        scenarioId: i.scenario_id,
        customerAccountId: i.customer_account_id,
      }))
  }

  // 6. Pending identity_conflicts
  {
    let q = supabase
      .from('identity_conflicts')
      .select('id, workspace_id, provider, existing_account_id, candidate_account_id, reason, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: conflicts } = await q
    report.pendingConflicts = ((conflicts as Array<{ id: string; workspace_id: string; provider: string; existing_account_id: string; candidate_account_id: string; reason: string; created_at: string }> | null) ?? []).map((c) => ({
      id: c.id,
      workspaceId: c.workspace_id,
      provider: c.provider as any,
      existingAccountId: c.existing_account_id,
      candidateAccountId: c.candidate_account_id,
      reason: c.reason,
      createdAt: c.created_at,
    }))
  }

  console.log(JSON.stringify(report, null, 2))
  console.log('\n--- Summary ---')
  console.log(`Orphan identities:        ${report.orphanIdentities.length}`)
  console.log(`Duplicate accounts:       ${report.duplicateAccounts.length}`)
  console.log(`Name-match-only accounts: ${report.namematchOnlyAccounts.length}`)
  console.log(`Contact conflicts:        ${report.contactConflicts.length}`)
  console.log(`Test/live leakage:        ${report.testLiveLeakage.length}`)
  console.log(`Pending conflicts:        ${report.pendingConflicts.length}`)

  const totalIssues =
    report.orphanIdentities.length +
    report.duplicateAccounts.length +
    report.contactConflicts.length +
    report.testLiveLeakage.length +
    report.pendingConflicts.length

  if (totalIssues > 0) {
    console.log(`\n⚠️  ${totalIssues} data quality issue(s) found. Review the report before running migrations.`)
    process.exit(1)
  } else {
    console.log('\n✅ No data quality issues found.')
  }
}

main().catch((err) => {
  console.error('Reconciliation script failed:', err)
  process.exit(1)
})
