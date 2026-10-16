import React, { useState, useEffect } from "react";
import { View, FlatList } from "react-native";
import { Alert } from "../platform/alert";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useRepo, mutate, confirm, useApp } from "../state";
import {
  Screen,
  Card,
  Label,
  Button,
  Row,
  Field,
  NumberField,
  Empty,
} from "../components/ui";
import { ExercisePicker } from "../components/ExercisePicker";
import { clock, elapsedSeconds, volume } from "../domain/metrics";
import WorkoutExerciseCard from "../components/WorkoutExerciseCard";
import { restNotification, cancelRestNotification } from "../notifications";
function useNow() {
  const [now, set] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => set(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
}
export function RestTimer() {
  const r = useRepo();
  const now = useNow();
  const [settings, setSettings] = useState(false);
  const deadline = Number(r.setting("restDeadline") ?? 0);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (deadline > 0 && left === 0) {
      r.setSetting("restDeadline", "0");
      useApp.getState().touch();
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
  }, [deadline, left, r]);
  function change(seconds: number) {
    mutate(() =>
      r.setSetting("restDeadline", String(Date.now() + seconds * 1000)),
    );
    void restNotification(Date.now() + seconds * 1000).catch((e) =>
      Alert.alert("Reminder unavailable", String(e)),
    );
  }
  return (
    <Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Label muted size={11}>
            REST TIMER
          </Label>
          <Label size={30} bold>
            {left ? clock(left) : "Ready"}
          </Label>
        </View>
        <Button
          title={left ? "+30 sec" : "Start rest"}
          secondary
          onPress={() => change(left ? left + 30 : r.profile().rest)}
        />
        {left > 0 && (
          <Button
            title="Skip"
            secondary
            onPress={() => {
              mutate(() => r.setSetting("restDeadline", "0"));
              void cancelRestNotification().catch(() => {});
            }}
          />
        )}
      </Row>
      <Button
        title={settings ? "Hide rest settings" : "Rest settings"}
        secondary
        onPress={() => setSettings(!settings)}
      />
      {settings && (
        <NumberField
          label="Default rest (seconds)"
          max={3600}
          value={r.profile().rest}
          onSave={(n) => mutate(() => r.saveProfile({ rest: n ?? 90 }))}
        />
      )}
    </Card>
  );
}
function SessionClock({
  workout: w,
}: {
  workout: import("../domain/types").Workout;
}) {
  const now = useNow();
  return (
    <Label bold style={{ fontVariant: ["tabular-nums"] }}>
      {clock(
        elapsedSeconds(
          w.startedAt,
          w.finishedAt ?? now,
          w.pausedMs,
          w.pausedAt,
        ),
      )}
    </Label>
  );
}
export default function WorkoutScreen() {
  const r = useRepo();
  const { id: workoutId } = useLocalSearchParams<{ id?: string }>();
  const w = workoutId ? r.workout(workoutId) : r.active();
  function returnToTraining() {
    router.back();
  }
  const [details, setDetails] = useState(false);
  const [picker, setPicker] = useState(false);
  const [templateName, setTemplateName] = useState("");
  if (!w)
    return (
      <Screen title="No active workout">
        <Empty
          title="Ready when you are"
          detail="Start a workout from Train."
          action={<Button title="Back to Train" onPress={returnToTraining} />}
        />
      </Screen>
    );
  const rows = r.workoutExercises(w.id);
  const firstUnfinished = rows.find((row) => {
    const sets = r.sets(row.id);
    return !sets.length || sets.some((set) => !set.completed);
  });
  return (
    <Screen
      scroll={false}
      header={
        <View style={{ paddingHorizontal: 24, paddingVertical: 8, gap: 8 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Label bold>{w.name}</Label>
              <Label muted size={13}>
                {w.status} · <SessionClock workout={w} />
              </Label>
            </View>
            <Button title="Back to tabs" secondary onPress={returnToTraining} />
          </Row>
        </View>
      }
      title={w.status === "completed" ? "Session review" : "Your session."}
      eyebrow={
        w.status === "completed" ? "THE WORK / HISTORY" : "THE WORK / LIVE"
      }
    >
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 16, paddingBottom: 48 }}
        renderItem={({ item }) => (
          <WorkoutExerciseCard
            row={item}
            initialExpanded={item.id === firstUnfinished?.id}
          />
        )}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <Button
              title={details ? "Hide session details" : "Session details"}
              secondary
              onPress={() => setDetails(!details)}
            />
            {details && (
              <Card>
                <Field
                  label="Workout name"
                  value={w.name}
                  onChangeText={(name) => {
                    if (name.trim())
                      mutate(() => r.updateWorkout(w.id, { name }));
                  }}
                />
                <Row>
                  <View style={{ flex: 1 }}>
                    <Label size={38} bold>
                      <SessionClock workout={w} />
                    </Label>
                    <Label muted>
                      {w.status.toUpperCase()} · {rows.length} exercises ·{" "}
                      {Math.round(volume(r.workoutSets(w.id)))} kg
                    </Label>
                  </View>
                  {w.status !== "completed" && (
                    <Button
                      title={w.status === "paused" ? "Resume" : "Pause"}
                      secondary
                      onPress={() => mutate(() => r.pauseWorkout(w.id))}
                    />
                  )}
                </Row>
                <Field
                  label="Workout notes"
                  value={w.notes}
                  multiline
                  onChangeText={(notes) =>
                    mutate(() => r.updateWorkout(w.id, { notes }))
                  }
                />
              </Card>
            )}
            {w.status !== "completed" && <RestTimer />}
            {!rows.length && (
              <Label muted>Add your first exercise to start logging.</Label>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: 16, paddingTop: 16 }}>
            <Card>
              <Label bold>Make this repeatable</Label>
              <Field
                label="Template name"
                value={templateName}
                onChangeText={setTemplateName}
              />
              <Button
                title="Save as template"
                secondary
                disabled={!templateName.trim() || !rows.length}
                onPress={() => {
                  const t = mutate(() =>
                    r.templateFromWorkout(w.id, templateName),
                  );
                  if (t) Alert.alert("Template saved", t.name);
                }}
              />
            </Card>
            <Button
              title={
                w.status === "completed" ? "Delete session" : "Discard workout"
              }
              danger
              onPress={() =>
                confirm(
                  "Delete this workout?",
                  "This cannot be undone. Export a backup first if you need to keep it.",
                  () => {
                    r.deleteWorkout(w.id);
                    returnToTraining();
                  },
                )
              }
            />
          </View>
        }
      />
      <View style={{ gap: 8, paddingVertical: 8 }}>
        <Button
          title="Add exercise"
          icon="add"
          secondary
          onPress={() => setPicker(true)}
        />
        {w.status !== "completed" && (
          <Button
            title="Finish workout"
            icon="checkmark"
            onPress={() => {
              const sets = r.workoutSets(w.id);
              if (!sets.some((s) => s.completed)) {
                Alert.alert(
                  "No completed sets",
                  "Mark at least one set complete before finishing.",
                );
                return;
              }
              confirm(
                "Finish workout?",
                `${sets.filter((s) => s.completed).length} completed sets will be included in your progress.`,
                () => {
                  r.finishWorkout(w.id);
                  r.setSetting("restDeadline", "0");
                  void cancelRestNotification().catch(() => {});
                  returnToTraining();
                },
              );
            }}
          />
        )}
      </View>
      <ExercisePicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(e) =>
          mutate(() => {
            const row = r.addExercise(w.id, e.id);
            r.addSet(row.id);
          })
        }
      />
    </Screen>
  );
}
