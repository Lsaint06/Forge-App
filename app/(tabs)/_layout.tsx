import React from "react";
import { Tabs, router } from "expo-router";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRepo } from "../../src/state";
import { useColors, Txt } from "../../src/components/ui";
import { workoutTitle } from "../../src/domain/workout-display";
import { theme } from "../../src/theme";

// Four destinations: Today, Train, Progress, You. The exercise library lives
// in Train. The selected tab is white with a filled icon; there is no orange
// in navigation.
const tabs = {
  index: { label: "Today", icon: "today", idle: "today-outline" },
  train: { label: "Train", icon: "barbell", idle: "barbell-outline" },
  progress: {
    label: "Progress",
    icon: "stats-chart",
    idle: "stats-chart-outline",
  },
  profile: { label: "You", icon: "person", idle: "person-outline" },
} as const;
type TabName = keyof typeof tabs;

export default function TabLayout() {
  const c = useColors();
  const r = useRepo();
  const active = r.active();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, emitter, navigateToTab }) => (
        <View
          style={{
            backgroundColor: c.bg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: c.hairline,
            paddingBottom: Math.max(6, insets.bottom),
          }}
        >
          {/* Today's hero already offers Resume, so the banner shows on the
              other tabs only. */}
          {active && state.routes[state.index]?.name !== "index" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume active workout"
              accessibilityHint={`${active.status === "paused" ? "Paused" : "In progress"}: ${active.name}`}
              onPress={() => router.push("/workout")}
              style={({ pressed }) => ({
                marginHorizontal: theme.spacing.group,
                marginTop: theme.spacing.sm,
                minHeight: 52,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 8,
                borderRadius: theme.radii.control,
                backgroundColor: pressed ? c.selected : c.surfaceRaised,
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.group,
              })}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    active.status === "paused" ? c.text3 : c.ember,
                }}
              />
              <View style={{ flex: 1 }}>
                <Txt variant="overline" tone="secondary">
                  {active.status === "paused" ? "Paused" : "In progress"}
                </Txt>
                <Txt variant="body" weight="600" numberOfLines={1}>
                  {workoutTitle(active.name)}
                </Txt>
              </View>
              <Txt variant="body" weight="600">
                Resume
              </Txt>
              <Ionicons name="chevron-forward" size={18} color={c.text2} />
            </Pressable>
          )}
          <View style={{ flexDirection: "row" }}>
            {/* Expo Router 58: `state.routes` lists every visible tab, with
                placeholders for tabs not yet opened; switch with
                `navigateToTab(route.key)`. */}
            {state.routes.map((route, index) => {
              const tab = tabs[route.name as TabName];
              if (!tab) return null;
              const selected = index === state.index;
              const color = selected ? c.text : c.text2;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={tab.label}
                  onPress={() => {
                    const event = emitter.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!selected && !event.defaultPrevented)
                      navigateToTab(route.key);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                  }}
                >
                  <Ionicons
                    name={selected ? tab.icon : tab.idle}
                    color={color}
                    size={24}
                  />
                  <Text
                    maxFontSizeMultiplier={1.3}
                    numberOfLines={1}
                    style={{
                      color,
                      fontSize: 11,
                      fontWeight: selected ? "700" : "500",
                      letterSpacing: 0.2,
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
