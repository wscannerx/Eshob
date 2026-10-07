import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusinessLocked } from "@/lib/access-server";
import { row } from "@/lib/db";
import { getCustomerId } from "@/lib/customer";
import { JoinForm, CollectButton, RedeemForm } from "./interactive";
import { ScratchCard } from "./scratch-card";
import { ReviewButton } from "./review-cta";
import { InstallPrompt } from "./install-prompt";
import { ThemeToggle } from "@/components/theme-toggle";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return {
    manifest: `/api/manifest/${slug}`,
    appleWebApp: { capable: true, statusBarStyle: "default" as const, title: "Loyalty Card" },
    icons: { apple: "/apple-icon.png" },
  };
}

type CampaignRow = {
  id: string;
  business_id: string;
  slug: string;
  name: string;
  reward_text: string;
  reward_image_url: string | null;
  stamps_required: number;
  approval_mode: "auto" | "manual";
  status: string;
  businesses: {
    name: string;
    logo_url: string | null;
    allow_remote_scan: boolean | null;
    lat: number | null;
    lng: number | null;
    social_links: { google_review?: string; instagram?: string; facebook?: string } | null;
  } | null;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      {children}
      <InstallPrompt />
    </main>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("campaigns")
    .select("id,business_id,slug,name,reward_text,reward_image_url,stamps_required,approval_mode,status,businesses(name,logo_url,allow_remote_scan,lat,lng,social_links)")
    .eq("slug", slug)
    .maybeSingle();

  const campaign = row<CampaignRow>(data);

  // The business stopped paying. Say so the way a customer standing at a
  // counter needs to hear it — their stamps are fine, the shop just has to sort
  // something out — and never mention billing. They aren't the ones who owe us.
  if (campaign && (await isBusinessLocked(admin, campaign.business_id))) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-line text-2xl">⏸</div>
          <h1 className="text-xl font-bold">Temporarily unavailable</h1>
          <p className="mt-2 text-sm text-muted">
            This loyalty card is paused at the moment. Your stamps are safe — please
            check back soon, or ask at the counter.
          </p>
        </div>
      </Shell>
    );
  }

  if (!campaign || campaign.status !== "active") {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-line text-2xl">◎</div>
          <h1 className="text-xl font-bold">Card not available</h1>
          <p className="mt-2 text-sm text-muted">This loyalty card is paused or doesn&apos;t exist.</p>
        </div>
      </Shell>
    );
  }

  const biz = campaign.businesses;
  const businessName = biz?.name ?? "This business";
  const geoRequired = !biz?.allow_remote_scan && biz?.lat != null && biz?.lng != null;
  const googleReview = biz?.social_links?.google_review?.trim();

  const customerId = await getCustomerId();
  let membership: { id: string; stamp_count: number } | null = null;
  if (customerId) {
    const { data: m } = await admin
      .from("memberships")
      .select("id,stamp_count")
      .eq("campaign_id", campaign.id)
      .eq("customer_id", customerId)
      .maybeSingle();
    membership = m;
  }

  // unclaimed scratch-card wins for this customer at this business
  let scratchWins: { id: string; prize_label: string; revealed: boolean }[] = [];
  if (customerId) {
    const { data: sw } = await admin
      .from("scratch_wins")
      .select("id,prize_label,revealed")
      .eq("business_id", campaign.business_id)
      .eq("customer_id", customerId)
      .eq("claimed", false)
      .order("created_at", { ascending: false });
    scratchWins = sw ?? [];
  }

  // other active offers from the same business
  const { data: others } = await admin
    .from("campaigns")
    .select("slug,name,reward_text,stamps_required,reward_image_url")
    .eq("business_id", campaign.business_id)
    .eq("status", "active")
    .neq("id", campaign.id)
    .limit(4);

  const { count: menuCount } = await admin
    .from("menu_items")
    .select("*", { count: "exact", head: true })
    .eq("business_id", campaign.business_id)
    .eq("active", true);
  const hasMenu = (menuCount ?? 0) > 0;

  const Header = (
    <div className="mb-5 flex flex-col items-center text-center">
      {biz?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={biz.logo_url} alt="" className="mb-2 h-16 w-16 rounded-2xl object-cover shadow-sm" />
      ) : (
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
          {businessName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="text-lg font-bold">{businessName}</div>
      <div className="text-xs uppercase tracking-widest text-accent">Premium partner ✓</div>
      {hasMenu && (
        <Link href={`/m/${campaign.business_id}`} className="mt-2 rounded-full border border-line-strong bg-card px-3 py-1 text-xs font-medium text-body hover:bg-app">
          📋 View our menu
        </Link>
      )}
    </div>
  );

  // ---------- NOT JOINED ----------
  if (!membership) {
    return (
      <Shell>
        {Header}
        <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <h1 className="text-center text-xl font-bold">{campaign.name}</h1>
          <p className="mt-1 text-center text-sm text-body">
            Collect {campaign.stamps_required} stamps → <strong>{campaign.reward_text}</strong>
          </p>
          <JoinForm slug={slug} geoRequired={!!geoRequired} />
        </div>
      </Shell>
    );
  }

  // ---------- JOINED: wallet ----------
  const count = membership.stamp_count;
  const required = campaign.stamps_required;
  const full = count >= required;
  const remaining = Math.max(required - count, 0);
  const pct = Math.min(Math.round((count / required) * 100), 100);
  const xp = count * 10;
  const dots = Array.from({ length: required }, (_, i) => i < count);

  return (
    <Shell>
      {Header}

      <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">
        {/* progress */}
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">
            {count} of {required} Stamps
          </div>
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
            ✦ {xp} XP
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-elev">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* next treat */}
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-app p-3">
          {campaign.reward_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.reward_image_url} alt="" className="h-14 w-14 flex-none rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-accent/10 text-2xl">🎁</div>
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-ok">Your next treat</div>
            <div className="truncate font-bold">{campaign.reward_text}</div>
            <div className="text-sm text-muted">
              {full ? "Ready to claim!" : `Collect ${remaining} more stamp${remaining > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>

        {/* stamp card */}
        <div className="mt-5 grid grid-cols-5 gap-2">
          {dots.map((filled, i) => {
            const isReward = i === required - 1;
            return (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-full border text-sm font-bold ${
                  filled
                    ? "border-brand bg-brand text-white"
                    : isReward
                    ? "border-2 border-dashed border-brand/50 text-accent"
                    : "border-dashed border-line-strong text-faint"
                }`}
              >
                {filled ? "★" : isReward ? "🎁" : i + 1}
              </div>
            );
          })}
        </div>

        {full ? (
          <RedeemForm
            slug={slug}
            reward={campaign.reward_text}
            reviewUrl={googleReview || null}
            business={biz?.name ?? "us"}
          />
        ) : (
          <CollectButton slug={slug} approvalMode={campaign.approval_mode} geoRequired={!!geoRequired} />
        )}
      </div>

      {/* scratch card wins */}
      {scratchWins.length > 0 && (
        <div className="mt-4 space-y-3">
          {scratchWins.map((w) => (
            <ScratchCard key={w.id} slug={slug} win={w} />
          ))}
        </div>
      )}

      {/* rate on google */}
      {googleReview && <ReviewButton href={googleReview} />}

      {/* other offers */}
      {others && others.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-faint">
            More rewards here
          </div>
          <div className="space-y-2">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/j/${o.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 hover:border-brand/40"
              >
                {o.reward_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.reward_image_url} alt="" className="h-10 w-10 flex-none rounded-lg object-cover" />
                ) : (
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-accent/10 text-lg">🎁</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.reward_text}</div>
                  <div className="text-xs text-faint">{o.stamps_required} stamps</div>
                </div>
                <span className="text-faint">›</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
