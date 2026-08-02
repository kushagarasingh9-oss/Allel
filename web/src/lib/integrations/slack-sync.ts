import { createServiceClient } from '@/lib/supabase/service'
import { logAgentRun } from '@/lib/agent/run-logger'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { getSlackCredentials, postSlackMessage } from './slack'
import { mergeIntegrationConnectionMetadata } from './connection-guard'

export type SlackWorkspaceSyncResult = {
  delivered: boolean
  briefId: string
  itemCount: number
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export async function syncSlackWorkspace(
  workspaceId: string
): Promise<SlackWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { botToken, channelId } = await getSlackCredentials(workspaceId)

  const brief = await generateWorkspaceBrief(workspaceId)

  const [{ data: workspace, error: workspaceError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from('workspaces').select('name').eq('id', workspaceId).single(),
      supabase
        .from('founder_brief_items')
        .select('headline, detail, risk_level, customer_accounts(name, mrr_cents)')
        .eq('workspace_id', workspaceId)
        .eq('founder_brief_id', brief.briefId)
        .order('sort_order', { ascending: true })
        .limit(5),
    ])

  if (workspaceError) throw workspaceError
  if (itemsError) throw itemsError

  const lines = [
    `*${workspace.name}*`,
    `*${brief.headline}*`,
    brief.summary,
  ]

  for (const item of items ?? []) {
    const account = Array.isArray(item.customer_accounts) ? item.customer_accounts[0] : item.customer_accounts
    const accountLabel = account?.name
      ? `${account.name}${typeof account.mrr_cents === 'number' ? ` (${formatCurrency(account.mrr_cents)})` : ''}`
      : 'Account'

    lines.push(
      `• *${accountLabel}* — ${item.headline}`,
      `  ${item.detail}`,
      `  Risk: ${item.risk_level}`
    )
  }

  await postSlackMessage(botToken, channelId, lines.join('\n'))

  const syncedAt = new Date().toISOString()
  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'slack',
      status: 'connected',
      last_synced_at: syncedAt,
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'slack', {
        channel_id: channelId,
        coverage: `Daily brief delivered to Slack with ${brief.itemCount} item${brief.itemCount === 1 ? '' : 's'}`,
        last_brief_id: brief.briefId,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `Slack brief delivery completed: ${brief.itemCount} brief item(s) delivered to Slack.`,
    metadata: {
      provider: 'slack',
      briefId: brief.briefId,
      itemCount: brief.itemCount,
    },
  })

  return {
    delivered: true,
    briefId: brief.briefId,
    itemCount: brief.itemCount,
  }
}
