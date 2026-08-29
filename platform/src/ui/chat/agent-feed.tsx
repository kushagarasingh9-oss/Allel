"use client"

/**
 * AgentFeed — Renders real agent messages using the existing
 * timeline nodes and generative card components.
 *
 * Maps AI SDK v6 message parts → UI components:
 *   - TextUIPart       → AgentSpeechBlock
 *   - ReasoningUIPart  → MonologueBlock
 *   - ToolUIPart/DynamicToolUIPart (input-streaming/input-available) → TimelineNode loading
 *   - ToolUIPart/DynamicToolUIPart (output-available) → TimelineNode completed + result card
 *   - StepStartUIPart  → ignored (batching boundary)
 */

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/foundation/utils"
import { useChatContext } from "./chat-provider"
import { createClient } from "@/foundation/database/client"
import type { UIMessage } from "ai"
import type { Session } from "@supabase/supabase-js"
import {
  TimelineNode,
  AgentSpeechBlock,
  MonologueBlock,
  InlineQueryBlock,
  MiniResultCard,
  AgentReasoningBatch,
  AgentApprovalBlock,
} from "./timeline-nodes"
import { USER_EMOJI_PALETTE } from "@/foundation/utils/emoji-palette"
import { Search, Loader2, Zap, Database, Mail, CreditCard, MessageSquare, Calendar, User, Globe, AlertCircle, ChevronRight, Check } from "lucide-react"
import {
  SiIntercom,
  SiLinear,
  SiPosthog,
  SiStripe,
  SiSentry,
  SiHubspot,
  SiGmail
} from '@icons-pack/react-simple-icons'

function WebFavicon({ url, fallbackFavicon }: { url?: string; fallbackFavicon?: string }) {
  const [hasError, setHasError] = React.useState(false)

  const domain = React.useMemo(() => {
    if (!url) return ''
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  }, [url])

  const faviconSrc = fallbackFavicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null)

  if (!faviconSrc || hasError) {
    return <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
  }

  return (
    <img
      src={faviconSrc}
      alt={domain || 'Web'}
      className="w-3.5 h-3.5 rounded-sm object-contain shrink-0 bg-neutral-800/80"
      onError={() => setHasError(true)}
      loading="lazy"
    />
  )
}

// ─── Tool → Icon mapping (Only official SVG logos for connected integrations) ────────────────────────────────────────────
const TOOL_ICONS: Record<string, React.ReactNode> = {
  getExistingDrafts: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  getGmailThreadsForAccount: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  getMyInbox: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  getGmailThreadDetailTool: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  sendGmailReply: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  composeNewEmail: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  generateFollowUpDraft: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  deliverSlackBriefTool: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  buildDailyBriefFromLiveState: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  createRescueDiscountTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  searchLinearIssuesTool: <img src="/logos/linear.svg" alt="Linear" className="w-4 h-4 object-contain shrink-0" />,
  listSentryIssuesTool: <img src="/logos/sentry-light.svg" alt="Sentry" className="w-4 h-4 object-contain shrink-0" />,
  searchHubSpotContactsTool: <img src="/logos/hubspot.svg" alt="HubSpot" className="w-4 h-4 object-contain shrink-0" />,
  searchNotionTool: <img src="/logos/notion.svg" alt="Notion" className="w-4 h-4 object-contain shrink-0" />,
  listAirtableBasesTool: <img src="/logos/airtable.svg" alt="Airtable" className="w-4 h-4 object-contain shrink-0" />,
  searchIntercomConvosTool: <img src="/logos/intercom.svg" alt="Intercom" className="w-4 h-4 object-contain shrink-0" />,
  listCalendarEventsTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  getCalendarEventTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  getCalendarEventDetailTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  createCalendarEventTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  updateCalendarEventTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  deleteCalendarEventTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  searchCalendarEventsTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  quickAddCalendarEventTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  checkCalendarFreeBusy: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  queryFreeBusyTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  listCalendarsTool: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,
  getSlackHistory: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  sendSlackMessage: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  searchSlack: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  replyInSlackThread: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  getSlackChannels: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  syncWorkspaceTool: <Zap className="w-4 h-4 text-neutral-500" />,
  triggerStripeSync: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  triggerGmailSync: <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />,
  triggerSlackSync: <img src="/logos/slack.svg" alt="Slack" className="w-4 h-4 object-contain shrink-0" />,
  triggerPosthogSync: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  triggerHubspotSync: <img src="/logos/hubspot.svg" alt="HubSpot" className="w-4 h-4 object-contain shrink-0" />,
  triggerLinearSync: <img src="/logos/linear.svg" alt="Linear" className="w-4 h-4 object-contain shrink-0" />,
  triggerIntercomSync: <img src="/logos/intercom.svg" alt="Intercom" className="w-4 h-4 object-contain shrink-0" />,
  triggerSentrySync: <img src="/logos/sentry-light.svg" alt="Sentry" className="w-4 h-4 object-contain shrink-0" />,
  triggerAirtableSync: <img src="/logos/airtable.svg" alt="Airtable" className="w-4 h-4 object-contain shrink-0" />,
  triggerNotionSync: <img src="/logos/notion.svg" alt="Notion" className="w-4 h-4 object-contain shrink-0" />,
  triggerCalendarSync: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-4 h-4 object-contain shrink-0" />,

  // Account tools — use the Stripe logo
  getAllAccounts: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  getAccountDetails: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  getRecentSignals: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  resolveAccountByContact: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  getChurnScoreHistory: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  getAccountTimeline: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  getAccountMemory: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  getStripeAccountState: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  searchStripeCustomersTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripeInvoicesTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripeSubscriptionsTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripePaymentIntentsTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripeChargesTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripeRefundsTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripeDisputesTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  listStripeCouponsTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  createStripeCouponTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,
  createStripePromotionCodeTool: <img src="/logos/stripe.svg" alt="Stripe" className="w-4 h-4 object-contain shrink-0" />,

  // PostHog analytics tools — use the PostHog logo
  getPostHogEvents: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  getPostHogEventDefinitions: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  listPostHogInsights: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  getPostHogAccountUsage: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  listPostHogCohorts: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  listPostHogFeatureFlags: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  togglePostHogFeatureFlag: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  searchPostHogPersons: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,
  createPostHogAnnotation: <img src="/logos/posthog.svg" alt="PostHog" className="w-4 h-4 object-contain shrink-0" />,

  // Recovery pipeline tools
  getRecoveryCases: <Search className="w-4 h-4 text-neutral-400" />,
  getRecoveryCaseDetail: <Search className="w-4 h-4 text-neutral-400" />,

  addTimelineEvent: <Database className="w-4 h-4 text-neutral-500" />,
  createSignal: <Zap className="w-4 h-4 text-neutral-500" />,
  updateAccountRisk: <AlertCircle className="w-4 h-4 text-neutral-500" />,
  inspectIntegrationConnectionsTool: <Check className="w-3.5 h-3.5 text-neutral-400 shrink-0" />,
  requestMoreTools: <Search className="w-4 h-4 text-neutral-400" />,
  webSearchTool: <Search className="w-4 h-4 text-neutral-400" />,
  webExtractTool: <Search className="w-4 h-4 text-neutral-400" />,
  webCrawlTool: <Search className="w-4 h-4 text-neutral-400" />,
  webMapTool: <Search className="w-4 h-4 text-neutral-400" />,
}

