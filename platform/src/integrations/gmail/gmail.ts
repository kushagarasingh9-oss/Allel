import { createServiceClient } from '@/foundation/database/service'
import { decrypt, encrypt } from '@/integrations/_core/encryption'
import { getIntegrationConnection, requireIntegrationConnected } from '@/integrations/_core/connection-guard'
import {
  isProviderAuthFailure,
  markIntegrationAuthFailed,
  markIntegrationAuthSucceeded,
} from '@/integrations/_core/integration-health'

export type GmailScopeMode = 'send_only' | 'full'

export type GmailThread = {
  threadId: string
  subject: string
  from: string
  to: string
  snippet: string
  date: string
  isUnread: boolean
  messageCount: number
  lastMessageAt: string
  lastMessageId: string
  lastSenderEmail: string | null
  participantEmails: string[]
  /**
   * Per-message contents, oldest first.
   *
   * Optional because the inbox listing does not need it — only thread detail
   * populates it. Without this the agent could see who a thread was from but not
   * what it said, so "what does this say?" was answered from a 220-char snippet.
   */
  messages?: GmailThreadMessage[]
}

export type GmailThreadMessage = {
  id: string
  from: string
  fromEmail: string | null
  to: string
  date: string
  body: string
}

export type GmailProfile = {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
  historyId: string
}

export type GmailHistoryMessage = {
  id: string
  threadId: string
}

export type GmailHistoryResult = {
  historyId: string
  messages: GmailHistoryMessage[]
}

export type SendEmailParams = {
  to: string
  subject: string
  body: string
  htmlBody?: string
  replyToThreadId?: string
}

export type SendEmailResult = {
  messageId: string
  threadId: string
  sent: boolean
}

type GmailHeader = {
  name?: string
  value?: string
}

type GmailMessagePart = {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailMessagePart[]
}

type GmailMessage = {
  id?: string
  internalDate?: string
  labelIds?: string[]
  payload?: {
    headers?: GmailHeader[]
    mimeType?: string
    body?: { data?: string; size?: number }
    parts?: GmailMessagePart[]
  }
}

/**
 * Plain-text body of a Gmail message.
 *
 * Gmail nests bodies arbitrarily deep in multipart messages, so this walks the
 * tree preferring text/plain and falling back to text/html. Returns an empty
 * string rather than throwing: a body that cannot be decoded must not fail the
 * whole thread read.
 */
function extractMessageBody(part: GmailMessagePart | undefined, depth = 0): string {
  if (!part || depth > 8) return ''

  const decode = (data?: string) =>
    data ? Buffer.from(data, 'base64url').toString('utf8') : ''

  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decode(part.body.data)
  }

  for (const child of part.parts ?? []) {
    const nested = extractMessageBody(child, depth + 1)
    if (nested) return nested
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    // Strip tags rather than hand markup to the model.
    return decode(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return decode(part.body?.data)
}

type GmailThreadResponse = {
  id?: string
  snippet?: string
  messages?: GmailMessage[]
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function getGmailScopeMode(): GmailScopeMode {
  // Inbox access is the product's normal operating mode. Deployments that
  // intentionally grant send-only access must opt out explicitly.
  return process.env.GOOGLE_GMAIL_SCOPE_MODE === 'send_only' ? 'send_only' : 'full'
}

export function isGmailReadSyncEnabled() {
  return getGmailScopeMode() === 'full'
}

export function extractEmailAddress(value: string | null | undefined) {
  if (!value) return null

  const match = value.match(EMAIL_REGEX)
  return match?.[0]?.toLowerCase() ?? null
}

function extractEmailAddresses(value: string | null | undefined) {
  if (!value) return []

  return Array.from(
    new Set(
      (value.match(EMAIL_REGEX) ?? []).map((email) => email.toLowerCase())
    )
  )
}

function getHeaderValue(headers: GmailHeader[] | undefined, name: string) {
  return (
    headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? ''
  )
}

function sortMessages(messages: GmailMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = Number(left.internalDate ?? 0)
    const rightTime = Number(right.internalDate ?? 0)
    return leftTime - rightTime
  })
}

