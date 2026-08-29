import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { selectAction } from '@/intelligence/scoring/action-selector'
import { buildSignalsFromAccount, scoreAccount } from '@/intelligence/scoring/score-engine'
import { createServiceClient } from '@/foundation/database/service'
import { findAccountIdByEmail, normalizeMatchText } from '@/integrations/_core/account-match'
import {
  buildEmailSearchQuery,
  fetchThreads,
  getGmailProfile,
  getGmailScopeMode,
  isGmailReadSyncEnabled,
  threadNeedsReply,
  type GmailThread,
} from '@/integrations/gmail/gmail'
import { buildGmailBootstrapCandidates, buildGmailBootstrapQuery } from './gmail-bootstrap'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'
import { syncGmailRecoveryHistory } from '@/integrations/gmail/gmail-recovery-history'

type ExistingAccount = {
  id: string
  name: string
  account_status: string
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  open_issue: string | null
  next_action: string | null
  summary: string | null
  last_touch_at: string | null
  renewal_at: string | null
}

type ExistingContact = {
  email: string
  name: string | null
  is_primary: boolean
  customer_account_id: string
  external_ids: Record<string, unknown> | null
}

export type GmailWorkspaceSyncResult = {
  syncedAccounts: number
  syncedThreads: number
  pendingReplies: number
  ownerEmail: string
}

function buildCommunicationHeadline(accountName: string, pendingCount: number) {
  if (pendingCount === 1) {
    return `${accountName} is waiting on a Gmail reply`
  }

  return `${accountName} has ${pendingCount} Gmail threads waiting`
}

function buildCommunicationDetail(accountName: string, latestThread: GmailThread, pendingCount: number) {
  const age = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(latestThread.lastMessageAt).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  )

  const subject = latestThread.subject && latestThread.subject !== 'No subject'
    ? `Latest subject: ${latestThread.subject}.`
    : 'Latest message has no subject.'

  return `${accountName} has ${pendingCount} recent customer thread${
    pendingCount === 1 ? '' : 's'
  } waiting in Gmail. ${subject} Last inbound message was ${age} day${
    age === 1 ? '' : 's'
  } ago from ${latestThread.from || 'the customer'}.`
}

function buildCommunicationNextStep(latestThread: GmailThread, pendingCount: number) {
  if (pendingCount > 1) {
    return 'Review the waiting Gmail threads and send the next founder reply today.'
  }

  if (latestThread.subject && latestThread.subject !== 'No subject') {
    return `Reply to the "${latestThread.subject}" thread today.`
  }

  return 'Reply to the latest Gmail thread today.'
}

function buildDraftBody(contactName: string | null, latestThread: GmailThread) {
  const greeting = contactName ? `Hi ${contactName},` : 'Hi there,'
  const ageInDays = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(latestThread.lastMessageAt).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  )
  const subjectLine =
    latestThread.subject && latestThread.subject !== 'No subject'
      ? `I saw your note on "${latestThread.subject}" and should have replied sooner.`
      : 'I saw your note and should have replied sooner.'
  const timingLine =
    ageInDays > 0
      ? `Your last message has been waiting ${ageInDays} day${ageInDays === 1 ? '' : 's'}, so I wanted to respond personally.`
      : 'I wanted to respond personally instead of letting this sit in the queue.'

  return [
    greeting,
    '',
    subjectLine,
    '',
    timingLine,
    'I am reviewing this now so we can get you a clear answer and unblock anything on our side.',
    'If a quick call would help, reply with a time that works and I will make myself available.',
  ].join('\n')
}

