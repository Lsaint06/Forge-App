import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initializeRepository, repository } from "../src/data/native";
import {
  commitPending,
  reconcilePendingDeletes,
  remainingMs,
} from "../src/data/pending-deletes";
import { useApp } from "../src/state";
import { Loading, dark, useColors } from "../src/components/ui";
import * as SplashScreen from "expo-splash-screen";
import { ForgeSplash } from "../src/components/splash/ForgeSplash";
import { ErrorBoundary } from "../src/components/Recovery";
import { loadBrandFonts } from "../src/fonts";
import {
  finishIntro,
  introPending,
  onIntroReplay,
} from "../src/components/splash/session";

// The native launch screen is cosmetic: failures in its module must never
// block startup.
function nativeSplash(action: () => Promise<unknown>) {
  try {
    void action().catch(() => {});
  } catch {
    // Ignore: the in-app intro and app still render.
  }
}
// Keep the native launch screen up until the first in-app frame is ready.
nativeSplash(() => SplashScreen.preventAutoHideAsync());
// REFORGE display face: loads in parallel and never delays startup.
loadBrandFonts();
function Navigation() {
  const c = useColors();
  return (
    <>
      <StatusBar style={c.background === dark.background ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
        }}
      >
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
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="account" />
        <Stack.Screen name="design-system" />
      </Stack>
    </>
  );
}
function Ready() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();
  // Plays once per JavaScript runtime (a genuine cold start in production).
  const [intro, setIntro] = useState(introPending);
  useEffect(() => onIntroReplay(() => setIntro(true)), []);
  useEffect(() => {
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void initializeRepository()
      .then(() => {
        if (!mounted) return;
        // Deletions interrupted by FORGE closing (D15): expired ones are
        // completed now; the rest at their original deadline. Only at a cold
        // start, so returning from the background never cuts a window short.
        try {
          for (const m of reconcilePendingDeletes(repository()))
            timers.push(
              setTimeout(() => {
                try {
                  if (commitPending(repository(), m.kind, m.id) !== "none")
                    useApp.getState().touch();
                } catch {
                  // The marker stays; the next launch completes it.
                }
              }, remainingMs(m)),
            );
        } catch {
          // Never blocks starting FORGE; markers are retried next launch.
        }
        useApp.getState().touch();
        setReady(true);
      })
      .catch((e) => {
        if (!mounted) return;
        // Recovery must not replay the intro over the error screen.
        finishIntro();
        setError(e instanceof Error ? e : new Error("Database startup failed"));
      });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && mounted) {
        void initializeRepository()
          .then(() => {
            if (mounted) useApp.getState().touch();
          })
          .catch((e) => {
            if (mounted) setError(e);
          });
      }
    });
    return () => {
      mounted = false;
      sub.remove();
      timers.forEach(clearTimeout);
    };
  }, []);
  if (error) throw error;
  return (
    <>
      {ready ? <Navigation /> : <Loading />}
      {intro && (
        <ForgeSplash
          ready={ready}
          onFinish={() => {
            finishIntro();
            setIntro(false);
          }}
        />
      )}
    </>
  );
}
export default function Root() {
  const c = useColors();
  // The in-app intro's first frame matches the native launch screen, so the
  // native splash can hide as soon as the root has committed.
  useEffect(() => {
    nativeSplash(() => SplashScreen.hideAsync());
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <Ready />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
