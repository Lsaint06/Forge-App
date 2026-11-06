import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors, type IconName } from "../components/ui";
import {
  FText,
  ForgeCard,
  ForgeListRow,
  ForgeSubScreen,
  SectionLabel,
  SquareIconButton,
} from "../components/reforge";
import { useRepo, useApp } from "../state";
import { localDate } from "../domain/types";
import { dayDetail, type DayDetail } from "../domain/progress/consistency";
import { consistencyInput, firstActivity } from "../data/progress";
import { dayLabel } from "../domain/training-display";
import { goBack } from "../navigation";
import { forge, type Colors } from "../theme";
import {
  DAY_STATE,
  monthGrid,
  monthStart,
  monthSummary,
  monthTitle,
  sessionDescription,
  shiftMonth,
  type StateTone,
} from "./calendar/model";

// A month of training (Phase 7.2C-4, REFORGE): what was completed, skipped
// or missed, and what is planned. Program sessions aren't tied to dates, so
// only a Path or a scheduled workout can mark a day as missed. Days without
// a plan are rest. Presentation only: the day details are unchanged.

const toneColor = (c: Colors, tone: StateTone) =>
  ({
    accent: c.emberHot,
    primary: c.text,
    warning: c.warning,
    muted: c.text3,
  })[tone];

const LEGEND = (["completed", "scheduled", "missed", "skipped"] as const).map(
  (s) => DAY_STATE[s],
);