function buildThreadFromResponse(thread: GmailThreadResponse): GmailThread | null {
  if (!thread.id) return null

  const sortedMessages = sortMessages(thread.messages ?? [])
  const firstMessage = sortedMessages[0]
  const lastMessage = sortedMessages.at(-1)
  const firstHeaders = firstMessage?.payload?.headers ?? []
  const lastHeaders = lastMessage?.payload?.headers ?? []

  const subject =
    getHeaderValue(firstHeaders, 'Subject') ||
    getHeaderValue(lastHeaders, 'Subject') ||
    'No subject'
  const from = getHeaderValue(lastHeaders, 'From')
  const to = getHeaderValue(lastHeaders, 'To')
  const dateHeader = getHeaderValue(lastHeaders, 'Date')
  const lastMessageAt =
    lastMessage?.internalDate && Number(lastMessage.internalDate) > 0
      ? new Date(Number(lastMessage.internalDate)).toISOString()
      : dateHeader
        ? new Date(dateHeader).toISOString()
        : new Date().toISOString()

  const participantEmails = Array.from(
    new Set([
      ...sortedMessages.flatMap((message) =>
        extractEmailAddresses(getHeaderValue(message.payload?.headers, 'From'))
      ),
      ...sortedMessages.flatMap((message) =>
        extractEmailAddresses(getHeaderValue(message.payload?.headers, 'To'))
      ),
      ...sortedMessages.flatMap((message) =>
        extractEmailAddresses(getHeaderValue(message.payload?.headers, 'Cc'))
      ),
    ])
  )

  return {
    threadId: thread.id,
    subject,
    from,
    to,
    snippet: thread.snippet ?? '',
    date: lastMessageAt,
    isUnread: sortedMessages.some((message) =>
      (message.labelIds ?? []).includes('UNREAD')
    ),
    messageCount: sortedMessages.length,
    lastMessageAt,
    lastMessageId: lastMessage?.id ?? thread.id,
    lastSenderEmail: extractEmailAddress(from),
    participantEmails,
    messages: sortedMessages.map((message) => {
      const headers = message.payload?.headers ?? []
      const messageFrom = getHeaderValue(headers, 'From')
      const messageDateHeader = getHeaderValue(headers, 'Date')

      return {
        id: message.id ?? '',
        from: messageFrom,
        fromEmail: extractEmailAddress(messageFrom),
        to: getHeaderValue(headers, 'To'),
        date:
          message.internalDate && Number(message.internalDate) > 0
            ? new Date(Number(message.internalDate)).toISOString()
            : messageDateHeader
              ? new Date(messageDateHeader).toISOString()
              : lastMessageAt,
        body: extractMessageBody(message.payload),
      }
    }),
  }
}

export function buildEmailSearchQuery(email: string, lookbackDays: number = 120) {
  return `newer_than:${lookbackDays}d (from:${email} OR to:${email})`
}

export type GmailThreadCategory =
  | 'marketing_digest'
  | 'customer_support_issue'
  | 'financial_revenue_event'
  | 'security_alert'
  | 'linkedin_invite'
  | 'direct_human_email'

export type GmailThreadPriority = 'critical' | 'high' | 'medium' | 'low'

export type GmailThreadClassification = {
  category: GmailThreadCategory
  needsReply: boolean
  priority: GmailThreadPriority
  score: number
  personName?: string
}

const AUTOMATED_SENDER_MARKERS = [
  'no-reply',
  'noreply',
  'newsletter',
  'digest',
  'marketing',
  'mailer-daemon',
  'notifications@',
  'notification@',
  'news@',
  'updates@',
  'offers@',
  'promotions@',
  'info@',
  'jobs@',
  'perks@',
  'support@mail.',
  'hello@',
]

