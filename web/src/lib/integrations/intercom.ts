/**
 * Intercom Integration Service
 *
 * Full API coverage: conversations, contacts, companies, tags,
 * notes, articles, admins. Uses Intercom REST API v2.14.
 */

import { getIntegrationMetadata, getIntegrationToken } from './provider-tokens'

// ============================================================
//  Types
// ============================================================

export type IntercomCredentials = {
  accessToken: string
  apiBaseUrl: string
}

export type IntercomContact = {
  id?: string
  name?: string
  email?: string
  role?: string
  phone?: string
  created_at?: number
  updated_at?: number
  custom_attributes?: Record<string, unknown>
  companies?: {
    data?: Array<{
      id?: string
      name?: string
    }>
  }
  tags?: {
    data?: Array<{
      id?: string
      name?: string
    }>
  }
}

export type IntercomConversation = {
  id?: string
  title?: string
  state?: string
  open?: boolean
  read?: boolean
  priority?: string
  created_at?: number
  updated_at?: number
  waiting_since?: number
  snoozed_until?: number
  source?: {
    body?: string
    author?: {
      name?: string
      email?: string
      id?: string
      type?: string
    }
  }
  contacts?: {
    contacts?: Array<{
      id?: string
      name?: string
      email?: string
    }>
  }
  assignee?: {
    id?: string
    name?: string
    email?: string
    type?: string
  }
  tags?: {
    tags?: Array<{
      id?: string
      name?: string
    }>
  }
  statistics?: {
    time_to_assignment?: number
    time_to_admin_reply?: number
    time_to_first_close?: number
    time_to_last_close?: number
    median_time_to_reply?: number
    first_contact_reply_at?: number
    first_admin_reply_at?: number
    last_contact_reply_at?: number
    last_admin_reply_at?: number
    count_reopens?: number
    count_assignments?: number
  }
  conversation_parts?: {
    conversation_parts?: Array<{
      id?: string
      part_type?: string
      body?: string
      created_at?: number
      author?: {
        id?: string
        type?: string
        name?: string
        email?: string
      }
    }>
  }
}

export type IntercomAdmin = {
  id: string
  name: string
  email: string
  type: string
}

export type IntercomTag = {
  id: string
  name: string
}

export type IntercomArticle = {
  id: string
  title: string
  description: string
  body: string
  state: string
  url: string
  created_at: number
  updated_at: number
}

export type IntercomNote = {
  id: string
  body: string
  created_at: number
  author: { id: string; name: string }
}

type IntercomMetadata = {
  api_base_url?: string
}

const DEFAULT_INTERCOM_API_BASE_URL = 'https://api.intercom.io'
const INTERCOM_VERSION = '2.14'

// ============================================================
//  Core Credentials
// ============================================================

export async function getIntercomCredentials(workspaceId: string): Promise<IntercomCredentials> {
  const [accessToken, metadata] = await Promise.all([
    getIntegrationToken(workspaceId, 'intercom'),
    getIntegrationMetadata<IntercomMetadata>(workspaceId, 'intercom'),
  ])

  return {
    accessToken,
    apiBaseUrl:
      typeof metadata.api_base_url === 'string' && metadata.api_base_url.length > 0
        ? metadata.api_base_url
        : DEFAULT_INTERCOM_API_BASE_URL,
  }
}

// ============================================================
//  Internal helpers
// ============================================================

