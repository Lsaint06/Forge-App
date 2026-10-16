import type { Exercise } from "../types";
import type { PathDay, PathDraft } from "./legacyGenerator";
import { compatibleMovements } from "./legacyGenerator";
import { menuMovement } from "./catalog";
import type { PathPreferences } from "./model";
import { exerciseStimulus } from "./stimulus";
import { auditWeek } from "./weekAudit";
import {
  directExposures,
  directSets,
  exerciseTier,
  goalOf,
  isHeavyStrength,
  maxSetsPerExercise,
  muscleLoad,
  PULL_TO_PUSH,
  SECONDARY_WEIGHT,
  secondarySets,
  sessionExerciseCap,
  sessionMuscleCap,
  sessionSetLimit,
  weeklyVolumeTarget,
} from "./policy";

// Central program-quality assessment. Generation, saved-plan validation and
// live customization feedback all use this one function so the same rules
// apply everywhere. Errors break an essential integrity rule and block a plan;
// warnings flag choices worth reviewing without overriding the user.
export type Finding = {
  severity: "error" | "warning";
  code:
    | "week-balance"
    | "duplication"
    | "exercise-count"
    | "session-volume"
    | "session-muscle-volume"
    | "set-count"
    | "prescription"
    | "rest"
    | "equipment"
    | "weekly-volume-high"
    | "weekly-volume-low"
    | "pattern-balance"
    | "lower-back"
    | "recovery"
    | "redundancy"
    | "experience"
    | "progression";
  dayKeys: string[];
  message: string;
  // Structured detail for weekly volume findings, so the UI can group them.
  volume?: { muscle: string; sets: number; target: number };
};

// Excess beyond a muscle's weekly ceiling becomes an error past this factor;
// between the ceiling and this point it is a warning the user may accept.
const WEEKLY_EXCESS_ERROR = 1.25;
const SESSION_SET_HARD_LIMIT = 30;

const round = (n: number) => Math.round(n * 10) / 10;
const list = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
    : (items[0] ?? "");

