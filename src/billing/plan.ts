// Forge membership (Phase 9.1): the one plan the founder approved. A single
// auto-renewable monthly subscription unlocks everything: no annual plan, no
// tiers, no free tier. The free week is Apple's introductory offer: StoreKit
// decides who is eligible and starts it in its own purchase sheet, and
// Forge's server then verifies the result (entitlement.ts). Nothing here
// times a trial or grants access.

export type PeriodUnit = "day" | "week" | "month" | "year";
export type SubscriptionPeriod = { unit: PeriodUnit; count: number };

export const MEMBERSHIP_PLAN = {
  /** $6.99 in the US storefront; other storefronts use Apple's equivalents. */
  usdCents: 699,
  billingPeriod: { unit: "month", count: 1 },
  /** Free for the first seven days, for subscribers Apple finds eligible. */
  freeTrialDays: 7,
} as const;

/**
 * The membership product as the store presents it, for the paywall's
 * disclosures only. The paywall shows `priceString`, StoreKit's localized
 * price, never a price written in Forge's code.
 */
export type StoreProduct = {
  id: string;
  /** The subscription's name as the App Store shows it (Phase 9.3). */
  title?: string;
  priceString: string;
  /** In `currency` units (6.99). */
  price: number;
  /** ISO 4217 ("USD"). */
  currency: string;
  period: SubscriptionPeriod;
  /**
   * The introductory offer configured in App Store Connect, if any. Whether
   * this athlete may use it is StoreKit's answer (`IntroEligibility`).
   */
  introOffer?: { price: number; period: SubscriptionPeriod; cycles: number };
};

const days = (p: SubscriptionPeriod) =>
  p.unit === "day" ? p.count : p.unit === "week" ? p.count * 7 : undefined;

/**
 * What keeps a store product from being the approved membership; empty when
 * it is. A paywall built on anything else (an annual plan, another trial
 * length, a paid introductory price) would disclose terms nobody approved.
 */
export function membershipProductProblems(p: StoreProduct): string[] {
  const problems: string[] = [];
  const { billingPeriod, usdCents, freeTrialDays } = MEMBERSHIP_PLAN;
  if (p.period.unit !== billingPeriod.unit || p.period.count !== 1)
    problems.push("The membership renews every month");
  if (!(p.price > 0)) problems.push("The membership is paid");
  else if (p.currency === "USD" && Math.round(p.price * 100) !== usdCents)
    problems.push("The membership is $6.99 a month in the US");
  if (!p.priceString.trim()) problems.push("The store gave no local price");
  const offer = p.introOffer;
  if (!offer) problems.push("The membership starts with a free week");
  else {
    if (offer.price !== 0) problems.push("The introductory offer is free");
    if (offer.cycles !== 1 || days(offer.period) !== freeTrialDays)
      problems.push("The free trial lasts seven days");
  }
  return problems;
}
