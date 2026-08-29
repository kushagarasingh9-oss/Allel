/**
 * Provider Projection: Transforms raw provider payloads into typed feature patches.
 *
 * This is the single bridge between raw webhook event payloads (persisted in
 * webhook_events.payload) and the canonical account_features domain model.
 *
 * §40.5.1–§40.5.3 of goal.md.
 */

import type { AccountFeatures } from './types';

// ---------------------------------------------------------------------------
// §40.5.1  Typed projection result
// ---------------------------------------------------------------------------

export type ProviderFeatureProjection = {
  workspaceId: string;
  customerAccountId: string;
  provider: 'stripe' | 'posthog' | 'gmail';
  eventId: string;
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  patch: Partial<AccountFeatures>;
  evidence: Array<{
    eventId: string;
    provider: string;
    objectId: string | null;
    fact: string;
  }>;
  outcomeCandidate: null | {
    kind: 'invoice_paid' | 'cancellation_reversed' | 'usage_rebound' | 'customer_reply';
    invoiceId?: string;
    subscriptionId?: string;
  };
};

// ---------------------------------------------------------------------------
// §40.5.2  Stripe projections
// ---------------------------------------------------------------------------

export function projectStripeInvoicePaymentFailed(
  webhookEventId: string,
  providerEventId: string,
  payload: Record<string, any>,
  occurredAt: string
): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> {
  const customerId = typeof payload.customer === 'string' ? payload.customer : null;
  const invoiceId = typeof payload.id === 'string' ? payload.id : null;
  const invoiceStatus = typeof payload.status === 'string' ? payload.status : null;
  const amountDue = typeof payload.amount_due === 'number' ? payload.amount_due : 0;
  const subscription = typeof payload.subscription === 'string' ? payload.subscription : null;

  // Normalize MRR from invoice lines if available
  let mrrCents: number | null = null;
  if (payload.lines?.data?.[0]?.plan) {
    const plan = payload.lines.data[0].plan;
    const unitAmount = plan.amount ?? 0;
    const interval = plan.interval ?? 'month';
    mrrCents = interval === 'year' ? Math.round(unitAmount / 12)
             : interval === 'week' ? unitAmount * 4
             : unitAmount;
  }

  return {
    provider: 'stripe',
    eventId: webhookEventId,
    providerEventId,
    eventType: 'invoice.payment_failed',
    occurredAt,
    patch: {
      billingAvailable: true,
      billingStatus: 'past_due',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription,
      lastInvoiceId: invoiceId,
      lastInvoiceStatus: invoiceStatus,
      lastPaymentFailedAt: occurredAt,
      ...(mrrCents !== null ? { currentMrrCents: mrrCents } : {}),
      // Note: failedPaymentCount is NOT incremented here — it is computed
      // idempotently from durable event records in the feature projector.
    },
    evidence: [
      {
        eventId: webhookEventId,
        provider: 'stripe',
        objectId: invoiceId,
        fact: `invoice.payment_failed: invoice ${invoiceId}, amount_due=${amountDue}, customer=${customerId}`,
      },
    ],
    outcomeCandidate: null,
  };
}

export function projectStripeInvoicePaid(
  webhookEventId: string,
  providerEventId: string,
  payload: Record<string, any>,
  occurredAt: string
): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> {
  const customerId = typeof payload.customer === 'string' ? payload.customer : null;
  const invoiceId = typeof payload.id === 'string' ? payload.id : null;
  const subscription = typeof payload.subscription === 'string' ? payload.subscription : null;
  const amountPaid = typeof payload.amount_paid === 'number' ? payload.amount_paid : 0;

  return {
    provider: 'stripe',
    eventId: webhookEventId,
    providerEventId,
    eventType: 'invoice.paid',
    occurredAt,
    patch: {
      billingAvailable: true,
      lastInvoiceId: invoiceId,
      lastInvoiceStatus: 'paid',
      lastPaymentSucceededAt: occurredAt,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription,
    },
    evidence: [
      {
        eventId: webhookEventId,
        provider: 'stripe',
        objectId: invoiceId,
        fact: `invoice.paid: invoice ${invoiceId}, amount_paid=${amountPaid}, customer=${customerId}`,
      },
    ],
    outcomeCandidate: {
      kind: 'invoice_paid',
      invoiceId: invoiceId ?? undefined,
      subscriptionId: subscription ?? undefined,
    },
  };
}

