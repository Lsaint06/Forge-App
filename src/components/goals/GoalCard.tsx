import React from "react";
import { Pressable, View } from "react-native";
import { Card, Txt, ProgressBar, useColors } from "../ui";
import type { GoalView, HistoryMark } from "../../domain/goals";
import { dayTitle } from "../../domain/calendar-dates";
import { theme } from "../../theme";

/**
 * One goal at a glance: what is measured, the latest recorded value with its
 * date, the target and one plain sentence. A bar appears only where the goal
 * has a real start or zero (audit section 16A).
 */
export function GoalCard({
  view: v,
  today,
  onPress,
  full = false,
}: {
  view: GoalView;
  today: string;
  onPress?: () => void;
  /** The detail view: every note and the habit history. */
  full?: boolean;
}) {
  const c = useColors();
  const reachedTone =
    v.status === "achieved" || (v.reached && !v.historical)
      ? "success"
      : "primary";
  const body = (
    <Card>
      <View style={{ gap: 2 }}>
        <Txt variant="headline" numberOfLines={full ? undefined : 2}>
          {v.name}
        </Txt>
        <Txt variant="caption" tone="secondary">
          {v.status === "archived" ? `${v.measure} · Archived` : v.measure}
        </Txt>
      </View>
      {v.current && (
        <Txt variant="metric" tabular>
          {v.current}
        </Txt>
      )}
      <Txt tone="secondary" tabular>
        {v.targetDate
          ? `${v.target} · by ${dayTitle(v.targetDate, today)}`
          : v.target}
      </Txt>
      {v.ratio !== undefined && (
        <View style={{ gap: theme.spacing.xs }}>
          <ProgressBar value={v.ratio} label={v.name} />
          {v.ratioLabel && (
            <Txt variant="caption" tone="tertiary">
              {`${Math.round(v.ratio * 100)}% · ${v.ratioLabel}`}
            </Txt>
          )}
        </View>
      )}
      <Txt weight="600" tone={reachedTone}>
        {v.state}
      </Txt>
      {(full ? v.notes : v.notes.slice(0, 1)).map((n) => (
        <Txt key={n} variant="caption" tone="secondary">
          {n}
        </Txt>
      ))}
      {full && v.history && v.history.length > 0 && (
        <HistoryMarks marks={v.history} />
      )}
      {full && String(v.goal.data.notes ?? "").trim() !== "" && (
        <Txt tone="secondary">{`“${String(v.goal.data.notes).trim()}”`}</Txt>
      )}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={v.spoken}
      accessibilityHint="Opens the goal"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ borderRadius: theme.radii.card, borderColor: c.hairline }}
      >
        {body}
      </View>
    </Pressable>
  );
}

/** Recent periods of a habit goal: met, missed, or nothing logged. */
function HistoryMarks({ marks }: { marks: HistoryMark[] }) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Txt variant="overline" tone="secondary" header>
        Recent
      </Txt>
      {marks.map((m) => (
        <View
          key={m.label}
          accessible
          accessibilityLabel={`${m.label}: ${m.state === "met" ? "met" : m.state === "missed" ? "not met" : "not measured"}, ${m.detail}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.sm,
          }}
        >
          <Txt
            weight="700"
            tone={
              m.state === "met"
                ? "success"
                : m.state === "missed"
                  ? "primary"
                  : "tertiary"
            }
          >
            {m.state === "met" ? "✓" : m.state === "missed" ? "✕" : "–"}
          </Txt>
          <Txt style={{ flex: 1 }}>{m.label}</Txt>
          <Txt tone="secondary" tabular>
            {m.detail}
          </Txt>
        </View>
      ))}
    </View>
  );
}
