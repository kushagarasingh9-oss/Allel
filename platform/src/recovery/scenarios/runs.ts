import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export class ScenarioRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioRunError';
  }
}

export function createScenarioRunId(now: number = Date.now()): string {
  return `allel-run-${now}-${randomUUID().slice(0, 8)}`;
}

export async function createScenarioRun(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    scenarioRunId?: string;
    testMode: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  if (input.testMode !== true) {
    throw new ScenarioRunError('Scenario runs may only be created in explicit test mode');
  }

  const scenarioRunId = input.scenarioRunId || createScenarioRunId();
  if (!/^allel-run-[a-zA-Z0-9_-]{3,160}$/.test(scenarioRunId)) {
    throw new ScenarioRunError('Scenario run ID is invalid');
  }

  const { error } = await supabase.from('recovery_scenario_runs').insert({
    id: scenarioRunId,
    workspace_id: input.workspaceId,
    test_mode: true,
    status: 'active',
    metadata: input.metadata || {},
  });

  if (error) {
    throw new ScenarioRunError(`Unable to create scenario run: ${error.message}`);
  }

  return scenarioRunId;
}