function dedupeThreads(threads: GmailThread[]) {
  const byId = new Map<string, GmailThread>()

  for (const thread of threads) {
    const existing = byId.get(thread.threadId)
    if (!existing) {
      byId.set(thread.threadId, thread)
      continue
    }

    if (
      new Date(thread.lastMessageAt).getTime() >
      new Date(existing.lastMessageAt).getTime()
    ) {
      byId.set(thread.threadId, thread)
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(right.lastMessageAt).getTime() -
      new Date(left.lastMessageAt).getTime()
  )
}

async function bootstrapAccountsFromInbox(params: {
  workspaceId: string
  ownerEmail: string
  existingAccounts: ExistingAccount[]
  existingContacts: ExistingContact[]
}) {
  const { workspaceId, ownerEmail, existingAccounts, existingContacts } = params
  if (existingAccounts.length > 0 || existingContacts.length > 0) {
    return {
      accounts: existingAccounts,
      contacts: existingContacts,
      bootstrappedAccounts: 0,
      bootstrappedContacts: 0,
    }
  }

  const supabase = createServiceClient()
  const inboxThreads = await fetchThreads(workspaceId, buildGmailBootstrapQuery(), 40)
  const candidates = buildGmailBootstrapCandidates(inboxThreads, ownerEmail)

  if (candidates.length === 0) {
    return {
      accounts: existingAccounts,
      contacts: existingContacts,
      bootstrappedAccounts: 0,
      bootstrappedContacts: 0,
    }
  }

  const accounts = [...existingAccounts]
  const contacts = [...existingContacts]
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const accountsByName = new Map(accounts.map((account) => [normalizeMatchText(account.name), account]))
  const contactsByEmail = new Map(
    contacts.map((contact) => [contact.email.toLowerCase(), contact])
  )

  let bootstrappedAccounts = 0
  let bootstrappedContacts = 0

  for (const candidate of candidates) {
    const matchedAccountId =
      candidate.contacts
        .map((contact) => findAccountIdByEmail(contact.email, contactsByEmail))
        .find((value): value is string => typeof value === 'string') ?? null

    let account =
      (matchedAccountId ? accountsById.get(matchedAccountId) : undefined) ??
      accountsByName.get(normalizeMatchText(candidate.accountName)) ??
      null

    if (!account) {
      const { data: insertedAccount, error: insertAccountError } = await supabase
        .from('customer_accounts')
        .insert({
          workspace_id: workspaceId,
          name: candidate.accountName,
          segment: 'Gmail contact',
          account_status: 'active',
          mrr_cents: 0,
          risk_level: 'low',
          risk_score: 0,
          usage_delta_percent: 0,
          open_issue: null,
          next_action: 'Review the latest Gmail conversation and decide the next founder reply.',
          summary: 'Recent Gmail conversation imported to bootstrap founder follow-up context.',
          last_touch_at: null,
          renewal_at: null,
        })
        .select(
          'id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at'
        )
        .single()

      if (insertAccountError) throw insertAccountError

      account = insertedAccount as ExistingAccount
      accounts.push(account)
      accountsById.set(account.id, account)
      accountsByName.set(normalizeMatchText(candidate.accountName), account)
      bootstrappedAccounts += 1
    }

    for (const contact of candidate.contacts) {
      const existingContact = contactsByEmail.get(contact.email)
      const contactPayload = {
        workspace_id: workspaceId,
        customer_account_id: account.id,
        email: contact.email,
        name: contact.name,
        role: 'email_contact',
        is_primary: existingContact ? existingContact.customer_account_id === account.id : contact.isPrimary,
        external_ids: {
          ...(existingContact?.external_ids ?? {}),
          gmail_email: contact.email,
        },
      }

      const { error: upsertContactError } = await supabase
        .from('account_contacts')
        .upsert(contactPayload, { onConflict: 'workspace_id,email' })

      if (upsertContactError) throw upsertContactError

      if (!existingContact) {
        const insertedContact: ExistingContact = {
          email: contact.email,
          name: contact.name,
          is_primary: contactPayload.is_primary,
          customer_account_id: account.id,
          external_ids: contactPayload.external_ids,
        }
        contacts.push(insertedContact)
        contactsByEmail.set(contact.email, insertedContact)
        bootstrappedContacts += 1
      }
    }
  }

  return {
    accounts,
    contacts,
    bootstrappedAccounts,
    bootstrappedContacts,
  }
}

async function createCommunicationDraftIfMissing(params: {
  workspaceId: string
  account: ExistingAccount
  pendingDraftAccountIds: Set<string>
  contacts: ExistingContact[]
  latestThread: GmailThread
}) {
  const { workspaceId, account, pendingDraftAccountIds, contacts, latestThread } = params

  if (pendingDraftAccountIds.has(account.id)) {
    return false
  }

  const primaryContact = contacts.find((contact) => contact.is_primary) ?? contacts[0]
  if (!primaryContact?.email) {
    return false
  }

  const supabase = createServiceClient()
  const subject =
    latestThread.subject && latestThread.subject !== 'No subject'
      ? `Re: ${latestThread.subject}`
      : `Quick follow-up for ${account.name}`

  const { error } = await supabase.from('follow_up_drafts').insert({
    workspace_id: workspaceId,
    customer_account_id: account.id,
    draft_type: 'checkin_email',
    subject,
    body_preview: buildDraftBody(primaryContact.name, latestThread),
    status: 'needs_review',
    due_label: 'Review today',
  })

  if (error) throw error

  pendingDraftAccountIds.add(account.id)
  return true
}

/**
 * Canonical Gmail sync for the recovery workflow.
 *
 * Gmail history is ingested as provider evidence and then flows through the
 * same identity → features → outcome path as Stripe and PostHog. This function
 * deliberately never scores an account or creates a draft from inbox content.
 */
export async function syncGmailWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<GmailWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const result = await syncGmailRecoveryHistory(workspaceId)
  const syncedAt = new Date().toISOString()

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'gmail',
      status: 'connected',
      last_synced_at: syncedAt,
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'gmail', {
        coverage: result.initialized
          ? 'Gmail history cursor initialized; new customer replies will be ingested durably.'
          : `${result.inboundMessages} inbound Gmail message(s) ingested into the recovery workflow.`,
        mode: getGmailScopeMode(),
        gmail_history_cursor: result.cursor,
        observed_messages: result.observedMessages,
        ignored_messages: result.ignoredMessages,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )
  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: result.initialized
      ? 'Gmail recovery history cursor initialized.'
      : `Gmail recovery history sync completed: ${result.inboundMessages} inbound message(s) ingested.`,
    metadata: { provider: 'gmail', ...result },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts: 0,
    syncedThreads: result.inboundMessages,
    pendingReplies: result.inboundMessages,
    ownerEmail: '',
  }
}

