import React, { useEffect, useState, Component } from "react";
import { Stack } from "expo-router";
import { View, Text, Pressable, AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initializeRepository } from "../src/data/native";
import { useApp } from "../src/state";
import { Loading, dark, useColors } from "../src/components/ui";
import * as SplashScreen from "expo-splash-screen";
import { ForgeSplash } from "../src/components/splash/ForgeSplash";
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
class Boundary extends Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error)
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: dark.background,
            padding: 30,
            justifyContent: "center",
            gap: 20,
          }}
        >
          <Text style={{ color: dark.text, fontSize: 24 }}>
            FORGE needs attention
          </Text>
          <Text style={{ color: dark.muted }}>{this.state.error}</Text>
          <Text style={{ color: dark.muted }}>
            Your database has not been deleted. Close and reopen the app; if
            this continues, preserve your backup and report this error.
          </Text>
          <Pressable onPress={() => this.setState({ error: "" })}>
            <Text style={{ color: dark.accent }}>Retry</Text>
          </Pressable>
        </View>
      );
    return this.props.children;
  }
}
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
        <Stack.Screen name="paths" />
        <Stack.Screen name="forge-paths" />
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
    void initializeRepository()
      .then(() => {
        if (!mounted) return;
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
        <Boundary>
          <Ready />
        </Boundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
