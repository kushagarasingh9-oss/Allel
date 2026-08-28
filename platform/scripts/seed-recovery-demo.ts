/**
 * seed-recovery-demo.ts
 *
 * Creates a batch of realistic Stripe test-mode failed payment scenarios,
 * opens recovery cases for them, simulates outreach, and records measured
 * revenue recovery outcomes.
 *
 * Run with:
 *   npx tsx scripts/seed-recovery-demo.ts
 *
 * Requires: STRIPE_SECRET_KEY (test mode), SUPABASE_SERVICE_ROLE_KEY,
 *           NEXT_PUBLIC_SUPABASE_URL set in environment.
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Test accounts to seed ────────────────────────────────────────────────────
const DEMO_ACCOUNTS = [
  { name: 'Acme Corp',        email: 'billing@acme-corp.io',        mrr: 499,  scenario: 'failed_payment',   severity: 'critical' },
  { name: 'TechStartup Inc',  email: 'finance@techstartup.co',       mrr: 299,  scenario: 'cancel_intent',    severity: 'high'     },
  { name: 'GrowthCo',         email: 'accounts@growthco.com',        mrr: 799,  scenario: 'failed_payment',   severity: 'critical' },
  { name: 'BuildFast Ltd',    email: 'team@buildfast.io',            mrr: 149,  scenario: 'usage_decline',    severity: 'medium'   },
  { name: 'DataPipe Systems', email: 'billing@datapipe.systems',     mrr: 1299, scenario: 'failed_payment',   severity: 'critical' },
]

// Stripe test cards
const CARD_DECLINED       = 'pm_card_chargeDeclined'
const CARD_INSUFFICIENT   = 'pm_card_chargeDeclinedInsufficientFunds'
const CARD_GOOD           = 'pm_card_visa' // for "recovered" simulation

async function getOrCreateWorkspace(): Promise<string> {
  const { data } = await supabase.from('workspaces').select('id').limit(1).single()
  if (data?.id) return data.id
  throw new Error('No workspace found. Create one first via the app.')
}

async function seedAccount(workspaceId: string, account: typeof DEMO_ACCOUNTS[0]) {
  const now = new Date().toISOString()
  const accountId = randomUUID()

  // 1. Create Stripe customer
  const customer = await stripe.customers.create({
    name: account.name,
    email: account.email,
    metadata: { allel_workspace_id: workspaceId, allel_account_id: accountId },
  })
  console.log(`  ✅ Stripe customer: ${customer.id}`)

  // 2. Create product + price first
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: account.mrr * 100,
    recurring: { interval: 'month' },
    product_data: { name: `Allel Plan — ${account.name}` },
  })

  // 3. Attach a GOOD payment method first (needed to create subscription)
  const goodPm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id })
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodPm.id } })

  // 4. Create subscription successfully (1-day trial so no immediate charge)
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_period_days: 1,
  })
  console.log(`  ✅ Stripe subscription: ${subscription.id}`)

  // 5. Attach a DECLINED card — best effort, doesn't block seeding
  try {
    const declinedPm = await stripe.paymentMethods.attach('pm_card_chargeDeclined', { customer: customer.id })
    await stripe.subscriptions.update(subscription.id, {
      default_payment_method: declinedPm.id,
    })
    console.log(`  ✅ Declined card attached — next invoice will fail`)
  } catch {
    // pm_card_chargeDeclined can't always be attached as reusable PM in test mode
    // The subscription + trial is sufficient for demo purposes
    console.log(`  ℹ️  Declined card skip — subscription trial will expire naturally`)
  }

  // 5. Create local customer_account record
  await supabase.from('customer_accounts').upsert({
    id: accountId,
    workspace_id: workspaceId,
    name: account.name,
    mrr_cents: account.mrr * 100,
    account_status: 'active',
    risk_level: account.severity === 'critical' ? 'high' : 'medium',
    risk_score: account.severity === 'critical' ? 92 : account.severity === 'high' ? 74 : 55,
    created_at: now,
    updated_at: now,
  })

  // 6. Open a recovery case
  const caseId = randomUUID()
  const caseKey = `${workspaceId.slice(0, 8)}-${accountId.slice(0, 8)}-${account.scenario}`

  await supabase.from('recovery_cases').insert({
    id: caseId,
    workspace_id: workspaceId,
    customer_account_id: accountId,
    case_key: caseKey,
    status: 'monitoring',
    severity: account.severity,
    risk_score: account.severity === 'critical' ? 92 : account.severity === 'high' ? 74 : 55,
    score_confidence: 0.87,
    trigger_event_type: account.scenario,
    trigger_provider: 'stripe',
    action_type: 'recovery_email',
    mrr_baseline_cents: account.mrr * 100,
    root_cause_summary: `${account.name} has ${account.scenario === 'failed_payment' ? '2 consecutive failed payments' : account.scenario === 'cancel_intent' ? 'set cancel_at_period_end=true' : 'dropped usage by 60% over 14 days'}. High churn probability. Recovery email dispatched.`,
    sent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    approved_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    opened_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: now,
    updated_at: now,
  })

  // 7. Write audit trail events
  const events = [
    { event_type: 'case_opened',     from_status: null,               to_status: 'open',               hours_ago: 72 },
    { event_type: 'analysis_done',   from_status: 'open',             to_status: 'action_proposed',     hours_ago: 71 },
    { event_type: 'founder_approved',from_status: 'action_proposed',  to_status: 'approved',            hours_ago: 50 },
    { event_type: 'email_sent',      from_status: 'approved',         to_status: 'sent',                hours_ago: 48 },
    { event_type: 'monitoring',      from_status: 'sent',             to_status: 'monitoring',          hours_ago: 47 },
  ]

  for (const e of events) {
    await supabase.from('recovery_case_events').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      recovery_case_id: caseId,
      event_type: e.event_type,
      from_status: e.from_status,
      to_status: e.to_status,
      actor_type: e.event_type === 'founder_approved' ? 'user' : 'agent',
      actor_id: e.event_type === 'founder_approved' ? 'founder' : 'agent',
      detail: { automated: true, demo: true },
      created_at: new Date(Date.now() - e.hours_ago * 60 * 60 * 1000).toISOString(),
    })
  }

  // 8. For critical cases — simulate successful recovery
  if (account.severity === 'critical') {
    const recoveredCents = account.mrr * 100
    await supabase.from('draft_outcomes').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      recovery_case_id: caseId,
      outcome_type: 'payment_recovered',
      strict_recovered_cents: recoveredCents,
      protected_cents: 0,
      stripe_event_id: `evt_demo_${caseId.slice(0, 8)}`,
      is_test_mode: true,
      occurred_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12h after email
      created_at: now,
    })

    // Resolve the case
    await supabase.from('recovery_cases').update({
      status: 'resolved',
      resolution: 'engaged',
      resolved_at: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
      updated_at: now,
    }).eq('id', caseId)

    console.log(`  💰 Recovered: $${account.mrr}/mo from ${account.name}`)
  }

  return { accountId, caseId, customerId: customer.id }
}

async function main() {
  console.log('\n🚀 Allel Revenue Recovery — Demo Seed Script\n')
  console.log('⚠️  Running in Stripe TEST MODE — no real money involved\n')

  const workspaceId = await getOrCreateWorkspace()
  console.log(`📦 Workspace: ${workspaceId}\n`)

  const results = []
  for (const account of DEMO_ACCOUNTS) {
    console.log(`\n→ Seeding: ${account.name} (${account.scenario}, $${account.mrr}/mo)`)
    try {
      const result = await seedAccount(workspaceId, account)
      results.push({ ...account, ...result })
    } catch (err) {
      console.error(`  ❌ Failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const recovered = results
    .filter(r => r.severity === 'critical')
    .reduce((s, r) => s + r.mrr, 0)

  const atRisk = results.reduce((s, r) => s + r.mrr, 0)

  console.log('\n\n═══════════════════════════════════════════════════')
  console.log('  DEMO SEED COMPLETE')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Accounts seeded:     ${results.length}`)
  console.log(`  MRR at risk:         $${atRisk.toLocaleString()}/mo`)
  console.log(`  MRR recovered:       $${recovered.toLocaleString()}/mo  ← this is your metric`)
  console.log(`  Recovery rate:       ${Math.round((recovered / atRisk) * 100)}%`)
  console.log(`  Audit events:        ${results.length * 5} immutable events written`)
  console.log(`  Mode:                TEST (Stripe test mode, is_test_mode=true)`)
  console.log('═══════════════════════════════════════════════════\n')
}

main().catch(console.error)
