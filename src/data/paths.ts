import type { Repository } from "./repository";
import type { Journal } from "../domain/types";
import { localDate } from "../domain/types";
import {
  pathProgramDataSchema,
  pathSessionDataSchema,
  addDays,
  daysBetween,
  type PathProgramData,
  type PathSessionData,
} from "../domain/paths/model";

// GENERATED PATH COMPATIBILITY (Phase 6, docs/PHASE_6.md). Reads and
// continues generated Paths that lifters already have: their records,
// schedules, templates and workouts. The workout generator was retired in
// Phase 6B; nothing in Forge creates a generated plan any more.

export type SavedPath = { record: Journal; data: PathProgramData };
export function pathPrograms(r: Repository): SavedPath[] {
  return r
    .journal("program")
    .filter((j) => j.data.forgePath === 1)
    .map((record) => ({
      record,
      data: pathProgramDataSchema.parse(record.data),
    }));
}
export function currentPath(r: Repository) {
  return pathPrograms(r).find((p) => p.data.status !== "archived");
}
export function standaloneTemplates(r: Repository) {
  const managed = new Set(
    pathPrograms(r).flatMap((p) =>
      p.data.phases.flatMap((phase) => phase.templateIds),
    ),
  );
  return r.templates().filter((t) => !managed.has(t.id));
}
export function findPath(r: Repository, programId: string) {
  const p = pathPrograms(r).find((p) => p.record.id === programId);
  if (!p)
    throw new Error(
      "Path not found. It may have been removed or replaced by a backup.",
    );
  return p;
}
export function encodePath(data: PathProgramData): Journal["data"] {
  return {
    ...data,
    preferences: JSON.stringify(data.preferences),
    phases: JSON.stringify(data.phases),
    days: JSON.stringify(data.days),
  };
}
export type PathSession = {
  record: Journal;
  data: PathSessionData;
  state:
    | "completed"
    | "in-progress"
    | "skipped"
    | "missed"
    | "scheduled"
    | "unlinked";
};
export function pathSessions(
  r: Repository,
  program: SavedPath,
  today = localDate(),
): PathSession[] {
  const workouts = new Map(r.workouts().map((w) => [w.id, w]));
  const seen = new Set<string>();
  return r
    .journal("schedule")
    .filter(
      (j) => j.data.forgePath === 1 && j.data.programId === program.record.id,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((record) => {
      const data = pathSessionDataSchema.parse(record.data);
      const phase = program.data.phases[data.week <= 4 ? 0 : 1];
      if (phase.templateIds[data.dayIndex] !== data.templateId)
        throw new Error("Path session references an unrelated phase template.");
      const workout = workouts.get(data.workoutId);
      const valid =
        workout &&
        workout.templateId === data.templateId &&
        !seen.has(workout.id);
      if (valid) seen.add(workout.id);
      const state = valid
        ? workout.status === "completed"
          ? "completed"
          : "in-progress"
        : data.skipped
          ? "skipped"
          : data.workoutId
            ? "unlinked"
            : record.date < today
              ? "missed"
              : "scheduled";
      return { record, data, state };
    });
}
export function pathSummary(
  r: Repository,
  program: SavedPath,
  today = localDate(),
) {
  const sessions = pathSessions(
    r,
    program,
    program.data.status === "paused" ? program.data.pausedOn : today,
  );
  const expected = program.data.preferences.frequency * 8;
  const completed = sessions.filter((s) => s.state === "completed");
  const effectiveToday =
    program.data.status === "paused" ? program.data.pausedOn : today;
  const week = Math.max(
    1,
    Math.min(
      8,
      Math.floor(
        (daysBetween(program.data.started, effectiveToday) -
          program.data.pausedDays) /
          7,
      ) + 1,
    ),
  );
  const next = sessions.find((s) =>
    ["in-progress", "missed", "unlinked", "scheduled"].includes(s.state),
  );
  return {
    sessions,
    completed: completed.length,
    expected,
    ratio: completed.length / expected,
    week,
    phase: program.data.phases[week <= 4 ? 0 : 1],
    weeklyCompleted: completed.filter((s) => s.data.week === week).length,
    missed: sessions.filter((s) => s.state === "missed").length,
    skipped: sessions.filter((s) => s.state === "skipped").length,
    complete: completed.length === expected,
    next,
    missing: Math.max(0, expected - sessions.length),
  };
}

function findSession(r: Repository, sessionId: string) {
  const raw = r
    .journal("schedule")
    .find((j) => j.id === sessionId && j.data.forgePath === 1);
  if (!raw) throw new Error("Planned Path session not found.");
  const program = findPath(r, String(raw.data.programId));
  const session = pathSessions(r, program).find(
    (s) => s.record.id === sessionId,
  )!;
  return { program, session };
}
export function startPathSession(r: Repository, sessionId: string) {
  return r.transaction(() => {
    const { program, session } = findSession(r, sessionId);
    if (program.data.status !== "active")
      throw new Error(
        "Resume this Path before starting its sessions. Archived Paths cannot start new workouts.",
      );
    if (session.state === "completed")
      throw new Error(
        "This session is already completed. Review it from the dashboard.",
      );
    if (session.data.skipped)
      throw new Error("Restore this skipped session before starting it.");
    const active = r.active();
    if (active) {
      if (active.id === session.data.workoutId) return active;
      throw new Error(
        "Finish or discard your current workout first. It has not been assigned to this planned session.",
      );
    }
    const template = r
      .templates()
      .find((t) => t.id === session.data.templateId);
    if (!template)
      throw new Error(
        "The template was removed. Restore a backup to continue this Path's workout.",
      );
    // Saved Path workouts start exactly as stored. They are never
    // regenerated; an exercise that no longer exists is reported instead.
    const known = new Set(r.exercises().map((e) => e.id));
    if (template.exercises.some((e) => !known.has(e.exerciseId)))
      throw new Error(
        "This Path workout uses an exercise that is no longer available. Restore a backup or choose a Forge program.",
      );
    const workout = r.startWorkout(
      `${program.data.name} · ${session.data.name}`,
      template.id,
    );
    r.updateJournal(session.record.id, {
      ...session.record.data,
      workoutId: workout.id,
      skipped: false,
    });
    return workout;
  });
}
// Archives a generated Path when the lifter starts a curated program. Its
// schedule, templates and recorded workouts are kept, as when replacing a Path.
export function archivePath(r: Repository, programId: string) {
  const program = findPath(r, programId);
  if (program.data.status === "archived") return;
  r.updateJournal(
    programId,
    encodePath({ ...program.data, status: "archived", pausedOn: "" }),
  );
}
export function pausePath(
  r: Repository,
  programId: string,
  today = localDate(),
) {
  const program = findPath(r, programId);
  if (program.data.status !== "active")
    throw new Error("Only an active Path can be paused.");
  r.updateJournal(
    programId,
    encodePath({ ...program.data, status: "paused", pausedOn: today }),
  );
}
export function resumePath(
  r: Repository,
  programId: string,
  today = localDate(),
) {
  const program = findPath(r, programId);
  if (program.data.status !== "paused")
    throw new Error("This Path is not paused.");
  const shift = daysBetween(program.data.pausedOn, today);
  if (shift < 0)
    throw new Error("Resume date must not precede the pause date.");
  r.transaction(() => {
    for (const session of pathSessions(r, program, today)) {
      if (
        !["completed", "in-progress"].includes(session.state) &&
        session.record.date >= program.data.pausedOn
      )
        r.updateJournal(
          session.record.id,
          session.record.data,
          addDays(session.record.date, shift),
        );
    }
    r.updateJournal(
      programId,
      encodePath({
        ...program.data,
        status: "active",
        pausedOn: "",
        pausedDays: program.data.pausedDays + shift,
      }),
    );
  });
}
export function reschedulePathSession(
  r: Repository,
  sessionId: string,
  date: string,
  today = localDate(),
) {
  // Parse the calendar date before comparing its sortable ISO representation.
  addDays(date, 0);
  if (date < today)
    throw new Error("Choose today or a future date to recover this session.");
  const { program, session } = findSession(r, sessionId);
  if (program.data.status !== "active")
    throw new Error("Resume this Path before rescheduling.");
  if (["completed", "in-progress"].includes(session.state))
    throw new Error(
      "Recorded or active sessions keep their dates and workout links.",
    );
  const sessions = pathSessions(r, program, today).filter(
    (s) =>
      s.record.id !== sessionId && !["completed", "skipped"].includes(s.state),
  );
  if (sessions.some((s) => s.record.date === date))
    throw new Error(
      "Another pending Path session is already scheduled on that date.",
    );
  const roles = program.data.days[session.data.dayIndex]!.roles;
  if (
    sessions.some(
      (s) =>
        Math.abs(daysBetween(s.record.date, date)) === 1 &&
        program.data.days[s.data.dayIndex]!.roles.some(
          (role) => role !== "core" && roles.includes(role),
        ),
    )
  )
    throw new Error(
      "Leave a recovery day between sessions with overlapping demanding movements.",
    );
  r.updateJournal(sessionId, { ...session.record.data, skipped: false }, date);
}
export function skipPathSession(
  r: Repository,
  sessionId: string,
  skipped: boolean,
) {
  const { program, session } = findSession(r, sessionId);
  if (program.data.status === "archived")
    throw new Error("Archived schedules are read-only.");
  if (["completed", "in-progress"].includes(session.state))
    throw new Error("Completed or active workouts cannot be skipped.");
  r.updateJournal(sessionId, { ...session.record.data, skipped });
}

// Existing calendar entry points use the same guarded start path. Non-Path
// schedules retain their original template/deload behavior.
export function startScheduledSession(r: Repository, entry: Journal) {
  if (entry.data.forgePath === 1) return startPathSession(r, entry.id);
  return r.transaction(() => {
    const existing = r.active();
    const workout = r.startWorkout(
      String(entry.data.name),
      String(entry.data.templateId),
    );
    if (!existing && entry.data.deload === true)
      for (const row of r.workoutExercises(workout.id)) {
        const sets = r.sets(row.id);
        if (sets.length > 1) r.removeSet(sets[sets.length - 1]!.id);
      }
    return workout;
  });
}
export function visibleSchedules(r: Repository) {
  const activeIds = new Set(
    pathPrograms(r)
      .filter((p) => p.data.status === "active")
      .map((p) => p.record.id),
  );
  const completedIds = new Set(
    r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => w.id),
  );
  return r
    .journal("schedule")
    .filter(
      (j) =>
        (j.data.forgePath !== 1 && j.data.forgeProgram !== 1) ||
        (activeIds.has(String(j.data.programId)) &&
          !j.data.skipped &&
          !completedIds.has(String(j.data.workoutId))),
    );
}
