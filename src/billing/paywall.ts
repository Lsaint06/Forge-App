import type { Access } from "./access";
import { membershipOffer, type MembershipOffer } from "./offer";
import type { StoreProblem, VerifierProblem } from "./provider";
import {
  currentAccess,
  purchaseMembership,
  restoreMembership,
  verify,
  type BillingDeps,
  type PurchaseResult,
  type RestoreResult,
  type Verification,
} from "./service";

// The paywall's states and what it says in each (Phase 9.3). Pure: the
// screen (src/screens/membership) only renders them, and tests check every
// transition and sentence.
//
// - Forge Premium opens only when Forge's server says so (`member`): a store
//   that reports success, a Test Store purchase or a pending approval never
//   unlocks anything by itself.
// - Closing Apple's sheet is not an error: the offer stays as it was.
// - When the server can't confirm a purchase yet, the athlete is told so and
//   can check again; nothing is granted meanwhile.

export type Notice = { tone: "error" | "info"; text: string };

export type Granted = Extract<Access, { kind: "granted" }>;

/** How the membership reached the screen: what the confirmation says. */
export type MemberVia = "purchase" | "restore" | "held";

export type PaywallState =
  | { kind: "loading" }
  /** No membership to show here: why, and whether trying again can help. */
  | { kind: "unavailable"; text: string; retry: boolean }
  | { kind: "ready"; offer: MembershipOffer; notice?: Notice }
  | {
      kind: "busy";
      offer: MembershipOffer;
      step: "purchasing" | "restoring" | "verifying";
    }
  /** Ask to Buy, or the bank: waiting for approval. */
  | { kind: "pending"; offer: MembershipOffer }
  /**
   * The store finished (a purchase, or a restore: `from`), but Forge's
   * server hasn't confirmed it yet.
   */
  | {
      kind: "unconfirmed";
      offer: MembershipOffer;
      text: string;
      from?: "restore";
    }
  | { kind: "member"; access: Granted; via: MemberVia };

export const STORE_PROBLEM_TEXT: Record<StoreProblem, string> = {
  offline: "You're offline. Connect to the internet and try again.",
  unavailable:
    "The App Store couldn't complete this right now. Try again in a moment.",
  notAllowed:
    "Purchases aren't allowed on this iPhone. Check Screen Time's App Store settings.",
  productUnavailable:
    "Forge Premium isn't available in your App Store region right now.",
  otherAccount:
    "This Apple Account's membership belongs to another Forge account. Sign in to that account to use it.",
  unknown: "The purchase didn't go through. Try again.",
};

/**
 * Why Forge couldn't confirm a membership, under a title that already says
 * so: the paywall's "Not confirmed yet" and You → Account's card.
 */
export const UNCONFIRMED_TEXT: Record<VerifierProblem, string> = {
  offline: "You're offline. Connect to the internet, then check again.",
  unavailable: "Forge's server isn't available right now. Check again soon.",
  invalid: "Forge couldn't read its server's answer. Check again soon.",
  auth: "Your sign-in has to be renewed. Sign out, then sign in again.",
  account: "Your account changed while Forge was checking. Check again.",
};

export const PENDING_TEXT =
  "Apple is waiting for this purchase to be approved, for example by a family organizer. You're charged only once it's approved, and Forge Premium opens then.";

export const SIMULATED_TEXT =
  "RevenueCat's Test Store simulated that purchase. Nothing was sold, so Forge Premium stays locked.";

export const NOT_YET_TEXT =
  "Apple finished the purchase, but Forge hasn't received it yet. Check again in a moment.";

/** What a completed restore found, when it found no membership in force. */
export function restoreText(access: Access): string {
  if (access.kind === "denied")
    return {
      never: "No Forge Premium membership was found for this Apple Account.",
      expired:
        "Your Forge Premium membership has ended. Subscribe to start it again.",
      revoked: "That membership was refunded, so it no longer unlocks Forge.",
      billingIssue:
        "Apple couldn't renew your membership. Update your payment method in your Apple Account.",
    }[access.reason];
  if (access.kind === "unverified" && access.reason === "missing")
    return "No Forge Premium membership was found for this Apple Account.";
  return "Forge couldn't confirm your membership yet. Check again in a moment.";
}

const error = (text: string): Notice => ({ tone: "error", text });

