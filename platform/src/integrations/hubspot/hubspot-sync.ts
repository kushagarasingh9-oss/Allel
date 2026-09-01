import { createServiceClient } from '@/foundation/database/service'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { fetchAllHubSpotCompanies, fetchAllHubSpotContacts, getHubSpotCredentials } from '@/integrations/hubspot/hubspot'
import { normalizeMatchText } from '@/integrations/_core/account-match'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'
import { linkContactSafely, upsertProviderIdentity } from '@/recovery/identity'

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
  is_provisional?: boolean
}

type ExistingContact = {
  email: string
  customer_account_id: string
  external_ids: Record<string, unknown> | null
  is_provisional?: boolean
}

export type HubSpotWorkspaceSyncResult = {
  syncedAccounts: number
  syncedContacts: number
  identityConflicts: number
  provisionalAccounts: number
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
  // Only non-provisional contacts can be used for verified identity resolution
  const contactsByEmail = new Map(
    existingContacts
      .filter((c) => !c.is_provisional)
      .map((contact) => [contact.email.toLowerCase(), contact])
  )
  const hubSpotCompanyIdToAccountId = new Map<string, string>()

  let syncedAccounts = 0
  let syncedContacts = 0
  let identityConflicts = 0
  let provisionalAccounts = 0

  for (const company of companies) {
    const companyName = pickCompanyName(company.properties)
    if (!companyName) continue

    const normalizedName = normalizeMatchText(companyName)
    const existingNameCandidate = accountsByName.get(normalizedName) ?? null

    // Name matching must never mutate an existing canonical account
    if (existingNameCandidate) {
      console.warn(`[hubspot-sync] HubSpot company "${companyName}" (${company.id}) matches account name ${existingNameCandidate.id}, but has no verified identity. Creating isolated provisional account.`)
      identityConflicts += 1
    }

    const payload = {
      workspace_id: workspaceId,
      name: companyName,
      segment: 'HubSpot company',
      summary:
        company.properties?.description?.trim() ||
        company.properties?.industry?.trim() ||
        'Provisional HubSpot company synced into the customer graph.',
      next_action: 'Review CRM context before taking action.',
      open_issue: null,
      mrr_cents: 0,
      usage_delta_percent: 0,
      last_touch_at: null,
      renewal_at: null,
      account_status: 'active',
    }

    const { data: insertedAccount, error: insertError } = await supabase
      .from('customer_accounts')
      .insert(payload)
      .select(
        'id, name, segment, summary, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, last_touch_at, renewal_at, account_status'
      )
      .single()

    if (insertError) throw insertError
    const account = insertedAccount as ExistingAccount
    accountsById.set(account.id, account)
    accountsByName.set(normalizedName, account)
    provisionalAccounts += 1

    hubSpotCompanyIdToAccountId.set(company.id, account.id)
    syncedAccounts += 1
  }

  for (const contact of contacts) {
    const email = contact.properties?.email?.toLowerCase().trim()
    if (!email) continue

    const associatedCompanyId = contact.properties?.associatedcompanyid?.trim() || null
    const existingContact = contactsByEmail.get(email)

    // Resolution: associated company ID first, or exact non-provisional contact email
    let accountId =
      (associatedCompanyId ? hubSpotCompanyIdToAccountId.get(associatedCompanyId) : null) ??
      existingContact?.customer_account_id ??
      null

    if (!accountId) {
      continue
    }

    const mergedExternalIds = {
      ...(existingContact?.external_ids ?? {}),
      hubspot_contact_id: contact.id,
      ...(associatedCompanyId ? { hubspot_company_id: associatedCompanyId } : {}),
    }

    // HubSpot contacts MUST NOT set is_primary=true and must use safe atomic linking
    const contactResult = await linkContactSafely(supabase, {
      workspaceId,
      customerAccountId: accountId,
      email,
      name: pickContactName(contact.properties),
      role: contact.properties?.jobtitle?.trim() || 'crm_contact',
      isPrimary: false,
      externalIds: mergedExternalIds,
      source: 'hubspot_sync',
      isProvisional: true,
    })

    if (contactResult.status === 'ok') {
      contactsByEmail.set(email, {
        email,
        customer_account_id: accountId,
        external_ids: mergedExternalIds,
        is_provisional: true,
      })
      syncedContacts += 1
    } else if (contactResult.status === 'conflict') {
      console.warn(`[hubspot-sync] contact conflict for ${email}:`, contactResult.reason)
      identityConflicts += 1
    } else {
      console.error(`[hubspot-sync] contact write error for ${email}:`, contactResult.error)
    }
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
        identity_conflicts: identityConflicts,
        provisional_accounts: provisionalAccounts,
        identity_health: identityConflicts > 0 ? 'degraded' : 'healthy',
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `HubSpot sync completed: ${syncedAccounts} company record(s) and ${syncedContacts} contact(s), ${identityConflicts} conflict(s).`,
    metadata: {
      provider: 'hubspot',
      syncedAccounts,
      syncedContacts,
      identityConflicts,
      provisionalAccounts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    syncedContacts,
    identityConflicts,
    provisionalAccounts,
  }
}
