-- Fix all integration provider CHECK constraints
-- Add all new providers to integration_connections and drop old constraints on integration_tokens

-- 1. Fix integration_connections CHECK constraint
alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (
    provider in (
      'stripe',
      'posthog',
      'gmail',
      'intercom',
      'helpscout',
      'slack',
      'google_calendar',
      'hubspot',
      'sentry',
      'linear',
      'airtable',
      'notion',
      'supabase',
      'google_docs',
      'google_drive',
      'github'
    )
  );

-- 2. Fix integration_tokens CHECK constraint (if any exists from init migration)
-- The init migration may have created this table with a CHECK constraint
do $$
begin
  -- Try to drop any existing provider check constraint on integration_tokens
  begin
    alter table public.integration_tokens
      drop constraint if exists integration_tokens_provider_check;
  exception when undefined_object then
    null;
  end;
end $$;