// ─── Human-readable names for tools ──────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  requestMoreTools: "Expanding tool capabilities",
  webSearchTool: "Searching web intelligence",
  webExtractTool: "Extracting webpage content",
  webCrawlTool: "Crawling website domain",
  webMapTool: "Mapping site structure",
  inspectIntegrationConnectionsTool: "Verifying active connections",
  getAccountDetails: "Reading account profile",
  getAllAccounts: "Scanning customer accounts",
  getRecentSignals: "Analyzing workspace signals & activity",
  getExistingDrafts: "Checking draft responses",
  getStripeAccountState: "Querying Stripe billing state",
  searchStripeCustomersTool: "Searching Stripe customers",
  listStripeInvoicesTool: "Listing Stripe invoices",
  listStripeSubscriptionsTool: "Checking Stripe subscriptions",
  listStripePaymentIntentsTool: "Checking Stripe payments",
  listStripeChargesTool: "Reading Stripe charges",
  listStripeRefundsTool: "Checking Stripe refunds",
  listStripeDisputesTool: "Monitoring Stripe disputes",
  listStripeCouponsTool: "Checking discount coupons",
  createStripeCouponTool: "Creating discount coupon",
  createStripePromotionCodeTool: "Generating promotion code",
  getPostHogEvents: "Querying PostHog events",
  getPostHogEventDefinitions: "Reading PostHog event catalog",
  listPostHogInsights: "Reading PostHog analytics & charts",
  getPostHogAccountUsage: "Analyzing product engagement",
  listPostHogCohorts: "Reading user cohorts",
  listPostHogFeatureFlags: "Checking feature flags",
  togglePostHogFeatureFlag: "Updating feature flag",
  searchPostHogPersons: "Searching PostHog users",
  createPostHogAnnotation: "Creating chart annotation",
  getRecoveryCases: "Scanning recovery cases",
  getRecoveryCaseDetail: "Analyzing recovery incident detail",
  getGmailThreadsForAccount: "Searching Gmail communications",
  getGmailThreadDetailTool: "Reading email thread",
  sendGmailReply: "Sending email reply",
  composeNewEmail: "Composing email",
  getMyInbox: "Reading your inbox",
  generateFollowUpDraft: "Drafting follow-up response",
  createSignal: "Recording workspace signal",
  updateAccountRisk: "Updating risk assessment",
  addTimelineEvent: "Logging timeline event",
  createBriefItem: "Adding brief item",
  updateBriefSummary: "Updating brief summary",
  resolveAccountByContact: "Resolving account from contact",
  syncStripeWorkspaceTool: "Syncing Stripe billing data",
  syncPostHogWorkspaceTool: "Syncing PostHog analytics",
  syncGmailWorkspaceTool: "Syncing Gmail messages",
  syncIntercomWorkspaceTool: "Syncing Intercom support",
  syncHubSpotWorkspaceTool: "Syncing HubSpot CRM",
  syncSentryWorkspaceTool: "Syncing Sentry errors",
  syncLinearWorkspaceTool: "Syncing Linear issues",
  deliverSlackBriefTool: "Delivering brief to Slack",
  buildDailyBriefFromLiveState: "Building executive brief",
  createRescueDiscountTool: "Creating rescue discount",
  listCalendarEventsTool: "Checking Google Calendar",
  getCalendarEventTool: "Fetching Calendar event",
  getCalendarEventDetailTool: "Reading Calendar event",
  createCalendarEventTool: "Creating Calendar event",
  updateCalendarEventTool: "Updating Calendar event",
  deleteCalendarEventTool: "Deleting Calendar event",
  searchCalendarEventsTool: "Searching Calendar events",
  quickAddCalendarEventTool: "Scheduling Calendar event",
  checkCalendarFreeBusy: "Checking Calendar availability",
  queryFreeBusyTool: "Checking Calendar availability",
  listCalendarsTool: "Listing Google Calendars",
  getSlackHistory: "Scanning Slack channels",
  sendSlackMessage: "Sending Slack message",
  searchSlack: "Searching Slack messages",
  replyInSlackThread: "Replying in Slack thread",
  getSlackChannels: "Listing Slack channels",
}

const PROVIDER_LOGOS: Record<string, string> = {
  gmail: '/logos/gmail.svg',
  slack: '/logos/slack.svg',
  stripe: '/logos/stripe.svg',
  posthog: '/logos/posthog.svg',
  linear: '/logos/linear.svg',
  sentry: '/logos/sentry-light.svg',
  hubspot: '/logos/hubspot.svg',
  notion: '/logos/notion.svg',
  google_calendar: '/logos/google-calendar.svg',
  airtable: '/logos/airtable.svg',
}

function getProviderFromTool(toolName: string, errorMsg: string): { name: string; slug: string; logoUrl?: string } | null {
  const lowName = toolName.toLowerCase()
  const lowMsg = errorMsg.toLowerCase()
  let slug: string | null = null
  let name = ''

  if (lowName.includes('calendar') || lowMsg.includes('calendar')) { slug = 'google_calendar'; name = 'Google Calendar' }
  else if (lowName.includes('gmail') || toolName === 'getMyInbox' || lowMsg.includes('gmail')) { slug = 'gmail'; name = 'Gmail' }
  else if (lowName.includes('slack') || lowMsg.includes('slack')) { slug = 'slack'; name = 'Slack' }
  else if (lowName.includes('stripe') || lowMsg.includes('stripe')) { slug = 'stripe'; name = 'Stripe' }
  else if (lowName.includes('posthog') || lowMsg.includes('posthog')) { slug = 'posthog'; name = 'PostHog' }
  else if (lowName.includes('linear') || lowMsg.includes('linear')) { slug = 'linear'; name = 'Linear' }
  else if (lowName.includes('sentry') || lowMsg.includes('sentry')) { slug = 'sentry'; name = 'Sentry' }
  else if (lowName.includes('hubspot') || lowMsg.includes('hubspot')) { slug = 'hubspot'; name = 'HubSpot' }
  else if (lowName.includes('notion') || lowMsg.includes('notion')) { slug = 'notion'; name = 'Notion' }
  else if (lowName.includes('calendar') || lowMsg.includes('calendar')) { slug = 'google_calendar'; name = 'Google Calendar' }

  if (!slug) return null
  return { name, slug, logoUrl: PROVIDER_LOGOS[slug] }
}

export function UnconnectedIntegrationBadge({
  toolName,
  errorText,
}: {
  toolName: string
  errorText: string
}) {
  const provider = getProviderFromTool(toolName, errorText)
  const cleanMsg = formatCleanErrorMessage(errorText, toolName)

  return (
    <div className="flex items-center gap-2.5 text-[12px] text-neutral-400 font-normal py-0.5 mt-0.5">
      <span>{cleanMsg}</span>

      {provider && (
        <a
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/70 hover:border-neutral-500 rounded-full transition-all duration-150 shrink-0"
        >
          {provider.logoUrl && (
            <img src={provider.logoUrl} alt={provider.name} className="w-3.5 h-3.5 object-contain shrink-0" />
          )}
          <span>Connect</span>
          <ChevronRight className="w-3 h-3 text-neutral-400" />
        </a>
      )}
    </div>
  )
}

