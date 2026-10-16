import type { Exercise, Prescription } from "../types";
import type { PathDay, PathDraft } from "./legacyGenerator";
import type { PathRole } from "./model";
import { estimateSession } from "./duration";
import { exerciseStimulus } from "./stimulus";
import { exerciseSetCap, sessionSetCap, isPriorityTarget } from "./volume";

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
    duration: estimateSession(day.exercises, catalog),
    patterns: [...patterns],
    direct,
    supporting,
    primary,
    missingRoles,
    focusRoles: blueprint?.focusRoles ?? [],
  };
}
export type SessionWorkload = ReturnType<typeof sessionWorkload>;

export function redistributeFocusSets(
  day: PathDay,
  preferences: PathDraft["preferences"],
  catalog: Exercise[],
  focusRoles: PathRole[],
): PathDay {
  const result = { ...day, exercises: day.exercises.map((e) => ({ ...e })) };
  if (preferences.pathKey !== "advanced-physique" || !focusRoles.length)
    return result;
  // Reassign the existing main-slot bonus, rather than increasing the session
  // budget when its declared focus is not in the first two exercise slots.
  for (const [index, donor] of result.exercises.entries()) {
    if (
      focusRoles.includes(day.roles[index]!) ||
      donor.sets <= 3 ||
      isPriorityTarget(
        preferences,
        day.roles[index]!,
        catalog.find((e) => e.id === donor.exerciseId),
      )
    )
      continue;
    const recipients = result.exercises
      .map((item, i) => ({ item, i }))
      .filter(
        ({ item, i }) =>
          focusRoles.includes(day.roles[i]!) &&
          item.sets <
            exerciseSetCap(
              preferences,
              catalog.find((e) => e.id === item.exerciseId),
              false,
            ),
      )
      .sort((a, b) => a.item.sets - b.item.sets || a.i - b.i);
    const receiver = recipients[0]?.item;
    if (!receiver) continue;
    donor.sets--;
    receiver.sets++;
    if (
      estimateSession(result.exercises, catalog).expected > preferences.duration
    ) {
      donor.sets++;
      receiver.sets--;
    }
  }
  return result;
}

function difference(a: SessionWorkload, b: SessionWorkload) {
  // Review heuristics, not validated fatigue thresholds. Counts alone never
  // trigger redistribution; the sessions must also differ materially in work.
  const sets = Math.max(0, Math.abs(a.workingSets - b.workingSets) - 3);
  const minutes = Math.max(
    0,
    Math.abs(a.duration.expected - b.duration.expected) - 10,
  );
  return sets * sets + (minutes * minutes) / 4;
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
      if (a.purpose !== b.purpose) {
        if (Math.abs(a.exerciseCount - b.exerciseCount) >= 3)
          diagnostics.push({
            kind: "intentional",
            dayKeys: [a.key, b.key],
            message: `${a.name} and ${b.name} cover different scopes (${a.purpose} versus ${b.purpose}); ${a.exerciseCount} versus ${b.exerciseCount} exercises need not match.`,
          });
        continue;
      }
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
        message: `${a.name} / ${b.name}: ${a.workingSets}/${b.workingSets} sets, about ${a.duration.expected}/${b.duration.expected} min. ${
          restricted
            ? "Available movements differ; inspect the omitted coverage."
            : demandDiffers
              ? "Heavy or unilateral work differs; equal counts or duration are not required."
              : "Comparable session purposes have uneven workloads; review allocation and muscle emphasis."
        }`,
      });
    }
  return { sessions, diagnostics, overlaps };
}

// Move existing sets only between already-programmed, identical movements on
// comparable days. This preserves every weekly direct/supporting muscle count,
// exclusions, split, exercise order, and training-day recovery spacing.
export function redistributeWeeklySets(
  draft: PathDraft,
  catalog: Exercise[],
  blueprints?: SessionBlueprint[],
) {
  const days = draft.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  }));
  const transfers: { from: string; to: string; exerciseId: string }[] = [];
  if (
    draft.preferences.experience === "Beginner" ||
    !["build-muscle", "advanced-physique"].includes(draft.preferences.pathKey)
  )
    return { days, transfers };
  const metrics = () =>
    days.map((d, i) => sessionWorkload(d, catalog, blueprints?.[i]));
  const score = (sessions: SessionWorkload[]) =>
    sessions.reduce(
      (sum, a, i) =>
        sum +
        sessions
          .slice(i + 1)
          .reduce(
            (n, b) => n + (a.purpose === b.purpose ? difference(a, b) : 0),
            0,
          ),
      0,
    );
  const budget = days.reduce(
    (n, d) => n + d.exercises.reduce((s, e) => s + e.sets, 0),
    0,
  );
  for (let step = 0; step < budget; step++) {
    const current = metrics(),
      before = score(current);
    let best:
      | {
          from: number;
          to: number;
          donor: Prescription;
          receiver: Prescription;
          score: number;
        }
      | undefined;
    for (let from = 0; from < days.length; from++)
      for (let to = 0; to < days.length; to++) {
        if (
          from === to ||
          current[from]!.purpose !== current[to]!.purpose ||
          !difference(current[from]!, current[to]!) ||
          current[from]!.workingSets <= current[to]!.workingSets ||
          current[to]!.workingSets >= sessionSetCap(draft.preferences)
        )
          continue;
        for (const [index, donor] of days[from]!.exercises.entries()) {
          const floor = blueprints?.[from]?.focusRoles?.includes(
            days[from]!.roles[index]!,
          )
            ? 3
            : 2;
          if (donor.sets <= floor) continue;
          const receiver = days[to]!.exercises.find(
            (e) => e.exerciseId === donor.exerciseId,
          );
          const receiverIndex = days[to]!.exercises.findIndex(
            (e) => e === receiver,
          );
          if (
            blueprints?.[from]?.focusRoles?.includes(
              days[from]!.roles[index]!,
            ) &&
            !blueprints?.[to]?.focusRoles?.includes(
              days[to]!.roles[receiverIndex]!,
            )
          )
            continue;
          const ex = catalog.find((e) => e.id === donor.exerciseId);
          if (
            !receiver ||
            receiver.sets >= exerciseSetCap(draft.preferences, ex, false)
          )
            continue;
          donor.sets--;
          receiver.sets++;
          const candidate = metrics(),
            candidateScore = score(candidate);
          if (
            candidate[to]!.duration.expected <= draft.preferences.duration &&
            candidateScore < before &&
            (!best || candidateScore < best.score)
          )
            best = { from, to, donor, receiver, score: candidateScore };
          donor.sets++;
          receiver.sets--;
        }
      }
    if (!best) break;
    best.donor.sets--;
    best.receiver.sets++;
    transfers.push({
      from: days[best.from]!.key,
      to: days[best.to]!.key,
      exerciseId: best.donor.exerciseId,
    });
  }
  return { days, transfers };
}
