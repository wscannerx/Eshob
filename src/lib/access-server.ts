import { createAdminClient } from "./supabase/admin";
import { accessFor, ACCESS_COLUMNS, type SubLike } from "./access";

/**
 * Is this business locked out? Answered straight from the database.
 *
 * Lives apart from access.ts so that file stays a pure rule with no imports —
 * it can be read and tested on its own, and a Client Component that one day
 * wants the rule can import it without dragging the service-role client (and
 * the secret key it reads) into the browser bundle.
 *
 * Used by the public scan page and its actions, which know a business id but
 * have no session. Takes the caller's admin client rather than opening another
 * one per scan.
 */
export async function isBusinessLocked(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string
): Promise<boolean> {
  const { data } = await admin
    .from("subscriptions")
    .select(ACCESS_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();
  return accessFor(data as SubLike | null).state === "locked";
}
