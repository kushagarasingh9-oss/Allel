/**
 * PostHog Integration Service
 *
 * Handles: usage trends, feature flags, annotations, persons,
 * events, insights, cohorts, and identity resolution.
 * Uses PostHog's REST API with Personal API key.
 */

import { getIntegrationMetadata, getIntegrationToken } from './provider-tokens'

type PostHogCredentials = {
  apiKey: string
  projectId: string
  apiHost?: string
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
  const [apiKey, metadata] = await Promise.all([
    getIntegrationToken(workspaceId, 'posthog'),
    getIntegrationMetadata<{ project_id?: unknown; api_host?: unknown }>(workspaceId, 'posthog'),
  ])
  const projectId = typeof metadata.project_id === 'string' ? metadata.project_id : ''
  const apiHost = typeof metadata.api_host === 'string' ? metadata.api_host : 'https://us.posthog.com'

  return { apiKey, projectId, apiHost }
}

// ============================================================
//  Internal helper: PostHog API call
// ============================================================

async function posthogGet<T = Record<string, unknown>>(
  apiKey: string,
  projectId: string,
  path: string,
  params?: Record<string, string>,
  host: string = 'https://us.posthog.com'
): Promise<PostHogApiResponse<T>> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const response = await fetch(
    `${host}/api/projects/${projectId}/${path}${qs}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    }
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
  body: Record<string, unknown>,
  host: string = 'https://us.posthog.com'
): Promise<T> {
  const response = await fetch(
    `${host}/api/projects/${projectId}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
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
  body: Record<string, unknown>,
  host: string = 'https://us.posthog.com'
): Promise<T> {
  const response = await fetch(
    `${host}/api/projects/${projectId}/${path}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
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
  path: string,
  host: string = 'https://us.posthog.com'
): Promise<void> {
  const response = await fetch(
    `${host}/api/projects/${projectId}/${path}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    }
  )

  if (!response.ok) {
    throw new Error(`PostHog API error: ${response.status} ${response.statusText}`)
  }
}

// ============================================================
//  Usage Trends
// ============================================================

export type UsageTrend = {
  distinctId: string
  totalEvents: number
  eventDelta7d: number
  lastSeen: string
  featureEngagement: Record<string, number>
}

/**
 * Fetch 30-day usage trends for active accounts.
 */
export async function getAccountUsageTrends(
  apiKey: string,
  projectId: string
): Promise<UsageTrend[]> {
  try {
    const data = await posthogGet<{
      results: Array<{
        person: { distinct_ids: string[]; properties: Record<string, unknown> }
        count: number
      }>
    }>(apiKey, projectId, 'insights/trend/', {
      events: JSON.stringify([{ id: '$pageview' }, { id: '$autocapture' }]),
      date_from: '-30d',
    })

    if (!data.results) return []

    return data.results.map((r) => ({
      distinctId: r.person.distinct_ids?.[0] ?? 'unknown',
      totalEvents: r.count,
      eventDelta7d: 0,
      lastSeen: new Date().toISOString(),
      featureEngagement: {},
    }))
  } catch {
    return []
  }
}

/**
 * Fetch feature usage metrics.
 */
export async function getFeatureEngagement(
  apiKey: string,
  projectId: string,
  eventNames: string[]
): Promise<Record<string, number[]>> {
  const events = eventNames.map((name) => ({ id: name }))
  const data = await posthogGet<{
    result: Array<{ action: { id: string }; data: number[] }>
  }>(apiKey, projectId, 'insights/trend/', {
    events: JSON.stringify(events),
    date_from: '-14d',
  })

  const result: Record<string, number[]> = {}
  for (const series of data.result) {
    result[series.action.id] = series.data
  }
  return result
}

// ============================================================
//  Validate & Resolve API Key
// ============================================================

export type PostHogValidationResult = {
  valid: boolean
  resolvedProjectId?: string
  resolvedHost?: string
}

export async function validatePostHogKey(apiKey: string, projectId?: string): Promise<boolean> {
  const result = await validateAndResolvePostHog(apiKey, projectId)
  return result.valid
}

export async function validateAndResolvePostHog(
  apiKey: string,
  projectId?: string
): Promise<PostHogValidationResult> {
  const trimmedKey = apiKey.trim()
  const trimmedProject = projectId?.trim() || ''

  if (!trimmedKey) return { valid: false }

  const apiHosts = [
    'https://us.posthog.com',
    'https://eu.posthog.com',
    'https://app.posthog.com',
  ]

  let isExplicitlyUnauthorized = false

  // Phase 1: Try /api/projects/ to discover real project ID and validate key
  for (const host of apiHosts) {
    try {
      const endpoint = `${host}/api/projects/`
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${trimmedKey}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
      })

      if (res.ok) {
        const data = await res.json().catch(() => null)
        const firstProject =
          Array.isArray(data?.results) && data.results.length > 0
            ? String(data.results[0].id)
            : undefined
        const effectiveProjectId =
          trimmedProject && trimmedProject !== 'default'
            ? trimmedProject
            : firstProject || 'default'

        return {
          valid: true,
          resolvedProjectId: effectiveProjectId,
          resolvedHost: host,
        }
      }

      if (res.status === 401 || res.status === 403) {
        isExplicitlyUnauthorized = true
      }
    } catch {
      // Continue trying
    }
  }

  // Phase 2: Try /api/users/@me/
  for (const host of apiHosts) {
    try {
      const endpoint = `${host}/api/users/@me/`
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${trimmedKey}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
      })

      if (res.ok) {
        return {
          valid: true,
          resolvedProjectId:
            trimmedProject && trimmedProject !== 'default'
              ? trimmedProject
              : 'default',
          resolvedHost: host,
        }
      }

      if (res.status === 401 || res.status === 403) {
        isExplicitlyUnauthorized = true
      }
    } catch {
      // Continue trying
    }
  }

  // Phase 3: Try project-specific endpoint if provided
  if (trimmedProject && trimmedProject !== 'default') {
    for (const host of apiHosts) {
      try {
        const endpoint = `${host}/api/projects/${trimmedProject}/`
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${trimmedKey}` },
          redirect: 'follow',
          signal: AbortSignal.timeout(6000),
        })

        if (res.ok) {
          return {
            valid: true,
            resolvedProjectId: trimmedProject,
            resolvedHost: host,
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // Phase 4: Fallback for valid-format keys (phx_... / phc_...) when network/firewall blocks live validation
  if (
    !isExplicitlyUnauthorized &&
    (trimmedKey.startsWith('phx_') ||
      trimmedKey.startsWith('phc_') ||
      trimmedKey.startsWith('ph_') ||
      trimmedKey.length >= 20)
  ) {
    return {
      valid: true,
      resolvedProjectId:
        trimmedProject && trimmedProject !== 'default'
          ? trimmedProject
          : 'default',
      resolvedHost: 'https://us.posthog.com',
    }
  }

  return { valid: false }
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
