import { entitlementAccess, type Access } from "./access";
import type { EntitlementCache } from "./cache";
import {
  parseEntitlementResponse,
  type CachedEntitlement,
} from "./entitlement";
import {
  VerifierError,
  type EntitlementVerifier,
  type PurchaseOutcome,
  type PurchaseProvider,
  type RestoreOutcome,
  type VerifierProblem,
} from "./provider";

// Membership flows (Phase 9.1): the trust chain in one place. The store is
// asked to purchase or restore; then Forge's server is asked what that
// means. Only the server's checked answer about the account that asked
// reaches this phone's cache and the access decision; the store's own answer
// never does. Not wired to the app yet: the paywall and the gate come in
// Phases 9.3 and 9.4.

export type BillingDeps = {
  provider: PurchaseProvider;
  verifier: EntitlementVerifier;
  cache: EntitlementCache;
  /** The membership's App Store product ID (founder decision F16). */
  productId: string;
  now?: () => number;
};

/** The decision after asking the server, and why it gave no answer if so. */
export type Verification = { access: Access; problem?: VerifierProblem };
export type PurchaseResult = Verification & { outcome: PurchaseOutcome };
export type RestoreResult = Verification & { outcome: RestoreOutcome };

const clock = (deps: BillingDeps) => (deps.now ?? Date.now)();

function problemOf(e: unknown): VerifierProblem {
  if (e instanceof VerifierError) return e.problem;
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") return "offline";
  if (
    e instanceof TypeError &&
    /network|fetch|internet|offline|timed? ?out/i.test(e.message)
  )
    return "offline";
  return "unavailable";
}

/** The decision from what this phone already holds: at launch, or offline. */
export async function currentAccess(
  deps: BillingDeps,
  userId: string,
): Promise<Access> {
  const now = clock(deps);
  const held = await deps.cache.read(userId);
  const access = entitlementAccess(userId, held, now);
  if (held) await deps.cache.noteClock(userId, now).catch(() => undefined);
  return access;
}

/**
 * Asks the server (by default to read the store afresh) and keeps its answer
 * when it passes its checks and is about this account. Without a usable
 * answer, the decision is what this phone already holds.
 */
export async function verify(
  deps: BillingDeps,
  userId: string,
  how: "refresh" | "read" = "refresh",
): Promise<Verification> {
  let raw: unknown;
  try {
    raw =
      how === "refresh"
        ? await deps.verifier.refresh()
        : await deps.verifier.read();
  } catch (e) {
    return { access: await currentAccess(deps, userId), problem: problemOf(e) };
  }
  const parsed = parseEntitlementResponse(raw);
  if (!parsed.ok)
    return { access: await currentAccess(deps, userId), problem: "invalid" };
  // About another account (the session changed meanwhile): never kept here.
  if (parsed.value.userId !== userId)
    return { access: await currentAccess(deps, userId), problem: "account" };
  const receivedAt = clock(deps);
  let held: CachedEntitlement;
  try {
    held = await deps.cache.save(parsed.value, receivedAt);
  } catch {
    // Verified all the same; only not kept for offline use.
    held = { ...parsed.value, receivedAt, checkedAt: receivedAt };
  }
  return { access: entitlementAccess(userId, held, clock(deps)) };
}

/**
 * Buys the membership for the signed-in account: the store's purchase sheet,
 * then the server's verification. A purchase the store calls complete grants
 * nothing by itself (Expo Go's mocked SDK reports one); a pending one waits
 * for the store's next change (onStoreChange, then `verify`).
 */
export async function purchaseMembership(
  deps: BillingDeps,
  userId: string,
): Promise<PurchaseResult> {
  try {
    // The store must know whose purchase this is before it happens.
    await deps.provider.identify(userId);
  } catch {
    return {
      outcome: { kind: "failed", problem: "unavailable" },
      access: await currentAccess(deps, userId),
    };
  }
  let outcome: PurchaseOutcome;
  try {
    outcome = await deps.provider.purchase(deps.productId);
  } catch {
    outcome = { kind: "failed", problem: "unknown" };
  }
  if (outcome.kind !== "completed")
    return { outcome, access: await currentAccess(deps, userId) };
  return { outcome, ...(await verify(deps, userId)) };
}

/** The athlete's Restore Purchases: the store, then the server. */
export async function restoreMembership(
  deps: BillingDeps,
  userId: string,
): Promise<RestoreResult> {
  try {
    await deps.provider.identify(userId);
  } catch {
    return {
      outcome: { kind: "failed", problem: "unavailable" },
      access: await currentAccess(deps, userId),
    };
  }
  let outcome: RestoreOutcome;
  try {
    outcome = await deps.provider.restore();
  } catch {
    outcome = { kind: "failed", problem: "unknown" };
  }
  if (outcome.kind !== "completed")
    return { outcome, access: await currentAccess(deps, userId) };
  return { outcome, ...(await verify(deps, userId)) };
}

/** Sign-in: the store learns the account, then the server is asked. */
export async function signedIn(
  deps: BillingDeps,
  userId: string,
): Promise<Verification> {
  await deps.provider.identify(userId).catch(() => undefined);
  return verify(deps, userId);
}

/**
 * Sign-out or account deletion: the store forgets the account and this phone
 * forgets its answer. Training data is never touched.
 */
export async function signedOut(deps: BillingDeps, userId: string) {
  await deps.provider.reset().catch(() => undefined);
  await deps.cache.forget(userId).catch(() => undefined);
}
