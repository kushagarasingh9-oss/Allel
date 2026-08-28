import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);
  const searchParams = request.nextUrl.searchParams;

  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const resolution = searchParams.get('resolution');
  const accountId = searchParams.get('accountId');
  const scenarioId = searchParams.get('scenarioId');
  const limit = Math.min(Number.parseInt(searchParams.get('limit') ?? '40', 10), 100);

  try {
    let query = supabase
      .from('recovery_cases')
      .select('*, customer_accounts(name, domain)')
      .eq('workspace_id', workspace.id)
      .order('opened_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (resolution) query = query.eq('resolution', resolution);
    if (accountId) query = query.eq('customer_account_id', accountId);
    if (scenarioId) query = query.eq('scenario_id', scenarioId);

    const { data: cases, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      cases: cases || [],
      workspaceId: workspace.id,
      count: cases?.length || 0,
    });
  } catch (error: any) {
    console.error('[api/recovery/cases] Failed to load recovery cases', error);
    return NextResponse.json(
      { error: 'Failed to load recovery cases', detail: error.message },
      { status: 500 }
    );
  }
}
