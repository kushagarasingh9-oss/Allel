import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const stripeKey = process.env.STRIPE_SECRET_KEY;
const posthogKey = process.env.POSTHOG_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID || "373072";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=========================================");
console.log(" PURGING LIVE PROVIDER DATA (Stripe, PostHog, Supabase)");
console.log("=========================================\n");

async function purgeStripe() {
  if (!stripeKey) {
    console.log("⚠️ No STRIPE_SECRET_KEY found. Skipping Stripe purge.");
    return;
  }
  console.log("🧹 1. Purging Stripe test customers and subscriptions...");
  const stripe = new Stripe(stripeKey);

  try {
    const subscriptions = await stripe.subscriptions.list({ limit: 100, status: "all" });
    console.log(`Found ${subscriptions.data.length} subscriptions in Stripe.`);
    for (const sub of subscriptions.data) {
      if (sub.status !== "canceled") {
        try {
          await stripe.subscriptions.cancel(sub.id);
          console.log(`  - Canceled subscription: ${sub.id}`);
        } catch (e) {
          console.warn(`  - Error canceling sub ${sub.id}:`, e.message);
        }
      }
    }

    const customers = await stripe.customers.list({ limit: 100 });
    console.log(`Found ${customers.data.length} customers in Stripe.`);
    for (const cust of customers.data) {
      try {
        await stripe.customers.del(cust.id);
        console.log(`  - Deleted customer: ${cust.id} (${cust.name || cust.email || "unnamed"})`);
      } catch (e) {
        console.warn(`  - Error deleting customer ${cust.id}:`, e.message);
      }
    }
    console.log("✅ Stripe purge complete!\n");
  } catch (err) {
    console.error("❌ Stripe purge error:", err.message);
  }
}

async function purgePostHog() {
  if (!posthogKey || !posthogProjectId) {
    console.log("⚠️ No POSTHOG_API_KEY / POSTHOG_PROJECT_ID found. Skipping PostHog purge.");
    return;
  }
  console.log(`🧹 2. Purging PostHog persons from project ${posthogProjectId}...`);
  const hosts = ["https://us.i.posthog.com", "https://us.posthog.com", "https://app.posthog.com", "https://eu.i.posthog.com"];

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/projects/${posthogProjectId}/persons/?limit=100`, {
        headers: {
          Authorization: `Bearer ${posthogKey.trim()}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const persons = data.results || [];
        console.log(`Found ${persons.length} persons on ${host}.`);
        for (const person of persons) {
          try {
            await fetch(`${host}/api/projects/${posthogProjectId}/persons/${person.id}/`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${posthogKey.trim()}` },
            });
            console.log(`  - Deleted PostHog person: ${person.id}`);
          } catch (e) {
            console.warn(`  - Error deleting person: ${e.message}`);
          }
        }
        console.log("✅ PostHog persons purge complete!\n");
        return;
      }
    } catch {
      // try next host
    }
  }
  console.log("ℹ️ PostHog purge attempted.\n");
}

async function purgeSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log("⚠️ No Supabase credentials found. Skipping Supabase purge.");
    return;
  }
  console.log("🧹 3. Purging existing workspace accounts and sync records in Supabase...");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    await supabase.from("case_drafts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("account_cases").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("account_timeline").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("account_signals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("identity_conflicts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("account_contacts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("provider_identities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("customer_accounts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    console.log("✅ Supabase customer accounts & sync records purged cleanly!\n");
  } catch (err) {
    console.error("❌ Supabase purge error:", err.message);
  }
}

async function main() {
  await purgeStripe();
  await purgePostHog();
  await purgeSupabase();
  console.log("✨ All provider data successfully purged and ready for fresh reference data!");
}

main().catch(console.error);
