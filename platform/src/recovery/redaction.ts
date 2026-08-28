export function redactEvidenceForPrompt(raw: Record<string, any>): Record<string, any> {
  const redacted: Record<string, any> = {};

  for (const [key, value] of Object.entries(raw)) {
    // Redact sensitive credentials and tokens
    if (/token|secret|password|apikey|api_key|access_key|auth/i.test(key)) {
      redacted[key] = '[REDACTED_SECRET]';
      continue;
    }

    // Redact raw credit card numbers
    if (/cardnumber|card_number|cvv|cvc|pan/i.test(key)) {
      redacted[key] = '[REDACTED_CARD]';
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        redacted[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? redactEvidenceForPrompt(item) : item
        );
      } else {
        redacted[key] = redactEvidenceForPrompt(value);
      }
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export function sanitizeCustomerText(text: string): string {
  // Strip potential credit card numbers: 13-19 digits
  let cleaned = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD_NUMBER]');
  // Strip potential API keys / secrets
  cleaned = cleaned.replace(/\b(?:sk_live_|sk_test_|ghp_|xoxb-|xoxp-)[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_KEY]');
  return cleaned;
}
