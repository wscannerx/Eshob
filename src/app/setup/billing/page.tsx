import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndBusiness } from "@/lib/business";
import { signOut } from "@/app/actions";
import { PLANS, type PlanKey } from "@/lib/stripe";
import { TRIAL_DAYS } from "@/lib/checkout";
import { SubmitButton } from "@/components/submit-button";
import { startOnboardingCheckout } from "./actions";

export const metadata = { title: "Add a payment method · wscanner" };

const COPY: Record<PlanKey, { tag: string; then: string; cta: string }> = {
  monthly: { tag: `${TRIAL_DAYS} days free`, then: "then $20 CAD a month", cta: `Start ${TRIAL_DAYS}-day trial` },
  yearly: { tag: `${TRIAL_DAYS} days free`, then: "then $150 CAD a year", cta: `Start ${TRIAL_DAYS}-day trial` },
  lifetime: { tag: "One payment", then: "charged today, never again", cta: "Pay $250 CAD once" },
};

const ORDER: PlanKey[] = ["monthly", "yearly", "lifetime"];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 flex-none text-accent" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default async function OnboardingBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const { user, business, businessId } = await getCurrentUserAndBusiness();
  if (!user) redirect("/login");
  if (!businessId) redirect("/setup");

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("card_added_at,plan,status")
    .eq("business_id", businessId)
    .maybeSingle();

  // Card already on file (or a paid Lifetime) — nothing to do here.
  if (sub?.card_added_at || (sub?.plan === "lifetime" && sub?.status === "active")) {
    redirect("/dashboard");
  }

  // No first-charge date is printed here on purpose. This page renders on the
  // server, so any date it computes uses the server's clock and timezone —
  // while Stripe works out the real trial end when the Checkout Session is
  // created, in the customer's. The two drift by a day, and a page that
  // promises one billing date while Stripe's own page shows another is the
  // kind of thing a customer disputes. Stripe prints the exact date on its
  // checkout page before they confirm, so that is the single source of truth.

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 pb-20">
      <div className="flex items-center justify-between py-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-accent">Step 2 of 2</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Add a payment method</h1>
        <p className="mt-3 text-body">
          {business?.name ? <strong>{business.name}</strong> : "Your business"} is ready. Choose a
          plan and add a card to start your {TRIAL_DAYS}-day free trial — nothing is charged for the
          first <strong>{TRIAL_DAYS} days</strong>, and cancelling before then costs you nothing.
        </p>
      </div>

      {billing === "cancel" && (
        <p className="mx-auto mt-6 max-w-2xl rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          Checkout was cancelled and no card was saved. Pick a plan whenever you&apos;re ready — your
          business details are safe.
        </p>
      )}

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {ORDER.map((key) => {
          const p = PLANS[key];
          const c = COPY[key];
          const popular = key === "yearly";
          return (
            <form
              key={key}
              action={startOnboardingCheckout.bind(null, key)}
              className={`relative flex flex-col rounded-2xl border bg-card p-6 ${
                popular ? "border-brand shadow-lg ring-1 ring-brand" : "border-line"
              }`}
            >
              {popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Best value
                </span>
              )}
              <span className="self-start rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                {c.tag}
              </span>
              <div className="mt-3 font-semibold text-muted">{p.label}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight">{p.price}</span>
                <span className="text-muted">{p.per}</span>
              </div>
              <div className="mt-1 text-sm text-muted">{c.then}</div>
              <SubmitButton className="mt-5 w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-ink">
                {c.cta}
              </SubmitButton>
            </form>
          );
        })}
      </div>

      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-line bg-card p-5">
        <h2 className="text-sm font-bold">Before you enter your card</h2>
        <ul className="mt-3 space-y-2 text-sm text-body">
          <li className="flex gap-2">
            <Check />
            <span>
              Your card details are typed on Stripe&apos;s own checkout page. wscanner never sees or
              stores your card number.
            </span>
          </li>
          <li className="flex gap-2">
            <Check />
            <span>
              Monthly and Yearly bill for the first time when the {TRIAL_DAYS}-day trial ends —
              Stripe shows you the exact date before you confirm. Cancel before then from Settings →
              Subscription and you pay nothing.
            </span>
          </li>
          <li className="flex gap-2">
            <Check />
            <span>
              Lifetime is charged today — it has no trial, and it&apos;s refundable in full for 14
              days.
            </span>
          </li>
          <li className="flex gap-2">
            <Check />
            <span>Prices are in Canadian dollars. You can switch or cancel any time.</span>
          </li>
        </ul>
      </div>

      <div className="mt-6 text-center text-sm text-muted">
        Signed in as {user.email} ·{" "}
        <form action={signOut} className="inline">
          <SubmitButton spinner="h-3.5 w-3.5" className="text-accent hover:underline">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
