import React from "react";
import { router } from "expo-router";
import { Screen, Label } from "../src/components/ui";
import { ProfileForm } from "../src/components/ProfileForm";
export default function Onboarding() {
  return (
    <Screen title="Made by your effort." eyebrow="WELCOME TO FORGE">
      <Label muted>
        A private training log. A clearer view of your progress. Start as a
        guest, without an account.
      </Label>
      <ProfileForm onboarding onDone={() => router.replace("/(tabs)")} />
    </Screen>
  );
}