/**
 * Retained only for a future, explicitly separate inbox-triage product. It is
 * not registered as an integration runner because it predates the durable
 * recovery-case workflow and can independently score accounts or create drafts.
 */
async function syncLegacyGmailInboxForTriage(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<GmailWorkspaceSyncResult> {
  const supabase = createServiceClient()

  if (!isGmailReadSyncEnabled()) {
    const syncedAt = new Date().toISOString()
    const { error: connectionError } = await supabase.from('integration_connections').upsert(
      {
        workspace_id: workspaceId,
        provider: 'gmail',
        status: 'connected',
        last_synced_at: syncedAt,
        metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'gmail', {
          coverage: 'Send-only OAuth connected for local testing. Inbox sync is disabled.',
          mode: getGmailScopeMode(),
          pending_replies: 0,
        }),
      },
      { onConflict: 'workspace_id,provider' }
    )

    if (connectionError) throw connectionError

    await logAgentRun({
      workspaceId,
      runType: 'integration_synced',
      status: 'completed',
      outputSummary: 'Gmail connected in send-only mode. Inbox sync skipped.',
      metadata: {
        provider: 'gmail',
        mode: 'send_only',
      },
    })

    if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

    return {
      syncedAccounts: 0,
      syncedThreads: 0,
      pendingReplies: 0,
      ownerEmail: '',
    }
  }

  const profile = await getGmailProfile(workspaceId)

  const [
    { data: accounts, error: accountsError },
    { data: contacts, error: contactsError },
    { data: pendingDrafts, error: pendingDraftsError },
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select(
        'id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at'
      )
      .eq('workspace_id', workspaceId)
      .order('mrr_cents', { ascending: false }),
    supabase
      .from('account_contacts')
      .select('email, name, is_primary, customer_account_id, external_ids')
      .eq('workspace_id', workspaceId)
      .order('is_primary', { ascending: false }),
    supabase
      .from('follow_up_drafts')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['needs_review', 'ready_to_send', 'waiting_on_founder']),
  ])

  if (accountsError) throw accountsError
  if (contactsError) throw contactsError
  if (pendingDraftsError) throw pendingDraftsError

  const typedAccounts = (accounts as ExistingAccount[] | null) ?? []
  const typedContacts = (contacts as ExistingContact[] | null) ?? []
  const pendingDraftAccountIds = new Set(
    ((pendingDrafts as Array<{ customer_account_id: string | null }> | null) ?? [])
      .map((draft) => draft.customer_account_id)
      .filter((value): value is string => Boolean(value))
  )

  const bootstrapped = await bootstrapAccountsFromInbox({
    workspaceId,
    ownerEmail: profile.emailAddress,
    existingAccounts: typedAccounts,
    existingContacts: typedContacts,
  })

  const contactsByAccount = new Map<string, ExistingContact[]>()
  for (const contact of bootstrapped.contacts) {
    const key = contact.customer_account_id
    const current = contactsByAccount.get(key) ?? []
    current.push({
      ...contact,
      email: contact.email.toLowerCase(),
      })
    contactsByAccount.set(key, current)
  }

  const { error: clearSignalsError } = await supabase
    .from('account_signals')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('signal_type', 'communication')

  if (clearSignalsError) throw clearSignalsError

  let syncedAccounts = 0
  let syncedThreads = 0
  let pendingReplies = 0

  for (const account of bootstrapped.accounts) {
    const accountContacts = contactsByAccount.get(account.id) ?? []
    if (accountContacts.length === 0) {
      continue
    }

    const fetchedThreadGroups = await Promise.all(
      accountContacts.map(async (contact) => {
        try {
          return await fetchThreads(
            workspaceId,
            buildEmailSearchQuery(contact.email),
            6
          )
        } catch (error) {
          console.warn('[gmail-sync] Failed to fetch threads for contact', {
            workspaceId,
            email: contact.email,
            error,
          })
          return []
        }
      })
    )

    const relatedThreads = dedupeThreads(
      fetchedThreadGroups.flat().filter((thread) =>
        accountContacts.some((contact) =>
          thread.participantEmails.includes(contact.email)
        )
      )
    )

    if (relatedThreads.length === 0) {
      continue
    }

    syncedAccounts += 1
    syncedThreads += relatedThreads.length

    const pendingThreads = relatedThreads.filter((thread) =>
      threadNeedsReply(thread, profile.emailAddress, account.last_touch_at)
    )

    const signals = {
      ...buildSignalsFromAccount(account),
      hasUnrepliedThread: pendingThreads.length > 0,
    }
    const score = scoreAccount(signals)
    const action = selectAction(score, signals)

    const latestPendingThread = pendingThreads[0]
    const nextAction =
      latestPendingThread
        ? buildCommunicationNextStep(latestPendingThread, pendingThreads.length)
        : action.reason

    const { error: updateAccountError } = await supabase
      .from('customer_accounts')
      .update({
        risk_level: score.riskLevel,
        risk_score: score.score,
        summary: score.summary,
        next_action: nextAction,
      })
      .eq('id', account.id)

    if (updateAccountError) throw updateAccountError

    if (!latestPendingThread) {
      continue
    }

    pendingReplies += pendingThreads.length

    const { error: signalError } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: account.id,
      signal_type: 'communication',
      headline: buildCommunicationHeadline(account.name, pendingThreads.length),
      detail: buildCommunicationDetail(
        account.name,
        latestPendingThread,
        pendingThreads.length
      ),
      next_step: nextAction,
      evidence: [
        `Latest sender: ${latestPendingThread.from || 'customer'}`,
        `Thread subject: ${latestPendingThread.subject || 'No subject'}`,
        `Pending replies: ${pendingThreads.length}`,
      ],
      risk_level: score.riskLevel,
    })

    if (signalError) throw signalError

    const { data: existingTimelineEvent, error: existingTimelineError } = await supabase
      .from('account_timeline')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', account.id)
      .eq('event_type', 'email_received')
      .contains('metadata', {
        thread_id: latestPendingThread.threadId,
        last_message_id: latestPendingThread.lastMessageId,
      })
      .maybeSingle()

    if (existingTimelineError) throw existingTimelineError

    if (!existingTimelineEvent) {
      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: account.id,
        event_type: 'email_received',
        headline: `Customer replied in Gmail: ${latestPendingThread.subject || 'No subject'}`,
        detail: latestPendingThread.snippet,
        source: 'gmail',
        metadata: {
          thread_id: latestPendingThread.threadId,
          last_message_id: latestPendingThread.lastMessageId,
          from: latestPendingThread.from,
          unread: latestPendingThread.isUnread,
        },
        event_at: latestPendingThread.lastMessageAt,
      })

      if (timelineError) throw timelineError
    }

    await createCommunicationDraftIfMissing({
      workspaceId,
      account,
      pendingDraftAccountIds,
      contacts: accountContacts,
      latestThread: latestPendingThread,
    })
  }

  const syncedAt = new Date().toISOString()

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'gmail',
      status: 'connected',
      last_synced_at: syncedAt,
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'gmail', {
        coverage:
          syncedThreads > 0
            ? `${syncedThreads} Gmail thread${syncedThreads === 1 ? '' : 's'} across ${syncedAccounts} account${
                syncedAccounts === 1 ? '' : 's'
              }`
            : bootstrapped.bootstrappedAccounts > 0
              ? `Bootstrapped ${bootstrapped.bootstrappedAccounts} account${
                  bootstrapped.bootstrappedAccounts === 1 ? '' : 's'
                } from Gmail inbox, but no reply-needed threads were found after import`
              : 'Connected, but no recent Gmail customer threads were found',
        owner_email: profile.emailAddress,
        pending_replies: pendingReplies,
        bootstrapped_accounts: bootstrapped.bootstrappedAccounts,
        bootstrapped_contacts: bootstrapped.bootstrappedContacts,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `Gmail sync completed: ${syncedThreads} thread(s) across ${syncedAccounts} account(s), ${pendingReplies} pending reply thread(s), ${bootstrapped.bootstrappedAccounts} bootstrapped account(s).`,
    metadata: {
      provider: 'gmail',
      syncedThreads,
      syncedAccounts,
      pendingReplies,
      bootstrappedAccounts: bootstrapped.bootstrappedAccounts,
      bootstrappedContacts: bootstrapped.bootstrappedContacts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    syncedThreads,
    pendingReplies,
    ownerEmail: profile.emailAddress,
  }
}
