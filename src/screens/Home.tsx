import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRepo, mutate } from "../state";
import {
  Screen,
  Card,
  Txt,
  Button,
  TextButton,
  useColors,
} from "../components/ui";
import { ListRow, ListSection } from "../components/system";
import { WeeklyConsistency } from "../components/design";
import { PlanRow, planStatus } from "../components/PlanRow";
import { summary, readiness, volume } from "../domain/metrics";
import { localDate } from "../domain/types";
import { workoutTitle } from "../domain/workout-display";
import {
  dayLabel,
  longDayLabel,
  relativeDay,
  weekGoalText,
  workoutLine,
} from "../domain/training-display";
import { nextSession, startNextSession, type NextSession } from "../data/today";

type Hero = {
  overline: string;
  title: string;
  detail?: string;
  when?: string;
  action: string;
  actionLabel?: string;
};

function hero(next: NextSession, today: string): Hero {
  switch (next.kind) {
    case "active": {
      const name = next.workout.name;
      const plan = name.includes(" · ") ? name.split(" · ")[0] : undefined;
      return {
        overline: next.workout.status === "paused" ? "Paused" : "In progress",
        title: workoutTitle(name),
        detail: plan,
        action: "Resume workout",
      };
    }
    case "program":
    case "path": {
      const detail = `${next.plan} · Week ${next.week}`;
      if (next.when === "today")
        return {
          overline: "Scheduled today",
          title: next.name,
          detail,
          action: "Start workout",
        };
      if (next.when === "missed")
        return {
          overline: "Missed session",
          title: next.name,
          detail,
          when: `Originally scheduled for ${dayLabel(next.date)}`,
          action: "Start workout",
        };
      return {
        overline: "Next session",
        title: next.name,
        detail,
        when: `${next.kind === "program" ? "Suggested" : "Scheduled"} for ${relativeDay(next.date, today)}`,
        action: "Start early",
        actionLabel: `Start ${next.name} early`,
      };
    }
    case "planned":
      return next.template
        ? {
            overline: "Scheduled today",
            title: next.name,
            detail: "Workout template",
            action: "Start workout",
          }
        : {
            overline: "Scheduled today",
            title: next.name,
            detail: "This template is no longer available.",
            action: "Choose a template",
          };
    case "none":
      return {
        overline: "Nothing scheduled",
        title: "Freestyle workout",
        detail: "Log any exercises, no plan needed.",
        action: "Start workout",
      };
  }
}

function NextWorkout({
  next,
  today,
  onStart,
}: {
  next: NextSession;
  today: string;
  onStart: () => void;
}) {
  const c = useColors();
  const h = hero(next, today);
  return (
    <Card style={{ padding: 20, gap: 0 }}>
      <Txt
        variant="overline"
        tone={
          next.kind === "active" && next.workout.status !== "paused"
            ? "accent"
            : "secondary"
        }
      >
        {h.overline}
      </Txt>
      <Txt variant="title" header numberOfLines={3} style={{ marginTop: 6 }}>
        {h.title}
      </Txt>
      {h.detail && (
        <Txt tone="secondary" numberOfLines={2} style={{ marginTop: 4 }}>
          {h.detail}
        </Txt>
      )}
      {h.when && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
          }}
        >
          <Ionicons name="calendar-outline" size={16} color={c.text2} />
          <Txt variant="caption" tone="secondary" style={{ flexShrink: 1 }}>
            {h.when}
          </Txt>
        </View>
      )}
      <View style={{ marginTop: 20, gap: 4 }}>
        <Button
          title={h.action}
          icon={h.action === "Choose a template" ? undefined : "play"}
          accessibilityLabel={h.actionLabel}
          onPress={onStart}
        />
        {next.kind === "none" && (
          <TextButton
            title="Choose a Forge Path"
            onPress={() => router.push("/forge-paths")}
          />
        )}
      </View>
    </Card>
  );
}

export default function Home() {
  const r = useRepo();
  const p = r.profile();
  const today = localDate();
  const all = r.workouts();
  const next = nextSession(r, today);
  const plan = planStatus(r);
  const weekly = summary(all, (id) => r.workoutSets(id)).weekly;
  const last = all.find((w) => w.status === "completed");
  const recovery = r.journal("recovery").find((j) => j.date === today);
  useEffect(() => {
    if (!p.onboarded) router.replace("/onboarding");
  }, [p.onboarded]);
  function start() {
    if (next.kind === "planned" && !next.template) {
      router.push("/templates");
      return;
    }
    const w = mutate(() => startNextSession(r, next));
    if (w) router.push("/workout");
  }
  const score = recovery
    ? readiness({
        sleep: Number(recovery.data.sleep),
        quality: Number(recovery.data.quality),
        soreness: Number(recovery.data.soreness),
        energy: Number(recovery.data.energy),
        stress: Number(recovery.data.stress),
      }).score
    : undefined;
  return (
    <Screen title="Today" eyebrow={longDayLabel()}>
      <NextWorkout next={next} today={today} onStart={start} />
      {plan && (
        <ListSection title="Your plan">
          <PlanRow plan={plan} />
        </ListSection>
      )}
      <ListSection title="This week">
        <View style={{ padding: 16, gap: 14 }}>
          <Txt variant="headline" tabular>
            {weekGoalText(weekly, p.frequency)}
          </Txt>
          <WeeklyConsistency workouts={all} />
        </View>
      </ListSection>
      <ListSection title="Recovery">
        <ListRow
          icon="pulse-outline"
          title="Recovery check-in"
          subtitle={
            score !== undefined
              ? `Readiness ${score}/100 today`
              : "Not logged today"
          }
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "recovery" } })
          }
        />
      </ListSection>
      <ListSection title="Last session">
        {last ? (
          <ListRow
            title={workoutTitle(last.name)}
            subtitle={workoutLine(
              last,
              volume(r.workoutSets(last.id)),
              p.units,
            )}
            accessibilityLabel={`Review ${last.name}`}
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: last.id } })
            }
          />
        ) : (
          <ListRow
            title="No workouts yet"
            subtitle="Finished workouts appear here."
          />
        )}
        <ListRow
          icon="time-outline"
          title="Workout history"
          onPress={() => router.push("/history")}
        />
      </ListSection>
    </Screen>
  );
}
