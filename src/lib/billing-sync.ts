import { stripe, mapStatus, planFromPrice, periodEndOf, tsToIso } from "./stripe";
import { planFromResolved } from "./stripe-prices";
import { createAdminClient } from "./supabase/admin";

/**
 * Record that this business has a payment method on file. Idempotent: the
 * first card sets the timestamp and later checkouts leave it alone, because
 * it also marks when the one free trial was handed out.
 */
export async function markCardOnFile(businessId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ card_added_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .is("card_added_at", null);
}

/**
 * Start the grace-period clock on a failed payment.
 *
 * Idempotent by the same trick as markCardOnFile: the `.is(null)` filter means
 * only the FIRST failure stamps a time. Stripe retries a failed invoice several
 * times over about two weeks, and every retry sends another
 * invoice.payment_failed — without this, each one would push the deadline back
 * and the grace period would never actually expire.
 */
export async function markPastDue(businessId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ past_due_since: new Date().toISOString() })
    .eq("business_id", businessId)
    .is("past_due_since", null);
}

/**
 * Pull the live subscription state from Stripe and write it into our DB.
 *
 * Webhooks are the normal path, but they can be missed (CLI not running in
 * dev, endpoint down, signature mismatch). This makes the dashboard
 * self-healing: whenever we render billing we can reconcile with Stripe.
 * Safe to call often — it's a couple of read-only Stripe calls plus one update.
 */
export async function syncFromStripe(businessId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id,card_added_at")
    .eq("business_id", businessId)
    .maybeSingle();

  const customer = row?.stripe_customer_id as string | undefined;
  if (!customer) return; // never checked out — nothing to reconcile

  // Checkout always collects a card, so anything Stripe has for this customer
  // means onboarding finished — even if the return trip was interrupted.
  const cardPatch = row?.card_added_at ? {} : { card_added_at: new Date().toISOString() };

  try {
    const subs = await stripe.subscriptions.list({ customer, status: "all", limit: 10 });

    // Prefer a subscription that's still live; otherwise the most recent one.
    const live =
      subs.data.find((s) => ["trialing", "active", "past_due", "unpaid"].includes(s.status)) ??
      subs.data[0];

    if (live) {
      // env match first, then anything we've resolved ourselves this process
      const priceId = live.items.data[0]?.price?.id;
      const plan = planFromPrice(priceId) ?? planFromResolved(priceId);
      const status = mapStatus(live.status);
      await admin
        .from("subscriptions")
        .update({
          stripe_subscription_id: live.id,
          status,
          ...(plan ? { plan } : {}),
          current_period_end: periodEndOf(live),
          trial_ends_at: tsToIso(live.trial_end),
          cancel_at_period_end: live.cancel_at_period_end ?? false,
          // Paid again (or back in trial) → the grace clock is irrelevant, so
          // clear it. Leaving a stale timestamp would mean the NEXT failed
          // payment inherited an already-expired grace period and locked the
          // owner out with no warning at all.
          ...(status === "past_due" ? {} : { past_due_since: null }),
          ...cardPatch,
        })
        .eq("business_id", businessId);
      if (status === "past_due") await markPastDue(businessId);
      return;
    }

    // No subscription at all — maybe they bought the one-time Lifetime plan.
    const sessions = await stripe.checkout.sessions.list({ customer, limit: 20 });
    const paid = sessions.data.find((s) => s.mode === "payment" && s.payment_status === "paid");
    if (paid) {
      await admin
        .from("subscriptions")
        .update({
          status: "active",
          plan: "lifetime",
          cancel_at_period_end: false,
          past_due_since: null,
          ...cardPatch,
        })
        .eq("business_id", businessId);
    }
  } catch (err) {
    // Never break the dashboard because Stripe is unreachable.
    console.error("[billing-sync]", err);
  }
}
