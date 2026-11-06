import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors, type IconName } from "../ui";
import { forge, theme } from "../../theme";
import { FText } from "./Text";
import { Gradient } from "./Gradient";

export type TabSpec = { label: string; icon: IconName; selectedIcon: IconName };

type Route = { key: string; name: string };

// A soft ember halo just behind the selected icon (references: barely
// visible). Its peak strength is the `emberGlow` token (20% dark, 11% light).
export const GLOW = { width: 44, height: 32 } as const;

/**
 * REFORGE tab bar: a raised panel with rounded top corners and a hairline,
 * line icons, the selected tab in ember with a soft glow (its label is also
 * bolder, so selection never relies on colour alone). While a workout is in
 * progress, a resume strip sits above the tabs except on Home, whose hero
 * already offers Resume.
 */
export function ForgeTabBar({
  routes,
  index,
  tabs,
  onTabPress,
  resume,
}: {
  routes: Route[];
  index: number;
  tabs: Record<string, TabSpec>;
  onTabPress: (route: Route, selected: boolean) => void;
  resume?: {
    /** Displayed title (program prefix removed). */
    title: string;
    /** Stored workout name, spoken in the hint as before. */
    name: string;
    paused: boolean;
    onPress: () => void;
  };
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: c.tabBar,
        borderTopLeftRadius: forge.radii.tabBar,
        borderTopRightRadius: forge.radii.tabBar,
        borderWidth: forge.border.card,
        borderBottomWidth: 0,
        borderColor: c.cardBorder,
        paddingTop: 6,
        paddingBottom: Math.max(6, insets.bottom),
        ...theme.elevation.floating,
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.3,
      }}
    >
      {resume && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resume active workout"
          accessibilityHint={`${resume.paused ? "Paused" : "In progress"}: ${resume.name}`}
          onPress={resume.onPress}
          style={({ pressed }) => ({
            marginHorizontal: forge.spacing.group,
            marginTop: 4,
            marginBottom: 2,
            minHeight: 52,
            paddingHorizontal: forge.spacing.group,
            paddingVertical: 8,
            borderRadius: forge.radii.card,
            borderWidth: forge.border.active,
            borderColor: resume.paused ? c.cardBorder : c.emberMuted,
            backgroundColor: pressed ? c.cardRaised : c.cardBg,
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.group,
          })}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: resume.paused ? c.text3 : c.emberHot,
            }}
          />
          <View style={{ flex: 1 }}>
            <FText
              variant="overline"
              tone={resume.paused ? "secondary" : "accent"}
            >
              {resume.paused ? "Paused" : "In progress"}
            </FText>
            <FText variant="cardTitle" numberOfLines={1}>
              {resume.title}
            </FText>
          </View>
          <FText variant="cardTitle">Resume</FText>
          <Ionicons name="chevron-forward" size={18} color={c.text2} />
        </Pressable>
      )}
      <View style={{ flexDirection: "row" }}>
        {routes.map((route, i) => {
          const tab = tabs[route.name];
          if (!tab) return null;
          const selected = i === index;
          const color = selected ? c.emberHot : c.text2;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => onTabPress(route, selected)}
              style={{
                flex: 1,
                minHeight: forge.heights.tab,
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              {/* The glow is confined to a small box behind the icon, so it
                  never reaches the label or a neighbouring tab; the icon and
                  label are drawn on top in solid ember. */}
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected && (
                  <View
                    testID="tab-glow"
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: (24 - GLOW.width) / 2,
                      top: (24 - GLOW.height) / 2,
                      width: GLOW.width,
                      height: GLOW.height,
                    }}
                  >
                    <Gradient
                      kind="radial"
                      stops={[
                        { offset: 0, color: c.emberGlow },
                        { offset: 1, color: c.emberGlow, opacity: 0 },
                      ]}
                    />
                  </View>
                )}
                <Ionicons
                  testID={`tab-icon-${route.name}`}
                  name={selected ? tab.selectedIcon : tab.icon}
                  color={color}
                  size={24}
                />
              </View>
              <FText
                variant="tabLabel"
                numberOfLines={1}
                fit
                weight={selected ? "700" : "500"}
                style={{ color }}
              >
                {tab.label}
              </FText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