/** After Apple's purchase sheet and the server's answer. */
export function afterPurchase(
  offer: MembershipOffer,
  { outcome, access, problem }: PurchaseResult,
  simulated: boolean,
): PaywallState {
  if (outcome.kind === "cancelled") return { kind: "ready", offer };
  if (outcome.kind === "pending") return { kind: "pending", offer };
  if (outcome.kind === "failed")
    return {
      kind: "ready",
      offer,
      notice: error(STORE_PROBLEM_TEXT[outcome.problem]),
    };
  if (access.kind === "granted")
    return { kind: "member", access, via: "purchase" };
  if (simulated)
    return {
      kind: "ready",
      offer,
      notice: { tone: "info", text: SIMULATED_TEXT },
    };
  return {
    kind: "unconfirmed",
    offer,
    text: problem ? UNCONFIRMED_TEXT[problem] : NOT_YET_TEXT,
  };
}

/**
 * After Restore Purchases and the server's answer. Each outcome reads
 * differently: restored (a member), nothing found (a note), found but not
 * confirmed yet (the server didn't answer: check again), or the store's own
 * failure (an error).
 */
export function afterRestore(
  offer: MembershipOffer,
  { outcome, access, problem }: RestoreResult,
): PaywallState {
  if (outcome.kind === "failed")
    return {
      kind: "ready",
      offer,
      notice: error(STORE_PROBLEM_TEXT[outcome.problem]),
    };
  if (access.kind === "granted")
    return { kind: "member", access, via: "restore" };
  if (problem)
    return {
      kind: "unconfirmed",
      offer,
      text: UNCONFIRMED_TEXT[problem],
      from: "restore",
    };
  return {
    kind: "ready",
    offer,
    notice: { tone: "info", text: restoreText(access) },
  };
}

/** "Check again", while waiting for an approval or the server. */
export function afterCheck(
  offer: MembershipOffer,
  { access, problem }: Verification,
  waiting: "pending" | "unconfirmed",
  from?: "restore",
): PaywallState {
  if (access.kind === "granted")
    return { kind: "member", access, via: from ?? "purchase" };
  if (problem)
    return {
      kind: "unconfirmed",
      offer,
      text: UNCONFIRMED_TEXT[problem],
      ...(from ? { from } : {}),
    };
  return waiting === "pending"
    ? { kind: "pending", offer }
    : {
        kind: "unconfirmed",
        offer,
        text: NOT_YET_TEXT,
        ...(from ? { from } : {}),
      };
}

/**
 * What the member sees once the server confirms: the dates are the screen's.
 * A purchase is welcomed by its status; a restore and a membership already
 * held say so instead.
 */
export function memberLines(access: Granted, until: string, via?: MemberVia) {
  const title =
    via === "restore"
      ? "Your membership is restored"
      : via === "held"
        ? "You're a Forge Premium member"
        : undefined;
  if (access.status === "trial")
    return {
      title: title ?? "Your free week has started",
      detail: access.renews
        ? `Your free week ends on ${until}. Your first monthly payment is then, unless you cancel before.`
        : `Forge Premium is yours until ${until}. It won't renew.`,
    };
  if (access.status === "grace")
    return {
      title: "Update your payment",
      detail: `Apple couldn't renew your membership. Forge Premium stays open until ${until} while you update your payment method.`,
    };
  return {
    title: title ?? "Welcome to Forge Premium",
    detail: access.renews
      ? `Your membership renews on ${until}.`
      : `Your membership ends on ${until}. It won't renew.`,
  };
}

export const NO_OFFERING_TEXT =
  "The App Store has no Forge Premium membership to show yet.";
export const NOT_APPROVED_TEXT =
  "The store's product isn't the approved membership, so it isn't shown:";
export const LOAD_FAILED_TEXT =
  "Forge Premium couldn't be loaded. Check your connection and try again.";

/**
 * Opens the paywall for the signed-in account. A membership is never offered
 * to a member: one this phone already holds verified opens Forge at once,
 * and when this phone holds nothing verified for the account (a new phone),
 * Forge's server is asked first. Otherwise the store's own offer, checked
 * against the approved plan. A server that can't answer doesn't block the
 * offer: Restore Purchases is always there.
 */
