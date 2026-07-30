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
      'linear'
    )
  );