const AUTOMATED_BRAND_MARKERS = [
  'ftmo',
  'gitlab',
  'medium',
  'substack',
  'bankless',
  'w3schools',
  'pinterest',
  'facebook',
  'wispr',
  'notion',
  'adobe',
  'udemy',
  'ajio',
  'parallels',
  'founderpass',
  'lottiefiles',
  'henry labs',
  'wellfound',
  'sloan',
  'gucci',
  'phil rosen',
  'opening bell',
]

const MARKETING_CONTENT_MARKERS = [
  'unsubscribe',
  'opt out',
  'manage preferences',
  'view in browser',
  'view online',
  'weekly market recap',
  'market recap',
  'short squeeze',
  'what\'s new',
  'your code is in',
  'missed this week',
  'webinar',
  'course',
  'posts/day',
  'posts per day',
  'unicoin',
  "defining crypto's place",
  'product update',
  'special offer',
  '% off',
  'perks',
  'new collection',
  'intern at',
  'job alert',
  'jobs for you',
  'daily newsletter',
  'weekly newsletter',
  'daily digest',
  'complete your registration',
  'welcome to',
  'learning opportunity',
]

function includesAny(value: string, markers: readonly string[]) {
  return markers.some((marker) => value.includes(marker))
}

function extractLinkedInInvitePerson(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`
  const match = text.match(
    /(?:^|\b)([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2})\s+(?:wants to connect|sent you a connection request)/
  )
  return match?.[1]?.trim()
}

export function scoreEmailThread(thread: {
  subject?: string
  from?: string
  snippet?: string
  messageCount?: number
}): number {
  const from = (thread.from ?? '').toLowerCase()
  const subject = (thread.subject ?? '').toLowerCase()
  const snippet = (thread.snippet ?? '').toLowerCase()
  const content = `${subject}\n${snippet}`

  let score = 50

  // 1. Financial / Revenue / Critical
  if (includesAny(content, ['payment failed', 'card declined', 'invoice overdue', 'subscription expiring', 'payout failed'])) {
    score += 35
  }

  // 2. Customer support / bug report
  if (
    includesAny(content, ['bug', 'broken', 'not working', 'cannot access', "can't access", 'locked out']) &&
    /\b(i|we|my|our)\b|can you|could you|please help/.test(content)
  ) {
    score += 40
  }

  // 3. Stated deadlines or explicit questions
  if (includesAny(content, ['deadline', 'asap', 'by tomorrow', 'by today', 'due date', 'urgent'])) {
    score += 20
  }
  if (content.includes('?')) {
    score += 15
  }

  // 4. Thread depth / active conversation
  if ((thread.messageCount ?? 1) > 1) {
    score += Math.min(15, (thread.messageCount ?? 1) * 3)
  }

  // 5. Automated / Marketing negative signals
  if (includesAny(from, AUTOMATED_SENDER_MARKERS)) {
    score -= 30
  }
  if (includesAny(content, MARKETING_CONTENT_MARKERS)) {
    score -= 35
  }

  // Weak negative signal for brand domain alone
  const isBrandDomain = includesAny(from, AUTOMATED_BRAND_MARKERS)
  if (isBrandDomain) {
    score -= 20
  }

  return Math.max(10, score)
}

/**
 * Returns machine-readable triage only. The agent, not this parser, is
 * responsible for the founder-facing summary and recommendation.
 */
export function classifyEmailThread(
  thread: { subject?: string; from?: string; snippet?: string; messageCount?: number }
): GmailThreadClassification {
  const from = (thread.from ?? '').toLowerCase()
  const subject = (thread.subject ?? '').toLowerCase()
  const snippet = (thread.snippet ?? '').toLowerCase()
  const content = `${subject}\n${snippet}`

  const isLinkedInInvite =
    from.includes('linkedin') &&
    (content.includes('connect') || content.includes('connection request'))
  if (isLinkedInInvite) {
    return {
      category: 'linkedin_invite',
      needsReply: false,
      priority: 'medium',
      score: 50,
      personName: extractLinkedInInvitePerson(thread.subject ?? '', thread.snippet ?? ''),
    }
  }

  const isCalendarInvite =
    from.includes('calendar-notification@google.com') ||
    subject.startsWith('invitation:') ||
    subject.startsWith('meeting invitation:') ||
    subject.startsWith('updated invitation:') ||
    subject.startsWith('canceled invitation:')
  if (isCalendarInvite) {
    return {
      category: 'marketing_digest',
      needsReply: false,
      priority: 'low',
      score: 30,
    }
  }

  const isSecurityAlert = includesAny(content, [
    'security alert',
    'unrecognised device',
    'unrecognized device',
    'suspicious sign-in',
    'new sign-in',
    'verify your identity',
  ])
  if (isSecurityAlert) {
    return { category: 'security_alert', needsReply: false, priority: 'high', score: 85 }
  }

  const isFinancialEvent = includesAny(content, [
    'payment failed',
    'card declined',
    'invoice overdue',
    'subscription expiring',
    'subscription cancelled',
    'payout failed',
    'payout on hold',
  ])
  if (isFinancialEvent) {
    return { category: 'financial_revenue_event', needsReply: false, priority: 'high', score: 85 }
  }

  const score = scoreEmailThread(thread)

  const isStrictlyAutomatedMarketing =
    includesAny(from, AUTOMATED_SENDER_MARKERS) ||
    includesAny(content, MARKETING_CONTENT_MARKERS) ||
    includesAny(from, AUTOMATED_BRAND_MARKERS)

  if (isStrictlyAutomatedMarketing) {
    return { category: 'marketing_digest', needsReply: false, priority: 'low', score: Math.min(30, score) }
  }

  const reportsProductProblem = includesAny(content, [
    'bug',
    'broken',
    'not working',
    "doesn't work",
    'cannot access',
    "can't access",
    'account locked',
    'locked out',
    'cannot log in',
    "can't log in",
    'billing issue',
    'payment issue',
    'invoice problem',
    'refund request',
    'charged twice',
  ])
  const soundsLikeCustomerReport = /\b(i|we|my|our)\b|can you|could you|please help/.test(content)

  if (reportsProductProblem && soundsLikeCustomerReport) {
    return { category: 'customer_support_issue', needsReply: true, priority: 'critical', score: Math.max(90, score) }
  }

  let priority: GmailThreadPriority = 'medium'
  if (score >= 80) priority = 'critical'
  else if (score >= 65) priority = 'high'
  else if (score >= 45) priority = 'medium'
  else priority = 'low'

  const needsReply = !isStrictlyAutomatedMarketing && score >= 45

  return {
    category: 'direct_human_email',
    needsReply,
    priority,
    score,
  }
}

export function threadNeedsReply(
  thread: Pick<GmailThread, 'isUnread' | 'lastMessageAt' | 'lastSenderEmail' | 'subject' | 'from' | 'snippet'>,
  ownerEmail: string,
  lastTouchAt?: string | null
) {
  const owner = ownerEmail.toLowerCase()
  const lastSender = thread.lastSenderEmail?.toLowerCase() ?? (thread.from ?? '').toLowerCase()

  if (!lastSender || lastSender === owner) {
    return false
  }

  const classification = classifyEmailThread(thread)
  if (!classification.needsReply) {
    return false
  }

  if (!lastTouchAt) {
    return true
  }

  const threadTime = new Date(thread.lastMessageAt).getTime()
  const touchTime = new Date(lastTouchAt).getTime()

  if (Number.isNaN(threadTime) || Number.isNaN(touchTime)) {
    return thread.isUnread
  }

  return thread.isUnread || threadTime > touchTime
}

export function getGoogleOAuthScopes(provider: 'gmail' | 'google_calendar' = 'gmail'): string[] {
  if (provider === 'google_calendar') {
    // The full Calendar scope covers events, free/busy, and the calendar list.
    // Requesting calendar.events as well is redundant and creates a second,
    // confusing consent row without granting anything additional.
    return ['https://www.googleapis.com/auth/calendar']
  }

  return isGmailReadSyncEnabled()
    ? [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
      ]
    : ['https://www.googleapis.com/auth/gmail.send']
}

export function getGoogleRedirectUri(origin?: string): string {
  const envUri = process.env.GOOGLE_REDIRECT_URI
  const callbackPath = '/api/integrations/gmail/callback'

  // When we have a live request origin, always prefer it so the redirect
  // matches the actual host/port the browser is on (fixes port-mismatch
  // issues like app running on :3001 but env says :3000).
  if (origin) {
    let path = callbackPath
    if (envUri) {
      try {
        path = new URL(envUri).pathname
      } catch {
        if (envUri.startsWith('/')) path = envUri
      }
    }
    return `${origin.replace(/\/+$/, '')}${path}`
  }

  // No origin available (e.g. background job) — fall back to env var or defaults
  if (envUri) return envUri

  const base = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base.replace(/\/+$/, '')}${callbackPath}`
}

