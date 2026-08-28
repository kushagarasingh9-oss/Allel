export type RiskLevel = 'High' | 'Medium' | 'Low'
export type DraftStatus = 'Ready to send' | 'Needs review' | 'Waiting on founder'
export type IntegrationStatus = 'Connected' | 'Needs attention' | 'Disconnected' | 'Coming soon'

export type OverviewMetric = {
  label: string
  value: string
  change: string
  detail: string
}

export type ActionTaskStatus =
  | 'Needs approval'
  | 'Ready to send'
  | 'Waiting on founder'
  | 'Open'

export type BriefItem = {
  id?: string
  accountId?: string
  account: string
  risk: RiskLevel
  headline: string
  detail: string
  evidence: string[]
  nextStep: string
  sources: string[]
}

export type AccountSummary = {
  id: string
  name: string
  segment: string
  mrr: string
  risk: RiskLevel
  usageDelta: string
  lastTouch: string
  openIssue: string
  nextAction: string
}

export type DraftItem = {
  id: string
  accountId?: string
  account: string
  type: string
  subject: string
  preview: string
  status: DraftStatus
  due: string
  sources?: string[]
}

export type ActionTask = {
  id: string
  account: string
  headline: string
  detail: string
  status: ActionTaskStatus
  kind: string
  due: string
  requiresApproval: boolean
  sources: string[]
}

export type LiveSignal = {
  time: string
  label: string
  detail: string
}

export type IntegrationItem = {
  name: string
  status: IntegrationStatus
  description: string
  sync: string
  value: string
}

export const overviewMetrics: OverviewMetric[] = [
  {
    label: 'Accounts at risk',
    value: '18',
    change: '+4 today',
    detail: '7 accounts need founder outreach before Friday.',
  },
  {
    label: 'Revenue exposed',
    value: '$12.4k',
    change: 'Trailing 30 days',
    detail: 'Open churn risk across renewals, failed payments, and silent champions.',
  },
  {
    label: 'Drafts ready',
    value: '6',
    change: '4 save emails',
    detail: 'Two payment nudges and four check-ins are ready for approval.',
  },
  {
    label: 'Coverage',
    value: '4 sources',
    change: 'Stripe, PostHog, Gmail, Intercom',
    detail: 'Daily brief is built from billing, usage, support, and follow-up history.',
  },
]

export const briefItems: BriefItem[] = [
  {
    id: 'brief-1',
    accountId: 'account-1',
    account: 'Acme Studio',
    risk: 'High',
    headline: 'Usage dropped hard after last week’s failed payment retry.',
    detail:
      'Core seat activity is down 38% and no one from the account has replied since March 24.',
    evidence: ['Payment retry failed 14h ago', 'Weekly active seats down from 11 to 6', 'No founder touch for 8 days'],
    nextStep: 'Send the save note and offer a 15-minute rescue call.',
    sources: ['Stripe', 'PostHog', 'Gmail'],
  },
  {
    id: 'brief-2',
    accountId: 'account-2',
    account: 'Northstar Health',
    risk: 'High',
    headline: 'Renewal is close and the champion has gone silent.',
    detail:
      'The account is 9 days from renewal, with key workflow usage down 24% and one unresolved support thread.',
    evidence: ['Renewal due in 9 days', 'Primary feature usage down 24%', 'Intercom ticket open for 3 days'],
    nextStep: 'Follow up on the support issue, then send the renewal-risk draft.',
    sources: ['PostHog', 'Intercom', 'Gmail'],
  },
  {
    id: 'brief-3',
    accountId: 'account-3',
    account: 'Loomgrid',
    risk: 'Medium',
    headline: 'Team activity stalled after onboarding.',
    detail:
      'Only 2 of 7 invited teammates became active and the workspace has not reached the activation milestone.',
    evidence: ['Invite acceptance stuck at 28%', 'No activity in 72 hours', 'Founding team viewed pricing twice'],
    nextStep: 'Nudge the admin with the activation checklist and invite help.',
    sources: ['PostHog', 'Gmail'],
  },
  {
    id: 'brief-4',
    accountId: 'account-4',
    account: 'Juniper AI',
    risk: 'Medium',
    headline: 'Support frustration is rising around export failures.',
    detail:
      'Two separate conversations mention broken exports and satisfaction dipped after the latest release.',
    evidence: ['2 tickets mention export failures', 'CSAT slipped from 4.8 to 3.9', 'Errors spiked on the export endpoint'],
    nextStep: 'Acknowledge the issue and send a progress update before end of day.',
    sources: ['Intercom', 'Sentry', 'Gmail'],
  },
]

