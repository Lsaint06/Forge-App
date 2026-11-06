import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "../data/repository";
import { linkToAccount } from "../data/ownership";

// Linking this phone's training to an account (Phase 7.7B follow-up). The
// first synchronization after linking uploads every queued local record and
// downloads every cloud record: nothing de-duplicates or separates two
// histories. So unowned local training is linked only to an account that
// holds no cloud records yet. Anything else is refused before any change.

async function sameAccount(client: SupabaseClient, userId: string) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId)
    throw new Error("The signed-in account changed. Sign in again.");
}

/**
 * Whether the signed-in account holds any Forge cloud record, deleted ones
 * included. Read-only: at most one identifier, never a payload. Row-level
 * security limits the query to the account's own records.
 */
export async function accountHasCloudRecords(
  client: SupabaseClient,
  userId: string,
) {
  await sameAccount(client, userId);
  const { data, error } = await client
    .from("forge_records")
    .select("id")
    .limit(1);
  if (error) throw error;
  await sameAccount(client, userId);
  return Array.isArray(data) && data.length > 0;
}

export type LinkResult = "linked" | "accountHasRecords";

/**
 * Links this phone's training to the signed-in account only when that
 * account has no cloud records. Fails closed: if the account can't be
 * checked, nothing is linked.
 */
export async function linkChecked(
  r: Repository,
  client: SupabaseClient,
  userId: string,
): Promise<LinkResult> {
  const generation = r.generation;
  if (await accountHasCloudRecords(client, userId)) return "accountHasRecords";
  if (r.generation !== generation)
    throw new Error("This phone's data changed during the check.");
  linkToAccount(r, userId);
  return "linked";
}
