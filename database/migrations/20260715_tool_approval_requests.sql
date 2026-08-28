-- Tool Approval Requests
-- Stores pending, approved, rejected, and executed tool-call requests
-- that require explicit founder approval before execution.

CREATE TABLE IF NOT EXISTS tool_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- What tool was requested
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL DEFAULT '{}',
  tool_description TEXT,

  -- Who / what requested it
  persona_id TEXT NOT NULL DEFAULT 'alex',
  session_id TEXT,
  run_id UUID,

  -- Human-readable context for the founder
  action_summary TEXT NOT NULL,
  account_name TEXT,
  customer_account_id UUID REFERENCES customer_accounts(id) ON DELETE SET NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired', 'failed')),

  -- Approval / rejection metadata
  decided_at TIMESTAMPTZ,
  decided_by TEXT,               -- 'founder' | user email
  rejection_reason TEXT,

  -- Execution result (populated after approved + executed)
  execution_result JSONB,
  execution_error TEXT,
  executed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),

  -- Metadata for run inspection
  metadata JSONB DEFAULT '{}'
);

-- Fast lookups by workspace + status (the primary query pattern)
CREATE INDEX IF NOT EXISTS idx_tool_approvals_workspace_status
  ON tool_approval_requests (workspace_id, status, created_at DESC);

-- Fast lookups by workspace + pending (for the approval queue)
CREATE INDEX IF NOT EXISTS idx_tool_approvals_pending
  ON tool_approval_requests (workspace_id, created_at DESC)
  WHERE status = 'pending';

-- Lookup by session (to show approval cards in the right chat thread)
CREATE INDEX IF NOT EXISTS idx_tool_approvals_session
  ON tool_approval_requests (workspace_id, session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- RLS policies
ALTER TABLE tool_approval_requests ENABLE ROW LEVEL SECURITY;

-- Workspace members can read their workspace's approval requests
CREATE POLICY tool_approvals_select_policy ON tool_approval_requests
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Workspace members can update (approve/reject) their workspace's approval requests
CREATE POLICY tool_approvals_update_policy ON tool_approval_requests
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role inserts (agent creates requests server-side)
CREATE POLICY tool_approvals_insert_service ON tool_approval_requests
  FOR INSERT
  WITH CHECK (true);
