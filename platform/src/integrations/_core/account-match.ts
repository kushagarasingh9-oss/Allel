type MatchableAccount = {
  id: string
  name: string
}

type MatchableContact = {
  email: string
  customer_account_id: string
}

/**
 * Canonical set of personal email provider domains.
 * Exported so that all integration sync modules share one definition.
 * Do NOT duplicate this set in individual sync files.
 */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
])

export function normalizeMatchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function getEmailDomain(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export function isPersonalEmailDomain(domain: string) {
  return PERSONAL_EMAIL_DOMAINS.has(domain)
}

export function findAccountIdByEmail(
  email: string | null | undefined,
  contactsByEmail: Map<string, MatchableContact>
) {
  if (!email) return null
  return contactsByEmail.get(email.toLowerCase())?.customer_account_id ?? null
}

export function buildAccountsByName(accounts: MatchableAccount[]) {
  return new Map(accounts.map((account) => [normalizeMatchText(account.name), account]))
}

/**
 * Fuzzy text-based account matcher for UI display disambiguation only.
 *
 * ⚠️ WARNING: This function MUST NOT be used for verified identity resolution.
 * Name substring matching is not deterministic evidence of account ownership.
 * It can produce false positives when two accounts share similar names or domains.
 * Only use this for: display helpers, search UI, and non-write read paths.
 * For identity writes, use resolveAccountIdentity() from @/recovery/identity instead.
 */
export function matchAccountIdFromText(
  text: string,
  accountsByName: Map<string, MatchableAccount>,
  contactsByEmail: Map<string, MatchableContact>
) {
  const normalized = normalizeMatchText(text)
  for (const [nameKey, account] of accountsByName.entries()) {
    if (nameKey.length > 2 && normalized.includes(nameKey)) {
      return account.id
    }
  }

  for (const contact of contactsByEmail.values()) {
    const email = contact.email.toLowerCase()
    if (normalized.includes(email)) {
      return contact.customer_account_id
    }

    const domain = getEmailDomain(email)
    if (domain && !isPersonalEmailDomain(domain) && normalized.includes(domain.split('.')[0] ?? domain)) {
      return contact.customer_account_id
    }
  }

  return null
}
