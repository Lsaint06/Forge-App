import type { Repository } from "./repository";
import { localDate, type Exercise, type Workout } from "../domain/types";
import {
  byExercise,
  exerciseRecords,
  loadKind,
  sessionBests,
  type ExerciseRecords,
  type LoadKind,
  type LoggedExercise,
  type RecordEvent,
  type SessionBest,
} from "../domain/progress/strength";
import type {
  ConsistencyInput,
  DatedSession,
  ProgramPlan,
} from "../domain/progress/consistency";
import type { ExerciseInfo } from "../domain/progress/volume";
import { enrollments, programProgress, sessionLogs } from "./programs";
import { pathPrograms, pathSessions } from "./paths";
import { parseWeekdays } from "../domain/programs/enrollment";
import { addDays } from "../domain/paths/model";
import { mondayOf } from "../domain/progress/range";

// Read-only adapters from stored data to the Progress engines. Nothing here
// writes to the repository.

export const workoutDate = (w: Pick<Workout, "finishedAt" | "startedAt">) =>
  localDate(w.finishedAt ?? w.startedAt);

/** Every exercise of every completed workout, oldest first. */
export function trainingLog(r: Repository): LoggedExercise[] {
  const workouts = new Map(
    r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => [w.id, w]),
  );
  const entries = new Map<string, LoggedExercise>();
  for (const s of r.completedSets()) {
    const w = workouts.get(s.workoutId);
    if (!w) continue;
    const key = `${s.workoutId}|${s.exerciseId}`;
    const entry = entries.get(key) ?? {
      workoutId: w.id,
      workoutName: w.name,
      exerciseId: s.exerciseId,
      date: workoutDate(w),
      time: w.finishedAt ?? w.startedAt,
      sets: [],
    };
    entry.sets.push({
      weight: s.weight,
      reps: s.reps,
      kind: s.kind,
      completed: s.completed,
    });
    entries.set(key, entry);
  }
  return [...entries.values()].sort((a, b) => a.time - b.time);
}

export type ExerciseProgress = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  kind: LoadKind;
  bests: SessionBest[];
  records: ExerciseRecords;
  events: RecordEvent[];
};

export type ProgressModel = {
  log: LoggedExercise[];
  exercises: Map<string, ExerciseProgress>;
  /** Every record event, newest first. */
  events: RecordEvent[];
  info: (
    exerciseId: string,
  ) => ExerciseInfo & { name: string; equipment: string };
};

export function progressModel(r: Repository): ProgressModel {
  const log = trainingLog(r);
  const cache = new Map<string, Exercise | undefined>();
  const exercise = (id: string) => {
    if (!cache.has(id)) cache.set(id, r.exercise(id));
    return cache.get(id);
  };
  const info = (id: string) => {
    const e = exercise(id);
    return {
      kind: loadKind(e),
      muscle: e?.muscle ?? "Other",
      name: e?.name ?? "Unavailable exercise",
      equipment: e?.equipment ?? "",
    };
  };
  const exercises = new Map<string, ExerciseProgress>();
  const events: RecordEvent[] = [];
  for (const [id, entries] of byExercise(log)) {
    const { kind, muscle, name, equipment } = info(id);
    const bests = sessionBests(entries, kind);
    if (!bests.length) continue;
    const result = exerciseRecords(bests, kind);
    exercises.set(id, {
      id,
      name,
      muscle,
      equipment,
      kind,
      bests,
      records: result.records,
      events: result.events,
    });
    events.push(...result.events);
  }
  events.sort((a, b) => b.time - a.time);
  return { log, exercises, events, info };
}

/** One exercise's progress, for its detail screen. */
export function exerciseProgress(
  r: Repository,
  exerciseId: string,
): ExerciseProgress | undefined {
  const e = r.exercise(exerciseId);
  const kind = loadKind(e);
  const entries = byExercise(
    trainingLog(r).filter((x) => x.exerciseId === exerciseId),
  ).get(exerciseId);
  const bests = entries ? sessionBests(entries, kind) : [];
  const { records, events } = exerciseRecords(bests, kind);
  return {
    id: exerciseId,
    name: e?.name ?? "Unavailable exercise",
    muscle: e?.muscle ?? "Other",
    equipment: e?.equipment ?? "",
    kind,
    bests,
    records: { ...records, exerciseId },
    events,
  };
}

// ---- Consistency --------------------------------------------------------

