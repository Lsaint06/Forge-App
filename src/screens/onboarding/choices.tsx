import React, { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import { FText } from "../../components/reforge";
import { restDayNames } from "../../domain/profile";
import { forge } from "../../theme";

// Setup's choices (Phase 9.2): every option a radio with its full name for
// screen readers, the chosen one in ember with a check, never colour alone.

type Option = { value: string; title?: string; detail?: string };

/** Options with a sentence each (experience, goal): one card per option. */
export function OptionCards({
  options,
  value,
  onChange,
}: {
  options: readonly Option[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: forge.spacing.tight }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.title ?? o.value}
            accessibilityHint={o.detail}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              minHeight: 64,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: forge.radii.card + 4,
              borderWidth: forge.border.active,
              borderColor: selected ? c.emberHot : c.cardBorder,
              backgroundColor: selected
                ? c.emberTint
                : pressed
                  ? c.cardRaised
                  : c.cardBg,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            })}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <FText variant="cardTitle" weight="700">
                {o.title ?? o.value}
              </FText>
              {o.detail && (
                <FText variant="label" tone="secondary">
                  {o.detail}
                </FText>
              )}
            </View>
            <Ionicons
              name={selected ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={selected ? c.emberHot : c.text3}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Days a week: one tile per offered count, the number first. */
export function DayTiles({
  days,
  value,
  onChange,
}: {
  days: readonly number[];
  value: number | undefined;
  onChange: (days: number) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
      {days.map((d) => {
        const selected = d === value;
        return (
          <Pressable
            key={d}
            accessibilityRole="radio"
            accessibilityLabel={`${d} days`}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(d)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 78,
              paddingVertical: 10,
              borderRadius: forge.radii.card + 4,
              borderWidth: forge.border.active,
              borderColor: selected ? c.emberHot : c.cardBorder,
              backgroundColor: selected
                ? c.emberTint
                : pressed
                  ? c.cardRaised
                  : c.cardBg,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            })}
          >
            <FText
              variant="cardMetric"
              tone={selected ? "accent" : "primary"}
              align="center"
            >
              {String(d)}
            </FText>
            <FText
              variant="label"
              tone={selected ? "accent" : "secondary"}
              align="center"
            >
              days
            </FText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The rest day on a Monday-to-Sunday week. Short names ("Wed") in seven
 * equal columns when they fit at the reader's text size, otherwise four and
 * three: a name is never broken across lines.
 */
export function RestDayPicker({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (day: number) => void;
}) {
  const c = useColors();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const gap = 6;
  // "Wed", the widest short name, is about 31 pt at 15 pt semibold, and the
  // chosen day's "REST" a little less: seven across while they fit.
  const needed = 31 * Math.min(fontScale, 2) + 8;
  const perRow = width === 0 || (width - gap * 6) / 7 >= needed ? 7 : 4;
  // A point of slack: tiles that sum to exactly the row width can wrap.
  const tile =
    width > 0 ? (width - gap * (perRow - 1) - 1) / perRow : undefined;
  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{ flexDirection: "row", flexWrap: "wrap", gap }}
    >
      {restDayNames.map((name, day) => {
        const selected = day === value;
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(day)}
            style={({ pressed }) => ({
              ...(tile ? { width: tile } : { flexGrow: 1, flexBasis: 40 }),
              minHeight: 52,
              paddingVertical: 8,
              borderRadius: forge.radii.card + 2,
              borderWidth: forge.border.active,
              borderColor: selected ? c.emberHot : c.cardBorder,
              backgroundColor: selected
                ? c.emberTint
                : pressed
                  ? c.cardRaised
                  : c.cardBg,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={2}
              style={{
                color: selected ? c.emberHot : c.text,
                fontSize: 15,
                lineHeight: 20,
                fontWeight: selected ? "700" : "600",
              }}
            >
              {name.slice(0, 3)}
            </Text>
            {selected && (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.6}
                style={{
                  color: c.emberHot,
                  fontSize: 10,
                  lineHeight: 13,
                  fontWeight: "700",
                  letterSpacing: 1,
                }}
              >
                REST
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two or three short choices on one track (units). */
export function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; title: string; spoken: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ gap: 6 }}
    >
      <FText variant="label" tone="secondary">
        {label}
      </FText>
      <View
        style={{
          flexDirection: "row",
          padding: 3,
          gap: 3,
          borderRadius: forge.radii.card + 2,
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
              accessibilityRole="radio"
              accessibilityLabel={o.spoken}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: forge.heights.compact,
                paddingHorizontal: 8,
                borderRadius: forge.radii.card,
                borderWidth: forge.border.active,
                borderColor: selected ? c.emberMuted : "transparent",
                backgroundColor: selected
                  ? c.emberTint
                  : pressed
                    ? c.cardRaised
                    : "transparent",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <FText
                variant="body"
                weight={selected ? "700" : "600"}
                tone={selected ? "accent" : "secondary"}
                align="center"
              >
                {o.title}
              </FText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
