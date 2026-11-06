import React, { useEffect, useState } from "react";
import { BackHandler } from "react-native";
import Animated from "react-native-reanimated";
import {
  resumeStage,
  type Progress,
  type Stage,
} from "../../domain/onboarding/journey";
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

function StageFrame({ children }: { children: React.ReactNode }) {
  const entrance = useEntrance(0, 16);
  return (
    <Animated.View style={[{ flex: 1 }, entrance]}>{children}</Animated.View>
  );
}

const PREVIOUS: Partial<Record<Stage, Stage>> = {
  training: "about",
  reveal: "training",
};

export function OnboardingFlow({
  store,
  account,
  error,
  banner,
}: {
  store: OnboardingStore;
  /** Who is being set up, with the way out (setup only). */
  account?: SetupAccount;
  /** Something setup itself must say (a failed sign-out). */
  error?: string;
  /** The development preview's banner. */
  banner?: React.ReactNode;
}) {
  const [progress, setProgress] = useState(store.progress);
  const save = (next: Progress) => {
    setProgress(next);
    store.saveProgress(next);
  };
  const stage = resumeStage(store.profile, progress, programLibrary);
  const previous = PREVIOUS[stage];
  const back = previous
    ? () => save({ ...progress, stage: previous })
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
    <StageFrame key={stage}>
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
      ) : (
        <Reveal store={store} progress={progress} {...shared} onBack={back!} />
      )}
    </StageFrame>
  );
}

/** First-time setup on this phone's profile (the /onboarding route). */
export function SetupOnboarding({
  account,
  error,
}: {
  account?: SetupAccount;
  error?: string;
}) {
  const store = useRepositoryStore();
  return <OnboardingFlow store={store} account={account} error={error} />;
}
