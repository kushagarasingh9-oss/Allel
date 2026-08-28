/**
 * PostHog Event Seeder
 *
 * Seeds real PostHog events for all 15 competition scenarios using
 * the PostHog Capture API. Each scenario gets realistic event
 * distributions across two time windows:
 *   - "previous" window: 14–28 days ago (baseline)
 *   - "current" window:  0–14 days ago  (measurement)
 *
 * Required events (from goal.md §3.2):
 *   allel_session_active  — product session heartbeat
 *   allel_key_action      — key-feature usage
 *   allel_cancel_intent   — cancellation intent signal
 *   allel_recovery_action — post-outreach recovery action
 */

import { SCENARIO_MANIFEST_V1, type ScenarioDefinition } from './manifest.v1'

// ── Types ──────────────────────────────────────────────────────

type CaptureEvent = {
  event: string
  properties: Record<string, unknown>
  timestamp: string
}

type PostHogCapturePayload = {
  api_key: string
  batch: Array<{
    event: string
    distinct_id: string
    properties: Record<string, unknown>
    timestamp: string
  }>
}

// ── Config ─────────────────────────────────────────────────────

const POSTHOG_CAPTURE_URL = 'https://us.i.posthog.com/batch/'
const BATCH_SIZE = 50 // PostHog batch limit

// ── Helpers ────────────────────────────────────────────────────

function randomTimestamp(daysAgoStart: number, daysAgoEnd: number): string {
  const now = Date.now()
  const start = now - daysAgoStart * 86_400_000
  const end = now - daysAgoEnd * 86_400_000
  const ts = start + Math.random() * (end - start)
  return new Date(ts).toISOString()
}

function spreadTimestamps(count: number, daysAgoStart: number, daysAgoEnd: number): string[] {
  return Array.from({ length: count }, () => randomTimestamp(daysAgoStart, daysAgoEnd))
    .sort()
}

function makeBaseProps(
  def: ScenarioDefinition,
  workspaceId: string,
  testRunId: string
): Record<string, unknown> {
  return {
    allel_workspace_id: workspaceId,
    allel_scenario_id: def.scenarioId,
    account_external_id: def.stripeCustomerId,
    allel_test_run: testRunId,
    $set: {
      email: def.contactEmail,
      name: def.accountName,
      allel_scenario_id: def.scenarioId,
      stripe_customer_id: def.stripeCustomerId,
    },
  }
}

// ── Event generation per scenario ──────────────────────────────

function generateEventsForScenario(
  def: ScenarioDefinition,
  workspaceId: string,
  testRunId: string
): CaptureEvent[] {
  const events: CaptureEvent[] = []
  const base = makeBaseProps(def, workspaceId, testRunId)
  const fp = def.featuresPatch

  // Current window counts (last 7 days → spread over 0–14 days for realism)
  const currentSessions = fp.usageCurrent7d ?? 0
  const previousSessions = fp.usagePrevious7d ?? 0
  const currentKeyFeature = fp.keyFeatureCurrent7d ?? 0
  const previousKeyFeature = fp.keyFeaturePrevious7d ?? 0

  // ── Previous window: allel_session_active (14–28 days ago) ──
  if (previousSessions > 0) {
    const timestamps = spreadTimestamps(previousSessions as number, 28, 14)
    for (const ts of timestamps) {
      events.push({
        event: 'allel_session_active',
        properties: { ...base, window: 'previous', $current_url: `https://${def.scenarioId.toLowerCase()}.example.com/app` },
        timestamp: ts,
      })
    }
  }

  // ── Previous window: allel_key_action (14–28 days ago) ──
  if (previousKeyFeature > 0) {
    const timestamps = spreadTimestamps(previousKeyFeature as number, 28, 14)
    for (const ts of timestamps) {
      events.push({
        event: 'allel_key_action',
        properties: { ...base, window: 'previous', action: 'core_feature_use', $current_url: `https://${def.scenarioId.toLowerCase()}.example.com/feature` },
        timestamp: ts,
      })
    }
  }

  // ── Current window: allel_session_active (0–14 days ago) ──
  if (currentSessions > 0) {
    const timestamps = spreadTimestamps(currentSessions as number, 14, 0)
    for (const ts of timestamps) {
      events.push({
        event: 'allel_session_active',
        properties: { ...base, window: 'current', $current_url: `https://${def.scenarioId.toLowerCase()}.example.com/app` },
        timestamp: ts,
      })
    }
  }

  // ── Current window: allel_key_action (0–14 days ago) ──
  if (currentKeyFeature > 0) {
    const timestamps = spreadTimestamps(currentKeyFeature as number, 14, 0)
    for (const ts of timestamps) {
      events.push({
        event: 'allel_key_action',
        properties: { ...base, window: 'current', action: 'core_feature_use', $current_url: `https://${def.scenarioId.toLowerCase()}.example.com/feature` },
        timestamp: ts,
      })
    }
  }

  // ── Cancel intent (ALLEL-007 specifically) ──
  if (fp.cancelIntentAt) {
    events.push({
      event: 'allel_cancel_intent',
      properties: {
        ...base,
        intent_source: 'cancellation_page',
        $current_url: `https://${def.scenarioId.toLowerCase()}.example.com/settings/cancel`,
      },
      timestamp: typeof fp.cancelIntentAt === 'string'
        ? fp.cancelIntentAt
        : randomTimestamp(3, 0),
    })
  }

  // ── Recovery action for scenarios that expect it (ALLEL-012) ──
  if (def.expectedResolution === 'strictly_recovered') {
    events.push({
      event: 'allel_recovery_action',
      properties: {
        ...base,
        recovery_type: 'product_reactivation',
        $current_url: `https://${def.scenarioId.toLowerCase()}.example.com/app`,
      },
      timestamp: randomTimestamp(2, 0),
    })
  }

  // ── Ensure every scenario has at least some events ──
  if (events.length === 0) {
    // Minimal heartbeat for scenarios with no usage data specified
    const timestamps = spreadTimestamps(5, 14, 0)
    for (const ts of timestamps) {
      events.push({
        event: 'allel_session_active',
        properties: { ...base, window: 'current', minimal: true },
        timestamp: ts,
      })
    }
  }

  return events
}

