import type { Exercise, Prescription } from "../types";
import { prescriptionSchema } from "../validation";
import { estimatedMinutes } from "./duration";
import { forgePaths, movementMenu } from "./catalog";
import {
  pathPreferencesSchema,
  hasEquipment,
  machineRequirement,
  addDays,
  type PathPreferences,
  type PathRole,
  type PathDayStructure,
} from "./model";

export { estimatedMinutes };

export type PathDay = PathDayStructure & { exercises: Prescription[] };
export type PathDraft = {
  engineVersion?: 1 | 2 | 3 | 4 | 5;
  preferences: PathPreferences;
  days: PathDay[];
};
const priorityRole: Record<string, PathRole[]> = {
  Chest: ["push"],
  Back: ["pull"],
  Shoulders: ["shoulder"],
  Quadriceps: ["squat"],
  Hamstrings: ["posterior"],
  Glutes: ["posterior"],
  Arms: ["biceps", "triceps"],
  Core: ["core"],
};
export const roleReasons: Record<PathRole, string> = {
  push: "A pressing slot for chest and pushing strength.",
  pull: "A pulling slot to balance pressing and train the upper back.",
  squat: "Knee-dominant leg work for lower-body practice.",
  posterior: "Posterior-chain work to complement knee-dominant leg work.",
  shoulder: "Focused shoulder training alongside the main lifts.",
  biceps: "Direct elbow-flexion work for an arm emphasis.",
  triceps: "Direct elbow-extension work for an arm emphasis.",
  rear: "Focused rear-delt training to complement rows and side-delt work.",
  calf: "Direct calf training through controlled ankle movement.",
  core: "Controlled trunk work to support the main movements.",
};
export function compatibleMovements(
  p: PathPreferences,
  role: PathRole,
  catalog: Exercise[],
) {
  const level =
    p.experience === "Beginner" ? 0 : p.experience === "Intermediate" ? 1 : 2;
  return movementMenu
    .filter((m) => {
      const e = catalog.find((x) => x.id === m.id);
      return (
        m.role === role &&
        m.level <= level &&
        m.needs.every((n) => hasEquipment(p.equipment, n)) &&
        e &&
        e.category === "strength" &&
        e.difficulty !== "Advanced" &&
        !p.excluded.includes(e.id) &&
        !p.avoidPatterns.includes(e.pattern as (typeof p.avoidPatterns)[number])
      );
    })
    .sort((a, b) => {
      function score(m: (typeof movementMenu)[number]) {
        let value = 0;
        if (p.pathKey === "get-strong")
          value += m.needs.includes("Barbell") ? 30 : 0;
        if (p.pathKey === "athlete-mode")
          value += [
            "bodyweight-split-squat",
            "bird-dog",
            "kettlebell-deadlift",
          ].includes(m.id)
            ? 40
            : 0;
        if (p.pathKey === "start-strong")
          value += [
            "goblet-squat",
            "dumbbell-floor-press",
            "dumbbell-bent-over-row",
            "bodyweight-glute-bridge",
          ].includes(m.id)
            ? 20
            : 0;
        if (p.pathKey === "advanced-physique")
          value += m.needs.some((n) => n === "Cable" || machineRequirement(n))
            ? 10
            : 0;
        if (p.style === "Machines")
          value += m.needs.some((n) => n === "Cable" || machineRequirement(n))
            ? 25
            : 0;
        if (p.style === "Free weights")
          value += m.needs.some((n) =>
            ["Barbell", "Dumbbell", "Kettlebell"].includes(n),
          )
            ? 25
            : 0;
        return value;
      }
      return score(b) - score(a); // Stable tie ordering makes generation reproducible.
    });
}

export function structure(
  p: PathPreferences,
): { name: string; roles: PathRole[] }[] {
  const athlete = p.pathKey === "athlete-mode";
  if (p.frequency <= 3)
    return Array.from({ length: p.frequency }, (_, i) => ({
      name: `${athlete ? "Movement" : p.pathKey === "get-strong" ? "Full-body strength" : "Full body"} ${String.fromCharCode(65 + i)}`,
      roles: athlete
        ? ["squat", "posterior", "pull", "push", "core"]
        : ["squat", "push", "pull", "posterior"],
    }));
  const upper: PathRole[] = ["push", "pull", "shoulder"];
  const lower: PathRole[] = ["squat", "posterior", "core"];
  if (p.frequency === 4)
    return [
      { name: "Upper A", roles: upper },
      { name: "Lower A", roles: lower },
      { name: "Upper B", roles: upper },
      { name: "Lower B", roles: lower },
    ];
  if (p.frequency === 5)
    return [
      { name: "Upper", roles: upper },
      { name: "Lower A", roles: lower },
      { name: "Push", roles: ["push", "shoulder"] },
      { name: "Pull", roles: ["pull", "biceps", "core"] },
      { name: "Lower B", roles: lower },
    ];
  return ["A", "B"].flatMap((suffix) => [
    { name: `Push ${suffix}`, roles: ["push", "shoulder"] as PathRole[] },
    { name: `Pull ${suffix}`, roles: ["pull", "biceps", "core"] as PathRole[] },
    { name: `Legs ${suffix}`, roles: lower },
  ]);
}

