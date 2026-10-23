import React, { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Alert } from "../src/platform/alert";
import { Screen, Button, Txt, Empty } from "../src/components/ui";
import { ListRow, ListSection, OverflowMenu } from "../src/components/system";
import { TemplateEditor } from "../src/components/TemplateEditor";
import { DateSheet } from "../src/components/DateSheet";
import { useRepo, mutate, confirm } from "../src/state";
import { localDate, type Journal, type Template } from "../src/domain/types";
import {
  visibleSchedules,
  startScheduledSession,
  standaloneTemplates,
} from "../src/data/paths";
import { notifyAt } from "../src/notifications";
import { workoutTitle } from "../src/domain/workout-display";
import {
  dayLabel,
  relativeDay,
  templateLine,
} from "../src/domain/training-display";
import { exerciseNames } from "../src/domain/templates";
import {
  blockIfTraining,
  otherWorkout,
  resumeWorkout,
} from "../src/startGuard";
import { goBack } from "../src/navigation";

// Workout templates: the lifter's own workouts, ready to start, edit or
// schedule, and the sessions already planned. Start is the one action on
// each row; everything else lives in its ••• menu.

/** "Today", "Tomorrow", "Thu, Oct 24", or "Past · Mon, Oct 20". */
function whenText(date: string, today: string) {
  if (date < today) return `Past · ${dayLabel(date)}`;
  const day = relativeDay(date, today);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export default function Templates() {
  const r = useRepo();
  const params = useLocalSearchParams<{ edit?: string }>();
  const [editing, setEditing] = useState<{ template?: Template }>();
  const [scheduling, setScheduling] = useState<Template>();
  const today = localDate();
  const active = r.active();
  const templates = standaloneTemplates(r);
  const planned = visibleSchedules(r)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);

  // Train's template sheet links straight to its editor, once per link.
  const [handled, setHandled] = useState<string>();
  if (params.edit && params.edit !== handled) {
    setHandled(params.edit);
    const t = r.templates().find((x) => x.id === params.edit);
    if (t) setEditing({ template: t });
  }

  function start(t: Template) {
    if (blockIfTraining(r)) return;
    const w = mutate(() => r.startWorkout(t.name, t.id));
    if (w) router.push("/workout");
  }
  function schedule(t: Template, date: string) {
    // The same planned-session record as before: name, template and day.
    const entry = mutate(() =>
      r.addJournal("schedule", { name: t.name, templateId: t.id }, date),
    );
    setScheduling(undefined);
    if (!entry) return;
    Alert.alert("Scheduled", `${t.name} · ${dayLabel(date)}`);
    void notifyAt(
      "Planned workout",
      t.name,
      new Date(`${date}T09:00:00`).getTime(),
    ).catch((e) => Alert.alert("Reminder unavailable", String(e)));
  }
  function startPlanned(j: Journal) {
    if (blockIfTraining(r, String(j.data.workoutId ?? ""))) return;
    const w = mutate(() => startScheduledSession(r, j));
    if (w) router.push("/workout");
  }

  return (
    <Screen
      title="Workout templates"
      eyebrow={
        templates.length
          ? `${templates.length} ${templates.length === 1 ? "template" : "templates"}`
          : undefined
      }
      onBack={() => goBack("/(tabs)/train")}
      footer={
        <Button
          title="Create template"
          icon="add"
          onPress={() => setEditing({})}
        />
      }
    >
      {active && (
        <ListSection>
          <ListRow
            icon="play-circle-outline"
            title="Workout in progress"
            subtitle={`Finish ${workoutTitle(active.name)} before starting another`}
            value="Resume"
            accessibilityLabel={`Resume ${workoutTitle(active.name)}`}
            onPress={resumeWorkout}
          />
        </ListSection>
      )}
      {!templates.length && (
        <Empty
          title="No templates yet"
          detail="Save a workout you repeat, with its exercises, sets, reps, load and rest, then start it in one tap."
        />
      )}
      {templates.length > 0 && (
        <ListSection title="Your templates">
          {templates.map((t) => {
            const names = t.exercises.map(
              (e) => r.exercise(e.exerciseId)?.name ?? "Unavailable exercise",
            );
            return (
              <ListRow
                key={t.id}
                title={t.name}
                subtitle={[templateLine(t.exercises), exerciseNames(names)]
                  .filter(Boolean)
                  .join("\n")}
                accessibilityLabel={`Edit ${t.name}`}
                chevron={false}
                onPress={() => setEditing({ template: t })}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Button
                      title="Start"
                      variant="secondary"
                      compact
                      disabled={!!active}
                      accessibilityLabel={`Start ${t.name}`}
                      onPress={() => start(t)}
                    />
                    <OverflowMenu
                      label={`Options for ${t.name}`}
                      title={t.name}
                      actions={[
                        {
                          label: "Edit",
                          icon: "create-outline",
                          onPress: () => setEditing({ template: t }),
                        },
                        {
                          label: "Schedule…",
                          icon: "calendar-outline",
                          onPress: () => setScheduling(t),
                        },
                        {
                          label: "Duplicate",
                          icon: "copy-outline",
                          onPress: () =>
                            mutate(() =>
                              r.saveTemplate(
                                `${t.name} copy`,
                                t.exercises,
                                undefined,
                                t.notes,
                              ),
                            ),
                        },
                        {
                          label: "Delete",
                          icon: "trash-outline",
                          destructive: true,
                          onPress: () =>
                            confirm(
                              "Delete template?",
                              "Completed workouts are preserved. Planned sessions will need a new template.",
                              () => r.deleteTemplate(t.id),
                            ),
                        },
                      ]}
                    />
                  </View>
                }
              />
            );
          })}
        </ListSection>
      )}
      {planned.length > 0 && (
        <ListSection title="Scheduled">
          {planned.map((j) => {
            const name = String(j.data.name);
            const day = dayLabel(j.date);
            const path = j.data.forgePath === 1;
            const blocked = !!otherWorkout(r, String(j.data.workoutId ?? ""));
            return (
              <ListRow
                key={j.id}
                icon={path ? "trail-sign-outline" : "calendar-outline"}
                title={name}
                subtitle={[
                  whenText(j.date, today),
                  j.data.deload === true
                    ? "Deload: one fewer set per exercise"
                    : undefined,
                ]
                  .filter(Boolean)
                  .join("\n")}
                accessibilityLabel={`${name}, ${day}`}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Button
                      title="Start"
                      variant="secondary"
                      compact
                      disabled={blocked}
                      accessibilityLabel="Start planned session"
                      onPress={() => startPlanned(j)}
                    />
                    <OverflowMenu
                      label={`Options for ${name}, ${day}`}
                      title={`${name} · ${day}`}
                      actions={
                        path
                          ? [
                              {
                                label: "Manage Path session",
                                icon: "trail-sign-outline",
                                onPress: () =>
                                  router.push({
                                    pathname: "/paths",
                                    params: {
                                      programId: String(j.data.programId),
                                      week: String(j.data.week),
                                    },
                                  }),
                              },
                            ]
                          : [
                              {
                                label: "Remove from schedule",
                                icon: "trash-outline",
                                destructive: true,
                                onPress: () =>
                                  confirm(
                                    "Remove planned session?",
                                    "Your recorded workouts will remain.",
                                    () => r.deleteJournal(j.id),
                                  ),
                              },
                            ]
                      }
                    />
                  </View>
                }
              />
            );
          })}
        </ListSection>
      )}
      {templates.length > 0 && !planned.length && (
        <Txt variant="caption" tone="secondary">
          Plan a session from a template&apos;s ••• menu → Schedule.
        </Txt>
      )}
      {editing && (
        <TemplateEditor
          template={editing.template}
          onClose={() => setEditing(undefined)}
        />
      )}
      <DateSheet
        visible={!!scheduling}
        title="Schedule workout"
        detail={scheduling ? `Choose a day for ${scheduling.name}.` : undefined}
        confirmLabel="Schedule"
        onConfirm={(date) => scheduling && schedule(scheduling, date)}
        onClose={() => setScheduling(undefined)}
      />
    </Screen>
  );
}
