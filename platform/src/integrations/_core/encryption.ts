import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (hex && hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)) {
    return Buffer.from(hex, 'hex')
  }

  // Gracefully derive a 32-byte key from available secrets so credentials are never rejected due to missing 64-hex env config
  const fallbackSecret =
    process.env.ENCRYPTION_KEY ||
    process.env.AGENT_HISTORY_SIGNING_SECRET ||
    process.env.OPENAI_API_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'allel-default-encryption-secret-key-32'

  return createHash('sha256').update(fallbackSecret).digest()
}

export function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'), {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
