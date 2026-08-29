import crypto from 'crypto';
import { CanonicalProviderEvent, Provider } from './types';
import { RECOVERY_CONFIG } from './config';

export function computePayloadHash(rawBody: string | Buffer): string {
  const buffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function computeDedupeKey(params: {
  workspaceId: string | null;
  provider: Provider;
  providerEventId: string;
  scenarioId?: string | null;
}): string {
  const parts = [
    params.workspaceId || 'global',
    params.provider,
    params.providerEventId,
    params.scenarioId || '',
  ].filter(Boolean);
  return parts.join(':');
}

export function validateEventTimestamp(
  occurredAtIso: string,
  receivedAtIso: string = new Date().toISOString(),
  toleranceSeconds: number = RECOVERY_CONFIG.EVENT_FUTURE_SKEW_SECONDS
): { valid: boolean; normalizedOccurredAt: string } {
  const occurred = new Date(occurredAtIso).getTime();
  const received = new Date(receivedAtIso).getTime();

  if (isNaN(occurred)) {
    return { valid: true, normalizedOccurredAt: receivedAtIso };
  }

  // If timestamp is more than toleranceSeconds in the future, fallback to receivedAt for safety
  const maxFuture = received + toleranceSeconds * 1000;
  if (occurred > maxFuture) {
    return { valid: true, normalizedOccurredAt: receivedAtIso };
  }

  return { valid: true, normalizedOccurredAt: new Date(occurred).toISOString() };
}

export function buildCanonicalProviderEvent(params: {
  eventId?: string;
  workspaceId: string | null;
  provider: Provider;
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  receivedAt?: string;
  endpointId?: string | null;
  providerAccountId?: string | null;
  primaryExternalIdentity?: string | null;
  secondaryExternalIdentities?: string[];
  scenarioId?: string | null;
  scenarioRunId?: string | null;
  rawPayload: string | Buffer;
  testMode?: boolean;
}): CanonicalProviderEvent {
  const eventId = params.eventId || crypto.randomUUID();
  const receivedAt = params.receivedAt || new Date().toISOString();
  const { normalizedOccurredAt } = validateEventTimestamp(params.occurredAt, receivedAt);
  const payloadHash = computePayloadHash(params.rawPayload);
  const dedupeKey = computeDedupeKey({
    workspaceId: params.workspaceId,
    provider: params.provider,
    providerEventId: params.providerEventId,
    scenarioId: params.scenarioId,
  });

  return {
    eventId,
    workspaceId: params.workspaceId,
    provider: params.provider,
    providerEventId: params.providerEventId,
    dedupeKey,
    eventType: params.eventType,
    occurredAt: normalizedOccurredAt,
    receivedAt,
    endpointId: params.endpointId || null,
    providerAccountId: params.providerAccountId || null,
    primaryExternalIdentity: params.primaryExternalIdentity || null,
    secondaryExternalIdentities: params.secondaryExternalIdentities || [],
    scenarioId: params.scenarioId || null,
    scenarioRunId: params.scenarioRunId || null,
    payloadHash,
    payloadVersion: 1,
    testMode: params.testMode ?? RECOVERY_CONFIG.TEST_MODE,
  };
}
