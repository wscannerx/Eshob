import type Stripe from "stripe";
import { type NextRequest } from "next/server";
import { stripe, mapStatus, planFromPrice, periodEndOf, tsToIso } from "@/lib/stripe";
import { planFromResolved } from "@/lib/stripe-prices";
import { markCardOnFile, markPastDue } from "@/lib/billing-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const update = (businessId: string, patch: Record<string, unknown>) =>
    admin.from("subscriptions").update(patch).eq("business_id", businessId);

  async function businessByCustomer(customer: string | null): Promise<string | null> {
    if (!customer) return null;
    const { data } = await admin
      .from("subscriptions")
      .select("business_id")
      .eq("stripe_customer_id", customer)
      .maybeSingle();
    return data?.business_id ?? null;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const businessId = s.metadata?.business_id || (await businessByCustomer(s.customer as string));
      if (businessId) {
        if (s.mode === "payment") {
          // lifetime (one-time)
          await update(businessId, {
            status: "active",
            plan: "lifetime",
            stripe_customer_id: (s.customer as string) ?? undefined,
          });
        } else {
          await update(businessId, {
            stripe_customer_id: (s.customer as string) ?? undefined,
            stripe_subscription_id: (s.subscription as string) ?? undefined,
            plan: s.metadata?.plan ?? undefined,
          });
        }
        // Completing checkout means a card was accepted — this is what lets
        // the owner past onboarding. Only ever set once (see markCardOnFile).
        await markCardOnFile(businessId);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId =
        sub.metadata?.business_id || (await businessByCustomer(sub.customer as string));
      if (businessId) {
        // Trust the actual price over metadata — metadata can be stale after a
        // plan switch made from the billing portal.
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan =
          planFromPrice(priceId) ?? planFromResolved(priceId) ?? sub.metadata?.plan;
        const status = mapStatus(sub.status);
        await update(businessId, {
          stripe_subscription_id: sub.id,
          status,
          plan: plan ?? undefined,
          current_period_end: periodEndOf(sub),
          trial_ends_at: tsToIso(sub.trial_end),
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          // Anything other than past_due means they're paid up — wipe the
          // grace clock so a future failure starts a fresh three days.
          ...(status === "past_due" ? {} : { past_due_since: null }),
        });
        if (status === "past_due") await markPastDue(businessId);
        // Safety net in case this endpoint isn't subscribed to
        // checkout.session.completed: a subscription can only exist here
        // because checkout collected a card.
        await markCardOnFile(businessId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId =
        sub.metadata?.business_id || (await businessByCustomer(sub.customer as string));
      if (businessId) await update(businessId, { status: "canceled" });
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const businessId = await businessByCustomer(inv.customer as string);
      if (businessId) {
        await update(businessId, { status: "past_due" });
        // Stripe retries this invoice for about two weeks and fires this event
        // each time; markPastDue only stamps the first one, so the deadline
        // doesn't slide forward with every retry.
        await markPastDue(businessId);
      }
      break;
    }
  }

  return new Response("ok");
}