/** Human-readable summary of what the tool is doing based on its input */
function ToolThinkingSummary({ toolName, input }: { toolName: string; input: unknown }) {
  const data = (input && typeof input === 'object') ? input as Record<string, unknown> : {}

  let summary = ''

  // Calendar tools
  if (toolName === 'listCalendarEventsTool' || toolName === 'searchCalendarEventsTool') {
    const q = data.query ?? data.q
    const timeMin = data.timeMin as string | undefined
    if (q) {
      summary = `Searching for "${q}" events`
    } else if (timeMin) {
      try {
        const d = new Date(timeMin)
        summary = `Looking up events from ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`
      } catch { summary = 'Fetching calendar events' }
    } else {
      summary = 'Fetching upcoming events'
    }
  } else if (toolName === 'createCalendarEventTool') {
    const title = data.summary as string ?? ''
    const start = data.startDateTime as string ?? ''
    if (title && start) {
      try {
        const d = new Date(start)
        summary = `Creating "${title}" on ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
      } catch { summary = `Creating "${title}"` }
    } else {
      summary = title ? `Creating "${title}"` : 'Creating calendar event'
    }
  } else if (toolName === 'deleteCalendarEventTool') {
    const eid = data.eventId ? String(data.eventId).slice(0, 12) + '…' : ''
    summary = eid ? `Removing event ${eid}` : 'Removing calendar event'
  } else if (toolName === 'updateCalendarEventTool') {
    summary = 'Updating calendar event'
  } else if (toolName === 'checkCalendarFreeBusy' || toolName === 'queryFreeBusyTool') {
    summary = 'Checking availability'
  } else if (toolName === 'listCalendarsTool') {
    summary = 'Listing available calendars'
  }
  // Gmail tools
  else if (toolName === 'getMyInbox') {
    summary = 'Scanning inbox for recent messages'
  } else if (toolName === 'sendGmailReply' || toolName === 'composeNewEmail') {
    const to = (data.to ?? data.recipientEmail ?? '') as string
    summary = to ? `Composing email to ${to}` : 'Composing email'
  } else if (toolName === 'getGmailThreadsForAccount') {
    summary = 'Pulling email threads for account'
  }
  // Slack tools
  else if (toolName === 'getSlackHistory') {
    summary = 'Reading Slack channel history'
  } else if (toolName === 'sendSlackMessage') {
    summary = 'Sending Slack message'
  } else if (toolName === 'searchSlack') {
    const q = data.query as string
    summary = q ? `Searching Slack for "${q}"` : 'Searching Slack'
  } else if (toolName === 'replyInSlackThread') {
    summary = 'Replying in Slack thread'
  } else if (toolName === 'getSlackChannels') {
    summary = 'Listing Slack channels'
  }
  // Notion tools
  else if (toolName.includes('Notion') || toolName.includes('notion')) {
    const q = data.query as string
    summary = q ? `Searching Notion for "${q}"` : 'Querying Notion'
  }
  // Stripe tools
  else if (toolName.includes('Stripe') || toolName.includes('stripe')) {
    summary = 'Pulling Stripe data'
  }
  // PostHog tools
  else if (toolName.includes('PostHog') || toolName.includes('posthog')) {
    summary = 'Checking PostHog analytics'
  }
  // Intercom tools
  else if (toolName.includes('Intercom') || toolName.includes('intercom')) {
    summary = 'Checking Intercom conversations'
  }
  // Web tools
  else if (toolName === 'webSearchTool') {
    const q = data.query as string
    summary = q ? `Searching: "${q}"` : 'Searching the web'
  } else if (toolName === 'webExtractTool') {
    const url = data.url as string
    summary = url ? `Reading ${url.slice(0, 40)}…` : 'Extracting webpage'
  }
  // Account & Integration tools
  else if (toolName === 'getAccountDetails') {
    summary = 'Pulling account details'
  } else if (toolName === 'getAllAccounts') {
    summary = 'Scanning Stripe customer accounts'
  } else if (toolName === 'getStripeAccountState') {
    summary = 'Checking Stripe subscription state'
  } else if (toolName === 'inspectIntegrationConnectionsTool') {
    summary = 'Verifying active integration status'
  } else if (toolName === 'getAccountTimeline') {
    summary = 'Checking account history'
  } else if (toolName === 'listSentryIssuesTool') {
    summary = 'Scanning active error signals'
  } else if (toolName === 'searchLinearIssuesTool') {
    summary = 'Searching Linear issue tracker'
  } else if (toolName === 'listPostHogInsights' || toolName === 'getPostHogAccountUsage') {
    summary = 'Analyzing product engagement analytics'
  } else if (toolName === 'listIntercomConvos') {
    summary = 'Scanning Intercom support conversations'
  }
  // Generic — use the TOOL_LABELS display name
  else {
    summary = TOOL_LABELS[toolName] ? `${TOOL_LABELS[toolName]}…` : 'Processing…'
  }

  return (
    <div className="text-[11px] text-neutral-500 italic py-0.5">
      {summary}
    </div>
  )
}

function AccountsListResult({ accounts }: { accounts: Array<Record<string, unknown>> }) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const displayAccounts = isExpanded ? accounts : accounts.slice(0, 5)

  if (accounts.length === 0) {
    return (
      <div className="text-[12px] text-neutral-500 flex items-center gap-1.5 mb-2">
        <img src="/logos/stripe.svg" alt="Stripe" className="w-3.5 h-3.5 object-contain opacity-60" /> No active customer accounts ($0 MRR)
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {displayAccounts.map((acc, i) => (
        <MiniResultCard
          key={i}
          icon={<img src="/logos/stripe.svg" alt="Stripe" className="w-3.5 h-3.5 object-contain" />}
          title={<span className="text-white">{String(acc.name)}</span>}
          subtitle={`${acc.mrr ?? ''} · ${String(acc.riskLevel ?? 'unknown')} risk`}
        />
      ))}
      {accounts.length > 5 && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[12px] text-neutral-400 hover:text-white pl-7 py-1 text-left flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>{isExpanded ? 'Show fewer accounts' : `+ ${accounts.length - 5} more accounts`}</span>
          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      )}
    </div>
  )
}

function ToolResultSummary({ toolName, result }: { toolName: string; result: unknown }) {
  if (!result || typeof result !== 'object') return null
  const data = result as Record<string, unknown>

  // Error state — only show "Connect" badge for actual connection/auth errors
  if (data.error) {
    const errorStr = String(data.error).toLowerCase()
    const isConnectionError =
      errorStr.includes('not connected') ||
      errorStr.includes('not configured') ||
      errorStr.includes('reconnect') ||
      errorStr.includes('credentials are missing') ||
      errorStr.includes('refresh token') ||
      errorStr.includes('oauth') ||
      errorStr.includes('invalid_grant') ||
      (errorStr.includes('unauthorized') && !errorStr.includes('no active')) ||
      data.dataSource === 'connection_guard'

    if (isConnectionError) {
      return (
        <UnconnectedIntegrationBadge toolName={toolName} errorText={String(data.error)} />
      )
    }

    // Generic error (Bad Request, etc.) — show as plain text, no misleading Connect button
    return (
      <div className="text-[12px] text-red-400/80 font-normal py-0.5 mt-0.5">
        {formatCleanErrorMessage(String(data.error), toolName)}
      </div>
    )
  }

  // Account details
  if (toolName === 'getAccountDetails' && data.name) {
    return (
      <MiniResultCard
        icon={<Database className="w-4 h-4 text-neutral-400" />}
        title={<span className="text-white">{String(data.name)}</span>}
        subtitle={`${data.mrr ?? ''} · Risk: ${data.riskLevel ?? 'unknown'} · Usage: ${data.usageDelta ?? '?'}`}
      />
    )
  }

  // All accounts
  if (toolName === 'getAllAccounts' && Array.isArray(data.accounts)) {
    return <AccountsListResult accounts={data.accounts as Array<Record<string, unknown>>} />
  }

  // Gmail threads (both account-level and founder's own inbox)
  if ((toolName === 'getGmailThreadsForAccount' || toolName === 'getMyInbox') && Array.isArray(data.threads)) {
    const threads = data.threads as Array<Record<string, unknown>>
    if (threads.length === 0) {
      return (
        <div className="text-[12px] text-neutral-500 flex items-center gap-1.5 mb-2">
          <img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain opacity-60" /> No threads found
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1">
        {threads.map((thread, i) => (
          <MiniResultCard
            key={i}
            index={i}
            icon={<img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain" />}
            title={<span className="text-white">{String(thread.subject ?? 'No subject')}</span>}
            subtitle={`From: ${String(thread.from ?? 'unknown')}${thread.needsReply ? ' · Needs reply' : ''}`}
          />
        ))}
      </div>
    )
  }

  // Stripe account state
  if (toolName === 'getStripeAccountState' && Array.isArray(data.subscriptions)) {
    const subs = data.subscriptions as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1">
        {subs.map((sub, i) => (
          <MiniResultCard
            key={i}
            icon={<img src="/logos/stripe.svg" alt="Stripe" className="w-3.5 h-3.5 object-contain" />}
            title={<span className="text-white">{String(sub.plan ?? 'Subscription')}</span>}
            subtitle={`Status: ${String(sub.status)} ${sub.cancelAtPeriodEnd ? '· Cancelling' : ''}`}
          />
        ))}
      </div>
    )
  }

  // Draft generated
  if (toolName === 'generateFollowUpDraft' && data.success) {
    return (
      <MiniResultCard
        icon={<img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain" />}
        title={<span className="text-white">Draft created: {String(data.subject ?? '')}</span>}
        subtitle={`For ${String(data.accountName ?? 'account')} · ${String(data.draftType ?? '')}`}
      />
    )
  }

  // Risk updated
  if (toolName === 'updateAccountRisk' && data.success) {
    return (
      <MiniResultCard
        icon={<Zap className="w-4 h-4 text-amber-400" />}
        title={<span className="text-white">{String(data.accountName ?? 'Account')} risk updated</span>}
        subtitle={`${String(data.previousRisk ?? '?')} → ${String(data.newRisk ?? '?')}`}
      />
    )
  }

  // Sync results — keep timeline clean, don't show technical data counters
  if (data.success && (data.syncedAccounts !== undefined || data.delivered !== undefined)) {
    return null
  }

  // Web Search results
  if (toolName === 'webSearchTool' && data.results && Array.isArray(data.results)) {
    const results = data.results as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1 mb-2">
        {results.slice(0, 3).map((item, i) => {
          const url = String(item.url || '')
          const domain = url ? (function () {
            try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
          })() : ''
          return (
            <a
              key={i}
              href={url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <MiniResultCard
                icon={<WebFavicon url={url} fallbackFavicon={item.favicon as string | undefined} />}
                title={
                  <span className="text-neutral-200 group-hover:text-white transition-colors">
                    {String(item.title ?? 'Web result')}
                  </span>
                }
                subtitle={
                  <span className="text-neutral-500 group-hover:text-neutral-400 transition-colors flex items-center gap-1.5">
                    {domain && <span className="font-mono text-[10.5px] text-neutral-400 shrink-0">{domain}</span>}
                    <span className="truncate">{String(item.content || item.snippet || url)}</span>
                  </span>
                }
              />
            </a>
          )
        })}
      </div>
    )
  }

  // Gmail Send / Reply result
  if ((toolName === 'sendGmailReply' || toolName === 'composeNewEmail') && (data.success || data.messageId || data.threadId || data.status === 'sent')) {
    const to = String(data.recipientEmail ?? data.to ?? 'Recipient')
    return (
      <div className="flex flex-col gap-1 mb-2">
        <MiniResultCard
          icon={<img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain shrink-0" />}
          title={<span className="text-white">Email sent</span>}
          subtitle={to ? `Delivered to ${to}` : 'Sent via Gmail'}
        />
      </div>
    )
  }

  // Gmail Thread Detail result
  if (toolName === 'getGmailThreadDetailTool' && (data.thread || data.subject)) {
    const thread = (data.thread ?? data) as Record<string, unknown>
    return (
      <div className="flex flex-col gap-1 mb-2">
        <MiniResultCard
          icon={<img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain shrink-0" />}
          title={<span className="text-white">{String(thread.subject ?? 'Email thread details')}</span>}
          subtitle={`From: ${String(thread.from ?? thread.lastSenderEmail ?? 'Sender')}`}
        />
      </div>
    )
  }

  // Calendar Event Create / Delete
  if ((toolName === 'createCalendarEventTool' || toolName === 'quickAddCalendarEventTool') && (data.event || data.success)) {
    const ev = (data.event ?? data) as Record<string, unknown>
    return (
      <div className="flex flex-col gap-1 mb-2">
        <MiniResultCard
          icon={<img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-3.5 h-3.5 object-contain shrink-0" />}
          title={<span className="text-white">{String(ev.summary ?? 'Event created')}</span>}
          subtitle={ev.start ? `Scheduled for ${new Date(String(ev.start)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Added to Google Calendar'}
        />
      </div>
    )
  }

  if (toolName === 'deleteCalendarEventTool' && (data.success || data.deleted)) {
    return (
      <div className="flex flex-col gap-1 mb-2">
        <MiniResultCard
          icon={<img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-3.5 h-3.5 object-contain shrink-0" />}
          title={<span className="text-white">Event removed</span>}
          subtitle="Deleted from Google Calendar"
        />
      </div>
    )
  }

  // PostHog Insights
  if (toolName === 'listPostHogInsights' && Array.isArray(data.insights)) {
    const insights = data.insights as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1 mb-2">
        {insights.slice(0, 4).map((ins, i) => (
          <MiniResultCard
            key={i}
            icon={<img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain shrink-0" />}
            title={<span className="text-white">{String(ins.name ?? 'Insight')}</span>}
            subtitle={String(ins.description || 'Saved metric insight')}
          />
        ))}
        {insights.length > 4 && (
          <div className="text-[11.5px] text-neutral-500 pl-7">+ {insights.length - 4} more insights</div>
        )}
      </div>
    )
  }

  // PostHog Events
  if (toolName === 'getPostHogEvents' && Array.isArray(data.events)) {
    const events = data.events as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1 mb-2">
        {events.slice(0, 4).map((ev, i) => {
          const isCancel = String(ev.event).includes('cancel')
          return (
            <MiniResultCard
              key={i}
              icon={<img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain shrink-0" />}
              title={
                <span className={`font-mono text-[11.5px] ${isCancel ? 'text-rose-400 font-semibold' : 'text-white'}`}>
                  {String(ev.event ?? 'event')}
                </span>
              }
              subtitle={
                <span className="flex items-center gap-1.5 truncate">
                  <span className="text-neutral-400">{String(ev.distinctId ?? 'user')}</span>
                  {ev.url ? <span className="text-neutral-500 truncate">· {String(ev.url)}</span> : null}
                </span>
              }
            />
          )
        })}
        {events.length > 4 && (
          <div className="text-[11.5px] text-neutral-500 pl-7">+ {events.length - 4} more events</div>
        )}
      </div>
    )
  }

  // PostHog Cohorts
  if (toolName === 'listPostHogCohorts' && Array.isArray(data.cohorts)) {
    const cohorts = data.cohorts as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1 mb-2">
        {cohorts.map((c, i) => (
          <MiniResultCard
            key={i}
            icon={<img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain shrink-0" />}
            title={<span className="text-white">{String(c.name ?? 'Cohort')}</span>}
            subtitle={`${c.userCount ?? 0} users in cohort`}
          />
        ))}
      </div>
    )
  }

  // PostHog Event Definitions
  if (toolName === 'getPostHogEventDefinitions' && Array.isArray(data.events)) {
    const evDefs = data.events as Array<Record<string, unknown>>
    if (evDefs.length === 0) return null
    return (
      <div className="flex flex-col gap-1 mb-2">
        {evDefs.slice(0, 3).map((def, i) => (
          <MiniResultCard
            key={i}
            icon={<img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain shrink-0" />}
            title={<span className="font-mono text-[11.5px] text-white">{String(def.name)}</span>}
            subtitle={`${def.volume30d ?? 0} events / 30d`}
          />
        ))}
      </div>
    )
  }

  // Generic success
  if (data.success) {
    return (
      <div className="text-[12px] text-emerald-400/70 mb-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Completed successfully
      </div>
    )
  }

  return null
}

// ─── Extract tool name from part ─────────────────────────────────────
function extractToolName(part: Record<string, unknown>): string {
  // DynamicToolUIPart has toolName directly
  if (typeof part.toolName === 'string') return part.toolName
  // ToolUIPart has type: `tool-${NAME}` — extract from type string
  const partType = String(part.type ?? '')
  if (partType.startsWith('tool-')) return partType.slice(5)
  return 'unknown'
}

function buildDynamicOperationalThought(toolNames: string[], messageParts: Array<Record<string, unknown>>): string {
  // Check if any tool input has specific details (e.g. title, subject, recipient)
  const calendarEvent = messageParts.find(p => {
    const name = extractToolName(p).toLowerCase()
    return name.includes('calendar')
  })
  if (calendarEvent) {
    const input = ((calendarEvent.input ?? calendarEvent.args ?? {}) as Record<string, unknown>)
    const title = input.title || input.summary || input.eventTitle
    if (typeof title === 'string' && title.trim()) {
      return `Formulating calendar scheduling operation for "${title.trim()}" and confirming availability.`
    }
    const name = extractToolName(calendarEvent).toLowerCase()
    if (name.includes('delete')) return 'Scanning schedule to identify and delete the requested calendar meeting.'
    if (name.includes('create')) return 'Setting up requested calendar meeting and confirming availability.'
    return 'Querying Google Calendar schedule for upcoming events and commitments.'
  }

  const emailTool = messageParts.find(p => {
    const name = extractToolName(p).toLowerCase()
    return name.includes('gmail') || name.includes('email') || name.includes('inbox')
  })
  if (emailTool) {
    const input = ((emailTool.input ?? emailTool.args ?? {}) as Record<string, unknown>)
    const to = input.to || input.recipient
    if (typeof to === 'string' && to.trim()) {
      return `Composing email reply to ${to.trim()} and verifying thread history.`
    }
    return 'Scanning active inbox communications and triaging direct customer threads.'
  }

  const billingTool = messageParts.find(p => {
    const name = extractToolName(p).toLowerCase()
    return name.includes('stripe') || name.includes('account') || name.includes('billing')
  })
  if (billingTool) {
    return 'Evaluating Stripe billing telemetry, payment states, and account churn risks.'
  }

  const posthogTool = messageParts.find(p => {
    const name = extractToolName(p).toLowerCase()
    return name.includes('posthog') || name.includes('event')
  })
  if (posthogTool) {
    return 'Querying product telemetry and active user feature adoption metrics.'
  }

  const searchTool = messageParts.find(p => {
    const name = extractToolName(p).toLowerCase()
    return name.includes('search') || name.includes('tavily')
  })
  if (searchTool) {
    return 'Conducting real-time web research to cross-reference authoritative sources.'
  }

  if (toolNames.length > 0) {
    const formattedTools = toolNames.map(t => TOOL_LABELS[t] || t).slice(0, 2).join(', ')
    return `Formulating execution plan and running operational integration (${formattedTools}).`
  }

  return 'Analyzing request context and formulating executive co-founder response.'
}

// ─── Single Message Renderer ─────────────────────────────────────────

function AgentMessageBubble({ message, avatarUrl }: { message: UIMessage; avatarUrl: string | null }) {
  const { sendMessage, status } = useChatContext()
  const isChatStreaming = status === "streaming" || status === "submitted"
  if (message.role === "user") {
    // User prompt bubble (right-aligned floating card like Devin)
    const textContent = message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""

    if (!textContent) return null

    return (
      <div className="w-full flex justify-end items-center my-4 relative z-10">
        <div className="bg-[#1c1c1c] border border-[#282828] text-zinc-200 text-[13px] font-normal px-4 py-2.5 rounded-[20px] max-w-[85%] sm:max-w-[70%] shadow-sm leading-relaxed break-words select-text">
          {textContent}
        </div>
      </div>
    )
  }

  // Assistant message — render parts sequentially
  let parts = Array.isArray(message.parts) ? [...message.parts] : []
  if (parts.length === 0) {
    const rawContent =
      (message as unknown as { content?: string; text?: string }).content ??
      (message as unknown as { text?: string }).text
    if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
      parts = [{ type: 'text', text: rawContent }] as any
    }
  }

  const hasAssistantText = parts.some(
    (p) => p.type === "text" && typeof p.text === 'string' && Boolean(p.text.trim())
  )

  // Group sequential tool calls into reasoning batches
  // Check if this turn executed any tools, and find the index of the last tool part
  const isToolPart = (p: unknown): boolean => {
    const raw = p as Record<string, unknown>
    const t = String(raw?.type ?? '')
    return (t.startsWith('tool-') || t === 'dynamic-tool') && extractToolName(raw) !== 'requestMoreTools'
  }

  let lastToolIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isToolPart(parts[i])) {
      lastToolIdx = i
      break
    }
  }
  const hasTools = lastToolIdx !== -1

  const announcedActionMismatch = Boolean(
    (message.metadata as { announcedActionMismatch?: unknown } | undefined)
      ?.announcedActionMismatch
  )

  const rendered: React.ReactNode[] = []
  const thinkingParts: string[] = []
  const intermediateObservations: string[] = []
  const finalSpeechParts: string[] = []
  const toolBatch: React.ReactNode[] = []
  let toolBatchCount = 0
  const batchToolNames: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part.type === "reasoning" && typeof part.text === 'string' && part.text.trim()) {
      thinkingParts.push(part.text.trim())
      continue
    }

    if (part.type === "text" && typeof part.text === 'string' && part.text.length > 0) {
      let rawText = part.text
      const thinkMatch = rawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i)
      if (thinkMatch) {
        const thinkContent = thinkMatch[1].trim()
        if (thinkContent) {
          thinkingParts.push(thinkContent)
        }
        rawText = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim()
      }

      if (rawText.length > 0) {
        if (hasTools && i < lastToolIdx) {
          // Intermediate model monologue / thought between tool executions
          intermediateObservations.push(rawText)
        } else {
          // Final speech block to founder
          finalSpeechParts.push(rawText)
        }
      }
      continue
    }

    // Tool parts: in AI SDK v6, tool types are `tool-${NAME}` or `dynamic-tool`
    // They have state, input, output properties directly on the part
    const rawPart = part as Record<string, unknown>
    const partType = String(rawPart.type ?? '')
    const isTool = partType.startsWith('tool-') || partType === 'dynamic-tool'

    if (isTool) {
      const toolName = extractToolName(rawPart)
      // Internal orchestration meta-tools should not be rendered as separate user-facing nodes
      if (toolName === 'requestMoreTools') {
        continue
      }

      // Collect consecutive tool parts with the same toolName into a single grouped node
      const group: Array<{ index: number; part: Record<string, unknown> }> = [{ index: i, part: rawPart }]
      while (i + 1 < parts.length) {
        const nextRaw = parts[i + 1] as Record<string, unknown>
        const nextType = String(nextRaw.type ?? '')
        if ((nextType.startsWith('tool-') || nextType === 'dynamic-tool') && extractToolName(nextRaw) === toolName) {
          group.push({ index: i + 1, part: nextRaw })
          i++
        } else {
          break
        }
      }

      batchToolNames.push(toolName)
      const baseLabel = TOOL_LABELS[toolName] ?? toolName
      const icon = TOOL_ICONS[toolName] ?? <Search className="w-3.5 h-3.5 text-neutral-500" />

      const allCompleted = group.every(g => String(g.part.state ?? '') === 'output-available')
      const hasError = group.some(g => String(g.part.state ?? '') === 'output-error')
      const anyStreaming = group.some(g => {
        const s = String(g.part.state ?? '')
        return s === 'input-streaming' || s === 'input-available'
      })

      const isStillLoading = anyStreaming && isChatStreaming
      const isCompleted = !isStillLoading && !hasError

      // Pluralized title when multiple actions happen under one tool
      let displayTitle = baseLabel
      if (group.length > 1) {
        if (toolName === 'deleteCalendarEventTool') {
          displayTitle = isCompleted ? `Deleted ${group.length} Calendar events` : `Deleting ${group.length} Calendar events`
        } else if (toolName === 'createCalendarEventTool') {
          displayTitle = isCompleted ? `Created ${group.length} Calendar events` : `Creating ${group.length} Calendar events`
        } else if (toolName === 'resolveSignal') {
          displayTitle = isCompleted ? `Resolved ${group.length} workspace signals` : `Resolving ${group.length} workspace signals`
        } else if (toolName === 'archiveAccount') {
          displayTitle = isCompleted ? `Archived ${group.length} accounts` : `Archiving ${group.length} accounts`
        } else if (toolName === 'updateAccountRisk') {
          displayTitle = isCompleted ? `Updated ${group.length} account risk assessments` : `Updating ${group.length} account risks`
        } else if (toolName === 'sendGmailReply' || toolName === 'composeNewEmail') {
          displayTitle = isCompleted ? `Sent ${group.length} emails` : `Sending ${group.length} emails`
        } else {
          displayTitle = `${baseLabel} (${group.length} actions)`
        }
      }

      if (group.length === 1) {
        const single = group[0]
        const state = String(single.part.state ?? '')
        const toolInput = single.part.input ?? single.part.args ?? single.part.toolInput ?? null

        if (state === "input-streaming" || state === "input-available") {
          toolBatch.push(
            <TimelineNode
              key={`tool-${single.index}`}
              title={baseLabel}
              icon={icon}
              isLoading={isStillLoading}
              isCompleted={!isStillLoading}
            >
              <ToolThinkingSummary toolName={toolName} input={toolInput} />
            </TimelineNode>
          )
          toolBatchCount++
        } else if (state === "output-available") {
          toolBatch.push(
            <TimelineNode
              key={`tool-${single.index}`}
              title={baseLabel}
              icon={icon}
              isCompleted={true}
              isCollapsible={true}
            >
              <ToolThinkingSummary toolName={toolName} input={toolInput} />
              <ToolResultSummary toolName={toolName} result={single.part.output} />
            </TimelineNode>
          )
          toolBatchCount++
        } else if (state === "output-error") {
          const errText = String(single.part.errorText ?? 'The agent encountered an error processing this request.')
          const errLow = errText.toLowerCase()
          const isAuthErr =
            errLow.includes('not connected') ||
            errLow.includes('not configured') ||
            errLow.includes('reconnect') ||
            errLow.includes('credentials are missing') ||
            errLow.includes('refresh token') ||
            errLow.includes('oauth') ||
            errLow.includes('invalid_grant')
          toolBatch.push(
            <TimelineNode
              key={`tool-${single.index}`}
              title={baseLabel}
              icon={icon}
              isCompleted={true}
            >
              {isAuthErr
                ? <UnconnectedIntegrationBadge toolName={toolName} errorText={errText} />
                : <div className="text-[12px] text-red-400/80 font-normal py-0.5 mt-0.5">{formatCleanErrorMessage(errText, toolName)}</div>
              }
            </TimelineNode>
          )
          toolBatchCount++
        }
      } else {
        // Grouped multi-action TimelineNode
        toolBatch.push(
          <TimelineNode
            key={`grouped-tool-${group[0].index}`}
            title={displayTitle}
            icon={icon}
            isLoading={isStillLoading}
            isCompleted={isCompleted}
            isCollapsible={true}
          >
            <div className="flex flex-col gap-1.5 py-1">
              {group.map((item) => {
                const toolInput = item.part.input ?? item.part.args ?? item.part.toolInput ?? null
                return (
                  <div key={item.index} className="flex flex-col gap-0.5 border-l border-white/10 pl-2.5 my-0.5">
                    <ToolThinkingSummary toolName={toolName} input={toolInput} />
                    {item.part.output ? <ToolResultSummary toolName={toolName} result={item.part.output} /> : null}
                  </div>
                )
              })}
            </div>
          </TimelineNode>
        )
        toolBatchCount += group.length
      }
    }
  }

  // 1. Render Top-Level Thinking Monologue
  const modelThoughts = [
    ...thinkingParts,
    ...intermediateObservations
  ].filter(Boolean).join('\n\n').trim()

  const isExecutingTurn = isChatStreaming && finalSpeechParts.length === 0
  const shouldRenderThinking = modelThoughts.length > 0 || hasTools || isExecutingTurn

  if (shouldRenderThinking) {
    // While actively executing/streaming, display modelThoughts directly (shows spinner if empty yet).
    // Only fall back to dynamic operational summary when turn is finished with tools and model emitted no thoughts.
    const finalThinkingText = isExecutingTurn
      ? modelThoughts
      : (modelThoughts || (hasTools ? buildDynamicOperationalThought(batchToolNames, parts as Array<Record<string, unknown>>) : ''))

    rendered.push(
      <MonologueBlock
        key={`thinking-${message.id}`}
        text={finalThinkingText}
        isExecuting={isExecutingTurn}
      />
    )
  }

  // 2. Render Single Unified Tool Execution Batch (all tool calls unified into one clean node)
  if (toolBatch.length > 0) {
    const isExecuting = toolBatch.some(node =>
      React.isValidElement(node) && (node.props as { isLoading?: boolean }).isLoading
    )
    rendered.push(
      <AgentReasoningBatch
        key={`batch-${message.id}`}
        stepsCount={toolBatchCount}
        isExecuting={isExecuting}
        announcedActionMismatch={!isExecuting && announcedActionMismatch}
        toolNames={[...batchToolNames]}
      >
        {toolBatch}
      </AgentReasoningBatch>
    )
  }

  // 3. Render Final Speech Block (executive summary answering the founder)
  if (finalSpeechParts.length > 0) {
    rendered.push(
      <AgentSpeechBlock
        key={`speech-${message.id}`}
        text={finalSpeechParts.join('\n\n')}
        isStreaming={isChatStreaming}
      />
    )
  }

  if (rendered.length === 0) {
    if (isChatStreaming) return null
    return (
      <div className="w-full relative z-10 pt-2 mb-6">
        <div className="w-full flex flex-col gap-2">
          <div className="text-[13px] text-neutral-400 dark:text-neutral-500 italic py-1 px-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600 inline-block" />
            <span>Execution stopped by user.</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full relative z-10 pt-2 mb-6">
      <div className="w-full flex flex-col gap-2">
        {rendered}
      </div>
    </div>
  )
}

