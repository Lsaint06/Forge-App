import type { Repository } from "./repository";
import type { Prescription } from "../domain/types";
import { forgePaths } from "../domain/paths/catalog";
import {
  validateDraft,
  evolutionDays,
  scheduledDates,
  type PathDraft,
} from "../domain/paths/generator";
import type { PathProgramData, PathRole } from "../domain/paths/model";
import { curatedOnly } from "../programs/activation";
import {
  encodePath,
  findPath,
  pathPrograms,
  pathSessions,
  type SavedPath,
} from "./paths";

// GENERATED PATH BUILDER — retired in Phase 6 (docs/PHASE_6.md).
// Everything here creates or reshapes generated plans and depends on the
// workout generator. It is deleted together with src/domain/paths/generator
// once the curated library is published. Reading and continuing existing
// generated Paths lives in ./paths and never depends on this file.

// Creating a new generated Path is refused once curated programs are active,
// so no route, screen or API can fall back to the generator.
export function acceptPath(
  r: Repository,
  draft: PathDraft,
  replace = false,
  curatedActive = curatedOnly(),
) {
  if (curatedActive)
    throw new Error(
      "Forge Paths now uses curated programs. Choose a program in Forge Paths.",
    );
  const checked = validateDraft(draft, r.exercises());
  const evolution = evolutionDays(checked, r.exercises());
  const previous = pathPrograms(r).filter((p) => p.data.status !== "archived");
  if (previous.length && !replace)
    throw new Error(
      "You already have a Path. Confirm replacement before starting another.",
    );
  return r.transaction(() => {
    for (const old of previous)
      r.updateJournal(
        old.record.id,
        encodePath({ ...old.data, status: "archived", pausedOn: "" }),
      );
    const templates = (["Foundation", "Evolution"] as const).map((phase) =>
      (phase === "Foundation" ? checked.days : evolution).map((day) =>
        r.saveTemplate(
          `${forgePaths.find((p) => p.key === checked.preferences.pathKey)!.name} · ${day.name}`,
          day.exercises,
          undefined,
          `FORGE PATHS · ${phase}. Choose comfortable working loads. Recorded sessions remain unchanged by later template edits.`,
        ),
      ),
    );
    const data: PathProgramData = {
      forgePath: 1,
      engineVersion: checked.engineVersion ?? 1,
      pathKey: checked.preferences.pathKey,
      name: forgePaths.find((p) => p.key === checked.preferences.pathKey)!.name,
      weeks: 8,
      started: checked.preferences.startDate,
      status: "active",
      pausedOn: "",
      pausedDays: 0,
      preferences: checked.preferences,
      days: checked.days.map((day) => ({
        key: day.key,
        name: day.name,
        offset: day.offset,
        roles: day.roles,
      })),
      phases: [
        {
          key: "foundation",
          name: "Foundation",
          from: 1,
          to: 4,
          templateIds: templates[0]!.map((t) => t.id),
        },
        {
          key: "evolution",
          name: "Evolution",
          from: 5,
          to: 8,
          templateIds: templates[1]!.map((t) => t.id),
        },
      ],
    };
    const program = r.addJournal("program", encodePath(data), data.started);
    for (const at of scheduledDates(checked)) {
      r.addJournal(
        "schedule",
        {
          forgePath: 1,
          programId: program.id,
          templateId:
            data.phases[at.week <= 4 ? 0 : 1].templateIds[at.dayIndex]!,
          name: checked.days[at.dayIndex]!.name,
          week: at.week,
          dayIndex: at.dayIndex,
          phase: at.phase,
          workoutId: "",
          skipped: false,
        },
        at.date,
      );
    }
    return program;
  });
}

// Recent completed sessions where fewer than this share of prescribed working
// sets were completed at or above their lower rep target count as a shortfall.
const WORKLOAD_SHORTFALL = 0.75;
const lowerExperience = {
  Advanced: "Intermediate",
  Intermediate: "Beginner",
} as const;