async function intercomGet<T>(accessToken: string, apiBaseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Intercom-Version': INTERCOM_VERSION,
    },
  })

  if (!response.ok) {
    throw new Error(`Intercom API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function intercomPost<T>(
  accessToken: string,
  apiBaseUrl: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Intercom-Version': INTERCOM_VERSION,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Intercom API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function intercomPut<T>(
  accessToken: string,
  apiBaseUrl: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Intercom-Version': INTERCOM_VERSION,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Intercom API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

// ============================================================
//  Validate Token
// ============================================================

export async function validateIntercomToken(accessToken: string, apiBaseUrl = DEFAULT_INTERCOM_API_BASE_URL) {
  try {
    const response = await fetch(`${apiBaseUrl}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Intercom-Version': INTERCOM_VERSION,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

// ============================================================
//  Contacts: List / Search / Create / Update
// ============================================================

/** List contacts with pagination */
export async function fetchIntercomContacts(accessToken: string, apiBaseUrl: string) {
  const contacts: IntercomContact[] = []
  let path = '/contacts?per_page=150'

  while (path) {
    const data = await intercomGet<{
      data?: IntercomContact[]
      pages?: { next?: { starting_after?: string } | null }
    }>(accessToken, apiBaseUrl, path)

    contacts.push(...(data.data ?? []))
    const nextCursor = data.pages?.next?.starting_after
    path = nextCursor ? `/contacts?per_page=150&starting_after=${encodeURIComponent(nextCursor)}` : ''
  }

  return contacts
}

/** Search contacts by email, name, or query */
export async function searchIntercomContacts(
  accessToken: string,
  apiBaseUrl: string,
  query: string
): Promise<IntercomContact[]> {
  const data = await intercomPost<{ data?: IntercomContact[] }>(
    accessToken, apiBaseUrl, '/contacts/search',
    {
      query: {
        operator: 'OR',
        value: [
          { field: 'email', operator: '~', value: query },
          { field: 'name', operator: '~', value: query },
        ],
      },
    }
  )
  return data.data ?? []
}

/** Create a new contact */
export async function createIntercomContact(
  accessToken: string,
  apiBaseUrl: string,
  params: { email: string; name?: string; role?: 'user' | 'lead'; phone?: string; customAttributes?: Record<string, unknown> }
): Promise<IntercomContact> {
  return intercomPost<IntercomContact>(accessToken, apiBaseUrl, '/contacts', {
    email: params.email,
    ...(params.name ? { name: params.name } : {}),
    role: params.role ?? 'user',
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.customAttributes ? { custom_attributes: params.customAttributes } : {}),
  })
}

/** Update a contact */
export async function updateIntercomContact(
  accessToken: string,
  apiBaseUrl: string,
  contactId: string,
  updates: { name?: string; phone?: string; customAttributes?: Record<string, unknown> }
): Promise<IntercomContact> {
  return intercomPut<IntercomContact>(accessToken, apiBaseUrl, `/contacts/${contactId}`, {
    ...(updates.name ? { name: updates.name } : {}),
    ...(updates.phone ? { phone: updates.phone } : {}),
    ...(updates.customAttributes ? { custom_attributes: updates.customAttributes } : {}),
  })
}

// ============================================================
//  Conversations: List / Get / Reply / Close / Reopen / Snooze / Assign
// ============================================================

/** List open conversations */
export async function fetchIntercomOpenConversations(accessToken: string, apiBaseUrl: string) {
  const conversations: IntercomConversation[] = []
  let path = '/conversations?per_page=150&state=open'

  while (path) {
    const data = await intercomGet<{
      conversations?: IntercomConversation[]
      pages?: { next?: { starting_after?: string } | null }
    }>(accessToken, apiBaseUrl, path)

    conversations.push(...(data.conversations ?? []))
    const nextCursor = data.pages?.next?.starting_after
    path = nextCursor
      ? `/conversations?per_page=150&state=open&starting_after=${encodeURIComponent(nextCursor)}`
      : ''
  }

  return conversations
}

/** List conversations by state */
export async function listIntercomConversations(
  accessToken: string,
  apiBaseUrl: string,
  state: 'open' | 'closed' | 'snoozed' = 'open',
  limit: number = 20
): Promise<IntercomConversation[]> {
  const data = await intercomGet<{ conversations?: IntercomConversation[] }>(
    accessToken, apiBaseUrl,
    `/conversations?per_page=${Math.min(limit, 150)}&state=${state}&display_as=plaintext`
  )
  return (data.conversations ?? []).slice(0, limit)
}

/** Get a single conversation with full parts */
export async function getIntercomConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string
): Promise<IntercomConversation> {
  return intercomGet<IntercomConversation>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}?display_as=plaintext`
  )
}

/** Search conversations */
export async function searchIntercomConversations(
  accessToken: string,
  apiBaseUrl: string,
  query: string
): Promise<IntercomConversation[]> {
  const data = await intercomPost<{ conversations?: IntercomConversation[] }>(
    accessToken, apiBaseUrl, '/conversations/search',
    {
      query: {
        operator: 'AND',
        value: [
          { field: 'source.body', operator: '~', value: query },
        ],
      },
    }
  )
  return data.conversations ?? []
}

/** Reply to a conversation as admin */
export async function replyToConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string,
  adminId: string,
  body: string,
  messageType: 'comment' | 'note' = 'comment'
): Promise<IntercomConversation> {
  return intercomPost<IntercomConversation>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}/reply`,
    {
      message_type: messageType,
      type: 'admin',
      admin_id: adminId,
      body,
    }
  )
}

/** Close a conversation */
export async function closeConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string,
  adminId: string,
  body?: string
): Promise<IntercomConversation> {
  return intercomPost<IntercomConversation>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}/parts`,
    {
      message_type: 'close',
      type: 'admin',
      admin_id: adminId,
      ...(body ? { body } : {}),
    }
  )
}

/** Reopen a conversation */
export async function reopenConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string,
  adminId: string
): Promise<IntercomConversation> {
  return intercomPost<IntercomConversation>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}/parts`,
    {
      message_type: 'open',
      type: 'admin',
      admin_id: adminId,
    }
  )
}

