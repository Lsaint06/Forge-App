import React from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useRepo, mutate } from "../state";
import { BadgePill, ForgeScreen, pairFits } from "../components/reforge";
import type { MenuAction } from "../components/system";
import { planStatus } from "../components/PlanRow";
import { summary, volume, kgToLb } from "../domain/metrics";
import { onDay, type Checkin } from "../domain/checkins";
import { workoutTitle } from "../domain/workout-display";
import { dayTitle } from "../domain/calendar-dates";
import {
  dayLabel,
  longDayLabel,
  relativeDay,
  weekGoalText,
  workoutLine,
} from "../domain/training-display";
import {
  TARGETS_SAVED,
  entriesOn,
  targetsPersonalized,
  totalsOf,
} from "../domain/nutrition";
import { evaluate, type Goal } from "../domain/goals";
import { goalSources } from "../data/goal-sources";
import { nextSession, startNextSession, type NextSession } from "../data/today";
import { forge } from "../theme";
import {
  bodyweight,
  greeting,
  homeClock,
  nextTarget,
  planContext,
  sessionFacts,
  weekDays,
} from "./home/model";
import {
  LastSessionCard,
  NextTargetCard,
  NutritionToday,
  ProgressSnapshot,
  RecoveryStrip,
  SessionHero,
  TitleBlock,
  type HeroContent,
} from "./home/sections";

// Home (Phase 7.1B, REFORGE): the approved Home reference built from real
// data. Brand header and day streak; greeting, date and plan week; today's
// recovery check-in; the next session; progress and nutrition snapshots; the
// next goal target; then the last session and history. Session choice and
// starting are unchanged (data/today.ts).

function hero(next: NextSession, today: string): HeroContent {
  switch (next.kind) {
    case "active": {
      const name = next.workout.name;
      const plan = name.includes(" · ") ? name.split(" · ")[0] : undefined;
      const paused = next.workout.status === "paused";
      return {
        overline: paused ? "Paused" : "In progress",
        accent: !paused,
        title: workoutTitle(name),
        detail: plan,
        action: "Resume workout",
        actionIcon: "play",
      };
    }
    case "program":
    case "path": {
      const detail = `${next.plan} · Week ${next.week}`;
      if (next.when === "today")
        return {
          overline: "Today's session",
          accent: true,
          title: next.name,
          detail,
          action: "Start workout",
          actionIcon: "play",
        };
      if (next.when === "missed")
        return {
          overline: "Missed session",
          accent: true,
          title: next.name,
          detail,
          when: `Originally scheduled for ${dayLabel(next.date)}`,
          action: "Start workout",
          actionIcon: "play",
        };
      return {
        overline: "Next session",
        accent: false,
        title: next.name,
        detail,
        when: `${next.kind === "program" ? "Suggested" : "Scheduled"} for ${relativeDay(next.date, today)}`,
        action: "Start early",
        actionLabel: `Start ${next.name} early`,
        actionIcon: "play",
      };
    }
    case "planned":
      return next.template
        ? {
            overline: "Today's session",
            accent: true,
            title: next.name,
            detail: "Workout template",
            action: "Start workout",
            actionIcon: "play",
          }
        : {
            overline: "Today's session",
            accent: true,
            title: next.name,
            detail: "This template is no longer available.",
            action: "Choose a template",
          };
    case "none":
      return {
        overline: "Nothing scheduled",
        accent: false,
        title: "Freestyle workout",
        detail: "Log any exercises, no plan needed.",
        action: "Start workout",
        actionIcon: "play",
      };
  }
}

