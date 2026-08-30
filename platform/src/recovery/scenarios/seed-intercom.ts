import { DemoCustomerScenario } from "./generator";

export interface IntercomSeedResult {
  totalCreated: number;
  contactIds: Record<string, string>;
  notes: string[];
}

export async function seedIntercomScenarios(options: {
  scenarios: DemoCustomerScenario[];
  workspaceId: string;
  scenarioRunId: string;
  intercomKey?: string;
}): Promise<IntercomSeedResult> {
  const contactIds: Record<string, string> = {};
  const notes: string[] = [];
  let totalCreated = 0;

  for (const s of options.scenarios) {
    if (!s.intercom.enabled) continue;
    const dummyId = `ic_contact_${s.scenarioId.toLowerCase()}`;
    contactIds[s.scenarioId] = dummyId;
    s.intercom.externalContactKey = dummyId;
    totalCreated++;
  }

  notes.push(`Simulated/seeded ${totalCreated} Intercom contextual test contacts with metadata markers.`);
  return { totalCreated, contactIds, notes };
}
