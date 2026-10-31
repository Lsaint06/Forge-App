import React from "react";
import { Stack } from "expo-router";
import { useColors } from "../components/ui";
import { entryRoute, type Entry } from "./entry";

// The root routes, each group reachable only in its entry state (Phase
// 7.7B). This is the one place Forge decides what may be shown: training
// screens only for a signed-in athlete whose data is theirs and whose setup
// is done; setup only for a signed-in athlete; the welcome and account
// screens only before that. A guarded route redirects to the screen of the
// current state, so deep links can't reach protected data.
export function AppStack({ entry }: { entry: Entry["kind"] }) {
  const c = useColors();
  const to = entryRoute(entry);
  const ready = entry === "ready";
  const setup = entry === "setup";
  const signedOut = entry === "signedOut";
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Protected guard={ready} redirectTo={to}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="workout"
          options={{ presentation: "fullScreenModal" }}
        />
        <Stack.Screen name="journal" />
        <Stack.Screen name="templates" />
        <Stack.Screen name="history" />
        <Stack.Screen name="records" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="explore" />
        <Stack.Screen name="paths" />
        <Stack.Screen name="forge-paths/index" />
        <Stack.Screen name="forge-paths/[programId]" />
        <Stack.Screen name="forge-paths/current" />
        <Stack.Screen name="exercise" />
        <Stack.Screen name="account" />
        <Stack.Screen name="preferences" />
        <Stack.Screen name="design-system" />
      </Stack.Protected>
      <Stack.Protected guard={setup} redirectTo={to}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedOut} redirectTo={to}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="create-account" />
      </Stack.Protected>
      <Stack.Protected guard={!ready && !setup && !signedOut} redirectTo={to}>
        <Stack.Screen name="account-check" />
      </Stack.Protected>
    </Stack>
  );
}