function checkPreferences(p: PathPreferences) {
  const path = forgePaths.find((x) => x.key === p.pathKey)!;
  if (p.frequency < path.minDays || p.frequency > path.maxDays)
    throw new Error(
      `${path.name} supports ${path.minDays}–${path.maxDays} training days per week.`,
    );
  if (p.experience === "Beginner" && p.frequency > 3)
    throw new Error(
      "Begin with at most three training days per week, leaving recovery days between sessions.",
    );
  if (p.pathKey === "advanced-physique" && p.experience === "Beginner")
    throw new Error(
      "Advanced Physique is for experienced lifters. Choose another Path while building your foundation.",
    );
}
function offsets(p: PathPreferences) {
  const first = (new Date(`${p.startDate}T12:00:00`).getDay() + 6) % 7;
  return p.weekdays.map((day) => (day - first + 7) % 7).sort((a, b) => a - b);
}
function checkRecovery(days: PathDayStructure[]) {
  // Adjacent sessions must not repeat the same demanding role, including the
  // boundary between two weeks. Core work alone is not a demanding overlap.
  for (let i = 0; i < days.length; i++) {
    const a = days[i]!;
    const b = days[(i + 1) % days.length]!;
    const gap = (b.offset - a.offset + 7) % 7 || 7;
    if (
      gap < 2 &&
      a.roles.some((role) => role !== "core" && b.roles.includes(role))
    )
      throw new Error(
        "These weekdays repeat demanding movements on adjacent days. Spread the sessions out or select fewer training days.",
      );
  }
}

export function generatePath(
  input: PathPreferences,
  catalog: Exercise[],
): PathDraft {
  const p = pathPreferencesSchema.parse(input);
  checkPreferences(p);
  const dates = offsets(p);
  const beginner = p.experience === "Beginner" || p.pathKey === "start-strong";
  const strength = p.pathKey === "get-strong";
  const physique = p.pathKey === "advanced-physique";
  const baseSets =
    beginner || ["lean-strong", "athlete-mode"].includes(p.pathKey)
      ? 2
      : physique
        ? 4
        : 3;
  const reps = strength
    ? beginner
      ? 8
      : 5
    : p.pathKey === "lean-strong"
      ? 12
      : p.pathKey === "athlete-mode"
        ? 6
        : physique
          ? 10
          : 10;
  const rest = strength
    ? 180
    : beginner
      ? 75
      : physique
        ? 120
        : p.pathKey === "lean-strong"
          ? 75
          : 90;
  const days = structure(p).map((day, dayIndex): PathDay => {
    const exercises: Prescription[] = [];
    const roles: PathRole[] = [];
    const add = (role: PathRole, optional: boolean) => {
      const choices = compatibleMovements(p, role, catalog)
        .filter((m) => !exercises.some((x) => x.exerciseId === m.id))
        .filter(
          (m) =>
            !optional ||
            role !== "shoulder" ||
            catalog.find((e) => e.id === m.id)?.pattern ===
              "shoulder isolation",
        );
      if (!choices.length) {
        if (optional) return;
        throw new Error(
          `No compatible ${role} movement is available. Review equipment, exercise exclusions or movements to avoid. A balanced plan cannot be generated with these choices.`,
        );
      }
      const move =
        choices[strength ? 0 : dayIndex % Math.min(choices.length, 2)]!;
      exercises.push({
        exerciseId: move.id,
        sets: optional ? 2 : baseSets,
        reps: optional ? (physique ? 15 : 12) : role === "core" ? 8 : reps,
        weight: 0,
        rest: optional ? 60 : rest,
      });
      roles.push(role);
    };
    day.roles.forEach((role) => add(role, false));
    // Respect session length before adding accessories, never silently remove a
    // required movement. Two main sets remain the minimum foundation dose.
    while (
      estimatedMinutes(exercises, catalog) > p.duration &&
      exercises.some((e) => e.sets > 2)
    )
      exercises.forEach((e) => {
        if (e.sets > 2) e.sets--;
      });
    if (estimatedMinutes(exercises, catalog) > p.duration)
      throw new Error(
        `${day.name} needs about ${estimatedMinutes(exercises, catalog)} minutes including rests. Increase the session duration or adjust training days.`,
      );
    const extras = p.priorities.flatMap((name) => priorityRole[name] ?? []);
    if (physique) extras.push("shoulder", "biceps", "triceps");
    else if (p.pathKey === "lean-strong" || p.pathKey === "athlete-mode")
      extras.push("core");
    else if (!strength) extras.push("core", "shoulder");
    const allowed =
      p.frequency <= 3
        ? [...new Set(extras)]
        : [...new Set(extras)].filter((role) =>
            day.roles.includes("squat")
              ? ["squat", "posterior", "core"].includes(role)
              : !["squat", "posterior"].includes(role) &&
                (day.name.startsWith("Push")
                  ? !["pull", "biceps"].includes(role)
                  : day.name.startsWith("Pull")
                    ? !["push", "shoulder", "triceps"].includes(role)
                    : true),
          );
    for (const role of allowed) {
      if (exercises.length >= (beginner ? 5 : 6)) break;
      const length = exercises.length;
      add(role, true);
      if (
        estimatedMinutes(exercises, catalog) > p.duration ||
        exercises.reduce((n, e) => n + e.sets, 0) > (physique ? 20 : 18)
      ) {
        exercises.splice(length);
        roles.splice(length);
      }
    }
    return {
      key: `day-${dayIndex}`,
      name: day.name,
      offset: dates[dayIndex]!,
      roles,
      exercises,
    };
  });
  checkRecovery(days);
  return validateDraft({ preferences: p, days }, catalog);
}

