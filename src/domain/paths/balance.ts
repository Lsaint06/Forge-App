import type { Exercise } from "../types";
import type { PathDay, PathDraft } from "./legacyGenerator";
import type { PathRole } from "./model";
import { exerciseStimulus } from "./stimulus";
import { auditWeek } from "./weekAudit";

export type SessionPurpose =
  "full-body" | "upper" | "lower" | "push" | "pull" | "focused";
export type SessionBlueprint = { roles: PathRole[]; focusRoles?: PathRole[] };

function purpose(roles: PathRole[]): SessionPurpose {
  const lower = roles.some((role) => role === "squat" || role === "posterior");
  const push = roles.some((role) => role === "push" || role === "shoulder");
  const pull = roles.includes("pull");
  if (lower && (push || pull)) return "full-body";
  if (lower) return "lower";
  if (push && pull) return "upper";
  if (push) return "push";
  if (pull) return "pull";
  return "focused";
}

export function sessionWorkload(
  day: PathDay,
  catalog: Exercise[],
  blueprint?: SessionBlueprint,
) {
  const direct: Record<string, number> = {};
  const supporting: Record<string, number> = {};
  const primary: Record<string, number> = {};
  const patterns = new Set<string>();
  let compoundSets = 0,
    isolationSets = 0,
    heavyCompoundSets = 0,
    unilateralSets = 0;
  for (const item of day.exercises) {
    const ex = catalog.find((e) => e.id === item.exerciseId);
    const stimulus = exerciseStimulus(item.exerciseId);
    if (ex) patterns.add(ex.pattern);
    for (const muscle of stimulus.direct)
      direct[muscle] = (direct[muscle] ?? 0) + item.sets;
    for (const muscle of stimulus.assistance)
      supporting[muscle] = (supporting[muscle] ?? 0) + item.sets;
    const muscle = stimulus.direct[0];
    if (muscle) primary[muscle] = (primary[muscle] ?? 0) + item.sets;
    if (stimulus.isolation) isolationSets += item.sets;
    else {
      compoundSets += item.sets;
      if ((item.repMax ?? item.reps) <= 6 && item.rest >= 180)
        heavyCompoundSets += item.sets;
    }
    if (ex?.unilateral) unilateralSets += item.sets;
  }
  const expectedRoles = blueprint?.roles ?? day.roles;
  const missingRoles = [...new Set(expectedRoles)].filter(
    (role) =>
      expectedRoles.filter((r) => r === role).length >
      day.roles.filter((r) => r === role).length,
  );
  return {
    key: day.key,
    name: day.name,
    purpose: purpose(expectedRoles),
    exerciseCount: day.exercises.length,
    workingSets: compoundSets + isolationSets,
    compoundSets,
    isolationSets,
    heavyCompoundSets,
    unilateralSets,
    patterns: [...patterns],
    direct,
    supporting,
    primary,
    missingRoles,
    focusRoles: blueprint?.focusRoles ?? [],
  };
}
export type SessionWorkload = ReturnType<typeof sessionWorkload>;

function difference(a: SessionWorkload, b: SessionWorkload) {
  // Review heuristics, not validated fatigue thresholds. Counts alone never
  // trigger redistribution; the sessions must also differ materially in work.
  const sets = Math.max(0, Math.abs(a.workingSets - b.workingSets) - 3);
  return sets * sets;
}

export function weeklySessionBalance(
  draft: PathDraft,
  catalog: Exercise[],
  blueprints?: SessionBlueprint[],
) {
  const sessions = draft.days.map((day, i) =>
    sessionWorkload(day, catalog, blueprints?.[i]),
  );
  const diagnostics: {
    kind: "intentional" | "review" | "restricted";
    dayKeys: string[];
    message: string;
  }[] = [];
  const overlaps: {
    dayKeys: string[];
    daysApart: number;
    directMuscles: string[];
    supportingMuscles: string[];
  }[] = [];
  for (const session of sessions) {
    const demand = session.heavyCompoundSets
      ? `${session.heavyCompoundSets} low-rep, long-rest compound sets`
      : `${session.compoundSets} compound and ${session.isolationSets} isolation sets`;
    diagnostics.push({
      kind: "intentional",
      dayKeys: [session.key],
      message: `${session.name}: ${session.purpose} focus; ${demand}. Exercise count alone does not measure training depth.`,
    });
    if (session.missingRoles.length)
      diagnostics.push({
        kind: "restricted",
        dayKeys: [session.key],
        message: `${session.name}: equipment or exclusions omit planned ${session.missingRoles.join(", ")} work. Review coverage rather than adding unrelated exercises.`,
      });
  }
  for (let i = 0; i < sessions.length; i++)
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]!,
        b = sessions[j]!;
      const forward = (draft.days[j]!.offset - draft.days[i]!.offset + 7) % 7;
      const daysApart = Math.min(forward, 7 - forward);
      const directMuscles = Object.keys(a.direct).filter(
        (muscle) => b.direct[muscle],
      );
      const supportingMuscles = [
        ...new Set([
          ...Object.keys(a.supporting).filter(
            (m) => b.direct[m] || b.supporting[m],
          ),
          ...Object.keys(b.supporting).filter(
            (m) => a.direct[m] || a.supporting[m],
          ),
        ]),
      ];
      if (directMuscles.length || supportingMuscles.length)
        overlaps.push({
          dayKeys: [a.key, b.key],
          daysApart,
          directMuscles,
          supportingMuscles,
        });
      const loadedOverlap = directMuscles.filter(
        (m) => m !== "Core" && m !== "Calves",
      );
      if (daysApart < 2 && loadedOverlap.length)
        diagnostics.push({
          kind: "review",
          dayKeys: [a.key, b.key],
          message: `${a.name} / ${b.name}: adjacent direct work overlaps for ${loadedOverlap.join(", ")}. Review recovery and effort; these exposure counts are not a measured fatigue score.`,
        });
      if (a.purpose !== b.purpose) continue;
      if (!difference(a, b)) continue;
      const restricted = a.missingRoles.length || b.missingRoles.length;
      const demandDiffers =
        Math.abs(a.workingSets - b.workingSets) <= 3 &&
        (Math.abs(a.heavyCompoundSets - b.heavyCompoundSets) >= 3 ||
          Math.abs(a.unilateralSets - b.unilateralSets) >= 3);
      diagnostics.push({
        kind: restricted
          ? "restricted"
          : demandDiffers
            ? "intentional"
            : "review",
        dayKeys: [a.key, b.key],
        message: `${a.name} / ${b.name}: ${a.workingSets}/${b.workingSets} sets. ${
          restricted
            ? "Available movements differ; inspect the omitted coverage."
            : demandDiffers
              ? "Heavy or unilateral work differs; equal set counts are not required."
              : "Comparable session purposes have uneven workloads; review allocation and muscle emphasis."
        }`,
      });
    }
  return { sessions, diagnostics, overlaps, issues: auditWeek(draft.days) };
}
