import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/foundation/database/service';
import { drainWorkflowQueue } from '@/jobs/worker';

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
    const result = await drainWorkflowQueue(supabase);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Drain worker error', detail: err.message },
      { status: 500 }
    );
  }
}
