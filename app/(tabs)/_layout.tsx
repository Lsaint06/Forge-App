import React from "react";
import { Tabs, router } from "expo-router";
import { useRepo } from "../../src/state";
import { workoutTitle } from "../../src/domain/workout-display";
import { ForgeTabBar, type TabSpec } from "../../src/components/reforge/TabBar";
import { TAB_PATHS, TabFreeze } from "../../src/components/TabFreeze";

// Five destinations (Phase 7.1A): Home, Train, Nutrition, Progress, You. The
// exercise library lives in Train. Route names are unchanged ("index" is
// Home, "profile" is You), so existing links keep working; Nutrition is the
// same screen that `/journal?kind=nutrition` opens.
const tabs: Record<string, TabSpec> = {
  index: { label: "Home", icon: "home-outline", selectedIcon: "home-outline" },
  train: {
    label: "Train",
    icon: "barbell-outline",
    selectedIcon: "barbell-outline",
  },
  nutrition: {
    label: "Nutrition",
    icon: "restaurant-outline",
    selectedIcon: "restaurant-outline",
  },
  progress: {
    label: "Progress",
    icon: "stats-chart-outline",
    selectedIcon: "stats-chart-outline",
  },
  profile: {
    label: "You",
    icon: "person-outline",
    selectedIcon: "person-outline",
  },
};

export default function TabLayout() {
  const r = useRepo();
  const active = r.active();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // Background tabs and the tab under the workout logger stop
      // re-rendering on every saved change (Phase 7.6).
      screenLayout={({ route, children }) => (
        <TabFreeze path={TAB_PATHS[route.name] ?? `/${route.name}`}>
          {children}
        </TabFreeze>
      )}
      tabBar={({ state, emitter, navigateToTab }) => (
        // Expo Router 58: `state.routes` lists every visible tab, with
        // placeholders for tabs not yet opened; switch with
        // `navigateToTab(route.key)`.
        <ForgeTabBar
          routes={state.routes}
          index={state.index}
          tabs={tabs}
          onTabPress={(route, selected) => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!selected && !event.defaultPrevented) navigateToTab(route.key);
          }}
          // Home's and Train's heroes already offer Resume, so the strip
          // shows on the other tabs only.
          resume={
            active &&
            !["index", "train"].includes(state.routes[state.index]?.name ?? "")
              ? {
                  title: workoutTitle(active.name),
                  name: active.name,
                  paused: active.status === "paused",
                  onPress: () => router.push("/workout"),
                }
              : undefined
          }
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
