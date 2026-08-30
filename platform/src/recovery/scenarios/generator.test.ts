import { describe, it } from "node:test";
import assert from "node:assert";
import { generateScenarios, SeededRNG } from "./generator";
import { seedStripeScenarios } from "./seed-stripe";

describe("Cross-Platform Scenario Generator", () => {
  it("generates deterministic outputs given the same seed", () => {
    const run1 = generateScenarios({
      profile: "showcase",
      workspaceId: "ws-test-1",
      scenarioRunId: "run-1",
      seed: "fixed-seed-xyz",
      referenceTime: "2026-08-30T12:00:00.000Z",
    });

    const run2 = generateScenarios({
      profile: "showcase",
      workspaceId: "ws-test-1",
      scenarioRunId: "run-1",
      seed: "fixed-seed-xyz",
      referenceTime: "2026-08-30T12:00:00.000Z",
    });

    assert.strictEqual(run1.length, 50);
    assert.strictEqual(run2.length, 50);
    assert.deepStrictEqual(run1[0], run2[0]);
    assert.deepStrictEqual(run1[25], run2[25]);
  });

  it("canonical profile outputs exactly 15 competition scenarios", () => {
    const canonical = generateScenarios({
      profile: "canonical",
      workspaceId: "ws-test-1",
      scenarioRunId: "run-canonical",
    });

    assert.strictEqual(canonical.length, 15);
    assert.strictEqual(canonical[0].scenarioId, "ALLEL-001");
    assert.strictEqual(canonical[14].scenarioId, "ALLEL-015");
  });

  it("enforces test mode safety and rejects live Stripe keys", async () => {
    const scenarios = generateScenarios({
      profile: "canonical",
      workspaceId: "ws-test-1",
      scenarioRunId: "run-1",
    });

    await assert.rejects(
      async () => {
        await seedStripeScenarios({
          scenarios,
          workspaceId: "ws-test-1",
          scenarioRunId: "run-1",
          stripeKey: "sk_live_1234567890abcdef",
        });
      },
      /Safety violation: Stripe key must be a test secret key/
    );
  });

  it("SeededRNG produces numbers within specified integer bounds", () => {
    const rng = new SeededRNG("test-seed");
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(10, 20);
      assert.ok(val >= 10 && val <= 20, `Value ${val} out of bounds`);
    }
  });
});
