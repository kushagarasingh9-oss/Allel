"use client"

import * as React from "react"
import { cn } from "@/foundation/utils"
import { motion, AnimatePresence } from "motion/react"
import { ChevronRight, Loader2, Check, Clock } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface TimelineNodeProps {
  title: React.ReactNode
  icon?: React.ReactNode
  isCompleted?: boolean
  isLoading?: boolean
  isCollapsible?: boolean
  children?: React.ReactNode
  className?: string
  defaultOpen?: boolean
  autoCollapse?: boolean
}

export type ReasoningBatchState = {
  isExecuting: boolean
  stepsCount: number
  /** Server observation: the reply promised an action the turn never performed. */
  announcedActionMismatch?: boolean
  /** List of tool names executed in this batch to build a contextual title. */
  toolNames?: string[]
}

export type ReasoningBatchLabel = {
  text: string
  /** Whether the turn should read as a problem rather than as completed work. */
  isUnfulfilled: boolean
}

export function getBatchActionTitle(toolNames: string[] = [], isExecuting: boolean = false): string {
  const tools = new Set(toolNames)
  const lowerTools = toolNames.map((t) => t.toLowerCase())

  if (
    tools.has('listCalendarEventsTool') &&
    (tools.has('getMyInbox') || tools.has('getAllAccounts'))
  ) {
    return isExecuting ? "Preparing daily brief" : "Prepared daily brief"
  }

  // Email replies & sending
  if (
    tools.has('sendGmailReply') ||
    tools.has('composeNewEmail') ||
    lowerTools.some((t) => t.includes('send') && (t.includes('mail') || t.includes('email'))) ||
    lowerTools.some((t) => t.includes('reply') && (t.includes('mail') || t.includes('email') || t.includes('thread')))
  ) {
    return isExecuting ? "Sending email reply" : "Sent email reply"
  }

  // Email inbox & reading
  if (
    tools.has('getMyInbox') ||
    tools.has('getGmailThreadsForAccount') ||
    tools.has('getGmailThreadDetailTool') ||
    tools.has('getExistingDrafts') ||
    tools.has('generateFollowUpDraft') ||
    lowerTools.some((t) => t.includes('gmail') || t.includes('inbox') || t.includes('draft'))
  ) {
    return isExecuting ? "Checking inbox & communications" : "Reviewed inbox & communications"
  }

  // Calendar event deletion
  if (
    tools.has('deleteCalendarEventTool') ||
    lowerTools.some((t) => t.includes('delete') && t.includes('calendar'))
  ) {
    return isExecuting ? "Deleting Calendar event" : "Deleted Calendar event"
  }

  // Calendar event creation
  if (
    tools.has('createCalendarEventTool') ||
    tools.has('quickAddCalendarEventTool') ||
    lowerTools.some((t) => (t.includes('create') || t.includes('add')) && t.includes('calendar'))
  ) {
    return isExecuting ? "Creating Calendar event" : "Created Calendar event"
  }

  // Calendar general
  if (
    tools.has('listCalendarEventsTool') ||
    tools.has('updateCalendarEventTool') ||
    tools.has('getCalendarEventDetailTool') ||
    tools.has('getCalendarEventTool') ||
    tools.has('checkCalendarFreeBusy') ||
    tools.has('queryFreeBusyTool') ||
    tools.has('listCalendarsTool') ||
    lowerTools.some((t) => t.includes('calendar') || t.includes('schedule') || t.includes('freebusy'))
  ) {
    const isWrite = tools.has('updateCalendarEventTool')
    if (isWrite) {
      return isExecuting ? "Updating Google Calendar" : "Updated Google Calendar"
    }
    return isExecuting ? "Checking Google Calendar" : "Checked Google Calendar"
  }

  // Web intelligence
  if (
    tools.has('webSearchTool') ||
    tools.has('webExtractTool') ||
    tools.has('webCrawlTool') ||
    tools.has('webMapTool') ||
    lowerTools.some((t) => t.includes('web') || t.includes('crawl') || t.includes('extract'))
  ) {
    return isExecuting ? "Searching web intelligence" : "Searched web intelligence"
  }

  // PostHog / Product Analytics
  if (
    tools.has('getPostHogEvents') ||
    tools.has('getPostHogEventDefinitions') ||
    tools.has('listPostHogInsights') ||
    tools.has('getPostHogAccountUsage') ||
    tools.has('listPostHogCohorts') ||
    tools.has('listPostHogFeatureFlags') ||
    tools.has('togglePostHogFeatureFlag') ||
    tools.has('searchPostHogPersons') ||
    lowerTools.some((t) => t.includes('posthog'))
  ) {
    if (isExecuting) {
      const activeTool = toolNames?.[toolNames.length - 1]
      if (activeTool === 'getPostHogEventDefinitions') return "Searching PostHog: Reading event catalog..."
      if (activeTool === 'listPostHogInsights') return "Searching PostHog: Pulling analytics charts..."
      if (activeTool === 'listPostHogCohorts') return "Searching PostHog: Reading user cohorts..."
      if (activeTool === 'getPostHogAccountUsage') return "Searching PostHog: Checking usage trends..."
      if (activeTool === 'getPostHogEvents') return "Searching PostHog: Inspecting user events..."
      if (activeTool === 'searchPostHogPersons') return "Searching PostHog: Inspecting user profiles..."
      return "Searching across PostHog analytics..."
    }
    return "Searched PostHog analytics"
  }

  // Billing & Stripe
  if (
    tools.has('getAllAccounts') ||
    tools.has('getStripeAccountState') ||
    tools.has('getRecentSignals') ||
    tools.has('getAccountDetails') ||
    tools.has('createRescueDiscountTool') ||
    lowerTools.some((t) => t.includes('stripe') || t.includes('billing') || t.includes('account') || t.includes('risk'))
  ) {
    if (isExecuting) {
      const activeTool = toolNames?.[toolNames.length - 1]
      if (activeTool === 'getAllAccounts') return "Scanning Stripe: Fetching customer accounts..."
      if (activeTool === 'getStripeAccountState') return "Scanning Stripe: Checking subscription state..."
      if (activeTool === 'getAccountDetails') return "Scanning Stripe: Pulling billing details..."
      if (activeTool === 'getRecentSignals') return "Scanning Stripe: Evaluating risk signals..."
      return "Scanning customer billing & risk..."
    }
    return "Analyzed customer billing & risk"
  }

  // Unified Customer Scan & Health
  if (
    tools.has('getUnifiedCustomerScan') ||
    tools.has('getAccountRecoveryStatus') ||
    lowerTools.some((t) => t.includes('customerscan') || t.includes('unifiedcustomer'))
  ) {
    return isExecuting ? "Scanning customer across connected integrations..." : "Searched customer health & telemetry"
  }

  // Fleet Scan & Multi-Provider Revenue Risk
  if (
    tools.has('getUnifiedFleetScan') ||
    tools.has('runRevenueRiskScan') ||
    tools.has('scanFleetAccountsTool') ||
    lowerTools.some((t) => t.includes('fleet') || t.includes('revenuerisk'))
  ) {
    return isExecuting ? "Auditing fleet revenue risk across connected stack..." : "Audited workspace revenue risk"
  }

  // Intercom & Customer Support
  if (
    tools.has('listIntercomConvos') ||
    tools.has('getIntercomConvo') ||
    tools.has('searchIntercomConvosTool') ||
    tools.has('replyToIntercomConvo') ||
    tools.has('createIntercomNote') ||
    tools.has('syncIntercomWorkspaceTool') ||
    lowerTools.some((t) => t.includes('intercom'))
  ) {
    if (isExecuting) {
      const activeTool = toolNames?.[toolNames.length - 1]
      if (activeTool === 'replyToIntercomConvo') return "Intercom: Sending reply to customer..."
      if (activeTool === 'createIntercomNote') return "Intercom: Logging internal support note..."
      if (activeTool === 'searchIntercomConvosTool') return "Intercom: Searching conversations..."
      if (activeTool === 'getIntercomConvo') return "Intercom: Reading conversation thread..."
      return "Scanning customer support conversations & blockers..."
    }
    return "Reviewed Intercom support tickets"
  }

  // Linear
  if (
    tools.has('searchLinearIssuesTool') ||
    tools.has('syncLinearWorkspaceTool') ||
    lowerTools.some((t) => t.includes('linear'))
  ) {
    return isExecuting ? "Searching Linear tickets..." : "Checked Linear tickets"
  }

  // Sentry
  if (
    tools.has('listSentryIssuesTool') ||
    tools.has('syncSentryWorkspaceTool') ||
    lowerTools.some((t) => t.includes('sentry'))
  ) {
    return isExecuting ? "Checking error logs..." : "Checked error logs"
  }

  // Slack
  if (
    tools.has('getSlackHistory') ||
    tools.has('sendSlackMessage') ||
    tools.has('deliverSlackBriefTool') ||
    lowerTools.some((t) => t.includes('slack'))
  ) {
    return isExecuting ? "Reviewing Slack context..." : "Reviewed Slack context"
  }

  // Notion / Airtable
  if (
    tools.has('searchNotionTool') ||
    tools.has('listAirtableBasesTool') ||
    lowerTools.some((t) => t.includes('notion') || t.includes('airtable'))
  ) {
    return isExecuting ? "Searching workspace knowledge..." : "Searched workspace knowledge"
  }

  // Connections / sync
  if (
    tools.has('inspectIntegrationConnectionsTool') ||
    lowerTools.some((t) => t.includes('sync') || t.includes('connection'))
  ) {
    return isExecuting ? "Verifying active connections..." : "Verified active connections"
  }

  return isExecuting ? "Executing requested workflow" : "Completed requested workflow"
}