// ─── Structured Thinking Indicator ──────────────────────────────────
function AgentThinking() {
  return (
    <div className="w-full relative z-10 pt-2 mb-4">
      <MonologueBlock
        text=""
        isExecuting={true}
      />
    </div>
  )
}

// ─── Error Message Formatter ──────────────────────────────────────────
export function formatCleanErrorMessage(rawMsg: string, toolName?: string): string {
  if (!rawMsg) return "An unexpected error occurred."

  let msg = rawMsg
  try {
    if (msg.includes('{') && msg.includes('}')) {
      const jsonStart = msg.indexOf('{')
      const jsonEnd = msg.lastIndexOf('}')
      const jsonStr = msg.substring(jsonStart, jsonEnd + 1)
      const parsed = JSON.parse(jsonStr)
      if (parsed.error?.message) {
        msg = parsed.error.message
      } else if (parsed.message) {
        msg = parsed.message
      }
    }
  } catch {
    // Keep original
  }

  const low = `${toolName ?? ''} ${msg}`.toLowerCase()

  if (low.includes("posthog")) {
    if (low.includes("401") || low.includes("unauthorized") || low.includes("invalid_api_key")) {
      return "PostHog API authentication failed. Please update your Personal API Key in Settings."
    }
    if (low.includes("403") || low.includes("forbidden")) {
      return "PostHog project permission denied. Check your project ID and API key permissions in Settings."
    }
    if (low.includes("404") || low.includes("not found")) {
      return "PostHog resource or project ID not found. Verify your project ID in Settings."
    }
    if (low.includes("timeout") || low.includes("timed out") || low.includes("504") || low.includes("aborted")) {
      return "PostHog analytics API request timed out. Please try again."
    }
    if (low.includes("500") || low.includes("502") || low.includes("503")) {
      return "PostHog analytics API service is temporarily unavailable. Please try again shortly."
    }
    return msg
  }

  if (low.includes("stripe")) {
    if (low.includes("401") || low.includes("unauthorized") || low.includes("invalid_api_key")) {
      return "Stripe API authentication failed. Please update your Secret Key in Settings."
    }
    if (low.includes("timeout") || low.includes("timed out")) {
      return "Stripe API request timed out. Please try again."
    }
    if (low.includes("500") || low.includes("502") || low.includes("503")) {
      return "Stripe API service is temporarily unavailable. Please try again shortly."
    }
    return msg
  }

  if (low.includes("gmail") || low.includes("google")) {
    if (low.includes("401") || low.includes("unauthorized") || low.includes("token")) {
      return "Google / Gmail session expired or unauthorized. Please reconnect in Settings."
    }
    if (low.includes("timeout") || low.includes("timed out")) {
      return "Google / Gmail request timed out. Please try again."
    }
    return msg
  }

  if (low.includes("rate_limit") || low.includes("429") || low.includes("tpm") || low.includes("rpm")) {
    return "API rate limit reached. Please wait a few moments before trying again."
  }

  if (
    low.includes("500") ||
    low.includes("502") ||
    low.includes("503") ||
    low.includes("504") ||
    low.includes("overloaded") ||
    low.includes("timeout") ||
    low.includes("service_unavailable") ||
    low.includes("bad gateway")
  ) {
    return "Service temporarily unavailable or timed out. Please try your request again in a few moments."
  }

  if (
    low.includes("401") ||
    low.includes("403") ||
    low.includes("invalid_api_key") ||
    low.includes("unauthorized") ||
    low.includes("not configured")
  ) {
    return "AI model authentication or configuration issue. Please check your API key settings."
  }

  if (
    low.includes("context_length") ||
    low.includes("maximum context length") ||
    low.includes("token limit")
  ) {
    return "The request exceeded the maximum conversation context limit. Try starting a fresh thread or asking a more focused question."
  }

  if (
    low.includes("content_filter") ||
    low.includes("policy_violation") ||
    low.includes("flagged")
  ) {
    return "The request could not be completed. Please try rephrasing your message."
  }

  // Strip any vendor URLs or request IDs that passed through
  let sanitized = msg
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/\b(?:request\s*id|apim-request-id|req_[a-zA-Z0-9]+)[:=]?\s*[^\s]+/gi, '')
    .trim()

  if (!sanitized || sanitized.startsWith('{') || sanitized.includes('"error"')) {
    return "The agent encountered an unexpected issue while processing your request. Please try again."
  }

  return sanitized
}

