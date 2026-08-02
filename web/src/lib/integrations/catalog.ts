export type IntegrationProvider =
  | 'stripe'
  | 'posthog'
  | 'gmail'
  | 'intercom'
  | 'hubspot'
  | 'slack'
  | 'sentry'
  | 'linear'
  | 'notion'
  | 'airtable'
  | 'google_calendar'
  | 'jira'
  | 'github'
  | 'zendesk'
  | 'salesforce'
  | 'supabase'
  | 'google_docs'
  | 'google_drive'

export type IntegrationCapability = 'syncable' | 'tool_only' | 'planned'
export type IntegrationConnectMethod = 'pipedream' | 'manual' | 'coming_soon'

export type IntegrationDefinition = {
  provider: IntegrationProvider
  label: string
  capability: IntegrationCapability
  core: boolean
  appSlug?: string
  description: string
  disconnectedValue: string
  comingSoonValue: string
  connectMethod: IntegrationConnectMethod
  /** What the founder gains by connecting this provider */
  unlockDescription: string
}

export const INTEGRATION_DEFINITIONS: readonly IntegrationDefinition[] = [
  {
    provider: 'stripe',
    label: 'Stripe',
    capability: 'syncable',
    core: true,
    appSlug: 'stripe',
    description: 'Billing, renewals, failed payments, and plan changes',
    disconnectedValue: 'Connect Stripe',
    comingSoonValue: 'Billing ingestion',
    connectMethod: 'pipedream',
    unlockDescription: 'Enables billing risk detection, renewal tracking, failed payment alerts, and revenue-based account scoring. Your agent can offer rescue discounts and catch churn before it happens.',
  },
  {
    provider: 'posthog',
    label: 'PostHog',
    capability: 'syncable',
    core: true,
    appSlug: 'posthog',
    description: 'Usage trends, activation milestones, and feature engagement',
    disconnectedValue: 'Connect PostHog',
    comingSoonValue: 'Usage ingestion',
    connectMethod: 'pipedream',
    unlockDescription: 'Enables usage-based risk signals: declining engagement, stalled onboarding, and feature drop-off. Your agent can spot accounts going quiet before they churn.',
  },
  {
    provider: 'gmail',
    label: 'Gmail',
    capability: 'syncable',
    core: true,
    appSlug: 'gmail',
    description: 'Founder follow-up history, drafts, and approval flow',
    disconnectedValue: 'Connect Gmail OAuth',
    comingSoonValue: 'Email sync',
    connectMethod: 'pipedream',
    unlockDescription: 'Enables email thread tracking, auto-drafted follow-ups, and reply detection. Your agent can draft check-in emails and surface threads that need your attention.',
  },
  {
    provider: 'intercom',
    label: 'Intercom',
    capability: 'syncable',
    core: false,
    appSlug: 'intercom',
    description: 'Support context, frustration signals, and unresolved issues',
    disconnectedValue: 'Connect Intercom',
    comingSoonValue: 'Support signals',
    connectMethod: 'pipedream',
    unlockDescription: 'Enables support ticket analysis, frustration detection, and unresolved issue tracking. Your agent can flag support-heavy accounts and suggest proactive outreach.',
  },
  {
    provider: 'hubspot',
    label: 'HubSpot',
    capability: 'syncable',
    core: false,
    appSlug: 'hubspot',
    description: 'CRM companies, contacts, and lifecycle context',
    disconnectedValue: 'Connect HubSpot',
    comingSoonValue: 'CRM enrichment',
    connectMethod: 'pipedream',
    unlockDescription: 'Enriches account profiles with CRM data: company size, lifecycle stage, and deal context. Gives your agent fuller context when drafting outreach.',
  },
  {
    provider: 'slack',
    label: 'Slack',
    capability: 'syncable',
    core: false,
    appSlug: 'slack',
    description: 'Daily brief delivery and urgent churn alerts',
    disconnectedValue: 'Connect Slack',
    comingSoonValue: 'Brief delivery',
    connectMethod: 'pipedream',
    unlockDescription: 'Delivers your daily brief to Slack and sends urgent churn alerts. Your agent can also post updates and summaries to channels.',
  },
  {
    provider: 'sentry',
    label: 'Sentry',
    capability: 'syncable',
    core: false,
    appSlug: 'sentry',
    description: 'Production issue signals that may explain churn risk',
    disconnectedValue: 'Connect Sentry',
    comingSoonValue: 'Issue monitoring',
    connectMethod: 'pipedream',
    unlockDescription: 'Surfaces production errors that correlate with account churn. Your agent can connect bug reports to at-risk accounts automatically.',
  },
  {
    provider: 'linear',
    label: 'Linear',
    capability: 'syncable',
    core: false,
    appSlug: 'linear_app',
    description: 'Bug and issue tracker context tied back to customer risk',
    disconnectedValue: 'Connect Linear',
    comingSoonValue: 'Issue tracker sync',
    connectMethod: 'pipedream',
    unlockDescription: 'Connects engineering issues to customer accounts. Your agent can reference open bugs and feature requests when analyzing churn risk.',
  },
  {
    provider: 'airtable',
    label: 'Airtable',
    capability: 'tool_only',
    core: false,
    appSlug: 'airtable',
    description: 'Search, read, and update Airtable records from agent tools',
    disconnectedValue: 'Connect Airtable',
    comingSoonValue: 'Tool-only workspace access',
    connectMethod: 'pipedream',
    unlockDescription: 'Your agent can search, read, and update Airtable records on demand. Useful for custom trackers, lists, and lightweight databases you already use.',
  },
  {
    provider: 'google_calendar',
    label: 'Google Calendar',
    capability: 'tool_only',
    core: false,
    appSlug: 'google_calendar',
    description: 'Meeting follow-ups, reminders, and founder agenda prep',
    disconnectedValue: 'Connect Google Calendar',
    comingSoonValue: 'Scheduling',
    connectMethod: 'pipedream',
    unlockDescription: 'Your agent can check your calendar, prep for meetings, and suggest follow-ups based on upcoming calls with customers.',
  },
  {
    provider: 'notion',
    label: 'Notion',
    capability: 'tool_only',
    core: false,
    appSlug: 'notion',
    description: 'Search, create, and manage pages, docs, and lightweight planning',
    disconnectedValue: 'Connect Notion',
    comingSoonValue: 'Tool-only workspace access',
    connectMethod: 'pipedream',
    unlockDescription: 'Your agent can search, create, and edit Notion pages on demand. Useful for documenting decisions, meeting notes, or account plans.',
  },
  {
    provider: 'jira',
    label: 'Jira',
    capability: 'planned',
    core: false,
    appSlug: 'jira',
    description: 'Issue and engineering workflow context',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will connect engineering issues and sprints to customer accounts for deeper churn analysis.',
  },
  {
    provider: 'github',
    label: 'GitHub',
    capability: 'planned',
    core: false,
    appSlug: 'github',
    description: 'Repositories, issues, and pull requests',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will surface repository activity, issues, and PRs in your agent context.',
  },
  {
    provider: 'zendesk',
    label: 'Zendesk',
    capability: 'planned',
    core: false,
    appSlug: 'zendesk',
    description: 'Support conversations and ticket backlog',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will bring support ticket context and customer satisfaction signals into your retention workflow.',
  },
  {
    provider: 'salesforce',
    label: 'Salesforce',
    capability: 'planned',
    core: false,
    appSlug: 'salesforce',
    description: 'Enterprise CRM accounts and opportunities',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will enrich account data with enterprise CRM context: opportunities, pipeline stages, and deal history.',
  },
  {
    provider: 'supabase',
    label: 'Supabase',
    capability: 'planned',
    core: false,
    appSlug: 'supabase',
    description: 'Database tables, users, and workspace records',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will let your agent query your Supabase database for custom user and workspace data.',
  },
  {
    provider: 'google_docs',
    label: 'Google Docs',
    capability: 'planned',
    core: false,
    appSlug: 'google_docs',
    description: 'Docs and comments for collaborative drafting',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will enable collaborative document creation and editing through your agent.',
  },
  {
    provider: 'google_drive',
    label: 'Google Drive',
    capability: 'planned',
    core: false,
    appSlug: 'google_drive',
    description: 'Drive files and folder search',
    disconnectedValue: 'Coming soon',
    comingSoonValue: 'Planned integration',
    connectMethod: 'coming_soon',
    unlockDescription: 'Will let your agent search and reference files in your Google Drive.',
  },
] as const

