import React from "react";
import { Pressable, Text, View } from "react-native";
import { Txt, useColors } from "../ui";
import { isAnswer, scaleText, type Scale } from "../../domain/checkins";
import { theme } from "../../theme";

/**
 * One 1–5 question: five 48 pt answers with both ends named, so the direction
 * is clear without help ("1 None … 5 Severe"). Nothing is selected until the
 * lifter answers. A value the buttons can't show (a recorded 2.5) is stated
 * as recorded and stays unchanged unless an answer is tapped. Optional
 * questions clear when the selected answer is tapped again.
 */
export function ScaleRow({
  scale,
  value,
  recorded,
  onChange,
}: {
  scale: Scale;
  value: number | undefined;
  /** The stored value when it isn't a whole 1–5 answer (shown as is). */
  recorded?: unknown;
  onChange: (value: number | undefined) => void;
}) {
  const c = useColors();
  const shown = isAnswer(value)
    ? scaleText(scale.key, value)
    : recorded !== undefined
      ? `${scaleText(scale.key, recorded)} (recorded)`
      : scale.required
        ? "Not answered"
        : "Optional";
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={`${scale.question}, 1 ${scale.words[0]} to 5 ${scale.words[4]}${scale.required ? "" : ", optional"}`}
      style={{ gap: theme.spacing.sm }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "baseline",
          columnGap: theme.spacing.sm,
        }}
      >
        <Txt variant="headline">{scale.question}</Txt>
        <Txt variant="caption" tone={isAnswer(value) ? "primary" : "tertiary"}>
          {shown}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n}, ${scale.words[n - 1]}`}
              accessibilityHint={
                selected && !scale.required ? "Tap again to clear" : undefined
              }
              accessibilityState={{ selected, checked: selected }}
              onPress={() =>
                onChange(selected && !scale.required ? undefined : n)
              }
              style={({ pressed }) => ({
                flex: 1,
                minHeight: theme.heights.control,
                borderRadius: theme.radii.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? c.ember : c.surfaceRaised,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                maxFontSizeMultiplier={1.5}
                style={{
                  color: selected ? c.onEmber : c.text,
                  fontSize: 17,
                  fontWeight: selected ? "800" : "600",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: theme.spacing.md,
        }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Txt variant="caption" tone="secondary" style={{ flexShrink: 1 }}>
          {`1 · ${scale.words[0]}`}
        </Txt>
        <Txt
          variant="caption"
          tone="secondary"
          align="right"
          style={{ flexShrink: 1 }}
        >
          {`${scale.words[4]} · 5`}
        </Txt>
      </View>
    </View>
  );
}