export const accountSummaries: AccountSummary[] = [
  {
    id: 'account-1',
    name: 'Acme Studio',
    segment: 'Growth / annual',
    mrr: '$3,400',
    risk: 'High',
    usageDelta: '-38%',
    lastTouch: '8 days ago',
    openIssue: 'Payment retry failed',
    nextAction: 'Approve save note',
  },
  {
    id: 'account-2',
    name: 'Northstar Health',
    segment: 'Scale / quarterly',
    mrr: '$2,100',
    risk: 'High',
    usageDelta: '-24%',
    lastTouch: '5 days ago',
    openIssue: 'Renewal + support thread',
    nextAction: 'Founder follow-up',
  },
  {
    id: 'account-3',
    name: 'Loomgrid',
    segment: 'Trial / team plan',
    mrr: '$0',
    risk: 'Medium',
    usageDelta: '-17%',
    lastTouch: '2 days ago',
    openIssue: 'Invite activation stalled',
    nextAction: 'Send onboarding nudge',
  },
  {
    id: 'account-4',
    name: 'Juniper AI',
    segment: 'Growth / monthly',
    mrr: '$1,280',
    risk: 'Medium',
    usageDelta: '-12%',
    lastTouch: 'Yesterday',
    openIssue: 'Export bug frustration',
    nextAction: 'Send product update',
  },
  {
    id: 'account-5',
    name: 'Marble Labs',
    segment: 'Startup / monthly',
    mrr: '$720',
    risk: 'Low',
    usageDelta: '+8%',
    lastTouch: 'Today',
    openIssue: 'None',
    nextAction: 'No action needed',
  },
  {
    id: 'account-6',
    name: 'Vanta Ridge',
    segment: 'Growth / annual',
    mrr: '$4,900',
    risk: 'Low',
    usageDelta: '+14%',
    lastTouch: '3 days ago',
    openIssue: 'None',
    nextAction: 'Monitor expansion',
  },
]

export const draftQueue: DraftItem[] = [
  {
    id: 'draft-1',
    accountId: 'account-1',
    account: 'Acme Studio',
    type: 'Save email',
    subject: 'We noticed activity dip after the billing issue',
    preview:
      'Wanted to reach out personally because your team’s usage dropped after yesterday’s retry failure. We can help sort billing and get your workspace stable again.',
    status: 'Ready to send',
    due: 'Send today',
    sources: ['Stripe', 'PostHog', 'Gmail'],
  },
  {
    id: 'draft-2',
    accountId: 'account-2',
    account: 'Northstar Health',
    type: 'Renewal rescue',
    subject: 'Before renewal, here’s how we can unblock the export issue',
    preview:
      'I saw the export thread is still open and wanted to send a concrete path forward before renewal. We can review the issue together and make sure the team is unblocked.',
    status: 'Needs review',
    due: 'Review this afternoon',
    sources: ['Intercom', 'PostHog', 'Gmail'],
  },
  {
    id: 'draft-3',
    accountId: 'account-3',
    account: 'Loomgrid',
    type: 'Activation nudge',
    subject: 'Can we help your team finish setup this week?',
    preview:
      'Only a couple of invited teammates have completed setup so far. If useful, we can share the fastest path to activation and jump on a quick walkthrough.',
    status: 'Waiting on founder',
    due: 'Tomorrow morning',
    sources: ['PostHog', 'Gmail'],
  },
  {
    id: 'draft-4',
    accountId: 'account-4',
    account: 'Juniper AI',
    type: 'Issue follow-up',
    subject: 'Quick update on the export fixes your team flagged',
    preview:
      'Thanks again for flagging the export problems. I wanted to send a direct update on the fix timeline and keep you looped in until it’s resolved.',
    status: 'Ready to send',
    due: 'Send today',
    sources: ['Intercom', 'Sentry', 'Gmail'],
  },
]

export const actionTasks: ActionTask[] = [
  {
    id: 'task-1',
    account: 'Acme Studio',
    headline: 'Approve the billing recovery reply',
    detail:
      'A founder draft is ready because Stripe showed a failed payment and usage dropped in the same review window.',
    status: 'Needs approval',
    kind: 'Email draft',
    due: 'Review today',
    requiresApproval: true,
    sources: ['Stripe', 'PostHog', 'Gmail'],
  },
  {
    id: 'task-2',
    account: 'Northstar Health',
    headline: 'Send the renewal-risk follow-up',
    detail:
      'The outreach draft is approved. The open support thread should be referenced directly in the reply.',
    status: 'Ready to send',
    kind: 'Email draft',
    due: 'Send today',
    requiresApproval: false,
    sources: ['Intercom', 'PostHog', 'Gmail'],
  },
  {
    id: 'task-3',
    account: 'Juniper AI',
    headline: 'Acknowledge the export issue personally',
    detail:
      'No founder reply has gone out yet. The brief flagged repeated support pain and fresh product errors.',
    status: 'Open',
    kind: 'Follow-up',
    due: 'Today',
    requiresApproval: false,
    sources: ['Intercom', 'Sentry'],
  },
]

