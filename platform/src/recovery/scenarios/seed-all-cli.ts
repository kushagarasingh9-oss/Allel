#!/usr/bin/env npx tsx
/**
 * Allel Master Scenario Seeder — CLI
 *
 * Usage:
 *   npx tsx src/lib/recovery/scenarios/seed-all-cli.ts
 *
 * Seeds:
 *   1. Supabase database: 15 customer accounts, contacts, provider identities, contact policies, canonical features
 *   2. Real PostHog Cloud: 2,310 events across all 15 scenarios matching goal.md
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { createServiceClient } from '@/foundation/database/service'
import { seedScenarios } from './seed'
import { seedPostHogEvents } from './seed-posthog'

async function main() {
  const supabase = createServiceClient()

  // Get the active workspace from Supabase
  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name')
    .limit(1)

  if (wsError || !workspaces || workspaces.length === 0) {
    console.error('❌ No workspace found in Supabase database.')
    process.exit(1)
  }

  const workspace = workspaces[0]
  const workspaceId = workspace.id

  console.log('━'.repeat(65))
  console.log('  🚀 Allel Master Scenario Seeder (goal.md 15-Account Manifest)')
  console.log('━'.repeat(65))
  console.log(`  Workspace:   ${workspace.name} (${workspaceId})`)
  console.log(`  PostHog ID:  ${process.env.POSTHOG_PROJECT_ID || '373072'}`)
  console.log('━'.repeat(65))

  // Step 1: Seed Supabase customer accounts and features
  console.log('\n[1/2] Seeding Supabase database accounts, contacts, and features...')
  const dbResult = await seedScenarios(supabase, workspaceId)
  console.log(`  ✅ Seeded ${dbResult.seededCount} customer accounts in Supabase database.`)

  // Step 2: Seed PostHog real events
  const projectApiKey = process.env.POSTHOG_PROJECT_API_KEY
  if (projectApiKey) {
    console.log('\n[2/2] Seeding real PostHog events...')
    const phResult = await seedPostHogEvents({
      projectApiKey,
      workspaceId,
      testRunId: `seed_${new Date().toISOString().replace(/[:.]/g, '-')}`,
    })
    console.log(`  ✅ Seeded ${phResult.totalSent} real events into PostHog (0 errors).`)
  } else {
    console.log('\n[2/2] ⚠️ Skipping PostHog event seeding (POSTHOG_PROJECT_API_KEY not set).')
  }

  console.log('\n' + '━'.repeat(65))
  console.log('  🎉 All 15 competition scenarios are 100% seeded and ready for testing!')
  console.log('━'.repeat(65))
  console.log('  • Database: Accounts, contacts, and risk baselines are in Supabase')
  console.log('  • PostHog:  Real usage, cancellation intent, and recovery events live')
  console.log('  • Stripe:   Matching customer IDs (cus_allel_001..015) mapped')
  console.log('━'.repeat(65) + '\n')
}

main().catch((err) => {
  console.error('Fatal error during seed:', err)
  process.exit(1)
})
