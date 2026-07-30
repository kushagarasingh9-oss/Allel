/**
 * Stripe Integration Service
 *
 * Full API coverage: customers, subscriptions, invoices, charges,
 * refunds, coupons, payment methods, balance, disputes, products.
 * Uses Stripe SDK directly with API key from integration_tokens.
 */

import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from './encryption'
import { getIntegrationToken } from './provider-tokens'

const STRIPE_API_VERSION = '2025-03-31.basil' as const

// ============================================================
//  Client Factory
// ============================================================

export async function getStripeClient(workspaceId: string): Promise<Stripe> {
  // Uses the shared token helper which falls back from api_key → oauth_access,
  // so Stripe works regardless of whether it was connected manually or via Pipedream OAuth.
  const apiKey = await getIntegrationToken(workspaceId, 'stripe')
  return new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION })
}

// ============================================================
//  Webhook Verification
// ============================================================

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: STRIPE_API_VERSION,
  })
  return stripe.webhooks.constructEvent(payload, signature, secret)
}

// ============================================================
//  Subscription Sync (existing)
// ============================================================

export type SyncedSubscription = {
  stripeCustomerId: string
  customerEmail: string | null
  customerName: string | null
  subscriptionId: string
  status: string
  planName: string | null
  mrrCents: number
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export async function syncSubscriptions(workspaceId: string): Promise<SyncedSubscription[]> {
  const stripe = await getStripeClient(workspaceId)
  const results: SyncedSubscription[] = []

  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const subscriptions = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.customer'],
    })

    for (const sub of subscriptions.data) {
      const customer = sub.customer as Stripe.Customer
      const item = sub.items.data[0]
      const unitAmount = item?.price?.unit_amount ?? 0
      const interval = item?.price?.recurring?.interval ?? 'month'

      const mrrCents =
        interval === 'year' ? Math.round(unitAmount / 12) :
        interval === 'week' ? unitAmount * 4 :
        unitAmount

      results.push({
        stripeCustomerId: customer.id,
        customerEmail: customer.email,
        customerName: customer.name ?? null,
        subscriptionId: sub.id,
        status: sub.status,
        planName: item?.price?.nickname ?? item?.price?.product?.toString() ?? null,
        mrrCents,
        currentPeriodEnd: new Date(((item as unknown as { current_period_end?: number })?.current_period_end ?? Math.floor(Date.now() / 1000)) * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      })
    }

    hasMore = subscriptions.has_more
    if (subscriptions.data.length > 0) {
      startingAfter = subscriptions.data[subscriptions.data.length - 1].id
    }
  }

  return results
}

// ============================================================
//  Rescue Coupon (existing)
// ============================================================

export async function createRescueCoupon(
  workspaceId: string,
  params: {
    percentOff: number
    durationInMonths: number
    name?: string
  }
): Promise<Stripe.Coupon> {
  const stripe = await getStripeClient(workspaceId)

  return stripe.coupons.create({
    percent_off: params.percentOff,
    duration: 'repeating',
    duration_in_months: params.durationInMonths,
    name: params.name ?? `Rescue ${params.percentOff}% off for ${params.durationInMonths}mo`,
  })
}

// ============================================================
//  Validate API Key (existing)
// ============================================================

export async function validateStripeKey(apiKey: string): Promise<boolean> {
  try {
    const stripe = new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION })
    await stripe.customers.list({ limit: 1 })
    return true
  } catch {
    return false
  }
}

// ============================================================
//  Customers: List / Get / Search / Update
// ============================================================

/** List customers */
export async function listStripeCustomers(
  stripe: Stripe,
  limit: number = 20
): Promise<Stripe.Customer[]> {
  const result = await stripe.customers.list({ limit })
  return result.data
}

/** Get a single customer */
export async function getStripeCustomer(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.Customer> {
  return stripe.customers.retrieve(customerId, {
    expand: ['subscriptions', 'sources'],
  }) as Promise<Stripe.Customer>
}

/** Search customers by email or name */
export async function searchStripeCustomers(
  stripe: Stripe,
  query: string,
  limit: number = 10
): Promise<Stripe.Customer[]> {
  // ── Security: Escape user input for Stripe search query syntax ──
  // Stripe search uses `"..."` delimiters; unescaped quotes could
  // inject arbitrary search predicates.
  const sanitized = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const result = await stripe.customers.search({
    query: `email~"${sanitized}" OR name~"${sanitized}"`,
    limit,
  })
  return result.data
}

/** Update customer metadata or info */
export async function updateStripeCustomer(
  stripe: Stripe,
  customerId: string,
  updates: { name?: string; email?: string; metadata?: Record<string, string> }
): Promise<Stripe.Customer> {
  return stripe.customers.update(customerId, updates)
}

// ============================================================
//  Subscriptions: Get / Cancel / Update / Pause / Resume
// ============================================================

/** Get subscription details */
export async function getStripeSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['customer', 'latest_invoice'],
  })
}

