/**
 * Notion Integration Service
 *
 * Full API coverage: pages (create/get/update), databases (query/list),
 * blocks (append/list), search, comments, users.
 * Uses Notion REST API v2022-06-28 with Internal Integration Token.
 */

import { getIntegrationToken } from '@/integrations/_core/provider-tokens'

// ============================================================
//  Types
// ============================================================

export type NotionRichText = {
  type: 'text'
  text: { content: string; link?: { url: string } | null }
  plain_text: string
}

export type NotionPage = {
  id: string
  object: 'page'
  url: string
  created_time: string
  last_edited_time: string
  archived: boolean
  parent: { type: string; database_id?: string; page_id?: string; workspace?: boolean }
  properties: Record<string, unknown>
  icon?: { type: string; emoji?: string } | null
}

export type NotionDatabase = {
  id: string
  object: 'database'
  title: NotionRichText[]
  url: string
  created_time: string
  last_edited_time: string
  properties: Record<string, { id: string; type: string; name: string }>
}

export type NotionBlock = {
  id: string
  object: 'block'
  type: string
  created_time: string
  has_children: boolean
  [key: string]: unknown
}

export type NotionUser = {
  id: string
  object: 'user'
  name: string
  type: 'person' | 'bot'
  avatar_url?: string
  person?: { email?: string }
}

export type NotionComment = {
  id: string
  object: 'comment'
  created_time: string
  rich_text: NotionRichText[]
  created_by: { id: string }
}

// ============================================================
//  Credentials
// ============================================================

const NOTION_VERSION = '2022-06-28'
const NOTION_BASE = 'https://api.notion.com/v1'

export async function getNotionToken(workspaceId: string): Promise<string> {
  return getIntegrationToken(workspaceId, 'notion')
}

// ============================================================
//  Internal helpers
// ============================================================

async function notionGet<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${NOTION_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  })
  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function notionPost<T>(token: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${NOTION_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function notionPatch<T>(token: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${NOTION_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

// ============================================================
//  Search
// ============================================================

/** Global search across pages and databases */
export async function searchNotion(
  token: string,
  query: string,
  filter?: 'page' | 'database',
  pageSize: number = 10
): Promise<Array<NotionPage | NotionDatabase>> {
  const body: Record<string, unknown> = {
    query,
    page_size: pageSize,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  }
  if (filter) {
    body.filter = { value: filter, property: 'object' }
  }
  const data = await notionPost<{ results: Array<NotionPage | NotionDatabase> }>(token, '/search', body)
  return data.results
}

// ============================================================
//  Pages: Get / Create / Update / Archive
// ============================================================

/** Get a page */
export async function getNotionPage(token: string, pageId: string): Promise<NotionPage> {
  return notionGet<NotionPage>(token, `/pages/${pageId}`)
}

/** Create a page in a database */
export async function createNotionPage(
  token: string,
  databaseId: string,
  properties: Record<string, unknown>,
  children?: Record<string, unknown>[]
): Promise<NotionPage> {
  const body: Record<string, unknown> = {
    parent: { database_id: databaseId },
    properties,
  }
  if (children && children.length > 0) {
    body.children = children
  }
  return notionPost<NotionPage>(token, '/pages', body)
}

/** Update page properties */
export async function updateNotionPage(
  token: string,
  pageId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  return notionPatch<NotionPage>(token, `/pages/${pageId}`, { properties })
}

/** Archive (soft-delete) a page */
export async function archiveNotionPage(
  token: string,
  pageId: string
): Promise<NotionPage> {
  return notionPatch<NotionPage>(token, `/pages/${pageId}`, { archived: true })
}

// ============================================================
//  Databases: Get / Query
// ============================================================

/** Get database schema */
export async function getNotionDatabase(token: string, databaseId: string): Promise<NotionDatabase> {
  return notionGet<NotionDatabase>(token, `/databases/${databaseId}`)
}

/** Query a database with optional filters and sorts */
export async function queryNotionDatabase(
  token: string,
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>,
  pageSize: number = 20
): Promise<NotionPage[]> {
  const body: Record<string, unknown> = { page_size: pageSize }
  if (filter) body.filter = filter
  if (sorts) body.sorts = sorts

  const data = await notionPost<{ results: NotionPage[] }>(token, `/databases/${databaseId}/query`, body)
  return data.results
}

// ============================================================
//  Blocks: List Children / Append
// ============================================================

/** List child blocks of a page or block */
export async function listNotionBlocks(
  token: string,
  blockId: string,
  pageSize: number = 50
): Promise<NotionBlock[]> {
  const data = await notionGet<{ results: NotionBlock[] }>(
    token, `/blocks/${blockId}/children?page_size=${pageSize}`
  )
  return data.results
}

/** Append blocks to a page or block */
export async function appendNotionBlocks(
  token: string,
  blockId: string,
  children: Record<string, unknown>[]
): Promise<NotionBlock[]> {
  const data = await notionPatch<{ results: NotionBlock[] }>(
    token, `/blocks/${blockId}/children`, { children }
  )
  return data.results
}

// ============================================================
//  Comments: List / Create
// ============================================================

/** List comments on a page */
export async function listNotionComments(
  token: string,
  blockId: string
): Promise<NotionComment[]> {
  const data = await notionGet<{ results: NotionComment[] }>(
    token, `/comments?block_id=${blockId}`
  )
  return data.results
}

/** Add a comment to a page */
export async function createNotionComment(
  token: string,
  pageId: string,
  text: string
): Promise<NotionComment> {
  return notionPost<NotionComment>(token, '/comments', {
    parent: { page_id: pageId },
    rich_text: [{ type: 'text', text: { content: text } }],
  })
}

// ============================================================
//  Users: List
// ============================================================

/** List all workspace users */
export async function listNotionUsers(token: string): Promise<NotionUser[]> {
  const data = await notionGet<{ results: NotionUser[] }>(token, '/users')
  return data.results
}

// ============================================================
//  Helper: Build rich text block
// ============================================================

/** Build a paragraph block for appending content */
export function buildParagraphBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  }
}

/** Build a to-do block */
export function buildTodoBlock(text: string, checked: boolean = false): Record<string, unknown> {
  return {
    object: 'block',
    type: 'to_do',
    to_do: {
      rich_text: [{ type: 'text', text: { content: text } }],
      checked,
    },
  }
}

/** Build a heading block */
export function buildHeadingBlock(text: string, level: 1 | 2 | 3 = 2): Record<string, unknown> {
  const key = `heading_${level}`
  return {
    object: 'block',
    type: key,
    [key]: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  }
}

/** Extract plain text title from page properties */
export function extractPageTitle(properties: Record<string, unknown>): string {
  for (const val of Object.values(properties)) {
    const prop = val as { type?: string; title?: Array<{ plain_text: string }> }
    if (prop.type === 'title' && prop.title?.[0]?.plain_text) {
      return prop.title[0].plain_text
    }
  }
  return 'Untitled'
}
