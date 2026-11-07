import React, { useState } from "react";
import { router } from "expo-router";
import { ForgeEmpty, ForgeSubScreen } from "../../components/reforge";
import { goBack } from "../../navigation";
import { Intro } from "./Intro";
import { OnboardingFlow, type MembershipStep } from "./Flow";
import { PreviewBanner } from "./parts";
import { usePreviewStore } from "./store";

// Development only (Phase 9.2): the whole first-time journey, from the brand
// intro to the Forge Path reveal, for an athlete who is already set up. A
// new athlete's answers are kept in memory and nothing is saved: the
// profile, the training and the onboarding record are never touched. Opened
// from Preferences → Development; production bundles show nothing here.
// With a membership step (Phase 9.3, handed in by the route), Forge Premium
// follows the reveal, simulated, and the preview ends where setup does: on
// Home.
export default function OnboardingPreview({
  membership,
}: { membership?: MembershipStep } = {}) {
  const exit = () => goBack("/preferences");
  const store = usePreviewStore(
    membership ? () => router.navigate("/(tabs)") : exit,
  );
  const [stage, setStage] = useState<"intro" | "setup">("intro");
  if (!__DEV__)
    return (
      <ForgeSubScreen title="Unavailable" onBack={() => router.back()}>
        <ForgeEmpty
          title="Not in this build"
          detail="The onboarding preview is for development builds only."
        />
      </ForgeSubScreen>
    );
  const banner = <PreviewBanner onExit={exit} />;
  return stage === "intro" ? (
    <Intro banner={banner} onAccount={() => setStage("setup")} />
  ) : (
    <OnboardingFlow store={store} banner={banner} membership={membership} />
  );
}