// ─── Main Feed Component ─────────────────────────────────────────────

const DEMO_SEED_MESSAGES: UIMessage[] = [
  // Turn 1: Web Research & Internet Search
  {
    id: "demo-user-1",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Search the web for Acme Corp's latest product press release and API roadmap.",
      },
    ],
  },
  {
    id: "demo-assistant-1",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: "Executing live Tavily web search for Acme Corp product news and extracting press release content.",
      },
      {
        type: "tool-webSearchTool",
        toolCallId: "call_demo_1",
        state: "output-available",
        toolName: "webSearchTool",
        input: { query: "Acme Corp AI Operations Suite 3.0 press release" },
        output: {
          results: [
            {
              title: "Acme Corp Announces AI Operations Suite 3.0",
              snippet: "Acme Corp unveils next-gen AI automation tools for enterprise workflows with 99.9% uptime SLA.",
              url: "https://techcrunch.com/acme-corp-ai-suite",
            },
            {
              title: "Acme Corp Q3 Product Roadmap & API Expansion",
              snippet: "Acme Corp expands native integrations for Stripe, PostHog, Gmail, and Linear.",
              url: "https://news.acme.com/roadmap",
            },
          ],
        },
      } as unknown as UIMessage["parts"][number],
      {
        type: "text",
        text: "Found 2 press releases for Acme Corp. They recently launched **AI Operations Suite 3.0** with native integrations across Stripe, PostHog, and Linear.",
      },
    ],
  },

  // Turn 2: CRM Database & Stripe Billing Audit
  {
    id: "demo-user-2",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Check Acme Corp's internal CRM record and live Stripe subscription state.",
      },
    ],
  },
  {
    id: "demo-assistant-2",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: "Querying account health metrics from Postgres DB and checking Stripe API subscription status.",
      },
      {
        type: "tool-getAccountDetails",
        toolCallId: "call_demo_2",
        state: "output-available",
        toolName: "getAccountDetails",
        input: { name: "Acme Corp" },
        output: {
          name: "Acme Corp",
          mrr: "$14,500/mo",
          riskLevel: "Low Risk",
          usageDelta: "+18% usage",
        },
      } as unknown as UIMessage["parts"][number],
      {
        type: "tool-getStripeAccountState",
        toolCallId: "call_demo_3",
        state: "output-available",
        toolName: "getStripeAccountState",
        input: { customerId: "cus_acme99" },
        output: {
          subscriptions: [
            { plan: "Enterprise Annual Stack", status: "active", cancelAtPeriodEnd: false },
          ],
        },
      } as unknown as UIMessage["parts"][number],
      {
        type: "text",
        text: "Acme Corp is **Healthy** (`$14,500/mo` MRR) on an **Enterprise Annual Stack** with active status and zero payment disputes.",
      },
    ],
  },

  // Turn 3: Gmail Communications & Email Draft Generation
  {
    id: "demo-user-3",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Scan recent Gmail threads with Acme Corp and generate a follow-up draft.",
      },
    ],
  },
  {
    id: "demo-assistant-3",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: "Fetching Gmail threads via Google API and generating personalized follow-up draft.",
      },
      {
        type: "tool-getGmailThreadsForAccount",
        toolCallId: "call_demo_4",
        state: "output-available",
        toolName: "getGmailThreadsForAccount",
        input: { accountName: "Acme Corp" },
        output: {
          threads: [
            {
              subject: "Q3 Enterprise Renewal & Expansion Terms",
              from: "sarah@acmecorp.com",
              needsReply: true,
            },
          ],
        },
      } as unknown as UIMessage["parts"][number],
      {
        type: "tool-generateFollowUpDraft",
        toolCallId: "call_demo_5",
        state: "output-available",
        toolName: "generateFollowUpDraft",
        input: { accountName: "Acme Corp", draftType: "Renewal Follow-up" },
        output: {
          success: true,
          subject: "Re: Q3 Enterprise Renewal & Expansion Terms",
          accountName: "Acme Corp",
          draftType: "Renewal Check-in",
        },
      } as unknown as UIMessage["parts"][number],
      {
        text: "Found 1 thread requiring reply from `sarah@acmecorp.com`. Draft created for your review.",
        type: "text",
      },
    ],
  },

  // Turn 4: Interactive Founder Action Approval Card
  {
    id: "demo-user-4",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Queue a 15% rescue discount for founder authorization.",
      },
    ],
  },
  {
    id: "demo-assistant-4",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: "Creating approval request card for 15% rescue discount.",
      },
      {
        type: "tool-createRescueDiscountTool",
        toolCallId: "call_demo_6",
        state: "output-available",
        toolName: "createRescueDiscountTool",
        input: { accountName: "Acme Corp", percentage: 15 },
        output: {
          approvalRequired: true,
          actionSummary: "Apply 15% Rescue Discount for Acme Corp",
        },
      } as unknown as UIMessage["parts"][number],
      {
        type: "text",
        text: "> **Action Queued**: Interactive approval card rendered above. Click **Approve** to authorize.",
      },
    ],
  },
]

