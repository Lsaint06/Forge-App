import React, { useState } from "react";
import { View, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Label, Button, Card, NumberField, useColors } from "./ui";
import { SectionHeader } from "./design";
import { theme } from "../theme";
import { useRepo } from "../state";
import type { Exercise, Prescription } from "../domain/types";
import { kgToLb, lbToKg } from "../domain/metrics";
import { repRangeLabel } from "../domain/prescriptions";
import { exerciseStimulus } from "../domain/paths/stimulus";
import {
  compatibleMovements,
  evolutionDays,
  roleReasons,
  type PathDay,
  type PathDraft,
} from "../domain/paths/generator";
import {
  addDays,
  weekdayNames,
  type PathPreferences,
  type PathRole,
} from "../domain/paths/model";
import {
  directSets,
  maxSetsPerExercise,
  prescriptionGuidance,
} from "../domain/paths/policy";
import type { Finding } from "../domain/paths/programQuality";

const restOptions = [60, 90, 120, 150, 180, 240];
function restLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${seconds}s`;
  return rest
    ? `${minutes}:${String(rest).padStart(2, "0")}`
    : `${minutes} min`;
}
const workingSets = (items: Prescription[]) =>
  items.reduce((n, e) => n + e.sets, 0);

export function topMuscles(items: Prescription[], count = 3) {
  return Object.entries(directSets(items))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([muscle]) => muscle);
}

// Alternatives that keep the slot's training purpose: same movement role and
// equipment rules, ranked by matching pattern, then primary muscle, then
// loading type (compound versus isolation).
export function rankedSubstitutes(
  preferences: PathPreferences,
  role: PathRole,
  currentId: string,
  dayItems: Prescription[],
  catalog: Exercise[],
) {
  const current = catalog.find((e) => e.id === currentId);
  const currentStimulus = exerciseStimulus(currentId);
  return compatibleMovements(preferences, role, catalog)
    .filter(
      (m) => m.id !== currentId && !dayItems.some((e) => e.exerciseId === m.id),
    )
    .map((m) => {
      const exercise = catalog.find((e) => e.id === m.id)!;
      const stimulus = exerciseStimulus(m.id);
      const samePattern = exercise.pattern === current?.pattern;
      const sameMuscle = stimulus.direct[0] === currentStimulus.direct[0];
      const sameLoading = stimulus.isolation === currentStimulus.isolation;
      return {
        exercise,
        score:
          Number(samePattern) * 4 +
          Number(sameMuscle) * 2 +
          Number(sameLoading),
        note:
          samePattern && sameLoading
            ? "Same movement pattern"
            : sameMuscle && stimulus.isolation
              ? `Isolation option for ${stimulus.direct[0]?.toLowerCase()}`
              : sameMuscle
                ? `Compound option for ${stimulus.direct[0]?.toLowerCase()}`
                : "Different emphasis",
      };
    })
    .sort((a, b) => b.score - a.score);
}

function Stepper({
  caption,
  a11y,
  value,
  min,
  max,
  onChange,
}: {
  caption: string;
  a11y: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const c = useColors();
  const button = (icon: "remove" | "add", label: string, next: number) => {
    const disabled = next < min || next > max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${a11y}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(next)}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: theme.radii.control,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.elevated,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name={icon} size={18} color={c.text} />
      </Pressable>
    );
  };
  return (
    <View style={{ alignItems: "center", gap: 6, minWidth: 104 }}>
      <Label muted size={12}>
        {caption}
      </Label>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {button("remove", "Decrease", value - 1)}
        <Text
          accessibilityLabel={`${a11y}: ${value}`}
          style={{
            color: c.text,
            fontSize: 18,
            fontWeight: "700",
            minWidth: 24,
            textAlign: "center",
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
        {button("add", "Increase", value + 1)}
      </View>
    </View>
  );
}

function ExerciseRow({
  dayName,
  index,
  item,
  role,
  preferences,
  catalog,
  siblings,
  lead,
  later,
  open,
  onToggle,
  onChange,
}: {
  dayName: string;
  index: number;
  item: Prescription;
  role: PathRole;
  preferences: PathPreferences;
  catalog: Exercise[];
  siblings: Prescription[];
  lead: boolean;
  later?: Prescription;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Prescription>) => void;
}) {
  const c = useColors();
  const units = useRepo().profile().units;
  const [swapping, setSwapping] = useState(false);
  const [more, setMore] = useState(false);
  const exercise = catalog.find((e) => e.id === item.exerciseId);
  const name = exercise?.name ?? "Movement unavailable";
  const muscle =
    exerciseStimulus(item.exerciseId).direct[0] ?? exercise?.muscle;
  const label = `${dayName} exercise ${index + 1}`;
  const top = item.repMax ?? item.reps;
  const guidance = prescriptionGuidance(preferences, item, catalog, lead);
  const changesLater =
    later &&
    (later.sets !== item.sets ||
      later.reps !== item.reps ||
      (later.repMax ?? later.reps) !== top);
  const rests = restOptions.includes(item.rest)
    ? restOptions
    : [...restOptions, item.rest].sort((a, b) => a - b);
  return (
    <View
      style={{
        borderTopWidth: index ? 1 : 0,
        borderColor: c.border,
        paddingVertical: 10,
        gap: 12,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${item.sets} sets of ${repRangeLabel(item)} reps. ${open ? "Hide" : "Edit"} ${name}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 44,
        }}
      >
        <Label muted size={12}>
          {String(index + 1).padStart(2, "0")}
        </Label>
        <View style={{ flex: 1 }}>
          <Label bold size={15}>
            {name}
          </Label>
          {muscle && (
            <Label muted size={12}>
              {muscle}
            </Label>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Label bold style={{ fontVariant: ["tabular-nums"] }}>
            {item.sets} × {repRangeLabel(item)}
          </Label>
          {changesLater && (
            <Label muted size={11}>
              wk 5–8: {later!.sets} × {repRangeLabel(later!)}
            </Label>
          )}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.muted}
        />
      </Pressable>
      {open && (
        <View style={{ gap: 14, paddingLeft: 4 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "flex-start",
              columnGap: 24,
              rowGap: 12,
            }}
          >
            <Stepper
              caption="Sets"
              a11y={`${label} sets`}
              value={item.sets}
              min={1}
              max={maxSetsPerExercise(preferences, false)}
              onChange={(sets) => onChange({ sets })}
            />
            {/* The two rep boundaries stay together as one range control. */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Stepper
                caption="Reps from"
                a11y={`${label} reps`}
                value={item.reps}
                min={1}
                max={30}
                onChange={(reps) =>
                  onChange({ reps, repMax: Math.max(reps, top) })
                }
              />
              <Stepper
                caption="Reps to"
                a11y={`${label} maximum reps`}
                value={top}
                min={item.reps}
                max={30}
                onChange={(repMax) => onChange({ repMax })}
              />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Label muted size={12}>
              Rest between sets
            </Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {rests.map((seconds) => {
                const selected = seconds === item.rest;
                return (
                  <Pressable
                    key={seconds}
                    accessibilityRole="button"
                    accessibilityLabel={restLabel(seconds)}
                    accessibilityState={{ selected }}
                    onPress={() => onChange({ rest: seconds })}
                    style={{
                      minHeight: 40,
                      minWidth: 56,
                      paddingHorizontal: 12,
                      borderRadius: theme.radii.control,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? c.accent : c.elevated,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? c.background : c.text,
                        fontWeight: "600",
                      }}
                    >
                      {restLabel(seconds)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 2 }}>
            <Label size={13}>
              <Text style={{ fontWeight: "700" }}>Effort · </Text>
              About {guidance.effort} on each working set.
            </Label>
            {guidance.phases && (
              <Label muted size={13}>
                {guidance.phases.foundation} {guidance.phases.evolution}
              </Label>
            )}
            <Label muted size={13}>
              {guidance.progression}
            </Label>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              title={swapping ? "Keep this exercise" : `Swap ${name}`}
              icon="swap-horizontal"
              secondary
              onPress={() => setSwapping(!swapping)}
            />
            <Button
              title={more ? "Hide starting load" : "Set starting load"}
              secondary
              onPress={() => setMore(!more)}
            />
          </View>
          {swapping && (
            <View style={{ gap: 4 }}>
              <Label muted size={12}>
                {roleReasons[role]}
              </Label>
              {rankedSubstitutes(
                preferences,
                role,
                item.exerciseId,
                siblings,
                catalog,
              ).map(({ exercise: alt, note }) => (
                <Pressable
                  key={alt.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${alt.name}`}
                  onPress={() => {
                    onChange({ exerciseId: alt.id });
                    setSwapping(false);
                  }}
                  style={({ pressed }) => ({
                    padding: 10,
                    borderRadius: theme.radii.control,
                    backgroundColor: pressed ? c.elevated : "transparent",
                    borderWidth: 1,
                    borderColor: c.border,
                  })}
                >
                  <Label bold size={14}>
                    {alt.name}
                  </Label>
                  <Label muted size={12}>
                    {note} · {alt.equipment}
                  </Label>
                </Pressable>
              ))}
            </View>
          )}
          {more && (
            <NumberField
              label={`${label} load (${units})`}
              value={units === "lb" ? kgToLb(item.weight) : item.weight}
              min={0}
              max={units === "lb" ? kgToLb(2000) : 2000}
              onSave={(weight) =>
                onChange({ weight: units === "lb" ? lbToKg(weight!) : weight! })
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

export function PlanFindings({
  findings,
  empty,
}: {
  findings: Finding[];
  empty?: string;
}) {
  const c = useColors();
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  if (!findings.length)
    return empty ? (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Ionicons name="checkmark-circle" size={18} color={c.success} />
        <Label muted size={13}>
          {empty}
        </Label>
      </View>
    ) : null;
  // Several weekly-volume findings of the same kind collapse into one line;
  // single findings keep their full explanation.
  const lines = (items: Finding[]) => {
    const out: { key: string; text: string }[] = [];
    const grouped = new Set<string>();
    for (const [i, f] of items.entries()) {
      const same = items.filter((x) => x.code === f.code && x.volume);
      if (f.volume && same.length > 1) {
        if (grouped.has(f.code)) continue;
        grouped.add(f.code);
        const list = same
          .map(
            (x) =>
              `${x.volume!.muscle} ${x.volume!.sets} of ${x.volume!.target}`,
          )
          .join(", ");
        out.push({
          key: f.code,
          text:
            f.code === "weekly-volume-low"
              ? `Weekly direct sets below the starting point for your level and frequency: ${list}.`
              : `Weekly sets above the usual ceiling: ${list}. Keep them only if you recover well.`,
        });
      } else out.push({ key: `${f.code}-${i}`, text: f.message });
    }
    return out;
  };
  const group = (
    items: Finding[],
    title: string,
    icon: "alert-circle" | "information-circle",
    color: string,
  ) =>
    items.length > 0 && (
      <View style={{ gap: 6 }} accessibilityRole="summary">
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Ionicons name={icon} size={18} color={color} />
          <Label bold size={14}>
            {title}
          </Label>
        </View>
        {lines(items).map((line) => (
          <Label key={line.key} muted size={13}>
            {line.text}
          </Label>
        ))}
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      {group(errors, "Fix before starting", "alert-circle", c.error)}
      {group(warnings, "Worth reviewing", "information-circle", c.muted)}
    </View>
  );
}

export function PathDayEditor({
  day,
  preferences,
  catalog,
  onChange,
  findings = [],
  showHeader = true,
  laterDay,
}: {
  day: PathDay;
  preferences: PathPreferences;
  catalog: Exercise[];
  onChange: (day: PathDay) => void;
  findings?: Finding[];
  showHeader?: boolean;
  // The same day's weeks 5–8 prescription, when it is known.
  laterDay?: PathDay;
}) {
  const [open, setOpen] = useState<number>();
  const leadIndex = day.exercises.findIndex((e) => {
    const s = exerciseStimulus(e.exerciseId);
    return (
      !s.isolation && !(s.direct.length && s.direct.every((m) => m === "Core"))
    );
  });
  function update(index: number, patch: Partial<Prescription>) {
    onChange({
      ...day,
      exercises: day.exercises.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    });
  }
  return (
    <View style={{ gap: 10 }}>
      {showHeader && (
        <View style={{ gap: 2 }}>
          <Label bold size={20}>
            {day.name}
          </Label>
          <Label muted size={13}>
            {day.exercises.length} exercises · {workingSets(day.exercises)}{" "}
            working sets · train at your own pace with the listed rests
          </Label>
        </View>
      )}
      <PlanFindings
        findings={findings.filter((f) => f.dayKeys.includes(day.key))}
      />
      <View>
        {day.exercises.map((item, index) => (
          <ExerciseRow
            key={`${day.key}-${index}`}
            dayName={day.name}
            index={index}
            item={item}
            role={day.roles[index]!}
            preferences={preferences}
            catalog={catalog}
            siblings={day.exercises}
            lead={index === leadIndex}
            later={
              laterDay?.exercises[index]?.exerciseId === item.exerciseId
                ? laterDay.exercises[index]
                : undefined
            }
            open={open === index}
            onToggle={() => setOpen(open === index ? undefined : index)}
            onChange={(patch) => update(index, patch)}
          />
        ))}
      </View>
    </View>
  );
}

export function WeekOverview({
  days,
  dayLabels,
  preferences,
  catalog,
  findings,
  onChangeDay,
  evolution,
}: {
  days: PathDay[];
  dayLabels: string[];
  preferences: PathPreferences;
  catalog: Exercise[];
  findings: Finding[];
  onChangeDay: (day: PathDay) => void;
  evolution?: PathDay[];
}) {
  const c = useColors();
  const [open, setOpen] = useState<string | undefined>(days[0]?.key);
  return (
    <View style={{ gap: 10 }}>
      {days.map((day, index) => {
        const expanded = open === day.key;
        const dayFindings = findings.filter((f) => f.dayKeys.includes(day.key));
        const flagged = dayFindings.some((f) => f.severity === "error")
          ? c.error
          : dayFindings.length
            ? c.muted
            : undefined;
        return (
          <View
            key={day.key}
            style={{
              backgroundColor: c.surface,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: expanded ? c.accent : c.border,
              padding: theme.spacing.md,
              gap: 10,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${dayLabels[index]}: ${day.name}, ${day.exercises.length} exercises, ${workingSets(day.exercises)} sets. ${expanded ? "Collapse" : "Expand"}`}
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? undefined : day.key)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Label muted size={11} bold style={{ letterSpacing: 1.5 }}>
                  {dayLabels[index]?.toUpperCase()}
                </Label>
                <Label bold size={17}>
                  {day.name}
                </Label>
                <Label muted size={13}>
                  {day.exercises.length} exercises ·{" "}
                  {workingSets(day.exercises)} sets ·{" "}
                  {topMuscles(day.exercises).join(", ")}
                </Label>
              </View>
              {flagged && (
                <Ionicons name="alert-circle" size={18} color={flagged} />
              )}
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={c.muted}
              />
            </Pressable>
            {expanded && (
              <PathDayEditor
                day={day}
                preferences={preferences}
                catalog={catalog}
                findings={findings}
                onChange={onChangeDay}
                showHeader={false}
                laterDay={evolution?.[index]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// What changes between the phases, in one sentence.
export function evolutionSummary(foundation: PathDay[], evolution: PathDay[]) {
  const pairs = foundation.flatMap((day, i) =>
    day.exercises.map((item, j) => [item, evolution[i]?.exercises[j]] as const),
  );
  const added = pairs.reduce(
    (n, [a, b]) => n + Math.max(0, (b?.sets ?? a.sets) - a.sets),
    0,
  );
  const heavier = pairs.filter(
    ([a, b]) => b && (b.repMax ?? b.reps) < (a.repMax ?? a.reps),
  ).length;
  if (added)
    return `Same exercises with ${added} more accessory set${added === 1 ? "" : "s"} across the week, and aim for the harder end of each effort target.`;
  if (heavier)
    return `Same exercises. Main lifts move one rep heavier, and aim for the harder end of each effort target.`;
  return "Same workouts. Keep adding reps, then load, within each range.";
}

export function PlanPreview({
  draft,
  catalog,
  pathName,
  findings,
  detailsTitle,
  onChange,
  onStart,
  onDetails,
  onBack,
}: {
  draft: PathDraft;
  catalog: Exercise[];
  pathName: string;
  findings: Finding[];
  detailsTitle: string;
  onChange: (draft: PathDraft) => void;
  onStart: () => void;
  onDetails: () => void;
  onBack: () => void;
}) {
  const evolution = evolutionDays(draft, catalog);
  const blocked = findings.some((f) => f.severity === "error");
  const all = draft.days.flatMap((d) => d.exercises);
  const later = workingSets(evolution.flatMap((d) => d.exercises));
  const counts = draft.days.map((d) => d.exercises.length);
  return (
    // A readable column on tablets and wide screens; full width on phones.
    <View
      style={{
        gap: theme.spacing.lg,
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
    >
      <SectionHeader title="Your plan, before you commit." detail={pathName} />
      <Card>
        <Label bold size={23}>
          {draft.preferences.frequency} days a week. Eight weeks.
        </Label>
        <Label muted>
          Starts {draft.preferences.startDate} · {draft.preferences.experience}{" "}
          · Built around your equipment
        </Label>
        <View style={{ flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
          <View>
            <Label bold size={22}>
              {workingSets(all)}
              {later !== workingSets(all) ? ` → ${later}` : ""}
            </Label>
            <Label muted size={12}>
              {later !== workingSets(all)
                ? "weekly sets, weeks 1–4 → 5–8"
                : "working sets a week"}
            </Label>
          </View>
          <View>
            <Label bold size={22}>
              {Math.min(...counts)}–{Math.max(...counts)}
            </Label>
            <Label muted size={12}>
              exercises per day
            </Label>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Label size={13}>
            <Text style={{ fontWeight: "700" }}>Weeks 1–4 · Foundation. </Text>
            Learn the movements and settle loads at the easier end of each
            effort target.
          </Label>
          <Label size={13}>
            <Text style={{ fontWeight: "700" }}>Weeks 5–8 · Evolution. </Text>
            {evolutionSummary(draft.days, evolution)}
          </Label>
        </View>
        <PlanFindings
          findings={findings}
          empty="Balanced week, within recommended volume for your level."
        />
      </Card>
      <Label muted size={13}>
        Tap a day to review it. Open an exercise to adjust sets, reps or rest,
        or swap it for an alternative. Every change is checked as you go.
      </Label>
      <WeekOverview
        days={draft.days}
        dayLabels={draft.days.map(
          (day, i) =>
            `${weekdayNames[(new Date(`${addDays(draft.preferences.startDate, day.offset)}T12:00:00`).getDay() + 6) % 7]} · Day ${i + 1}`,
        )}
        preferences={draft.preferences}
        catalog={catalog}
        findings={findings}
        evolution={evolution}
        onChangeDay={(day) =>
          onChange({
            ...draft,
            days: draft.days.map((d) => (d.key === day.key ? day : d)),
          })
        }
      />
      <Button
        title="Start this Path"
        icon="trail-sign-outline"
        disabled={blocked}
        onPress={onStart}
      />
      {blocked && (
        <Label muted size={13}>
          Resolve the items under &ldquo;Fix before starting&rdquo; to start
          this Path.
        </Label>
      )}
      <Button title={detailsTitle} secondary onPress={onDetails} />
      <Button title="Back to personalization" secondary onPress={onBack} />
    </View>
  );
}
