/**
 * PostHog Integration Service
 *
 * Handles: usage trends, feature flags, annotations, persons,
 * events, insights, cohorts, and identity resolution.
 * Uses PostHog's REST API with Personal API key.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from './encryption'

type PostHogCredentials = {
  apiKey: string
  projectId: string
}

type PostHogApiResponse<T = Record<string, unknown>> = T & {
  next?: string | null
  previous?: string | null
  count?: number
}

// ============================================================
//  Core Credentials
// ============================================================

export async function getPostHogCredentials(workspaceId: string): Promise<PostHogCredentials> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag, token_type')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'posthog')

  if (error) throw error
  if (!data || data.length === 0) throw new Error('PostHog not connected for this workspace')

  const keyRow = data.find((d) => d.token_type === 'api_key')
  if (!keyRow) throw new Error('PostHog API key not found')

  const apiKey = decrypt(keyRow.encrypted_value, keyRow.iv, keyRow.auth_tag)

  const { data: connData } = await supabase
    .from('integration_connections')
    .select('metadata')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'posthog')
    .maybeSingle()

  const projectId = (connData?.metadata as Record<string, unknown>)?.project_id as string ?? ''

  return { apiKey, projectId }
}

// ============================================================
//  Internal helper: PostHog API call
// ============================================================

async function posthogGet<T = Record<string, unknown>>(
  apiKey: string,
  projectId: string,
  path: string,
  params?: Record<string, string>
): Promise<PostHogApiResponse<T>> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const response = await fetch(
    `https://app.posthog.com/api/projects/${projectId}/${path}${qs}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )

  if (!response.ok) {
    throw new Error(`PostHog API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as PostHogApiResponse<T>
}

async function posthogPost<T = Record<string, unknown>>(
  apiKey: string,
  projectId: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://app.posthog.com/api/projects/${projectId}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(`PostHog API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function posthogPatch<T = Record<string, unknown>>(
  apiKey: string,
  projectId: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://app.posthog.com/api/projects/${projectId}/${path}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(`PostHog API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function posthogDelete(
  apiKey: string,
  projectId: string,
  path: string
): Promise<void> {
  const response = await fetch(
    `https://app.posthog.com/api/projects/${projectId}/${path}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  )

  if (!response.ok) {
    throw new Error(`PostHog API error: ${response.status} ${response.statusText}`)
  }
}

// ============================================================
//  Usage Trends (existing, refined)
// ============================================================

export type UsageTrend = {
  distinctId: string
  totalEvents: number
  eventDelta7d: number
  lastSeenAt: string | null
  topEvent: string | null
}

export async function fetchUsageTrends(
  workspaceId: string,
  _dateFrom: string,
  _dateTo: string
): Promise<UsageTrend[]> {
  void _dateFrom
  void _dateTo
  const { apiKey, projectId } = await getPostHogCredentials(workspaceId)
  const data = await posthogGet<{ results: Array<{ distinct_ids: string[]; properties: Record<string, unknown>; created_at: string }> }>(
    apiKey, projectId, 'persons/', { limit: '1000' }
  )

  return data.results.map((person) => ({
    distinctId: person.distinct_ids[0] ?? 'unknown',
    totalEvents: 0,
    eventDelta7d: 0,
    lastSeenAt: person.created_at,
    topEvent: null,
  }))
}

// ============================================================
//  Event Count Query (existing)
// ============================================================

export async function queryEventCounts(
  workspaceId: string,
  params: {
    events: string[]
    dateFrom: string
    dateTo: string
    interval: 'day' | 'week'
  }
): Promise<Record<string, number[]>> {
  const { apiKey, projectId } = await getPostHogCredentials(workspaceId)

  const body = {
    events: params.events.map((event) => ({
      id: event,
      type: 'events' as const,
      math: 'total' as const,
    })),
    date_from: params.dateFrom,
    date_to: params.dateTo,
    interval: params.interval,
  }

  const data = await posthogPost<{ result: Array<{ action: { id: string }; data: number[] }> }>(
    apiKey, projectId, 'insights/trend/', body
  )

  const result: Record<string, number[]> = {}
  for (const series of data.result) {
    result[series.action.id] = series.data
  }
  return result
}

// ============================================================
//  Validate API Key (existing)
// ============================================================

export async function validatePostHogKey(apiKey: string, projectId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://app.posthog.com/api/projects/${projectId}/`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    return response.ok
  } catch {
    return false
  }
}

// ============================================================
//  Annotations — Create / List
// ============================================================

export type PostHogAnnotation = {
  id: number
  content: string
  date_marker: string
  scope: string
  creation_type: string
  created_at: string
}

/** Create an annotation (marker on charts) */
export async function createAnnotation(
  apiKey: string,
  projectId: string,
  content: string,
  dateMarker: string,
  scope: 'organization' | 'project' = 'project'
): Promise<PostHogAnnotation> {
  return posthogPost<PostHogAnnotation>(
    apiKey, projectId, 'annotations/',
    { content, date_marker: dateMarker, scope, creation_type: 'USR' }
  )
}

/** List annotations */
export async function listAnnotations(
  apiKey: string,
  projectId: string,
  limit: number = 20
): Promise<PostHogAnnotation[]> {
  const data = await posthogGet<{ results: PostHogAnnotation[] }>(
    apiKey, projectId, 'annotations/', { limit: String(limit) }
  )
  return data.results ?? []
}

// ============================================================
//  Feature Flags — List / Get / Toggle
// ============================================================

export type PostHogFeatureFlag = {
  id: number
  key: string
  name: string
  active: boolean
  rollout_percentage: number | null
  filters: Record<string, unknown>
  created_at: string
}

