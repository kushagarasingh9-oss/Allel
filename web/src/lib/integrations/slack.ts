import { getIntegrationMetadata, getIntegrationToken } from './provider-tokens'

type SlackMetadata = {
  channel_id?: string
}

export type SlackCredentials = {
  botToken: string
  channelId: string
}

type SlackApiResponse<T = Record<string, unknown>> = {
  ok: boolean
  error?: string
} & T

type SlackMessage = {
  ts: string
  text: string
  user?: string
  thread_ts?: string
  reply_count?: number
}

type SlackChannel = {
  id: string
  name: string
  is_channel: boolean
  is_private: boolean
  is_archived: boolean
  topic?: { value: string }
  purpose?: { value: string }
  num_members?: number
}

// ============================================================
//  Core Credentials
// ============================================================

export async function getSlackCredentials(workspaceId: string): Promise<SlackCredentials> {
  let botToken = ''
  let metadata: SlackMetadata = {}

  try {
    const [token, meta] = await Promise.all([
      getIntegrationToken(workspaceId, 'slack'),
      getIntegrationMetadata<SlackMetadata>(workspaceId, 'slack'),
    ])
    botToken = token
    metadata = meta
  } catch {
    botToken = `direct_token_slack_${workspaceId}`
  }

  let channelId =
    typeof metadata.channel_id === 'string' && metadata.channel_id.length > 0
      ? metadata.channel_id
      : ''

  if (!channelId && botToken && !botToken.startsWith('direct_token_')) {
    try {
      const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=5', {
        headers: { Authorization: `Bearer ${botToken}` },
      })
      if (response.ok) {
        const payload = (await response.json()) as { ok?: boolean; channels?: Array<{ id: string }> }
        if (payload.ok && payload.channels && payload.channels.length > 0) {
          channelId = payload.channels[0].id
        }
      }
    } catch {
      // Fallback
    }
  }

  return { botToken, channelId: channelId || 'general' }
}

export async function validateSlackBotToken(botToken: string) {
  if (!botToken || botToken.trim().length < 5) return false
  if (
    botToken.startsWith('xoxb-') ||
    botToken.startsWith('xoxp-') ||
    botToken.startsWith('xoxe-') ||
    botToken.startsWith('xapp-') ||
    botToken.startsWith('direct_token_')
  ) {
    return true
  }
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${botToken}` },
    })
    if (!response.ok) return true
    const payload = (await response.json()) as { ok?: boolean }
    return Boolean(payload.ok)
  } catch {
    return true
  }
}

// ============================================================
//  Internal helper: Slack API call
// ============================================================

async function slackApiCall<T = Record<string, unknown>>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<SlackApiResponse<T>> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as SlackApiResponse<T>
  if (!payload.ok) {
    throw new Error(payload.error ?? `Slack ${method} failed`)
  }

  return payload
}

async function slackApiGet<T = Record<string, unknown>>(
  botToken: string,
  method: string,
  params?: Record<string, string>
): Promise<SlackApiResponse<T>> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const response = await fetch(`https://slack.com/api/${method}${qs}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  })

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as SlackApiResponse<T>
  if (!payload.ok) {
    throw new Error(payload.error ?? `Slack ${method} failed`)
  }

  return payload
}

// ============================================================
//  Chat: Send / Edit / Delete / Schedule
// ============================================================

/** Send a message to a channel */
export async function postSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
  options?: { threadTs?: string; unfurlLinks?: boolean }
) {
  return slackApiCall<{ ts: string; channel: string }>(botToken, 'chat.postMessage', {
    channel: channelId,
    text,
    mrkdwn: true,
    ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
    ...(options?.unfurlLinks === false ? { unfurl_links: false, unfurl_media: false } : {}),
  })
}

/** Edit an existing message */
export async function updateSlackMessage(
  botToken: string,
  channelId: string,
  ts: string,
  newText: string
) {
  return slackApiCall<{ ts: string }>(botToken, 'chat.update', {
    channel: channelId,
    ts,
    text: newText,
    mrkdwn: true,
  })
}

/** Delete a message */
export async function deleteSlackMessage(
  botToken: string,
  channelId: string,
  ts: string
) {
  return slackApiCall(botToken, 'chat.delete', { channel: channelId, ts })
}

/** Schedule a message for the future */
export async function scheduleSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
  postAtUnix: number,
  threadTs?: string
) {
  return slackApiCall<{ scheduled_message_id: string; post_at: number }>(
    botToken,
    'chat.scheduleMessage',
    {
      channel: channelId,
      text,
      post_at: postAtUnix,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    }
  )
}

/** List scheduled messages */
export async function listScheduledMessages(botToken: string, channelId?: string) {
  return slackApiCall<{
    scheduled_messages: Array<{
      id: string
      channel_id: string
      post_at: number
      text: string
    }>
  }>(botToken, 'chat.scheduledMessages.list', {
    ...(channelId ? { channel: channelId } : {}),
  })
}

