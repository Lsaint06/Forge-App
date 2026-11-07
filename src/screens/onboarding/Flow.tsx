import React, { useEffect, useState } from "react";
import { BackHandler } from "react-native";
import Animated, { FadeOut, useReducedMotion } from "react-native-reanimated";
import {
  resumeStage,
  revealFor,
  type Progress,
  type Stage,
} from "../../domain/onboarding/journey";
import { premiumPath, type PremiumPath } from "../../domain/onboarding/premium";
import { defaults } from "../../domain/types";
import { programLibrary } from "../../programs";
import type { SetupAccount } from "./account";
import { About } from "./About";
import { Training } from "./Training";
import { Reveal } from "./Reveal";
import { useEntrance } from "./motion";
import { useRepositoryStore, type OnboardingStore } from "./store";

// First-time setup after the account (Phase 9.2): About you → Your training
// → Your Forge Path, then Forge opens. One route (/onboarding, the setup
// entry state), so nothing behind setup is reachable until it is done. Back
// moves one step, on screen or with Android's back button, and every answer
// stays. The stage is kept on screen and in the onboarding record, so a
// restart resumes exactly here.

/**
 * A stage settling in. Forge Premium's step (Phase 9.3) choreographs its own
 * arrival from the reveal, so it starts `still`; the reveal, when Forge
 * Premium follows it, fades out as it goes, so the two read as one move.
 */
function StageFrame({
  children,
  still = false,
  fadeOut = false,
}: {
  children: React.ReactNode;
  still?: boolean;
  fadeOut?: boolean;
}) {
  const reduced = !!useReducedMotion();
  const entrance = useEntrance(0, 16);
  return (
    <Animated.View
      style={[{ flex: 1 }, still ? undefined : entrance]}
      exiting={fadeOut && !reduced ? FadeOut.duration(150) : undefined}
    >
      {children}
    </Animated.View>
  );
}

const PREVIOUS: Partial<Record<Stage, Stage>> = {
  training: "about",
  reveal: "training",
  membership: "reveal",
};

/**
 * The membership step after the reveal (Phase 9.3), handed in by Setup when
 * membership is enabled. Setup's own modules never reach membership code
 * themselves (tests/route-inventory.test.ts).
 */
export type MembershipStep = (props: {
  onBack: () => void;
  /** Membership verified, or the athlete goes on without one: Forge opens. */
  onDone: () => void;
  account?: SetupAccount;
  error?: string;
  banner?: React.ReactNode;
  /** The Forge Path just revealed, for Forge Premium to continue from. */
  path?: PremiumPath;
  /**
   * "continue": arrived from the reveal just now, so the transition plays;
   * "settle": resumed after a restart, simply settling in.
   */
  arrival: "continue" | "settle";
}) => React.ReactNode;

export function OnboardingFlow({
  store,
  account,
  error,
  banner,
  membership,
}: {
  store: OnboardingStore;
  /** Who is being set up, with the way out (setup only). */
  account?: SetupAccount;
  /** Something setup itself must say (a failed sign-out). */
  error?: string;
  /** The development preview's banner. */
  banner?: React.ReactNode;
  /** The step after the reveal, when membership is enabled. */
  membership?: MembershipStep;
}) {
  const [progress, setProgress] = useState(store.progress);
  // How the athlete reached the membership step: Continue plays the
  // transition from the reveal; a restart simply resumes there.
  const [arrival, setArrival] = useState<"continue" | "settle">("settle");
  const save = (next: Progress) => {
    setProgress(next);
    store.saveProgress(next);
  };
  const resumed = resumeStage(store.profile, progress, programLibrary);
  // Without a membership step, a membership stage is the reveal again.
  const stage = resumed === "membership" && !membership ? "reveal" : resumed;
  const previous = PREVIOUS[stage];
  const back = previous
    ? () => save({ ...progress, stage: previous })
    : undefined;
  // The Forge Path shown at the reveal: its structure, in the reveal's own
  // words (never its exercises).
  const revealed =
    stage === "membership"
      ? revealFor(store.profile, progress, programLibrary)
      : undefined;
  const path = revealed
    ? premiumPath(
        revealed.program,
        store.profile.name !== defaults.name ? store.profile.name : undefined,
        revealed.restDay,
      )
    : undefined;

  // Android's back button steps back through setup, as the on-screen Back.
  // Re-registered each render so it sees the latest answers.
  useEffect(() => {
    if (!back) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  const shared = { account, error, banner };
  return (
    <StageFrame
      key={stage}
      still={stage === "membership"}
      fadeOut={stage === "reveal" && !!membership}
    >
      {stage === "about" ? (
        <About
          store={store}
          {...shared}
          onContinue={() => save({ ...progress, stage: "training" })}
        />
      ) : stage === "training" ? (
        <Training
          store={store}
          progress={progress}
          {...shared}
          onBack={back!}
          onChoose={save}
          onContinue={(revealed) =>
            save({ ...progress, stage: "reveal", revealed })
          }
        />
      ) : stage === "membership" && membership ? (
        membership({
          ...shared,
          onBack: back!,
          onDone: store.finish,
          path,
          arrival,
        })
      ) : (
        <Reveal
          store={store}
          progress={progress}
          {...shared}
          onBack={back!}
          onContinue={
            membership
              ? () => {
                  setArrival("continue");
                  save({ ...progress, stage: "membership" });
                }
              : undefined
          }
        />
      )}
    </StageFrame>
  );
}

/** First-time setup on this phone's profile (the /onboarding route). */
export function SetupOnboarding({
  account,
  error,
  membership,
}: {
  account?: SetupAccount;
  error?: string;
  membership?: MembershipStep;
}) {
  const store = useRepositoryStore();
  return (
    <OnboardingFlow
      store={store}
      account={account}
      error={error}
      membership={membership}
    />
  );
}
