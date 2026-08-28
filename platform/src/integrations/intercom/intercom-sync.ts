import { createServiceClient } from '@/foundation/database/service'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { buildSignalsFromAccount, scoreAccount } from '@/intelligence/scoring/score-engine'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { buildAccountsByName, findAccountIdByEmail, getEmailDomain, isPersonalEmailDomain, normalizeMatchText } from '@/integrations/_core/account-match'
import {
  fetchIntercomContacts,
  fetchIntercomOpenConversations,
  getIntercomCredentials,
  type IntercomConversation,
} from '@/integrations/intercom/intercom'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'

type ExistingAccount = {
  id: string
  name: string
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  open_issue: string | null
  next_action: string | null
  summary: string | null
  last_touch_at: string | null
  renewal_at: string | null
  account_status: string
}

type ExistingContact = {
  email: string
  customer_account_id: string
  external_ids: Record<string, unknown> | null
}

type AccountSupportAggregate = {
  accountId: string
  openConversationCount: number
  latestConversation: IntercomConversation | null
}

export type IntercomWorkspaceSyncResult = {
  syncedAccounts: number
  syncedContacts: number
  openConversations: number
}

function conversationHeadline(conversation: IntercomConversation) {
  return conversation.title?.trim() || 'Open Intercom conversation needs attention'
}

function conversationDetail(conversation: IntercomConversation) {
  return conversation.source?.body?.trim() || 'An Intercom conversation is still open.'
}

function buildSupportNextAction(openConversationCount: number) {
  if (openConversationCount > 1) {
    return `Review the ${openConversationCount} open support conversations and send a founder follow-up today.`
  }

  return 'Review the open support thread and decide whether the founder should step in.'
}

