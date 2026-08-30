import { createServiceClient } from '@/foundation/database/service'
import { upsertProviderIdentity, linkContactSafely } from '@/recovery/identity'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import {
  fetchIntercomContacts,
  fetchIntercomOpenConversations,
  getIntercomCredentials,
  type IntercomConversation,
} from '@/integrations/intercom/intercom'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'

type ExistingContact = {
  email: string
  customer_account_id: string
  is_primary: boolean
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
    return `Review the ${openConversationCount} open support conversations before deciding on any customer action.`
  }

  return 'Review the open support thread as context; it does not authorize outreach.'
}

export async function syncIntercomWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<IntercomWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)

  const [contacts, conversations, existingContactsRes] = await Promise.all([
    fetchIntercomContacts(accessToken, apiBaseUrl),
    fetchIntercomOpenConversations(accessToken, apiBaseUrl),
    supabase
      .from('account_contacts')
      .select('email, customer_account_id, is_primary, external_ids')
      .eq('workspace_id', workspaceId),
  ])

  if (existingContactsRes.error) throw existingContactsRes.error

  const existingContacts = (existingContactsRes.data as ExistingContact[] | null) ?? []

  const contactsByEmail = new Map(existingContacts.map((contact) => [contact.email.toLowerCase(), contact]))
  const intercomContactIdToAccountId = new Map<string, string>()

  let syncedContacts = 0

  for (const contact of contacts) {
    const email = contact.email?.toLowerCase().trim()
    if (!email) continue

    // Step 0: Check provider_identities for known Intercom contact_id
    const rawIntercomContactId = String(contact.id ?? '')
    let accountId: string | null = null
    if (rawIntercomContactId) {
      const { data: idRow } = await supabase
        .from('provider_identities')
        .select('customer_account_id')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'intercom')
        .eq('identity_type', 'contact_id')
        .eq('normalized_external_id', rawIntercomContactId)
        .in('verification_status', ['verified', 'inferred'])
        .maybeSingle()
      if (idRow) {
        accountId = idRow.customer_account_id
      }
    }

    const existingContact = contactsByEmail.get(email)
    if (!accountId) {
      // Intercom support context is never allowed to guess account ownership.
      // Only an existing exact, workspace-scoped email contact can be enriched.
      accountId = existingContact?.customer_account_id ?? null
    }

    if (!accountId) {
      continue
    }

    // Persist Intercom contact_id as inferred identity (email match, not direct API verification)
    let hasIdentityConflict = false
    if (accountId && rawIntercomContactId) {
      const idResult = await upsertProviderIdentity(supabase, {
        workspaceId,
        customerAccountId: accountId,
        provider: 'intercom',
        identityType: 'contact_id',
        externalId: rawIntercomContactId,
        isPrimary: false,
        verificationStatus: 'inferred',
        source: 'intercom_sync',
      })
      if (idResult.status === 'conflict') {
        console.warn('[intercom-sync] contact_id identity conflict:', idResult.reason)
        hasIdentityConflict = true
      } else if (idResult.status === 'error') {
        console.warn('[intercom-sync] contact_id write error:', idResult.error)
      }
    }

    // If an identity conflict occurred, do not attribute conversations or link contacts (§do.md §8)
    if (hasIdentityConflict) {
      continue
    }

    const mergedExternalIds = {
      ...(existingContact?.external_ids ?? {}),
      intercom_contact_id: contact.id ?? null,
    }

    // Intercom MUST NOT set is_primary=true or change the primary recovery recipient.
    const contactResult = await linkContactSafely(supabase, {
      workspaceId,
      customerAccountId: accountId,
      email,
      name: contact.name?.trim() || null,
      role: 'support',
      isPrimary: false,
      source: 'intercom_sync',
      isProvisional: false,
    })

    if (contactResult.status === 'conflict') {
      console.warn('[intercom-sync] contact conflict:', contactResult.reason)
      continue
    } else if (contactResult.status === 'error') {
      console.error('[intercom-sync] contact write error:', contactResult.error)
    }

    contactsByEmail.set(email, {
      email,
      customer_account_id: accountId,
      is_primary: existingContact?.is_primary ?? false,
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
        .map((email) => contactsByEmail.get(email)?.customer_account_id)
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
    if (!aggregate.latestConversation) continue

    const issue = conversationHeadline(aggregate.latestConversation)
    const nextAction = buildSupportNextAction(aggregate.openConversationCount)

    const { error: updateError } = await supabase
      .from('customer_accounts')
      .update({
        open_issue: issue,
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
      // Intercom is contextual support evidence, not a scoring source in the
      // three-provider recovery policy. Preserve it as a visible signal only.
      risk_level: 'low',
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
