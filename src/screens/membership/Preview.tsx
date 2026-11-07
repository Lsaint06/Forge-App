import React, { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ForgeEmpty, ForgeSubScreen } from "../../components/reforge";
import { legalLinks } from "../../billing/runtime";
import { membershipOffer } from "../../billing/offer";
import {
  NO_OFFERING_TEXT,
  STORE_PROBLEM_TEXT,
  UNCONFIRMED_TEXT,
  restoreText,
  type PaywallState,
} from "../../billing/paywall";
import type { StoreProduct } from "../../billing/plan";
import { premiumPath, type PremiumPath } from "../../domain/onboarding/premium";
import { libraryProgram } from "../../programs";
import { goBack } from "../../navigation";
import type { MembershipStep } from "../onboarding/Flow";
import { PreviewBanner } from "../onboarding/parts";
import { PaywallScreen } from "./Paywall";
import type { Arrival } from "./Premium";

// Development only (Phase 9.3): Forge Premium with a stand-in product, to
// review its design and every state without a store, a key or a purchase.
// Nothing is sold, verified or saved, and nothing here can grant access:
// these states never reach the entitlement cache or the access decision.
// - /membership-preview (Preferences → Development), one state at a time
//   with ?state=<name>, and ?path=none for You → Account's version;
// - the onboarding preview with Forge Premium, where the same simulated
//   step follows the reveal (app/onboarding-preview.tsx).

/**
 * A stand-in for the App Store product: the approved $6.99 monthly
 * membership with Apple's free week (plan.ts). The real paywall shows
 * StoreKit's localized price instead.
 */
const PREVIEW_PRODUCT: StoreProduct = {
  id: "preview.membership.monthly",
  title: "Forge Premium",
  priceString: "$6.99",
  price: 6.99,
  currency: "USD",
  period: { unit: "month", count: 1 },
  introOffer: { price: 0, period: { unit: "week", count: 1 }, cycles: 1 },
};

const DAY = 24 * 60 * 60 * 1000;

function offerFor(eligible: boolean) {
  const r = membershipOffer(
    PREVIEW_PRODUCT,
    eligible ? "eligible" : "ineligible",
  );
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.offer;
}

/**
 * The standalone preview's Forge Path: a real published program (Forge
 * Paths' Intermediate Strength, 4 days) for an athlete named Jordan who
 * rests on Sunday, so every value on the pass is Forge's own.
 */
function samplePath(): PremiumPath | undefined {
  const program = libraryProgram("forge-strength-intermediate-4-day", 1);
  return program ? premiumPath(program, "Jordan", 6) : undefined;
}

export const PREVIEW_STATES = [
  "ready",
  "ineligible",
  "loading",
  "unavailable",
  "purchasing",
  "restoring",
  "verifying",
  "pending",
  "unconfirmed",
  "unconfirmed-restore",
  "error",
  "restored-none",
  "member",
  "member-active",
  "restored",
  "held",
] as const;

/** The preview's states, by name. */
export function previewState(name: string | undefined): PaywallState {
  const offer = offerFor(name !== "ineligible");
  const trial = {
    kind: "granted" as const,
    status: "trial" as const,
    until: Date.now() + 7 * DAY,
    renews: true,
  };
  const active = {
    kind: "granted" as const,
    status: "active" as const,
    until: Date.now() + 30 * DAY,
    renews: true,
  };
  switch (name) {
    case "loading":
      return { kind: "loading" };
    case "unavailable":
      return { kind: "unavailable", text: NO_OFFERING_TEXT, retry: true };
    case "purchasing":
    case "restoring":
    case "verifying":
      return { kind: "busy", offer, step: name };
    case "pending":
      return { kind: "pending", offer };
    case "unconfirmed":
      return {
        kind: "unconfirmed",
        offer,
        text: UNCONFIRMED_TEXT.unavailable,
      };
    case "unconfirmed-restore":
      return {
        kind: "unconfirmed",
        offer,
        text: UNCONFIRMED_TEXT.offline,
        from: "restore",
      };
    case "error":
      return {
        kind: "ready",
        offer,
        notice: { tone: "error", text: STORE_PROBLEM_TEXT.offline },
      };
    case "restored-none":
      return {
        kind: "ready",
        offer,
        notice: {
          tone: "info",
          text: restoreText({ kind: "denied", reason: "never" }),
        },
      };
    case "member":
      return { kind: "member", access: trial, via: "purchase" };
    case "member-active":
      return { kind: "member", access: active, via: "purchase" };
    case "restored":
      return { kind: "member", access: active, via: "restore" };
    case "held":
      return { kind: "member", access: active, via: "held" };
    default:
      return { kind: "ready", offer };
  }
}

