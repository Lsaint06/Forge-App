import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../platform/alert";
import { useRepo, mutate, confirm } from "../state";
import {
  Card,
  Label,
  Button,
  Row,
  Field,
  NumberField,
  Chips,
  useColors,
} from "./ui";
import { ExercisePicker } from "./ExercisePicker";
import { overload, kgToLb, lbToKg } from "../domain/metrics";
import { targetProgression } from "../domain/progression";
import { repRangeLabel } from "../domain/prescriptions";
import type { WorkoutExercise, WorkoutSet } from "../domain/types";
import { restNotification } from "../notifications";
import { IconButton } from "./design";
export function SetRow({
  set: s,
  category,
}: {
  set: WorkoutSet;
  category: string;
}) {
  const r = useRepo();
  const p = r.profile();
  const c = useColors();
  const display = p.units === "lb" ? kgToLb(s.weight) : s.weight;
  function save(patch: Partial<WorkoutSet>) {
    mutate(() => r.editSet(s.id, patch));
  }
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderColor: c.border,
        backgroundColor: s.completed ? c.elevated : "transparent",
        borderRadius: 8,
      }}
    >
      <Label bold size={13} style={{ width: 32, textAlign: "center" }}>
        {s.position + 1}
      </Label>
      {category === "strength" ? (
        <>
          <NumberField
            label={`Set ${s.position + 1} weight (${p.units})`}
            compact
            value={display}
            onSave={(n) =>
              save({ weight: p.units === "lb" ? lbToKg(n ?? 0) : (n ?? 0) })
            }
          />
          <NumberField
            label={`Set ${s.position + 1} reps`}
            compact
            integer
            max={10000}
            value={s.reps}
            onSave={(n) => save({ reps: n ?? 0 })}
          />
        </>
      ) : (
        <>
          <NumberField
            label={`Set ${s.position + 1} duration (seconds)`}
            compact
            value={s.duration}
            onSave={(n) => save({ duration: n ?? 0 })}
          />
          {category === "distance" && (
            <NumberField
              label={`Set ${s.position + 1} distance (meters)`}
              compact
              value={s.distance}
              onSave={(n) => save({ distance: n ?? 0 })}
            />
          )}
        </>
      )}
      <IconButton
        label={
          s.completed
            ? `Mark set ${s.position + 1} incomplete`
            : `Complete set ${s.position + 1}`
        }
        selected={s.completed}
        icon={s.completed ? "checkmark-circle" : "ellipse-outline"}
        onPress={() => {
          mutate(() => r.editSet(s.id, { completed: !s.completed }));
          if (
            !s.completed &&
            r.sets(s.exerciseRowId).find((x) => x.id === s.id)?.completed
          ) {
            const deadline = Date.now() + s.rest * 1000;
            mutate(() => r.setSetting("restDeadline", String(deadline)));
            void restNotification(deadline).catch((e) =>
              Alert.alert("Rest saved; notification unavailable", String(e)),
            );
          }
        }}
      />
    </View>
  );
}