export default function Home() {
  const r = useRepo();
  const p = r.profile();
  const { width, fontScale } = useWindowDimensions();
  const { now, today, hour } = homeClock();
  const all = r.workouts();
  const next = nextSession(r, today);
  const plan = planStatus(r);
  const context = plan ? planContext(r, today) : undefined;
  const lifetime = summary(all, (id) => r.workoutSets(id), now);
  const last = all.find((w) => w.status === "completed");
  const recovery = onDay(r.journal("recovery") as Checkin[], today)[0];
  const weight = bodyweight(r.journal("measurement"), p);
  const nutrition = totalsOf(entriesOn(r.journal("nutrition"), today));
  const personalized = targetsPersonalized(p, r.setting(TARGETS_SAVED) === "1");
  const sources = goalSources(r, today, p.units);
  const goal = nextTarget(
    (r.journal("goal") as Goal[]).map((g) => evaluate(g, sources)),
  );
  function start() {
    if (next.kind === "planned" && !next.template) {
      router.push("/templates");
      return;
    }
    const w = mutate(() => startNextSession(r, next));
    if (w) router.push("/workout");
  }
  // Session options are existing destinations only.
  const menu: MenuAction[] = [
    ...(plan
      ? [
          {
            label:
              plan.kind === "program" ? "Open your program" : "Open your Path",
            icon: "trail-sign-outline" as const,
            onPress: plan.open,
          },
        ]
      : []),
    {
      label: "Forge Paths",
      icon: "compass-outline",
      onPress: () => router.push("/forge-paths"),
    },
    {
      label: "Workout templates",
      icon: "copy-outline",
      onPress: () => router.push("/templates"),
    },
    {
      label: "Training calendar",
      icon: "calendar-outline",
      onPress: () => router.push("/calendar"),
    },
  ];
  const content = width - 2 * forge.spacing.margin;
  const pair = pairFits(content, fontScale, 170);
  const roomy = content >= 340 && fontScale <= 1.2;
  return (
    <ForgeScreen
      brand={
        <BadgePill
          icon="flame"
          value={String(lifetime.streak)}
          accessibilityLabel={`${lifetime.streak} day streak. Open progress`}
          onPress={() => router.navigate("/(tabs)/progress")}
        />
      }
    >
      <TitleBlock
        greeting={greeting(p.name, hour)}
        date={dayLabel(today)}
        spokenDate={longDayLabel(now)}
        plan={
          plan
            ? {
                text: context
                  ? `Week ${context.week} · ${context.phase}`
                  : plan.title,
                label: `${plan.kind === "program" ? "Your program" : "Your Path"}: ${plan.title}`,
                open: plan.open,
              }
            : undefined
        }
      />
      <RecoveryStrip checkin={recovery} />
      <SessionHero
        hero={hero(next, today)}
        facts={sessionFacts(r, next, today)}
        roomy={roomy}
        menu={menu}
        onStart={start}
        choosePath={
          next.kind === "none" ? () => router.push("/forge-paths") : undefined
        }
      />
      <View
        style={{
          flexDirection: pair ? "row" : "column",
          alignItems: pair ? "stretch" : undefined,
          gap: forge.spacing.cardGap,
        }}
      >
        <ProgressSnapshot
          style={pair ? { flex: 1.6 } : undefined}
          weight={
            weight && {
              value: weight.value,
              unit: weight.unit,
              when: weight.date
                ? dayTitle(weight.date, today)
                : "From your profile",
            }
          }
          volume={
            p.units === "lb"
              ? kgToLb(lifetime.weeklyVolume)
              : lifetime.weeklyVolume
          }
          units={p.units}
          streak={lifetime.streak}
          week={weekGoalText(lifetime.weekly, p.frequency)}
          days={weekDays(all, now)}
        />
        <NutritionToday
          style={pair ? { flex: 1 } : undefined}
          totals={nutrition}
          targets={p}
          personalized={personalized}
          ring={pair ? 88 : 104}
          row={!pair}
        />
      </View>
      <NextTargetCard goal={goal} />
      <LastSessionCard
        last={
          last && {
            name: last.name,
            title: workoutTitle(last.name),
            line: workoutLine(last, volume(r.workoutSets(last.id)), p.units),
            open: () =>
              router.push({ pathname: "/workout", params: { id: last.id } }),
          }
        }
      />
    </ForgeScreen>
  );
}
