import React, { useState } from "react";
import { View, Alert } from "react-native";
import { useRepo, mutate, confirm } from "../state";
import { Card, Label, Button, Row, Field, NumberField, Chips } from "./ui";
import { ExercisePicker } from "./ExercisePicker";
import { overload, kgToLb, lbToKg } from "../domain/metrics";
import type { WorkoutExercise, WorkoutSet } from "../domain/types";
import { restNotification } from "../notifications";
function SetRow({ set: s, category }: { set: WorkoutSet; category: string }) {
  const r = useRepo();
  const p = r.profile();
  const [more, setMore] = useState(false);
  const display = p.units === "lb" ? kgToLb(s.weight) : s.weight;
  function save(patch: Partial<WorkoutSet>) {
    mutate(() => r.editSet(s.id, patch));
  }
  return (
    <View
      style={{
        gap: 10,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderColor: "#28303B",
      }}
    >
      <Row>
        <Label bold size={12}>
          SET {s.position + 1}
        </Label>
        <Label muted size={11}>
          {s.kind.toUpperCase()} · {s.side}
        </Label>
        <View style={{ flex: 1 }} />
        <Button
          title={s.completed ? "✓ Done" : "Complete"}
          secondary={!s.completed}
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
      </Row>
      <Row>
        {category === "strength" ? (
          <>
            <NumberField
              label={`Load (${p.units}; added load for bodyweight)`}
              value={display}
              onSave={(n) =>
                save({ weight: p.units === "lb" ? lbToKg(n ?? 0) : (n ?? 0) })
              }
            />
            <NumberField
              label="Reps"
              integer
              max={10000}
              value={s.reps}
              onSave={(n) => save({ reps: n ?? 0 })}
            />
          </>
        ) : (
          <>
            <NumberField
              label="Duration (seconds)"
              value={s.duration}
              onSave={(n) => save({ duration: n ?? 0 })}
            />
            {category === "distance" && (
              <NumberField
                label="Distance (meters)"
                value={s.distance}
                onSave={(n) => save({ distance: n ?? 0 })}
              />
            )}
          </>
        )}
      </Row>
      <Row>
        <Button
          title={more ? "Less detail" : "Effort & details"}
          secondary
          onPress={() => setMore(!more)}
        />
        <Button
          title="Remove set"
          secondary
          onPress={() =>
            confirm("Remove set?", "This set will be deleted.", () =>
              r.removeSet(s.id),
            )
          }
        />
      </Row>
      {more && (
        <>
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
        </>
      )}
    </View>
  );
}
export default function WorkoutExerciseCard({
  row: e,
}: {
  row: WorkoutExercise;
}) {
  const r = useRepo();
  const exercise = r.exercise(e.exerciseId);
  const p = r.profile();
  const sets = r.sets(e.id);
  const [replace, setReplace] = useState(false);
  const recommendation = overload(r.history(e.exerciseId), {
    min: p.repMin,
    max: p.repMax,
    increment: p.increment,
  });
  return (
    <Card>
      <Label size={21} bold>
        {exercise?.name ?? "Missing exercise"}
      </Label>
      <Label size={12} muted>
        {exercise?.muscle} · {exercise?.equipment}
      </Label>
      <Row>
        <Button
          title="↑"
          secondary
          onPress={() => mutate(() => r.moveExercise(e.id, -1))}
        />
        <Button
          title="↓"
          secondary
          onPress={() => mutate(() => r.moveExercise(e.id, 1))}
        />
        <Button title="Substitute" secondary onPress={() => setReplace(true)} />
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
      {exercise?.category === "strength" && (
        <View style={{ gap: 6 }}>
          <Label size={12} style={{ color: "#FF8A4C" }}>
            NEXT LOAD ·{" "}
            {Math.round(
              (p.units === "lb"
                ? kgToLb(recommendation.weight)
                : recommendation.weight) * 100,
            ) / 100}{" "}
            {p.units}
          </Label>
          <Label size={12} muted>
            {recommendation.reason}
          </Label>
          <Button
            title="Apply suggested load"
            secondary
            onPress={() =>
              mutate(() => {
                for (const s of sets.filter((s) => !s.completed))
                  r.editSet(s.id, { weight: recommendation.weight });
              })
            }
          />
        </View>
      )}
      <Field
        label="Exercise notes"
        value={e.notes}
        onChangeText={(notes) => mutate(() => r.editExercise(e.id, { notes }))}
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
      <ExercisePicker
        visible={replace}
        onClose={() => setReplace(false)}
        onPick={(x) => mutate(() => r.editExercise(e.id, { exerciseId: x.id }))}
      />
    </Card>
  );
}
