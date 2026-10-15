import React, { useEffect, useState, Component } from "react";
import { Stack } from "expo-router";
import { View, Text, Pressable, AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initializeRepository } from "../src/data/native";
import { useApp } from "../src/state";
import { Loading, dark, useColors } from "../src/components/ui";
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
        <Stack.Screen name="exercise" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="account" />
      </Stack>
    </>
  );
}
function Ready() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();
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
  return ready ? <Navigation /> : <Loading />;
}
export default function Root() {
  const c = useColors();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaProvider
        style={
          Platform.OS === "web"
            ? { width: "100%", maxWidth: 1100, alignSelf: "center" }
            : undefined
        }
      >
        <Boundary>
          <Ready />
        </Boundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
