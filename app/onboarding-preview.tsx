import React from "react";
import { useLocalSearchParams } from "expo-router";
import OnboardingPreview from "../src/screens/onboarding/Preview";
import { previewMembershipStep } from "../src/screens/membership/Preview";

// Preferences → Development: the whole first-time journey (Phase 9.2). With
// ?premium=1, Forge Premium follows the Forge Path reveal (Phase 9.3),
// simulated: setup's own modules never reach membership code, so the route
// hands the step in.
export default function OnboardingPreviewRoute() {
  const { premium } = useLocalSearchParams<{ premium?: string }>();
  return (
    <OnboardingPreview
      membership={premium === "1" ? previewMembershipStep : undefined}
    />
  );
}
