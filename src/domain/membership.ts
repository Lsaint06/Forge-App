// Forge membership (foundation only). There are no payments, subscriptions or
// stored entitlements yet: every lifter has the full free app. The You tab
// reads this so a future Premium tier has one place to plug in.

export type MembershipTier = "free" | "premium";

export type Membership = {
  tier: MembershipTier;
  /** Whether Premium can be purchased in this build. */
  premiumAvailable: boolean;
};

export function membership(): Membership {
  return { tier: "free", premiumAvailable: false };
}