export function getGoogleAuthUrl(
  workspaceId: string,
  provider: 'gmail' | 'google_calendar' = 'gmail',
  options: {
    forceConsent?: boolean
    redirectUri?: string
    origin?: string
    state?: string
  } = {}
): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = options.redirectUri || getGoogleRedirectUri(options.origin)

  if (!clientId || !redirectUri) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
  }

  // Callers that initiate OAuth in a browser should supply a state value
  // persisted in an HttpOnly cookie. The fallback preserves non-browser use.
  const statePayload = options.state ?? `${workspaceId}:${crypto.randomUUID()}:${provider}`

  const scopes = getGoogleOAuthScopes(provider)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state: statePayload,
  })

  params.set('access_type', 'offline')
  // Consent is required only when this workspace has no durable refresh token.
  // For an established connection, account selection avoids repeatedly
  // returning the founder to Google's consent summary page.
  params.set('prompt', options.forceConsent ? 'consent' : 'select_account')

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** @deprecated Use getGoogleAuthUrl instead */
export const getGmailAuthUrl = getGoogleAuthUrl

export async function exchangeGmailCode(
  code: string,
  redirectUriOverride?: string
): Promise<{
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}> {
  const redirectUri = redirectUriOverride || getGoogleRedirectUri()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gmail token exchange failed: ${error}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function refreshGmailToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: Date
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gmail token refresh failed: ${error}`)
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function getGmailAccessToken(
  workspaceId: string,
  forceRefresh = false
): Promise<string> {
  const supabase = createServiceClient()

  await requireIntegrationConnected(supabase, workspaceId, 'gmail')

  const { data: accessRow, error: accessError } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'gmail')
    .eq('token_type', 'oauth_access')
    .maybeSingle()

  if (accessError) throw accessError
  if (!accessRow) {
    const { data: apiKeyRow } = await supabase
      .from('integration_tokens')
      .select('encrypted_value, iv, auth_tag')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'gmail')
      .eq('token_type', 'api_key')
      .maybeSingle()

    if (apiKeyRow) {
      return decrypt(apiKeyRow.encrypted_value, apiKeyRow.iv, apiKeyRow.auth_tag)
    }

    throw new Error('Gmail not connected for this workspace')
  }

  // A null expires_at is falsy and therefore treated as expired — absent expiry
  // means "refresh before use". The 60s margin stops a token from expiring
  // mid-request, matching the Calendar path.
  const isTokenValid =
    !forceRefresh &&
    Boolean(accessRow.expires_at) &&
    new Date(accessRow.expires_at as string).getTime() > Date.now() + 60_000

  if (isTokenValid) {
    return decrypt(accessRow.encrypted_value, accessRow.iv, accessRow.auth_tag)
  }

  const { data: refreshTokenRow, error: refreshTokenError } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'gmail')
    .eq('token_type', 'oauth_refresh')
    .maybeSingle()

  if (refreshTokenError) throw refreshTokenError
  if (!refreshTokenRow) {
    throw new Error('Gmail refresh token not found')
  }

  const refreshToken = decrypt(
    refreshTokenRow.encrypted_value,
    refreshTokenRow.iv,
    refreshTokenRow.auth_tag
  )

  const { accessToken, expiresAt } = await refreshGmailToken(refreshToken)
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
    .eq('provider', 'gmail')
    .eq('token_type', 'oauth_access')

  if (updateError) throw updateError

  return accessToken
}

/**
 * Run a Gmail call with a valid access token, recovering from a mid-window
 * expiry and recording connection health.
 *
 * Mirrors `executeWithCalendarAccessToken`. Without this, a token that expired
 * between the validity check and the request surfaced as a hard failure, and an
 * auth failure in chat marked nothing — Gmail is `syncable`, so its health was
 * only ever written when the sync runner happened to run.
 *
 * A non-auth failure (404, validation, rate limit) is rethrown untouched: it is
 * not a connection problem and must not flip the row to `needs_attention`.
 */
export async function executeWithGmailAccessToken<T>(
  workspaceId: string,
  fn: (accessToken: string) => Promise<T>
): Promise<T> {
  const supabase = createServiceClient()

  const markHealthy = async () => {
    const connection = await getIntegrationConnection(supabase, workspaceId, 'gmail')
    if (connection?.metadata.last_error) {
      await markIntegrationAuthSucceeded({ supabase, workspaceId, provider: 'gmail' })
    }
  }

  try {
    const result = await fn(await getGmailAccessToken(workspaceId))
    await markHealthy()
    return result
  } catch (error) {
    if (!isProviderAuthFailure(error)) throw error

    try {
      const result = await fn(await getGmailAccessToken(workspaceId, true))
      await markHealthy()
      return result
    } catch (retryError) {
      await markIntegrationAuthFailed({
        supabase,
        workspaceId,
        provider: 'gmail',
        errorMessage:
          retryError instanceof Error ? retryError.message : String(retryError),
      })
      throw retryError
    }
  }
}

async function fetchThreadDetailByAccessToken(
  accessToken: string,
  threadId: string
): Promise<GmailThread | null> {
  const params = new URLSearchParams({
    format: 'full',
  })

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gmail thread fetch failed: ${error}`)
  }

  const data = (await response.json()) as GmailThreadResponse
  return buildThreadFromResponse(data)
}

