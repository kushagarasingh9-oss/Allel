/**
 * Brief Email Delivery
 *
 * Sends the daily founder brief as an HTML email via Gmail.
 * Falls back gracefully if Gmail isn't connected.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/integrations/gmail'

type BriefItemRow = {
  headline: string
  detail: string | null
  next_step: string | null
  risk_level: string
  evidence: string[] | null
  customer_account_id: string | null
  customer_accounts: { name: string; mrr_cents: number } | null
}

type BriefDeliveryInput = {
  workspaceId: string
  briefId: string
  headline: string
  summary: string
  itemCount: number
}

type BriefDeliveryResult = {
  delivered: boolean
  method: 'gmail' | 'skipped'
  recipientEmail?: string
  error?: string
}

function riskEmoji(level: string): string {
  switch (level) {
    case 'high':
      return '🔴'
    case 'medium':
      return '🟡'
    default:
      return '🟢'
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function buildBriefEmailHtml(input: {
  headline: string
  summary: string
  items: BriefItemRow[]
  dashboardUrl: string
  date: string
}): string {
  const { headline, summary, items, dashboardUrl, date } = input

  const itemRows = items
    .map((item) => {
      const accountName = item.customer_accounts?.name ?? 'Unknown'
      const mrr = item.customer_accounts?.mrr_cents
        ? ` · ${formatCurrency(item.customer_accounts.mrr_cents)}/mo`
        : ''
      const emoji = riskEmoji(item.risk_level)
      const evidenceList =
        item.evidence && item.evidence.length > 0
          ? item.evidence
              .slice(0, 3)
              .map((e) => `<li style="color:#9ca3af;font-size:13px;margin:2px 0;">${e}</li>`)
              .join('')
          : ''

      return `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #1f2937;">
          <div style="font-size:15px;font-weight:600;color:#f3f4f6;">
            ${emoji} ${accountName}${mrr}
          </div>
          <div style="font-size:14px;color:#d1d5db;margin-top:4px;">
            ${item.headline}
          </div>
          ${evidenceList ? `<ul style="margin:6px 0 0 16px;padding:0;">${evidenceList}</ul>` : ''}
          ${item.next_step ? `<div style="font-size:13px;color:#60a5fa;margin-top:6px;">→ ${item.next_step}</div>` : ''}
        </td>
      </tr>`
    })
    .join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#030712;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          
          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;">
              <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                Allel · Daily Brief · ${date}
              </div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#f9fafb;">
                ${headline}
              </h1>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#9ca3af;">
                ${summary}
              </p>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${itemRows}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding-top:32px;padding-bottom:16px;">
              <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                Open Dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:32px;border-top:1px solid #1f2937;">
              <p style="margin:0;font-size:12px;color:#4b5563;">
                Sent by Allel · Your AI retention agent
              </p>
              <p style="margin:8px 0 0 0;font-size:11px;color:#6b7280;">
                <a href="${dashboardUrl}/settings" style="color:#6b7280;text-decoration:underline;">Manage notification preferences</a>
                · <a href="${dashboardUrl}/settings" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildBriefEmailPlainText(input: {
  headline: string
  summary: string
  items: BriefItemRow[]
  dashboardUrl: string
  date: string
}): string {
  const { headline, summary, items, dashboardUrl, date } = input

  const lines = [
    `ALLEL · DAILY BRIEF · ${date}`,
    '',
    headline,
    '',
    summary,
    '',
    '---',
    '',
  ]

  for (const item of items) {
    const accountName = item.customer_accounts?.name ?? 'Unknown'
    const mrr = item.customer_accounts?.mrr_cents
      ? ` · ${formatCurrency(item.customer_accounts.mrr_cents)}/mo`
      : ''
    lines.push(`${riskEmoji(item.risk_level)} ${accountName}${mrr}`)
    lines.push(`  ${item.headline}`)
    if (item.evidence) {
      for (const e of item.evidence.slice(0, 3)) {
        lines.push(`  • ${e}`)
      }
    }
    if (item.next_step) {
      lines.push(`  → ${item.next_step}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`Open Dashboard: ${dashboardUrl}`)

  return lines.join('\n')
}

/**
 * Get the founder's email for a workspace.
 * Looks up the workspace owner's auth email.
 */
async function getFounderEmail(workspaceId: string): Promise<string | null> {
  const supabase = createServiceClient()

  // Get workspace owner user ID
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('owner_user_id')
    .eq('id', workspaceId)
    .single()

  if (wsError || !workspace?.owner_user_id) return null

  // Get user email from auth.users via admin API
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.admin.getUserById(workspace.owner_user_id)

  if (userError || !user?.email) return null

  return user.email
}

/**
 * Deliver the daily brief as an email to the workspace founder.
 *
 * Requires Gmail to be connected for the workspace.
 * Falls back gracefully if Gmail isn't connected.
 */
export async function deliverBriefEmail(
  input: BriefDeliveryInput
): Promise<BriefDeliveryResult> {
  const supabase = createServiceClient()

  // 1. Check if Gmail is connected
  const { data: gmailConnection } = await supabase
    .from('integration_connections')
    .select('status')
    .eq('workspace_id', input.workspaceId)
    .eq('provider', 'gmail')
    .maybeSingle()

  if (!gmailConnection || gmailConnection.status !== 'connected') {
    return {
      delivered: false,
      method: 'skipped',
      error: 'Gmail is not connected — brief email delivery skipped',
    }
  }

  // 2. Get the founder's email
  const founderEmail = await getFounderEmail(input.workspaceId)
  if (!founderEmail) {
    return {
      delivered: false,
      method: 'skipped',
      error: 'Could not determine founder email — brief email delivery skipped',
    }
  }

  // 3. Fetch brief items with account details
  const { data: items, error: itemsError } = await supabase
    .from('founder_brief_items')
    .select(
      'headline, detail, next_step, risk_level, evidence, customer_account_id, customer_accounts(name, mrr_cents)'
    )
    .eq('founder_brief_id', input.briefId)
    .order('sort_order', { ascending: true })
    .limit(10)

  if (itemsError) {
    return {
      delivered: false,
      method: 'skipped',
      error: `Failed to fetch brief items: ${itemsError.message}`,
    }
  }

  const typedItems = (items ?? []) as unknown as BriefItemRow[]

  // 4. Build the email
  const today = new Date().toISOString().slice(0, 10)
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    : 'http://localhost:3000/dashboard'

  const htmlBody = buildBriefEmailHtml({
    headline: input.headline,
    summary: input.summary,
    items: typedItems,
    dashboardUrl,
    date: today,
  })

  const plainBody = buildBriefEmailPlainText({
    headline: input.headline,
    summary: input.summary,
    items: typedItems,
    dashboardUrl,
    date: today,
  })

  // 5. Send via Gmail
  try {
    await sendEmail(input.workspaceId, {
      to: founderEmail,
      subject: `☕ ${input.headline}`,
      body: plainBody,
      htmlBody: htmlBody,
    })

    console.log(
      `[brief-email] Delivered daily brief to ${founderEmail} for workspace ${input.workspaceId}`
    )

    return {
      delivered: true,
      method: 'gmail',
      recipientEmail: founderEmail,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Gmail send error'
    console.error(`[brief-email] Failed to deliver brief email:`, error)

    return {
      delivered: false,
      method: 'skipped',
      error: `Gmail send failed: ${errorMessage}`,
    }
  }
}
