import {
  MEMBERSHIP_PLAN,
  membershipProductProblems,
  type StoreProduct,
} from "./plan";
import type { IntroEligibility } from "./provider";

// What the paywall says about the membership (Phase 9.3), from the store's
// own product and StoreKit's eligibility answer. Pure, so the disclosures
// Apple requires (App Review 3.1.2, the audit's checklist 11.2) are tested
// word for word:
//
// - The billing amount is the most prominent price: StoreKit's localized
//   price, never one written in Forge's code.
// - The free week is mentioned only when StoreKit says this Apple Account may
//   have it. When eligibility is unknown, nothing is promised: the App
//   Store's own sheet then shows the trial if there is one.
// - The renewal, how to cancel, and that cancelling keeps the paid period are
//   stated before the purchase. Exact legal wording is the founder's Terms
//   (decision F15); this is Apple's standard meaning in plain words.
// - A product that isn't the approved membership is refused rather than
//   described (plan.ts).

export type MembershipOffer = {
  productId: string;
  /** The subscription's name as the App Store shows it. */
  title: string;
  /** StoreKit's localized price, the most prominent price on the screen. */
  price: string;
  /** "month" */
  period: string;
  /** The free week, only for an Apple Account StoreKit says may have it. */
  trialDays?: number;
  /** The purchase button. */
  action: string;
  /** The trial line under the price, when there is a trial. */
  trialLine?: string;
  /**
   * The one line under the price where the decision is made: the free week
   * and the full price after it, or when billing begins; and that it can be
   * cancelled.
   */
  renewal: string;
  /** Renewal and cancellation, before anything is bought. */
  terms: string[];
  /** The price block as VoiceOver reads it. */
  spoken: string;
};

export type OfferResult =
  { ok: true; offer: MembershipOffer } | { ok: false; problems: string[] };

const CANCEL =
  "Cancel anytime in Settings › Apple Account › Subscriptions, at least 24 hours before a renewal.";
const KEEPS =
  "Canceling keeps Forge Premium until the end of the period. Your training is always kept.";

export function membershipOffer(
  product: StoreProduct,
  eligibility: IntroEligibility,
): OfferResult {
  const problems = membershipProductProblems(product);
  if (problems.length) return { ok: false, problems };
  const price = product.priceString.trim();
  const period = product.period.unit;
  const title = product.title?.trim() || "Forge Premium";
  const trialDays =
    eligibility === "eligible" ? MEMBERSHIP_PLAN.freeTrialDays : undefined;
  const terms = trialDays
    ? [
        `Free for ${trialDays} days, then ${price} a ${period}. Your Apple Account is charged when the free week ends and every ${period} after, until you cancel.`,
        CANCEL,
        KEEPS,
      ]
    : [
        `${price} a ${period}, charged to your Apple Account when you confirm and every ${period} after, until you cancel.`,
        CANCEL,
        KEEPS,
      ];
  return {
    ok: true,
    offer: {
      productId: product.id,
      title,
      price,
      period,
      ...(trialDays
        ? {
            trialDays,
            trialLine: `${trialDays} days free, then ${price} a ${period}`,
          }
        : {}),
      action: trialDays ? "Start free trial" : "Subscribe",
      renewal: trialDays
        ? `${trialDays} days free, then ${price} a ${period}. Cancel anytime.`
        : `Billed when you confirm, then every ${period} until you cancel.`,
      terms,
      spoken: trialDays
        ? `${title}: ${price} a ${period}, after ${trialDays} days free`
        : `${title}: ${price} a ${period}`,
    },
  };
}
