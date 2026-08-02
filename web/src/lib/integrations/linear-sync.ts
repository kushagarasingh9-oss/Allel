import { createServiceClient } from '@/lib/supabase/service'
import { logAgentRun } from '@/lib/agent/run-logger'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { buildAccountsByName, matchAccountIdFromText } from './account-match'
import { fetchLinearIssues, getLinearCredentials } from './linear'
import { mergeIntegrationConnectionMetadata } from './connection-guard'

type ExistingAccount = {
  id: string
  name: string
  open_issue: string | null
}

type ExistingContact = {
  email: string
  customer_account_id: string
}

export type LinearWorkspaceSyncResult = {
  matchedAccounts: number
  openIssues: number
}

export async function syncLinearWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<LinearWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { apiKey, teamKey } = await getLinearCredentials(workspaceId)

  const [issues, accountsRes, contactsRes] = await Promise.all([
    fetchLinearIssues(apiKey, teamKey),
    supabase.from('customer_accounts').select('id, name, open_issue').eq('workspace_id', workspaceId),
    supabase.from('account_contacts').select('email, customer_account_id').eq('workspace_id', workspaceId),
  ])

  if (accountsRes.error) throw accountsRes.error
  if (contactsRes.error) throw contactsRes.error

  const accounts = (accountsRes.data as ExistingAccount[] | null) ?? []
  const contacts = (contactsRes.data as ExistingContact[] | null) ?? []
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const accountsByName = buildAccountsByName(accounts)
  const contactsByEmail = new Map(contacts.map((contact) => [contact.email.toLowerCase(), contact]))

  const { error: clearSignalsError } = await supabase
    .from('account_signals')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('signal_type', 'linear_issue')

  if (clearSignalsError) throw clearSignalsError

  let matchedAccounts = 0

  for (const issue of issues) {
    const searchableText = [issue.title, issue.description, issue.url, issue.identifier].filter(Boolean).join(' ')
    const accountId = matchAccountIdFromText(searchableText, accountsByName, contactsByEmail)

    if (!accountId) {
      continue
    }

    const account = accountsById.get(accountId)
    if (!account) continue

    if (!account.open_issue) {
      const { error: accountError } = await supabase
        .from('customer_accounts')
        .update({ open_issue: `${issue.identifier}: ${issue.title}` })
        .eq('id', accountId)

      if (accountError) throw accountError
      account.open_issue = `${issue.identifier}: ${issue.title}`
    }

    const { error: signalError } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      signal_type: 'linear_issue',
      headline: `${issue.identifier}: ${issue.title}`,
      detail:
        issue.description?.slice(0, 280) ||
        'A Linear issue matched this account and may be affecting the customer experience.',
      next_step: 'Check the linked Linear issue before following up with the account.',
      evidence: [
        ...(issue.team?.name ? [`Team: ${issue.team.name}`] : []),
        ...(issue.state?.name ? [`State: ${issue.state.name}`] : []),
        ...(typeof issue.priority === 'number' ? [`Priority: ${issue.priority}`] : []),
      ],
      risk_level: 'medium',
    })

    if (signalError) throw signalError

    const { data: existingTimeline, error: existingTimelineError } = await supabase
      .from('account_timeline')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .eq('event_type', 'note')
      .contains('metadata', { linear_issue_id: issue.id })
      .maybeSingle()

    if (existingTimelineError) throw existingTimelineError

    if (!existingTimeline) {
      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        event_type: 'note',
        headline: `${issue.identifier}: ${issue.title}`,
        detail:
          issue.description?.slice(0, 280) ||
          'A Linear issue matched this account and may be affecting the customer experience.',
        source: 'linear',
        metadata: {
          linear_issue_id: issue.id,
          linear_url: issue.url,
          linear_state: issue.state?.name,
          linear_team: issue.team?.key,
        },
        event_at: issue.updatedAt ?? new Date().toISOString(),
      })

      if (timelineError) throw timelineError
    }

    matchedAccounts += 1
  }

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'linear',
      status: 'connected',
      last_synced_at: new Date().toISOString(),
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'linear', {
        team_key: teamKey,
        coverage: `${issues.length} open issue(s), ${matchedAccounts} matched account signal(s)`,
        open_issues: issues.length,
        matched_accounts: matchedAccounts,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `Linear sync completed: ${issues.length} open issue(s), ${matchedAccounts} matched account signal(s).`,
    metadata: {
      provider: 'linear',
      openIssues: issues.length,
      matchedAccounts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    matchedAccounts,
    openIssues: issues.length,
  }
}
