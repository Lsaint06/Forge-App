import React, { useRef } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import { FText } from "../../components/reforge";
import { forge } from "../../theme";
import type { MembershipOffer } from "../../billing/offer";
import { PENDING_TEXT, type PaywallState } from "../../billing/paywall";
import {
  premiumStory,
  type PremiumPath,
} from "../../domain/onboarding/premium";
import type { SetupAccount } from "../onboarding/account";
import {
  DockCta,
  DockLink,
  DockNote,
  DockStatus,
  IncludedGrid,
  LegalLink,
  LinkRow,
  Measured,
  MemberHero,
  MembershipIntro,
  PathPass,
  PlanCard,
  PremiumFrame,
  PremiumHero,
  PremiumTerms,
  PriceLine,
  TrialTimeline,
  useDecision,
  type Arrival,
} from "./Premium";

// Forge Premium's paywall (Phase 9.3): Premium.tsx's composition with the
// decision in it, for the membership step after the reveal, You → Account's
// /membership and the development previews. It renders
// src/billing/paywall.ts's states; what they say is decided there.
//
// Apple's rules shape the decision (audit 11.1–11.2): the store's price is
// the most prominent price, the free week is mentioned only to an Apple
// Account that may have it, the renewal and how to cancel are stated before
// anything is bought, and Restore Purchases and the legal links are always
// within reach.

const offerOf = (s: PaywallState): MembershipOffer | undefined =>
  s.kind === "ready" ||
  s.kind === "busy" ||
  s.kind === "pending" ||
  s.kind === "unconfirmed"
    ? s.offer
    : undefined;

/** "June 12": the membership's dates, in this phone's language. */
export const membershipDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric" });

/** Test Store purchases are simulated: said before anything is tapped. */
export function SimulatedBanner() {
  const c = useColors();
  return (
    <View
      testID="paywall-simulated"
      accessible
      accessibilityLabel="Test Store. Purchases are simulated: nothing is sold and Forge Premium stays locked."
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.tight,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: forge.radii.tile,
        borderWidth: forge.border.card,
        borderColor: c.emberMuted,
        backgroundColor: c.emberTint,
      }}
    >
      <Ionicons name="flask-outline" size={16} color={c.emberHot} />
      <FText variant="label" weight="600" style={{ flex: 1 }}>
        Test Store · purchases are simulated and never unlock Forge
      </FText>
    </View>
  );
}

/** Terms of Use and the Privacy Policy, when the build has them (F15). */
export type Legal = { terms?: string; privacy?: string };

/**
 * The composition above the decision: the invitation, with the athlete's
 * Forge Path as its pass when there is one (the membership step in setup);
 * what the membership includes; and the plan. Once Forge's server confirms
 * the membership, the confirmation replaces it.
 */
export function PaywallContent({
  state,
  simulated,
  path,
  arrival = "settle",
  formatDate = membershipDate,
}: {
  state: PaywallState;
  simulated?: boolean;
  /** The Forge Path just revealed (the membership step in setup). */
  path?: PremiumPath;
  /** "continue": arriving from the reveal, the transition plays. */
  arrival?: Arrival;
  formatDate?: (ms: number) => string;
}) {
  if (state.kind === "member")
    return (
      <MemberHero
        access={state.access}
        via={state.via}
        formatDate={formatDate}
      />
    );
  const story = premiumStory(path);
  const offer = offerOf(state);
  return (
    <View>
      {simulated && (
        <View style={{ marginBottom: 18 }}>
          <SimulatedBanner />
        </View>
      )}
      <PremiumHero story={story} arrival={arrival} />
      {path && <PathPass path={path} arrival={arrival} />}
      <IncludedGrid nodes={story.nodes} arrival={arrival} />
      <MembershipIntro />
      {state.kind !== "unavailable" && <PlanCard offer={offer} />}
      {offer && <TrialTimeline offer={offer} />}
    </View>
  );
}

const BUSY = {
  purchasing: "Opening the App Store…",
  restoring: "Restoring purchases…",
  verifying: "Confirming your membership…",
} as const;

type Handlers = {
  onPurchase: () => void;
  onRestore: () => void;
  onCheck: () => void;
  onRetry: () => void;
  /** On into Forge without a membership (the membership step in setup). */
  onDecline?: () => void;
};

const DECLINE_HINT = "Opens Forge without a membership";

/**
 * The decision, in the composition under the plan: the one action the state
 * allows, then the way on without a membership, Restore Purchases and the
 * legal links. While Apple or the server answers, nothing can be pressed
 * twice; the states that replace the offer for now (waiting for approval,
 * not confirmed yet, not available) say what happened and what comes next.
 * Its root sits directly in the frame's scroll content, so where its action
 * is there is where the floating copy hands over.
 */
