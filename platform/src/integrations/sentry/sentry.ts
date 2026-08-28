/**
 * Sentry Integration Service
 *
 * Full API coverage: issues (list/get/update/resolve/assign),
 * events (list/latest), projects (list), releases (list),
 * tags (list). Uses Sentry REST API v0.
 */

import { getIntegrationMetadata, getIntegrationToken } from '@/integrations/_core/provider-tokens'

// ============================================================
//  Types
// ============================================================

type SentryMetadata = {
  organization_slug?: string
  project_slug?: string
}

export type SentryCredentials = {
  authToken: string
  organizationSlug: string
  projectSlug: string | null
}

export type SentryIssue = {
  id: string
  title: string
  culprit?: string
  permalink?: string
  shortId?: string
  count?: string
  userCount?: number
  firstSeen?: string
  lastSeen?: string
  status?: string
  level?: string
  isUnhandled?: boolean
  type?: string
  metadata?: { type?: string; value?: string; filename?: string; function?: string }
  assignedTo?: { name?: string; email?: string; type?: string } | null
  project?: { id?: string; slug?: string; name?: string }
  platform?: string
  statusDetails?: Record<string, unknown>
}

export type SentryEvent = {
  eventID: string
  title: string
  message?: string
  dateCreated: string
  user?: { email?: string; id?: string; ip_address?: string }
  tags?: Array<{ key: string; value: string }>
  context?: Record<string, unknown>
  entries?: Array<{ type: string; data: unknown }>
}

export type SentryProject = {
  id: string
  slug: string
  name: string
  platform?: string
  dateCreated: string
  status: string
}

export type SentryRelease = {
  version: string
  shortVersion?: string
  dateCreated: string
  dateReleased?: string | null
  newGroups?: number
  commitCount?: number
  authors?: Array<{ name?: string; email?: string }>
  lastDeploy?: { dateFinished?: string; environment?: string } | null
}

export type SentryTag = {
  key: string
  name: string
  totalValues: number
  topValues?: Array<{ value: string; count: number }>
}

// ============================================================
//  Credentials
// ============================================================

const SENTRY_BASE = 'https://sentry.io/api/0'

export async function getSentryCredentials(workspaceId: string): Promise<SentryCredentials> {
  const [authToken, metadata] = await Promise.all([
    getIntegrationToken(workspaceId, 'sentry'),
    getIntegrationMetadata<SentryMetadata>(workspaceId, 'sentry'),
  ])

  const organizationSlug =
    typeof metadata.organization_slug === 'string' && metadata.organization_slug.length > 0
      ? metadata.organization_slug
      : ''
  const projectSlug =
    typeof metadata.project_slug === 'string' && metadata.project_slug.length > 0
      ? metadata.project_slug
      : null

  if (!organizationSlug) {
    throw new Error('Sentry organization slug is missing for this workspace')
  }

  return { authToken, organizationSlug, projectSlug }
}

// ============================================================
//  Internal helpers
// ============================================================

async function sentryGet<T>(authToken: string, path: string): Promise<T> {
  const response = await fetch(`${SENTRY_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Sentry API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function sentryPut<T>(authToken: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SENTRY_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Sentry API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

// ============================================================
//  Validate
// ============================================================

export async function validateSentryToken(authToken: string, organizationSlug: string) {
  try {
    const response = await fetch(
      `${SENTRY_BASE}/organizations/${organizationSlug}/issues/?limit=1`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    )
    return response.ok
  } catch {
    return false
  }
}

// ============================================================
//  Issues: List / Get / Update / Resolve / Assign
// ============================================================

/** List issues (unresolved by default, for sync) */
export async function fetchSentryIssues(
  authToken: string,
  organizationSlug: string,
  projectSlug: string | null,
  query: string = 'is:unresolved',
  limit: number = 25
): Promise<SentryIssue[]> {
  const params = new URLSearchParams({ limit: String(limit), query, statsPeriod: '14d' })
  if (projectSlug) params.append('project', projectSlug)

  return sentryGet<SentryIssue[]>(
    authToken,
    `/organizations/${organizationSlug}/issues/?${params.toString()}`
  )
}

/** Get a single issue */
export async function getSentryIssue(
  authToken: string,
  issueId: string
): Promise<SentryIssue> {
  return sentryGet<SentryIssue>(authToken, `/issues/${issueId}/`)
}

/** Update issue status (resolve, unresolve, ignore) */
export async function updateSentryIssueStatus(
  authToken: string,
  issueId: string,
  status: 'resolved' | 'unresolved' | 'ignored',
  statusDetails?: Record<string, unknown>
): Promise<SentryIssue> {
  const body: Record<string, unknown> = { status }
  if (statusDetails) body.statusDetails = statusDetails
  return sentryPut<SentryIssue>(authToken, `/issues/${issueId}/`, body)
}

/** Assign issue to a user */
export async function assignSentryIssue(
  authToken: string,
  issueId: string,
  assignedTo: string // email or 'team:team-slug'
): Promise<SentryIssue> {
  return sentryPut<SentryIssue>(authToken, `/issues/${issueId}/`, { assignedTo })
}

// ============================================================
//  Events: List / Latest
// ============================================================

/** List events for an issue */
export async function listSentryIssueEvents(
  authToken: string,
  issueId: string,
  limit: number = 10
): Promise<SentryEvent[]> {
  return sentryGet<SentryEvent[]>(authToken, `/issues/${issueId}/events/?limit=${limit}`)
}

/** Get latest event for an issue */
export async function getSentryLatestEvent(
  authToken: string,
  issueId: string
): Promise<SentryEvent> {
  return sentryGet<SentryEvent>(authToken, `/issues/${issueId}/events/latest/`)
}

// ============================================================
//  Projects: List
// ============================================================

/** List all projects in the org */
export async function listSentryProjects(
  authToken: string,
  organizationSlug: string
): Promise<SentryProject[]> {
  return sentryGet<SentryProject[]>(authToken, `/organizations/${organizationSlug}/projects/`)
}

// ============================================================
//  Releases: List
// ============================================================

/** List recent releases */
export async function listSentryReleases(
  authToken: string,
  organizationSlug: string,
  projectSlug?: string | null,
  limit: number = 10
): Promise<SentryRelease[]> {
  const params = new URLSearchParams({ per_page: String(limit) })
  if (projectSlug) params.append('project', projectSlug)

  return sentryGet<SentryRelease[]>(
    authToken,
    `/organizations/${organizationSlug}/releases/?${params.toString()}`
  )
}

// ============================================================
//  Tags: List for issue
// ============================================================

/** List tags on an issue */
export async function listSentryIssueTags(
  authToken: string,
  issueId: string
): Promise<SentryTag[]> {
  return sentryGet<SentryTag[]>(authToken, `/issues/${issueId}/tags/`)
}
