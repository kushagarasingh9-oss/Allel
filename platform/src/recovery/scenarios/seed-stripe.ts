import Stripe from "stripe";
import { DemoCustomerScenario } from "./generator";

export interface StripeSeedResult {
  totalCreated: number;
  customerIds: Record<string, string>;
  subscriptionIds: Record<string, string>;
  errors: string[];
}

export async function seedStripeScenarios(options: {
  scenarios: DemoCustomerScenario[];
  workspaceId: string;
  scenarioRunId: string;
  stripeKey?: string;
}): Promise<StripeSeedResult> {
  const apiKey = options.stripeKey || process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is required for Stripe test seeding.");
  }

  if (!apiKey.startsWith("sk_test_")) {
    throw new Error("Safety violation: Stripe key must be a test secret key (sk_test_). Live keys are strictly prohibited.");
  }

  const stripe = new Stripe(apiKey);
  const customerIds: Record<string, string> = {};
  const subscriptionIds: Record<string, string> = {};
  const errors: string[] = [];
  let totalCreated = 0;

  for (const s of options.scenarios) {
    if (!s.stripe.enabled) continue;

    try {
      // 1. Create or retrieve Stripe test customer with metadata
      const customer = await stripe.customers.create({
        name: s.account.name,
        email: s.primaryContact.email,
        metadata: {
          allel_test_data: "true",
          allel_workspace_id: options.workspaceId,
          allel_scenario_run_id: options.scenarioRunId,
          allel_scenario_id: s.scenarioId,
          allel_customer_key: s.customerKey,
          contact_email: s.primaryContact.email,
          posthog_distinct_id: s.posthog.distinctIds[0] || "",
        },
      });

      customerIds[s.scenarioId] = customer.id;
      s.stripe.customerId = customer.id;

      // 2. Create Product and recurring Price
      const product = await stripe.products.create({
        name: `${s.account.name} — ${s.account.planName}`,
        metadata: {
          allel_test_data: "true",
          allel_workspace_id: options.workspaceId,
          allel_scenario_run_id: options.scenarioRunId,
          allel_scenario_id: s.scenarioId,
        },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: s.account.currentMrrCents || s.account.initialMrrCents || 5000,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: {
          allel_test_data: "true",
          allel_workspace_id: options.workspaceId,
          allel_scenario_run_id: options.scenarioRunId,
        },
      });

      // 3. Create Subscription
      // If past_due is desired, set payment_behavior to default_incomplete or create with test card
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        payment_behavior: "default_incomplete",
        metadata: {
          allel_test_data: "true",
          allel_workspace_id: options.workspaceId,
          allel_scenario_run_id: options.scenarioRunId,
          allel_scenario_id: s.scenarioId,
          allel_customer_key: s.customerKey,
        },
      });

      subscriptionIds[s.scenarioId] = subscription.id;
      s.stripe.subscriptionId = subscription.id;
      totalCreated++;
    } catch (err: any) {
      console.warn(`[seed-stripe] Warning on scenario ${s.scenarioId}:`, err.message);
      errors.push(`${s.scenarioId}: ${err.message}`);
    }
  }

  return { totalCreated, customerIds, subscriptionIds, errors };
}