export function projectStripeSubscriptionUpdated(
  webhookEventId: string,
  providerEventId: string,
  payload: Record<string, any>,
  occurredAt: string
): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> {
  const customerId = typeof payload.customer === 'string' ? payload.customer : null;
  const subscriptionId = typeof payload.id === 'string' ? payload.id : null;
  const status = typeof payload.status === 'string' ? payload.status : null;
  const cancelAtPeriodEnd = typeof payload.cancel_at_period_end === 'boolean' ? payload.cancel_at_period_end : null;

  // Normalize MRR
  let mrrCents: number | null = null;
  const item = payload.items?.data?.[0];
  if (item?.price) {
    const unitAmount = item.price.unit_amount ?? 0;
    const interval = item.price.recurring?.interval ?? 'month';
    mrrCents = interval === 'year' ? Math.round(unitAmount / 12)
             : interval === 'week' ? unitAmount * 4
             : unitAmount;
  }

  // Detect cancellation reversal
  const previousAttributes = payload.previous_attributes ?? {};
  const wasCancelAtPeriodEnd = previousAttributes.cancel_at_period_end;
  const isCancellationReversed = wasCancelAtPeriodEnd === true && cancelAtPeriodEnd === false;

  const billingStatus = status === 'active' ? 'active'
    : status === 'past_due' ? 'past_due'
    : status === 'canceled' ? 'cancelled'
    : status;

  const patch: Partial<AccountFeatures> = {
    billingAvailable: true,
    billingStatus,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    cancelAtPeriodEnd,
    billingFreshAt: occurredAt,
  };

  if (mrrCents !== null) {
    patch.currentMrrCents = mrrCents;
  }

  if (cancelAtPeriodEnd) {
    patch.cancelIntentAt = occurredAt;
  }

  return {
    provider: 'stripe',
    eventId: webhookEventId,
    providerEventId,
    eventType: 'customer.subscription.updated',
    occurredAt,
    patch,
    evidence: [
      {
        eventId: webhookEventId,
        provider: 'stripe',
        objectId: subscriptionId,
        fact: `subscription.updated: status=${status}, cancel_at_period_end=${cancelAtPeriodEnd}, mrr=${mrrCents}, customer=${customerId}`,
      },
    ],
    outcomeCandidate: isCancellationReversed ? {
      kind: 'cancellation_reversed',
      subscriptionId: subscriptionId ?? undefined,
    } : null,
  };
}

export function projectStripeSubscriptionDeleted(
  webhookEventId: string,
  providerEventId: string,
  payload: Record<string, any>,
  occurredAt: string,
  priorMrrCents: number | null
): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> {
  const customerId = typeof payload.customer === 'string' ? payload.customer : null;
  const subscriptionId = typeof payload.id === 'string' ? payload.id : null;

  // §40.5.2: Calculate event MRR from subscription items when prior MRR is missing
  let eventMrrCents = priorMrrCents ?? 0;
  if (!priorMrrCents || priorMrrCents <= 0) {
    const item = payload.items?.data?.[0];
    if (item?.price) {
      const unitAmount = item.price.unit_amount ?? 0;
      const interval = item.price.recurring?.interval ?? 'month';
      eventMrrCents = interval === 'year' ? Math.round(unitAmount / 12)
               : interval === 'week' ? unitAmount * 4
               : unitAmount;
    }
  }

  return {
    provider: 'stripe',
    eventId: webhookEventId,
    providerEventId,
    eventType: 'customer.subscription.deleted',
    occurredAt,
    patch: {
      billingAvailable: true,
      billingStatus: 'cancelled',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      // §40.5.2: Store pre-cancel MRR BEFORE zeroing current
      preCancelMrrCents: eventMrrCents > 0 ? eventMrrCents : null,
      currentMrrCents: 0,
      cancelledAt: occurredAt,
      billingFreshAt: occurredAt,
    },
    evidence: [
      {
        eventId: webhookEventId,
        provider: 'stripe',
        objectId: subscriptionId,
        fact: `subscription.deleted: subscription=${subscriptionId}, customer=${customerId}, pre_cancel_mrr=${eventMrrCents}`,
      },
    ],
    outcomeCandidate: null,
  };
}

// ---------------------------------------------------------------------------
// §40.5.3  PostHog projections
// ---------------------------------------------------------------------------

export function projectPostHogEvent(
  webhookEventId: string,
  providerEventId: string,
  payload: Record<string, any>,
  occurredAt: string
): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> {
  const eventName = typeof payload.event === 'string' ? payload.event : '';
  const properties = payload.properties ?? {};
  const distinctId = typeof payload.distinct_id === 'string' ? payload.distinct_id : null;

  const patch: Partial<AccountFeatures> = {
    usageAvailable: true,
    lastProductActivityAt: occurredAt,
    usageFreshAt: occurredAt,
  };

  // Detect cancellation intent
  const isCancelIntent = eventName === 'allel_cancel_intent'
    || eventName === '$pageview' && (
      typeof properties.$current_url === 'string'
      && /cancel|churn|downgrade/i.test(properties.$current_url)
    );

  if (isCancelIntent) {
    patch.cancelIntentAt = occurredAt;
  }

  // Accept trusted server-side window aggregates
  if (typeof properties.usage_current_7d === 'number') {
    patch.usageCurrent7d = properties.usage_current_7d;
  }
  if (typeof properties.usage_previous_7d === 'number') {
    patch.usagePrevious7d = properties.usage_previous_7d;
  }
  if (typeof properties.usage_delta_percent === 'number') {
    patch.usageDeltaPercent = properties.usage_delta_percent;
  }
  if (typeof properties.key_feature_current_7d === 'number') {
    patch.keyFeatureCurrent7d = properties.key_feature_current_7d;
  }
  if (typeof properties.key_feature_previous_7d === 'number') {
    patch.keyFeaturePrevious7d = properties.key_feature_previous_7d;
  }
  if (typeof properties.key_feature_missing === 'boolean') {
    patch.keyFeatureMissing = properties.key_feature_missing;
  }

  const fact = isCancelIntent
    ? `cancel_intent detected: event=${eventName}, distinct_id=${distinctId}`
    : `posthog event: event=${eventName}, distinct_id=${distinctId}`;

  const isRecoveryAction = eventName === 'allel_recovery_action';

  return {
    provider: 'posthog',
    eventId: webhookEventId,
    providerEventId,
    eventType: eventName,
    occurredAt,
    patch,
    evidence: [
      {
        eventId: webhookEventId,
        provider: 'posthog',
        objectId: distinctId,
        fact,
      },
    ],
    outcomeCandidate: isRecoveryAction ? { kind: 'usage_rebound' } : null,
  };
}

