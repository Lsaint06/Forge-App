import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "./ui";
import { ListRow, InfoSheet } from "./system";
import { FText, ForgeCard, Metric, RowDivider, StatStrip } from "./reforge";
import { useRepo } from "../state";
import type { CuratedProgram, ProgramSession } from "../domain/programs/model";
import { totalSessions } from "../domain/programs/enrollment";
import {
  phaseSummary,
  phaseTimeline,
  prescriptionLine,
  programWorkouts,
  rangeText,
  type PhaseStep,
} from "../domain/programs/presentation";
import { restDayNames } from "../domain/profile";
import { forge } from "../theme";

// Forge Paths building blocks (REFORGE, Phase 7.2C). They present a curated
// program exactly as authored; nothing is recalculated here.

export const shortDay = (i: number) => restDayNames[i]!.slice(0, 3);

/** Days a week, length and, for fixed-length programs, total sessions. */
export function ProgramStats({ program }: { program: CuratedProgram }) {
  const total = totalSessions(program);
  return (
    <StatStrip minColumn={72}>
      <Metric value={String(program.daysPerWeek)} label="Days a week" />
      <Metric
        value={
          program.durationWeeks !== undefined
            ? String(program.durationWeeks)
            : "Ongoing"
        }
        label={program.durationWeeks ? "Weeks" : "Length"}
      />
      {total !== undefined && <Metric value={String(total)} label="Sessions" />}
    </StatStrip>
  );
}

