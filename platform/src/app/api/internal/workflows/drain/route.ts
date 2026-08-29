import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/foundation/database/service';
import { drainWorkflowQueue } from '@/jobs/worker';
import { enqueueWorkflowJob } from '@/jobs/queue';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.WORKER_SECRET;

  const providedToken = authHeader?.replace(/^Bearer\s+/i, '');
  const isValid =
    (cronSecret && providedToken === cronSecret) ||
    (workerSecret && providedToken === workerSecret) ||
    process.env.NODE_ENV !== 'production';

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized worker invocation' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const gmailSyncJobs = await enqueueScheduledGmailHistorySyncs(supabase);
    const result = await drainWorkflowQueue(supabase);
    return NextResponse.json({ ...result, gmailSyncJobs });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Drain worker error', detail: err.message },
      { status: 500 }
    );
  }
}

// Vercel Cron dispatches GET requests. Keep POST for external workers while
// allowing the same authenticated, bounded drain to be scheduled internally.
export const GET = POST;

/**
 * Gmail has no inbound webhook in this integration. The recurring worker
 * therefore schedules one idempotent history read per connected workspace;
 * the history cursor guarantees that this is incremental rather than an inbox
 * rescan and that replies are fed into the same provider-event pipeline.
 */
async function enqueueScheduledGmailHistorySyncs(
  supabase: ReturnType<typeof createServiceClient>
) {
  const { data: connections, error } = await supabase
    .from('integration_connections')
    .select('workspace_id')
    .eq('provider', 'gmail')
    .eq('status', 'connected');
  if (error) throw new Error(`Failed to list Gmail connections: ${error.message}`);

  const minuteBucket = new Date().toISOString().slice(0, 16);
  let enqueued = 0;
  for (const connection of connections ?? []) {
    const { duplicate } = await enqueueWorkflowJob(supabase, {
      workspaceId: connection.workspace_id,
      jobType: 'sync_gmail_history',
      idempotencyKey: `ws:${connection.workspace_id}:gmail_history:${minuteBucket}`,
      payload: { workspaceId: connection.workspace_id, trigger: 'scheduled_poll' },
      priority: 60,
    });
    if (!duplicate) enqueued += 1;
  }
  return enqueued;
}
