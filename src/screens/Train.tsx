import React, { useState } from "react";
import { router } from "expo-router";
import { useRepo, mutate } from "../state";
import { BadgePill, FText, ForgeScreen } from "../components/reforge";
import { useAfterSheet } from "../components/system";
import { planStatus } from "../components/PlanRow";
import { standaloneTemplates } from "../data/paths";
import { startNextSession } from "../data/today";
import { libraryPrograms } from "../programs";
import { summary } from "../domain/metrics";
import { localDate, type Template } from "../domain/types";
import { blockIfTraining } from "../startGuard";
import { templateOrder, trainHero, type PlanNext } from "./train/model";
import {
  StartWorkoutCard,
  TemplateSheet,
  TrainHeroCard,
  TrainingTools,
} from "./train/sections";

// Train (Phase 7.2B, REFORGE): one hero for what to do next (resume the
// workout in progress, continue the plan, or find a Forge Path), then
// Start a workout (empty or a saved template) and Training tools. History
// lives in You; Home and Progress keep their links to it.

export default function Train() {
  const r = useRepo();
  const [details, setDetails] = useState<Template>();
  // Navigation chosen inside the sheet waits until it has closed: iOS cannot
  // present the workout while the sheet is still dismissing.
  const sheet = useAfterSheet();
  const afterSheet = (action: () => void) =>
    sheet.after(() => setDetails(undefined), action);
  const today = localDate();
  const active = r.active();
  const programs = libraryPrograms().length;
  const hero = trainHero(r, today, programs);
  const workouts = r.workouts();
  const streak = summary(workouts, (id) => r.workoutSets(id)).streak;
  const templates = standaloneTemplates(r);
  const shortcuts = templateOrder(templates, workouts).slice(0, 3);
  function startTemplate(t: Template, fromSheet = false) {
    if (blockIfTraining(r)) return;
    const w = mutate(() => r.startWorkout(t.name, t.id));
    if (fromSheet) afterSheet(() => w && router.push("/workout"));
    else if (w) router.push("/workout");
  }
  function startPlan(next: PlanNext) {
    // The same guarded start as Home: programs and Paths keep their rules.
    const w = mutate(() => startNextSession(r, next));
    if (w) router.push("/workout");
  }
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
      <FText variant="screenTitle" header style={{ marginTop: 8 }}>
        Train
      </FText>
      <TrainHeroCard
        hero={hero}
        today={today}
        onResume={() => router.push("/workout")}
        onStart={startPlan}
        onOpenPlan={() => planStatus(r)?.open()}
        onBrowse={() => router.push("/forge-paths")}
      />
      <StartWorkoutCard
        training={!!active}
        templates={shortcuts}
        total={templates.length}
        onEmpty={() => {
          const w = mutate(() => r.startWorkout());
          if (w) router.push("/workout");
        }}
        onDetails={setDetails}
        onStartTemplate={(t) => startTemplate(t)}
        onAllTemplates={() => router.push("/templates")}
      />
      <TrainingTools
        programs={programs}
        exercises={r.exercises().length}
        onPaths={() => router.push("/forge-paths")}
        onLibrary={() => router.push("/explore")}
        onCalendar={() => router.push("/calendar")}
      />
      <TemplateSheet
        template={details}
        onClose={() => setDetails(undefined)}
        onDismiss={sheet.onDismiss}
        onStart={(t) => startTemplate(t, true)}
        onResume={
          active ? () => afterSheet(() => router.push("/workout")) : undefined
        }
        onEdit={() =>
          afterSheet(
            () =>
              details &&
              router.push({
                pathname: "/templates",
                params: { edit: details.id },
              }),
          )
        }
      />
    </ForgeScreen>
  );
}