/** Cancel subscription (at period end or immediately) */
export async function cancelStripeSubscription(
  stripe: Stripe,
  subscriptionId: string,
  atPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  if (atPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
  }
  return stripe.subscriptions.cancel(subscriptionId)
}

/** Pause a subscription (set to paused collection) */
export async function pauseStripeSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    pause_collection: { behavior: 'mark_uncollectible' },
  })
}

/** Resume a paused subscription */
export async function resumeStripeSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    pause_collection: '',
  } as Stripe.SubscriptionUpdateParams)
}

/** Apply a coupon to a subscription */
export async function applySubscriptionCoupon(
  stripe: Stripe,
  subscriptionId: string,
  couponId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, { discounts: [{ coupon: couponId }] })
}

// ============================================================
//  Invoices: List / Get / Void / Send / Upcoming / Pay
// ============================================================

/** List invoices for a customer */
export async function listStripeInvoices(
  stripe: Stripe,
  customerId: string,
  limit: number = 10
): Promise<Stripe.Invoice[]> {
  const result = await stripe.invoices.list({ customer: customerId, limit })
  return result.data
}

/** Get a single invoice */
export async function getStripeInvoice(
  stripe: Stripe,
  invoiceId: string
): Promise<Stripe.Invoice> {
  return stripe.invoices.retrieve(invoiceId)
}

/** Void a draft/open invoice */
export async function voidStripeInvoice(
  stripe: Stripe,
  invoiceId: string
): Promise<Stripe.Invoice> {
  return stripe.invoices.voidInvoice(invoiceId)
}

/** Send an invoice to the customer */
export async function sendStripeInvoice(
  stripe: Stripe,
  invoiceId: string
): Promise<Stripe.Invoice> {
  return stripe.invoices.sendInvoice(invoiceId)
}

/** Get upcoming invoice for a customer */
export async function getUpcomingInvoice(
  stripe: Stripe,
  customerId: string
) {
  return stripe.invoices.createPreview({ customer: customerId })
}

// ============================================================
//  Charges & Refunds
// ============================================================

/** List recent charges for a customer */
export async function listStripeCharges(
  stripe: Stripe,
  customerId: string,
  limit: number = 10
): Promise<Stripe.Charge[]> {
  const result = await stripe.charges.list({ customer: customerId, limit })
  return result.data
}

/** Create a refund */
export async function createStripeRefund(
  stripe: Stripe,
  chargeId: string,
  amountCents?: number,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<Stripe.Refund> {
  return stripe.refunds.create({
    charge: chargeId,
    ...(amountCents ? { amount: amountCents } : {}),
    ...(reason ? { reason } : {}),
  })
}

// ============================================================
//  Payment Methods
// ============================================================

/** List payment methods for a customer */
export async function listPaymentMethods(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.PaymentMethod[]> {
  const result = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  })
  return result.data
}

// ============================================================
//  Balance Transactions
// ============================================================

/** List recent balance transactions */
export async function listBalanceTransactions(
  stripe: Stripe,
  limit: number = 20
): Promise<Stripe.BalanceTransaction[]> {
  const result = await stripe.balanceTransactions.list({ limit })
  return result.data
}

/** Get current balance */
export async function getStripeBalance(stripe: Stripe): Promise<Stripe.Balance> {
  return stripe.balance.retrieve()
}

// ============================================================
//  Disputes
// ============================================================

/** List open disputes */
export async function listStripeDisputes(
  stripe: Stripe,
  limit: number = 10
): Promise<Stripe.Dispute[]> {
  const result = await stripe.disputes.list({ limit })
  return result.data
}

// ============================================================
//  Products & Prices
// ============================================================

/** List products */
export async function listStripeProducts(
  stripe: Stripe,
  limit: number = 20
): Promise<Stripe.Product[]> {
  const result = await stripe.products.list({ limit, active: true })
  return result.data
}

/** List prices for a product */
export async function listStripePrices(
  stripe: Stripe,
  productId?: string,
  limit: number = 20
): Promise<Stripe.Price[]> {
  const params: Stripe.PriceListParams = { limit, active: true }
  if (productId) params.product = productId
  const result = await stripe.prices.list(params)
  return result.data
}

// ============================================================
//  Coupons
// ============================================================

/** List all coupons */
export async function listStripeCoupons(
  stripe: Stripe,
  limit: number = 20
): Promise<Stripe.Coupon[]> {
  const result = await stripe.coupons.list({ limit })
  return result.data
}

