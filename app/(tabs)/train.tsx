import React, { useCallback, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { Screen, Button, Txt, Sheet } from "../../src/components/ui";
import { ListRow, ListSection } from "../../src/components/system";
import { PlanRow, planStatus } from "../../src/components/PlanRow";
import { useRepo, mutate } from "../../src/state";
import { standaloneTemplates } from "../../src/data/paths";
import { libraryPrograms } from "../../src/programs";
import { volume } from "../../src/domain/metrics";
import { templateLine, workoutLine } from "../../src/domain/training-display";
import { workoutTitle } from "../../src/domain/workout-display";
import type { Template } from "../../src/domain/types";

// Train is the hub for every way to train: the current plan and the Forge
// Paths library, empty and template workouts, the exercise library and
// history. Today owns the primary call to action, so nothing here is orange.

function TemplateSheet({
  template,
  onClose,
  onDismiss,
  onStart,
  onEdit,
}: {
  template: Template | undefined;
  onClose: () => void;
  onDismiss: () => void;
  onStart: (t: Template) => void;
  onEdit: () => void;
}) {
  const r = useRepo();
  return (
    <Sheet
      visible={!!template}
      onClose={onClose}
      onDismiss={onDismiss}
      title={template?.name ?? ""}
      dismissOnBackdrop
    >
      {template && (
        <>
          <Txt tone="secondary">{templateLine(template.exercises)}</Txt>
          {!!template.notes && <Txt>{template.notes}</Txt>}
          <ListSection>
            {template.exercises.map((e, i) => (
              <ListRow
                key={`${e.exerciseId}-${i}`}
                title={r.exercise(e.exerciseId)?.name ?? "Unavailable exercise"}
                subtitle={`${e.sets} × ${e.reps}${e.repMax && e.repMax !== e.reps ? `–${e.repMax}` : ""} reps · ${e.rest}s rest`}
              />
            ))}
          </ListSection>
          <View style={{ gap: 8 }}>
            <Button
              title="Start workout"
              icon="play"
              onPress={() => onStart(template)}
            />
            <Button
              title="Edit or schedule"
              variant="secondary"
              onPress={onEdit}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

export default function Train() {
  const r = useRepo();
  const [details, setDetails] = useState<Template>();
  // Navigation chosen inside the sheet waits until it has closed: iOS cannot
  // present the workout while the sheet is still dismissing.
  const pending = useRef<(() => void) | undefined>(undefined);
  const runPending = useCallback(() => {
    const next = pending.current;
    pending.current = undefined;
    next?.();
  }, []);
  function afterSheet(action: () => void) {
    pending.current = action;
    setDetails(undefined);
    setTimeout(runPending, Platform.OS === "ios" ? 700 : 0);
  }
  const active = r.active();
  const plan = planStatus(r);
  const templates = standaloneTemplates(r);
  const history = r.workouts().filter((w) => w.status === "completed");
  const units = r.profile().units;
  function startTemplate(t: Template, fromSheet = false) {
    const w = mutate(() => r.startWorkout(t.name, t.id));
    if (fromSheet) afterSheet(() => w && router.push("/workout"));
    else if (w) router.push("/workout");
  }
  return (
    <Screen title="Train">
      <ListSection title="Plan">
        {plan && <PlanRow plan={plan} />}
        <ListRow
          icon="compass-outline"
          title="Forge Paths"
          subtitle={`${libraryPrograms().length} curated programs`}
          onPress={() => router.push("/forge-paths")}
        />
      </ListSection>
      <ListSection title="Workouts">
        {/* While a workout is in progress the banner above the tabs resumes
            it; another cannot start until it is finished. */}
        <ListRow
          icon="add-circle-outline"
          title="Empty workout"
          subtitle={
            active ? "Finish your current workout first" : "Log freely, no plan"
          }
          accessibilityLabel="Start empty workout"
          disabled={!!active}
          onPress={() => {
            const w = mutate(() => r.startWorkout());
            if (w) router.push("/workout");
          }}
        />
        {templates.slice(0, 3).map((t) => (
          <ListRow
            key={t.id}
            title={t.name}
            subtitle={templateLine(t.exercises)}
            accessibilityLabel={`${t.name} details`}
            onPress={() => setDetails(t)}
            trailing={
              <Button
                title="Start"
                variant="secondary"
                compact
                accessibilityLabel={`Start ${t.name}`}
                onPress={() => startTemplate(t)}
              />
            }
          />
        ))}
        <ListRow
          icon="copy-outline"
          title="Workout templates"
          subtitle={templates.length ? undefined : "Create your first template"}
          value={templates.length ? String(templates.length) : undefined}
          onPress={() => router.push("/templates")}
        />
      </ListSection>
      <ListSection title="Exercises">
        <ListRow
          icon="search-outline"
          title="Search exercises"
          onPress={() =>
            router.push({ pathname: "/explore", params: { search: "1" } })
          }
        />
        <ListRow
          icon="library-outline"
          title="Exercise library"
          value={String(r.exercises().length)}
          onPress={() => router.push("/explore")}
        />
        <ListRow
          icon="create-outline"
          title="Create custom exercise"
          onPress={() =>
            router.push({ pathname: "/exercise", params: { custom: "new" } })
          }
        />
      </ListSection>
      <ListSection title="History">
        {history.slice(0, 3).map((w) => (
          <ListRow
            key={w.id}
            title={workoutTitle(w.name)}
            subtitle={workoutLine(w, volume(r.workoutSets(w.id)), units)}
            accessibilityLabel={`Review ${w.name}`}
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: w.id } })
            }
          />
        ))}
        {!history.length && (
          <ListRow
            title="No workouts yet"
            subtitle="Finished workouts appear here."
          />
        )}
        <ListRow
          icon="time-outline"
          title="All history"
          value={history.length ? String(history.length) : undefined}
          onPress={() => router.push("/history")}
        />
      </ListSection>
      <TemplateSheet
        template={details}
        onClose={() => setDetails(undefined)}
        onDismiss={runPending}
        onStart={(t) => startTemplate(t, true)}
        onEdit={() => afterSheet(() => router.push("/templates"))}
      />
    </Screen>
  );
}
