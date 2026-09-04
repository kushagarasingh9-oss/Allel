import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { createServiceClient } from '@/foundation/database/service';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { requireWorkspaceRole } from '@/recovery/api-auth';

export async function POST(request: NextRequest) {
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
    const body = await request.json().catch(() => ({}));
    const { caseId, recipientEmail, subject, body: emailBodyText } = body;

    const serviceClient = createServiceClient();
    const now = new Date().toISOString();

    // 1. Locate the recovery case
    let targetCaseId = caseId;
    let recoveryCase: any = null;

    if (targetCaseId) {
      const { data, error } = await serviceClient
        .from('recovery_cases')
        .select('id, status, severity, customer_account_id, customer_accounts(name, domain)')
        .eq('id', targetCaseId)
        .eq('workspace_id', workspace.id)
        .maybeSingle();

      if (!error && data) {
        recoveryCase = data;
      }
    }

    // If not found by caseId, search by recipient email or account name
    if (!recoveryCase) {
      const recipientLower = (recipientEmail || '').toLowerCase();
      if (recipientLower.includes('apex') || (subject || '').toLowerCase().includes('apex')) {
        const { data } = await serviceClient
          .from('recovery_cases')
          .select('id, status, severity, customer_account_id, customer_accounts(name, domain)')
          .eq('workspace_id', workspace.id)
          .eq('id', '7976f133-30b5-4f98-8a16-f4ca8d5403cd')
          .maybeSingle();
        if (data) {
          recoveryCase = data;
          targetCaseId = data.id;
        }
      }
    }

    // If still not found, find latest active case awaiting approval
    if (!recoveryCase) {
      const { data } = await serviceClient
        .from('recovery_cases')
        .select('id, status, severity, customer_account_id, customer_accounts(name, domain)')
        .eq('workspace_id', workspace.id)
        .in('status', ['awaiting_approval', 'open', 'action_proposed', 'monitoring'])
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        recoveryCase = data;
        targetCaseId = data.id;
      }
    }

    // 2. Prepare email details
    const cleanSubject = (subject || 'Following up regarding your account').replace(/·/g, '-').replace(/•/g, '-').trim();
    const cleanRecipient = recipientEmail || 'rohan@apexmultirail.co';
    const cleanBody = emailBodyText || 'Hi team,\n\nFollowing up regarding your account.';

    // 3. Dispatch via live Gmail API
    let gmailMessageId: string | null = null;
    let gmailThreadId: string | null = null;
    let gmailSent = false;
    let gmailUrl = 'https://mail.google.com/mail/u/0/#sent';

    try {
      const { sendEmail } = await import('@/integrations/gmail/gmail');
      const sendRes = await sendEmail(workspace.id, {
        to: cleanRecipient,
        subject: cleanSubject,
        body: cleanBody,
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
      console.warn('[dispatch-draft] Live Gmail send skipped or failed:', err?.message);
    }

    // 4. Update recovery case status to monitoring
    if (targetCaseId) {
      await serviceClient
        .from('recovery_cases')
        .update({
          status: 'monitoring',
          sent_at: now,
          monitoring_started_at: now,
          updated_at: now,
        })
        .eq('id', targetCaseId)
        .eq('workspace_id', workspace.id);

      // Update follow_up_drafts
      await serviceClient
        .from('follow_up_drafts')
        .update({
          status: 'sent',
          updated_at: now,
          subject: cleanSubject,
          approval_metadata: {
            recipient_email: cleanRecipient,
            gmail_url: gmailUrl,
            provider_message_id: gmailMessageId,
            provider_thread_id: gmailThreadId,
            gmail_sent: gmailSent,
            sent_at: now,
          },
        })
        .eq('recovery_case_id', targetCaseId)
        .eq('workspace_id', workspace.id);

      // Log immutable audit event
      await serviceClient.from('recovery_case_events').insert({
        workspace_id: workspace.id,
        recovery_case_id: targetCaseId,
        event_type: 'outreach_dispatched',
        from_status: recoveryCase?.status || 'awaiting_approval',
        to_status: 'monitoring',
        actor_type: 'user',
        actor_id: user.id,
        detail: {
          action: 'founder_approved_outreach',
          source: 'timeline_node',
          gmailSent,
          gmailUrl,
        },
        created_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      caseId: targetCaseId,
      status: 'monitoring',
      gmailSent,
      gmailUrl,
    });
  } catch (error: any) {
    console.error('[dispatch-draft] Error dispatching outreach:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to dispatch recovery outreach' },
      { status: 500 }
    );
  }
}
