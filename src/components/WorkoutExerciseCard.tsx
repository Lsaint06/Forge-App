import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRepo, mutate, confirm } from "../state";
import {
  Txt,
  Button,
  IconButton,
  Field,
  NumberField,
  SegmentedControl,
  Sheet,
  useColors,
  type IconName,
} from "./ui";
import { OverflowMenu, type MenuAction } from "./system";
import { ExercisePicker } from "./ExercisePicker";
import { SetGrid, SetRow } from "./SetGrid";
import { FText, ForgeCard, SquareIconButton } from "./reforge";
import { forge } from "../theme";
import { overload } from "../domain/metrics";
import { targetProgression } from "../domain/progression";
import {
  targetSummary,
  inlineAdvice,
  plannedSets,
  previousBySet,
  loadLabel,
  rirLabel,
  keepSegmentsTogether,
  loggedSummary,
  adviceSummary,
  type InlineAdvice,
} from "../domain/workout-display";
import type { WorkoutExercise, WorkoutSet } from "../domain/types";
import { programExerciseAdvice, programWorkoutContext } from "../data/programs";

export { SetRow };

// Path workouts without a saved rep target keep their written guidance.
const pathGuidance =
  "Path progression: reach the prescribed reps on every working set with controlled technique and about two reps left, then consider the smallest load increase. Repeat or reduce the load when recovery calls for it.";

/** Everything about one set beyond weight, reps and completion. */
function SetDetails({ set: s }: { set: WorkoutSet }) {
  const r = useRepo();
  function save(patch: Partial<WorkoutSet>) {
    mutate(() => r.editSet(s.id, patch));
  }
  return (
    <>
      <SegmentedControl
        label="Set type"
        options={[
          { value: "warmup", label: "Warm-up" },
          { value: "working", label: "Working" },
          { value: "drop", label: "Drop" },
          { value: "failure", label: "Failure" },
        ]}
        value={s.kind}
        onChange={(kind) => save({ kind: kind as WorkoutSet["kind"] })}
      />
      <SegmentedControl
        label="Side"
        options={[
          { value: "both", label: "Both sides" },
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ]}
        value={s.side}
        onChange={(side) => save({ side: side as WorkoutSet["side"] })}
      />
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
      <Field
        label="Tempo (e.g. 3-1-1-0)"
        value={s.tempo}
        onChangeText={(tempo) => save({ tempo })}
      />
      <Field
        label="Set notes"
        value={s.notes}
        multiline
        onChangeText={(notes) => save({ notes })}
      />
      <Button
        title="Remove set"
        variant="destructive"
        icon="trash-outline"
        onPress={() =>
          confirm(
            "Remove set?",
            "This set and its values will be deleted.",
            () => r.removeSet(s.id),
            { action: "Remove set" },
          )
        }
      />
    </>
  );
}

