import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { planStatus } from "../components/PlanRow";
import { libraryPrograms } from "../programs";
import { useRepo, useApp } from "../state";
import {
  experienceLevel,
  missingTrainingProfile,
  trainingGoal,
} from "../domain/profile";
import { summary } from "../domain/metrics";
import { evaluate, type Goal } from "../domain/goals";
import { goalSources } from "../data/goal-sources";
import {
  bodyweightSource,
  heightText,
  weeksConsistent,
} from "../domain/presentation/you";
import { localDate } from "../domain/types";
import {
  BadgePill,
  ForgeCard,
  ForgeListRow,
  ForgeScreen,
  SectionLabel,
} from "../components/reforge";
import { planOverview } from "./train/model";
import { bodyweight, nextTarget } from "./home/model";
import {
  AthleteHeader,
  MyStats,
  PerformanceStrip,
  PlanCard,
  PrimaryGoal,
  ProfilePrompt,
} from "./you/sections";
import { EditorSheet, isEditor, type Editor } from "./you/editors";
import { cloudConfigured, plural } from "./you/account";
import {
  displayName,
  experienceText,
  focusText,
  trainingSince,
} from "./you/model";
import { forge } from "../theme";

// You (REFORGE, Phases 7.5B–D): the athlete's identity and current plan,
// the performance strip, primary goal and My stats, then one Tools &
// settings card. Preferences (7.5D) and Account & privacy hold the settings
// and data actions that used to be listed here; Edit profile, Training focus
// and the `?edit=` links still open their focused editors on this tab.

const listText = (items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export default function You() {
  const r = useRepo();
  const revision = useApp((s) => s.revision);
  const params = useLocalSearchParams<{ edit?: string }>();
  const p = r.profile();
  const [editor, setEditor] = useState<Editor>();
  // Opens an editor requested by a link (e.g. Library's "Complete training
  // profile"), once per request.
  const [handled, setHandled] = useState<string>();
  if (params.edit !== handled) {
    setHandled(params.edit);
    if (isEditor(params.edit)) setEditor(params.edit);
  }
  useEffect(() => {
    if (params.edit) router.setParams({ edit: undefined });
  }, [params.edit]);
  const goal = trainingGoal(p);
  const experience = experienceLevel(p);
  const missing = missingTrainingProfile(p);
  const plan = planStatus(r);
  const today = localDate();
  const overview = planOverview(r, today);
  // The repository is mutable; `revision` changes whenever stored data does,
  // so these are worked out once per data change (or new day).
  // Lifetime figures: the shared summary (workouts completed and the day
  // streak, as Home, Nutrition and Progress show them) and weeks consistent.
  const training = useMemo(
    () => {
      const all = r.workouts();
      const life = summary(all, (id) => r.workoutSets(id));
      return {
        count: life.count,
        streak: life.streak,
        weeks: weeksConsistent(all, today),
        first: all
          .filter((w) => w.status === "completed")
          .reduce<number | undefined>(
            (t, w) => Math.min(t ?? Infinity, w.finishedAt ?? w.startedAt),
            undefined,
          ),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, revision, today],
  );
  const streak = training.streak;
  // Home's next target, from the same goal evaluation.
  const goals = useMemo(
    () => {
      const sources = goalSources(r, today, p.units);
      const views = (r.journal("goal") as Goal[]).map((g) =>
        evaluate(g, sources),
      );
      return {
        primary: nextTarget(views),
        active: views.filter((v) => v.status === "active").length,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, revision, today, p.units],
  );
  // The latest weigh-in, else the profile weight (as Home shows it).
  const weight = bodyweight(r.journal("measurement"), p);
  const height = heightText(p.height, p.units);
  const cloud = cloudConfigured();
  const pending = r.outbox().length;
  const journal = (kind: string) =>
    router.push({ pathname: "/journal", params: { kind } });
  // Every personal tool and setting, once. Training history is the
  // performance strip's own row just above, so it isn't repeated here.
  const tools = [
    {
      icon: "flag-outline" as const,
      title: "Goals",
      description: "Set and track your targets",
      onPress: () => journal("goal"),
    },
    {
      icon: "body-outline" as const,
      title: "Body measurements",
      description: "Weigh-ins and tape measurements",
      onPress: () => journal("measurement"),
    },
    {
      icon: "pulse-outline" as const,
      title: "Recovery",
      description: "Sleep, energy and soreness check-ins",
      onPress: () => journal("recovery"),
    },
    {
      icon: "options-outline" as const,
      title: "Preferences",
      description: "Training, nutrition, units, appearance and reminders",
      onPress: () => router.push("/preferences"),
    },
    {
      icon: "shield-checkmark-outline" as const,
      title: "Account & privacy",
      description: cloud
        ? pending
          ? `${plural(pending, "change")} waiting to sync`
          : "Sync, backups, privacy and membership"
        : "Guest mode · backups, privacy and membership",
      onPress: () => router.push("/account"),
    },
  ];
  return (
    <ForgeScreen
      brand={
        <BadgePill
          icon="flame"
          value={String(streak)}
          accessibilityLabel={`${streak} day streak. Open progress`}
          onPress={() => router.navigate("/(tabs)/progress")}
        />
      }
    >
      <AthleteHeader
        name={displayName(p.name)}
        experience={experienceText(experience)}
        focus={focusText(goal)}
        since={trainingSince(training.first)}
        onEdit={() => setEditor("profile")}
        onSetFocus={() => setEditor("focus")}
      />
      <PlanCard
        plan={overview}
        today={today}
        programs={libraryPrograms().length}
        onOpen={() => plan?.open()}
      />
      {p.onboarded && missing.length > 0 && (
        <ProfilePrompt
          missing={listText(
            missing.map((m) => (m === "restDay" ? "rest day" : m)),
          )}
          onPress={() => setEditor("focus")}
        />
      )}
      <PerformanceStrip
        workouts={training.count}
        streak={streak}
        weeks={training.weeks}
        onHistory={() => router.push("/history")}
      />
      <PrimaryGoal
        goal={goals.primary}
        active={goals.active}
        onOpen={() => journal("goal")}
      />
      <MyStats
        bodyweight={
          weight && {
            value: weight.value.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            }),
            unit: weight.unit,
            source: bodyweightSource(weight.date, today),
          }
        }
        height={height && { ...height, source: "From your profile" }}
        onMeasurements={() => journal("measurement")}
      />
      <View style={{ gap: forge.spacing.tight, marginTop: 6 }}>
        <SectionLabel title="Tools & settings" />
        <ForgeCard padding={0} gap={0} testID="you-tools">
          {tools.map((t, i) => (
            <ForgeListRow key={t.title} {...t} divider={i > 0} />
          ))}
        </ForgeCard>
      </View>
      <EditorSheet editor={editor} onClose={() => setEditor(undefined)} />
    </ForgeScreen>
  );
}