/**
 * The batch header label.
 *
 * Dynamically reflects the primary domain action being performed (e.g. web search,
 * calendar, billing, inbox) with step counts when completed.
 */
export function describeReasoningBatch(state: ReasoningBatchState): ReasoningBatchLabel {
  if (state.isExecuting) {
    const baseTitle = getBatchActionTitle(state.toolNames, true)
    return { text: baseTitle, isUnfulfilled: false }
  }

  if (state.announcedActionMismatch) {
    return { text: "Announced action was not executed", isUnfulfilled: true }
  }

  const baseTitle = getBatchActionTitle(state.toolNames, false)

  if (state.stepsCount === 0) {
    return { text: "Executive reasoning & analysis", isUnfulfilled: false }
  }

  const stepSuffix = `(${state.stepsCount} step${state.stepsCount === 1 ? '' : 's'})`

  return {
    text: `${baseTitle} ${stepSuffix}`,
    isUnfulfilled: false,
  }
}

export function AgentReasoningBatch({
  children,
  stepsCount = 1,
  isExecuting = false,
  announcedActionMismatch = false,
  toolNames,
}: {
  children: React.ReactNode
  stepsCount?: number
  isExecuting?: boolean
  announcedActionMismatch?: boolean
  toolNames?: string[]
}) {
  const label = describeReasoningBatch({ isExecuting, stepsCount, announcedActionMismatch, toolNames })
  // Always open — thinking and tool summary should remain visible
  const [isOpen, setIsOpen] = React.useState(true)

  React.useEffect(() => {
    if (isExecuting && !isOpen) setIsOpen(true)
  }, [isExecuting, isOpen])

  return (
    <div className="mb-4 mt-2 ml-0">
      {/* Sleek single line header with arrow — NO heavy gray box border */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 text-[13px] font-medium transition-colors group select-none py-1",
          label.isUnfulfilled
            ? "text-amber-400/90 hover:text-amber-300"
            : "text-neutral-400 hover:text-neutral-200"
        )}
      >
        <span>{label.text}</span>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Thin vertical timeline thread */}
            <div className="mt-2 ml-2 pl-4 border-l border-neutral-300 dark:border-neutral-800/80 flex flex-col gap-3 py-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TimelineNode({
  title,
  icon,
  isCompleted,
  isLoading,
  children,
  className,
  defaultOpen,
  autoCollapse = true,
}: TimelineNodeProps) {
  const [isOpen, setIsOpen] = React.useState(
    defaultOpen !== undefined
      ? defaultOpen
      : (!isCompleted || Boolean(isLoading))
  )
  const hasAutoCollapsedRef = React.useRef(false)

  React.useEffect(() => {
    if (isLoading) {
      setIsOpen(true)
      hasAutoCollapsedRef.current = false
    } else if (isCompleted && autoCollapse && !hasAutoCollapsedRef.current) {
      hasAutoCollapsedRef.current = true
      const timer = setTimeout(() => setIsOpen(false), 1400)
      return () => clearTimeout(timer)
    }
  }, [isLoading, isCompleted, autoCollapse])

  return (
    <div className={cn("relative flex flex-col group", className)}>
      {/* Step Header with Collapsible Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 relative z-10 py-0.5 text-left group/btn cursor-pointer select-none"
      >
        {isLoading ? (
          <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
            <Loader2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 animate-spin" />
          </div>
        ) : icon ? (
          <div className="relative flex items-center justify-center w-4 h-4 shrink-0 text-neutral-600 dark:text-neutral-300">
            {icon}
          </div>
        ) : null}

        <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300 group-hover/btn:text-neutral-950 dark:group-hover/btn:text-white transition-colors flex items-center gap-1.5">
          {title}
        </span>

        {children && (
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 group-hover/btn:text-neutral-700 dark:group-hover/btn:text-neutral-300 transition-transform duration-200 ml-0.5",
              isOpen && "rotate-90"
            )}
          />
        )}
      </button>

      {/* Child Content (Result summaries, alerts, approval cards) */}
      <AnimatePresence initial={false}>
        {isOpen && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={cn("pt-1", icon || isLoading ? "pl-6" : "pl-0")}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function sanitizeReasoningText(raw: string): string {
  if (!raw) return ""

  const clean = raw
    .replace(/<\/?think>/gi, '')
    // Strip API keys, tokens, and secrets
    .replace(/\b(?:sk|rk|pk|tvly|phc|phx|whsec)_[a-zA-Z0-9_\-]{8,}\b/gi, '[REDACTED_KEY]')
    .replace(/\bBearer\s+[a-zA-Z0-9_\-\.]{16,}\b/gi, 'Bearer [REDACTED]')
    .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
    .replace(/ey[a-zA-Z0-9_-]{10,}\.ey[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]')
    // Strip database URLs or connection strings
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URI]')
    // Strip tool call signatures with raw parameters (e.g. `requestMoreTools(...)`, `getMyInbox(...)`)
    .replace(/\b[a-zA-Z0-9_]+Tool\s*\([^)]*\)/gi, 'requested tool')
    .replace(/\b(?:requestMoreTools|getAllAccounts|getMyInbox|getGmailThreadsForAccount|getStripeAccountState|getPostHogEvents|getAccountDetails|listCalendarEventsTool|createCalendarEventTool)\s*\([^)]*\)/gi, (match) => {
      if (match.includes('Calendar')) return 'calendar schedule'
      if (match.includes('Inbox') || match.includes('Gmail')) return 'email inbox'
      if (match.includes('Stripe') || match.includes('Account')) return 'billing data'
      if (match.includes('PostHog')) return 'product analytics'
      if (match.includes('Search') || match.includes('web')) return 'web search'
      return 'connected tools'
    })
    // Strip raw JSON blobs, schemas, or credential fields
    .replace(/\{[^{}]*(?:domain|workspaceId|apiKey|secret|userId|personaId|client_secret|password)[^{}]*\}/gi, '')
    .replace(/\b(?:workspace_id|user_id|persona_id|api_key|token|auth_token|client_secret|database_url)[\w\s:=]+(?:\n|$)/gi, '')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return clean
}

export function MonologueBlock({
  text,
  label,
  isExecuting = false,
}: {
  text: string
  label?: string
  isExecuting?: boolean
}) {
  const sanitizedText = React.useMemo(() => {
    if (!text || !text.trim()) return ""
    return sanitizeReasoningText(text)
  }, [text])

  const hasText = Boolean(sanitizedText)
  const [expanded, setExpanded] = React.useState(isExecuting && hasText)
  const prevExecutingRef = React.useRef(isExecuting)
  const prevHasTextRef = React.useRef(hasText)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const startTimeRef = React.useRef(Date.now())
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)
  const [durationSeconds, setDurationSeconds] = React.useState<number | null>(null)

  // Auto-scroll internally inside the thinking box as new tokens stream in
  React.useEffect(() => {
    if (expanded && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [sanitizedText, expanded])

  // When reasoning text first arrives while executing, expand smoothly into view
  React.useEffect(() => {
    if (!prevHasTextRef.current && hasText && isExecuting) {
      setExpanded(true)
    }
    prevHasTextRef.current = hasText
  }, [hasText, isExecuting])

  // When execution finishes (isExecuting goes from true -> false), smoothly auto-collapse (compress) the drawer
  React.useEffect(() => {
    if (prevExecutingRef.current && !isExecuting) {
      const timer = setTimeout(() => {
        setExpanded(false)
      }, 400)
      return () => clearTimeout(timer)
    }
    prevExecutingRef.current = isExecuting
  }, [isExecuting])

  React.useEffect(() => {
    if (isExecuting) {
      const interval = setInterval(() => {
        const sec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
        setElapsedSeconds(sec)
      }, 500)
      return () => clearInterval(interval)
    } else {
      if (durationSeconds === null) {
        const finalSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
        setDurationSeconds(finalSec)
      }
    }
  }, [isExecuting, durationSeconds])

  // Phase 1: Initial prompt submission before thinking tokens arrive (first 4-5s)
  // Render clean non-expandable shimmering Thinking... text
  if (isExecuting && !hasText) {
    return (
      <div className="flex items-center gap-2 py-0.5 select-none">
        <span className="text-[13px] font-medium tracking-normal thinking-shimmer-text">
          Thinking...
        </span>
      </div>
    )
  }

  // Phase 2 & 3: Active thoughts in-flight or completed
  const displayDuration = durationSeconds ?? (elapsedSeconds > 0 ? elapsedSeconds : Math.max(1, Math.min(15, Math.round(sanitizedText.split(/\s+/).length / 25))))

  return (
    <div className="group text-[13px] text-neutral-400 font-normal leading-relaxed py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-left w-full cursor-pointer hover:text-neutral-300 transition-colors py-0.5 select-none"
      >
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 shrink-0 text-neutral-500 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        {label ? (
          <span className="font-medium text-neutral-400">{label}</span>
        ) : isExecuting ? (
          <span className="font-medium text-[13px] thinking-shimmer-text">
            Thinking ({elapsedSeconds}s)
          </span>
        ) : (
          <span className="font-medium text-[13px] text-neutral-400">
            Thought for {displayDuration}s
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden pl-5 pt-1.5"
          >
            <div
              ref={scrollContainerRef}
              className="max-h-[110px] overflow-y-auto custom-scrollbar pr-2 text-neutral-400/90 whitespace-pre-wrap leading-relaxed text-[12px] border-l border-white/10 pl-2.5"
            >
              {sanitizedText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function InlineQueryBlock({ query: _query }: { query?: string }) {
  // Raw function names (getMyInbox()) are hidden per user directive
  return null
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
  intercom: '/logos/intercom.svg',
}

function formatTextWithIntegrationLogos(raw: string): string {
  if (!raw) return raw
  return raw
    .replace(/(?:📅|🗓️)\s*(\*{0,2}Calendar\b\*{0,2})/gi, '![Google Calendar](/logos/google-calendar.svg) $1')
    .replace(/(?:📧|📨|📩|✉️)\s*(\*{0,2}Inbox\b\*{0,2}|\*{0,2}Email\b\*{0,2}|\*{0,2}Gmail\b\*{0,2})/gi, '![Gmail](/logos/gmail.svg) $1')
    .replace(/(?:💰|💳|💵|💸)\s*(\*{0,2}Billing\b\*{0,2}|\*{0,2}Stripe\b\*{0,2}|\*{0,2}Revenue\b\*{0,2})/gi, '![Stripe](/logos/stripe.svg) $1')
    .replace(/(?:💬|🗨️|👥)\s*(\*{0,2}Slack\b\*{0,2})/gi, '![Slack](/logos/slack.svg) $1')
    .replace(/(?:📊|📈|📉)\s*(\*{0,2}PostHog\b\*{0,2}|\*{0,2}Product Analytics\b\*{0,2})/gi, '![PostHog](/logos/posthog.svg) $1')
    .replace(/(?:📌|🎯)\s*(\*{0,2}Linear\b\*{0,2})/gi, '![Linear](/logos/linear.svg) $1')
    .replace(/(?:🚨|🐛|⚠️)\s*(\*{0,2}Sentry\b\*{0,2}|\*{0,2}Error Monitoring\b\*{0,2})/gi, '![Sentry](/logos/sentry-light.svg) $1')
    .replace(/(?:📝|📄|📚)\s*(\*{0,2}Notion\b\*{0,2}|\*{0,2}Knowledge Base\b\*{0,2})/gi, '![Notion](/logos/notion.svg) $1')
    .replace(/(?:🏢|🤝)\s*(\*{0,2}HubSpot\b\*{0,2}|\*{0,2}CRM\b\*{0,2})/gi, '![HubSpot](/logos/hubspot.svg) $1')
    .replace(/(?:🎧|🎫)\s*(\*{0,2}Intercom\b\*{0,2}|\*{0,2}Support\b\*{0,2})/gi, '![Intercom](/logos/intercom.svg) $1')
    .replace(/(?:!\[Likely Root Cause\]\(\/logos\/lightbulb\.svg\)|💡)?\s*\*{0,2}Likely Root Cause:?\*{0,2}/gi, '![Likely Root Cause](/logos/lightbulb.svg) **Likely Root Cause:**')
    .replace(/(?:!\[Recommended Action\]\(\/logos\/brain\.svg\)|🧠)?\s*\*{0,2}Recommended Action:?\*{0,2}/gi, '![Recommended Action](/logos/brain.svg) **Recommended Action:**')
    .replace(/🧠\s*(\*{2}[^*]+\*{2})/g, '![Action](/logos/brain.svg) $1')
    .replace(/💡\s*(\*{2}[^*]+\*{2})/g, '![Insight](/logos/lightbulb.svg) $1')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Status:)\*{0,2}/gi, '\n- **Status:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(MRR at Risk:)\*{0,2}/gi, '\n- **MRR at Risk:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Billing:)\*{0,2}/gi, '\n- **Billing:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Product Usage:)\*{0,2}/gi, '\n- **Product Usage:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Support:)\*{0,2}/gi, '\n- **Support:**')
    .replace(/(?:^|\n)\s*\*{0,2}(Recovery Case Status)\*{0,2}\s*(?:\n|$)/gi, '\n\n#### Recovery Case Status\n')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Case ID:)\*{0,2}/gi, '\n- **Case ID:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Outreach:)\*{0,2}/gi, '\n- **Outreach:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Monitoring:)\*{0,2}/gi, '\n- **Monitoring:**')
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(Next move:)\*{0,2}/gi, '\n\n**Next move:**')
}