export function PaywallActions({
  state,
  legal,
  onPurchase,
  onRestore,
  onCheck,
  onRetry,
  onEnter,
  enterTitle = "Enter Forge",
  onDecline,
  onManage,
}: Handlers & {
  state: PaywallState;
  legal: Legal;
  /** Once the server confirms (the membership step: Forge opens). */
  onEnter?: () => void;
  enterTitle?: string;
  /** Apple's subscription settings, for a member. */
  onManage?: () => void;
}) {
  const { action } = useDecision();
  const at = useRef({ root: -1, cta: -1 });
  const report = () => {
    const a = at.current;
    if (a.root >= 0 && a.cta >= 0) action(a.root + a.cta);
  };
  const busy = state.kind === "busy";
  const member = state.kind === "member";
  const unavailable = state.kind === "unavailable";
  const restore =
    state.kind === "ready" ||
    busy ||
    state.kind === "pending" ||
    state.kind === "unconfirmed";
  const continueOutline = onDecline && (
    <DockLink
      testID="paywall-decline"
      title="Continue without membership"
      hint={DECLINE_HINT}
      outline
      onPress={onDecline}
    />
  );

  let before: React.ReactNode = null;
  let cta: React.ReactNode = null;
  let after: React.ReactNode = null;
  switch (state.kind) {
    case "loading":
      cta = <DockCta title="Loading the offer…" busy onPress={() => {}} />;
      break;
    case "unavailable":
      before = (
        <DockStatus
          testID="paywall-unavailable"
          icon="storefront-outline"
          title="Forge Premium isn't available here"
          text={state.text}
          quiet
        />
      );
      if (state.retry) {
        cta = <DockCta title="Try again" icon="refresh" onPress={onRetry} />;
        after = continueOutline;
      } else cta = continueOutline;
      break;
    case "ready":
      before = state.notice && (
        <DockNote text={state.notice.text} tone={state.notice.tone} />
      );
      cta = (
        <DockCta
          testID="paywall-purchase"
          title={state.offer.action}
          hint={`${state.offer.spoken}. ${state.offer.renewal}`}
          onPress={onPurchase}
        />
      );
      break;
    case "busy":
      cta = <DockCta title={BUSY[state.step]} busy onPress={() => {}} />;
      break;
    case "pending":
      before = (
        <DockStatus
          testID="paywall-pending"
          icon="hourglass-outline"
          title="Waiting for approval"
          text={PENDING_TEXT}
        />
      );
      cta = <DockCta title="Check again" icon="refresh" onPress={onCheck} />;
      break;
    case "unconfirmed":
      before = (
        <DockStatus
          testID="paywall-unconfirmed"
          icon="cloud-offline-outline"
          title="Not confirmed yet"
          text={state.text}
        />
      );
      cta = <DockCta title="Check again" icon="refresh" onPress={onCheck} />;
      break;
    case "member":
      before = (
        <FText variant="label" tone="secondary" align="center">
          Manage or cancel anytime in Settings › Apple Account › Subscriptions.
        </FText>
      );
      if (onEnter) cta = <DockCta title={enterTitle} onPress={onEnter} />;
      break;
  }
  const links: React.ReactNode[] = [];
  const legalLinks: React.ReactNode[] = [];
  if (onDecline && !member && !unavailable)
    links.push(
      <DockLink
        key="decline"
        testID="paywall-decline"
        title="Not now"
        label="Not now: continue without membership"
        hint={DECLINE_HINT}
        disabled={busy}
        onPress={onDecline}
      />,
    );
  if (restore)
    links.push(
      <DockLink
        key="restore"
        testID="paywall-restore"
        title="Restore"
        label="Restore purchases"
        emphasis
        disabled={busy}
        onPress={onRestore}
      />,
    );
  if (member && onManage)
    links.push(
      <DockLink
        key="manage"
        testID="paywall-manage"
        title="Manage subscription"
        emphasis
        onPress={onManage}
      />,
    );
  if (!member && legal.terms && legal.privacy)
    legalLinks.push(
      <LegalLink
        key="terms"
        title="Terms"
        label="Terms of Use"
        url={legal.terms}
      />,
      <LegalLink
        key="privacy"
        title="Privacy"
        label="Privacy Policy"
        url={legal.privacy}
      />,
    );
  return (
    <View
      testID="paywall-actions"
      onLayout={(e) => {
        at.current.root = e.nativeEvent.layout.y;
        report();
      }}
      style={{ marginTop: member ? 0 : 30, gap: 12 }}
    >
      {before}
      <Measured
        testID="paywall-action"
        report={(y) => {
          at.current.cta = y;
          report();
        }}
      >
        {cta}
      </Measured>
      {after}
      {links.length + legalLinks.length > 0 && (
        <LinkRow groups={[links, legalLinks]} />
      )}
    </View>
  );
}

