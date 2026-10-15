import React from "react";
import { Tabs, router } from "expo-router";
import { View, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRepo } from "../../src/state";
import { useColors } from "../../src/components/ui";
const icons = {
  index: "grid-outline",
  train: "barbell-outline",
  explore: "compass-outline",
  progress: "stats-chart-outline",
  profile: "person-outline",
} as const;
export default function TabLayout() {
  const c = useColors();
  const r = useRepo();
  const active = r.active();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderColor: c.border,
            paddingBottom: Math.max(8, insets.bottom),
          }}
        >
          {active && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume active workout"
              onPress={() => router.push("/workout")}
              style={{
                padding: 14,
                backgroundColor: c.elevated,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{ color: c.text, fontWeight: "700" }}
                numberOfLines={1}
              >
                {active.status === "paused" ? "Paused" : "Active"} ·{" "}
                {active.name}
              </Text>
              <Text style={{ color: c.accent }}>RESUME ↗</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: "row" }}>
            {state.routes.map((route, index) => {
              const selected = state.index === index;
              const name = route.name as keyof typeof icons;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    name === "index"
                      ? "Home"
                      : name === "profile"
                        ? "You"
                        : name
                  }
                  onPress={() => {
                    const event = navigation.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!event.defaultPrevented)
                      navigation.navigate(route.name);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 64,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons
                    name={icons[name]}
                    color={selected ? c.accent : c.muted}
                    size={23}
                  />
                  <Text
                    style={{
                      color: selected ? c.accent : c.muted,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {name === "index"
                      ? "Home"
                      : name === "profile"
                        ? "You"
                        : name.charAt(0).toUpperCase() + name.slice(1)}
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
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
