import React, { useRef, useState } from "react";
import { View, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cancelRestNotification } from "../notifications";
import { useRepo, mutate } from "../state";
import { Txt, Button, Sheet, useColors, dark, type IconName } from "./ui";
import { ListRow } from "./system";
import { useBackupActions } from "./Backup";
import { backupState, snoozeBackupReminder } from "../data/backup";
import { workoutSummary } from "../data/workout-session";
import { unmarkedSets, setNumbers } from "../domain/finish";
import { volume } from "../domain/metrics";
import { previousText, workoutTitle } from "../domain/workout-display";
import { plural, volumeText, longDayLabel } from "../domain/training-display";
import { recordHeadline } from "../domain/progress/format";
import { theme } from "../theme";
import type { Workout } from "../domain/types";

/**
 * Finishing a workout, in one sheet:
 * 1. Review: exercises with sets that hold numbers but were never ticked are
 *    listed, so nothing is left out of progress without the lifter choosing
 *    it. They stay out unless switched on: a set that was only planned must
 *    never be recorded as done.
 * 2. Save: one transaction, guarded against repeated taps.
 * 3. Summary: what was recorded (read back from storage), records from the
 *    Progress engine, and the backup reminder when one is due. Done leaves.
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
  const [phase, setPhase] = useState<"review" | "summary">("review");
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  const saving = useRef(false);
  // Whether the summary offers a backup: decided once, when saving, so the
  // reminder appears at most once per workout.
  const [offerBackup, setOfferBackup] = useState(false);
  const [backedUp, setBackedUp] = useState<"saved" | "shared">();
  const backupActions = useBackupActions(setBackedUp);
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
    // A second tap before the sheet re-renders must not save twice.
    if (saving.current || phase !== "review" || total === 0) return;
    saving.current = true;
    const saved = mutate(() =>
      r.transaction(() => {
        for (const s of adding) r.editSet(s.id, { completed: true });
        r.finishWorkout(w.id);
        r.setSetting("restDeadline", "0");
        return true;
      }),
    );
    if (!saved) {
      saving.current = false;
      return;
    }
    // The workout is committed to storage before the summary appears.
    void cancelRestNotification().catch(() => {});
    onSaved();
    setOfferBackup(backupState(r).prompt);
    setPhase("summary");
  }
  function finish() {
    // Leaving without backing up counts as "Not now".
    if (offerBackup && !backedUp) mutate(() => snoozeBackupReminder(r));
    onDone();
  }

  if (phase === "summary") {
    const summary = workoutSummary(r, w.id);
    const stats: { icon: IconName; value: string; label: string }[] = summary
      ? [
          {
            icon: "checkmark-done-outline",
            value: String(summary.sets),
            label: summary.sets === 1 ? "Set" : "Sets",
          },
          {
            icon: "barbell-outline",
            value: String(summary.exercises),
            label: summary.exercises === 1 ? "Exercise" : "Exercises",
          },
          ...(summary.minutes
            ? [
                {
                  icon: "time-outline" as const,
                  value: `${summary.minutes} min`,
                  label: "Duration",
                },
              ]
            : []),
          ...(summary.volumeKg
            ? [
                {
                  icon: "trending-up-outline" as const,
                  value: volumeText(summary.volumeKg, units),
                  label: "Volume",
                },
              ]
            : []),
        ]
      : [];
    return (
      <Sheet
        visible
        onClose={finish}
        title="Workout complete"
        footer={
          <Button
            title="Done"
            accessibilityLabel="Done, back to training"
            onPress={finish}
          />
        }
      >
        {summary && (
          <View style={{ gap: 2 }}>
            <Txt variant="headline" header numberOfLines={2}>
              {workoutTitle(summary.name)}
            </Txt>
            <Txt tone="secondary">{longDayLabel(summary.finishedAt)}</Txt>
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            rowGap: theme.spacing.md,
            backgroundColor: c.surfaceRaised,
            borderRadius: theme.radii.card,
            padding: theme.spacing.row,
          }}
        >
          {stats.map((s) => (
            <View
              key={s.label}
              accessible
              accessibilityLabel={`${s.label}: ${s.value}`}
              style={{ width: "50%", gap: 2, paddingRight: 8 }}
            >
              <Txt variant="metric" numberOfLines={1} fit>
                {s.value}
              </Txt>
              <Txt variant="overline" tone="secondary" numberOfLines={1}>
                {s.label}
              </Txt>
            </View>
          ))}
        </View>
        {!!summary?.records.length && (
          <View style={{ gap: theme.spacing.sm }}>
            <Txt variant="overline" tone="secondary" header>
              {summary.records.length === 1 ? "New record" : "New records"}
            </Txt>
            <View
              style={{
                backgroundColor: c.surfaceRaised,
                borderRadius: theme.radii.card,
                overflow: "hidden",
              }}
            >
              {summary.records.map(({ exerciseId, name, event }) => {
                const head = recordHeadline(event, units);
                return (
                  <ListRow
                    key={exerciseId}
                    icon="trophy-outline"
                    title={name}
                    subtitle={`${head.label} · ${head.value}`}
                    accessibilityLabel={`New record, ${name}: ${head.label} ${head.value}`}
                  />
                );
              })}
            </View>
          </View>
        )}
        {offerBackup && (
          <View
            style={{
              // Outlined, not filled, so its buttons keep visible edges.
              borderWidth: 1,
              borderColor: c.hairline,
              borderRadius: theme.radii.card,
              padding: theme.spacing.row,
              gap: theme.spacing.sm,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
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
              {backedUp === "saved"
                ? "Backup saved and checked. Keep that folder in cloud storage, or copy the file off this phone."
                : backedUp === "shared"
                  ? "Shared. Forge can't confirm the file was saved, so check it reached its destination."
                  : `${backup.text}. Save a backup file so a lost or replaced phone can't take your history with it.`}
            </Txt>
            {!backedUp && (
              <View style={{ gap: theme.spacing.xs }}>
                {backupActions.folder && (
                  <Button
                    title={
                      backupActions.busy === "folder"
                        ? "Saving…"
                        : "Save backup to a folder"
                    }
                    icon="folder-outline"
                    variant="secondary"
                    disabled={!!backupActions.busy}
                    onPress={() => void backupActions.saveToFolder()}
                  />
                )}
                <Button
                  title={
                    backupActions.busy === "share"
                      ? "Preparing…"
                      : "Share a copy"
                  }
                  icon="share-outline"
                  variant={backupActions.folder ? "text" : "secondary"}
                  disabled={!!backupActions.busy}
                  onPress={() => void backupActions.share()}
                />
              </View>
            )}
          </View>
        )}
      </Sheet>
    );
  }

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
              const texts = sets.map(
                ({ set }) =>
                  previousText(set, exercise?.category ?? "strength", units)
                    .text,
              );
              // "10 reps each" rather than the same value four times.
              const values =
                texts.length > 1 && texts.every((t) => t === texts[0])
                  ? `${texts[0]} each`
                  : texts.join(", ");
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