export async function getGmailProfile(workspaceId: string): Promise<GmailProfile> {
  return executeWithGmailAccessToken(workspaceId, async (accessToken) => {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gmail profile fetch failed: ${response.status} ${error}`)
    }

    const data = (await response.json()) as {
      emailAddress: string
      messagesTotal: number
      threadsTotal: number
      historyId: string
    }

    return {
      emailAddress: data.emailAddress.toLowerCase(),
      messagesTotal: data.messagesTotal,
      threadsTotal: data.threadsTotal,
      historyId: data.historyId,
    }
  })
}

/**
 * Lists messages added after a durable Gmail history cursor. The caller owns
 * cursor persistence and advances it only after it has durably recorded every
 * returned message. A 404 means Gmail has expired the cursor; callers must
 * reconcile safely instead of treating old inbox mail as new customer replies.
 */
export async function listGmailHistory(
  workspaceId: string,
  startHistoryId: string,
  maxResults = 100
): Promise<GmailHistoryResult> {
  if (!isGmailReadSyncEnabled()) {
    return { historyId: startHistoryId, messages: [] }
  }

  return executeWithGmailAccessToken(workspaceId, async (accessToken) => {
    const messages = new Map<string, GmailHistoryMessage>()
    let pageToken: string | null = null
    let latestHistoryId = startHistoryId
    let pagesRead = 0

    do {
      const params = new URLSearchParams({
        startHistoryId,
        historyTypes: 'messageAdded',
        maxResults: String(maxResults),
      })
      if (pageToken) params.set('pageToken', pageToken)

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(12000),
        }
      )

      if (response.status === 404) {
        throw new Error('GMAIL_HISTORY_CURSOR_EXPIRED')
      }
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gmail history fetch failed: ${response.status} ${error}`)
      }

      const data = (await response.json()) as {
        historyId?: string
        nextPageToken?: string
        history?: Array<{
          messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }>
        }>
      }

      if (data.historyId) latestHistoryId = data.historyId
      for (const item of data.history ?? []) {
        for (const added of item.messagesAdded ?? []) {
          const id = added.message?.id
          const threadId = added.message?.threadId
          if (id && threadId) messages.set(id, { id, threadId })
        }
      }

      pageToken = data.nextPageToken ?? null
      pagesRead += 1
      if (pagesRead > 50) {
        throw new Error('Gmail history pagination exceeded safe bound')
      }
    } while (pageToken)

    return { historyId: latestHistoryId, messages: Array.from(messages.values()) }
  })
}

