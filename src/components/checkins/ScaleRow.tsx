import React from "react";
import { Pressable, View } from "react-native";
import { useColors } from "../ui";
import { FText } from "../reforge";
import { isAnswer, scaleText, type Scale } from "../../domain/checkins";
import { forge } from "../../theme";

/**
 * One 1–5 question (REFORGE since Phase 7.5G.2): five 48 pt answers with
 * both ends named, so the direction is clear without help ("1 None … 5
 * Severe"). Nothing is selected until the lifter answers. A value the
 * buttons can't show (a recorded 2.5) is stated as recorded and stays
 * unchanged unless an answer is tapped. Optional questions clear when the
 * selected answer is tapped again.
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
  const answered = isAnswer(value);
  const shown = answered
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
      style={{ gap: 8 }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "baseline",
          columnGap: 10,
        }}
      >
        <FText variant="cardTitle" weight="700">
          {scale.question}
        </FText>
        <FText
          variant="label"
          weight={answered ? "700" : undefined}
          tone={answered ? "accent" : "secondary"}
        >
          {shown}
        </FText>
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
                minHeight: 48,
                borderRadius: forge.radii.tile,
                borderWidth: selected ? forge.border.active : forge.border.card,
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
              <FText
                variant="cardTitle"
                weight={selected ? "800" : "600"}
                tone={selected ? "accent" : "primary"}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {String(n)}
              </FText>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
        }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <FText variant="label" tone="secondary" style={{ flexShrink: 1 }}>
          {`1 · ${scale.words[0]}`}
        </FText>
        <FText
          variant="label"
          tone="secondary"
          align="right"
          style={{ flexShrink: 1 }}
        >
          {`${scale.words[4]} · 5`}
        </FText>
      </View>
    </View>
  );
}
