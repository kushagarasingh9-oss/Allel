import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateChatSessionTitle } from '../chat-titles';

describe('generateChatSessionTitle', () => {
  it('handles pure greeting messages properly', () => {
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Hey' }]), 'Casual Greeting');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'hey bro' }]), 'Casual Greeting');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Heybro' }]), 'Casual Greeting');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Alle' }]), 'Casual Greeting');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'hi' }]), 'Casual Greeting');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Hello!' }]), 'Casual Greeting');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'yo' }]), 'Casual Greeting');
  });

  it('handles customer and domain-specific questions', () => {
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'how my customers are' }]), 'Customer Accounts & Health');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'how are my customers doing' }]), 'Customer Accounts & Health');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Hey check my gmail inbox drafts' }]), 'Email & Inbox Management');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Scan stripe churn risk and failed payments' }]), 'Billing & Revenue');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Show me posthog telemetry and event funnels' }]), 'Product Analytics');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Help triage intercom support tickets' }]), 'Customer Support & Intercom');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'Check my calendar meetings for today' }]), 'Calendar & Meetings');
  });

  it('strips question prefixes on generic prompts', () => {
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'how to build authentication' }]), 'Build Authentication');
    assert.equal(generateChatSessionTitle([{ role: 'user', content: 'write a python script for scraping' }]), 'Write A Python Script');
  });

  it('uses only the first user prompt and ignores later prompts', () => {
    const title = generateChatSessionTitle([
      { role: 'user', content: 'Check my Gmail inbox' },
      { role: 'assistant', content: 'Here are your emails.' },
      { role: 'user', content: 'Now check Slack' },
    ]);

    assert.equal(title, 'Email & Inbox Management');
  });

  it('handles Slack prompt properly', () => {
    const title = generateChatSessionTitle([
      { role: 'user', content: 'check my slack' },
    ]);

    assert.equal(title, 'Slack & Team Channels');
  });
});
