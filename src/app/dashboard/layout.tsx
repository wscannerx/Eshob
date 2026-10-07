import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { row } from "@/lib/db";
import { syncFromStripe } from "@/lib/billing-sync";
import { accessFor, lockMessage, type Access } from "@/lib/access";
import { LEGAL } from "@/lib/legal";
import { signOut } from "@/app/actions";
import { openBillingPortal } from "./settings/billing";
import { SidebarNav, BottomNav } from "./nav";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/submit-button";
import { PendingLink } from "@/components/pending-link";

type SubRow = {
  status: string;
  trial_ends_at: string | null;
  plan: string | null;
  stripe_customer_id: string | null;
  card_added_at: string | null;
  past_due_since: string | null;
};

/** Onboarding isn't finished until a card is on file. */
function needsCard(sub: SubRow): boolean {
  if (sub.card_added_at) return false;
  return !(sub.plan === "lifetime" && sub.status === "active");
}

/** True when we'd warn the owner their access is lapsing. */
function needsWarning(sub: SubRow): boolean {
  return accessFor(sub).state !== "ok";
}

function BillingBanner({ access }: { access: Access }) {
  let msg: string | null = null;
  if (access.state === "grace") {
    const d = access.daysLeft;
    msg = `Your last payment failed. Update your card within ${d} ${
      d === 1 ? "day" : "days"
    } to keep your loyalty cards running.`;
  }
  if (!msg) return null;

  return (
    <div className="border-b border-warn-line bg-warn-soft px-4 py-2.5 text-sm text-warn">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <span>⚠️ {msg}</span>
        <PendingLink
          href="/dashboard/settings#subscription"
          spinner="h-3.5 w-3.5"
          className="flex-none rounded-lg bg-warn-solid px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Manage plan
        </PendingLink>
      </div>
    </div>
  );
}

/**
 * What the owner sees instead of the dashboard once access has stopped.
 *
 * Deliberately a dead end with exactly two ways out — pay, or sign out. The one
 * thing it must never do is strand them: a locked owner who can't reach billing
 * can't give us money either, so both routes back are on this page rather than
 * behind a dashboard they can no longer open.
 */
function LockScreen({
  reason,
  canUsePortal,
}: {
  reason: "past_due" | "canceled" | "trial_ended";
  canUsePortal: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-soft text-2xl">
          ⏸
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Your account is paused</h1>
        <p className="mt-3 text-body">{lockMessage(reason)}</p>

        <p className="mt-4 rounded-xl border border-line bg-elev px-4 py-3 text-sm text-muted">
          Your customers and their stamps are safe. Nothing is deleted — scanning
          starts again the moment a payment goes through.
        </p>

        <div className="mt-6 space-y-3">
          {canUsePortal && (
            <form action={openBillingPortal}>
              <SubmitButton className="w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-ink">
                Update payment method
              </SubmitButton>
            </form>
          )}
          <PendingLink
            href="/setup/billing"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 font-semibold transition hover:bg-elev"
          >
            Choose a plan
          </PendingLink>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-muted">
        Need a hand? <a className="text-accent hover:underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        {" · "}
        <form action={signOut} className="inline">
          <SubmitButton spinner="h-3.5 w-3.5" className="text-accent hover:underline">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, business, businessId } = await getCurrentUserAndBusiness();
  if (!user) redirect("/login");
  if (!businessId) redirect("/setup");

  const supabase = await createClient();
  const cols = "status,trial_ends_at,plan,stripe_customer_id,card_added_at,past_due_since";
  const read = async () =>
    row<SubRow>(
      (await supabase.from("subscriptions").select(cols).eq("business_id", businessId).maybeSingle())
        .data
    );

  let sub = await read();

  // About to turn someone away who may in fact have paid? Our row could be
  // stale (a missed webhook). Check with Stripe first, then re-read.
  const stale = sub && (needsWarning(sub) || needsCard(sub)) && sub.stripe_customer_id;
  if (stale) {
    await syncFromStripe(businessId);
    sub = (await read()) ?? sub;
  }

  // No card yet → finish onboarding. The trial starts there, not here.
  if (sub && needsCard(sub)) redirect("/setup/billing");

  // Grace period spent, or the plan is gone. Show the way back in and nothing
  // else — rendering the dashboard behind a dismissible banner is how a "paid"
  // product quietly becomes free.
  const access = accessFor(sub);
  if (access.state === "locked") {
    return <LockScreen reason={access.reason} canUsePortal={Boolean(sub?.stripe_customer_id)} />;
  }

  const initial = (business?.name ?? "B").charAt(0).toUpperCase();
  const logo = business?.logo_url;

  return (
    <div className="min-h-screen bg-app">
      <div className="mx-auto flex max-w-6xl">
        {/* desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-line bg-card p-5 sm:flex">
          <div className="mb-6 flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-10 w-10 flex-none rounded-xl object-cover" />
            ) : (
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand font-bold text-white">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-bold">{business?.name ?? "Business"}</div>
              <div className="truncate text-xs text-muted">
                {business?.category ?? "Dashboard"}
              </div>
            </div>
          </div>
          <SidebarNav />
          <div className="mt-auto flex items-center gap-2 pt-4">
            <form action={signOut} className="min-w-0 flex-1">
              <SubmitButton className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-body hover:bg-elev">
                Sign out
              </SubmitButton>
            </form>
            <ThemeToggle />
          </div>
        </aside>

        {/* main */}
        <div className="min-w-0 flex-1 pb-20 sm:pb-0">
          {/* mobile top bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3 sm:hidden">
            <div className="flex min-w-0 items-center gap-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                  {initial}
                </div>
              )}
              {/* A long business name has to give way — without this it
                  pushes the whole page wider than the phone screen, and
                  every card below loses its right-hand margin. */}
              <span className="truncate font-bold">{business?.name ?? "Dashboard"}</span>
            </div>
            <div className="flex flex-none items-center gap-3">
              <ThemeToggle className="h-8 w-8" />
              <form action={signOut}>
                <SubmitButton spinner="h-3.5 w-3.5" className="text-xs text-muted">
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </header>

          <BillingBanner access={access} />
          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
