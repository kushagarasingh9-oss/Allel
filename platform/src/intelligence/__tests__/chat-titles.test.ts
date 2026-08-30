import { describe, it, expect } from "vitest";
import { generateChatSessionTitle } from "../chat-titles";

describe("generateChatSessionTitle", () => {
  it("handles pure greeting messages properly", () => {
    expect(generateChatSessionTitle([{ role: "user", content: "Hey" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "hey bro" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "Heybro" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "Alle" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "hi" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "Hello!" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "yo" }])).toBe("Casual Greeting");
  });

  it("handles customer and domain-specific questions", () => {
    expect(generateChatSessionTitle([{ role: "user", content: "how my customers are" }])).toBe("Customer Accounts & Health");
    expect(generateChatSessionTitle([{ role: "user", content: "how are my customers doing" }])).toBe("Customer Accounts & Health");
    expect(generateChatSessionTitle([{ role: "user", content: "Hey check my gmail inbox drafts" }])).toBe("Email & Inbox Management");
    expect(generateChatSessionTitle([{ role: "user", content: "Scan stripe churn risk and failed payments" }])).toBe("Billing & Revenue");
    expect(generateChatSessionTitle([{ role: "user", content: "Show me posthog telemetry and event funnels" }])).toBe("Product Analytics");
    expect(generateChatSessionTitle([{ role: "user", content: "Help triage intercom support tickets" }])).toBe("Customer Support & Intercom");
    expect(generateChatSessionTitle([{ role: "user", content: "Check my calendar meetings for today" }])).toBe("Calendar & Meetings");
  });

  it("strips question prefixes on generic prompts", () => {
    expect(generateChatSessionTitle([{ role: "user", content: "how to build authentication" }])).toBe("Build Authentication");
    expect(generateChatSessionTitle([{ role: "user", content: "write a python script for scraping" }])).toBe("Write A Python Script");
  });
});
