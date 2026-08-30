import { describe, it, expect } from "vitest";
import { generateChatSessionTitle } from "../chat-titles";

describe("generateChatSessionTitle", () => {
  it("handles pure greeting messages properly", () => {
    expect(generateChatSessionTitle([{ role: "user", content: "Hey" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "hey bro" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "hi" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "Hello!" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "yo" }])).toBe("Casual Greeting");
    expect(generateChatSessionTitle([{ role: "user", content: "howdy" }])).toBe("Casual Greeting");
  });

  it("handles domain-specific prompts", () => {
    expect(generateChatSessionTitle([{ role: "user", content: "Hey check my gmail inbox drafts" }])).toBe("Email & Inbox Management");
    expect(generateChatSessionTitle([{ role: "user", content: "Scan stripe churn risk and failed payments" }])).toBe("Billing & Revenue");
    expect(generateChatSessionTitle([{ role: "user", content: "Show me posthog telemetry and event funnels" }])).toBe("Product Analytics");
    expect(generateChatSessionTitle([{ role: "user", content: "Help triage intercom support tickets" }])).toBe("Customer Support & Intercom");
    expect(generateChatSessionTitle([{ role: "user", content: "Check my calendar meetings for today" }])).toBe("Calendar & Meetings");
  });

  it("handles empty / missing messages gracefully", () => {
    expect(generateChatSessionTitle([])).toBe("New Conversation");
    expect(generateChatSessionTitle(null)).toBe("New Conversation");
    expect(generateChatSessionTitle([{ role: "assistant", content: "Hello" }])).toBe("New Conversation");
  });

  it("formats generic prompts cleanly", () => {
    expect(generateChatSessionTitle([{ role: "user", content: "write a python script for scraping" }])).toBe("Write A Python Script");
  });
});