// ---------------------------------------------------------------------------
// Gmail projections
// ---------------------------------------------------------------------------

export function projectGmailInboundMessage(
  webhookEventId: string,
  providerEventId: string,
  payload: Record<string, any>,
  occurredAt: string
): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> {
  const threadId = typeof payload.thread_id === 'string' ? payload.thread_id : null
  const messageId = typeof payload.message_id === 'string' ? payload.message_id : providerEventId
  const sender = typeof payload.from_address === 'string' ? payload.from_address : null

  return {
    provider: 'gmail',
    eventId: webhookEventId,
    providerEventId,
    eventType: 'gmail.message_received',
    occurredAt,
    patch: {
      communicationAvailable: true,
      lastInboundAt: occurredAt,
      communicationFreshAt: occurredAt,
      // A customer response on the tracked thread closes the outstanding
      // recovery outreach rather than creating a new outreach candidate.
      unrepliedOutboundCount: 0,
      ...(threadId ? { gmailThreadId: threadId } : {}),
    },
    evidence: [
      {
        eventId: webhookEventId,
        provider: 'gmail',
        objectId: messageId,
        fact: `gmail customer reply received from ${sender ?? 'verified contact'} in thread ${threadId ?? 'unknown'}`,
      },
    ],
    outcomeCandidate: { kind: 'customer_reply' },
  }
}

// ---------------------------------------------------------------------------
// §40.5.2  Stripe identity extraction
// ---------------------------------------------------------------------------

export function extractStripeIdentity(
  eventType: string,
  payload: Record<string, any>
): { identityType: 'customer_id'; externalId: string | null } {
  // §40.8: invoice events → invoice.customer; subscription events → subscription.customer
  if (eventType.startsWith('invoice')) {
    return { identityType: 'customer_id', externalId: typeof payload.customer === 'string' ? payload.customer : null };
  }
  if (eventType.startsWith('customer.subscription')) {
    return { identityType: 'customer_id', externalId: typeof payload.customer === 'string' ? payload.customer : null };
  }
  if (eventType.startsWith('customer.')) {
    return { identityType: 'customer_id', externalId: typeof payload.id === 'string' ? payload.id : null };
  }
  return { identityType: 'customer_id', externalId: typeof payload.customer === 'string' ? payload.customer : null };
}

export function extractPostHogIdentity(
  payload: Record<string, any>
): { identityType: 'distinct_id'; externalId: string | null } {
  return {
    identityType: 'distinct_id',
    externalId: typeof payload.distinct_id === 'string' ? payload.distinct_id : null,
  };
}

// ---------------------------------------------------------------------------
// Route a raw event to the correct projector
// ---------------------------------------------------------------------------

export function projectProviderEvent(params: {
  webhookEventId: string;
  providerEventId: string;
  provider: 'stripe' | 'posthog' | 'gmail';
  eventType: string;
  payload: Record<string, any>;
  occurredAt: string;
  priorMrrCents?: number | null;
}): Omit<ProviderFeatureProjection, 'workspaceId' | 'customerAccountId'> | null {
  const { webhookEventId, providerEventId, provider, eventType, payload, occurredAt } = params;

  if (provider === 'stripe') {
    switch (eventType) {
      case 'invoice.payment_failed':
        return projectStripeInvoicePaymentFailed(webhookEventId, providerEventId, payload, occurredAt);
      case 'invoice.paid':
        return projectStripeInvoicePaid(webhookEventId, providerEventId, payload, occurredAt);
      case 'customer.subscription.updated':
        return projectStripeSubscriptionUpdated(webhookEventId, providerEventId, payload, occurredAt);
      case 'customer.subscription.deleted':
        return projectStripeSubscriptionDeleted(webhookEventId, providerEventId, payload, occurredAt, params.priorMrrCents ?? null);
      default:
        return null; // Unsupported event type — no-op
    }
  }

  if (provider === 'posthog') {
    return projectPostHogEvent(webhookEventId, providerEventId, payload, occurredAt);
  }

  if (provider === 'gmail' && eventType === 'gmail.message_received') {
    return projectGmailInboundMessage(webhookEventId, providerEventId, payload, occurredAt);
  }

  return null;
}
