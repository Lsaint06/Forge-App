import type { StoreProduct } from "./plan";

// The two outside parties of membership (Phase 9.1): interfaces only, no SDK
// and no network code yet.
//
// PurchaseProvider is the store. In Forge's own builds RevenueCat's SDK
// implements it (Phase 9.3); Expo Go can't purchase at all (the SDK only
// mocks there). What it returns is the store's report: prices and trial
// eligibility to show, and a purchase sheet's outcome as a cue to ask
// Forge's server. None of it carries or grants access.
//
// EntitlementVerifier is Forge's server, called with the signed-in account's
// own session. Its answers are the only source of access, and only once
// entitlement.ts has checked them (service.ts).

export type IntroEligibility = "eligible" | "ineligible" | "unknown";

export type StoreProblem =
  "offline" | "unavailable" | "notAllowed" | "productUnavailable" | "unknown";

export type PurchaseOutcome =
  /** The store finished a transaction: Forge's server decides what it means. */
  | { kind: "completed" }
  /** Waiting for approval (Ask to Buy) or the bank: nothing changes yet. */
  | { kind: "pending" }
  /** The athlete closed the purchase sheet. */
  | { kind: "cancelled" }
  | { kind: "failed"; problem: StoreProblem };

export type RestoreOutcome =
  { kind: "completed" } | { kind: "failed"; problem: StoreProblem };

export interface PurchaseProvider {
  /** Binds the store's customer to the Forge account (its Supabase ID). */
  identify(userId: string): Promise<void>;
  /** Sign-out: the store forgets the account. */
  reset(): Promise<void>;
  /** The membership as the store sells it (localized), or none. */
  products(ids: readonly string[]): Promise<StoreProduct[]>;
  /** StoreKit's answer: whether this Apple Account may have the free week. */
  introEligibility(productId: string): Promise<IntroEligibility>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  /** The athlete's explicit Restore Purchases. */
  restore(): Promise<RestoreOutcome>;
  /**
   * A renewal, refund, approval or interrupted purchase reached the store:
   * a cue to ask the server, never a fact. Returns the unsubscribe.
   */
  onStoreChange(listener: () => void): () => void;
}

/**
 * Why the server gave no usable answer: no connection (`offline`), the
 * service failing (`unavailable`), the sign-in refused (`auth`), an answer
 * that failed its checks (`invalid`), or an answer about another account
 * (`account`).
 */
export type VerifierProblem =
  "offline" | "unavailable" | "auth" | "invalid" | "account";

/** Thrown by a verifier that knows why it failed. */
export class VerifierError extends Error {
  constructor(
    readonly problem: VerifierProblem,
    message: string,
  ) {
    super(message);
    this.name = "VerifierError";
  }
}

export interface EntitlementVerifier {
  /**
   * The server reads the store's current state for the signed-in account
   * (Edge Function `entitlement-refresh`), keeps it, and answers with it.
   */
  refresh(): Promise<unknown>;
  /** The record the server already keeps (`forge_entitlement()`). */
  read(): Promise<unknown>;
}
