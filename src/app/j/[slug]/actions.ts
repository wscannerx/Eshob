"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusinessLocked } from "@/lib/access-server";
import { row } from "@/lib/db";
import { getCustomerId, CUSTOMER_COOKIE } from "@/lib/customer";

export type ActionState = { ok: boolean; message: string };

type Campaign = {
  id: string;
  business_id: string;
  approval_mode: "auto" | "manual";
  status: string;
  stamp_validity_days: number | null;
  stamps_required: number;
  reward_text: string;
  biz: {
    allow_remote_scan: boolean | null;
    lat: number | null;
    lng: number | null;
    geofence_radius: number | null;
    scratch_enabled: boolean | null;
    scratch_chance: number | null;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Distance in metres between two lat/lng points (haversine). */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Returns an error message if the customer is outside the store's geofence. */
function geofenceError(campaign: Campaign, formData: FormData): string | null {
  const { allow_remote_scan, lat, lng, geofence_radius } = campaign.biz;
  if (allow_remote_scan) return null; // remote scanning allowed
  if (lat == null || lng == null) return null; // no store point set — can't enforce
  const clat = parseFloat(String(formData.get("lat") || ""));
  const clng = parseFloat(String(formData.get("lng") || ""));
  if (!Number.isFinite(clat) || !Number.isFinite(clng)) {
    return "Turn on location to collect your stamp at the store.";
  }
  const dist = distanceM(lat, lng, clat, clng);
  if (dist > (geofence_radius ?? 200)) {
    return "You're too far from the store to collect a stamp.";
  }
  return null;
}

async function issueStamp(
  admin: ReturnType<typeof createAdminClient>,
  campaign: Campaign,
  membershipId: string
) {
  const approved = campaign.approval_mode === "auto";
  const expires_at = campaign.stamp_validity_days
    ? new Date(Date.now() + campaign.stamp_validity_days * DAY_MS).toISOString()
    : null;

  await admin.from("stamps").insert({
    business_id: campaign.business_id,
    membership_id: membershipId,
    approved,
    expires_at,
  });

  const patch: Record<string, unknown> = { last_stamp_at: new Date().toISOString() };
  if (approved) {
    const { data: mem } = await admin
      .from("memberships")
      .select("stamp_count")
      .eq("id", membershipId)
      .single();
    patch.stamp_count = (mem?.stamp_count ?? 0) + 1;
  }
  await admin.from("memberships").update(patch).eq("id", membershipId);
}

async function getActiveCampaign(admin: ReturnType<typeof createAdminClient>, slug: string) {
  const { data } = await admin
    .from("campaigns")
    .select("id,business_id,approval_mode,status,stamp_validity_days,stamps_required,reward_text,businesses(compulsory_approval,allow_remote_scan,lat,lng,geofence_radius,scratch_enabled,scratch_chance)")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;

  // Every public action — join, stamp, redeem — comes through here, so this one
  // check closes all three at once. It has to live in the action and not only
  // in the page: the page render is a suggestion, a POST is what actually
  // writes, and anyone can replay a form submission against a paused card.
  if (await isBusinessLocked(admin, data.business_id as string)) return null;
  const b = (row<{ businesses?: Record<string, unknown> | null }>(data)?.businesses ?? {}) as {
    compulsory_approval?: boolean;
    allow_remote_scan?: boolean;
    lat?: number | null;
    lng?: number | null;
    geofence_radius?: number | null;
    scratch_enabled?: boolean;
    scratch_chance?: number | null;
  };
  return {
    ...data,
    approval_mode: b.compulsory_approval ? "manual" : data.approval_mode,
    biz: {
      allow_remote_scan: b.allow_remote_scan ?? false,
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      geofence_radius: b.geofence_radius ?? 200,
      scratch_enabled: b.scratch_enabled ?? false,
      scratch_chance: b.scratch_chance ?? 20,
    },
  } as Campaign;
}

/** Small chance to award a surprise scratch card after an approved scan. */
async function maybeAwardScratch(
  admin: ReturnType<typeof createAdminClient>,
  campaign: Campaign,
  customerId: string
) {
  if (!campaign.biz.scratch_enabled) return;
  const chance = campaign.biz.scratch_chance ?? 20;
  if (Math.random() * 100 >= chance) return;

  const { data: prizes } = await admin
    .from("scratch_prizes")
    .select("label,weight")
    .eq("business_id", campaign.business_id)
    .eq("active", true);
  if (!prizes || prizes.length === 0) return;

  const total = prizes.reduce((s, p) => s + (p.weight || 1), 0);
  let r = Math.random() * total;
  let picked = prizes[0].label;
  for (const p of prizes) {
    r -= p.weight || 1;
    if (r <= 0) {
      picked = p.label;
      break;
    }
  }

  await admin.from("scratch_wins").insert({
    business_id: campaign.business_id,
    customer_id: customerId,
    prize_label: picked,
  });
}

/** Customer reveals a scratch card they were awarded. */
export async function revealScratch(slug: string, winId: string): Promise<void> {
  const customerId = await getCustomerId();
  if (!customerId) return;
  const admin = createAdminClient();
  await admin
    .from("scratch_wins")
    .update({ revealed: true })
    .eq("id", winId)
    .eq("customer_id", customerId);
  revalidatePath(`/j/${slug}`);
}

export async function joinCampaign(
  slug: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  if (!name || (!phone && !email)) {
    return { ok: false, message: "Please enter your name and a phone number or email." };
  }

  const admin = createAdminClient();
  const campaign = await getActiveCampaign(admin, slug);
  if (!campaign || campaign.status !== "active") {
    return { ok: false, message: "This card is not available." };
  }

  const geoErr = geofenceError(campaign, formData);
  if (geoErr) return { ok: false, message: geoErr };

  let customerId: string | null = null;
  const { data: existing } = phone
    ? await admin.from("customers").select("id").eq("phone", phone).limit(1).maybeSingle()
    : await admin.from("customers").select("id").eq("email", email).limit(1).maybeSingle();

  if (existing) {
    customerId = existing.id;
  } else {
    const { data: created, error } = await admin
      .from("customers")
      .insert({ name, phone: phone || null, email: email || null })
      .select("id")
      .single();
    if (error) return { ok: false, message: "Could not create your account. Try again." };
    customerId = created.id;
  }

  const { data: mem } = await admin
    .from("memberships")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("customer_id", customerId)
    .maybeSingle();

  let membershipId = mem?.id as string | undefined;
  let isNew = false;
  if (!membershipId) {
    const { data: m, error } = await admin
      .from("memberships")
      .insert({ business_id: campaign.business_id, campaign_id: campaign.id, customer_id: customerId })
      .select("id")
      .single();
    if (error) return { ok: false, message: "Could not create your card. Try again." };
    membershipId = m.id;
    isNew = true;
  }

  const store = await cookies();
  store.set(CUSTOMER_COOKIE, customerId!, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (isNew) {
    await issueStamp(admin, campaign, membershipId!);
    if (campaign.approval_mode === "auto") await maybeAwardScratch(admin, campaign, customerId!);
  }

  revalidatePath(`/j/${slug}`);
  return { ok: true, message: isNew ? "You're in! First stamp added. ⭐" : "Welcome back!" };
}

export async function collectStamp(
  slug: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const customerId = await getCustomerId();
  if (!customerId) return { ok: false, message: "Please join first." };

  const admin = createAdminClient();
  const campaign = await getActiveCampaign(admin, slug);
  if (!campaign || campaign.status !== "active") {
    return { ok: false, message: "This card is not available." };
  }

  const geoErr = geofenceError(campaign, formData);
  if (geoErr) return { ok: false, message: geoErr };

  const { data: mem } = await admin
    .from("memberships")
    .select("id,stamp_count,last_stamp_at")
    .eq("campaign_id", campaign.id)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!mem) return { ok: false, message: "Please join first." };

  if (mem.last_stamp_at && Date.now() - new Date(mem.last_stamp_at).getTime() < DAY_MS) {
    return { ok: false, message: "You already collected a stamp today. Come back tomorrow! ⏳" };
  }

  await issueStamp(admin, campaign, mem.id);
  if (campaign.approval_mode === "auto") await maybeAwardScratch(admin, campaign, customerId);
  revalidatePath(`/j/${slug}`);
  return {
    ok: true,
    message:
      campaign.approval_mode === "manual"
        ? "Stamp sent — waiting for staff approval."
        : "Stamp Collected! 🎉",
  };
}

export async function redeemReward(
  slug: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const pin = String(formData.get("pin") || "").trim();
  const customerId = await getCustomerId();
  if (!customerId) return { ok: false, message: "Please join first." };

  const admin = createAdminClient();
  const campaign = await getActiveCampaign(admin, slug);
  if (!campaign) return { ok: false, message: "This card is not available." };

  const { data: biz } = await admin
    .from("businesses")
    .select("redemption_pin_hash")
    .eq("id", campaign.business_id)
    .single();
  if (!biz?.redemption_pin_hash) {
    return { ok: false, message: "This business hasn't set a staff PIN yet." };
  }
  const pinOk = await bcrypt.compare(pin, biz.redemption_pin_hash);
  if (!pinOk) return { ok: false, message: "Incorrect PIN." };

  const { data: mem } = await admin
    .from("memberships")
    .select("id,stamp_count")
    .eq("campaign_id", campaign.id)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!mem || mem.stamp_count < campaign.stamps_required) {
    return { ok: false, message: "Card is not full yet." };
  }

  await admin.from("redemptions").insert({
    business_id: campaign.business_id,
    membership_id: mem.id,
    reward_text: campaign.reward_text,
  });
  await admin
    .from("memberships")
    .update({ stamp_count: mem.stamp_count - campaign.stamps_required })
    .eq("id", mem.id);
  await admin.from("audit_logs").insert({
    business_id: campaign.business_id,
    action: "redeem",
    meta: { membership_id: mem.id, reward: campaign.reward_text },
  });

  revalidatePath(`/j/${slug}`);
  return { ok: true, message: "🎉 Reward redeemed! Enjoy." };
}
