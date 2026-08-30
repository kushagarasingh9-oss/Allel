import { resolve } from 'node:path'
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })

type Check = {
  name: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

const REQUIRED_TOOL_CHAIN = [
  'getAccountFullProfile',
  'getRecoveryCaseDetail',
  'getGmailThreadsForAccount',
  'getGmailThreadDetailTool',
  'searchLinearIssuesTool',
  'listSentryIssuesTool',
] as const

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

async function countRows(
  db: SupabaseClient,
  table: string,
  workspaceId: string,
  filters: Record<string, string | boolean> = {}
) {
  let query = db.from(table).select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const result = await query
  if (result.error) throw new Error(`${table}: ${result.error.message}`)
  return result.count ?? 0
}

function readFlag(name: string) {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const workspaceId = readFlag('--workspace-id') ?? process.env.DEFAULT_WORKSPACE_ID
  if (!workspaceId) throw new Error('Pass --workspace-id=<uuid> or configure DEFAULT_WORKSPACE_ID')

  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL')
  const db = createClient(
    supabaseUrl,
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )
  const checks: Check[] = []

  for (const secret of ['AGENT_HISTORY_SIGNING_SECRET', 'CRON_SECRET', 'WORKER_SECRET']) {
    checks.push({
      name: `environment:${secret}`,
      status: process.env[secret]?.trim() ? 'pass' : secret === 'WORKER_SECRET' ? 'fail' : 'warn',
      detail: process.env[secret]?.trim() ? 'configured' : 'missing',
    })
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (anonKey) {
    const anonymousDb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const anonymousAccounts = await anonymousDb
      .from('customer_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
    checks.push({
      name: 'security:anonymous workspace isolation',
      status: anonymousAccounts.error || (anonymousAccounts.count ?? 0) === 0 ? 'pass' : 'fail',
      detail: anonymousAccounts.error
        ? 'anonymous read rejected'
        : `${anonymousAccounts.count ?? 0} account rows visible anonymously`,
    })
  } else {
    checks.push({
      name: 'security:anonymous workspace isolation',
      status: 'warn',
      detail: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing; check not run',
    })
  }

  const schemaProbe = await db
    .from('follow_up_drafts')
    .select('recipient_email, body_full, content_hash, approved_content_hash, provider_message_id, send_idempotency_key, send_error')
    .eq('workspace_id', workspaceId)
    .limit(1)
  checks.push({
    name: 'schema:follow_up_drafts recovery columns',
    status: schemaProbe.error ? 'fail' : 'pass',
    detail: schemaProbe.error?.message ?? 'current',
  })

  const { data: jobs, error: jobsError } = await db
    .from('workflow_jobs')
    .select('status, job_type')
    .eq('workspace_id', workspaceId)
  if (jobsError) throw new Error(`workflow_jobs: ${jobsError.message}`)
  const pendingJobs = (jobs ?? []).filter(job => job.status === 'pending').length
  const sendJobs = (jobs ?? []).filter(job => job.job_type === 'send_approved_draft' && job.status === 'pending').length
  checks.push({
    name: 'queue:pending jobs',
    status: pendingJobs === 0 ? 'pass' : 'fail',
    detail: `${pendingJobs} pending (${sendJobs} pending send jobs)`,
  })

  const unprocessedEvents = await countRows(db, 'webhook_events', workspaceId, { processed: false })
  checks.push({
    name: 'events:processed',
    status: unprocessedEvents === 0 ? 'pass' : 'fail',
    detail: `${unprocessedEvents} unprocessed`,
  })

  const recoveryCases = await countRows(db, 'recovery_cases', workspaceId)
  checks.push({
    name: 'recovery:cases',
    status: recoveryCases > 0 ? 'pass' : 'fail',
    detail: `${recoveryCases} cases`,
  })

  const { data: identities, error: identitiesError } = await db
    .from('provider_identities')
    .select('verification_status')
    .eq('workspace_id', workspaceId)
  if (identitiesError) throw new Error(`provider_identities: ${identitiesError.message}`)
  const verifiedIdentities = (identities ?? []).filter(identity => identity.verification_status === 'verified').length
  const inferredIdentities = (identities ?? []).filter(identity => identity.verification_status === 'inferred').length
  checks.push({
    name: 'identity:verified provider mappings',
    status: verifiedIdentities > 0 ? 'pass' : 'fail',
    detail: `${verifiedIdentities} verified, ${inferredIdentities} inferred`,
  })

  const { data: connections, error: connectionsError } = await db
    .from('integration_connections')
    .select('provider, status, last_synced_at')
    .eq('workspace_id', workspaceId)
  if (connectionsError) throw new Error(`integration_connections: ${connectionsError.message}`)
  const coreProviders = ['stripe', 'posthog', 'gmail', 'intercom']
  for (const provider of coreProviders) {
    const connection = (connections ?? []).find(row => row.provider === provider)
    const ageHours = connection?.last_synced_at
      ? (Date.now() - new Date(connection.last_synced_at).getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY
    checks.push({
      name: `integration:${provider}`,
      status: connection?.status !== 'connected' ? 'fail' : ageHours <= 24 ? 'pass' : 'warn',
      detail: connection
        ? `${connection.status}; ${Number.isFinite(ageHours) ? `${ageHours.toFixed(1)}h since sync` : 'never synced'}`
        : 'missing connection',
    })
  }

  const { data: runs, error: runsError } = await db
    .from('agent_runs')
    .select('metadata')
    .eq('workspace_id', workspaceId)
    .eq('run_type', 'chat_message')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (runsError) throw new Error(`agent_runs: ${runsError.message}`)
  const toolCounts = Object.fromEntries(REQUIRED_TOOL_CHAIN.map(tool => [tool, 0]))
  let completeChainRuns = 0
  for (const run of runs ?? []) {
    const metadata = run.metadata && typeof run.metadata === 'object'
      ? run.metadata as Record<string, unknown>
      : {}
    const tools = Array.isArray(metadata.toolsUsed)
      ? metadata.toolsUsed.filter((tool): tool is string => typeof tool === 'string')
      : []
    for (const tool of REQUIRED_TOOL_CHAIN) if (tools.includes(tool)) toolCounts[tool] += 1
    if (REQUIRED_TOOL_CHAIN.every(tool => tools.includes(tool))) completeChainRuns += 1
  }
  checks.push({
    name: 'agent:complete cross-provider chain',
    status: completeChainRuns > 0 ? 'pass' : 'fail',
    detail: `${completeChainRuns} complete runs; ${Object.entries(toolCounts).map(([tool, count]) => `${tool}=${count}`).join(', ')}`,
  })

  console.table(checks)
  const failures = checks.filter(check => check.status === 'fail')
  const warnings = checks.filter(check => check.status === 'warn')
  console.log(`\nReadiness: ${failures.length === 0 ? 'READY' : 'NOT READY'} (${failures.length} failures, ${warnings.length} warnings)`)
  if (failures.length > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
