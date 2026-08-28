/**
 * Airtable Integration Service
 *
 * Full API coverage: bases (list), tables (list), records (list/get/create/update/delete),
 * fields (list). Uses Airtable REST API.
 */

import { getIntegrationToken } from '@/integrations/_core/provider-tokens'

// ============================================================
//  Types
// ============================================================

export type AirtableBase = {
  id: string
  name: string
  permissionLevel: string
}

export type AirtableTable = {
  id: string
  name: string
  description?: string
  primaryFieldId?: string
  fields: AirtableField[]
}

export type AirtableField = {
  id: string
  name: string
  type: string
  description?: string
}

export type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
  createdTime: string
}

// ============================================================
//  Credentials
// ============================================================

const AIRTABLE_BASE = 'https://api.airtable.com/v0'
const AIRTABLE_META = 'https://api.airtable.com/v0/meta'

export async function getAirtableToken(workspaceId: string): Promise<string> {
  return getIntegrationToken(workspaceId, 'airtable')
}

// ============================================================
//  Internal helpers
// ============================================================

async function airtableGet<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function airtablePost<T>(token: string, url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function airtablePatch<T>(token: string, url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function airtableDelete(token: string, url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
  }
}

// ============================================================
//  Validate
// ============================================================

export async function validateAirtableToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${AIRTABLE_META}/bases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.ok
  } catch {
    return false
  }
}

// ============================================================
//  Bases: List
// ============================================================

/** List all accessible bases */
export async function listAirtableBases(token: string): Promise<AirtableBase[]> {
  const data = await airtableGet<{ bases: AirtableBase[] }>(token, `${AIRTABLE_META}/bases`)
  return data.bases
}

// ============================================================
//  Tables: List (with fields)
// ============================================================

/** List tables in a base (includes field schemas) */
export async function listAirtableTables(token: string, baseId: string): Promise<AirtableTable[]> {
  const data = await airtableGet<{ tables: AirtableTable[] }>(
    token, `${AIRTABLE_META}/bases/${baseId}/tables`
  )
  return data.tables
}

// ============================================================
//  Records: List / Get / Create / Update / Delete
// ============================================================

/** List records from a table */
export async function listAirtableRecords(
  token: string,
  baseId: string,
  tableIdOrName: string,
  maxRecords: number = 20,
  view?: string,
  filterFormula?: string
): Promise<AirtableRecord[]> {
  const params = new URLSearchParams({ maxRecords: String(maxRecords) })
  if (view) params.set('view', view)
  if (filterFormula) params.set('filterByFormula', filterFormula)

  const data = await airtableGet<{ records: AirtableRecord[] }>(
    token, `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`
  )
  return data.records
}

/** Get a single record */
export async function getAirtableRecord(
  token: string,
  baseId: string,
  tableIdOrName: string,
  recordId: string
): Promise<AirtableRecord> {
  return airtableGet<AirtableRecord>(
    token, `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`
  )
}

/** Create a record */
export async function createAirtableRecord(
  token: string,
  baseId: string,
  tableIdOrName: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  return airtablePost<AirtableRecord>(
    token, `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}`,
    { fields }
  )
}

/** Update a record */
export async function updateAirtableRecord(
  token: string,
  baseId: string,
  tableIdOrName: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  return airtablePatch<AirtableRecord>(
    token, `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`,
    { fields }
  )
}

/** Delete a record */
export async function deleteAirtableRecord(
  token: string,
  baseId: string,
  tableIdOrName: string,
  recordId: string
): Promise<void> {
  await airtableDelete(
    token, `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`
  )
}
