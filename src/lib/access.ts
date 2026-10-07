/**
 * One place that answers: may this business still use the service?
 *
 * Both the owner's dashboard and the public scan page read this, so a locked
 * business can't be reached from either side. Keeping the rule here (rather
 * than re-deriving it per page) is what stops the two drifting apart — a
 * dashboard that locks while customer scans keep working is worse than
 * either behaviour on its own.
 */

/**
 * How long a failed payment is tolerated before access stops.
 *
 * Stripe's automatic retries run over roughly two weeks, and most failures are
 * a card that expired or a bank that flagged one charge — things the owner
 * fixes in a minute once they notice. Locking on the first failure would cut
 * off paying customers over a temporary blip, so they get a few days of
 * warning first. Three days is the owner's choice: long enough for Stripe's
 * first retries, short enough that nobody runs the service free for a month.
 */
export const PAST_DUE_GRACE_DAYS = 3;

const DAY_MS = 86_400_000;

export type SubLike = {
  status: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  past_due_since: string | null;
};

export type Access =
  /** Paid up, or inside a trial that's still running. */
  | { state: "ok" }
  /** A payment failed but the grace window hasn't run out yet. */
  | { state: "grace"; daysLeft: number }
  /** Access has stopped. */
  | { state: "locked"; reason: "past_due" | "canceled" | "trial_ended" };

export function accessFor(sub: SubLike | null | undefined): Access {
  // No billing row at all. This shouldn't happen — create_business() writes
  // one — but if it ever does, a missing row is our bug, not the owner's, and
  // locking them out of their own customer data would be the wrong way to
  // find out about it.
  if (!sub) return { state: "ok" };

  if (sub.status === "canceled") return { state: "locked", reason: "canceled" };

  if (sub.status === "past_due") {
    // past_due_since is stamped the moment the status flips. If it's missing
    // (a row that went past_due before this column existed), start the clock
    // now rather than locking immediately — err towards letting a paying
    // customer in.
    const since = sub.past_due_since ? new Date(sub.past_due_since).getTime() : Date.now();
    const elapsedDays = (Date.now() - since) / DAY_MS;
    const daysLeft = Math.ceil(PAST_DUE_GRACE_DAYS - elapsedDays);
    return daysLeft > 0 ? { state: "grace", daysLeft } : { state: "locked", reason: "past_due" };
  }

  // A trial with no plan behind it can simply run out. A trial on a paid plan
  // rolls into billing instead, and Stripe moves it to active or past_due —
  // so this only catches rows that predate card-at-signup.
  if (
    sub.status === "trialing" &&
    !sub.plan &&
    sub.trial_ends_at !== null &&
    new Date(sub.trial_ends_at).getTime() < Date.now()
  ) {
    return { state: "locked", reason: "trial_ended" };
  }

  return { state: "ok" };
}

/** What the owner is told, in their own terms. */
export function lockMessage(reason: "past_due" | "canceled" | "trial_ended"): string {
  if (reason === "past_due") {
    return "We couldn't take your last payment, and the grace period has ended. Update your card to switch your loyalty cards back on.";
  }
  if (reason === "canceled") {
    return "Your subscription has ended. Choose a plan to start collecting stamps again.";
  }
  return "Your free trial has ended. Choose a plan to start collecting stamps again.";
}

/**
 * The columns accessFor needs. Kept here so every caller selects the same set —
 * a query that forgets past_due_since silently turns every failed payment into
 * a fresh three-day grace period.
 */
export const ACCESS_COLUMNS = "status,plan,trial_ends_at,past_due_since";
