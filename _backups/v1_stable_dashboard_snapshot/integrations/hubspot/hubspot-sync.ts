import { createServiceClient } from '@/foundation/database/service'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { fetchAllHubSpotCompanies, fetchAllHubSpotContacts, getHubSpotCredentials } from '@/integrations/hubspot/hubspot'
import { findAccountIdByEmail, getEmailDomain, isPersonalEmailDomain, normalizeMatchText } from '@/integrations/_core/account-match'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'

type ExistingAccount = {
  id: string
  name: string
  segment: string | null
  summary: string | null
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  open_issue: string | null
  next_action: string | null
  last_touch_at: string | null
  renewal_at: string | null
  account_status: string
}

type ExistingContact = {
  email: string
  customer_account_id: string
  external_ids: Record<string, unknown> | null
}

export type HubSpotWorkspaceSyncResult = {
  syncedAccounts: number
  syncedContacts: number
}

function pickCompanyName(properties: Record<string, string | null | undefined> | undefined) {
  return properties?.name?.trim() || properties?.company?.trim() || null
}

function pickContactName(properties: Record<string, string | null | undefined> | undefined) {
  const first = properties?.firstname?.trim()
  const last = properties?.lastname?.trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  return full || null
}

export async function syncHubSpotWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<HubSpotWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { accessToken } = await getHubSpotCredentials(workspaceId)

  const [companies, contacts, existingAccountsRes, existingContactsRes] = await Promise.all([
    fetchAllHubSpotCompanies(accessToken),
    fetchAllHubSpotContacts(accessToken),
    supabase
      .from('customer_accounts')
      .select(
        'id, name, segment, summary, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, last_touch_at, renewal_at, account_status'
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
  const accountsByName = new Map(existingAccounts.map((account) => [normalizeMatchText(account.name), account]))
  const contactsByEmail = new Map(existingContacts.map((contact) => [contact.email.toLowerCase(), contact]))
  const hubSpotCompanyIdToAccountId = new Map<string, string>()

  let syncedAccounts = 0
  let syncedContacts = 0

  for (const company of companies) {
    const companyName = pickCompanyName(company.properties)
    if (!companyName) continue

    const normalizedName = normalizeMatchText(companyName)
    let account = accountsByName.get(normalizedName) ?? null

    const payload = {
      workspace_id: workspaceId,
      name: companyName,
      segment: 'HubSpot company',
      summary:
        company.properties?.description?.trim() ||
        company.properties?.industry?.trim() ||
        'HubSpot company synced into the customer graph.',
      next_action: account?.next_action ?? 'Review CRM context before the next founder touch.',
      open_issue: account?.open_issue ?? null,
      mrr_cents: account?.mrr_cents ?? 0,
      risk_level: account?.risk_level ?? 'low',
      risk_score: account?.risk_score ?? 0,
      usage_delta_percent: account?.usage_delta_percent ?? 0,
      last_touch_at: account?.last_touch_at ?? null,
      renewal_at: account?.renewal_at ?? null,
      account_status: account?.account_status ?? 'active',
    }

    if (account) {
      const { error } = await supabase.from('customer_accounts').update(payload).eq('id', account.id)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('customer_accounts')
        .insert(payload)
        .select(
          'id, name, segment, summary, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, last_touch_at, renewal_at, account_status'
        )
        .single()

      if (error) throw error
      account = data as ExistingAccount
      accountsById.set(account.id, account)
      accountsByName.set(normalizedName, account)
    }

    hubSpotCompanyIdToAccountId.set(company.id, account.id)
    syncedAccounts += 1
  }

  for (const contact of contacts) {
    const email = contact.properties?.email?.toLowerCase().trim()
    if (!email) continue

    const associatedCompanyId = contact.properties?.associatedcompanyid?.trim() || null
    const companyName = contact.properties?.company?.trim() || null
    const existingContact = contactsByEmail.get(email)

    let accountId =
      (associatedCompanyId ? hubSpotCompanyIdToAccountId.get(associatedCompanyId) : null) ??
      findAccountIdByEmail(email, contactsByEmail) ??
      (companyName ? accountsByName.get(normalizeMatchText(companyName))?.id ?? null : null)

    if (!accountId) {
      const domain = getEmailDomain(email)
      if (domain && !isPersonalEmailDomain(domain)) {
        const inferredAccount = accountsByName.get(normalizeMatchText(domain.split('.')[0] ?? domain))
        accountId = inferredAccount?.id ?? null
      }
    }

    if (!accountId) {
      continue
    }

    const mergedExternalIds = {
      ...(existingContact?.external_ids ?? {}),
      hubspot_contact_id: contact.id,
      ...(associatedCompanyId ? { hubspot_company_id: associatedCompanyId } : {}),
    }

    const { error } = await supabase.from('account_contacts').upsert(
      {
        workspace_id: workspaceId,
        customer_account_id: accountId,
        email,
        name: pickContactName(contact.properties),
        role: contact.properties?.jobtitle?.trim() || 'crm_contact',
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
    syncedContacts += 1
  }

  const syncedAt = new Date().toISOString()
  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'hubspot',
      status: 'connected',
      last_synced_at: syncedAt,
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'hubspot', {
        coverage: `${syncedAccounts} companies and ${syncedContacts} contacts synced`,
        synced_accounts: syncedAccounts,
        synced_contacts: syncedContacts,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `HubSpot sync completed: ${syncedAccounts} company record(s) and ${syncedContacts} contact(s).`,
    metadata: {
      provider: 'hubspot',
      syncedAccounts,
      syncedContacts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    syncedContacts,
  }
}
