import { getEmailDomain, isPersonalEmailDomain } from '@/integrations/_core/account-match'
import { threadNeedsReply, type GmailThread } from '@/integrations/gmail/gmail'

export type GmailBootstrapContact = {
  email: string
  name: string | null
  isPrimary: boolean
}

export type GmailBootstrapCandidate = {
  accountKey: string
  accountName: string
  contacts: GmailBootstrapContact[]
}

const GENERIC_LOCAL_TOKENS = new Set([
  'admin',
  'alert',
  'alerts',
  'billing',
  'contact',
  'failed',
  'failure',
  'hello',
  'hi',
  'info',
  'invoice',
  'invoices',
  'mail',
  'message',
  'messages',
  'notification',
  'notifications',
  'notify',
  'payment',
  'payments',
  'sales',
  'security',
  'success',
  'support',
  'team',
  'update',
  'updates',
  'verify',
  'welcome',
])

const NO_REPLY_PREFIXES = [
  'do-not-reply',
  'donotreply',
  'mailer-daemon',
  'no-reply',
  'noreply',
]

function toTitleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function cleanDisplayName(value: string | null | undefined) {
  if (!value) return null

  const withoutMailbox = value.split('<')[0]?.trim().replace(/^"+|"+$/g, '')
  if (!withoutMailbox || withoutMailbox.includes('@')) {
    return null
  }

  return withoutMailbox
}

function isSystemMailbox(email: string) {
  const localPart = email.split('@')[0]?.toLowerCase() ?? ''
  return NO_REPLY_PREFIXES.some((prefix) => localPart.startsWith(prefix))
}

function getOrganizationDomain(domain: string) {
  const parts = domain.split('.').filter(Boolean)
  if (parts.length <= 2) {
    return domain
  }

  const topLevel = parts.at(-1) ?? ''
  const secondLevel = parts.at(-2) ?? ''
  if (topLevel.length === 2 && secondLevel.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }

  return parts.slice(-2).join('.')
}

function getOrganizationSlug(domain: string) {
  const organizationDomain = getOrganizationDomain(domain)
  const parts = organizationDomain.split('.').filter(Boolean)

  if (parts.length >= 2) {
    return parts[parts.length - 2] ?? organizationDomain
  }

  return parts[0] ?? organizationDomain
}

function accountKeyForEmail(email: string) {
  const domain = getEmailDomain(email)
  if (domain && !isPersonalEmailDomain(domain)) {
    return `domain:${getOrganizationDomain(domain)}`
  }

  return `email:${email}`
}

function inferAccountName(email: string, displayName: string | null) {
  const domain = getEmailDomain(email)
  if (domain && !isPersonalEmailDomain(domain)) {
    return toTitleCase(getOrganizationSlug(domain))
  }

  if (displayName) {
    return displayName
  }

  const localPart = email.split('@')[0]?.split('+')[0] ?? email
  if (hasOnlyGenericLocalTokens(email) && domain) {
    return toTitleCase(getOrganizationSlug(domain))
  }

  return toTitleCase(localPart)
}

function hasOnlyGenericLocalTokens(email: string) {
  const localPart = email.split('@')[0]?.toLowerCase().split('+')[0] ?? ''
  const tokens = localPart.split(/[^a-z0-9]+/).filter(Boolean)
  return tokens.length > 0 && tokens.every((token) => GENERIC_LOCAL_TOKENS.has(token))
}

export function buildGmailBootstrapQuery(lookbackDays: number = 120) {
  return `in:inbox newer_than:${lookbackDays}d -category:promotions -category:social -category:forums -category:updates`
}

export function buildGmailBootstrapCandidates(
  threads: GmailThread[],
  ownerEmail: string
): GmailBootstrapCandidate[] {
  const owner = ownerEmail.toLowerCase()
  const ownerDomain = getEmailDomain(owner)
  const byAccountKey = new Map<string, GmailBootstrapCandidate>()

  for (const thread of threads) {
    if (!threadNeedsReply(thread, owner, null)) {
      continue
    }

    const externalParticipants = Array.from(
      new Set(
        thread.participantEmails
          .map((email) => email.toLowerCase())
          .filter((email) => {
            if (!email || email === owner) return false
            if (isSystemMailbox(email)) return false

            const domain = getEmailDomain(email)
            if (!domain) return false
            if (domain === ownerDomain) return false

            return true
          })
      )
    )

    if (externalParticipants.length === 0) {
      continue
    }

    const normalizedLastSender = thread.lastSenderEmail?.toLowerCase() ?? null
    const nonGenericParticipants = externalParticipants.filter(
      (email) => !hasOnlyGenericLocalTokens(email)
    )
    const primaryEmail =
      (normalizedLastSender && nonGenericParticipants.includes(normalizedLastSender)
        ? normalizedLastSender
        : null) ??
      nonGenericParticipants[0] ??
      (normalizedLastSender && externalParticipants.includes(normalizedLastSender)
        ? normalizedLastSender
        : null) ??
      externalParticipants[0]

    if (hasOnlyGenericLocalTokens(primaryEmail)) {
      continue
    }

    const primaryName = cleanDisplayName(thread.from)
    const accountKey = accountKeyForEmail(primaryEmail)
    const existing = byAccountKey.get(accountKey)

    if (!existing) {
      byAccountKey.set(accountKey, {
        accountKey,
        accountName: inferAccountName(primaryEmail, primaryName),
        contacts: externalParticipants.map((email) => ({
          email,
          name: email === primaryEmail ? primaryName : null,
          isPrimary: email === primaryEmail,
        })),
      })
      continue
    }

    const existingEmails = new Set(existing.contacts.map((contact) => contact.email))
    for (const email of externalParticipants) {
      if (existingEmails.has(email)) continue
      existing.contacts.push({
        email,
        name: email === primaryEmail ? primaryName : null,
        isPrimary: false,
      })
    }
  }

  return Array.from(byAccountKey.values())
}
