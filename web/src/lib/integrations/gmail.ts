import { createServiceClient } from '@/lib/supabase/service'
import { decrypt, encrypt } from './encryption'

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
}

export type GmailProfile = {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
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

type GmailMessage = {
  id?: string
  internalDate?: string
  labelIds?: string[]
  payload?: {
    headers?: GmailHeader[]
  }
}

type GmailThreadResponse = {
  id?: string
  snippet?: string
  messages?: GmailMessage[]
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function getGmailScopeMode(): GmailScopeMode {
  return process.env.GOOGLE_GMAIL_SCOPE_MODE === 'full' ? 'full' : 'send_only'
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
  }
}

export function buildEmailSearchQuery(email: string, lookbackDays: number = 120) {
  return `newer_than:${lookbackDays}d (from:${email} OR to:${email})`
}

export function threadNeedsReply(
  thread: Pick<GmailThread, 'isUnread' | 'lastMessageAt' | 'lastSenderEmail'>,
  ownerEmail: string,
  lastTouchAt?: string | null
) {
  const owner = ownerEmail.toLowerCase()
  const lastSender = thread.lastSenderEmail?.toLowerCase()

  if (!lastSender || lastSender === owner) {
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

export function getGmailAuthUrl(workspaceId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.')
  }

  // Include a random nonce in the state to prevent CSRF attacks.
  // Format: "workspaceId:nonce" — the callback should validate the nonce.
  const nonce = crypto.randomUUID()
  const statePayload = `${workspaceId}:${nonce}`

  const scopes = (
    isGmailReadSyncEnabled()
      ? [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.compose',
        ]
      : ['https://www.googleapis.com/auth/gmail.send']
  ).join(' ')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: statePayload,
  })

  if (isGmailReadSyncEnabled()) {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGmailCode(code: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? '',
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

async function getAccessToken(workspaceId: string): Promise<string> {
  const supabase = createServiceClient()

  const { data: accessRow, error: accessError } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'gmail')
    .eq('token_type', 'oauth_access')
    .maybeSingle()

  if (accessError) throw accessError
  if (!accessRow) {
    throw new Error('Gmail not connected for this workspace')
  }

  if (accessRow.expires_at && new Date(accessRow.expires_at) > new Date()) {
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
  const accessToken = await getAccessToken(workspaceId)

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gmail profile fetch failed: ${error}`)
  }

  const data = (await response.json()) as {
    emailAddress: string
    messagesTotal: number
    threadsTotal: number
  }

  return {
    emailAddress: data.emailAddress.toLowerCase(),
    messagesTotal: data.messagesTotal,
    threadsTotal: data.threadsTotal,
  }
}

export async function sendEmail(
  workspaceId: string,
  params: SendEmailParams
): Promise<SendEmailResult> {
  const accessToken = await getAccessToken(workspaceId)

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

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage,
      ...(params.replyToThreadId ? { threadId: params.replyToThreadId } : {}),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gmail send failed: ${error}`)
  }

  const data = (await response.json()) as { id: string; threadId: string }

  return {
    messageId: data.id,
    threadId: data.threadId,
    sent: true,
  }
}

export async function fetchThreads(
  workspaceId: string,
  query: string,
  maxResults: number = 20
): Promise<GmailThread[]> {
  if (!isGmailReadSyncEnabled()) {
    return []
  }

  const accessToken = await getAccessToken(workspaceId)

  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  })

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gmail threads fetch failed: ${error}`)
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

export function isGmailConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  )
}
