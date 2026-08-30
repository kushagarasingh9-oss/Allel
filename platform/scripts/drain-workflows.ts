import { resolve } from 'node:path'
import { config } from 'dotenv'

config({ path: resolve(process.cwd(), '.env.local') })

function readFlag(name: string) {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const { createServiceClient } = await import('@/foundation/database/service')
  const { drainWorkflowQueue } = await import('@/jobs/worker')

  const workspaceId = readFlag('--workspace-id') ?? process.env.DEFAULT_WORKSPACE_ID
  if (!workspaceId) throw new Error('Pass --workspace-id=<uuid> or configure DEFAULT_WORKSPACE_ID')

  const allowSend = process.argv.includes('--allow-send')
  const db = createServiceClient()

  const schemaProbe = await db
    .from('follow_up_drafts')
    .select('recipient_email, body_full, content_hash, send_idempotency_key')
    .eq('workspace_id', workspaceId)
    .limit(1)
  if (schemaProbe.error) {
    throw new Error(
      `Database recovery migrations are incomplete: ${schemaProbe.error.message}. Run npm run migrations:apply with DATABASE_URL or a Supabase management token before draining.`
    )
  }

  const { data: pending, error } = await db
    .from('workflow_jobs')
    .select('job_type')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
  if (error) throw new Error(`Failed to inspect pending jobs: ${error.message}`)

  const sendJobs = (pending ?? []).filter(job => job.job_type === 'send_approved_draft').length
  if (sendJobs > 0 && !allowSend) {
    throw new Error(
      `Refusing to drain: ${sendJobs} pending send_approved_draft job(s). Review them or rerun with --allow-send.`
    )
  }

  console.log(`Draining ${pending?.length ?? 0} pending jobs for workspace ${workspaceId}`)
  const result = await drainWorkflowQueue(db, {
    workerId: `manual_${Date.now()}`,
    batchSize: 10,
    maxRuns: 50,
    deadlineMs: 120_000,
  })
  console.log(result)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
