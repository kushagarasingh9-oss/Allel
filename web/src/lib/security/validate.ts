/**
 * Input validation & sanitisation helpers.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validate that a string is a well-formed UUID (v1–v7).
 */
export function validateUUID(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Sanitise a user-supplied string:
 *  - Trims leading/trailing whitespace
 *  - Strips control characters (U+0000–U+001F, U+007F–U+009F)
 *  - Optionally truncates to `maxLength` characters
 */
export function sanitizeString(value: string, maxLength?: number): string {
  // eslint-disable-next-line no-control-regex
  let sanitized = value.trim().replace(/[\x00-\x1f\x7f-\x9f]/g, '')

  if (maxLength !== undefined && maxLength > 0) {
    sanitized = sanitized.slice(0, maxLength)
  }

  return sanitized
}
