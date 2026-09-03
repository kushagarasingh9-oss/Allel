import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import {
  UnifiedCustomerScanTree,
  ProviderScanNode,
  ProviderIdentityRow,
  ProviderEvidenceRow,
  ProviderStatusRow,
} from './unified-customer-scan-tree'
import { TimelineNode } from './timeline-nodes'
import type { CustomerRiskScan, CustomerProviderResult } from '@/recovery/customer-scan-types'
import { getUnifiedCustomerScan } from '@/agent/tools/tools'

test('1. Unified scan renders Stripe, PostHog, and Intercom provider nodes', () => {
  const mockScan: CustomerRiskScan = {
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    accountName: 'Acme Test Corp',
    primaryEmail: 'founder@acme.com',
    classification: 'high_risk',
    severity: 'high',
    mrrAtRiskCents: 250000,
    daysUntilRenewal: 14,
    daysSinceLastActivity: 3,
    likelyRootCause: 'payment_failure',
    evidence: [],
    recommendedAction: {
      type: 'payment_retry',
      urgency: 'today',
      reason: 'Failed payment retry needed',
      discountEligible: false,
    },
    identity: { status: 'verified', confidence: 1.0 },
    freshness: { stripe: '2026-09-02T00:00:00Z', posthog: '2026-09-02T00:00:00Z', intercom: '2026-09-02T00:00:00Z', gmail: null },
    missingData: [],
    providerResults: {
      stripe: {
        provider: 'stripe',
        status: 'found',
        title: 'Stripe — Found Acme Test Corp',
        summary: 'Pro Tier · active · $2,500/mo MRR',
        identity: { matched: true, matchedBy: 'provider_id', externalId: 'cus_acme_123', email: 'founder@acme.com' },
        records: [
          { id: 'rec_sub_1', type: 'invoice_past_due', title: 'Pro Tier ($2,500/mo) - Past Due', detail: 'Status: past_due' },
        ],
      },
      posthog: {
        provider: 'posthog',
        status: 'found',
        title: 'PostHog — Found product activity',
        summary: 'Weekly usage dropped · 150 events in last 7d',
        identity: { matched: true, matchedBy: 'email', email: 'founder@acme.com' },
        records: [
          { id: 'rec_ph_1', type: 'feature_drop', title: 'Key workflow disengaged', detail: 'Previous: 150 events' },
        ],
      },
      intercom: {
        provider: 'intercom',
        status: 'found',
        title: 'Intercom — Found 1 conversation',
        summary: '1 open conversation · Blocker detected',
        identity: { matched: true, matchedBy: 'email', email: 'founder@acme.com' },
        records: [
          { id: 'rec_ic_1', type: 'blocker', title: '1 open blocker conversation', detail: 'Webhook failure' },
        ],
      },
    },
  }

  const html = ReactDOMServer.renderToStaticMarkup(<UnifiedCustomerScanTree data={mockScan} />)

  assert.match(html, /Stripe — Found Acme Test Corp/)
  assert.match(html, /PostHog — Found product activity/)
  assert.match(html, /Intercom — Found 1 conversation/)
  assert.match(html, /\/logos\/stripe\.svg/)
  assert.match(html, /\/logos\/posthog\.svg/)
  assert.match(html, /\/logos\/intercom\.svg/)
})

test('2. Provider nodes are independently expandable with TimelineNode', () => {
  const riskResult: CustomerProviderResult = {
    provider: 'stripe',
    status: 'found',
    title: 'Stripe — Found Custom Corp',
    summary: 'Active $5,000/mo',
    identity: { matched: true, matchedBy: 'provider_id', externalId: 'cus_999' },
    records: [
      { id: 'r1', type: 'invoice_past_due', title: 'Enterprise ($5,000/mo) - Past Due' },
    ],
  }

  const html = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={riskResult} defaultOpen={true} />)
  assert.match(html, /Stripe — Found Custom Corp/)
  assert.match(html, /Enterprise \(\$5,000\/mo\) - Past Due/)
})

test('3. PostHog records render only under PostHog', () => {
  const posthogWithRisk: CustomerProviderResult = {
    provider: 'posthog',
    status: 'found',
    title: 'PostHog — Found product activity',
    summary: 'Usage dropped -75%',
    identity: { matched: true, matchedBy: 'email' },
    records: [{ id: 'ph_rec_1', type: 'feature_drop', title: 'PostHog Telemetry Drop -75%' }],
  }
  const stripeResult: CustomerProviderResult = {
    provider: 'stripe',
    status: 'found',
    title: 'Stripe — Found DataCorp',
    summary: 'Active',
    identity: { matched: true, matchedBy: 'email' },
    records: [{ id: 's_rec_1', type: 'subscription', title: 'Stripe Subscription Only' }],
  }
  const intercomResult: CustomerProviderResult = {
    provider: 'intercom',
    status: 'found',
    title: 'Intercom — Found 0 conversations',
    summary: 'No tickets',
    identity: { matched: true, matchedBy: 'email' },
    records: [{ id: 'ic_rec_1', type: 'conversation', title: 'Intercom Support Ticket #404' }],
  }

  const stripeHtml = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={stripeResult} defaultOpen={true} />)
  const posthogHtml = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={posthogWithRisk} defaultOpen={true} />)
  const intercomHtml = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={intercomResult} defaultOpen={true} />)

  assert.match(posthogHtml, /PostHog Telemetry Drop -75%/)
  assert.doesNotMatch(stripeHtml, /PostHog Telemetry Drop -75%/)
  assert.doesNotMatch(intercomHtml, /PostHog Telemetry Drop -75%/)
})

