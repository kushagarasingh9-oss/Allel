/**
 * Refresh Founder Brief — Durable worker job handler
 *
 * §11.12: Triggered as part of reconciliation after case transitions or cron.
 * Regenerates the workspace brief from live state without running a full daily sync.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief';

export async function handleRefreshFounderBrief(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;

  if (!workspaceId) {
    throw new Error('refresh_founder_brief requires workspaceId');
  }

  const result = await generateWorkspaceBrief(workspaceId);

  return {
    success: true,
    workspaceId,
  };
}
