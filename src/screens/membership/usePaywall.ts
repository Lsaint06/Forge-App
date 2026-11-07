import { useCallback, useEffect, useRef, useState } from "react";
import { STORE_SETUP_TEXT } from "../../billing/config";
import {
  checkFromPaywall,
  loadPaywall,
  purchaseFromPaywall,
  restoreFromPaywall,
  type PaywallState,
} from "../../billing/paywall";
import type { PurchaseProvider } from "../../billing/provider";
import type { BillingDeps } from "../../billing/service";
import {
  membership,
  membershipDeps,
  watchMembershipSession,
} from "../../billing/runtime";

// The paywall's state for the signed-in account (Phase 9.3). The decisions
// and every sentence are in src/billing/paywall.ts; this only runs them.

const OFF_TEXT = "Forge Premium isn't part of this build yet.";
const NO_ACCOUNT_TEXT = "Sign in to see Forge Premium.";

/** The store, cueing `onVerifying` once Apple's sheet has finished. */
function cueing(deps: BillingDeps, onVerifying: () => void): BillingDeps {
  const provider: PurchaseProvider = {
    ...deps.provider,
    purchase: async (id) => {
      const outcome = await deps.provider.purchase(id);
      if (outcome.kind === "completed") onVerifying();
      return outcome;
    },
    restore: async () => {
      const outcome = await deps.provider.restore();
      if (outcome.kind === "completed") onVerifying();
      return outcome;
    },
  };
  return { ...deps, provider };
}

export function usePaywall(userId: string | undefined) {
  const [state, setState] = useState<PaywallState>({ kind: "loading" });
  // The latest state, for actions and the store's cues. Kept the moment it
  // is set, not after the next render, so a second tap that arrives first
  // already finds the purchase under way and does nothing.
  const latest = useRef(state);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const set = useCallback((next: PaywallState) => {
    if (!alive.current) return;
    latest.current = next;
    setState(next);
  }, []);
  const setup = membership();
  const simulated = setup.mode === "development" && setup.simulated === true;

  useEffect(() => watchMembershipSession(), []);

  const load = useCallback(async () => {
    const now = membership();
    const deps = membershipDeps();
    if (now.mode === "off" || !deps)
      return set({ kind: "unavailable", text: OFF_TEXT, retry: false });
    if (!userId)
      return set({ kind: "unavailable", text: NO_ACCOUNT_TEXT, retry: false });
    if (now.storeProblem)
      return set({
        kind: "unavailable",
        text: STORE_SETUP_TEXT[now.storeProblem],
        retry: false,
      });
    set({ kind: "loading" });
    set(await loadPaywall(deps, userId));
  }, [userId, set]);

  useEffect(() => {
    void load();
  }, [load]);

  const purchase = useCallback(async () => {
    const now = latest.current;
    const deps = membershipDeps();
    if (now.kind !== "ready" || !deps || !userId) return;
    const offer = now.offer;
    set({ kind: "busy", offer, step: "purchasing" });
    const verifying = () => set({ kind: "busy", offer, step: "verifying" });
    set(await purchaseFromPaywall(cueing(deps, verifying), userId, offer));
  }, [userId, set]);

  const restore = useCallback(async () => {
    const now = latest.current;
    const deps = membershipDeps();
    if (!deps || !userId) return;
    if (
      now.kind !== "ready" &&
      now.kind !== "pending" &&
      now.kind !== "unconfirmed"
    )
      return;
    const offer = now.offer;
    set({ kind: "busy", offer, step: "restoring" });
    const verifying = () => set({ kind: "busy", offer, step: "verifying" });
    set(await restoreFromPaywall(cueing(deps, verifying), userId, offer));
  }, [userId, set]);

  const check = useCallback(async () => {
    const now = latest.current;
    const deps = membershipDeps();
    if (!deps || !userId) return;
    if (now.kind !== "pending" && now.kind !== "unconfirmed") return;
    const { offer, kind } = now;
    const from = now.kind === "unconfirmed" ? now.from : undefined;
    set({ kind: "busy", offer, step: "verifying" });
    set(await checkFromPaywall(deps, userId, offer, kind, from));
  }, [userId, set]);

  // While waiting for an approval or the server, the store's next change
  // (an approval, a renewal) is a cue to ask the server again.
  const waiting = state.kind === "pending" || state.kind === "unconfirmed";
  useEffect(() => {
    if (!waiting) return;
    return membershipDeps()?.provider.onStoreChange(() => void check());
  }, [waiting, check]);

  return { state, simulated, load, purchase, restore, check };
}
