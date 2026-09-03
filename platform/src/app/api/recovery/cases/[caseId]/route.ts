import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { createServiceClient } from '@/foundation/database/service';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { RecoveryApiError, requireWorkspaceRole } from '@/recovery/api-auth';

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
    await requireWorkspaceRole(supabase, { workspaceId: workspace.id, userId: user.id });
    const serviceClient = createServiceClient();

    // 1. Fetch case details
    const { data: recoveryCase, error: caseError } = await serviceClient
      .from('recovery_cases')
      .select('id, customer_account_id, case_key, status, resolution, severity, risk_score, score_confidence, revenue_priority, mrr_baseline_cents, trigger_provider, trigger_event_type, scenario_id, scenario_run_id, action_type, action_reason, suppression_reason, evidence_snapshot, opened_at, approved_at, sent_at, resolved_at, failed_at, updated_at, customer_accounts(name, domain)')
      .eq('id', caseId)
      .eq('workspace_id', workspace.id)
      .single();

    if (caseError || !recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const accountRelation = recoveryCase.customer_accounts as unknown as
      | { name?: string | null; domain?: string | null }
      | Array<{ name?: string | null; domain?: string | null }>
      | null
    const customerAccountId = (recoveryCase as { customer_account_id?: string | null }).customer_account_id

    // 2. Fetch inspectable, non-provider-payload evidence.
    const { data: events, error: eventsError } = await supabase
      .from('recovery_case_events')
      .select('id, event_type, from_status, to_status, actor_type, actor_id, detail, created_at')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: true });

    // 3. Draft lifecycle evidence. body_full and raw provider responses are
    // intentionally excluded from a dashboard detail response.
    const { data: rawDrafts, error: draftsError } = await supabase
      .from('follow_up_drafts')
      .select('id, status, subject, body_preview, approval_metadata, created_at, updated_at')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });

    const drafts = (rawDrafts ?? []).map((d: any) => ({
      ...d,
      recipient_email: d.recipient_email || d.approval_metadata?.recipient_email || null,
    }));

    // 4. Fetch linked outcomes and queue attempts for reviewer inspection.
    const { data: outcomes, error: outcomesError } = await supabase
      .from('draft_outcomes')
      .select('id, outcome_type, evidence_provider, evidence_external_id, occurred_at, strict_recovered_cents, protected_cents, is_test_mode, created_at')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id);

    let jobs: any[] = [];
    try {
      const { data: jobsData, error: jobsError } = await supabase
        .from('workflow_jobs')
        .select('id, job_type, status, attempt_count, max_attempts, created_at, updated_at, completed_at')
        .eq('recovery_case_id', caseId)
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (jobsError) console.warn(`[api/recovery/cases/${caseId}] workflow_jobs query warning:`, jobsError.message);
      jobs = jobsData || [];
    } catch {
      jobs = [];
    }

    let contacts: any[] = [];
    let features: any = null;
    if (customerAccountId) {
      try {
        const { data: contactsData, error: contactsError } = await supabase
          .from('account_contacts')
          .select('email, is_primary')
          .eq('workspace_id', workspace.id)
          .eq('customer_account_id', customerAccountId)
          .order('is_primary', { ascending: false });
        if (contactsError) console.warn(`[api/recovery/cases/${caseId}] contacts query warning:`, contactsError.message);
        contacts = contactsData || [];
      } catch {
        contacts = [];
      }

      try {
        const { data: featuresData } = await supabase
          .from('account_features')
          .select('failed_payment_count_30d, last_payment_succeeded_at, usage_delta_percent, unreplied_outbound_count')
          .eq('workspace_id', workspace.id)
          .eq('customer_account_id', customerAccountId)
          .maybeSingle();
        features = featuresData || null;
      } catch {
        features = null;
      }
    }

    return NextResponse.json({
      case: recoveryCase,
      events: events || [],
      drafts: drafts || [],
      outcomes: outcomes || [],
      jobs: jobs || [],
      contacts: contacts || [],
      features: features || null,
      account: Array.isArray(accountRelation) ? accountRelation[0] ?? null : accountRelation,
      workspaceId: workspace.id,
    });
  } catch (error: any) {
    console.error(`[api/recovery/cases/${caseId}] Failed to load case`, error);
    if (error instanceof RecoveryApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Failed to load case detail', code: 'RECOVERY_CASE_DETAIL_UNAVAILABLE' },
      { status: 500 }
    );
  }
}