export const liveSignals: LiveSignal[] = [
  {
    time: '11:12',
    label: 'Failed payment detected',
    detail: 'Acme Studio missed a renewal retry on the Growth annual plan.',
  },
  {
    time: '10:44',
    label: 'Usage dropped below threshold',
    detail: 'Northstar Health fell under the weekly engagement baseline.',
  },
  {
    time: '09:58',
    label: 'Support escalation',
    detail: 'Juniper AI reported a second export issue in Intercom.',
  },
  {
    time: '09:12',
    label: 'Draft generated',
    detail: 'Loomgrid activation nudge is ready for founder review.',
  },
]

export const integrations: IntegrationItem[] = [
  {
    name: 'Stripe',
    status: 'Connected',
    description: 'Billing, renewals, failed payments, plan changes',
    sync: 'Synced 3 min ago',
    value: '214 subscriptions mapped',
  },
  {
    name: 'PostHog',
    status: 'Connected',
    description: 'Usage trends, activation milestones, feature engagement',
    sync: 'Synced 6 min ago',
    value: '1.8M events indexed',
  },
  {
    name: 'Gmail',
    status: 'Connected',
    description: 'Founder follow-up history, drafts, approval flow',
    sync: 'Synced 9 min ago',
    value: '142 threads linked',
  },
  {
    name: 'Intercom',
    status: 'Needs attention',
    description: 'Support context, frustration signals, unresolved issues',
    sync: 'Reconnect required',
    value: 'Token expires in 2 days',
  },
  {
    name: 'Slack',
    status: 'Coming soon',
    description: 'Daily brief delivery and urgent churn alerts',
    sync: 'Planned for v1.1',
    value: 'Brief delivery',
  },
  {
    name: 'HubSpot',
    status: 'Coming soon',
    description: 'CRM companies, contacts, and lifecycle context',
    sync: 'Planned for v1.1',
    value: 'CRM enrichment',
  },
  {
    name: 'Sentry',
    status: 'Coming soon',
    description: 'Production issue signals that may explain churn risk',
    sync: 'Planned for v1.2',
    value: 'Issue monitoring',
  },
  {
    name: 'Linear',
    status: 'Coming soon',
    description: 'Bug and issue tracker context tied back to customer risk',
    sync: 'Planned for v1.2',
    value: 'Issue tracker sync',
  },
  {
    name: 'Google Calendar',
    status: 'Coming soon',
    description: 'Meeting follow-ups, reminders, founder agenda prep',
    sync: 'Planned for v1.2',
    value: 'Scheduling',
  },
]

export function getRiskClasses(risk: RiskLevel) {
  switch (risk) {
    case 'High':
      return 'border border-[#5b1d1d] bg-[#1b0f11] text-[#ffb0b9]'
    case 'Medium':
      return 'border border-[#5a4720] bg-[#19140c] text-[#f2c979]'
    default:
      return 'border border-[#1f4633] bg-[#0f1713] text-[#8dd6a7]'
  }
}

export function getDraftStatusClasses(status: DraftStatus) {
  switch (status) {
    case 'Ready to send':
      return 'border border-[#1f4633] bg-[#0f1713] text-[#8dd6a7]'
    case 'Needs review':
      return 'border border-[#5a4720] bg-[#19140c] text-[#f2c979]'
    default:
      return 'border border-[#2f3546] bg-[#111521] text-[#aeb9d9]'
  }
}

export function getIntegrationStatusClasses(status: IntegrationStatus) {
  switch (status) {
    case 'Connected':
      return 'border border-[#1f4633] bg-[#0f1713] text-[#8dd6a7]'
    case 'Needs attention':
      return 'border border-[#5b1d1d] bg-[#1b0f11] text-[#ffb0b9]'
    case 'Disconnected':
      return 'border border-[#393948] bg-[#101018] text-[#b6b6c5]'
    default:
      return 'border border-[#2f3546] bg-[#111521] text-[#aeb9d9]'
  }
}