export async function syncIntercomWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<IntercomWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)

  const [contacts, conversations, existingAccountsRes, existingContactsRes] = await Promise.all([
    fetchIntercomContacts(accessToken, apiBaseUrl),
    fetchIntercomOpenConversations(accessToken, apiBaseUrl),
    supabase
      .from('customer_accounts')
      .select(
        'id, name, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at, account_status'
      )
      .eq('workspace_id', workspaceId),
    supabase
      .from('account_contacts')
      .select('email, customer_account_id, external_ids')
      .eq('workspace_id', workspaceId),
  ])

  if (existingAccountsRes.error) throw existingAccountsRes.error
  if (existingContactsRes.error) throw existingContactsRes.error

  const existingAccounts = (existingAccountsRes.data as ExistingAccount[] | null) ?? []
  const existingContacts = (existingContactsRes.data as ExistingContact[] | null) ?? []

  const accountsById = new Map(existingAccounts.map((account) => [account.id, account]))
  const accountsByName = buildAccountsByName(existingAccounts)
  const contactsByEmail = new Map(existingContacts.map((contact) => [contact.email.toLowerCase(), contact]))
  const intercomContactIdToAccountId = new Map<string, string>()

  let syncedContacts = 0

  for (const contact of contacts) {
    const email = contact.email?.toLowerCase().trim()
    if (!email) continue

    const existingContact = contactsByEmail.get(email)
    const companyName = contact.companies?.data?.[0]?.name?.trim() || null
    let accountId =
      findAccountIdByEmail(email, contactsByEmail) ??
      (companyName ? accountsByName.get(normalizeMatchText(companyName))?.id ?? null : null)

    if (!accountId) {
      const domain = getEmailDomain(email)
      if (domain && !isPersonalEmailDomain(domain)) {
        accountId = accountsByName.get(normalizeMatchText(domain.split('.')[0] ?? domain))?.id ?? null
      }
    }

    if (!accountId) {
      continue
    }

    const mergedExternalIds = {
      ...(existingContact?.external_ids ?? {}),
      intercom_contact_id: contact.id ?? null,
    }

    const { error } = await supabase.from('account_contacts').upsert(
      {
        workspace_id: workspaceId,
        customer_account_id: accountId,
        email,
        name: contact.name?.trim() || null,
        role: contact.role?.trim() || 'support_contact',
        is_primary: existingContact?.customer_account_id === accountId ? true : false,
        external_ids: mergedExternalIds,
      },
      { onConflict: 'workspace_id,email' }
    )

    if (error) throw error

    contactsByEmail.set(email, {
      email,
      customer_account_id: accountId,
      external_ids: mergedExternalIds,
    })

    if (contact.id) {
      intercomContactIdToAccountId.set(contact.id, accountId)
    }

    syncedContacts += 1
  }

  const { error: clearSignalsError } = await supabase
    .from('account_signals')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('signal_type', 'support')

  if (clearSignalsError) throw clearSignalsError

  const aggregates = new Map<string, AccountSupportAggregate>()

  for (const conversation of conversations) {
    const contactIds =
      conversation.contacts?.contacts
        ?.map((contact) => contact.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0) ?? []
    const participantEmails =
      conversation.contacts?.contacts
        ?.map((contact) => contact.email?.toLowerCase().trim())
        .filter((value): value is string => Boolean(value)) ?? []

    const accountId =
      contactIds
        .map((contactId) => intercomContactIdToAccountId.get(contactId))
        .find((value): value is string => typeof value === 'string') ??
      participantEmails
        .map((email) => findAccountIdByEmail(email, contactsByEmail))
        .find((value): value is string => typeof value === 'string') ??
      null

    if (!accountId) {
      continue
    }

    const aggregate = aggregates.get(accountId) ?? {
      accountId,
      openConversationCount: 0,
      latestConversation: null,
    }

    aggregate.openConversationCount += 1
    if (
      !aggregate.latestConversation ||
      (conversation.updated_at ?? 0) > (aggregate.latestConversation.updated_at ?? 0)
    ) {
      aggregate.latestConversation = conversation
    }

    aggregates.set(accountId, aggregate)
  }

  let syncedAccounts = 0

  for (const aggregate of aggregates.values()) {
    const existingAccount = accountsById.get(aggregate.accountId)
    if (!existingAccount || !aggregate.latestConversation) continue

    const issue = conversationHeadline(aggregate.latestConversation)
    const score = scoreAccount(
      buildSignalsFromAccount({
        mrr_cents: existingAccount.mrr_cents,
        usage_delta_percent: existingAccount.usage_delta_percent,
        risk_level: existingAccount.risk_level,
        open_issue: issue,
        last_touch_at: existingAccount.last_touch_at,
        renewal_at: existingAccount.renewal_at,
        account_status: existingAccount.account_status,
      }, {
        open_ticket_count: aggregate.openConversationCount,
      })
    )

    const nextAction = buildSupportNextAction(aggregate.openConversationCount)

    const { error: updateError } = await supabase
      .from('customer_accounts')
      .update({
        open_issue: issue,
        risk_level: score.riskLevel,
        risk_score: score.score,
        summary: `${score.summary} Intercom has ${aggregate.openConversationCount} open conversation${
          aggregate.openConversationCount === 1 ? '' : 's'
        }.`,
        next_action: nextAction,
      })
      .eq('id', aggregate.accountId)

    if (updateError) throw updateError

    const { error: signalError } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: aggregate.accountId,
      signal_type: 'support',
      headline:
        aggregate.openConversationCount > 1
          ? `${aggregate.openConversationCount} open Intercom conversations`
          : issue,
      detail: conversationDetail(aggregate.latestConversation),
      next_step: nextAction,
      evidence: [
        `Open conversations: ${aggregate.openConversationCount}`,
        `Latest thread title: ${issue}`,
      ],
      risk_level: score.riskLevel,
    })

    if (signalError) throw signalError

    const { data: existingTimeline, error: existingTimelineError } = await supabase
      .from('account_timeline')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', aggregate.accountId)
      .eq('event_type', 'support')
      .contains('metadata', {
        intercom_conversation_id: aggregate.latestConversation.id,
      })
      .maybeSingle()

    if (existingTimelineError) throw existingTimelineError

    if (!existingTimeline) {
      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: aggregate.accountId,
        event_type: 'support',
        headline: issue,
        detail: conversationDetail(aggregate.latestConversation),
        source: 'intercom',
        metadata: {
          intercom_conversation_id: aggregate.latestConversation.id,
          open_conversations: aggregate.openConversationCount,
        },
        event_at: aggregate.latestConversation.updated_at
          ? new Date(aggregate.latestConversation.updated_at * 1000).toISOString()
          : new Date().toISOString(),
      })

      if (timelineError) throw timelineError
    }

    syncedAccounts += 1
  }

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'intercom',
      status: 'connected',
      last_synced_at: new Date().toISOString(),
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'intercom', {
        coverage: `${conversations.length} open conversation(s) across ${syncedAccounts} account(s)`,
        synced_contacts: syncedContacts,
        synced_accounts: syncedAccounts,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `Intercom sync completed: ${conversations.length} open conversation(s), ${syncedAccounts} matched account(s), ${syncedContacts} synced contact(s).`,
    metadata: {
      provider: 'intercom',
      openConversations: conversations.length,
      syncedAccounts,
      syncedContacts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    syncedContacts,
    openConversations: conversations.length,
  }
}