/** A non-interactive row on the selected day (planned, missed, rest…). */
function DayRow({
  icon,
  tone,
  title,
  description,
  divider,
}: {
  icon: IconName;
  tone: StateTone;
  title: string;
  description: string;
  divider: boolean;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${description}`}
      style={{
        minHeight: 56,
        paddingHorizontal: forge.spacing.cardPadding,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.group,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={toneColor(c, tone)}
        style={{ width: 26 }}
      />
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: 10,
          rowGap: 2,
        }}
      >
        <FText variant="cardTitle" weight="700">
          {title}
        </FText>
        <FText variant="label" tone="secondary">
          {description}
        </FText>
      </View>
    </View>
  );
}

export default function TrainingCalendar() {
  const r = useRepo();
  const c = useColors();
  const revision = useApp((s) => s.revision);
  const today = localDate();
  // The repository is mutable; `revision` changes whenever stored data does.
  const input = useMemo(
    () => consistencyInput(r, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, revision, today],
  );
  const [month, setMonth] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const first = monthStart(firstActivity(input) ?? today);
  const last = shiftMonth(monthStart(today), 2);
  const days = monthGrid(month);
  const details = new Map(days.map((d) => [d, dayDetail(input, d)]));
  const day: DayDetail = details.get(selected) ?? dayDetail(input, selected);
  const go = (by: number) => {
    const m = shiftMonth(month, by);
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };
  const open = day.sessions.filter((s) => s.state !== "completed");
  const spacer = <View style={{ width: forge.heights.compact }} />;
  return (
    <ForgeSubScreen
      title="Training calendar"
      onBack={() => goBack("/(tabs)/train")}
    >
      <ForgeCard gap={forge.spacing.group}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.tight,
          }}
        >
          {month > first ? (
            <SquareIconButton
              icon="chevron-back"
              label="Previous month"
              onPress={() => go(-1)}
            />
          ) : (
            spacer
          )}
          <FText
            variant="displayLabel"
            header
            align="center"
            numberOfLines={1}
            fit
            style={{ flex: 1 }}
          >
            {monthTitle(month)}
          </FText>
          {month < last ? (
            <SquareIconButton
              icon="chevron-forward"
              label="Next month"
              onPress={() => go(1)}
            />
          ) : (
            spacer
          )}
        </View>
        {/* Seven columns use half the card's inset, as in the Path week. */}
        <View style={{ marginHorizontal: -8, gap: 2 }}>
          <View
            style={{ flexDirection: "row" }}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <FText
                key={i}
                variant="statMetric"
                tone="secondary"
                align="center"
                weight="700"
                style={{
                  flex: 1,
                  fontSize: 11,
                  lineHeight: 14,
                  letterSpacing: 0.6,
                }}
              >
                {d}
              </FText>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {days.map((d) => {
              const detail = details.get(d)!;
              const state = DAY_STATE[detail.status];
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              const isToday = d === today;
              const isSelected = d === selected;
              return (
                <Pressable
                  key={d}
                  testID="calendar-day"
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(d)}${isToday ? ", today" : ""}: ${state.spoken}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(d)}
                  style={({ pressed }) => ({
                    width: `${100 / 7}%`,
                    minHeight: 56,
                    paddingVertical: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    borderRadius: forge.radii.tile,
                    borderWidth: forge.border.active,
                    borderColor: isSelected ? c.emberHot : "transparent",
                    backgroundColor: isSelected
                      ? c.emberTint
                      : pressed
                        ? c.cardRaised
                        : "transparent",
                    opacity: inMonth ? 1 : 0.35,
                  })}
                >
                  <FText
                    variant="statMetric"
                    tone={isToday ? "accent" : "primary"}
                    weight={isToday ? "800" : "600"}
                    style={{ fontSize: 17, lineHeight: 22 }}
                  >
                    {String(Number(d.slice(-2)))}
                  </FText>
                  {detail.status === "rest" ? (
                    <View style={{ height: 12 }} />
                  ) : (
                    <Ionicons
                      testID={`calendar-mark-${detail.status}`}
                      name={state.icon}
                      size={12}
                      color={toneColor(c, state.tone)}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
        <View
          accessible
          accessibilityLabel={`Key: ${LEGEND.map((s) => s.label).join(", ")}. Unmarked days are rest days.`}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: 14,
            rowGap: 6,
            paddingTop: forge.spacing.group,
            borderTopWidth: forge.border.card,
            borderTopColor: c.cardDivider,
          }}
        >
          {LEGEND.map((s) => (
            <View
              key={s.label}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ionicons name={s.icon} size={12} color={toneColor(c, s.tone)} />
              <FText variant="label" tone="secondary">
                {s.label}
              </FText>
            </View>
          ))}
          <FText variant="label" tone="secondary">
            No mark · Rest
          </FText>
        </View>
        <FText variant="label">
          {monthSummary(month, [...details.values()])}
        </FText>
      </ForgeCard>
      <SectionLabel
        title={dayLabel(day.date)}
        trailing={
          day.date === today ? (
            <FText variant="overline" tone="accent">
              Today
            </FText>
          ) : undefined
        }
      />
      <ForgeCard padding={0} gap={0}>
        {day.workouts.map((w, i) => (
          <ForgeListRow
            key={w.workoutId}
            icon="checkmark-circle"
            title={w.name}
            description="Completed"
            accessibilityLabel={`Review ${w.name}`}
            divider={i > 0}
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: w.workoutId } })
            }
          />
        ))}
        {open.map((s, i) => (
          <DayRow
            key={`${s.name}-${i}`}
            icon={DAY_STATE[s.state].icon}
            tone={DAY_STATE[s.state].tone}
            title={s.name}
            description={sessionDescription(s.state, s.source)}
            divider={day.workouts.length + i > 0}
          />
        ))}
        {!day.workouts.length && !open.length && (
          <DayRow
            icon="moon-outline"
            tone="muted"
            title="Rest day"
            description={
              day.date > today ? "Nothing planned" : "No workout logged"
            }
            divider={false}
          />
        )}
      </ForgeCard>
      <ForgeCard padding={0} gap={0}>
        <ForgeListRow
          icon="time-outline"
          title="Training history"
          description="Review, edit or repeat"
          onPress={() => router.push("/history")}
        />
      </ForgeCard>
    </ForgeSubScreen>
  );
}
