import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Txt, useColors, IconButton } from "../components/ui";
import { ListRow, ListSection } from "../components/system";
import { Legend } from "../components/charts";
import { useRepo, useApp } from "../state";
import { localDate } from "../domain/types";
import { addDays } from "../domain/paths/model";
import {
  dayDetail,
  type DayDetail,
  type DayStatus,
} from "../domain/progress/consistency";
import { mondayOf } from "../domain/progress/range";
import { consistencyInput, firstActivity } from "../data/progress";
import { dayLabel } from "../domain/training-display";
import { goBack } from "../navigation";

// A month of training: what was completed, skipped or missed, and what is
// planned. Program sessions aren't tied to dates, so only a Path or a
// scheduled workout can mark a day as missed. Days without a plan are rest.

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
function shiftMonth(month: string, by: number) {
  const d = new Date(`${month}T12:00:00`);
  d.setMonth(d.getMonth() + by, 1);
  return localDate(d.getTime());
}
const monthTitle = (month: string) =>
  new Date(`${month}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
const statusLabel: Record<DayStatus, string> = {
  completed: "workout completed",
  missed: "planned session missed",
  skipped: "session skipped",
  scheduled: "session planned",
  rest: "rest day",
};
const sessionState: Record<string, string> = {
  completed: "Completed",
  skipped: "Skipped",
  missed: "Missed",
  scheduled: "Planned",
};

function Marker({ status }: { status: DayStatus }) {
  const c = useColors();
  if (status === "completed")
    return (
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: c.success,
        }}
      />
    );
  if (status === "missed")
    return (
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: c.warning,
        }}
      />
    );
  if (status === "skipped")
    return <Ionicons name="play-skip-forward" size={9} color={c.text3} />;
  if (status === "scheduled")
    return (
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: c.text2,
        }}
      />
    );
  return <View style={{ height: 8 }} />;
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
  const gridStart = mondayOf(month);
  const nextMonth = shiftMonth(month, 1);
  const days: string[] = [];
  for (let d = gridStart; d < nextMonth || days.length % 7; d = addDays(d, 1))
    days.push(d);
  const details = new Map(days.map((d) => [d, dayDetail(input, d)]));
  // Exact counts for the days of this month.
  const monthDays = days
    .filter((d) => d.slice(0, 7) === month.slice(0, 7))
    .map((d) => details.get(d)!);
  const count = (state: string) =>
    monthDays.reduce(
      (n, d) => n + d.sessions.filter((s) => s.state === state).length,
      0,
    );
  const totals = {
    completed: monthDays.reduce((n, d) => n + d.workouts.length, 0),
    skipped: count("skipped"),
    missed: count("missed"),
  };
  const day: DayDetail = details.get(selected) ?? dayDetail(input, selected);
  const go = (by: number) => {
    const m = shiftMonth(month, by);
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };
  return (
    <Screen
      title="Calendar"
      eyebrow="Training"
      onBack={() => goBack("/(tabs)/progress")}
    >
      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {month > first ? (
            <IconButton
              icon="chevron-back"
              label="Previous month"
              onPress={() => go(-1)}
              tone="primary"
            />
          ) : (
            <View style={{ width: 44 }} />
          )}
          <Txt variant="headline" header>
            {monthTitle(month)}
          </Txt>
          {month < last ? (
            <IconButton
              icon="chevron-forward"
              label="Next month"
              onPress={() => go(1)}
              tone="primary"
            />
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>
        <View style={{ flexDirection: "row" }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <Txt
              key={i}
              variant="caption"
              tone="tertiary"
              align="center"
              style={{ flex: 1 }}
            >
              {d}
            </Txt>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {days.map((d) => {
            const detail = details.get(d)!;
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            const isToday = d === today;
            const isSelected = d === selected;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(d)}${isToday ? ", today" : ""}: ${statusLabel[detail.status]}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelected(d)}
                style={{
                  width: `${100 / 7}%`,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  borderRadius: 10,
                  backgroundColor: isSelected ? c.surfaceRaised : "transparent",
                  opacity: inMonth ? 1 : 0.35,
                }}
              >
                <Txt
                  variant="body"
                  tabular
                  weight={isToday ? "800" : "500"}
                  tone={isToday ? "primary" : "secondary"}
                >
                  {String(Number(d.slice(-2)))}
                </Txt>
                <Marker status={detail.status} />
              </Pressable>
            );
          })}
        </View>
        <Legend
          items={[
            { label: "Completed", color: c.success },
            { label: "Planned", color: c.text2, outline: true },
            { label: "Missed", color: c.warning, outline: true },
          ]}
        />
        <Txt variant="caption" tone="secondary">
          {[
            `${totals.completed} ${totals.completed === 1 ? "workout" : "workouts"} this month`,
            ...(totals.skipped ? [`${totals.skipped} skipped`] : []),
            ...(totals.missed ? [`${totals.missed} missed`] : []),
          ].join(" · ")}
        </Txt>
      </Card>
      <ListSection title={dayLabel(day.date)}>
        {day.workouts.map((w) => (
          <ListRow
            key={w.workoutId}
            icon="checkmark-circle-outline"
            title={w.name}
            subtitle="Completed"
            accessibilityLabel={`Review ${w.name}`}
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: w.workoutId } })
            }
          />
        ))}
        {day.sessions
          .filter((s) => s.state !== "completed")
          .map((s, i) => (
            <ListRow
              key={`${s.name}-${i}`}
              icon={
                s.state === "missed"
                  ? "alert-circle-outline"
                  : s.state === "skipped"
                    ? "play-skip-forward-outline"
                    : "calendar-outline"
              }
              title={s.name}
              subtitle={`${sessionState[s.state]}${s.source === "program" ? " · program" : s.source === "path" ? " · Path" : ""}`}
            />
          ))}
        {!day.workouts.length &&
          !day.sessions.filter((s) => s.state !== "completed").length && (
            <ListRow
              icon="moon-outline"
              title="Rest day"
              subtitle={
                day.date > today ? "Nothing planned" : "No workout logged"
              }
            />
          )}
      </ListSection>
    </Screen>
  );
}
