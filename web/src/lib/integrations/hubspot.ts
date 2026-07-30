/**
 * HubSpot CRM Integration Service
 *
 * Full API coverage: contacts (search/create/update), companies (search/get),
 * deals (search/create/update), notes (create), owners (list),
 * pipelines (list). Uses HubSpot CRM REST API v3.
 */

import { getIntegrationToken } from './provider-tokens'

// ============================================================
//  Types
// ============================================================

export type HubSpotCredentials = {
  accessToken: string
}

export type HubSpotCompany = {
  id: string
  properties?: Record<string, string | null | undefined>
}

export type HubSpotContact = {
  id: string
  properties?: Record<string, string | null | undefined>
}

export type HubSpotDeal = {
  id: string
  properties?: Record<string, string | null | undefined>
}

export type HubSpotOwner = {
  id: string
  email: string
  firstName: string
  lastName: string
}

export type HubSpotPipeline = {
  id: string
  label: string
  stages: Array<{ id: string; label: string; displayOrder: number }>
}

export type HubSpotNote = {
  id: string
  properties?: Record<string, string | null | undefined>
}

// ============================================================
//  Credentials
// ============================================================

const HUBSPOT_BASE = 'https://api.hubapi.com'

export async function getHubSpotCredentials(workspaceId: string): Promise<HubSpotCredentials> {
  return {
    accessToken: await getIntegrationToken(workspaceId, 'hubspot'),
  }
}

// ============================================================
//  Internal helpers
// ============================================================

