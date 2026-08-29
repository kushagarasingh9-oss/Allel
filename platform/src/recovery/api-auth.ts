import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export class RecoveryApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RecoveryApiError';
  }
}

export async function requireWorkspaceRole(
  supabase: SupabaseClient,
  input: { workspaceId: string; userId: string; roles?: WorkspaceRole[] }
): Promise<WorkspaceRole> {
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (error) {
    throw new RecoveryApiError(500, 'AUTHORIZATION_CHECK_FAILED', 'Unable to verify workspace authorization');
  }
  if (!membership) {
    throw new RecoveryApiError(403, 'WORKSPACE_ACCESS_DENIED', 'Workspace access is required');
  }

  const role = membership.role as WorkspaceRole;
  if (input.roles && !input.roles.includes(role)) {
    throw new RecoveryApiError(403, 'WORKSPACE_ADMIN_REQUIRED', 'A workspace owner or admin is required');
  }

  return role;
}
