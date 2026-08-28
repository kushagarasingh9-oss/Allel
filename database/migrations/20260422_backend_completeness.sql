-- Migration: Backend completeness fixes
-- 1. Add UNIQUE constraint on integration_tokens that the upsert relies on
-- 2. Update integration_connections provider CHECK to include all supported providers

-- 1. The saveEncryptedToken() upsert uses onConflict: 'workspace_id,provider,token_type'
--    but no UNIQUE index existed. This caused potential duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_tokens_unique
  ON public.integration_tokens (workspace_id, provider, token_type);