/** Snooze a conversation */
export async function snoozeConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string,
  adminId: string,
  snoozedUntil: number
): Promise<IntercomConversation> {
  return intercomPost<IntercomConversation>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}/parts`,
    {
      message_type: 'snoozed',
      type: 'admin',
      admin_id: adminId,
      snoozed_until: snoozedUntil,
    }
  )
}

/** Assign a conversation to an admin or team */
export async function assignConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string,
  adminId: string,
  assigneeId: string,
  body?: string
): Promise<IntercomConversation> {
  return intercomPost<IntercomConversation>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}/parts`,
    {
      message_type: 'assignment',
      type: 'admin',
      admin_id: adminId,
      assignee_id: assigneeId,
      ...(body ? { body } : {}),
    }
  )
}

// ============================================================
//  Tags: List / Create / Tag Conversation
// ============================================================

/** List all tags */
export async function listIntercomTags(
  accessToken: string,
  apiBaseUrl: string
): Promise<IntercomTag[]> {
  const data = await intercomGet<{ data?: IntercomTag[] }>(accessToken, apiBaseUrl, '/tags')
  return data.data ?? []
}

/** Create a new tag */
export async function createIntercomTag(
  accessToken: string,
  apiBaseUrl: string,
  name: string
): Promise<IntercomTag> {
  return intercomPost<IntercomTag>(accessToken, apiBaseUrl, '/tags', { name })
}

/** Tag a conversation */
export async function tagConversation(
  accessToken: string,
  apiBaseUrl: string,
  conversationId: string,
  adminId: string,
  tagId: string
): Promise<IntercomTag> {
  return intercomPost<IntercomTag>(
    accessToken, apiBaseUrl,
    `/conversations/${conversationId}/tags`,
    { id: tagId, admin_id: adminId }
  )
}

/** Tag a contact */
export async function tagContact(
  accessToken: string,
  apiBaseUrl: string,
  contactId: string,
  tagId: string
): Promise<IntercomTag> {
  return intercomPost<IntercomTag>(
    accessToken, apiBaseUrl,
    `/contacts/${contactId}/tags`,
    { id: tagId }
  )
}

// ============================================================
//  Notes: Create on Contact
// ============================================================

/** Create a note on a contact */
export async function createContactNote(
  accessToken: string,
  apiBaseUrl: string,
  contactId: string,
  adminId: string,
  body: string
): Promise<IntercomNote> {
  return intercomPost<IntercomNote>(
    accessToken, apiBaseUrl,
    `/contacts/${contactId}/notes`,
    { admin_id: adminId, body }
  )
}

// ============================================================
//  Admins: List
// ============================================================

/** List all admins */
export async function listIntercomAdmins(
  accessToken: string,
  apiBaseUrl: string
): Promise<IntercomAdmin[]> {
  const data = await intercomGet<{ admins?: IntercomAdmin[] }>(accessToken, apiBaseUrl, '/admins')
  return data.admins ?? []
}

// ============================================================
//  Articles: List / Search
// ============================================================

/** List help center articles */
export async function listIntercomArticles(
  accessToken: string,
  apiBaseUrl: string,
  page: number = 1
): Promise<IntercomArticle[]> {
  const data = await intercomGet<{ data?: IntercomArticle[] }>(
    accessToken, apiBaseUrl, `/articles?page=${page}&per_page=25`
  )
  return data.data ?? []
}

/** Search help center articles */
export async function searchIntercomArticles(
  accessToken: string,
  apiBaseUrl: string,
  query: string
): Promise<IntercomArticle[]> {
  const data = await intercomGet<{ data?: { articles?: IntercomArticle[] } }>(
    accessToken, apiBaseUrl, `/articles/search?phrase=${encodeURIComponent(query)}`
  )
  return data.data?.articles ?? []
}

// ============================================================
//  Companies: List
// ============================================================

export type IntercomCompany = {
  id: string
  name: string
  company_id: string
  plan?: { name?: string }
  monthly_spend?: number
  user_count?: number
  created_at?: number
  custom_attributes?: Record<string, unknown>
}

/** List companies */
export async function listIntercomCompanies(
  accessToken: string,
  apiBaseUrl: string,
  limit: number = 50
): Promise<IntercomCompany[]> {
  const data = await intercomGet<{ data?: IntercomCompany[] }>(
    accessToken, apiBaseUrl, `/companies?per_page=${Math.min(limit, 150)}`
  )
  return data.data ?? []
}
