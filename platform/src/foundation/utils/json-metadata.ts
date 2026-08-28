import { z } from 'zod'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

export const jsonRecordSchema = z.record(z.string(), jsonValueSchema)

function sanitizeJsonValue(value: unknown, depth: number): JsonValue {
  if (depth > 6) {
    return '[Truncated metadata]'
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, depth + 1))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, sanitizeJsonValue(entryValue, depth + 1)])
    )
  }

  return String(value)
}

export function sanitizeJsonRecord(value: unknown): Record<string, JsonValue> {
  const sanitized =
    value && typeof value === 'object' && !Array.isArray(value)
      ? sanitizeJsonValue(value, 0)
      : {}

  const parsed = jsonRecordSchema.safeParse(sanitized)
  return parsed.success ? parsed.data : {}
}