/**
 * The paywall as it plays, simulated: the purchase opens a pretend sheet,
 * then "verifies" and confirms the free week; a restore finds nothing;
 * "Check again" confirms. Timers only; nothing leaves this screen.
 */
function SimulatedPaywall({
  initial,
  path,
  arrival,
  onBack,
  onDone,
  account,
  banner,
  error,
}: {
  initial: string | undefined;
  path?: PremiumPath;
  arrival: Arrival;
  onBack: () => void;
  onDone: () => void;
  account?: Parameters<MembershipStep>[0]["account"];
  banner?: React.ReactNode;
  error?: string;
}) {
  const [state, setState] = useState<PaywallState>(() => previewState(initial));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, next: PaywallState) => {
    timers.current.push(setTimeout(() => setState(next), ms));
  };
  const offer =
    state.kind === "ready" ||
    state.kind === "busy" ||
    state.kind === "pending" ||
    state.kind === "unconfirmed"
      ? state.offer
      : offerFor(true);
  return (
    <PaywallScreen
      state={state}
      legal={legalLinks()}
      path={path}
      arrival={arrival}
      onBack={onBack}
      account={account}
      banner={banner}
      error={error}
      onPurchase={() => {
        setState({ kind: "busy", offer, step: "purchasing" });
        later(1100, { kind: "busy", offer, step: "verifying" });
        later(2200, previewState("member"));
      }}
      onRestore={() => {
        setState({ kind: "busy", offer, step: "restoring" });
        later(1000, previewState("restored-none"));
      }}
      onCheck={() => {
        setState({ kind: "busy", offer, step: "verifying" });
        later(1000, previewState("member-active"));
      }}
      onRetry={() => {
        setState({ kind: "loading" });
        later(800, previewState("ready"));
      }}
      onEnter={onDone}
      onDecline={onDone}
    />
  );
}

/**
 * The onboarding preview's step after the reveal (development only): the
 * same Forge Premium, continuing from the athlete's revealed Forge Path,
 * with simulated states. Its way on finishes the preview.
 */
export function previewMembershipStep(
  props: Parameters<MembershipStep>[0],
): React.ReactNode {
  return <SimulatedPaywall initial="ready" {...props} />;
}

export default function MembershipPreview() {
  const { state: named, path } = useLocalSearchParams<{
    state?: string;
    path?: string;
  }>();
  // A link to another state starts that state over.
  return (
    <Preview key={`${named ?? ""}:${path ?? ""}`} named={named} path={path} />
  );
}

function Preview({ named, path }: { named?: string; path?: string }) {
  const exit = () => goBack("/preferences");
  if (!__DEV__)
    return (
      <ForgeSubScreen title="Unavailable" onBack={() => router.back()}>
        <ForgeEmpty
          title="Not in this build"
          detail="The Forge Premium preview is for development builds only."
        />
      </ForgeSubScreen>
    );
  return (
    <SimulatedPaywall
      initial={named}
      path={path === "none" ? undefined : samplePath()}
      arrival="settle"
      onBack={exit}
      onDone={exit}
      banner={<PreviewBanner onExit={exit} />}
    />
  );
}
