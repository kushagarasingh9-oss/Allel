/**
 * Google Calendar Integration Service
 *
 * Full API coverage: events (list/create/update/delete),
 * free/busy queries, calendar list. Uses Google Calendar REST API v3
 * with OAuth tokens stored via the same Google OAuth flow as Gmail.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { getGmailAccessToken } from './gmail'
import { getIntegrationToken } from './provider-tokens'
import {
  IntegrationConnectionError,
  getIntegrationConnection,
  isIntegrationConnected,
} from './connection-guard'

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
//  Access Token — Reuse Gmail's Google OAuth
// ============================================================

async function getCalendarAccessToken(workspaceId: string): Promise<string> {
  const supabase = createServiceClient()

  // Google Calendar can be connected directly or through Gmail's Google OAuth
  // grant. Both are live credentials, but neither may bypass connection state.
  const [calendarConnection, gmailConnection, hasCalendarConnection, hasGmailConnection] = await Promise.all([
    getIntegrationConnection(supabase, workspaceId, 'google_calendar'),
    getIntegrationConnection(supabase, workspaceId, 'gmail'),
    isIntegrationConnected(supabase, workspaceId, 'google_calendar'),
    isIntegrationConnected(supabase, workspaceId, 'gmail'),
  ])

  if (!hasCalendarConnection && !hasGmailConnection) {
    throw new IntegrationConnectionError(
      'google_calendar',
      calendarConnection?.status ?? gmailConnection?.status ?? 'missing'
    )
  }

  // Both branches retrieve a live OAuth token through a guarded credential
  // path. Calendar never reads a cached row directly or falls back to demo
  // workspace data.
  if (hasCalendarConnection) {
    try {
      return await getIntegrationToken(workspaceId, 'google_calendar', 'oauth_access')
    } catch (error) {
      if (!hasGmailConnection) throw error
    }
  }

  if (hasGmailConnection) {
    return getGmailAccessToken(workspaceId)
  }

  throw new Error('Google Calendar not connected — connect Google Calendar or Gmail with calendar scopes')
}

// ============================================================
//  Internal helpers
// ============================================================

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

async function calendarGet<T>(accessToken: string, path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const response = await fetch(`${CALENDAR_BASE}${path}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status} ${response.statusText}`)
  }

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
  })

  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status} ${response.statusText}`)
  }

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
  })

  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function calendarDelete(accessToken: string, path: string): Promise<void> {
  const response = await fetch(`${CALENDAR_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok && response.status !== 204) {
    throw new Error(`Calendar API error: ${response.status} ${response.statusText}`)
  }
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
    accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
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
  })

  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status} ${response.statusText}`)
  }

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
    accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    updates as Record<string, unknown>
  )
}

/** Delete an event */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await calendarDelete(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`)
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