export function validateDraft(
  draft: PathDraft,
  catalog: Exercise[],
): PathDraft {
  const p = pathPreferencesSchema.parse(draft.preferences);
  checkPreferences(p);
  const required = structure(p);
  if (draft.days.length !== p.frequency)
    throw new Error("Plan days do not match your weekly availability.");
  const dates = offsets(p);
  draft.days.forEach((day, i) => {
    if (
      day.offset !== dates[i] ||
      day.key !== `day-${i}` ||
      !day.name.trim() ||
      day.name.length > 80
    )
      throw new Error("Training day names, dates or identities are invalid.");
    if (
      day.exercises.length !== day.roles.length ||
      day.roles.length < required[i]!.roles.length ||
      day.roles.length > 6
    )
      throw new Error(
        "Keep the required movement slots and at most six exercises per session.",
      );
    if (required[i]!.roles.some((role, index) => day.roles[index] !== role))
      throw new Error("Keep the balanced movement structure of this Path.");
    if (
      new Set(day.exercises.map((e) => e.exerciseId)).size !==
      day.exercises.length
    )
      throw new Error("Choose distinct exercises within a session.");
    day.exercises.forEach((raw, j) => {
      const item = prescriptionSchema.parse(raw);
      if (
        !compatibleMovements(p, day.roles[j]!, catalog).some(
          (e) => e.id === item.exerciseId,
        )
      )
        throw new Error(
          "An exercise conflicts with the plan's equipment, movement or experience restrictions.",
        );
      if (
        item.sets < 1 ||
        item.sets > (p.experience === "Beginner" ? 3 : 5) ||
        item.reps < 1 ||
        item.reps > 20 ||
        item.rest < 45
      )
        throw new Error(
          "Use 1–3 sets for beginners (1–5 for experienced lifters), 1–20 reps and at least 45 seconds rest.",
        );
    });
    if (
      day.exercises.reduce((n, e) => n + e.sets, 0) >
      (p.pathKey === "advanced-physique" ? 20 : 18)
    )
      throw new Error("Keep working sets within this Path's session limit.");
    if (estimatedMinutes(day.exercises, catalog) > p.duration)
      throw new Error(
        "This edit exceeds your preferred session duration. Reduce sets or increase duration in setup.",
      );
  });
  checkRecovery(draft.days);
  return JSON.parse(JSON.stringify(draft)) as PathDraft;
}

export function scheduledDates(draft: PathDraft) {
  return Array.from({ length: 8 }, (_, w) =>
    draft.days.map((day, i) => ({
      date: addDays(draft.preferences.startDate, w * 7 + day.offset),
      week: w + 1,
      dayIndex: i,
      phase: w < 4 ? ("foundation" as const) : ("evolution" as const),
    })),
  ).flat();
}