export async function loadPaywall(
  deps: BillingDeps,
  userId: string,
): Promise<PaywallState> {
  const held = await currentAccess(deps, userId);
  if (held.kind === "granted")
    return { kind: "member", access: held, via: "held" };
  if (held.kind === "unverified") {
    const server = await verify(deps, userId, "read");
    if (server.access.kind === "granted")
      return { kind: "member", access: server.access, via: "held" };
  }
  try {
    // The store learns whose purchase this would be before showing it.
    await deps.provider.identify(userId);
    const product = deps.provider.membership
      ? await deps.provider.membership()
      : undefined;
    if (!product)
      return { kind: "unavailable", text: NO_OFFERING_TEXT, retry: true };
    const eligibility = await deps.provider.introEligibility(product.id);
    const offer = membershipOffer(product, eligibility);
    if (!offer.ok)
      return {
        kind: "unavailable",
        text: `${NOT_APPROVED_TEXT} ${offer.problems.join("; ")}.`,
        retry: false,
      };
    return { kind: "ready", offer: offer.offer };
  } catch {
    return { kind: "unavailable", text: LOAD_FAILED_TEXT, retry: true };
  }
}

export async function purchaseFromPaywall(
  deps: BillingDeps,
  userId: string,
  offer: MembershipOffer,
): Promise<PaywallState> {
  const result = await purchaseMembership(
    { ...deps, productId: offer.productId },
    userId,
  );
  return afterPurchase(offer, result, deps.provider.simulated === true);
}

export async function restoreFromPaywall(
  deps: BillingDeps,
  userId: string,
  offer: MembershipOffer,
): Promise<PaywallState> {
  return afterRestore(offer, await restoreMembership(deps, userId));
}

export async function checkFromPaywall(
  deps: BillingDeps,
  userId: string,
  offer: MembershipOffer,
  waiting: "pending" | "unconfirmed",
  from?: "restore",
): Promise<PaywallState> {
  return afterCheck(offer, await verify(deps, userId), waiting, from);
}

/** The account's membership now, for You → Account (Phase 9.3). */
export async function membershipStatus(
  deps: BillingDeps,
  userId: string,
  how: "held" | "server",
): Promise<Verification> {
  if (how === "held") return { access: await currentAccess(deps, userId) };
  return verify(deps, userId, "read");
}

export type StatusLines = {
  /** The short state beside the card's name. */
  chip: string;
  title: string;
  detail: string;
  /** Apple's subscription management applies (a membership exists there). */
  manage: boolean;
};

/** You → Account's membership card, from the server-verified decision. */
export function statusLines(
  verification: Verification | undefined,
  formatDate: (ms: number) => string,
): StatusLines {
  if (!verification)
    return {
      chip: "Checking",
      title: "Checking your membership",
      detail: "Forge is reading your membership.",
      manage: false,
    };
  const { access, problem } = verification;
  if (access.kind === "granted") {
    const until = formatDate(access.until);
    if (access.status === "grace")
      return {
        chip: "Payment issue",
        title: "Update your payment",
        detail: `Apple couldn't renew your membership. Forge Premium stays open until ${until}.`,
        manage: true,
      };
    if (access.status === "trial")
      return {
        chip: "Free trial",
        title: access.renews ? `Free week until ${until}` : `Ends ${until}`,
        detail: access.renews
          ? `Your first monthly payment is on ${until} unless you cancel before.`
          : "Your free week won't become a membership. Forge Premium stays open until then.",
        manage: true,
      };
    return {
      chip: "Member",
      title: access.renews ? `Renews ${until}` : `Ends ${until}`,
      detail: access.renews
        ? "Forge Premium renews every month until you cancel."
        : "Your membership won't renew. Forge Premium stays open until then.",
      manage: true,
    };
  }
  if (access.kind === "denied")
    return {
      never: {
        chip: "Not a member",
        title: "Forge Premium",
        detail: "One membership opens everything Forge does.",
        manage: false,
      },
      expired: {
        chip: "Ended",
        title: "Your membership has ended",
        detail: "Your training is kept. Subscribe to open Forge Premium again.",
        manage: false,
      },
      billingIssue: {
        chip: "Payment issue",
        title: "We couldn't renew your membership",
        detail:
          "Apple couldn't charge your payment method. Update it in your Apple Account.",
        manage: true,
      },
      revoked: {
        chip: "Refunded",
        title: "Your membership was refunded",
        detail: "Subscribe to open Forge Premium again.",
        manage: false,
      },
    }[access.reason];
  return {
    chip: "Not confirmed",
    title: "Forge couldn't confirm your membership",
    detail: problem
      ? UNCONFIRMED_TEXT[problem]
      : STATUS_REASON_TEXT[access.reason],
    manage: false,
  };
}

const STATUS_REASON_TEXT: Record<
  Extract<Access, { kind: "unverified" }>["reason"],
  string
> = {
  missing: "Forge hasn't checked your membership on this phone yet.",
  clock: "This phone's clock changed, so Forge has to ask its server again.",
  renewal: "Your membership was due to renew. Apple hasn't confirmed it yet.",
};
