/**
 * Google Calendar Integration Service
 *
 * Full API coverage: events (list/create/update/delete),
 * free/busy queries, calendar list. Uses Google Calendar REST API v3
 * with OAuth tokens stored via the same Google OAuth flow as Gmail.
 */

import { createServiceClient } from '@/foundation/database/service'
import { decrypt, encrypt } from '@/integrations/_core/encryption'
import {
  requireIntegrationConnected,
} from '@/integrations/_core/connection-guard'
import {
  isProviderAuthFailure,
  markIntegrationAuthFailed,
  markIntegrationAuthSucceeded,
} from '@/integrations/_core/integration-health'

// ============================================================
//  Types
// ============================================================

export type CalendarEvent = {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  status: string
  htmlLink: string
  creator?: { email?: string; displayName?: string }
  organizer?: { email?: string; displayName?: string }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: string
    self?: boolean
  }>
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
  reminders?: { useDefault: boolean }
  created: string
  updated: string
}

export type FreeBusySlot = {
  start: string
  end: string
}

export type CalendarListEntry = {
  id: string
  summary: string
  primary?: boolean
  backgroundColor?: string
  accessRole: string
  timeZone?: string
}

// ============================================================
//  Access Token — Independent Google Calendar OAuth
// ============================================================

/** Safety margin so a token cannot expire mid-request. */
export const CALENDAR_TOKEN_EXPIRY_MARGIN_MS = 60_000

/**
 * A null, malformed, or imminently expiring `expires_at` counts as expired.
 */
export function isCalendarAccessTokenUsable(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + CALENDAR_TOKEN_EXPIRY_MARGIN_MS
}

async function getCalendarAccessToken(workspaceId: string, forceRefresh: boolean = false): Promise<string> {
  const supabase = createServiceClient()

  await requireIntegrationConnected(supabase, workspaceId, 'google_calendar')

  // Look for google_calendar's own OAuth access token
  const { data: accessRow, error: accessError } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google_calendar')
    .eq('token_type', 'oauth_access')
    .maybeSingle()

  if (accessError) throw accessError
  if (!accessRow) {
    const errorMsg = 'Google Calendar OAuth credentials are missing — reconnect in Settings > Connections.'
    await markIntegrationAuthFailed({
      supabase,
      workspaceId,
      provider: 'google_calendar',
      errorMessage: errorMsg,
    })
    throw new Error(errorMsg)
  }

  if (!forceRefresh && isCalendarAccessTokenUsable(accessRow.expires_at)) {
    return decrypt(accessRow.encrypted_value, accessRow.iv, accessRow.auth_tag)
  }

  // Token expired — refresh it using google_calendar's own refresh token
  const { data: refreshRow, error: refreshError } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google_calendar')
    .eq('token_type', 'oauth_refresh')
    .maybeSingle()

  if (refreshError) throw refreshError
  if (!refreshRow) {
    const errorMsg = 'Google Calendar refresh token not found — reconnect in Settings > Connections.'
    await markIntegrationAuthFailed({
      supabase,
      workspaceId,
      provider: 'google_calendar',
      errorMessage: errorMsg,
    })
    throw new Error(errorMsg)
  }

  try {
    const refreshToken = decrypt(refreshRow.encrypted_value, refreshRow.iv, refreshRow.auth_tag)
    const { accessToken, expiresAt } = await refreshGoogleToken(refreshToken)

    // Save the new access token before using it.
    const encrypted = encrypt(accessToken)
    const { error: updateError } = await supabase
      .from('integration_tokens')
      .update({
        encrypted_value: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        expires_at: expiresAt.toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('provider', 'google_calendar')
      .eq('token_type', 'oauth_access')

    if (updateError) throw updateError

    return accessToken
  } catch (refreshErr) {
    const errorMsg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
    await markIntegrationAuthFailed({
      supabase,
      workspaceId,
      provider: 'google_calendar',
      errorMessage: errorMsg,
    })
    throw refreshErr
  }
}

export type CalendarAccessDeps = {
  getAccessToken: (workspaceId: string, forceRefresh: boolean) => Promise<string>
  markAuthSucceeded: (workspaceId: string) => Promise<void>
  markAuthFailed: (workspaceId: string, errorMessage: string) => Promise<void>
}

function defaultCalendarAccessDeps(): CalendarAccessDeps {
  const supabase = createServiceClient()
  return {
    getAccessToken: getCalendarAccessToken,
    markAuthSucceeded: async (workspaceId) => {
      await markIntegrationAuthSucceeded({ supabase, workspaceId, provider: 'google_calendar' })
    },
    markAuthFailed: async (workspaceId, errorMessage) => {
      await markIntegrationAuthFailed({
        supabase,
        workspaceId,
        provider: 'google_calendar',
        errorMessage,
      })
    },
  }
}

export async function executeWithCalendarAccessToken<T>(
  workspaceId: string,
  fn: (accessToken: string) => Promise<T>,
  deps: CalendarAccessDeps = defaultCalendarAccessDeps()
): Promise<T> {
  try {
    const accessToken = await deps.getAccessToken(workspaceId, false)
    const result = await fn(accessToken)
    await deps.markAuthSucceeded(workspaceId)
    return result
  } catch (error) {
    // Shared detector so Calendar, Gmail, and the chat-boundary guard all agree
    // on what an auth failure is — and all correctly exclude a 403 rate limit.
    if (isProviderAuthFailure(error)) {
      try {
        const freshAccessToken = await deps.getAccessToken(workspaceId, true)
        const result = await fn(freshAccessToken)
        await deps.markAuthSucceeded(workspaceId)
        return result
      } catch (retryError) {
        const msg = retryError instanceof Error ? retryError.message : String(retryError)
        await deps.markAuthFailed(workspaceId, `Google Calendar 401 retry failed: ${msg}`)
        throw retryError
      }
    }

    throw error
  }
}

/** Refresh a Google OAuth token (works for any Google provider) */
async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured on this deployment.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to refresh Google Calendar token: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error('Google Calendar token refresh returned no access token.')
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  }
}

