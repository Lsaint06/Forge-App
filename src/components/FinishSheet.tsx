import React, { useState } from "react";
import { View, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cancelRestNotification } from "../notifications";
import { useRepo, mutate } from "../state";
import { Txt, Button, Sheet, useColors, dark } from "./ui";
import { ListRow } from "./system";
import { useBackupActions } from "./Backup";
import { backupState, snoozeBackupReminder } from "../data/backup";
import { unmarkedSets, setNumbers } from "../domain/finish";
import { volume } from "../domain/metrics";
import { previousText } from "../domain/workout-display";
import { plural, volumeText } from "../domain/training-display";
import { theme } from "../theme";
import type { Workout } from "../domain/types";

/**
 * Finishing a workout. Lists exercises with sets that hold numbers but were
 * never ticked, so nothing is left out of progress without the lifter
 * choosing it. Those sets stay out unless switched on: a set that was only
 * planned must never be recorded as done. After saving, offers a backup when
 * one is due.
 */
export function FinishSheet({
  workout: w,
  onClose,
  onSaved,
  onDone,
}: {
  workout: Workout;
  /** Keep training: close without finishing. */
  onClose: () => void;
  /** The workout is now completed. */
  onSaved: () => void;
  /** Leave the logger. */
  onDone: () => void;
}) {
  const r = useRepo();
  const c = useColors();
  const units = r.profile().units;
  const [phase, setPhase] = useState<"review" | "saved">("review");
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  // Either way the lifter has acted on the reminder: leave the logger.
  const backupActions = useBackupActions(() => onDone());
  const rows = r.workoutExercises(w.id);
  const groups = unmarkedSets(
    rows.map((row) => ({ row, sets: r.sets(row.id) })),
  );
  const done = r.workoutSets(w.id).filter((s) => s.completed);
  const adding = groups
    .filter((g) => included.has(g.row.id))
    .flatMap((g) => g.sets.map(({ set }) => set));
  const total = done.length + adding.length;
  const moved = volume([
    ...done,
    ...adding.map((s) => ({ ...s, completed: true })),
  ]);
  const backup = backupState(r);

  function toggle(rowId: string) {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }
  function save() {
    if (phase !== "review" || total === 0) return;
    const saved = mutate(() =>
      r.transaction(() => {
        for (const s of adding) r.editSet(s.id, { completed: true });
        r.finishWorkout(w.id);
        r.setSetting("restDeadline", "0");
        return true;
      }),
    );
    if (!saved) return;
    void cancelRestNotification().catch(() => {});
    onSaved();
    if (backupState(r).prompt) setPhase("saved");
    else onDone();
  }
  function notNow() {
    mutate(() => snoozeBackupReminder(r));
    onDone();
  }

  if (phase === "saved")
    return (
      <Sheet
        visible
        onClose={notNow}
        title="Workout saved"
        footer={
          <View style={{ gap: theme.spacing.xs }}>
            {backupActions.folder && (
              <Button
                title={
                  backupActions.busy === "folder"
                    ? "Saving…"
                    : "Save backup to a folder"
                }
                icon="folder-outline"
                disabled={!!backupActions.busy}
                onPress={() => void backupActions.saveToFolder()}
              />
            )}
            <Button
              title={
                backupActions.busy === "share" ? "Preparing…" : "Share a copy"
              }
              icon="share-outline"
              variant={backupActions.folder ? "secondary" : "primary"}
              disabled={!!backupActions.busy}
              onPress={() => void backupActions.share()}
            />
            <Button title="Not now" variant="text" neutral onPress={notNow} />
          </View>
        }
      >
        <Txt tone="secondary">
          {plural(total, "set")} saved to your training history.
        </Txt>
        <View
          style={{
            backgroundColor: c.surfaceRaised,
            borderRadius: theme.radii.card,
            padding: theme.spacing.row,
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={c.ember}
            />
            <Txt variant="headline" header style={{ flex: 1 }}>
              Back up your training
            </Txt>
          </View>
          <Txt variant="caption" tone="secondary">
            {backup.text}. Save a backup file to Files, iCloud Drive, Google
            Drive or email so a lost or replaced phone can&apos;t take your
            history with it.
          </Txt>
        </View>
      </Sheet>
    );

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Finish workout"
      footer={
        <View style={{ gap: theme.spacing.xs }}>
          <Button
            title="Save workout"
            icon="checkmark"
            disabled={total === 0}
            onPress={save}
          />
          <Button
            title="Keep training"
            variant="text"
            neutral
            onPress={onClose}
          />
        </View>
      }
    >
      <View style={{ gap: 2 }}>
        <Txt variant="headline">
          {total
            ? `${plural(total, "set")} will be saved`
            : "No sets marked done yet"}
        </Txt>
        {moved > 0 && (
          <Txt tone="secondary">{volumeText(moved, units)} lifted</Txt>
        )}
      </View>
      {groups.length > 0 && (
        <View style={{ gap: theme.spacing.sm }}>
          <Txt variant="overline" tone="secondary" header>
            Not marked done
          </Txt>
          <Txt variant="caption" tone="secondary">
            These sets have numbers but weren&apos;t ticked. Switch on the
            exercises you did; the rest won&apos;t count toward your progress.
          </Txt>
          <View
            style={{
              backgroundColor: c.surfaceRaised,
              borderRadius: theme.radii.card,
              overflow: "hidden",
            }}
          >
            {groups.map(({ row, sets }) => {
              const exercise = r.exercise(row.exerciseId);
              const name = exercise?.name ?? "Exercise";
              const on = included.has(row.id);
              const values = sets
                .map(
                  ({ set }) =>
                    previousText(set, exercise?.category ?? "strength", units)
                      .text,
                )
                .join(", ");
              return (
                <ListRow
                  key={row.id}
                  title={name}
                  subtitle={`${setNumbers(sets.map((s) => s.number))} · ${values}`}
                  accessibilityLabel={`Include ${name}`}
                  chevron={false}
                  onPress={() => toggle(row.id)}
                  trailing={
                    <Switch
                      accessibilityLabel={`Include ${name} switch`}
                      value={on}
                      onValueChange={() => toggle(row.id)}
                      trackColor={{
                        true: c.ember,
                        false: c.bg === dark.bg ? c.selected : c.text3,
                      }}
                      // A light thumb in both themes, as on native switches.
                      thumbColor={c.bg === dark.bg ? c.text : c.surface}
                    />
                  }
                />
              );
            })}
          </View>
        </View>
      )}
      {total === 0 && (
        <Txt variant="caption" tone="secondary">
          Mark at least one set done, or switch on an exercise above, to save
          this workout.
        </Txt>
      )}
    </Sheet>
  );
}