export async function sendEmail(
  workspaceId: string,
  params: SendEmailParams
): Promise<SendEmailResult> {
  let rawMessage: string

  if (params.htmlBody) {
    // Multipart/alternative: plain text + HTML
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const messageParts = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      params.body,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      params.htmlBody,
      `--${boundary}--`,
    ]
    rawMessage = messageParts.join('\r\n')
  } else {
    // Plain text only
    const messageParts = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      params.body,
    ]
    rawMessage = messageParts.join('\r\n')
  }

  const encodedMessage = Buffer.from(rawMessage).toString('base64url')

  return executeWithGmailAccessToken(workspaceId, async (accessToken) => {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        raw: encodedMessage,
        ...(params.replyToThreadId ? { threadId: params.replyToThreadId } : {}),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gmail send failed: ${response.status} ${error}`)
    }

    const data = (await response.json()) as { id: string; threadId: string }

    return {
      messageId: data.id,
      threadId: data.threadId,
      sent: true,
    }
  })
}

export async function fetchThreads(
  workspaceId: string,
  query: string,
  maxResults: number = 20
): Promise<GmailThread[]> {
  if (!isGmailReadSyncEnabled()) {
    return []
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  })

  return executeWithGmailAccessToken(workspaceId, async (accessToken) => {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(12000),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gmail threads fetch failed: ${response.status} ${error}`)
    }

    const data = (await response.json()) as {
      threads?: Array<{ id: string }>
    }

    const details = await Promise.all(
      (data.threads ?? []).map(async (thread) => {
        try {
          return await fetchThreadDetailByAccessToken(accessToken, thread.id)
        } catch (error) {
          console.warn('[gmail] Skipping thread fetch failure', { threadId: thread.id, error })
          return null
        }
      })
    )

    return details
      .filter((thread): thread is GmailThread => Boolean(thread))
      .sort((left, right) =>
        new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()
      )
  })
}

export async function findMostRecentThreadForEmail(
  workspaceId: string,
  email: string
): Promise<GmailThread | null> {
  if (!isGmailReadSyncEnabled()) {
    return null
  }

  const threads = await fetchThreads(workspaceId, buildEmailSearchQuery(email), 5)

  return (
    threads.find((thread) => thread.participantEmails.includes(email.toLowerCase())) ??
    threads[0] ??
    null
  )
}

export async function fetchThreadDetail(
  workspaceId: string,
  threadId: string
): Promise<GmailThread | null> {
  return executeWithGmailAccessToken(workspaceId, (accessToken) =>
    fetchThreadDetailByAccessToken(accessToken, threadId)
  )
}

export function isGmailConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  )
}
