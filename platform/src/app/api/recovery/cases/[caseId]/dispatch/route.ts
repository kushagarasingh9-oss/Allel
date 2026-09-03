import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { createServiceClient } from '@/foundation/database/service';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { requireWorkspaceRole } from '@/recovery/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);

  try {
    await requireWorkspaceRole(supabase, { workspaceId: workspace.id, userId: user.id });
    const serviceClient = createServiceClient();
    const now = new Date().toISOString();

    // 1. Fetch case
    const { data: recoveryCase, error: caseErr } = await serviceClient
      .from('recovery_cases')
      .select('id, status, severity, customer_account_id, customer_accounts(name, domain)')
      .eq('id', caseId)
      .eq('workspace_id', workspace.id)
      .single();

    if (caseErr || !recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // 2. Transition case status to monitoring
    const { error: updateErr } = await serviceClient
      .from('recovery_cases')
      .update({
        status: 'monitoring',
        sent_at: now,
        updated_at: now,
      })
      .eq('id', caseId)
      .eq('workspace_id', workspace.id);

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update case: ${updateErr.message}` }, { status: 500 });
    }

    // 3. Mark drafts as sent
    await serviceClient
      .from('follow_up_drafts')
      .update({
        status: 'sent',
        sent_at: now,
        updated_at: now,
      })
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id);

    // 4. Log immutable audit event
    await serviceClient.from('recovery_case_events').insert({
      workspace_id: workspace.id,
      recovery_case_id: caseId,
      event_type: 'outreach_dispatched',
      from_status: recoveryCase.status,
      to_status: 'monitoring',
      actor_type: 'user',
      actor_id: user.id,
      detail: { action: 'founder_approved_outreach', source: 'flows_table' },
      created_at: now,
    });

    const accName = (recoveryCase.customer_accounts as { name?: string } | null)?.name || 'Account';

    return NextResponse.json({
      success: true,
      caseId,
      newStatus: 'monitoring',
      message: `Outreach dispatched for ${accName}. Shifted to Monitoring.`,
    });
  } catch (error: any) {
    console.error('[api/recovery/cases/dispatch] Failed to dispatch outreach:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to dispatch outreach' },
      { status: 500 }
    );
  }
}
