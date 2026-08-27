#!/usr/bin/env npx tsx
/**
 * PostHog Scenario Seeder — CLI
 *
 * Usage:
 *   npx tsx src/lib/recovery/scenarios/seed-posthog-cli.ts
 *
 * Reads POSTHOG_PROJECT_API_KEY and POSTHOG_PROJECT_ID from .env.local
 * and seeds all 15 scenarios with real PostHog events.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { seedPostHogEvents } from './seed-posthog'

async function main() {
  const projectApiKey = process.env.POSTHOG_PROJECT_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID || '373072'

  if (!projectApiKey) {
    console.error('❌ POSTHOG_PROJECT_API_KEY is not set in .env.local')
    console.error('   Get it from PostHog → Project Settings → Project API Key')
    process.exit(1)
  }

  if (!projectApiKey.startsWith('phc_')) {
    console.warn('⚠️  Key does not start with phc_ — this might be a Personal API Key, not a Project API Key')
  }

  // Use a deterministic workspace ID for the seed run
  // In production, this would be fetched from Supabase
  const workspaceId = process.env.ALLEL_WORKSPACE_ID || 'allel-competition-workspace'

  console.log('━'.repeat(60))
  console.log('  Allel PostHog Scenario Seeder')
  console.log('━'.repeat(60))
  console.log(`  Project ID:  ${projectId}`)
  console.log(`  Workspace:   ${workspaceId}`)
  console.log('━'.repeat(60))

  const result = await seedPostHogEvents({
    projectApiKey,
    workspaceId,
    testRunId: `seed_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  })

  // Summary table
  console.log('\n' + '━'.repeat(60))
  console.log('  Summary')
  console.log('━'.repeat(60))
  console.log(`  Total events sent:   ${result.totalSent}`)
  console.log(`  Total errors:        ${result.totalErrors}`)
  console.log(`  Test run ID:         ${result.testRunId}`)
  console.log('━'.repeat(60))

  console.log('\n  Per-scenario breakdown:')
  for (const sr of result.scenarioResults) {
    const status = sr.errors === 0 ? '✅' : '⚠️'
    console.log(`    ${status} ${sr.scenarioId}: ${sr.sent}/${sr.eventCount} events (${sr.distinctId})`)
  }

  console.log('\n  📊 Check PostHog → Events tab to verify.')
  console.log('  🔍 Filter by: allel_session_active, allel_key_action, allel_cancel_intent\n')

  if (result.totalErrors > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