/** One quiet line above the floating action, for the states without an offer. */
function DockLine({ text }: { text: string }) {
  return (
    <FText variant="label" tone="secondary" align="center" numberOfLines={2}>
      {text}
    </FText>
  );
}

/**
 * The floating copy of the decision, at the bottom of the screen until the
 * decision itself takes its place: the price as the store states it, the
 * action, then the way on and Restore. Screen readers meet the decision
 * itself instead. What it starts shows in the decision, so it brings that
 * into view as it acts.
 */
export function PaywallDock({
  state,
  onPurchase,
  onRestore,
  onCheck,
  onRetry,
  onDecline,
}: Handlers & { state: PaywallState }) {
  const { floating, reveal } = useDecision();
  if (state.kind === "member") return null;
  const busy = state.kind === "busy";
  const near = (act: () => void) => () => {
    reveal();
    act();
  };
  let line: React.ReactNode = null;
  let cta: React.ReactNode = null;
  switch (state.kind) {
    case "loading":
      line = <PriceLine />;
      cta = <DockCta title="Loading the offer…" busy onPress={() => {}} />;
      break;
    case "ready":
      line = <PriceLine offer={state.offer} />;
      cta = <DockCta title={state.offer.action} onPress={near(onPurchase)} />;
      break;
    case "busy":
      line = <PriceLine offer={state.offer} />;
      cta = <DockCta title={BUSY[state.step]} busy onPress={() => {}} />;
      break;
    case "pending":
    case "unconfirmed":
      line = (
        <DockLine
          text={
            state.kind === "pending"
              ? "Waiting for approval"
              : "Not confirmed yet"
          }
        />
      );
      cta = (
        <DockCta title="Check again" icon="refresh" onPress={near(onCheck)} />
      );
      break;
    case "unavailable":
      line = <DockLine text="Forge Premium isn't available here" />;
      cta = state.retry ? (
        <DockCta title="Try again" icon="refresh" onPress={near(onRetry)} />
      ) : (
        onDecline && (
          <DockLink
            title="Continue without membership"
            outline
            onPress={onDecline}
          />
        )
      );
      break;
  }
  const links: React.ReactNode[] = [];
  if (onDecline && (state.kind !== "unavailable" || state.retry))
    links.push(
      <DockLink
        key="decline"
        title={
          state.kind === "unavailable"
            ? "Continue without membership"
            : "Not now"
        }
        disabled={busy}
        onPress={onDecline}
      />,
    );
  if (state.kind !== "loading" && state.kind !== "unavailable")
    links.push(
      <DockLink
        key="restore"
        title="Restore"
        emphasis
        disabled={busy}
        onPress={near(onRestore)}
      />,
    );
  return (
    <>
      {line}
      <Measured testID="premium-dock-action" report={floating}>
        {cta}
      </Measured>
      {links.length > 0 ? (
        <LinkRow groups={[links]} />
      ) : (
        <View style={{ height: 6 }} />
      )}
    </>
  );
}

/**
 * Forge Premium, whole: the composition, the decision in it and its terms,
 * with the floating copy of the action until the decision is in view. Back
 * waits while Apple's sheet or the server is answering. The confirmation is
 * a new page: it starts at the top, without the floating action.
 */
export function PaywallScreen({
  state,
  simulated,
  legal,
  path,
  arrival = "settle",
  onBack,
  account,
  banner,
  error,
  formatDate,
  onPurchase,
  onRestore,
  onCheck,
  onRetry,
  onEnter,
  enterTitle,
  onDecline,
  onManage,
}: Handlers & {
  state: PaywallState;
  simulated?: boolean;
  legal: Legal;
  path?: PremiumPath;
  arrival?: Arrival;
  onBack: () => void;
  account?: SetupAccount;
  banner?: React.ReactNode;
  error?: string;
  formatDate?: (ms: number) => string;
  onEnter?: () => void;
  enterTitle?: string;
  onManage?: () => void;
}) {
  const member = state.kind === "member";
  const handlers = { onPurchase, onRestore, onCheck, onRetry, onDecline };
  return (
    <PremiumFrame
      key={member ? "member" : "offer"}
      onBack={state.kind === "busy" ? () => undefined : onBack}
      account={account}
      banner={banner}
      error={error}
      arrival={arrival}
      dock={member ? undefined : <PaywallDock state={state} {...handlers} />}
    >
      <PaywallContent
        state={state}
        simulated={simulated}
        path={path}
        arrival={arrival}
        formatDate={formatDate}
      />
      <PaywallActions
        state={state}
        legal={legal}
        {...handlers}
        onEnter={onEnter}
        enterTitle={enterTitle}
        onManage={onManage}
      />
      {!member && (
        <PremiumTerms
          offer={offerOf(state)}
          legalMissing={!(legal.terms && legal.privacy)}
        />
      )}
    </PremiumFrame>
  );
}