/** One line of session advice with a quick Apply and a link to the reason. */
function AdviceRow({
  advice,
  icon,
  units,
  onApply,
  onInfo,
}: {
  advice: InlineAdvice;
  icon: IconName;
  units: "kg" | "lb";
  onApply: () => void;
  onInfo: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        paddingLeft: 12,
        borderRadius: forge.radii.tile,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
      }}
    >
      <Ionicons name={icon} size={16} color={c.emberHot} />
      <Txt variant="caption" weight="600" numberOfLines={2} style={{ flex: 1 }}>
        {advice.headline}
      </Txt>
      {advice.apply !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Use suggested load ${loadLabel(advice.apply, units)}`}
          onPress={onApply}
          hitSlop={4}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 8,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Txt variant="body" weight="600" tone="accent">
            Apply
          </Txt>
        </Pressable>
      )}
      <IconButton
        icon="information-circle-outline"
        label="Why this suggestion"
        size={20}
        onPress={onInfo}
      />
    </View>
  );
}

/** A one- or two-line note with a leading icon; tappable when it opens more. */
function NoteLine({
  icon,
  text,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  text: string;
  label: string;
  hint: string;
  onPress?: () => void;
}) {
  const c = useColors();
  const content = (
    <>
      <Ionicons name={icon} size={16} color={c.text2} />
      <Txt
        variant="caption"
        tone="secondary"
        numberOfLines={onPress ? 2 : undefined}
        style={{ flex: 1 }}
      >
        {text}
      </Txt>
    </>
  );
  const row = {
    flexDirection: "row" as const,
    gap: 8,
    minHeight: 44,
    alignItems: "center" as const,
  };
  if (!onPress)
    return (
      <View accessible accessibilityLabel={label} style={row}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ ...row, opacity: pressed ? 0.6 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/** The open card's exercise menu: the reference's bordered ⋮ square. */
function MenuSquare({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <SquareIconButton
      icon="ellipsis-vertical"
      label={label}
      onPress={onPress}
    />
  );
}

/**
 * The reference's "Notes (optional)" row: the exercise's notes or a prompt
 * to add them. Opens Exercise settings, where notes are edited as before.
 */
function NotesRow({ notes, onPress }: { notes: string; onPress?: () => void }) {
  const c = useColors();
  const content = (
    <>
      <Ionicons name="document-text-outline" size={18} color={c.text2} />
      <FText variant="label" tone="secondary">
        Notes
      </FText>
      <FText
        variant="label"
        tone={notes ? "primary" : "secondary"}
        numberOfLines={2}
        style={{ flex: 1, opacity: notes ? 1 : 0.7 }}
      >
        {notes || "Optional · e.g. grip, setup, how it felt"}
      </FText>
    </>
  );
  const frame = {
    minHeight: 44,
    borderRadius: forge.radii.tile,
    borderWidth: forge.border.card,
    borderColor: c.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  };
  if (!onPress)
    return (
      <View
        accessible
        accessibilityLabel={`Exercise notes: ${notes}`}
        style={frame}
      >
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        notes ? `Exercise notes: ${notes}` : "Add exercise notes"
      }
      accessibilityHint="Edit notes, rest and superset"
      onPress={onPress}
      style={({ pressed }) => ({
        ...frame,
        backgroundColor: pressed ? c.cardRaised : c.cardBg,
      })}
    >
      {content}
    </Pressable>
  );
}

/**
 * One exercise in the logger (Phase 7.2A, after the Train reference): a
 * numbered header with equipment, muscle and the target line; the open card
 * is outlined in ember and holds advice, the set grid, Add set and notes.
 * Infrequent actions live in the exercise menu; set details open from the
 * set number.
 */
export default function WorkoutExerciseCard({
  row: e,
  initialExpanded = false,
  index,
  count,
  completedWorkout = false,
  readOnly = false,
  onReorder,
}: {
  row: WorkoutExercise;
  initialExpanded?: boolean;
  index?: number;
  count?: number;
  /** Reviewing a finished workout: completing a set starts no rest. */
  completedWorkout?: boolean;
  /** Review mode: logged values only, no editing controls. */
  readOnly?: boolean;
  /** Opens the reorder sheet with this exercise selected. */
  onReorder?: () => void;
}) {
  const r = useRepo();
  const exercise = r.exercise(e.exerciseId);
  const name = exercise?.name ?? "Missing exercise";
  const p = r.profile();
  const c = useColors();
  const sets = r.sets(e.id);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [sheet, setSheet] = useState<
    "settings" | "progression" | "substitute"
  >();
  const [more, setMore] = useState(false);
  const [detailSetId, setDetailSetId] = useState<string>();
  const detailSet = sets.find((s) => s.id === detailSetId);
  const working = sets.filter((s) => s.kind !== "warmup");
  const done = sets.filter((s) => s.completed).length;
  const category = exercise?.category ?? "strength";
  const strength = category === "strength";
  // The last completed session of this exercise, excluding this workout.
  const thisWorkout = new Set(
    r.workoutExercises(e.workoutId).map((row) => row.id),
  );
  const previous = previousBySet(
    sets,
    r
      .history(e.exerciseId)
      .find((group) => !group.some((s) => thisWorkout.has(s.exerciseRowId))),
  );
  const pathWorkout = r
    .journal("schedule")
    .some(
      (entry) =>
        entry.data.forgePath === 1 && entry.data.workoutId === e.workoutId,
    );
  // Curated program workouts follow the author's progression, never the
  // generic load suggestion.
  const programContext = programWorkoutContext(r, e.workoutId);
  const programItem = programContext?.slot?.session.exercises.find(
    (item) => item.exerciseId === e.exerciseId,
  );
  const programAdvice = programContext
    ? programExerciseAdvice(r, e.workoutId, e.exerciseId)?.advice
    : undefined;
  const target = e.target;
  const recommendation = programContext
    ? undefined
    : target
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
  // Inline RIR for every program-based workout (curated programs and
  // existing Paths); freestyle keeps RIR in Set Details.
  const showRir = strength && (!!programContext || pathWorkout);
  const rirTarget = programContext ? programAdvice?.rir : undefined;
  const summary = targetSummary({
    target,
    item: programContext ? programItem : undefined,
    rir: rirTarget,
    rest: e.rest,
    workingSets: working.length,
  });
  const planned = plannedSets(sets, !!target).map((s) => s.weight);
  const advice =
    strength && (programContext || target)
      ? inlineAdvice(
          programContext ? programAdvice : recommendation,
          planned,
          p.units,
        )
      : undefined;
  const adviceIcon: IconName = advice
    ? {
        up: "trending-up" as const,
        down: "trending-down" as const,
        hold: "repeat" as const,
        "lower-fatigue": "battery-half" as const,
        assess: "speedometer-outline" as const,
        establish: "flag-outline" as const,
        review: "create-outline" as const,
      }[advice.kind]
    : "information-circle-outline";
  const pathNote = pathWorkout && !target && strength;
  const genericAdvice =
    recommendation && (!pathWorkout || target) && strength
      ? recommendation
      : undefined;
  const programText = programContext?.enrollment.program?.progression;
  // The advice this sheet leads with: the author's progression for program
  // workouts, otherwise the generic suggestion.
  const sessionAdvice = programAdvice ?? genericAdvice;
  const lead = adviceSummary(sessionAdvice, p.units);
  const hasProgression = !!(
    programAdvice ||
    pathNote ||
    genericAdvice ||
    programText ||
    programItem?.notes
  );
  const applyLoad = (weight: number | null) =>
    mutate(() => {
      if (weight == null)
        throw new Error(
          "Choose a working load manually until comparable performance is available.",
        );
      for (const s of plannedSets(sets, !!target)) r.editSet(s.id, { weight });
    });
  const close = () => setSheet(undefined);
  const menu: MenuAction[] = [
    ...(onReorder && (count ?? 0) > 1
      ? [
          {
            label: "Reorder exercises",
            icon: "reorder-four-outline" as const,
            onPress: onReorder,
          },
        ]
      : []),
    {
      label: "Substitute exercise",
      icon: "swap-horizontal",
      onPress: () => setSheet("substitute"),
    },
    {
      label: "Notes, rest & superset",
      icon: "options-outline",
      onPress: () => setSheet("settings"),
    },
    ...(hasProgression
      ? [
          {
            label: "Progression",
            icon: "trending-up" as const,
            onPress: () => setSheet("progression"),
          },
        ]
      : []),
    {
      label: "Remove exercise",
      icon: "trash-outline",
      destructive: true,
      onPress: () =>
        confirm(
          "Remove exercise?",
          "All sets for this movement will also be removed.",
          () => r.removeExercise(e.id),
          { action: "Remove exercise" },
        ),
    },
  ];
  const active = expanded && !readOnly;
  const meta = exercise
    ? [exercise.equipment, exercise.muscle].filter(Boolean).join(" · ")
    : "";
  const complete = sets.length > 0 && done === sets.length;
  return (
    <ForgeCard
      variant={active ? "active" : "default"}
      padding={expanded ? forge.spacing.cardPadding : 12}
      gap={forge.spacing.group}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${name}`}
          accessibilityState={{ expanded }}
          accessibilityValue={{
            text: `${done} of ${sets.length} sets complete`,
          }}
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.group,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {/* The exercise's number in the workout, ember while logging. */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              borderWidth: active ? 2 : 1,
              borderColor: active ? c.emberHot : c.cardBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FText variant="label" weight="700">
              {(index ?? 0) + 1}
            </FText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <FText variant="cardTitle" weight="700" numberOfLines={2}>
              {name}
            </FText>
            {!!meta && (
              <FText variant="label" tone="secondary" numberOfLines={1}>
                {meta}
              </FText>
            )}
            <Txt variant="caption" tone="secondary">
              {/* Reviewing: what was logged, not the plan's target (7.5E). */}
              {keepSegmentsTogether(
                readOnly ? loggedSummary(sets, category, p.units) : summary,
              )}
            </Txt>
          </View>
          {sets.length > 0 &&
            (complete ? (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: c.emberHot,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark" size={16} color={c.onEmber} />
              </View>
            ) : (
              <Txt variant="caption" tone="secondary" tabular>
                {`${done}/${sets.length}`}
              </Txt>
            ))}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-forward"}
            size={18}
            color={c.text2}
          />
        </Pressable>
        {!readOnly && (
          <OverflowMenu
            label={`Options for ${name}`}
            title={name}
            actions={menu}
            icon="ellipsis-vertical"
            renderTrigger={expanded ? MenuSquare : undefined}
          />
        )}
      </View>
      {!!e.groupId && (
        <Txt variant="caption" tone="secondary">
          Superset · {e.groupId}
        </Txt>
      )}
      {expanded && (
        <>
          {programItem?.notes && (
            <NoteLine
              icon="information-circle-outline"
              text={programItem.notes}
              label={`Program note: ${programItem.notes}`}
              hint="Opens progression and program notes"
              onPress={() => setSheet("progression")}
            />
          )}
          {advice && !readOnly && (
            <AdviceRow
              advice={advice}
              icon={adviceIcon}
              units={p.units}
              onApply={() => applyLoad(advice.apply ?? null)}
              onInfo={() => setSheet("progression")}
            />
          )}
          {sets.length > 0 && (
            <SetGrid
              sets={sets}
              category={category}
              showRir={showRir}
              previous={previous}
              rirPlaceholder={
                rirTarget
                  ? rirTarget.min === rirTarget.max
                    ? `${rirTarget.min}`
                    : `${rirTarget.min}-${rirTarget.max}`
                  : undefined
              }
              order={e.position}
              onDetails={(s) => setDetailSetId(s.id)}
              startsRest={!completedWorkout}
              readOnly={readOnly}
            />
          )}
          {!readOnly && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add set"
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
              style={({ pressed }) => ({
                minHeight: 44,
                borderRadius: forge.radii.tile,
                borderWidth: forge.border.card,
                borderColor: c.cardBorder,
                backgroundColor: pressed ? c.cardRaised : c.cardBg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              })}
            >
              <Ionicons name="add-circle-outline" size={20} color={c.text} />
              <FText variant="cardTitle">Add set</FText>
            </Pressable>
          )}
          {/* The reference's inline notes row: the exercise's own notes,
              edited in Exercise settings. */}
          {(!readOnly || !!e.notes) && (
            <NotesRow
              notes={e.notes}
              onPress={readOnly ? undefined : () => setSheet("settings")}
            />
          )}
        </>
      )}
      <Sheet
        visible={!!detailSet}
        onClose={() => setDetailSetId(undefined)}
        title={detailSet ? `Set ${detailSet.position + 1} details` : "Set"}
        dismissOnBackdrop
      >
        <Txt variant="caption" tone="secondary">
          {name}
        </Txt>
        {detailSet && <SetDetails key={detailSet.id} set={detailSet} />}
      </Sheet>
      <Sheet
        visible={sheet === "settings"}
        onClose={close}
        title="Exercise settings"
      >
        <Txt variant="caption" tone="secondary">
          {name}
        </Txt>
        <Field
          label="Exercise notes"
          value={e.notes}
          multiline
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
      </Sheet>
      <Sheet
        visible={sheet === "progression"}
        onClose={() => {
          close();
          setMore(false);
        }}
        title="Progression"
        dismissOnBackdrop
      >
        <Txt variant="caption" tone="secondary">
          {name}
          {rirTarget ? ` · target ${rirLabel(rirTarget)}` : ""}
        </Txt>
        {lead && (
          <View style={{ gap: 6 }}>
            <Txt variant="overline" tone="secondary">
              This session
            </Txt>
            <Txt variant="headline">{lead.headline}</Txt>
            {lead.load && <Txt variant="metric">{lead.load}</Txt>}
            <Txt tone="secondary">{lead.detail}</Txt>
            {sessionAdvice?.weight != null || genericAdvice ? (
              <View style={{ marginTop: 6 }}>
                <Button
                  title="Apply suggested load"
                  variant="secondary"
                  disabled={sessionAdvice?.weight == null}
                  onPress={() => {
                    applyLoad(sessionAdvice?.weight ?? null);
                    close();
                  }}
                />
              </View>
            ) : null}
          </View>
        )}
        {programItem?.notes && (
          <View style={{ gap: 4 }}>
            <Txt variant="overline" tone="secondary">
              Program note
            </Txt>
            <Txt>{programItem.notes}</Txt>
          </View>
        )}
        {(lead?.more ||
          pathNote ||
          programText ||
          programAdvice?.action === "lower-fatigue") && (
          <View style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How this is decided"
              accessibilityState={{ expanded: more }}
              onPress={() => setMore(!more)}
              style={({ pressed }) => ({
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={c.text2}
              />
              <Txt variant="body" weight="600" style={{ flex: 1 }}>
                How this is decided
              </Txt>
              <Ionicons
                name={more ? "chevron-up" : "chevron-down"}
                size={18}
                color={c.text3}
              />
            </Pressable>
            {more && (
              <>
                {programAdvice?.action === "lower-fatigue" && (
                  <Txt variant="caption" tone="secondary">
                    Lower-fatigue session · authored baseline{" "}
                    {programItem?.sets} sets
                  </Txt>
                )}
                {lead?.more && sessionAdvice && (
                  <Txt tone="secondary">{sessionAdvice.reason}</Txt>
                )}
                {pathNote && <Txt tone="secondary">{pathGuidance}</Txt>}
                {programText && (
                  <View style={{ gap: 4 }}>
                    <Txt variant="overline" tone="secondary">
                      Program progression
                    </Txt>
                    <Txt tone="secondary">{programText}</Txt>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </Sheet>
      <ExercisePicker
        visible={sheet === "substitute"}
        onClose={close}
        onPick={(x) => mutate(() => r.editExercise(e.id, { exerciseId: x.id }))}
      />
    </ForgeCard>
  );
}
