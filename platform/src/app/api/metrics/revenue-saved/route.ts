/**
 * Revenue Saved API
 *
 * GET /api/metrics/revenue-saved
 * Returns the strictly verified revenue saved by Allel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { createServiceClient } from '@/foundation/database/service';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { calculateRecoveryMetrics } from '@/recovery/metrics';
import { RecoveryApiError, requireWorkspaceRole } from '@/recovery/api-auth';

export async function GET(request: NextRequest) {
  let supabase = await createClient();
  let user: any = null;

  // Try cookie-based session first
  const { data: cookieAuth } = await supabase.auth.getUser();
  if (cookieAuth?.user) {
    user = cookieAuth.user;
  } else {
    // Try Bearer token
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const serviceSupabase = createServiceClient();
      const { data: bearerAuth } = await serviceSupabase.auth.getUser(token);
      if (bearerAuth?.user) {
        user = bearerAuth.user;
        supabase = serviceSupabase;
      }
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);

  try {
    await requireWorkspaceRole(supabase, { workspaceId: workspace.id, userId: user.id });
    const metrics = await calculateRecoveryMetrics(supabase, workspace.id);

    return NextResponse.json({
      testMode: metrics.testMode,
      currency: metrics.currency,
      strictRecoveredCents: metrics.strictRecoveredCents,
      protectedCents: metrics.protectedCents,
      atRiskCents: metrics.atRiskCents,
      engagedCases: metrics.engagedCases,
      productRecoveredCases: metrics.productRecoveredCases,
      churnedCases: metrics.churnedCases,
      pendingCases: metrics.pendingCases,
      unknownCases: metrics.unknownCases,
      observationStart: metrics.observationStart,
      observationEnd: metrics.observationEnd,
      policyVersion: metrics.policyVersion,
      attributionVersion: metrics.attributionVersion || '2.0.0',
      disclosures: {
        testMode: 'Test-mode recovery simulation. No production customer funds are represented.',
        riskIndex: 'Risk index, not a predicted probability of churn.',
      },
      // Compatibility fields
      revenueSavedCents: metrics.strictRecoveredCents,
      revenueSavedFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(metrics.strictRecoveredCents / 100),
      recovered: metrics.strictRecoveredCents > 0 ? 1 : 0,
      responded: metrics.engagedCases,
      churned: metrics.churnedCases,
      pending: metrics.pendingCases,
    });
  } catch (error: any) {
    console.error('[metrics/revenue-saved] Error:', error);
    if (error instanceof RecoveryApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Unable to calculate recovery metrics', code: 'METRICS_UNAVAILABLE' },
      { status: 500 }
    );
  }
}