/** Monday–Sunday, training days filled; the rest day is marked. */
export function WeekStrip({
  days,
  restDay,
}: {
  days: number[];
  restDay?: number;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`Training days: ${days.map((d) => restDayNames[d]).join(", ")}`}
      style={{ flexDirection: "row", gap: 6 }}
    >
      {restDayNames.map((name, i) => {
        const training = days.includes(i);
        return (
          <View
            key={name}
            style={{
              flex: 1,
              height: 40,
              borderRadius: forge.radii.tile,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: training ? c.emberTint : "transparent",
              borderWidth: forge.border.active,
              borderColor: training ? c.emberMuted : c.cardBorder,
            }}
          >
            <FText
              variant="label"
              weight={training ? "700" : "500"}
              tone={training ? "accent" : "secondary"}
            >
              {name.charAt(0)}
            </FText>
            {i === restDay && (
              <View
                style={{
                  position: "absolute",
                  bottom: 5,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: c.text3,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function PhaseSheet({
  program,
  step,
  onClose,
}: {
  program: CuratedProgram;
  step: PhaseStep | undefined;
  onClose: () => void;
}) {
  const phase = step?.phase;
  const lf = program.lowerFatigue;
  const paragraphs = !step
    ? []
    : [
        ...(phase?.notes ? [phase.notes] : []),
        ...(phase?.rir
          ? [
              `Target effort (reps in reserve): primary lifts ${rangeText(phase.rir.primary)}, secondary lifts ${rangeText(phase.rir.secondary)}, accessories ${rangeText(phase.rir.accessory)}.`,
            ]
          : []),
        ...(step.lowerFatigue && lf
          ? [
              `A planned lower-fatigue week: about ${Math.round(lf.setReduction * 100)}% fewer working sets at ${rangeText(lf.rir)} RIR, with no load increase. You can train normally if your recovery is good.`,
            ]
          : step.reduction !== undefined
            ? [
                `About ${Math.round(step.reduction * 100)}% fewer working sets than the listed workouts. The program itself is unchanged.`,
              ]
            : []),
        ...(!step.lowerFatigue && lf
          ? [
              `Whenever fatigue builds up you can choose a lower-fatigue session: about ${Math.round(lf.setReduction * 100)}% fewer working sets at ${rangeText(lf.rir)} RIR.`,
            ]
          : []),
      ];
  return (
    <InfoSheet
      visible={!!step}
      onClose={onClose}
      title={step?.name ?? ""}
      paragraphs={paragraphs}
    />
  );
}

/** Phases in order with effort and planned volume; tap for the details. */
export function PhaseTimeline({ program }: { program: CuratedProgram }) {
  const c = useColors();
  const steps = phaseTimeline(program);
  const [open, setOpen] = useState<PhaseStep>();
  const fixed = steps.every((s) => s.phase.weeks);
  return (
    <View style={{ gap: forge.spacing.tight }}>
      {fixed && steps.length > 1 && (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", gap: 3, marginHorizontal: 4 }}
        >
          {steps.map((s) => (
            <View
              key={s.index}
              style={{
                flex: s.phase.weeks,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  s.lowerFatigue || s.reduction !== undefined
                    ? c.emberMuted
                    : c.emberHot,
              }}
            />
          ))}
        </View>
      )}
      <ForgeCard padding={0} gap={0}>
        {steps.map((s, i) => (
          <React.Fragment key={s.index}>
            {i > 0 && <RowDivider />}
            <ListRow
              title={s.name}
              subtitle={phaseSummary(s) || undefined}
              accessibilityLabel={`${s.name}, details`}
              onPress={() => setOpen(s)}
            />
          </React.Fragment>
        ))}
      </ForgeCard>
      <PhaseSheet
        program={program}
        step={open}
        onClose={() => setOpen(undefined)}
      />
    </View>
  );
}

/** The workout's exercises with their authored prescriptions. */
export function ExerciseLines({
  session,
  setReduction,
}: {
  session: ProgramSession;
  setReduction?: number;
}) {
  const r = useRepo();
  return (
    <View style={{ gap: 10 }}>
      {session.notes && (
        <FText variant="label" tone="secondary">
          {session.notes}
        </FText>
      )}
      {session.exercises.map((item, i) => (
        <View
          key={`${item.exerciseId}-${i}`}
          style={{ flexDirection: "row", gap: 10 }}
        >
          <FText
            variant="label"
            tone="accent"
            weight="700"
            style={{ width: 18, fontVariant: ["tabular-nums"] }}
          >
            {i + 1}
          </FText>
          <View style={{ flex: 1, gap: 2 }}>
            <FText variant="body" weight="600">
              {r.exercise(item.exerciseId)?.name ?? item.exerciseId}
            </FText>
            <FText variant="label" tone="secondary">
              {prescriptionLine(item, setReduction)}
            </FText>
            {item.notes && (
              <FText variant="label" tone="secondary">
                {item.notes}
              </FText>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A workout that expands to its exercises. */
export function WorkoutRow({
  session,
  detail,
  setReduction,
  initiallyOpen = false,
  countOnly = false,
}: {
  session: ProgramSession;
  /** Extra context under the name, e.g. the phases that use it. */
  detail?: string;
  setReduction?: number;
  initiallyOpen?: boolean;
  /** Under a heading that already names the workout: "6 exercises" only. */
  countOnly?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  const count = `${session.exercises.length} ${session.exercises.length === 1 ? "exercise" : "exercises"}`;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={countOnly ? count : `${session.name}, ${count}`}
        accessibilityHint={open ? "Hides the exercises" : "Shows the exercises"}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({
          minHeight: 56,
          paddingHorizontal: forge.spacing.cardPadding,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: forge.spacing.group,
          backgroundColor: pressed ? c.cardRaised : undefined,
        })}
      >
        {countOnly ? (
          <FText variant="body" weight="600" style={{ flex: 1 }}>
            {count}
          </FText>
        ) : (
          <View style={{ flex: 1, gap: 2 }}>
            <FText variant="cardTitle" weight="700">
              {session.name}
            </FText>
            <FText variant="label" tone="secondary">
              {detail ? `${count} · ${detail}` : count}
            </FText>
          </View>
        )}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.text2}
        />
      </Pressable>
      {open && (
        <View
          style={{
            paddingHorizontal: forge.spacing.cardPadding,
            paddingBottom: forge.spacing.cardPadding,
          }}
        >
          <ExerciseLines session={session} setReduction={setReduction} />
        </View>
      )}
    </View>
  );
}

/**
 * Every distinct workout once. When a phase changes a workout in any way,
 * each version is listed with the phases that use it, so no phase-specific
 * programming is hidden.
 */
export function WorkoutList({ program }: { program: CuratedProgram }) {
  const { workouts, uniform } = programWorkouts(program);
  const all = program.phases.length;
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <ForgeCard padding={0} gap={0}>
        {workouts.map((w, i) => (
          <React.Fragment key={`${w.session.id}-${i}`}>
            {i > 0 && <RowDivider />}
            <WorkoutRow
              session={w.session}
              detail={
                uniform
                  ? undefined
                  : w.phases.length === all
                    ? "Every phase"
                    : w.phases.map((p) => program.phases[p]!.name).join(", ")
              }
            />
          </React.Fragment>
        ))}
      </ForgeCard>
      {all > 1 && (
        <FText
          variant="label"
          tone="secondary"
          style={{ paddingHorizontal: 2 }}
        >
          {uniform
            ? "The same workouts run in every phase; effort and volume follow the phase."
            : "Some workouts change between phases; each version is listed with its phases."}
        </FText>
      )}
    </View>
  );
}
