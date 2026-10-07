-- =============================================================================
-- 0010_grace_period.sql
-- Records WHEN a subscription first went past_due, so a failed payment can be
-- tolerated for a few days before access stops. Run after 0009. Safe to run
-- more than once.
--
-- Why a column and not a calculation: once an invoice fails, Stripe still
-- rolls current_period_end forward, and our own updated_at changes on every
-- sync — neither can tell us how long this business has actually been unpaid.
-- =============================================================================

alter table public.subscriptions
  add column if not exists past_due_since timestamptz;

-- Anyone already sitting in past_due when this ships starts their grace period
-- now. Backdating it would lock them out the moment the code deploys, without
-- the warning the grace period exists to give.
update public.subscriptions
   set past_due_since = now()
 where status = 'past_due'
   and past_due_since is null;