export const INTEGRATION_DEFINITION_MAP = new Map(
  INTEGRATION_DEFINITIONS.map((definition) => [definition.provider, definition])
)

export const KNOWN_INTEGRATION_PROVIDERS = new Set(
  INTEGRATION_DEFINITIONS.map((definition) => definition.provider)
)

export const SYNCABLE_PROVIDERS = new Set(
  INTEGRATION_DEFINITIONS.filter(
    (definition) => definition.capability === 'syncable'
  ).map((definition) => definition.provider)
)

export const TOOL_ONLY_PROVIDERS = new Set(
  INTEGRATION_DEFINITIONS.filter(
    (definition) => definition.capability === 'tool_only'
  ).map((definition) => definition.provider)
)

export const PLANNED_PROVIDERS = new Set(
  INTEGRATION_DEFINITIONS.filter(
    (definition) => definition.capability === 'planned'
  ).map((definition) => definition.provider)
)

export const MANAGEABLE_INTEGRATION_PROVIDERS = new Set([
  ...SYNCABLE_PROVIDERS,
  ...TOOL_ONLY_PROVIDERS,
  ...PLANNED_PROVIDERS,
])

export function isKnownIntegrationProvider(
  provider: string
): provider is IntegrationProvider {
  return KNOWN_INTEGRATION_PROVIDERS.has(provider as IntegrationProvider)
}

export function isSyncableProvider(provider: string) {
  return SYNCABLE_PROVIDERS.has(provider as IntegrationProvider)
}

export function isToolOnlyProvider(provider: string) {
  return TOOL_ONLY_PROVIDERS.has(provider as IntegrationProvider)
}

export function isPlannedProvider(provider: string) {
  return PLANNED_PROVIDERS.has(provider as IntegrationProvider)
}

export function getIntegrationDefinition(provider: string) {
  return INTEGRATION_DEFINITION_MAP.get(provider as IntegrationProvider) ?? null
}
