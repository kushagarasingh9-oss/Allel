import { SCENARIO_MANIFEST_V1 } from "./manifest.v1";

export type DemoCustomerScenario = {
  scenarioId: string;
  scenarioRunId: string;
  customerKey: string;

  account: {
    name: string;
    domain: string;
    industry: string;
    segment: "startup" | "smb" | "mid_market" | "enterprise";
    lifecycleStage:
      | "trial"
      | "onboarding"
      | "active"
      | "at_risk"
      | "past_due"
      | "cancelled"
      | "recovered";
    planName: string;
    seats: number;
    initialMrrCents: number;
    currentMrrCents: number;
    renewalAt: string;
  };

  primaryContact: {
    name: string;
    email: string;
    role: string;
    isPrimary: true;
    allowOutbound: boolean;
  };

  secondaryContacts: Array<{
    name: string;
    email: string;
    role: string;
    allowOutbound: boolean;
  }>;

  stripe: {
    enabled: boolean;
    customerId?: string;
    subscriptionId?: string;
    invoiceId?: string;
    customerMetadataKey: string;
    subscriptionStatus:
      | "trialing"
      | "active"
      | "past_due"
      | "unpaid"
      | "canceled";
    paymentFailureCount7d: number;
    paymentFailureCount30d: number;
    expectedRecoveryTransition?: string;
  };

  posthog: {
    enabled: boolean;
    distinctIds: string[];
    accountExternalId: string;
    previous7dSessions: number;
    current7dSessions: number;
    previous7dKeyActions: number;
    current7dKeyActions: number;
    cancellationIntent: boolean;
    recoveryAction: boolean;
  };

  intercom: {
    enabled: boolean;
    externalContactKey: string;
    openConversationCount: number;
    topic:
      | "billing"
      | "integration"
      | "onboarding"
      | "feature_request"
      | "cancellation"
      | "positive_resolution"
      | "none";
    sentiment: "positive" | "neutral" | "frustrated";
  };

  policy: {
    email: "allow" | "do_not_contact" | "snooze";
  };

  expected: {
    risk: boolean;
    severity: "low" | "medium" | "high" | "critical";
    action:
      | "no_action"
      | "monitor_only"
      | "billing_recovery_email"
      | "usage_checkin_email"
      | "cancellation_rescue_email"
      | "compound_recovery_email"
      | "founder_review";
    caseState: string | null;
    resolution:
      | "strictly_recovered"
      | "protected"
      | "product_recovered"
      | "engaged"
      | null;
    strictRecoveredCents: number;
    protectedCents: number;
  };

  notes: string[];
};

export class SeededRNG {
  private s: number;

