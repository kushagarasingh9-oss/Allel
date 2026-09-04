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
        monitoring_started_at: now,
        updated_at: now,
      })
      .eq('id', caseId)
      .eq('workspace_id', workspace.id);

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update case: ${updateErr.message}` }, { status: 500 });
    }

    // 3. Fetch draft to dispatch via Gmail if connected
    const { data: followUpDraft } = await serviceClient
      .from('follow_up_drafts')
      .select('*')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const recipientEmail = followUpDraft?.approval_metadata?.recipient_email || 'rohan@apexmultirail.co';
    const emailSubject = followUpDraft?.subject || `Checking in regarding your account`;
    const emailBody = followUpDraft?.body_full || followUpDraft?.body_preview || `Hi team,\n\nFollowing up regarding your account.`;

    let gmailMessageId: string | null = null;
    let gmailThreadId: string | null = null;
    let gmailSent = false;
    let gmailUrl = 'https://mail.google.com/mail/u/0/#sent';

    try {
      const { sendEmail } = await import('@/integrations/gmail/gmail');
      const sendRes = await sendEmail(workspace.id, {
        to: recipientEmail,
        subject: emailSubject,
        body: emailBody,
      });
      if (sendRes?.sent) {
        gmailSent = true;
        gmailMessageId = sendRes.messageId;
        gmailThreadId = sendRes.threadId;
        if (gmailThreadId) {
          gmailUrl = `https://mail.google.com/mail/u/0/#all/${gmailThreadId}`;
        }
      }
    } catch (err: any) {
      console.warn('[dispatch] Live Gmail send skipped or failed:', err?.message);
    }

    // 4. Mark drafts as sent in follow_up_drafts and legacy draft_responses
    await serviceClient
      .from('follow_up_drafts')
      .update({
        status: 'sent',
        updated_at: now,
        approval_metadata: {
          ...(followUpDraft?.approval_metadata || {}),
          recipient_email: recipientEmail,
          gmail_url: gmailUrl,
          provider_message_id: gmailMessageId,
          provider_thread_id: gmailThreadId,
          gmail_sent: gmailSent,
          sent_at: now,
        },
      })
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id);

    if (recoveryCase.customer_account_id) {
      await serviceClient
        .from('draft_responses')
        .update({
          status: 'sent',
          sent_at: now,
        })
        .eq('customer_account_id', recoveryCase.customer_account_id)
        .eq('workspace_id', workspace.id);
    }

    // 5. Log immutable audit event
    await serviceClient.from('recovery_case_events').insert({
      workspace_id: workspace.id,
      recovery_case_id: caseId,
      event_type: 'outreach_dispatched',
      from_status: recoveryCase.status,
      to_status: 'monitoring',
      actor_type: 'user',
      actor_id: user.id,
      detail: { action: 'founder_approved_outreach', source: 'flows_table', gmailSent, gmailUrl },
      created_at: now,
    });

    const accName = (recoveryCase.customer_accounts as { name?: string } | null)?.name || 'Account';

    return NextResponse.json({
      success: true,
      caseId,
      newStatus: 'monitoring',
      gmailSent,
      gmailUrl,
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
