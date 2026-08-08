/**
 * Founder Notification Dispatcher
 *
 * Central module for sending real-time notifications to the founder
 * via all connected channels (Slack, email). Used by webhook handlers
 * to push urgent alerts immediately instead of waiting for the daily cron.
 *
 * Design:
 * - Never throws — notifications are best-effort
 * - Tries all channels independently so one failure doesn't block others
 * - Logs outcomes for debugging
 */

import { createServiceClient } from '@/lib/supabase/service'
import { postSlackMessage, getSlackCredentials } from '@/lib/integrations/slack'
import { sendEmail } from '@/lib/integrations/gmail'

// ─── Types ──────────────────────────────────────────────────────────

export type NotificationSeverity = 'critical' | 'urgent' | 'info'

export type FounderNotification = {
  workspaceId: string
  severity: NotificationSeverity
  headline: string
  detail: string
  accountName?: string
  mrrCents?: number
  source: string
  dashboardPath?: string
}

type NotificationResult = {
  slack: { sent: boolean; error?: string }
  email: { sent: boolean; error?: string }
}

// ─── Formatters ─────────────────────────────────────────────────────

function severityEmoji(severity: NotificationSeverity): string {
  switch (severity) {
    case 'critical':
      return '🚨'
    case 'urgent':
      return '⚠️'
    case 'info':
      return 'ℹ️'
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function buildSlackMessage(notification: FounderNotification): string {
  const emoji = severityEmoji(notification.severity)
  const mrrLine = notification.mrrCents
    ? ` · ${formatCurrency(notification.mrrCents)}/mo at risk`
    : ''
  const accountLine = notification.accountName
    ? `*${notification.accountName}*${mrrLine}\n`
    : ''

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link = notification.dashboardPath
    ? `\n<${dashboardUrl}${notification.dashboardPath}|View in dashboard →>`
    : ''

  return `${emoji} *${notification.headline}*\n${accountLine}${notification.detail}${link}`
}

function buildEmailSubject(notification: FounderNotification): string {
  const emoji = severityEmoji(notification.severity)
  return `${emoji} ${notification.headline}${notification.accountName ? ` — ${notification.accountName}` : ''}`
}

function buildEmailBody(notification: FounderNotification): string {
  const mrrLine = notification.mrrCents
    ? `Revenue at risk: ${formatCurrency(notification.mrrCents)}/mo\n`
    : ''

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link = notification.dashboardPath
    ? `\nView in dashboard: ${dashboardUrl}${notification.dashboardPath}`
    : ''

  return [
    notification.headline,
    '',
    notification.accountName ? `Account: ${notification.accountName}` : null,
    mrrLine ? mrrLine.trim() : null,
    '',
    notification.detail,
    link,
    '',
    '— Allel',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

// ─── Channel helpers ────────────────────────────────────────────────

async function getFounderEmail(workspaceId: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('owner_user_id')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.owner_user_id) return null

  const {
    data: { user },
  } = await supabase.auth.admin.getUserById(workspace.owner_user_id)

  return user?.email ?? null
}

async function isProviderConnected(
  workspaceId: string,
  provider: string
): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('integration_connections')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle()

  return data?.status === 'connected'
}

// ─── Main dispatcher ────────────────────────────────────────────────

/**
 * Send a real-time notification to the founder via all connected channels.
 * Never throws — failures are logged and returned in the result.
 */
export async function notifyFounder(
  notification: FounderNotification
): Promise<NotificationResult> {
  const result: NotificationResult = {
    slack: { sent: false },
    email: { sent: false },
  }

  // --- Slack ---
  try {
    if (await isProviderConnected(notification.workspaceId, 'slack')) {
      const creds = await getSlackCredentials(notification.workspaceId)
      const message = buildSlackMessage(notification)

      await postSlackMessage(creds.botToken, creds.channelId, message)
      result.slack = { sent: true }

      console.log(
        `[notify] Slack alert sent: "${notification.headline}" for workspace ${notification.workspaceId}`
      )
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown Slack error'
    result.slack = { sent: false, error: msg }
    console.warn(`[notify] Slack notification failed: ${msg}`)
  }

  // --- Email (only for critical/urgent) ---
  if (notification.severity === 'critical' || notification.severity === 'urgent') {
    try {
      if (await isProviderConnected(notification.workspaceId, 'gmail')) {
        const founderEmail = await getFounderEmail(notification.workspaceId)

        if (founderEmail) {
          await sendEmail(notification.workspaceId, {
            to: founderEmail,
            subject: buildEmailSubject(notification),
            body: buildEmailBody(notification),
          })
          result.email = { sent: true }

          console.log(
            `[notify] Email alert sent to ${founderEmail}: "${notification.headline}"`
          )
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown email error'
      result.email = { sent: false, error: msg }
      console.warn(`[notify] Email notification failed: ${msg}`)
    }
  }

  return result
}