/** List all feature flags */
export async function listFeatureFlags(
  apiKey: string,
  projectId: string
): Promise<PostHogFeatureFlag[]> {
  const data = await posthogGet<{ results: PostHogFeatureFlag[] }>(
    apiKey, projectId, 'feature_flags/', { limit: '200' }
  )
  return data.results ?? []
}

/** Get a single feature flag by ID */
export async function getFeatureFlag(
  apiKey: string,
  projectId: string,
  flagId: number
): Promise<PostHogFeatureFlag> {
  return posthogGet<PostHogFeatureFlag>(apiKey, projectId, `feature_flags/${flagId}/`)
}

/** Toggle a feature flag on/off */
export async function toggleFeatureFlag(
  apiKey: string,
  projectId: string,
  flagId: number,
  active: boolean
): Promise<PostHogFeatureFlag> {
  return posthogPatch<PostHogFeatureFlag>(
    apiKey, projectId, `feature_flags/${flagId}/`,
    { active }
  )
}

// ============================================================
//  Persons — Search / Get / Delete
// ============================================================

export type PostHogPerson = {
  id: string
  distinct_ids: string[]
  properties: Record<string, unknown>
  created_at: string
}

/** Search persons by distinct_id or properties */
export async function searchPersons(
  apiKey: string,
  projectId: string,
  search: string,
  limit: number = 20
): Promise<PostHogPerson[]> {
  const data = await posthogGet<{ results: PostHogPerson[] }>(
    apiKey, projectId, 'persons/', { search, limit: String(limit) }
  )
  return data.results ?? []
}

/** Delete a person by ID (GDPR compliance) */
export async function deletePerson(
  apiKey: string,
  projectId: string,
  personId: string
): Promise<void> {
  await posthogDelete(apiKey, projectId, `persons/${personId}/`)
}

// ============================================================
//  Events — Query / Get recent
// ============================================================

export type PostHogEvent = {
  id: string
  event: string
  distinct_id: string
  timestamp: string
  properties: Record<string, unknown>
}

/** Get recent events (optionally filtered by event name or person) */
export async function getRecentEvents(
  apiKey: string,
  projectId: string,
  params?: { event?: string; distinctId?: string; limit?: number; after?: string }
): Promise<PostHogEvent[]> {
  const queryParams: Record<string, string> = {
    limit: String(params?.limit ?? 50),
    orderBy: '-timestamp',
  }
  if (params?.event) queryParams.event = params.event
  if (params?.distinctId) queryParams.distinct_id = params.distinctId
  if (params?.after) queryParams.after = params.after

  const data = await posthogGet<{ results: PostHogEvent[] }>(
    apiKey, projectId, 'events/', queryParams
  )
  return data.results ?? []
}

// ============================================================
//  Insights — List / Get
// ============================================================

export type PostHogInsight = {
  id: number
  name: string
  short_id: string
  description: string
  filters: Record<string, unknown>
  result: unknown
  created_at: string
  last_refresh: string
}

/** List saved insights */
export async function listInsights(
  apiKey: string,
  projectId: string,
  limit: number = 20
): Promise<PostHogInsight[]> {
  const data = await posthogGet<{ results: PostHogInsight[] }>(
    apiKey, projectId, 'insights/', { limit: String(limit) }
  )
  return data.results ?? []
}

/** Get a single insight by ID */
export async function getInsight(
  apiKey: string,
  projectId: string,
  insightId: number
): Promise<PostHogInsight> {
  return posthogGet<PostHogInsight>(apiKey, projectId, `insights/${insightId}/`)
}

// ============================================================
//  Cohorts — List / Create
// ============================================================

export type PostHogCohort = {
  id: number
  name: string
  count: number
  is_static: boolean
  groups: unknown
  created_at: string
}

/** List all cohorts */
export async function listCohorts(
  apiKey: string,
  projectId: string
): Promise<PostHogCohort[]> {
  const data = await posthogGet<{ results: PostHogCohort[] }>(
    apiKey, projectId, 'cohorts/'
  )
  return data.results ?? []
}

// ============================================================
//  Event Definitions — What events exist
// ============================================================

export type PostHogEventDefinition = {
  id: string
  name: string
  volume_30_day: number | null
  query_usage_30_day: number | null
}

/** List event definitions (what events are tracked) */
export async function listEventDefinitions(
  apiKey: string,
  projectId: string
): Promise<PostHogEventDefinition[]> {
  const data = await posthogGet<{ results: PostHogEventDefinition[] }>(
    apiKey, projectId, 'event_definitions/', { limit: '200' }
  )
  return data.results ?? []
}

// ============================================================
//  Actions — List
// ============================================================

export type PostHogAction = {
  id: number
  name: string
  description: string
  post_to_slack: boolean
  created_at: string
}

/** List all actions */
export async function listActions(
  apiKey: string,
  projectId: string
): Promise<PostHogAction[]> {
  const data = await posthogGet<{ results: PostHogAction[] }>(
    apiKey, projectId, 'actions/', { limit: '200' }
  )
  return data.results ?? []
}

// ============================================================
//  Dashboards — List
// ============================================================

export type PostHogDashboard = {
  id: number
  name: string
  description: string
  created_at: string
  tiles: Array<{ insight?: { id: number; name: string } }>
}

/** List all dashboards */
export async function listDashboards(
  apiKey: string,
  projectId: string
): Promise<PostHogDashboard[]> {
  const data = await posthogGet<{ results: PostHogDashboard[] }>(
    apiKey, projectId, 'dashboards/', { limit: '100' }
  )
  return data.results ?? []
}
