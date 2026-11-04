import { inForce, type CachedEntitlement, type InForce } from "./entitlement";

// Who may use Forge (Phase 9.1): one pure decision, the same for every
// screen, from the server-verified entitlement this phone holds for the
// signed-in account. Phase 9.4 feeds it to entryState() (src/auth/entry.ts);
// nothing calls it yet.
//
// - Access lasts exactly as long as the verified membership: to
//   `accessUntil`, the end of the free week or paid month, or of Apple's
//   billing grace period when Apple grants one. Cancelling never ends it
//   early.
// - Not a moment longer: no offline or outage window and no extra time to
//   finish a workout (founder decisions F4 and F5 are open; until they are
//   made there is none). A workout in progress stays saved on the phone and
//   resumes after renewing.
// - The time is the server's: this phone's clock only measures the time
//   elapsed since the server's answer, and a clock set back is caught.
// - The Forge Path preview belongs to the first onboarding only: allowed
//   only while the server says this account never had a trial or
//   subscription.
// - Nothing here reads or writes training data: a lapse changes which
//   screens open, never what is stored.

/** How far this phone's clock may step back (network time corrections). */
export const CLOCK_TOLERANCE_MS = 5 * 60_000;

export type Access =
  /** The membership is in force: everything opens until `until`. */
  | { kind: "granted"; status: InForce; until: number; renews: boolean }
  /**
   * No membership. `never`: no trial or subscription yet (onboarding, the
   * Forge Path preview, the paywall). Otherwise it ended: no preview again.
   */
  | {
      kind: "denied";
      reason: "never" | "expired" | "billingIssue" | "revoked";
    }
  /**
   * Only the server can say (no access meanwhile): nothing verified for this
   * account on this phone (`missing`), this phone's clock was set back
   * (`clock`), or the verified period ended while a renewal was due
   * (`renewal`).
   */
  | { kind: "unverified"; reason: "missing" | "clock" | "renewal" };

/**
 * The server's time now, as far as this phone can vouch for it: the server's
 * clock at its answer, plus the time this phone's clock has run since. Never
 * earlier than at a previous check; undefined when this phone's clock has
 * been set back since, so nothing it says can be trusted until the server
 * answers again.
 */
export function trustedNow(
  held: CachedEntitlement,
  now: number,
): number | undefined {
  const latest = Math.max(held.receivedAt, held.checkedAt);
  if (now < latest - CLOCK_TOLERANCE_MS) return undefined;
  return held.serverNow + (Math.max(now, latest) - held.receivedAt);
}

/** The decision for `userId`, from what this phone holds, at `now`. */
export function entitlementAccess(
  userId: string,
  held: CachedEntitlement | undefined,
  now: number,
): Access {
  // Only this account's own verified answer counts.
  if (!held || held.userId !== userId)
    return { kind: "unverified", reason: "missing" };
  const e = held.entitlement;
  if (inForce(e.status) && e.accessUntil !== undefined) {
    const at = trustedNow(held, now);
    if (at === undefined) return { kind: "unverified", reason: "clock" };
    if (at < e.accessUntil)
      return {
        kind: "granted",
        status: e.status,
        until: e.accessUntil,
        renews: e.willRenew,
      };
    // The period has ended since the server's answer. A renewal was due, so
    // only the server can say whether it happened.
    if (e.willRenew) return { kind: "unverified", reason: "renewal" };
    return {
      kind: "denied",
      reason: e.status === "grace" ? "billingIssue" : "expired",
    };
  }
  if (e.firstEntitledAt === undefined)
    return { kind: "denied", reason: "never" };
  if (e.status === "revoked") return { kind: "denied", reason: "revoked" };
  if (e.status === "billing_retry")
    return { kind: "denied", reason: "billingIssue" };
  // Expired, or a membership that moved to another account ("none").
  return { kind: "denied", reason: "expired" };
}

export const hasAccess = (
  a: Access,
): a is Extract<Access, { kind: "granted" }> => a.kind === "granted";

/** The one-time Forge Path preview: before this account's first membership. */
export const previewAllowed = (a: Access) =>
  a.kind === "denied" && a.reason === "never";