function SetDetails({ set: s }: { set: WorkoutSet }) {
  const r = useRepo();
  function save(patch: Partial<WorkoutSet>) {
    mutate(() => r.editSet(s.id, patch));
  }
  return (
    <View style={{ gap: 12 }}>
      <Label
        muted
        size={12}
      >{`Set ${s.position + 1} · ${s.kind} · ${s.side}`}</Label>
      <Button
        title="Remove set"
        secondary
        onPress={() =>
          confirm("Remove set?", "This set will be deleted.", () =>
            r.removeSet(s.id),
          )
        }
      />
      <Chips
        values={["warmup", "working", "drop", "failure"]}
        value={s.kind}
        onChange={(kind) => save({ kind: kind as WorkoutSet["kind"] })}
      />
      <Chips
        values={["both", "left", "right"]}
        value={s.side}
        onChange={(side) => save({ side: side as WorkoutSet["side"] })}
      />
      <Row>
        <NumberField
          label="RPE (1–10, optional)"
          min={1}
          max={10}
          value={s.rpe}
          nullable
          onSave={(rpe) => save({ rpe })}
        />
        <NumberField
          label="RIR (0–20, optional)"
          max={20}
          value={s.rir}
          nullable
          onSave={(rir) => save({ rir })}
        />
        <NumberField
          label="Rest (seconds)"
          max={3600}
          value={s.rest}
          onSave={(rest) => save({ rest: rest ?? 0 })}
        />
      </Row>
      <Field
        label="Tempo (e.g. 3-1-1-0)"
        value={s.tempo}
        onChangeText={(tempo) => save({ tempo })}
      />
      <Field
        label="Set notes"
        value={s.notes}
        onChangeText={(notes) => save({ notes })}
      />
    </View>
  );
}
export default function WorkoutExerciseCard({
  row: e,
  initialExpanded = false,
}: {
  row: WorkoutExercise;
  initialExpanded?: boolean;
}) {
  const r = useRepo();
  const exercise = r.exercise(e.exerciseId);
  const p = r.profile();
  const c = useColors();
  const sets = r.sets(e.id);
  const [replace, setReplace] = useState(false);
  const [details, setDetails] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [detailSetId, setDetailSetId] = useState<string>();
  const detailSet = sets.find((s) => s.id === detailSetId) ?? sets[0];
  const working = sets.filter((s) => s.kind !== "warmup");
  const category = exercise?.category ?? "strength";
  const previous = r
    .history(e.exerciseId)[0]
    ?.filter((s) => s.completed && s.kind !== "warmup");
  const pathWorkout = r
    .journal("schedule")
    .some(
      (entry) =>
        entry.data.forgePath === 1 && entry.data.workoutId === e.workoutId,
    );
  const target = e.target;
  const recommendation = target
    ? targetProgression(
        r.targetHistory(e.exerciseId, target),
        target,
        p.increment,
      )
    : overload(r.history(e.exerciseId), {
        min: p.repMin,
        max: p.repMax,
        increment: p.increment,
      });
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${exercise?.name ?? "exercise"}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <Label size={21} bold>
            {exercise?.name ?? "Missing exercise"}
          </Label>
          <Label size={12} muted>
            {exercise?.muscle} · {exercise?.equipment}
          </Label>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={c.muted}
        />
      </Pressable>
      {target ? (
        <Label size={12} muted>
          {`${pathWorkout ? "Path" : "Template"} target: ${target.sets} × ${repRangeLabel({ reps: target.min, repMax: target.max })} reps · ${e.rest}s rest`}
        </Label>
      ) : (
        <Label size={12} muted>
          {`${working.length} working ${working.length === 1 ? "set" : "sets"} · ${e.rest}s rest`}
        </Label>
      )}
      <Label
        size={12}
        muted
      >{`${sets.filter((s) => s.completed).length} / ${sets.length} sets complete`}</Label>
      {expanded && (
        <>
          <Label muted size={12}>
            {previous?.length
              ? `Previous: ${previous.map((s) => `${Math.round((p.units === "lb" ? kgToLb(s.weight) : s.weight) * 10) / 10} ${p.units} × ${s.reps}`).join(" · ")}`
              : "No previous working sets"}
          </Label>
          <Button
            title={details ? "Hide exercise options" : "Exercise options"}
            secondary
            icon="options-outline"
            onPress={() => setDetails(!details)}
          />
          {details && (
            <View style={{ gap: 12 }}>
              <Row>
                <Button
                  title="Move up"
                  secondary
                  onPress={() => mutate(() => r.moveExercise(e.id, -1))}
                />
                <Button
                  title="Move down"
                  secondary
                  onPress={() => mutate(() => r.moveExercise(e.id, 1))}
                />
                <Button
                  title="Substitute"
                  secondary
                  onPress={() => setReplace(true)}
                />
                <Button
                  title="Remove"
                  secondary
                  onPress={() =>
                    confirm(
                      "Remove exercise?",
                      "All sets for this movement will also be removed.",
                      () => r.removeExercise(e.id),
                    )
                  }
                />
              </Row>
              {pathWorkout && !target && exercise?.category === "strength" && (
                <Label muted size={12}>
                  Path progression: reach the prescribed reps on every working
                  set with controlled technique and about two reps left, then
                  consider the smallest load increase. Repeat or reduce the load
                  when recovery calls for it.
                </Label>
              )}
              {(!pathWorkout || target) &&
                exercise?.category === "strength" && (
                  <View style={{ gap: 6 }}>
                    {recommendation.weight != null && (
                      <Label size={12} muted>
                        NEXT LOAD ·{" "}
                        {Math.round(
                          (p.units === "lb"
                            ? kgToLb(recommendation.weight)
                            : recommendation.weight) * 100,
                        ) / 100}{" "}
                        {p.units}
                      </Label>
                    )}
                    <Label size={12} muted>
                      {recommendation.reason}
                    </Label>
                    <Button
                      title="Apply suggested load"
                      secondary
                      disabled={recommendation.weight == null}
                      onPress={() =>
                        mutate(() => {
                          const weight = recommendation.weight;
                          if (weight == null)
                            throw new Error(
                              "Choose a working load manually until comparable performance is available.",
                            );
                          for (const s of sets.filter(
                            (s) =>
                              !s.completed && (!target || s.kind === "working"),
                          ))
                            r.editSet(s.id, { weight });
                        })
                      }
                    />
                  </View>
                )}
              <Field
                label="Exercise notes"
                value={e.notes}
                onChangeText={(notes) =>
                  mutate(() => r.editExercise(e.id, { notes }))
                }
              />
              <Field
                label="Superset / circuit group (shared label)"
                value={e.groupId}
                onChangeText={(groupId) =>
                  mutate(() => r.editExercise(e.id, { groupId }))
                }
              />
              <NumberField
                label="Exercise default rest (seconds)"
                value={e.rest}
                onSave={(rest) =>
                  mutate(() => r.editExercise(e.id, { rest: rest ?? 0 }))
                }
              />
              {detailSet && (
                <View style={{ gap: 12 }}>
                  <Label bold>Optional set tracking</Label>
                  <Chips
                    values={sets.map((s) => `Set ${s.position + 1}`)}
                    value={`Set ${detailSet.position + 1}`}
                    onChange={(label) =>
                      setDetailSetId(
                        sets.find((s) => `Set ${s.position + 1}` === label)!.id,
                      )
                    }
                  />
                  <SetDetails key={detailSet.id} set={detailSet} />
                </View>
              )}
            </View>
          )}
          {!!sets.length && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Label size={11} muted style={{ width: 32, textAlign: "center" }}>
                SET
              </Label>
              <Label size={11} muted style={{ flex: 1 }}>
                {category === "strength" ? `WEIGHT (${p.units})` : "SECONDS"}
              </Label>
              {category !== "duration" && (
                <Label size={11} muted style={{ flex: 1 }}>
                  {category === "strength" ? "REPS" : "METERS"}
                </Label>
              )}
              <Label size={11} muted style={{ width: 48, textAlign: "center" }}>
                DONE
              </Label>
            </View>
          )}
          {sets.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              category={exercise?.category ?? "strength"}
            />
          ))}
          <Button
            title="Add set"
            secondary
            icon="add"
            onPress={() =>
              mutate(() => {
                const prev = sets[sets.length - 1];
                return r.addSet(
                  e.id,
                  prev
                    ? {
                        weight: prev.weight,
                        reps: prev.reps,
                        rest: e.rest,
                        kind: "working",
                      }
                    : {},
                );
              })
            }
          />
        </>
      )}
      <ExercisePicker
        visible={replace}
        onClose={() => setReplace(false)}
        onPick={(x) => mutate(() => r.editExercise(e.id, { exerciseId: x.id }))}
      />
    </Card>
  );
}
