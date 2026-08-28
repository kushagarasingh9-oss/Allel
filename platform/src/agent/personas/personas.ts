/**
 * Agent Personas
 *
 * Defines the specialized agent personas available in the chat interface.
 * Each persona has a unique system prompt extension, a curated set of
 * active tool names, and display metadata.
 *
 * IMPORTANT: Tool names in `activeTools` MUST exactly match the keys in
 * ALL_TOOLS (exported from agent.ts). If a tool name is misspelled,
 * it will be silently excluded and the agent won't have access to it.
 *
 * To add a new persona:
 * 1. Add an entry to PERSONAS below
 * 2. Set the tool names from ALL_TOOLS that this persona should access
 * 3. Write a focused system instruction extension
 */

// Allel unified system instructions — separated for maintainability
import { COFOUNDER_INSTRUCTIONS } from '@/agent/personas/allel-instructions'
import { HENRY_INSTRUCTIONS } from '@/agent/personas/henry-instructions'
import { SARAH_INSTRUCTIONS } from '@/agent/personas/sarah-instructions'

export type PersonaId = 'alex' | 'henry' | 'sarah'

export interface AgentPersona {
  /** Unique identifier used in API routing and state */
  id: PersonaId
  /** Display name shown in the chat UI */
  name: string
  /** Short role description shown as a badge */
  role: string
  /** Dynamic placeholder text for the chat input */
  placeholder: string
  /** Additional system instructions appended to the base AGENT_INSTRUCTIONS.
   *  If undefined, only the base instructions are used (generalist). */
  systemInstructionSuffix?: string
  /** List of tool names this persona can access.
   *  If undefined, the persona gets ALL tools (generalist). */
  activeTools?: string[]
}

/** All valid persona IDs — used for input validation */
export const VALID_PERSONA_IDS: ReadonlySet<string> = new Set(['alex', 'henry', 'sarah'])

