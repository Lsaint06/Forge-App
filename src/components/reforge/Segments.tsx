import React from "react";
import { Pressable, View } from "react-native";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";

/**
 * The approved library's segmented switch (All / Favorites / Recent): a
 * bordered track with the chosen segment in ember. 44 pt segments. A REFORGE
 * primitive; the shared SegmentedControl is unchanged (decision C5).
 */
export function ForgeSegments<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the whole control ("Time range"). */
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: "row",
        minHeight: forge.heights.compact + 6,
        padding: 3,
        borderRadius: forge.radii.card,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardBg,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: forge.heights.compact,
              paddingHorizontal: 6,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: forge.radii.tile - 2,
              borderWidth: forge.border.active,
              borderColor: selected ? c.emberMuted : "transparent",
              backgroundColor: selected
                ? c.emberTint
                : pressed
                  ? c.cardRaised
                  : "transparent",
            })}
          >
            <FText
              variant="label"
              weight="600"
              tone={selected ? "accent" : "secondary"}
              numberOfLines={1}
            >
              {o.label}
            </FText>
          </Pressable>
        );
      })}
    </View>
  );
}