async function hubSpotGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${HUBSPOT_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function hubSpotPost<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${HUBSPOT_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function hubSpotPatch<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${HUBSPOT_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

// ============================================================
//  Validate
// ============================================================

export async function validateHubSpotToken(accessToken: string) {
  try {
    const response = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return response.ok
  } catch {
    return false
  }
}

// ============================================================
//  Contacts: List / Search / Get / Create / Update
// ============================================================

/** List contacts with pagination (used by sync) */
export async function fetchAllHubSpotContacts(accessToken: string) {
  const results: HubSpotContact[] = []
  let after: string | null = null

  do {
    const params = new URLSearchParams({
      limit: '100',
      properties: 'email,firstname,lastname,jobtitle,associatedcompanyid,company',
    })
    if (after) params.set('after', after)

    const data = await hubSpotGet<{
      results?: HubSpotContact[]
      paging?: { next?: { after?: string } }
    }>(accessToken, `/crm/v3/objects/contacts?${params.toString()}`)

    results.push(...(data.results ?? []))
    after = data.paging?.next?.after ?? null
  } while (after)

  return results
}

/** Search contacts by email, name, or query */
export async function searchHubSpotContacts(
  accessToken: string,
  query: string,
  limit: number = 10
): Promise<HubSpotContact[]> {
  const data = await hubSpotPost<{ results?: HubSpotContact[] }>(
    accessToken, '/crm/v3/objects/contacts/search',
    {
      filterGroups: [{
        filters: [
          { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: query },
        ],
      }],
      properties: ['email', 'firstname', 'lastname', 'jobtitle', 'company', 'phone', 'lifecyclestage'],
      limit,
    }
  )
  return data.results ?? []
}

/** Get a single contact */
export async function getHubSpotContact(
  accessToken: string,
  contactId: string
): Promise<HubSpotContact> {
  return hubSpotGet<HubSpotContact>(
    accessToken, `/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,jobtitle,company,phone,lifecyclestage,hs_lead_status`
  )
}

/** Create a contact */
export async function createHubSpotContact(
  accessToken: string,
  properties: Record<string, string>
): Promise<HubSpotContact> {
  return hubSpotPost<HubSpotContact>(
    accessToken, '/crm/v3/objects/contacts',
    { properties }
  )
}

/** Update a contact */
export async function updateHubSpotContact(
  accessToken: string,
  contactId: string,
  properties: Record<string, string>
): Promise<HubSpotContact> {
  return hubSpotPatch<HubSpotContact>(
    accessToken, `/crm/v3/objects/contacts/${contactId}`,
    { properties }
  )
}

// ============================================================
//  Companies: List / Search / Get
// ============================================================

/** List companies with pagination (used by sync) */
export async function fetchAllHubSpotCompanies(accessToken: string) {
  const results: HubSpotCompany[] = []
  let after: string | null = null

  do {
    const params = new URLSearchParams({
      limit: '100',
      properties: 'name,domain,website,description,industry,hs_lead_status',
    })
    if (after) params.set('after', after)

    const data = await hubSpotGet<{
      results?: HubSpotCompany[]
      paging?: { next?: { after?: string } }
    }>(accessToken, `/crm/v3/objects/companies?${params.toString()}`)

    results.push(...(data.results ?? []))
    after = data.paging?.next?.after ?? null
  } while (after)

  return results
}

/** Search companies by name or domain */
export async function searchHubSpotCompanies(
  accessToken: string,
  query: string,
  limit: number = 10
): Promise<HubSpotCompany[]> {
  const data = await hubSpotPost<{ results?: HubSpotCompany[] }>(
    accessToken, '/crm/v3/objects/companies/search',
    {
      filterGroups: [{
        filters: [
          { propertyName: 'name', operator: 'CONTAINS_TOKEN', value: query },
        ],
      }],
      properties: ['name', 'domain', 'industry', 'website', 'numberofemployees', 'annualrevenue'],
      limit,
    }
  )
  return data.results ?? []
}

/** Get a single company */
export async function getHubSpotCompany(
  accessToken: string,
  companyId: string
): Promise<HubSpotCompany> {
  return hubSpotGet<HubSpotCompany>(
    accessToken, `/crm/v3/objects/companies/${companyId}?properties=name,domain,industry,website,numberofemployees,annualrevenue,description`
  )
}

// ============================================================
//  Deals: Search / Get / Create / Update
// ============================================================

/** Search deals */
export async function searchHubSpotDeals(
  accessToken: string,
  query: string,
  limit: number = 10
): Promise<HubSpotDeal[]> {
  const data = await hubSpotPost<{ results?: HubSpotDeal[] }>(
    accessToken, '/crm/v3/objects/deals/search',
    {
      filterGroups: [{
        filters: [
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: query },
        ],
      }],
      properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'hubspot_owner_id'],
      limit,
    }
  )
  return data.results ?? []
}

/** Get a single deal */
export async function getHubSpotDeal(
  accessToken: string,
  dealId: string
): Promise<HubSpotDeal> {
  return hubSpotGet<HubSpotDeal>(
    accessToken, `/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,pipeline,closedate,hubspot_owner_id,hs_lastmodifieddate`
  )
}

/** Create a deal */
export async function createHubSpotDeal(
  accessToken: string,
  properties: Record<string, string>,
  associations?: Array<{ to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }>
): Promise<HubSpotDeal> {
  const body: Record<string, unknown> = { properties }
  if (associations) body.associations = associations
  return hubSpotPost<HubSpotDeal>(accessToken, '/crm/v3/objects/deals', body)
}

/** Update a deal */
export async function updateHubSpotDeal(
  accessToken: string,
  dealId: string,
  properties: Record<string, string>
): Promise<HubSpotDeal> {
  return hubSpotPatch<HubSpotDeal>(
    accessToken, `/crm/v3/objects/deals/${dealId}`,
    { properties }
  )
}

// ============================================================
//  Notes: Create
// ============================================================

/** Create a note and associate it */
export async function createHubSpotNote(
  accessToken: string,
  body: string,
  associations?: Array<{ to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }>
): Promise<HubSpotNote> {
  const reqBody: Record<string, unknown> = {
    properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
  }
  if (associations) reqBody.associations = associations
  return hubSpotPost<HubSpotNote>(accessToken, '/crm/v3/objects/notes', reqBody)
}

// ============================================================
//  Owners: List
// ============================================================

/** List all owners */
export async function listHubSpotOwners(
  accessToken: string
): Promise<HubSpotOwner[]> {
  const data = await hubSpotGet<{ results?: HubSpotOwner[] }>(
    accessToken, '/crm/v3/owners'
  )
  return data.results ?? []
}

// ============================================================
//  Pipelines: List
// ============================================================

/** List deal pipelines */
export async function listHubSpotPipelines(
  accessToken: string
): Promise<HubSpotPipeline[]> {
  const data = await hubSpotGet<{ results?: HubSpotPipeline[] }>(
    accessToken, '/crm/v3/pipelines/deals'
  )
  return data.results ?? []
}