function programPlans(r: Repository, today: string) {
  const workouts = new Map(r.workouts().map((w) => [w.id, w]));
  const plans: ProgramPlan[] = [];
  const upcoming: ConsistencyInput["upcoming"] = [];
  for (const enrollment of enrollments(r)) {
    const logs = sessionLogs(r, enrollment.record.id);
    const done = logs.flatMap((l) => {
      const w = workouts.get(l.data.workoutId);
      return l.state === "completed" && w ? [workoutDate(w)] : [];
    });
    const skipped = logs
      .filter((l) => l.state === "skipped")
      .map((l) => l.record.date);
    const progress = programProgress(r, enrollment, today);
    const running = enrollment.data.status === "active" && !progress.complete;
    const last = [...done, ...skipped].sort().at(-1);
    // A running program plans through the end of this week (the week's
    // remaining days are never due early). An ended program counts only
    // until its last recorded session: no end date is stored, so later
    // weeks are never counted as missed.
    const end = running ? addDays(mondayOf(today), 6) : last;
    if (end && end >= enrollment.data.started)
      plans.push({
        name: enrollment.data.name,
        start: enrollment.data.started,
        end,
        weekdays: parseWeekdays(enrollment.data.weekdays),
        done,
        skipped,
      });
    if (running && progress.next?.state === "ready")
      upcoming.push(
        ...progress.upcoming.map((u) => ({
          date: u.suggested,
          name: u.session.name,
        })),
      );
  }
  return { plans, upcoming };
}

function pathDated(r: Repository, today: string): DatedSession[] {
  const out: DatedSession[] = [];
  for (const path of pathPrograms(r)) {
    const paused = path.data.status === "paused";
    const sessions = pathSessions(r, path, paused ? path.data.pausedOn : today);
    // Archived Paths count until their last acted-on session; paused Paths
    // until the pause (later sessions move when it resumes).
    const acted = sessions
      .filter((s) =>
        ["completed", "in-progress", "skipped", "unlinked"].includes(s.state),
      )
      .map((s) => s.record.date)
      .sort()
      .at(-1);
    const cutoff =
      path.data.status === "archived"
        ? acted
        : paused
          ? path.data.pausedOn
          : undefined;
    for (const s of sessions) {
      const date = s.record.date;
      if (path.data.status === "archived" && (!cutoff || date > cutoff))
        continue;
      if (paused && cutoff && date >= cutoff) continue;
      const state: DatedSession["state"] =
        s.state === "completed"
          ? "completed"
          : s.state === "skipped"
            ? "skipped"
            : date < today
              ? "missed"
              : "scheduled";
      out.push({ date, name: s.data.name, source: "path", state });
    }
  }
  return out;
}

// Saved calendar plans (Templates → Schedule, earlier starter programs): a
// plan is completed by a finished workout of the same template that day,
// each workout counting once.
function plannedDated(r: Repository, today: string): DatedSession[] {
  const available = r
    .workouts()
    .filter((w) => w.status === "completed" && w.templateId)
    .map((w) => ({
      date: workoutDate(w),
      templateId: w.templateId,
      used: false,
    }));
  return r
    .journal("schedule")
    .filter((j) => j.data.forgePath !== 1 && j.data.forgeProgram !== 1)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((j) => {
      const hit = available.find(
        (w) =>
          !w.used && w.date === j.date && w.templateId === j.data.templateId,
      );
      if (hit) hit.used = true;
      return {
        date: j.date,
        name: String(j.data.name ?? "Planned workout"),
        source: "plan" as const,
        state: hit
          ? ("completed" as const)
          : j.date < today
            ? ("missed" as const)
            : ("scheduled" as const),
      };
    });
}

export function consistencyInput(
  r: Repository,
  today = localDate(),
): ConsistencyInput {
  const { plans, upcoming } = programPlans(r, today);
  return {
    today,
    workouts: r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => ({ date: workoutDate(w), workoutId: w.id, name: w.name })),
    programs: plans,
    dated: [...pathDated(r, today), ...plannedDated(r, today)],
    upcoming,
  };
}

/** The first day with recorded training or a plan, for "All time". */
export function firstActivity(input: ConsistencyInput) {
  return [
    ...input.workouts.map((w) => w.date),
    ...input.programs.map((p) => p.start),
    ...input.dated.filter((d) => d.date <= input.today).map((d) => d.date),
  ]
    .sort()
    .at(0);
}