/** Cancel a scheduled message */
export async function deleteScheduledMessage(
  botToken: string,
  channelId: string,
  scheduledMessageId: string
) {
  return slackApiCall(botToken, 'chat.deleteScheduledMessage', {
    channel: channelId,
    scheduled_message_id: scheduledMessageId,
  })
}

// ============================================================
//  Channels: List / Info / History
// ============================================================

/** List all channels the bot can see */
export async function listSlackChannels(botToken: string) {
  return slackApiGet<{ channels: SlackChannel[] }>(botToken, 'conversations.list', {
    types: 'public_channel,private_channel',
    exclude_archived: 'true',
    limit: '200',
  })
}

/** Get channel info */
export async function getSlackChannelInfo(botToken: string, channelId: string) {
  return slackApiGet<{ channel: SlackChannel }>(botToken, 'conversations.info', {
    channel: channelId,
  })
}

/** Get recent messages from a channel */
export async function getSlackChannelHistory(
  botToken: string,
  channelId: string,
  limit: number = 20
) {
  if (botToken.startsWith('direct_token_')) {
    return {
      ok: true,
      messages: [],
      note: 'Direct test token connected. To read live Slack channel messages, connect your real Slack xoxb- bot token in Settings > Connections.',
    }
  }

  try {
    return await slackApiGet<{ messages: SlackMessage[] }>(botToken, 'conversations.history', {
      channel: channelId,
      limit: String(limit),
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    // Auto-join channel if bot is not in channel yet
    if (errorMsg.includes('not_in_channel')) {
      try {
        await slackApiCall(botToken, 'conversations.join', { channel: channelId })
        return await slackApiGet<{ messages: SlackMessage[] }>(botToken, 'conversations.history', {
          channel: channelId,
          limit: String(limit),
        })
      } catch {
        throw new Error(
          `The Slack bot is not in channel (${channelId}). Open your Slack channel and type "/invite" to add your app.`
        )
      }
    }

    throw new Error(`Slack API error: ${errorMsg}`)
  }
}

/** Get thread replies */
export async function getSlackThreadReplies(
  botToken: string,
  channelId: string,
  threadTs: string
) {
  return slackApiGet<{ messages: SlackMessage[] }>(botToken, 'conversations.replies', {
    channel: channelId,
    ts: threadTs,
  })
}

// ============================================================
//  Search
// ============================================================

/** Search messages across workspace */
export async function searchSlackMessages(
  botToken: string,
  query: string,
  count: number = 20
) {
  return slackApiGet<{
    messages: {
      total: number
      matches: Array<{
        ts: string
        text: string
        channel: { id: string; name: string }
        username: string
        permalink: string
      }>
    }
  }>(botToken, 'search.messages', {
    query,
    count: String(count),
    sort: 'timestamp',
    sort_dir: 'desc',
  })
}

// ============================================================
//  Reactions
// ============================================================

/** Add a reaction to a message */
export async function addSlackReaction(
  botToken: string,
  channelId: string,
  ts: string,
  emoji: string
) {
  return slackApiCall(botToken, 'reactions.add', {
    channel: channelId,
    timestamp: ts,
    name: emoji.replace(/:/g, ''),
  })
}

/** Remove a reaction from a message */
export async function removeSlackReaction(
  botToken: string,
  channelId: string,
  ts: string,
  emoji: string
) {
  return slackApiCall(botToken, 'reactions.remove', {
    channel: channelId,
    timestamp: ts,
    name: emoji.replace(/:/g, ''),
  })
}

// ============================================================
//  Pins
// ============================================================

/** Pin a message */
export async function pinSlackMessage(botToken: string, channelId: string, ts: string) {
  return slackApiCall(botToken, 'pins.add', { channel: channelId, timestamp: ts })
}

/** Unpin a message */
export async function unpinSlackMessage(botToken: string, channelId: string, ts: string) {
  return slackApiCall(botToken, 'pins.remove', { channel: channelId, timestamp: ts })
}

/** List pinned items in a channel */
export async function listSlackPins(botToken: string, channelId: string) {
  return slackApiGet<{
    items: Array<{
      type: string
      message?: { ts: string; text: string }
    }>
  }>(botToken, 'pins.list', { channel: channelId })
}

// ============================================================
//  Bookmarks
// ============================================================

/** Add a bookmark to a channel */
export async function addSlackBookmark(
  botToken: string,
  channelId: string,
  title: string,
  link: string
) {
  return slackApiCall<{ bookmark: { id: string } }>(botToken, 'bookmarks.add', {
    channel_id: channelId,
    title,
    type: 'link',
    link,
  })
}

/** List bookmarks in a channel */
export async function listSlackBookmarks(botToken: string, channelId: string) {
  return slackApiGet<{
    bookmarks: Array<{ id: string; title: string; link: string }>
  }>(botToken, 'bookmarks.list', { channel_id: channelId })
}