  constructor(seedStr: string) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    this.s = h >>> 0;
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

const FICTIONAL_COMPANIES = [
  { name: "Northstar Labs", domain: "northstarlabs.io", industry: "Developer Tools" },
  { name: "AtlasDesk", domain: "atlasdesk.com", industry: "Customer Operations" },
  { name: "BeaconFlow", domain: "beaconflow.ai", industry: "Workflow Automation" },
  { name: "Copper Ridge Analytics", domain: "copperridge.co", industry: "Financial Analytics" },
  { name: "Juniper Health Systems", domain: "juniperhealth.org", industry: "Healthcare SaaS" },
  { name: "Orbital Ledger", domain: "orbitalledger.net", industry: "FinTech Infrastructure" },
  { name: "SummitOps", domain: "summitops.io", industry: "Cloud Infrastructure" },
  { name: "BlueHarbor Security", domain: "blueharbor.dev", industry: "Cybersecurity" },
  { name: "LatticeForge", domain: "latticeforge.com", industry: "Engineering Tools" },
  { name: "Fieldstone Commerce", domain: "fieldstone.shop", industry: "E-Commerce Infrastructure" },
  { name: "NimbusRoute", domain: "nimbusroute.app", industry: "Logistics Software" },
  { name: "Redwood Metrics", domain: "redwoodmetrics.io", industry: "Product Analytics" },
  { name: "SignalNest", domain: "signalnest.com", industry: "Telemetry & Observability" },
  { name: "CedarStack", domain: "cedarstack.tech", industry: "Database Tooling" },
  { name: "Brightwell AI", domain: "brightwell.ai", industry: "Machine Learning Platform" },
  { name: "Harborline Systems", domain: "harborline.io", industry: "Supply Chain Software" },
  { name: "Kinetic Cloud", domain: "kineticcloud.net", industry: "Compute Orchestration" },
  { name: "AuroraBridge", domain: "aurorabridge.com", industry: "API Integration" },
  { name: "TandemWorks", domain: "tandemworks.co", industry: "Workplace Collaboration" },
  { name: "VanguardStream", domain: "vanguardstream.io", industry: "Media Streaming Infrastructure" },
  { name: "Solstice Bio", domain: "solsticebio.com", industry: "Biotech SaaS" },
  { name: "Kestrel Pay", domain: "kestrelpay.co", industry: "Payments Infrastructure" },
  { name: "StrataCore", domain: "stratacore.cloud", industry: "DevOps & SRE" },
  { name: "Ironclad Logic", domain: "ironcladlogic.com", industry: "Compliance & Risk" },
  { name: "NovaScale", domain: "novascale.io", industry: "Serverless Compute" },
  { name: "Prism Dynamics", domain: "prismdynamics.net", industry: "Computer Vision" },
  { name: "Vertex AI Labs", domain: "vertexlabs.tech", industry: "AI Agents" },
  { name: "Hyperion Fleet", domain: "hyperionfleet.com", industry: "Fleet Telematics" },
  { name: "Axiom Freight", domain: "axiomfreight.io", industry: "Freight Marketplace" },
  { name: "PulseGrid", domain: "pulsegrid.energy", industry: "CleanTech Grid Management" },
  { name: "Meridian Flow", domain: "meridianflow.io", industry: "Data Pipelines" },
  { name: "Apex Protocol", domain: "apexprotocol.org", industry: "Web3 Infrastructure" },
  { name: "Aegis Data", domain: "aegisdata.co", industry: "Data Governance" },
  { name: "Horizon Studio", domain: "horizonstudio.design", industry: "Creative Collaboration" },
  { name: "Zenith Cloud", domain: "zenithcloud.io", industry: "Hybrid Cloud" },
  { name: "Cobalt Wire", domain: "cobaltwire.com", industry: "Networking Software" },
  { name: "Crestview Capital Tools", domain: "crestviewtools.com", industry: "Private Equity Software" },
  { name: "EchoWave", domain: "echowave.audio", industry: "Audio Processing API" },
  { name: "Silverback Ops", domain: "silverbackops.com", industry: "Site Reliability" },
  { name: "Foundry9", domain: "foundry9.build", industry: "Rapid Prototyping" },
  { name: "Verve Mobility", domain: "vervemobility.io", industry: "Transit Tech" },
  { name: "Opal Metrics", domain: "opalmetrics.co", industry: "SaaS Benchmarking" },
  { name: "Titanium DB", domain: "titaniumdb.org", industry: "Distributed Database" },
  { name: "Zephyr Energy", domain: "zephyrenergy.io", industry: "Renewables Management" },
  { name: "Crestline Health", domain: "crestlinehealth.care", industry: "Telehealth Tech" },
  { name: "Vortex Intelligence", domain: "vortexintel.ai", industry: "Threat Intelligence" },
  { name: "Quarry Logic", domain: "quarrylogic.com", industry: "Enterprise Search" },
  { name: "Lumina Security", domain: "luminasec.io", industry: "Identity Governance" },
  { name: "Pinecone Logistics", domain: "pineconelogistics.net", industry: "Warehouse Management" },
  { name: "Starlight Comms", domain: "starlightcomms.com", industry: "Customer Comms Platform" },
];

const FICTIONAL_CONTACTS = [
  { name: "Maya Chen", role: "Finance Director" },
  { name: "Daniel Okafor", role: "VP Operations" },
  { name: "Priya Raman", role: "Head of Customer Success" },
  { name: "Elena García", role: "Product Lead" },
  { name: "Noah Williams", role: "Founder" },
  { name: "Amara Johnson", role: "Controller" },
  { name: "Leo Martins", role: "Engineering Manager" },
  { name: "Sofia Patel", role: "COO" },
  { name: "Lucas Bennett", role: "Head of Growth" },
  { name: "Aria Thorne", role: "VP Engineering" },
  { name: "Kai Takahashi", role: "Chief Architect" },
  { name: "Zoe Alverez", role: "Billing Manager" },
  { name: "Marcus Vance", role: "CEO" },
  { name: "Chloe Dupont", role: "Operations Lead" },
  { name: "Julian Sterling", role: "VP Finance" },
];

export function generateScenarios(options: {
  profile: "canonical" | "showcase" | "load";
  workspaceId: string;
  scenarioRunId: string;
  seed?: string;
  count?: number;
  referenceTime?: string;
  recipientDomain?: string;
}): DemoCustomerScenario[] {
  const rng = new SeededRNG(options.seed || "allel-buildathon-v1");
  const refTime = options.referenceTime || new Date().toISOString();
  const domainSuffix = options.recipientDomain || "demo.allel.co";

  if (options.profile === "canonical") {
    return SCENARIO_MANIFEST_V1.map((c, i) => {
      const contact = FICTIONAL_CONTACTS[i % FICTIONAL_CONTACTS.length];
      const comp = FICTIONAL_COMPANIES[i % FICTIONAL_COMPANIES.length];
      const cleanEmail = `${contact.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@${comp.domain}`;

      return {
        scenarioId: c.scenarioId,
        scenarioRunId: options.scenarioRunId,
        customerKey: `cust_${c.scenarioId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        account: {
          name: c.accountName,
          domain: comp.domain,
          industry: comp.industry,
          segment: c.initialMrrCents >= 100000 ? "enterprise" : c.initialMrrCents >= 50000 ? "mid_market" : "smb",
          lifecycleStage: c.featuresPatch.billingStatus === "cancelled" ? "cancelled" : c.featuresPatch.billingStatus === "past_due" ? "past_due" : "active",
          planName: c.initialMrrCents >= 100000 ? "Enterprise Annual" : "Growth Pro Monthly",
          seats: Math.max(5, Math.floor(c.initialMrrCents / 2500)),
          initialMrrCents: c.initialMrrCents,
          currentMrrCents: c.featuresPatch.currentMrrCents ?? c.initialMrrCents,
          renewalAt: new Date(new Date(refTime).getTime() + 86400000 * 30).toISOString(),
        },
        primaryContact: {
          name: contact.name,
          email: c.contactEmail || cleanEmail,
          role: contact.role,
          isPrimary: true,
          allowOutbound: c.contactPolicy !== "do_not_contact",
        },
        secondaryContacts: [],
        stripe: {
          enabled: true,
          customerId: c.stripeCustomerId,
          subscriptionId: `sub_${c.scenarioId.toLowerCase()}`,
          customerMetadataKey: `meta_${c.scenarioId}`,
          subscriptionStatus: c.featuresPatch.billingStatus === "cancelled" ? "canceled" : c.featuresPatch.billingStatus === "past_due" ? "past_due" : "active",
          paymentFailureCount7d: c.featuresPatch.failedPaymentCount7d || 0,
          paymentFailureCount30d: c.featuresPatch.failedPaymentCount30d || 0,
        },
        posthog: {
          enabled: true,
          distinctIds: [c.posthogDistinctId],
          accountExternalId: c.scenarioId,
          previous7dSessions: c.featuresPatch.usagePrevious7d || 100,
          current7dSessions: c.featuresPatch.usageCurrent7d || 100,
          previous7dKeyActions: c.featuresPatch.keyFeaturePrevious7d || 10,
          current7dKeyActions: c.featuresPatch.keyFeatureCurrent7d || 10,
          cancellationIntent: c.scenarioId === "ALLEL-007",
          recoveryAction: c.scenarioId === "ALLEL-004",
        },
        intercom: {
          enabled: true,
          externalContactKey: `ic_${c.scenarioId}`,
          openConversationCount: c.scenarioId === "ALLEL-012" ? 1 : 0,
          topic: c.scenarioId === "ALLEL-012" ? "billing" : "none",
          sentiment: c.scenarioId === "ALLEL-012" ? "frustrated" : "neutral",
        },
        policy: {
          email: c.contactPolicy || "allow",
        },
        expected: {
          risk: c.expectedRisk,
          severity: c.expectedSeverity,
          action: c.expectedAction as any,
          caseState: c.expectedRisk ? "awaiting_approval" : null,
          resolution: c.expectedResolution as any,
          strictRecoveredCents: c.expectedStrictRecoveredCents || 0,
          protectedCents: c.expectedProtectedCents || 0,
        },
        notes: [c.notes],
      };
    });
  }

  // Showcase profile: 50 rich SaaS scenarios
  const targetCount = options.profile === "load" ? (options.count || 250) : 50;
  const scenarios: DemoCustomerScenario[] = [];

  for (let i = 0; i < targetCount; i++) {
    const comp = FICTIONAL_COMPANIES[i % FICTIONAL_COMPANIES.length];
    const contact = FICTIONAL_CONTACTS[i % FICTIONAL_CONTACTS.length];
    const scenarioNum = String(i + 1).padStart(3, "0");
    const scenarioId = `SHOWCASE-${scenarioNum}`;
    const customerKey = `cust_${comp.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${scenarioNum}`;
    const contactEmail = `${contact.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@${comp.domain}`;

    // Archetype distribution
    let category = "healthy";
    const mod = i % 10;
    if (mod === 1) category = "payment_failure";
    else if (mod === 2) category = "repeated_failure";
    else if (mod === 3) category = "usage_decline";
    else if (mod === 4) category = "cancellation_intent";
    else if (mod === 5) category = "compound_risk";
    else if (mod === 6) category = "do_not_contact";
    else if (mod === 7) category = "growing";
    else if (mod === 8) category = "recovered";
    else if (mod === 9) category = "protected";

    const initialMrr = rng.nextInt(300, 2500) * 100;
    let currentMrr = initialMrr;
    let subStatus: "trialing" | "active" | "past_due" | "unpaid" | "canceled" = "active";
    let failure7d = 0;
    let failure30d = 0;
    let prevSessions = rng.nextInt(80, 200);
    let currSessions = prevSessions + rng.nextInt(-10, 15);
    let cancelIntent = false;
    let recoveryAction = false;
    let policy: "allow" | "do_not_contact" = "allow";
    let severity: "low" | "medium" | "high" | "critical" = "low";
    let action = "no_action";
    let resolution: string | null = null;
    let strictRecovered = 0;
    let protectedCents = 0;

    if (category === "payment_failure") {
      subStatus = "past_due";
      failure7d = 1;
      failure30d = 1;
      severity = "high";
      action = "billing_recovery_email";
      resolution = "strictly_recovered";
      strictRecovered = initialMrr;
    } else if (category === "repeated_failure") {
      subStatus = "past_due";
      failure7d = 2;
      failure30d = 3;
      severity = "critical";
      action = "billing_recovery_email";
    } else if (category === "usage_decline") {
      currSessions = Math.max(5, Math.floor(prevSessions * 0.3));
      severity = "high";
      action = "usage_checkin_email";
      resolution = "product_recovered";
    } else if (category === "cancellation_intent") {
      cancelIntent = true;
      currSessions = Math.max(10, Math.floor(prevSessions * 0.5));
      severity = "critical";
      action = "cancellation_rescue_email";
      resolution = "protected";
      protectedCents = initialMrr;
    } else if (category === "compound_risk") {
      subStatus = "past_due";
      failure7d = 1;
      failure30d = 2;
      currSessions = Math.max(10, Math.floor(prevSessions * 0.4));
      severity = "critical";
      action = "compound_recovery_email";
    } else if (category === "do_not_contact") {
      subStatus = "past_due";
      failure7d = 1;
      policy = "do_not_contact";
      severity = "high";
      action = "no_action";
    } else if (category === "growing") {
      currSessions = Math.floor(prevSessions * 1.5);
    } else if (category === "recovered") {
      resolution = "strictly_recovered";
      strictRecovered = initialMrr;
    } else if (category === "protected") {
      resolution = "protected";
      protectedCents = initialMrr;
    }

    scenarios.push({
      scenarioId,
      scenarioRunId: options.scenarioRunId,
      customerKey,
      account: {
        name: `${comp.name}`,
        domain: comp.domain,
        industry: comp.industry,
        segment: initialMrr >= 150000 ? "enterprise" : initialMrr >= 75000 ? "mid_market" : "smb",
        lifecycleStage: (subStatus as string) === "canceled" ? "cancelled" : subStatus === "past_due" ? "past_due" : "active",
        planName: initialMrr >= 150000 ? "Enterprise Tier" : "Pro Plan",
        seats: Math.max(5, Math.floor(initialMrr / 3000)),
        initialMrrCents: initialMrr,
        currentMrrCents: currentMrr,
        renewalAt: new Date(new Date(refTime).getTime() + 86400000 * 45).toISOString(),
      },
      primaryContact: {
        name: contact.name,
        email: contactEmail,
        role: contact.role,
        isPrimary: true,
        allowOutbound: policy !== "do_not_contact",
      },
      secondaryContacts: [],
      stripe: {
        enabled: true,
        customerMetadataKey: `meta_${customerKey}`,
        subscriptionStatus: subStatus,
        paymentFailureCount7d: failure7d,
        paymentFailureCount30d: failure30d,
      },
      posthog: {
        enabled: true,
        distinctIds: [`ph_${customerKey}`],
        accountExternalId: customerKey,
        previous7dSessions: prevSessions,
        current7dSessions: currSessions,
        previous7dKeyActions: Math.floor(prevSessions * 0.15),
        current7dKeyActions: Math.floor(currSessions * 0.15),
        cancellationIntent: cancelIntent,
        recoveryAction,
      },
      intercom: {
        enabled: true,
        externalContactKey: `ic_${customerKey}`,
        openConversationCount: category === "compound_risk" ? 1 : 0,
        topic: category === "compound_risk" ? "billing" : "none",
        sentiment: category === "compound_risk" ? "frustrated" : "neutral",
      },
      policy: {
        email: policy,
      },
      expected: {
        risk: severity !== "low",
        severity,
        action: action as any,
        caseState: severity !== "low" && policy !== "do_not_contact" ? "awaiting_approval" : null,
        resolution: resolution as any,
        strictRecoveredCents: strictRecovered,
        protectedCents: protectedCents,
      },
      notes: [`${category} archetype for ${comp.name}`],
    });
  }

  return scenarios;
}