export function AgentFeed() {
  const { messages, sendMessage, isLoading, status, hydrationStatus, error } = useChatContext()
  const feedRef = React.useRef<HTMLDivElement>(null)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)

  // Filter out temporary test artifacts, deduplicate identical repeated messages, and avoid repeating stopped banners
  const displayMessages = React.useMemo(() => {
    const seenIds = new Set<string>()
    let lastRenderedAssistantWasStopped = false

    const liveMessages = messages.filter((m, idx) => {
      const msgId = typeof m.id === "string" && m.id.trim().length > 0 ? m.id : `msg-${m.role}-${idx}`
      if (seenIds.has(msgId)) return false
      seenIds.add(msgId)

      if (m.role === "assistant") {
        const textParts = m.parts?.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("").trim() ?? ""
        const isStoppedMsg = textParts.toLowerCase().includes("execution stopped") || (m.parts?.length ?? 0) === 0

        // If the previous message was also an assistant stopped banner, omit consecutive repeats
        if (isStoppedMsg) {
          if (lastRenderedAssistantWasStopped) return false
          lastRenderedAssistantWasStopped = true
        } else {
          lastRenderedAssistantWasStopped = false
        }

        const prev = messages[idx - 1]
        if (prev && prev.role === "assistant") {
          const prevText = prev.parts?.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("").trim()
          if (prevText && textParts && prevText === textParts) {
            return false
          }
        }
        return true
      }

      if (m.role === "user") {
        lastRenderedAssistantWasStopped = false
        const prev = messages[idx - 1]
        if (prev && prev.role === "user") {
          const prevText = prev.parts?.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("").trim()
          const currText = m.parts?.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("").trim()
          if (prevText && currText && prevText === currText) {
            return false
          }
        }
      }

      const text = m.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim() ?? ""
      return !text.startsWith("c=") && text !== "jd" && text !== "f"
    })

    return liveMessages
  }, [messages])

  // Fetch Google account avatar
  React.useEffect(() => {
    const supabase = createClient()

    async function loadAvatar() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const meta = user.user_metadata ?? {}
          const identityPic = user.identities?.[0]?.identity_data?.avatar_url || user.identities?.[0]?.identity_data?.picture
          const pic = meta.avatar_url || meta.picture || meta.avatar_path || identityPic || null
          if (pic) setAvatarUrl(pic)
        }
      } catch {
        // ignore
      }
    }

    loadAvatar()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: Session | null) => {
      const u = session?.user
      if (u) {
        const meta = u.user_metadata ?? {}
        const identityPic = u.identities?.[0]?.identity_data?.avatar_url || u.identities?.[0]?.identity_data?.picture
        const pic = meta.avatar_url || meta.picture || meta.avatar_path || identityPic || null
        if (pic) setAvatarUrl(pic)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const bottomAnchorRef = React.useRef<HTMLDivElement>(null)

  // Smooth auto-scroll on new messages, streaming updates, and expanding nodes
  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (feedRef.current) {
      if (displayMessages === DEMO_SEED_MESSAGES) {
        feedRef.current.scrollTop = 0
      } else {
        feedRef.current.scrollTo({
          top: feedRef.current.scrollHeight,
          behavior,
        })
      }
    }
  }, [displayMessages])

  // Track DOM mutations and size changes during streaming/rendering to auto-scroll smoothly without jitter
  React.useEffect(() => {
    const container = feedRef.current
    if (!container) return

    let rafId: number | null = null
    const scheduleScroll = (behavior: ScrollBehavior = 'auto') => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        if (container) {
          if (displayMessages === DEMO_SEED_MESSAGES) {
            container.scrollTop = 0
          } else {
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
            if (distanceFromBottom < 250 || isLoading) {
              container.scrollTo({
                top: container.scrollHeight,
                behavior,
              })
            }
          }
        }
        rafId = null
      })
    }

    scheduleScroll(isLoading ? 'smooth' : 'auto')

    const resizeObserver = new ResizeObserver(() => {
      scheduleScroll('auto')
    })
    resizeObserver.observe(container)

    const mutationObserver = new MutationObserver(() => {
      scheduleScroll('auto')
    })
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [displayMessages, status, isLoading])

  // Show loading state during server hydration
  if (hydrationStatus === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
          <span className="text-[13px] text-neutral-500">Restoring conversation...</span>
        </div>
      </div>
    )
  }

  if (messages.length === 0 && !isLoading) {
    return <div className="flex-1" />
  }

  return (
    <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col custom-scrollbar scroll-smooth">
      <div className="w-full flex flex-col gap-4">
        {displayMessages.map((message, idx) => (
          <AgentMessageBubble
            key={typeof message.id === "string" && message.id.trim().length > 0 ? message.id : `msg-${message.role}-${idx}`}
            message={message}
            avatarUrl={avatarUrl}
          />
        ))}

        {(() => {
          if (!isLoading || error) return null
          const lastMsg = messages[messages.length - 1]
          if (!lastMsg || lastMsg.role === "user") {
            // Prompt was just submitted and assistant stream hasn't pushed first message yet
            return <AgentThinking />
          }
          return null
        })()}

        {error && !isLoading && (
          <div className="w-full flex justify-center mt-2 mb-4">
            <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-md">
              <div className="flex gap-2.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <h4 className="text-[12px] font-semibold text-red-400 mb-0.5">
                    Execution Notice
                  </h4>
                  <p className="text-[12px] text-red-200/90 leading-relaxed font-sans break-words whitespace-pre-wrap">
                    {formatCleanErrorMessage(error.message || "The agent encountered an error.")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
                  const text = lastUserMsg?.parts?.find((p) => p.type === "text" && "text" in p && typeof p.text === "string")
                  const prompt = (text && "text" in text ? text.text : "Please complete the analysis.") as string
                  sendMessage({ role: "user", parts: [{ type: "text", text: prompt }] } as any)
                }}
                className="shrink-0 px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-white text-[11.5px] font-medium transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={bottomAnchorRef} className="h-px shrink-0" />
      </div>
    </div>
  )
}