export const PERSONAS: AgentPersona[] = [
  // ─────────────────────────────────────────────
  // Allel — Unified agent (all tools, all expertise)
  // Internal ID remains 'alex' for backward compatibility
  // ─────────────────────────────────────────────
  {
    id: 'alex',
    name: 'Allel',
    role: 'AI Co-founder',
    placeholder: 'Ask about accounts, churn risk, growth, drafts, or anything...',
    systemInstructionSuffix: COFOUNDER_INSTRUCTIONS,
    // Undefined means every registered backend tool is available. Individual
    // external writes remain founder-approved by agent.ts; do not reintroduce
    // a curated list here or connected providers silently disappear from chat.
  },

  // ──────────────────────────────────────────────────────────
  // Henry — Head of Growth (acquisition, activation, distribution)
  // ──────────────────────────────────────────────────────────
  {
    id: 'henry',
    name: 'Henry',
    role: 'Head of Growth',
    placeholder: 'Ask Henry about growth, experiments, channels, messaging...',
    systemInstructionSuffix: HENRY_INSTRUCTIONS,
    activeTools: [
      // Web Research — Tavily AI (Henry's superpower)
      'webSearchTool',
      'webExtractTool',
      'webCrawlTool',
      'webMapTool',
      // HubSpot — read pipeline and account context without mutating CRM directly
      'searchHubSpotContactsTool',
      'getHubSpotContactTool',
      'searchHubSpotCompaniesTool',
      'getHubSpotCompanyTool',
      'searchHubSpotDealsTool',
      'listHubSpotOwnersTool',
      'listHubSpotPipelinesTool',
      // Intercom — inspect conversation state without replying inline
      'listIntercomConvos',
      'getIntercomConvo',
      'searchIntercomConvosTool',
      'searchIntercomContactsTool',
      // Gmail — read context and draft, but do not send directly.
      // Thread detail is required to resolve a real sender address; without it
      // the agent can only see a truncated display name and will ask the
      // founder for an address Gmail already returned.
      'getMyInbox',
      'getGmailThreadsForAccount',
      'getGmailThreadDetailTool',
      // Calendar — read-only. Growth work needs to see availability and
      // existing commitments to time campaigns and follow-ups, but scheduling,
      // moving, and cancelling stay with the founder and Sarah. Read tools only
      // is a deliberate posture, not an oversight.
      'listCalendarEventsTool',
      'getCalendarEventTool',
      'searchCalendarEventsTool',
      'checkCalendarFreeBusy',
      // Connection introspection — the runtime contract requires verifying a
      // provider's real state before telling the founder anything is broken.
      'inspectIntegrationConnectionsTool',
      // Drafts — creating and managing email drafts
      'generateFollowUpDraft',
      'getExistingDrafts',
      'rejectDraft',
      'updateDraftContent',
      // Slack — internal team comms
      'searchSlack',
      'getSlackHistory',
      'reactToSlackMessage',
      // Notion — campaign docs and planning
      'searchNotionTool',
      'getNotionPageTool',
      'queryNotionDatabaseTool',
      // Account context (read-only — Henry can look up accounts but doesn't own risk)
      'getAccountDetails',
      'getAccountMemory',
      'getAllAccounts',
      'resolveAccountByContact',
      'getAccountTimeline',
    ],
  },

  // ──────────────────────────────────────────────────────────
  // Sarah — Head of Retention (churn, billing, rescue)
  // ──────────────────────────────────────────────────────────
  {
    id: 'sarah',
    name: 'Sarah',
    role: 'Head of Retention',
    placeholder: 'Ask Sarah about churn, billing, at-risk accounts...',
    systemInstructionSuffix: SARAH_INSTRUCTIONS,
    activeTools: [
      // Stripe — billing, subscriptions, revenue
      'searchStripeCustomersTool',
      'getStripeCustomerDetail',
      'listStripeInvoicesTool',
      'getUpcomingStripeInvoice',
      'getStripeSubscriptionDetail',
      'cancelStripeSubscriptionTool',
      'refundStripeCharge',
      'applyStripeCoupon',
      'getStripeBalanceTool',
      'listStripeDisputesTool',
      'getStripeAccountState',
      // PostHog — usage analytics, engagement
      'searchPostHogPersons',
      'getPostHogEvents',
      'listPostHogInsights',
      'listPostHogCohorts',
      'getPostHogEventDefinitions',
      'createPostHogAnnotation',
      'listPostHogFeatureFlags',
      'togglePostHogFeatureFlag',
      'getPostHogAccountUsage',
      // Recovery Pipeline — full case management
      'getRecoveryCases',
      'getRecoveryCaseDetail',
      'getRecoveryMetrics',
      'getAccountRecoveryStatus',
      'getRecoveryCaseTimeline',
      'getRecoveryCaseScoreBreakdown',
      'listRecoveryCaseDrafts',
      'getRecoveryCaseOutcomes',
      'listRecoveryCasesBySeverity',
      'suppressRecoveryCase',
      'updateRecoveryCaseNote',
      // Account management — risk, signals, timeline
      'getAccountDetails',
      'getAccountMemory',
      'getAllAccounts',
      'getRecentSignals',
      'resolveAccountByContact',
      'updateAccountRisk',
      'createSignal',
      'resolveSignal',
      'addTimelineEvent',
      'getChurnScoreHistory',
      'getAccountTimeline',
      'updateAccountInfo',
      'addAccountNote',
      'archiveAccount',
      'addAccountContact',
      'updateAccountContact',
      'createRescueDiscountTool',
      // Drafts & Gmail — rescue emails
      'generateFollowUpDraft',
      'getExistingDrafts',
      'rejectDraft',
      'updateDraftContent',
      'getMyInbox',
      'getGmailThreadsForAccount',
      'getGmailThreadDetailTool',
      'sendGmailReply',
      'composeNewEmail',
      // Connection introspection — required before claiming a provider is down.
      'inspectIntegrationConnectionsTool',
      // Slack — internal escalation
      'sendSlackMessage',
      'searchSlack',
      'getSlackHistory',
      'replyInSlackThread',
      'deliverSlackBriefTool',
      // Web Research — Tavily AI (for customer/market intelligence)
      'webSearchTool',
      'webExtractTool',
      // Calendar — customer check-in calls. Full read/write: booking a rescue
      // call is useless if the same persona cannot move or cancel it when the
      // account's situation changes.
      'listCalendarEventsTool',
      'getCalendarEventTool',
      'createCalendarEventTool',
      'updateCalendarEventTool',
      'deleteCalendarEventTool',
      'searchCalendarEventsTool',
      'checkCalendarFreeBusy',
      'listCalendarsTool',
    ],
  },
]

export function getPersona(id: string): AgentPersona {
  return PERSONAS.find(p => p.id === id) || PERSONAS[0]
}