// Suggests, never applies, a lower experience level when the prescribed
// workload is consistently not completed. Session duration plays no part.
export function workloadGuidance(r: Repository, program: SavedPath) {
  const experience = program.data.preferences.experience;
  if (experience === "Beginner") return undefined;
  const templates = r.templates();
  const recent = pathSessions(r, program)
    .filter((s) => s.state === "completed")
    .map((s) => ({ s, workout: r.workout(s.data.workoutId)! }))
    .sort((a, b) => (b.workout.finishedAt ?? 0) - (a.workout.finishedAt ?? 0))
    .slice(0, 4);
  if (recent.length < 3) return undefined;
  const shortfalls = recent.filter(({ s, workout }) => {
    const prescribed =
      templates.find((t) => t.id === s.data.templateId)?.exercises ?? [];
    const planned = prescribed.reduce((n, e) => n + e.sets, 0);
    if (!planned) return false;
    let met = 0;
    for (const row of r.workoutExercises(workout.id)) {
      const target = prescribed.find((e) => e.exerciseId === row.exerciseId);
      if (!target) continue;
      met += Math.min(
        target.sets,
        r
          .sets(row.id)
          .filter(
            (set) =>
              set.completed && set.kind !== "warmup" && set.reps >= target.reps,
          ).length,
      );
    }
    return met / planned < WORKLOAD_SHORTFALL;
  }).length;
  if (shortfalls < 3) return undefined;
  const suggested = lowerExperience[experience];
  return {
    suggested,
    message: `${shortfalls} of your last ${recent.length} Path workouts finished well short of the prescribed sets and reps. Consider rebuilding this Path at the ${suggested} level. Forge will not change your level automatically.`,
  };
}

export function savedDraft(
  r: Repository,
  program: SavedPath,
  phaseIndex = 0,
): PathDraft {
  const templates = r.templates();
  return {
    engineVersion: program.data.engineVersion,
    preferences: program.data.preferences,
    days: program.data.days.map((day, index) => ({
      ...day,
      exercises:
        templates.find(
          (t) => t.id === program.data.phases[phaseIndex]!.templateIds[index],
        )?.exercises ?? [],
    })),
  };
}

// Saves a Foundation day. Engine 8+ plans may also change the day's movement
// slots (adding, removing or reordering exercises): pass `roles` aligned with
// `items`. Earlier engines keep their fixed slot structure.
export function editPathDay(
  r: Repository,
  programId: string,
  index: number,
  items: Prescription[],
  roles?: PathRole[],
) {
  const program = findPath(r, programId);
  if (program.data.status === "archived")
    throw new Error("Archived Paths cannot be edited.");
  const draft = savedDraft(r, program);
  if (!draft.days[index]) throw new Error("Training day not found.");
  const customizable = (draft.engineVersion ?? 1) >= 8;
  if (roles && !customizable)
    throw new Error(
      "This saved plan uses an earlier planner. Rebuild the Path to add, remove or reorder exercises.",
    );
  draft.days[index]!.exercises = items;
  if (roles) draft.days[index]!.roles = roles;
  validateDraft(draft, r.exercises());
  // Current plans re-derive the whole Evolution week from the edited
  // Foundation week, so phase differences stay consistent with user edits.
  // Earlier engines apply the edit identically to both phases.
  const evolution =
    (draft.engineVersion ?? 1) >= 8
      ? evolutionDays(draft, r.exercises())
      : undefined;
  r.transaction(() => {
    const save = (
      templateId: string,
      exercises: Prescription[],
      day: number,
    ) => {
      const existing = r.templates().find((t) => t.id === templateId);
      r.saveTemplate(
        existing?.name ?? `${program.data.name} · ${draft.days[day]!.name}`,
        exercises,
        templateId,
        existing?.notes ?? "FORGE PATHS",
      );
    };
    const [foundation, evolutionPhase] = program.data.phases;
    if (roles)
      r.updateJournal(
        programId,
        encodePath({
          ...program.data,
          days: program.data.days.map((d, i) =>
            i === index ? { ...d, roles } : d,
          ),
        }),
      );
    save(foundation.templateIds[index]!, items, index);
    if (!evolution) save(evolutionPhase.templateIds[index]!, items, index);
    else
      evolution.forEach((day, i) =>
        save(evolutionPhase.templateIds[i]!, day.exercises, i),
      );
  });
}
