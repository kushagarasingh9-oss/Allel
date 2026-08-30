import { resolve } from "path";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { createServiceClient } from "@/foundation/database/service";
import { generateScenarios, DemoCustomerScenario } from "./generator";
import { seedStripeScenarios } from "./seed-stripe";
import { seedPostHogEvents } from "./seed-posthog";
import { seedIntercomScenarios } from "./seed-intercom";
import { upsertProviderIdentity, linkContactSafely } from "../identity";
import { projectAccountFeatures } from "../features";
import { createScenarioRun, createScenarioRunId } from "./runs";
import { resetScenarios } from "./reset";

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || "plan";
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs();
  const supabase = createServiceClient();

  const workspaceId = (flags["workspace-id"] as string) || process.env.DEFAULT_WORKSPACE_ID;
  if (!workspaceId) {
    // If not provided, fetch default from DB
    const { data: ws } = await supabase.from("workspaces").select("id").limit(1);
    if (!ws || ws.length === 0) {
      console.error("❌ No workspace found. Please specify --workspace-id <uuid>");
      process.exit(1);
    }
  }

  const activeWorkspaceId = workspaceId || (await supabase.from("workspaces").select("id").limit(1).then((r) => r.data?.[0]?.id));
  const profile = (flags["profile"] as "canonical" | "showcase" | "load") || "showcase";
  const seed = (flags["seed"] as string) || "allel-buildathon-v1";
  const count = flags["count"] ? parseInt(flags["count"] as string, 10) : undefined;
  const referenceTime = (flags["reference-time"] as string) || new Date().toISOString();
  const scenarioRunId = (flags["scenario-run-id"] as string) || createScenarioRunId();
  const includeStripe = Boolean(flags["include-stripe"]);
  const includePosthog = Boolean(flags["include-posthog"]);
  const includeIntercom = Boolean(flags["include-intercom"]);
  const confirm = flags["confirm"] as string;

  console.log("━".repeat(70));
  console.log(`  🚀 Allel Buildathon Demo Dataset CLI [${command.toUpperCase()}]`);
  console.log("━".repeat(70));
  console.log(`  Command:       ${command}`);
  console.log(`  Workspace:     ${activeWorkspaceId}`);
  console.log(`  Profile:       ${profile}`);
  console.log(`  Seed:          ${seed}`);
  console.log(`  Scenario Run:  ${scenarioRunId}`);
  console.log("━".repeat(70) + "\n");

  const scenarios = generateScenarios({
    profile,
    workspaceId: activeWorkspaceId,
    scenarioRunId,
    seed,
    count,
    referenceTime,
  });

  if (command === "plan") {
    console.log(`📋 Generating deterministic dry-run plan for ${scenarios.length} accounts...\n`);
    const planDir = path.resolve(process.cwd(), "artifacts/demo-data", scenarioRunId);
    fs.mkdirSync(planDir, { recursive: true });

    const planJson = {
      version: "1.0.0",
      profile,
      seed,
      referenceTime,
      workspaceId: activeWorkspaceId,
      scenarioRunId,
      accountCount: scenarios.length,
      scenarios: scenarios.map((s) => ({
        scenarioId: s.scenarioId,
        name: s.account.name,
        contact: s.primaryContact.email,
        expectedSeverity: s.expected.severity,
        expectedAction: s.expected.action,
        expectedStrictRecoveredCents: s.expected.strictRecoveredCents,
        expectedProtectedCents: s.expected.protectedCents,
      })),
    };

    fs.writeFileSync(path.join(planDir, "plan.json"), JSON.stringify(planJson, null, 2));

    let markdown = `# Allel Demo Dataset Plan: ${profile.toUpperCase()}\n\n`;
    markdown += `> Test-mode recovery simulation. No production customer funds are represented.\n\n`;
    markdown += `- **Workspace ID:** \`${activeWorkspaceId}\`\n`;
    markdown += `- **Scenario Run ID:** \`${scenarioRunId}\`\n`;
    markdown += `- **Seed:** \`${seed}\`\n`;
    markdown += `- **Total Accounts:** \`${scenarios.length}\`\n\n`;
    markdown += `### Account Matrix\n\n`;
    markdown += `| Scenario ID | Account Name | Contact | Risk Severity | Action | Expected Outcome |\n`;
    markdown += `|---|---|---|---|---|---|\n`;
    for (const s of scenarios) {
      markdown += `| ${s.scenarioId} | ${s.account.name} | ${s.primaryContact.email} | ${s.expected.severity} | ${s.expected.action} | ${s.expected.resolution || "none"} |\n`;
    }

    fs.writeFileSync(path.join(planDir, "report.md"), markdown);

    console.log(`✅ Plan generated successfully:`);
    console.log(`   • ${path.join(planDir, "plan.json")}`);
    console.log(`   • ${path.join(planDir, "report.md")}\n`);
    return;
  }

  if (command === "seed") {
    console.log(`🌱 Seeding ${scenarios.length} accounts across enabled platforms...\n`);

    // 1. Create Scenario Run row in Supabase
    await createScenarioRun(supabase, {
      workspaceId: activeWorkspaceId,
      scenarioRunId,
      testMode: true,
      metadata: { profile, seed, totalScenarios: scenarios.length },
    });

    // 2. Stripe Seeding (if enabled)
    if (includeStripe && process.env.STRIPE_SECRET_KEY) {
      console.log(`[1/4] 💳 Seeding Stripe Test Mode customers & subscriptions...`);
      const stripeRes = await seedStripeScenarios({
        scenarios,
        workspaceId: activeWorkspaceId,
        scenarioRunId,
      });
      console.log(`  ✅ Stripe: Created ${stripeRes.totalCreated} customers/subscriptions in test mode.\n`);
    } else {
      console.log(`[1/4] 💳 Stripe: Using mapped test customer identifiers.\n`);
    }

    // 3. PostHog Seeding (if enabled)
    if (includePosthog && process.env.POSTHOG_PROJECT_API_KEY) {
      console.log(`[2/4] 📊 Seeding PostHog test events...`);
      await seedPostHogEvents({
        projectApiKey: process.env.POSTHOG_PROJECT_API_KEY,
        workspaceId: activeWorkspaceId,
        testRunId: scenarioRunId,
      });
      console.log(`  ✅ PostHog: Seeded real telemetry events for usage calculation.\n`);
    } else {
      console.log(`[2/4] 📊 PostHog: Telemetry baseline prepared.\n`);
    }

    // 4. Intercom Seeding
    if (includeIntercom) {
      console.log(`[3/4] 💬 Seeding Intercom test contexts...`);
      await seedIntercomScenarios({
        scenarios,
        workspaceId: activeWorkspaceId,
        scenarioRunId,
      });
      console.log(`  ✅ Intercom: Test contacts context prepared.\n`);
    }

    // 5. Supabase Canonical Accounts Seeding
    console.log(`[4/4] 🗄️ Seeding Supabase canonical customer accounts and feature projections...`);
    let seededAccounts = 0;

    for (const s of scenarios) {
      // Find or insert account
      const { data: existingAcc } = await supabase
        .from("customer_accounts")
        .select("id")
        .eq("workspace_id", activeWorkspaceId)
        .or(`scenario_id.eq.${s.scenarioId},name.eq.${s.account.name}`)
        .limit(1)
        .maybeSingle();

      const accPayload = {
        workspace_id: activeWorkspaceId,
        name: s.account.name,
        account_status: s.account.lifecycleStage === "cancelled" ? "cancelled" : s.account.lifecycleStage === "past_due" ? "past_due" : "active",
        mrr_cents: s.account.currentMrrCents,
        risk_score: s.expected.risk ? (s.expected.severity === "critical" ? 95 : 75) : 15,
        risk_level: s.expected.severity === "critical" ? "high" : s.expected.severity,
        domain: s.account.domain,
        contact_email: s.primaryContact.email,
        scenario_id: s.scenarioId,
        scenario_run_id: scenarioRunId,
        updated_at: new Date().toISOString(),
      };

      let accountId: string;
      if (existingAcc?.id) {
        await supabase.from("customer_accounts").update(accPayload).eq("id", existingAcc.id);
        accountId = existingAcc.id;
      } else {
        const { data: inserted } = await supabase.from("customer_accounts").insert(accPayload).select("id").single();
        accountId = inserted!.id;
      }

      // Link Primary Contact safely
      await linkContactSafely(supabase, {
        workspaceId: activeWorkspaceId,
        customerAccountId: accountId,
        email: s.primaryContact.email,
        name: s.primaryContact.name,
        role: s.primaryContact.role,
        isPrimary: true,
        source: "scenario_seed",
      });

      // Upsert Provider Identities
      const stripeId = s.stripe.customerId || `cus_${s.scenarioId.toLowerCase()}`;
      await upsertProviderIdentity(supabase, {
        workspaceId: activeWorkspaceId,
        customerAccountId: accountId,
        provider: "stripe",
        identityType: "customer_id",
        externalId: stripeId,
        isPrimary: true,
        source: "scenario_seed",
        scenarioId: s.scenarioId,
        scenarioRunId,
      });

      const posthogId = s.posthog.distinctIds[0] || `ph_${s.scenarioId.toLowerCase()}`;
      await upsertProviderIdentity(supabase, {
        workspaceId: activeWorkspaceId,
        customerAccountId: accountId,
        provider: "posthog",
        identityType: "distinct_id",
        externalId: posthogId,
        isPrimary: true,
        source: "scenario_seed",
        scenarioId: s.scenarioId,
        scenarioRunId,
      });

      // Project canonical features
      await projectAccountFeatures(supabase, {
        workspaceId: activeWorkspaceId,
        customerAccountId: accountId,
        patch: {
          billingStatus: s.stripe.subscriptionStatus,
          currentMrrCents: s.account.currentMrrCents,
          failedPaymentCount7d: s.stripe.paymentFailureCount7d,
          failedPaymentCount30d: s.stripe.paymentFailureCount30d,
          usageCurrent7d: s.posthog.current7dSessions,
          usagePrevious7d: s.posthog.previous7dSessions,
          stripeCustomerId: stripeId,
        },
        scenarioRunId,
      });

      seededAccounts++;
    }

    console.log(`  ✅ Successfully seeded ${seededAccounts} canonical accounts into Supabase.\n`);
    console.log("━".repeat(70));
    console.log("  🎉 Cross-Platform Seeding Complete!");
    console.log("━".repeat(70) + "\n");
    return;
  }

  if (command === "reset") {
    if (confirm !== "DELETE TEST DATA AND SEED DEMO") {
      console.error("❌ Reset requires exact confirmation flag:");
      console.error("   --confirm \"DELETE TEST DATA AND SEED DEMO\"");
      process.exit(1);
    }

    console.log(`🧹 Resetting scenario run ${scenarioRunId} for workspace ${activeWorkspaceId}...\n`);
    await resetScenarios(supabase, { workspaceId: activeWorkspaceId, scenarioRunId, testMode: true });
    console.log(`✅ Scenario run reset completed cleanly.\n`);
    return;
  }

  if (command === "inspect") {
    const { data: accounts } = await supabase
      .from("customer_accounts")
      .select("id, name, risk_score, risk_level, mrr_cents, account_status, scenario_id")
      .eq("workspace_id", activeWorkspaceId);

    console.log(`🔍 Current Accounts in Workspace (${accounts?.length ?? 0} total):\n`);
    console.table(accounts || []);
    return;
  }
}

main().catch((err) => {
  console.error("Fatal error in CLI:", err);
  process.exit(1);
});
