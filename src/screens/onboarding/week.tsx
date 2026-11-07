import React from "react";
import { StyleSheet, View } from "react-native";
import { useColors } from "../../components/ui";
import { FText } from "../../components/reforge";
import { restDayNames } from "../../domain/profile";
import type { SessionDay } from "../../domain/onboarding/reveal";
import { forge } from "../../theme";

// The Forge Path as the pre-subscription preview shows it (Phase 9.3,
// founder rule): each training day, its focus and how many exercises it
// holds. Never an exercise, a set or a rep. Shared by the reveal and Forge
// Premium's pass, so the two always say the same thing.

const exercisesText = (n: number) =>
  `${n} ${n === 1 ? "exercise" : "exercises"}`;

/** "MON": the day as a small steel capsule. */
function DayCapsule({ day }: { day: number }) {
  const c = useColors();
  return (
    <View
      style={{
        width: 50,
        height: 30,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.cardRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.hairline,
      }}
    >
      <FText
        variant="displayLabel"
        numberOfLines={1}
        style={{ fontSize: 15, lineHeight: 17, letterSpacing: 1.1 }}
      >
        {restDayNames[day]!.slice(0, 3)}
      </FText>
    </View>
  );
}

/** The training days, one row each: day, session and focus, exercise count. */
export function SessionDays({
  days,
  testID,
}: {
  days: SessionDay[];
  testID?: string;
}) {
  const c = useColors();
  return (
    <View testID={testID}>
      {days.map((d, i) => (
        <View
          key={d.day}
          accessible
          accessibilityLabel={`${restDayNames[d.day]}: ${d.title}${
            d.focus ? `, ${d.focus}` : ""
          }. ${exercisesText(d.exercises)}.`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            minHeight: 58,
            paddingVertical: 9,
            borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
            borderTopColor: c.cardDivider,
          }}
        >
          <DayCapsule day={d.day} />
          <View style={{ flex: 1, gap: 1 }}>
            <FText
              variant="cardTitle"
              style={{ fontSize: 15.5, lineHeight: 20 }}
            >
              {d.title}
            </FText>
            {d.focus && (
              <FText variant="label" tone="secondary">
                {d.focus}
              </FText>
            )}
          </View>
          <View
            style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}
          >
            <FText
              variant="displayLabel"
              style={{ fontSize: 22, lineHeight: 24, letterSpacing: 0 }}
            >
              {String(d.exercises)}
            </FText>
            <FText variant="label" tone="secondary">
              {d.exercises === 1 ? "exercise" : "exercises"}
            </FText>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A fixed program's phases by name, on a bar sized by their weeks: the
 * path's shape, without the efforts and volumes each phase prescribes.
 */
export function PhaseStrip({
  phases,
}: {
  phases: readonly { name: string; weeks?: number }[];
}) {
  const c = useColors();
  const fixed = phases.every((p) => (p.weeks ?? 0) > 0);
  return (
    <View testID="onboarding-phases" style={{ gap: forge.spacing.group }}>
      {fixed && (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", gap: 3 }}
        >
          {phases.map((p, i) => (
            <View
              key={`${p.name}-${i}`}
              style={{
                flex: p.weeks,
                height: 6,
                borderRadius: 3,
                backgroundColor: i % 2 ? c.emberMuted : c.emberHot,
              }}
            />
          ))}
        </View>
      )}
      <View style={{ gap: 6 }}>
        {phases.map((p, i) => (
          <FText key={`${p.name}-${i}`} variant="body">
            {p.name}
          </FText>
        ))}
      </View>
    </View>
  );
}