// ── Batch send to PostHog ──────────────────────────────────────

async function sendBatch(
  projectApiKey: string,
  distinctId: string,
  events: CaptureEvent[]
): Promise<{ sent: number; errors: number }> {
  let sent = 0
  let errors = 0

  // Split into BATCH_SIZE chunks
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const chunk = events.slice(i, i + BATCH_SIZE)
    const payload: PostHogCapturePayload = {
      api_key: projectApiKey,
      batch: chunk.map(e => ({
        event: e.event,
        distinct_id: distinctId,
        properties: {
          ...e.properties,
          $lib: 'allel-seed',
          $lib_version: '1.0.0',
        },
        timestamp: e.timestamp,
      })),
    }

    try {
      const response = await fetch(POSTHOG_CAPTURE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })

      if (response.ok) {
        sent += chunk.length
      } else {
        const text = await response.text().catch(() => '')
        console.error(`  ✗ Batch failed (${response.status}): ${text.slice(0, 200)}`)
        errors += chunk.length
      }
    } catch (err) {
      console.error(`  ✗ Network error:`, err instanceof Error ? err.message : err)
      errors += chunk.length
    }
  }

  return { sent, errors }
}

// ── Main export ────────────────────────────────────────────────

export type PostHogSeedResult = {
  testRunId: string
  scenarioResults: Array<{
    scenarioId: string
    distinctId: string
    eventCount: number
    sent: number
    errors: number
  }>
  totalSent: number
  totalErrors: number
}

export async function seedPostHogEvents(options: {
  projectApiKey: string
  workspaceId: string
  testRunId?: string
}): Promise<PostHogSeedResult> {
  const testRunId = options.testRunId || `run_${Date.now()}`
  const scenarioResults: PostHogSeedResult['scenarioResults'] = []
  let totalSent = 0
  let totalErrors = 0

  console.log(`\n🔬 PostHog Event Seeder — Test Run: ${testRunId}`)
  console.log(`   Project Key: ${options.projectApiKey.slice(0, 8)}...`)
  console.log(`   Workspace:   ${options.workspaceId}`)
  console.log(`   Scenarios:   ${SCENARIO_MANIFEST_V1.length}\n`)

  for (const def of SCENARIO_MANIFEST_V1) {
    const events = generateEventsForScenario(def, options.workspaceId, testRunId)
    console.log(`  ${def.scenarioId} "${def.accountName}"`)
    console.log(`    distinct_id: ${def.posthogDistinctId}`)
    console.log(`    events:      ${events.length} (${countByEvent(events)})`)

    const { sent, errors } = await sendBatch(
      options.projectApiKey,
      def.posthogDistinctId,
      events
    )

    console.log(`    result:      ${sent} sent, ${errors} errors`)

    scenarioResults.push({
      scenarioId: def.scenarioId,
      distinctId: def.posthogDistinctId,
      eventCount: events.length,
      sent,
      errors,
    })

    totalSent += sent
    totalErrors += errors
  }

  console.log(`\n✅ Seeding complete: ${totalSent} events sent, ${totalErrors} errors`)
  console.log(`   Test run ID: ${testRunId}\n`)

  return { testRunId, scenarioResults, totalSent, totalErrors }
}

function countByEvent(events: CaptureEvent[]): string {
  const counts: Record<string, number> = {}
  for (const e of events) {
    counts[e.event] = (counts[e.event] || 0) + 1
  }
  return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ')
}