test('4. Intercom records render only under Intercom', () => {
  const intercomResult: CustomerProviderResult = {
    provider: 'intercom',
    status: 'found',
    title: 'Intercom — Found 2 conversations',
    summary: 'Blocker ticket active',
    identity: { matched: true, matchedBy: 'email', email: 'test@domain.com' },
    records: [
      { id: 'ic_uniq_123', type: 'blocker', title: 'P0 Bug in webhook integration' },
    ],
  }
  const stripeResult: CustomerProviderResult = {
    provider: 'stripe',
    status: 'found',
    title: 'Stripe — Found Domain',
    summary: 'Active',
    identity: { matched: true, matchedBy: 'email' },
    records: [{ id: 's_1', type: 'subscription', title: 'Stripe Plan' }],
  }

  const icHtml = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={intercomResult} defaultOpen={true} />)
  const stripeHtml = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={stripeResult} defaultOpen={true} />)

  assert.match(icHtml, /P0 Bug in webhook integration/)
  assert.doesNotMatch(stripeHtml, /P0 Bug in webhook integration/)
})

test('5. Unavailable provider displays "Unavailable", not "No records"', () => {
  const unavailableResult: CustomerProviderResult = {
    provider: 'intercom',
    status: 'unavailable',
    title: 'Intercom — Unavailable',
    summary: 'Intercom integration is not connected',
    identity: { matched: false, matchedBy: 'none' },
    records: [],
    error: 'Intercom integration is not connected or currently unavailable',
  }

  const html = ReactDOMServer.renderToStaticMarkup(<ProviderScanNode result={unavailableResult} defaultOpen={true} />)

  assert.match(html, /Unavailable/)
  assert.match(html, /Intercom integration is not connected/)
  assert.doesNotMatch(html, /No support conversations/)
  assert.doesNotMatch(html, /No records found/)
})

test('6. No Apex-specific or Enterprise-plan fallback text exists', () => {
  const genericScan: CustomerRiskScan = {
    accountId: '550e8400-e29b-41d4-a716-446655440002',
    accountName: 'Zeta Robotics',
    primaryEmail: 'alex@zetarobotics.com',
    classification: 'needs_intervention',
    severity: 'medium',
    mrrAtRiskCents: 50000,
    daysUntilRenewal: 30,
    daysSinceLastActivity: 1,
    likelyRootCause: 'onboarding_failure',
    evidence: [],
    recommendedAction: { type: 'onboarding_concierge', urgency: 'this_week', reason: 'Concierge outreach', discountEligible: false },
    identity: { status: 'verified', confidence: 1.0 },
    freshness: { stripe: null, posthog: null, intercom: null, gmail: null },
    missingData: [],
    providerResults: {
      stripe: {
        provider: 'stripe',
        status: 'found',
        title: 'Stripe — Found Zeta Robotics',
        summary: 'Startup Tier · active · $500/mo MRR',
        identity: { matched: true, matchedBy: 'email' },
        records: [{ id: 'z_sub', type: 'subscription', title: 'Startup Tier ($500/mo)' }],
      },
      posthog: {
        provider: 'posthog',
        status: 'not_found',
        title: 'PostHog — No user activity found',
        summary: 'No product activity or analytics events recorded in PostHog',
        identity: { matched: false, matchedBy: 'none' },
        records: [],
      },
      intercom: {
        provider: 'intercom',
        status: 'not_found',
        title: 'Intercom — No support conversations',
        summary: 'No open support tickets or customer conversations',
        identity: { matched: false, matchedBy: 'none' },
        records: [],
      },
    },
  }

  const html = ReactDOMServer.renderToStaticMarkup(<UnifiedCustomerScanTree data={genericScan} />)

  // Must not contain fabricated Apex or Enterprise Scale Plan hardcodings
  assert.doesNotMatch(html, /Apex MultiRail/)
  assert.doesNotMatch(html, /Enterprise Scale Plan/)
  assert.doesNotMatch(html, /Webhook sync 504 Gateway Timeout/)
})

test('7. Empty records do not fabricate data', () => {
  const emptyPosthog: CustomerProviderResult = {
    provider: 'posthog',
    status: 'not_found',
    title: 'PostHog — No user activity found',
    summary: 'No events found in PostHog',
    identity: { matched: false, matchedBy: 'none' },
    records: [],
  }

  const rowHtml = ReactDOMServer.renderToStaticMarkup(<ProviderStatusRow status={emptyPosthog.status} summary={emptyPosthog.summary} />)
  assert.match(rowHtml, /No records found/)
  assert.doesNotMatch(rowHtml, /Weekly product usage dropped/)
})

test('8. Identity conflict is visually explicit', () => {
  const conflictResult: CustomerProviderResult = {
    provider: 'stripe',
    status: 'conflict',
    title: 'Stripe — Identity conflict detected',
    summary: 'Conflicting customer records found in Stripe',
    identity: { matched: false, matchedBy: 'none' },
    records: [],
  }

  const html = ReactDOMServer.renderToStaticMarkup(<ProviderStatusRow status={conflictResult.status} summary={conflictResult.summary} />)
  assert.match(html, /Identity Conflict/)
  assert.match(html, /Conflicting customer records found in Stripe/)
})

test('9. Existing non-unified TimelineNode behavior remains unchanged', () => {
  const standardNodeHtml = ReactDOMServer.renderToStaticMarkup(
    <TimelineNode title="Checking Google Calendar" defaultOpen={true} isCompleted={true} isCollapsible={true}>
      <div>Calendar details</div>
    </TimelineNode>
  )

  assert.match(standardNodeHtml, /Checking Google Calendar/)
  assert.match(standardNodeHtml, /Calendar details/)
})

test('10. The tool remains one getUnifiedCustomerScan tool call', () => {
  assert.equal(typeof getUnifiedCustomerScan, 'object')
  assert.equal(typeof (getUnifiedCustomerScan as any).execute, 'function')
})