export function assessProgram(
  draft: Pick<PathDraft, "preferences" | "days">,
  catalog: Exercise[],
): Finding[] {
  const p = draft.preferences;
  const goal = goalOf(p);
  const findings: Finding[] = [];
  const add = (
    severity: Finding["severity"],
    code: Finding["code"],
    dayKeys: string[],
    message: string,
    volume?: Finding["volume"],
  ) =>
    findings.push({
      severity,
      code,
      dayKeys,
      message,
      ...(volume ? { volume } : {}),
    });
  const name = (id: string) =>
    catalog.find((e) => e.id === id)?.name ?? "This movement";

  for (const day of draft.days) {
    day.exercises.forEach((item, index) => {
      const role = day.roles[index];
      if (
        role &&
        !compatibleMovements(p, role, catalog).some(
          (m) => m.id === item.exerciseId,
        )
      )
        add(
          "error",
          "equipment",
          [day.key],
          `${name(item.exerciseId)} conflicts with your equipment, exclusions or experience level.`,
        );
      if (item.sets > maxSetsPerExercise(p, false) || item.sets < 1)
        add(
          "error",
          "set-count",
          [day.key],
          `${name(item.exerciseId)} has ${item.sets} sets. Use 1–${maxSetsPerExercise(p, false)} working sets per exercise at this level.`,
        );
      else if (item.sets > maxSetsPerExercise(p, true))
        add(
          "warning",
          "set-count",
          [day.key],
          `${name(item.exerciseId)} has ${item.sets} sets. More sets are not automatically better; consider another exercise or day for that work.`,
        );
      const top = item.repMax ?? item.reps;
      if (item.reps < 1 || top > 30 || top < item.reps)
        add(
          "error",
          "prescription",
          [day.key],
          `${name(item.exerciseId)} needs a rep target between 1 and 30 with the upper value at or above the lower.`,
        );
      if (item.rest < 45)
        add(
          "error",
          "rest",
          [day.key],
          `${name(item.exerciseId)} needs at least 45 seconds of rest between sets.`,
        );
      const tier = exerciseTier(
        item.exerciseId,
        catalog,
        goal === "strength" && isHeavyStrength(item),
      );
      if (
        tier !== "isolation" &&
        tier !== "core" &&
        top <= 6 &&
        item.rest < 150
      )
        add(
          "warning",
          "rest",
          [day.key],
          `${name(item.exerciseId)} is heavy (${top} reps or fewer). Two and a half to three minutes or more between sets protects performance.`,
        );
      if (tier === "isolation" && top < 6)
        add(
          "warning",
          "prescription",
          [day.key],
          `${name(item.exerciseId)} is an isolation exercise; very low reps add joint stress without a clear benefit. Try 8 or more.`,
        );
      if (
        goal !== "strength" &&
        tier !== "core" &&
        (item.repMax == null || item.repMax === item.reps) &&
        goal !== "foundation"
      )
        add(
          "warning",
          "progression",
          [day.key],
          `${name(item.exerciseId)} has a fixed rep target. A range (for example ${item.reps}–${item.reps + 2}) lets you add reps before adding load.`,
        );
    });
    // Session-level findings follow the exercise-specific ones.
    if (day.exercises.length > sessionExerciseCap(p))
      add(
        "error",
        "exercise-count",
        [day.key],
        `${day.name} has ${day.exercises.length} exercises. Keep ${p.experience.toLowerCase()} sessions to ${sessionExerciseCap(p)} or fewer.`,
      );
    const total = day.exercises.reduce((n, e) => n + e.sets, 0);
    if (total > SESSION_SET_HARD_LIMIT)
      add(
        "error",
        "session-volume",
        [day.key],
        `${day.name} has ${total} working sets. Keep any session under ${SESSION_SET_HARD_LIMIT + 1}.`,
      );
    else if (total > sessionSetLimit(p))
      add(
        "warning",
        "session-volume",
        [day.key],
        `${day.name} has ${total} working sets, above the usual ${sessionSetLimit(p)} for this level. Set quality usually drops late in long sessions.`,
      );
    for (const [muscle, load] of Object.entries(muscleLoad(day.exercises)))
      if (load > sessionMuscleCap(p))
        add(
          "warning",
          "session-muscle-volume",
          [day.key],
          `${day.name} gives ${muscle.toLowerCase()} about ${round(load)} sets in one session (direct plus estimated involvement from compound lifts). Returns diminish; spreading them across the week usually works better.`,
        );
  }

  // Week-level integrity follows the specific exercise and session findings,
  // so the most actionable message is reported first.
  for (const issue of auditWeek(draft.days))
    add(
      "error",
      issue.kind === "duplication" ? "duplication" : "week-balance",
      issue.dayKeys,
      issue.message,
    );

  // Weekly volume per muscle. Ceilings use the estimated load (direct sets
  // plus weighted secondary involvement); floors use direct sets only and are
  // capped by how many sessions train the muscle.
  const items = draft.days.flatMap((d) => d.exercises);
  const direct = directSets(items);
  const secondary = secondarySets(items);
  const exposures = directExposures(draft.days);
  const describe = (muscle: string) =>
    secondary[muscle]
      ? `about ${round(direct[muscle] ?? 0)} direct sets a week plus an estimated ${round(secondary[muscle]! * SECONDARY_WEIGHT)} from compound lifts`
      : `about ${round(direct[muscle] ?? 0)} direct sets a week`;
  for (const [muscle, load] of Object.entries(muscleLoad(items))) {
    const target = weeklyVolumeTarget(
      p as PathPreferences,
      muscle,
      exposures[muscle] ?? 0,
    );
    if (load > target.max * WEEKLY_EXCESS_ERROR)
      add(
        "error",
        "weekly-volume-high",
        [],
        `${muscle} gets ${describe(muscle)}, well above the ${target.max}-set ceiling for this Path and level. Recovery is unlikely to keep up.`,
        { muscle, sets: round(load), target: target.max },
      );
    else if (load > target.max)
      add(
        "warning",
        "weekly-volume-high",
        [],
        `${muscle} gets ${describe(muscle)}, above the usual ${target.max}. Keep it only if you recover well.`,
        { muscle, sets: round(load), target: target.max },
      );
    else if (
      goal !== "foundation" &&
      p.frequency >= 3 &&
      (direct[muscle] ?? 0) < target.min
    )
      add(
        "warning",
        "weekly-volume-low",
        [],
        `${muscle} gets ${describe(muscle)}, below the ${target.min}-set starting point for this Path, level and training frequency.`,
        { muscle, sets: round(direct[muscle] ?? 0), target: target.min },
      );
  }

  // Movement balance: pulling should roughly keep pace with pressing.
  let push = 0,
    pull = 0;
  for (const item of draft.days.flatMap((d) => d.exercises)) {
    const pattern = catalog.find((e) => e.id === item.exerciseId)?.pattern;
    if (pattern === "horizontal push" || pattern === "vertical push")
      push += item.sets;
    if (pattern === "horizontal pull" || pattern === "vertical pull")
      pull += item.sets;
  }
  if (push >= 6 && pull < push * PULL_TO_PUSH)
    add(
      "warning",
      "pattern-balance",
      [],
      `Pressing (${push} sets) clearly outweighs pulling (${pull} sets) this week. Balanced pulling supports shoulder health and posture.`,
    );

  // Heavy hinging on consecutive calendar days concentrates lower-back load.
  const hinging = (day: PathDay) =>
    day.exercises.some(
      (e) =>
        catalog.find((x) => x.id === e.exerciseId)?.pattern === "hinge" &&
        !exerciseStimulus(e.exerciseId).isolation,
    );
  for (let i = 0; i < draft.days.length; i++) {
    const a = draft.days[i]!,
      b = draft.days[(i + 1) % draft.days.length]!;
    if (a === b) continue;
    const gap = (b.offset - a.offset + 7) % 7 || 7;
    if (gap === 1 && hinging(a) && hinging(b))
      add(
        "warning",
        "lower-back",
        [a.key, b.key],
        `${a.name} and ${b.name} both include hip hinges on consecutive days. Consider spacing them to let the lower back recover.`,
      );
    // Compound work for the same muscle on back-to-back days (possible after
    // customization; generated weeks avoid it).
    const compound = (day: PathDay) =>
      new Set(
        day.exercises
          .map((e) => exerciseStimulus(e.exerciseId))
          .filter((s) => s.reviewed && !s.isolation)
          .map((s) => s.direct[0])
          .filter((m): m is string => !!m && m !== "Core"),
      );
    const shared = [...compound(a)].filter((m) => compound(b).has(m));
    if (gap === 1 && shared.length)
      add(
        "warning",
        "recovery",
        [a.key, b.key],
        `${a.name} and ${b.name} train ${list(shared.map((m) => m.toLowerCase()))} with compound lifts on consecutive days. Most lifters recover and perform better with a day between.`,
      );
  }

  // Several movements from one family in a session overlap heavily; a
  // different family (angle, grip or joint action) usually adds more.
  for (const day of draft.days) {
    const families: Record<string, string[]> = {};
    for (const item of day.exercises) {
      const kind = menuMovement(item.exerciseId)?.kind;
      if (kind) (families[kind] ??= []).push(name(item.exerciseId));
    }
    for (const names of Object.values(families))
      if (names.length >= 3)
        add(
          "warning",
          "redundancy",
          [day.key],
          `${list(names)} are very similar movements in one session. Swapping one for a different angle or movement usually adds more than repeating the same pattern.`,
        );
  }

  if (p.experience === "Beginner" && p.frequency > 4)
    add(
      "warning",
      "experience",
      [],
      "Beginners usually progress well on two to four sessions a week, which leaves more time to recover and practise technique.",
    );
  return findings;
}

export const programErrors = (findings: Finding[]) =>
  findings.filter((f) => f.severity === "error");
export const programWarnings = (findings: Finding[]) =>
  findings.filter((f) => f.severity === "warning");