export function AgentSpeechBlock({
  text,
  isStreaming = false,
}: {
  text: string
  isStreaming?: boolean
}) {
  const [displayedLength, setDisplayedLength] = React.useState(isStreaming ? 0 : text.length)
  const animRef = React.useRef<number | null>(null)
  const textRef = React.useRef(text)
  textRef.current = text

  React.useEffect(() => {
    if (!isStreaming) {
      setDisplayedLength(text.length)
      return
    }

    const step = () => {
      const target = textRef.current.length
      setDisplayedLength((prev) => {
        if (prev < target) {
          // Fast, silky smooth progressive easing (2-5 characters per frame)
          const delta = Math.max(2, Math.ceil((target - prev) * 0.4))
          const next = Math.min(target, prev + delta)
          if (next < target) {
            animRef.current = requestAnimationFrame(step)
          }
          return next
        }
        return prev
      })
    }

    animRef.current = requestAnimationFrame(step)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [text, isStreaming])

  const currentText = isStreaming ? (displayedLength > 0 ? text.slice(0, displayedLength) : text) : text

  const detectMissingIntegrations = React.useMemo(() => {
    if (!text || !text.trim()) return []

    const PROVIDERS_CONFIG = [
      { name: 'Intercom', slug: 'intercom', logoUrl: PROVIDER_LOGOS.intercom },
      { name: 'Gmail', slug: 'gmail', logoUrl: PROVIDER_LOGOS.gmail },
      { name: 'Slack', slug: 'slack', logoUrl: PROVIDER_LOGOS.slack },
      { name: 'Stripe', slug: 'stripe', logoUrl: PROVIDER_LOGOS.stripe },
      { name: 'PostHog', slug: 'posthog', logoUrl: PROVIDER_LOGOS.posthog },
      { name: 'Linear', slug: 'linear', logoUrl: PROVIDER_LOGOS.linear },
      { name: 'Sentry', slug: 'sentry', logoUrl: PROVIDER_LOGOS.sentry },
      { name: 'HubSpot', slug: 'hubspot', logoUrl: PROVIDER_LOGOS.hubspot },
      { name: 'Notion', slug: 'notion', logoUrl: PROVIDER_LOGOS.notion },
    ]

    const found: Array<{ name: string; slug: string; logoUrl?: string }> = []

    for (const p of PROVIDERS_CONFIG) {
      // Must explicitly state that the integration itself is not configured or disconnected in settings
      const disconnectedPatterns = [
        new RegExp(`(?:your|the|workspace)?\\s*\\b${p.slug}\\b\\s+(?:integration\\s+)?(?:is\\s+)?(?:not connected|unconnected|not configured|missing credentials|needs to be connected)`, 'i'),
        new RegExp(`(?:please\\s+)?connect\\s+(?:your\\s+)?\\b${p.slug}\\b\\s+(?:integration|account|in settings)`, 'i'),
      ]

      const isExplicitlyDisconnected = disconnectedPatterns.some((rgx) => rgx.test(text))

      // If the text mentions live metrics, events, usage, subscriptions, or invoices, it is ACTIVE
      const isFoundOrActive =
        new RegExp(`(?:found|active|connected|synced|past due|events|invoices|telemetry|usage)\\s+[^.\\n]*?\\b${p.slug}\\b`, 'i').test(text) ||
        new RegExp(`\\b${p.slug}\\b[^.\\n]*?(?:found|active|synced|past due|live|events|telemetry|usage)`, 'i').test(text) ||
        (p.slug === 'posthog' && /usage|events|telemetry|signals/i.test(text) && !/posthog integration is not connected/i.test(text)) ||
        (p.slug === 'stripe' && /mrr|invoices|billing|revenue/i.test(text) && !/stripe integration is not connected/i.test(text))

      if (isExplicitlyDisconnected && !isFoundOrActive) {
        found.push({ name: p.name, slug: p.slug, logoUrl: p.logoUrl })
      }
    }

    return found
  }, [text])

  const formattedText = React.useMemo(() => formatTextWithIntegrationLogos(currentText), [currentText])

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="w-full text-[13.5px] text-neutral-300 font-normal leading-relaxed mt-1 mb-4 pr-4 max-w-prose"
    >
      <div className="prose prose-invert prose-sm prose-p:text-neutral-300 prose-p:leading-relaxed prose-p:mb-3.5 prose-hr:border-none prose-hr:my-2.5 prose-pre:bg-[#14141A] prose-pre:border prose-pre:border-white/10 prose-ul:mb-3.5 prose-ul:space-y-2 prose-ul:list-disc prose-ul:pl-5 prose-ol:mb-3.5 prose-ol:space-y-2.5 prose-ol:list-decimal prose-ol:pl-5 prose-li:text-neutral-200 prose-li:leading-relaxed prose-h3:text-[14px] prose-h3:font-semibold prose-h3:text-white prose-h3:mt-4 prose-h3:mb-2 prose-h4:text-[12px] prose-h4:font-semibold prose-h4:uppercase prose-h4:tracking-wider prose-h4:text-neutral-400 prose-strong:font-semibold prose-strong:text-white">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt ?? ''}
                className="inline-block w-4 h-4 object-contain align-text-bottom mx-1 shrink-0"
              />
            ),
            hr: () => <div className="h-3.5 w-full" />,
            strong: ({ children }) => (
              <strong className="font-semibold text-white tracking-tight">
                {children}
              </strong>
            ),
            h3: ({ children }) => (
              <h3 className="text-[13.5px] font-semibold text-white mt-3.5 mb-2 tracking-tight border-b border-white/5 pb-1">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-neutral-400 mt-3.5 mb-1.5">
                {children}
              </h4>
            ),
          }}
        >
          {formattedText}
        </ReactMarkdown>
      </div>

      {detectMissingIntegrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-1">
          {detectMissingIntegrations.map((item) => (
            <a
              key={item.slug}
              href="/dashboard/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11.5px] font-medium text-neutral-200 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 hover:border-neutral-500 rounded-full transition-all duration-150 shadow-sm"
            >
              {item.logoUrl && (
                <img src={item.logoUrl} alt={item.name} className="w-3.5 h-3.5 object-contain shrink-0" />
              )}
              <span>Connect</span>
              <ChevronRight className="w-3 h-3 text-neutral-400" />
            </a>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export function AgentApprovalBlock({
  title,
  description,
  requestId,
  toolName,
  toolInput,
  onApproved,
  onRejected,
}: {
  title: string
  description?: string
  requestId?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  onApproved?: () => void
  onRejected?: () => void
}) {
  const [status, setStatus] = React.useState<'idle' | 'approving' | 'approved' | 'rejected' | 'failed'>('idle')
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const handleApprove = async () => {
    setStatus('approving')
    setErrorMsg(null)
    try {
      if (requestId) {
        await fetch('/api/agent/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, action: 'approve', autoExecute: true }),
        }).catch((err) => console.warn('[AgentApprovalBlock] Approval API warning:', err))
      } else {
        await new Promise((r) => setTimeout(r, 400))
      }
      setStatus('approved')
      if (onApproved) {
        onApproved()
      }
    } catch (err: any) {
      console.error('[AgentApprovalBlock] Error approving:', err)
      setErrorMsg(err?.message || 'Approval failed')
      setStatus('failed')
    }
  }

  const handleReject = async () => {
    setStatus('rejected')
    try {
      if (requestId) {
        await fetch('/api/agent/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, action: 'reject' }),
        }).catch(() => {})
      }
      if (onRejected) {
        onRejected()
      }
    } catch {
      // Ignore
    }
  }

  if (status === 'approved') {
    return (
      <div className="mt-2 mb-2 flex items-center justify-between gap-4 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-[18px] h-[18px] rounded-sm bg-[#10B981]/20 border border-[#10B981]/40 shrink-0">
            <Check className="w-3 h-3 text-[#10B981]" strokeWidth={3} />
          </div>
          <span className="text-[13px] font-medium text-neutral-200">Execution approved & executing</span>
        </div>
        <div className="text-[12px] text-[#10B981] font-mono">Executing now...</div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="mt-2 mb-2 flex items-center justify-between gap-4 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-neutral-400">Action cancelled by founder</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 mb-2 flex flex-col gap-1.5 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[14px]">🧑‍💻</span>
          <span className="text-[13px] font-medium text-neutral-200">{title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReject}
            className="px-3 py-1 text-[12px] font-medium text-neutral-400 hover:text-white hover:bg-[#262626] rounded-sm transition-colors"
          >
            Reject
          </button>
          <button 
            type="button"
            onClick={handleApprove}
            disabled={status === 'approving'}
            className="px-3 py-1 min-w-[80px] justify-center text-[12px] font-medium bg-[#0055FF] text-white hover:bg-[#0048D9] rounded-sm transition-colors flex items-center gap-1.5"
          >
            {status === 'approving' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                Approve
                <Check className="w-3 h-3" strokeWidth={3} />
              </>
            )}
          </button>
        </div>
      </div>
      {description && <p className="text-[12px] text-neutral-400 pl-7">{description}</p>}
      {errorMsg && <p className="text-[12px] text-red-400 pl-7">{errorMsg}</p>}
    </div>
  )
}

export interface ExecutionTask {
  id: string
  text: string
  status: 'pending' | 'completed' | 'skipped'
}

export function ExecutionPlanList({ tasks }: { tasks: ExecutionTask[] }) {
  return (
    <div className="flex flex-col gap-2.5 mt-2 mb-3 pl-1">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-start gap-3 group">
          <div className="mt-[3px] shrink-0">
            {task.status === 'completed' ? (
              <div className="w-[14px] h-[14px] rounded-full bg-neutral-800/50 border border-neutral-600 flex items-center justify-center">
                <Check className="w-[8px] h-[8px] text-neutral-400" strokeWidth={3.5} />
              </div>
            ) : task.status === 'skipped' ? (
              <div className="w-[14px] h-[14px] rounded-full flex items-center justify-center border border-neutral-600">
                <div className="w-1.5 h-px bg-neutral-500" />
              </div>
            ) : (
              <div className="w-[14px] h-[14px] rounded-full border border-neutral-600/70 shadow-inner" />
            )}
          </div>
          <span className={cn(
            "text-[13.5px] leading-relaxed font-mono",
            task.status === 'completed' ? "text-neutral-500 line-through decoration-neutral-600/50" : "text-neutral-300"
          )}>
            {task.text}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MiniResultCard({
  icon,
  title,
  subtitle,
  index = 0,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8, y: 3 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: 0.22,
        delay: index * 0.05, // Fast 50ms stagger per item — Railway agentic process speed
        ease: [0.16, 1, 0.3, 1],
      }}
      className="flex items-center gap-2.5 py-1 px-1.5 rounded-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors max-w-xl my-0.5"
    >
      {icon && <div className="shrink-0 text-neutral-500 dark:text-neutral-400 mt-0.5">{icon}</div>}
      <div className="flex flex-col min-w-0">
        <div className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200 truncate leading-snug">{title}</div>
        {subtitle && <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400 truncate leading-tight">{subtitle}</div>}
      </div>
    </motion.div>
  )
}
