import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace';

export async function GET(
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
    // 1. Fetch case details
    const { data: recoveryCase, error: caseError } = await supabase
      .from('recovery_cases')
      .select('*, customer_accounts(*)')
      .eq('id', caseId)
      .eq('workspace_id', workspace.id)
      .single();

    if (caseError || !recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // 2. Fetch case events
    const { data: events } = await supabase
      .from('recovery_case_events')
      .select('*')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: true });

    // 3. Fetch linked drafts
    const { data: drafts } = await supabase
      .from('follow_up_drafts')
      .select('*')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });

    // 4. Fetch linked outcomes
    const { data: outcomes } = await supabase
      .from('draft_outcomes')
      .select('*')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id);

    return NextResponse.json({
      case: recoveryCase,
      events: events || [],
      drafts: drafts || [],
      outcomes: outcomes || [],
      workspaceId: workspace.id,
    });
  } catch (error: any) {
    console.error(`[api/recovery/cases/${caseId}] Failed to load case`, error);
    return NextResponse.json(
      { error: 'Failed to load case detail', detail: error.message },
      { status: 500 }
    );
  }
}
