import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Card, Txt, TextButton, ProgressBar, textWidth } from "../ui";
import { gramsText, type Totals } from "../../domain/nutrition";
import type { Profile } from "../../domain/types";
import { theme } from "../../theme";

const whole = (n: number) => Math.round(n).toLocaleString();

/**
 * The day's intake. Against targets only when they are the lifter's own;
 * suggested defaults are never presented as personal targets.
 */
export function MacroSummary({
  totals,
  targets,
  personalized,
  onSetTargets,
}: {
  totals: Totals;
  targets: Pick<Profile, "calories" | "protein" | "carbs" | "fat">;
  personalized: boolean;
  onSetTargets: () => void;
}) {
  const kcal = Math.round(totals.calories);
  const goal = targets.calories;
  const showGoal = personalized && goal > 0;
  // From the shown total, so "eaten + left" always adds up to the target.
  const remaining = Math.round(goal) - kcal;
  const macros = [
    ["Protein", totals.protein, targets.protein],
    ["Carbs", totals.carbs, targets.carbs],
    ["Fat", totals.fat, targets.fat],
  ] as const;
  // Three columns while every label fits its column on one line; otherwise
  // one macro per row, so "PROTEIN" never breaks and nothing shrinks.
  const window = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState<number>();
  const fontScale = window.fontScale || 1;
  const column =
    ((rowWidth ??
      window.width - 2 * theme.spacing.screen - 2 * theme.spacing.md) -
      2 * theme.spacing.md) /
    3;
  const rows = macros.some(
    ([label]) => textWidth(label.toUpperCase(), 11, fontScale, 1.6) > column,
  );
  return (
    <Card>
      <View
        accessible
        accessibilityLabel={
          showGoal
            ? `${whole(kcal)} of ${whole(goal)} calories, ${remaining >= 0 ? `${whole(remaining)} left` : `${whole(-remaining)} over`}`
            : `${whole(kcal)} calories eaten`
        }
        style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}
      >
        <Txt variant="metric">{whole(kcal)}</Txt>
        <Txt tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
          {showGoal ? `of ${whole(goal)} kcal` : "kcal"}
        </Txt>
        {showGoal && (
          <Txt tone="secondary" tabular numberOfLines={1}>
            {remaining >= 0
              ? `${whole(remaining)} left`
              : `${whole(-remaining)} over`}
          </Txt>
        )}
      </View>
      {showGoal && (
        <ProgressBar value={totals.calories / goal} label="Calories" />
      )}
      <View
        onLayout={(e) => setRowWidth(Math.round(e.nativeEvent.layout.width))}
        style={{
          flexDirection: rows ? "column" : "row",
          gap: theme.spacing.md,
        }}
      >
        {macros.map(([label, value, target]) => {
          const against = personalized && target > 0;
          return (
            <View
              key={label}
              accessible
              accessibilityLabel={
                against
                  ? `${label} ${gramsText(value)} of ${gramsText(target)}`
                  : `${label} ${gramsText(value)}`
              }
              style={rows ? { gap: 4 } : { flex: 1, gap: 4 }}
            >
              <Txt variant="overline" tone="secondary">
                {label}
              </Txt>
              <Txt tabular numberOfLines={rows ? undefined : 1} fit={!rows}>
                {gramsText(value)}
              </Txt>
              {against && (
                <>
                  <Txt
                    variant="caption"
                    tone="secondary"
                    numberOfLines={rows ? undefined : 1}
                    fit={!rows}
                  >
                    {`of ${gramsText(target)}`}
                  </Txt>
                  <ProgressBar value={value / target} label={label} />
                </>
              )}
            </View>
          );
        })}
      </View>
      {!personalized && (
        <View style={{ alignItems: "flex-start", marginLeft: -8 }}>
          <TextButton
            title="Set your daily targets"
            icon="flag-outline"
            onPress={onSetTargets}
          />
        </View>
      )}
    </Card>
  );
}