// ============================================================
//  Internal helpers
// ============================================================

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_REQUEST_TIMEOUT_MS = 10_000

async function calendarApiError(response: Response) {
  const body = await response.text().catch(() => '')
  return new Error(
    `Calendar API error: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 1_000)}` : ''}`
  )
}

/**
 * Verify that the token issued during OAuth can make a real Calendar request.
 * The OAuth callback invokes this before publishing a connected state, so chat
 * is never unlocked by a token exchange alone.
 */
export async function verifyGoogleCalendarAccess(accessToken: string): Promise<void> {
  let response: Response

  try {
    response = await fetch(`${CALENDAR_BASE}/users/me/calendarList?maxResults=1&fields=items(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'request failed'
    throw new Error(`Google Calendar authorization could not be verified: ${detail}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Google Calendar authorization could not be verified: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
    )
  }
}

async function calendarGet<T>(accessToken: string, path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const response = await fetch(`${CALENDAR_BASE}${path}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw await calendarApiError(response)

  return (await response.json()) as T
}

async function calendarPost<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${CALENDAR_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw await calendarApiError(response)

  return (await response.json()) as T
}

async function calendarPatch<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${CALENDAR_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw await calendarApiError(response)

  return (await response.json()) as T
}

async function calendarDelete(accessToken: string, path: string): Promise<void> {
  const response = await fetch(`${CALENDAR_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok && response.status !== 204) throw await calendarApiError(response)
}

// ============================================================
//  Events: List / Get / Create / Update / Delete
// ============================================================

/** List upcoming events */
export async function listCalendarEvents(
  accessToken: string,
  calendarId: string = 'primary',
  params?: {
    timeMin?: string
    timeMax?: string
    maxResults?: number
    q?: string
    singleEvents?: boolean
    orderBy?: 'startTime' | 'updated'
  }
): Promise<CalendarEvent[]> {
  const queryParams: Record<string, string> = {
    singleEvents: String(params?.singleEvents ?? true),
    orderBy: params?.orderBy ?? 'startTime',
    maxResults: String(params?.maxResults ?? 25),
    timeMin: params?.timeMin ?? new Date().toISOString(),
  }
  if (params?.timeMax) queryParams.timeMax = params.timeMax
  if (params?.q) queryParams.q = params.q

  const data = await calendarGet<{ items?: CalendarEvent[] }>(
    accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, queryParams
  )
  return data.items ?? []
}

/** Get a single event */
export async function getCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<CalendarEvent> {
  return calendarGet<CalendarEvent>(
    accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  )
}

/** Create a new event */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string = 'primary',
  event: {
    summary: string
    description?: string
    location?: string
    start: { dateTime: string; timeZone?: string }
    end: { dateTime: string; timeZone?: string }
    attendees?: Array<{ email: string }>
    conferenceDataVersion?: number
  }
): Promise<CalendarEvent> {
  const params = event.conferenceDataVersion
    ? `?conferenceDataVersion=${event.conferenceDataVersion}` : ''
  const response = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      attendees: event.attendees,
    }),
    signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw await calendarApiError(response)

  return (await response.json()) as CalendarEvent
}

/** Update an existing event */
export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  updates: {
    summary?: string
    description?: string
    location?: string
    start?: { dateTime: string; timeZone?: string }
    end?: { dateTime: string; timeZone?: string }
    attendees?: Array<{ email: string }>
  }
): Promise<CalendarEvent> {
  return calendarPatch<CalendarEvent>(
    accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    updates as Record<string, unknown>
  )
}

/** Delete an event */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await calendarDelete(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
}

// ============================================================
//  Free/Busy Query
// ============================================================

/** Check free/busy status */
export async function queryFreeBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  calendarIds: string[] = ['primary']
): Promise<Record<string, FreeBusySlot[]>> {
  const data = await calendarPost<{
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>
  }>(accessToken, '/freeBusy', {
    timeMin,
    timeMax,
    items: calendarIds.map((id) => ({ id })),
  })

  const result: Record<string, FreeBusySlot[]> = {}
  if (data.calendars) {
    for (const [calId, cal] of Object.entries(data.calendars)) {
      result[calId] = (cal.busy ?? []).map((b) => ({ start: b.start, end: b.end }))
    }
  }
  return result
}

// ============================================================
//  Calendar List
// ============================================================

/** List all calendars the user has access to */
export async function listCalendars(
  accessToken: string
): Promise<CalendarListEntry[]> {
  const data = await calendarGet<{ items?: CalendarListEntry[] }>(
    accessToken, '/users/me/calendarList'
  )
  return data.items ?? []
}

// ============================================================
//  Exported credential helper
// ============================================================

export { getCalendarAccessToken }
