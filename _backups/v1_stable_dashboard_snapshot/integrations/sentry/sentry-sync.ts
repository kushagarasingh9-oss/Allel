import { createServiceClient } from '@/foundation/database/service'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { buildAccountsByName, matchAccountIdFromText } from '@/integrations/_core/account-match'
import { fetchSentryIssues, getSentryCredentials } from '@/integrations/sentry/sentry'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'

type ExistingAccount = {
  id: string
  name: string
  open_issue: string | null
}

type ExistingContact = {
  email: string
  customer_account_id: string
}

export type SentryWorkspaceSyncResult = {
  matchedAccounts: number
  openIssues: number
}

export async function syncSentryWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<SentryWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { authToken, organizationSlug, projectSlug } = await getSentryCredentials(workspaceId)

  const [issues, accountsRes, contactsRes] = await Promise.all([
    fetchSentryIssues(authToken, organizationSlug, projectSlug),
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
    .eq('signal_type', 'sentry_issue')

  if (clearSignalsError) throw clearSignalsError

  let matchedAccounts = 0

  for (const issue of issues) {
    const searchableText = [issue.title, issue.culprit, issue.permalink].filter(Boolean).join(' ')
    const accountId = matchAccountIdFromText(searchableText, accountsByName, contactsByEmail)

    if (!accountId) {
      continue
    }

    const account = accountsById.get(accountId)
    if (!account) continue

    const headline = issue.title?.trim() || 'Sentry issue detected'
    const detail = issue.culprit?.trim() || 'A Sentry issue was matched to this account.'

    if (!account.open_issue) {
      const { error: accountError } = await supabase
        .from('customer_accounts')
        .update({ open_issue: headline })
        .eq('id', accountId)

      if (accountError) throw accountError
      account.open_issue = headline
    }

    const { error: signalError } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      signal_type: 'sentry_issue',
      headline,
      detail,
      next_step: 'Review the linked product issue before the next founder follow-up.',
      evidence: [
        ...(issue.level ? [`Level: ${issue.level}`] : []),
        ...(issue.userCount ? [`Users affected: ${issue.userCount}`] : []),
        ...(issue.count ? [`Events: ${issue.count}`] : []),
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
      .contains('metadata', { sentry_issue_id: issue.id })
      .maybeSingle()

    if (existingTimelineError) throw existingTimelineError

    if (!existingTimeline) {
      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        event_type: 'note',
        headline,
        detail,
        source: 'sentry',
        metadata: {
          sentry_issue_id: issue.id,
          sentry_permalink: issue.permalink,
          sentry_status: issue.status,
        },
        event_at: issue.lastSeen ?? new Date().toISOString(),
      })

      if (timelineError) throw timelineError
    }

    matchedAccounts += 1
  }

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'sentry',
      status: 'connected',
      last_synced_at: new Date().toISOString(),
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'sentry', {
        organization_slug: organizationSlug,
        project_slug: projectSlug,
        coverage: `${issues.length} unresolved issue(s), ${matchedAccounts} matched account signal(s)`,
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
    outputSummary: `Sentry sync completed: ${issues.length} unresolved issue(s), ${matchedAccounts} matched account signal(s).`,
    metadata: {
      provider: 'sentry',
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
