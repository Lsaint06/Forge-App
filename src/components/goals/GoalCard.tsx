import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../ui";
import { FText, ForgeCard, ForgeProgress } from "../reforge";
import type { GoalView, HistoryMark } from "../../domain/goals";
import { dayTitle } from "../../domain/calendar-dates";
import { forge } from "../../theme";

/**
 * One goal at a glance (REFORGE, Phase 7.5F): what is measured, the name, the
 * latest recorded value with its basis, the target and one plain sentence. A
 * bar appears only where Goals gives a real ratio (audit section 16A); every
 * word and number is the goal engine's own.
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
  /** The detail view: every note and the habit history; the name is the header. */
  full?: boolean;
}) {
  const c = useColors();
  const good = v.status === "achieved" || (v.reached && !v.historical);
  // "82 kg · Yesterday": the value leads, its basis follows quietly.
  const [value, ...basis] = (v.current ?? "").split(" · ");
  const status =
    v.status === "achieved"
      ? "Achieved"
      : v.status === "archived"
        ? "Archived"
        : undefined;
  const body = (
    <ForgeCard gap={10}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <FText variant="overline" tone="secondary">
            {v.status === "archived" ? `${v.measure} · Archived` : v.measure}
          </FText>
          {!full && (
            <FText variant="cardTitle" weight="700" numberOfLines={2}>
              {v.name}
            </FText>
          )}
        </View>
        {status && (
          <View
            style={{
              paddingHorizontal: 10,
              minHeight: 24,
              justifyContent: "center",
              borderRadius: forge.radii.pill,
              borderWidth: forge.border.card,
              borderColor: status === "Achieved" ? c.emberMuted : c.cardBorder,
              backgroundColor:
                status === "Achieved" ? c.emberTint : c.cardRaised,
            }}
          >
            <FText
              variant="label"
              weight="600"
              tone={status === "Achieved" ? "accent" : "secondary"}
            >
              {status}
            </FText>
          </View>
        )}
      </View>
      {!!v.current && (
        <FText variant="cardMetric">
          {value}
          {basis.length > 0 && (
            <FText variant="label" tone="secondary">
              {` · ${basis.join(" · ")}`}
            </FText>
          )}
        </FText>
      )}
      <FText variant="label" tone="secondary">
        {v.targetDate
          ? `${v.target} · by ${dayTitle(v.targetDate, today)}`
          : v.target}
      </FText>
      {v.ratio !== undefined && (
        <View style={{ gap: 6 }}>
          <ForgeProgress value={v.ratio} label={v.name} />
          {v.ratioLabel && (
            <FText variant="label" tone="secondary">
              {`${Math.round(v.ratio * 100)}% · ${v.ratioLabel}`}
            </FText>
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        {good && (
          <Ionicons
            name="checkmark-circle"
            size={16}
            color={c.positive}
            style={{ marginTop: 1 }}
          />
        )}
        <FText
          variant="label"
          weight="600"
          tone={good ? "positive" : "primary"}
          style={{ flex: 1 }}
        >
          {v.state}
        </FText>
      </View>
      {(full ? v.notes : v.notes.slice(0, 1)).map((n) => (
        <FText key={n} variant="label" tone="secondary">
          {n}
        </FText>
      ))}
      {full && v.history && v.history.length > 0 && (
        <HistoryMarks marks={v.history} />
      )}
      {full && String(v.goal.data.notes ?? "").trim() !== "" && (
        <FText variant="body" tone="secondary">
          {`“${String(v.goal.data.notes).trim()}”`}
        </FText>
      )}
    </ForgeCard>
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
      >
        {body}
      </View>
    </Pressable>
  );
}

/** Recent periods of a habit goal: met, missed, or nothing logged. */
function HistoryMarks({ marks }: { marks: HistoryMark[] }) {
  const c = useColors();
  return (
    <View
      style={{
        gap: 2,
        paddingTop: 6,
        borderTopWidth: forge.border.card,
        borderTopColor: c.cardDivider,
      }}
    >
      <FText variant="overline" tone="secondary" header>
        Recent
      </FText>
      {marks.map((m) => (
        <View
          key={m.label}
          accessible
          accessibilityLabel={`${m.label}: ${m.state === "met" ? "met" : m.state === "missed" ? "not met" : "not measured"}, ${m.detail}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minHeight: 32,
          }}
        >
          <Ionicons
            name={
              m.state === "met"
                ? "checkmark-circle"
                : m.state === "missed"
                  ? "close-circle-outline"
                  : "remove-outline"
            }
            size={18}
            color={
              m.state === "met"
                ? c.positive
                : m.state === "missed"
                  ? c.text2
                  : c.text3
            }
          />
          <FText variant="body" style={{ flex: 1 }}>
            {m.label}
          </FText>
          <FText variant="label" tone="secondary">
            {m.detail}
          </FText>
        </View>
      ))}
    </View>
  );
}
