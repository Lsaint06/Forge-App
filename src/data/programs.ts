import type { Repository } from "./repository";
import type { Journal, Prescription } from "../domain/types";
import { localDate } from "../domain/types";
import {
  enrollmentDataSchema,
  parseWeekdays,
  programSessionLogSchema,
  sessionAt,
  suggestedDates,
  totalSessions,
  type EnrollmentData,
  type ProgramSessionLog,
  type SessionSlot,
} from "../domain/programs/enrollment";
import {
  findProgramVersion,
  type CuratedProgram,
  type ProgramSession,
} from "../domain/programs/model";
import { trainingWeekdays } from "../domain/programs/schedule";
import { programLibrary } from "../programs";
import { archivePath, currentPath } from "./paths";

// Curated program enrollment (Forge Paths 4.0). Records live in the journal
// with a `forgeProgram` marker so they sync and back up like other plans, and
// stay separate from generated Path (`forgePath`) records.

export type Enrollment = {
  record: Journal;
  data: EnrollmentData;
  // Undefined only if the enrolled version is no longer bundled.
  program: CuratedProgram | undefined;
};
type Library = readonly CuratedProgram[];

export function enrollments(r: Repository, library: Library = programLibrary) {
  return r
    .journal("program")
    .filter((j) => j.data.forgeProgram === 1)
    .map((record): Enrollment => {
      const data = enrollmentDataSchema.parse(record.data);
      return {
        record,
        data,
        program: findProgramVersion(
          library,
          data.programId,
          data.programVersion,
        ),
      };
    });
}
export function currentEnrollment(
  r: Repository,
  library: Library = programLibrary,
) {
  return enrollments(r, library).find((e) => e.data.status === "active");
}
function findEnrollment(r: Repository, id: string, library: Library) {
  const enrollment = enrollments(r, library).find((e) => e.record.id === id);
  if (!enrollment) throw new Error("Program enrollment not found.");
  return enrollment;
}

export type LoggedSession = {
  record: Journal;
  data: ProgramSessionLog;
  state: "completed" | "in-progress" | "skipped";
};
// Logs whose workout was deleted no longer count, so that session becomes
// available again rather than being recorded as done.
export function sessionLogs(r: Repository, enrollmentId: string) {
  const workouts = new Map(r.workouts().map((w) => [w.id, w]));
  const logs: LoggedSession[] = [];
  for (const record of r.journal("schedule")) {
    if (
      record.data.forgeProgram !== 1 ||
      record.data.enrollmentId !== enrollmentId
    )
      continue;
    const data = programSessionLogSchema.parse(record.data);
    if (data.skipped) {
      logs.push({ record, data, state: "skipped" });
      continue;
    }
    const workout = workouts.get(data.workoutId);
    if (workout)
      logs.push({
        record,
        data,
        state: workout.status === "completed" ? "completed" : "in-progress",
      });
  }
  return logs.sort((a, b) => a.data.position - b.data.position);
}

export type ProgramProgress = {
  total: number | undefined;
  completed: number;
  skipped: number;
  complete: boolean;
  // The first session not yet completed or skipped, with suggested dates for
  // it and the sessions after it.
  next?: SessionSlot & { state: "ready" | "in-progress"; workoutId?: string };
  upcoming: (SessionSlot & { suggested: string })[];
  logs: LoggedSession[];
};
export function programProgress(
  r: Repository,
  enrollment: Enrollment,
  today = localDate(),
): ProgramProgress {
  const logs = sessionLogs(r, enrollment.record.id);
  const program = enrollment.program;
  const total = program ? totalSessions(program) : undefined;
  const done = new Map(logs.map((l) => [l.data.position, l]));
  let position = 0;
  while (done.has(position) && done.get(position)!.state !== "in-progress")
    position++;
  const nextSlot = program ? sessionAt(program, position) : undefined;
  const current = done.get(position);
  const from =
    enrollment.data.started > today ? enrollment.data.started : today;
  const dates = suggestedDates(
    parseWeekdays(enrollment.data.weekdays),
    from,
    4,
  );
  const upcoming = program
    ? dates.flatMap((suggested, i) => {
        const slot = sessionAt(program, position + i);
        return slot ? [{ ...slot, suggested }] : [];
      })
    : [];
  return {
    total,
    completed: logs.filter((l) => l.state === "completed").length,
    skipped: logs.filter((l) => l.state === "skipped").length,
    complete: !!program && !nextSlot,
    ...(nextSlot
      ? {
          next: {
            ...nextSlot,
            state: current ? "in-progress" : "ready",
            ...(current ? { workoutId: current.data.workoutId } : {}),
          },
        }
      : {}),
    upcoming,
    logs,
  };
}

// Starts a program after the lifter confirms. Other active plans are archived,
// never deleted: their schedules and recorded workouts are preserved.
export function enrollProgram(
  r: Repository,
  program: CuratedProgram,
  startDate = localDate(),
  replace = false,
) {
  if (program.status !== "published")
    throw new Error("Only published programs can be started.");
  const active = enrollments(r).some((e) => e.data.status === "active");
  const generated = currentPath(r);
  if ((active || generated) && !replace)
    throw new Error(
      "You already have an active plan. Confirm replacement before starting another.",
    );
  return r.transaction(() => {
    for (const old of enrollments(r).filter((e) => e.data.status === "active"))
      r.updateJournal(old.record.id, {
        ...old.record.data,
        status: "archived",
      });
    if (generated) archivePath(r, generated.record.id);
    const data: EnrollmentData = {
      forgeProgram: 1,
      programId: program.id,
      programVersion: program.version,
      name: program.name,
      started: startDate,
      status: "active",
      weekdays: trainingWeekdays(program.weeklyPattern, r.profile().restDay)
        .sort((a, b) => a - b)
        .join(","),
    };
    return r.addJournal("program", data, startDate);
  });
}

export function sessionPrescription(session: ProgramSession): Prescription[] {
  return session.exercises.map((item) => ({
    exerciseId: item.exerciseId,
    sets: item.sets,
    reps: item.reps.min,
    ...(item.reps.max !== item.reps.min ? { repMax: item.reps.max } : {}),
    weight: 0,
    rest: item.restSeconds,
  }));
}

function requireNext(r: Repository, enrollmentId: string, library: Library) {
  const enrollment = findEnrollment(r, enrollmentId, library);
  if (enrollment.data.status !== "active")
    throw new Error("This program has ended. Its history remains available.");
  if (!enrollment.program)
    throw new Error(
      `${enrollment.data.name} version ${enrollment.data.programVersion} is not available in this app version. Your history is preserved.`,
    );
  const progress = programProgress(r, enrollment);
  if (!progress.next)
    throw new Error("Every session in this program is complete.");
  return { enrollment, progress, next: progress.next };
}
function logRecord(r: Repository, enrollmentId: string, position: number) {
  return r
    .journal("schedule")
    .find(
      (j) =>
        j.data.forgeProgram === 1 &&
        j.data.enrollmentId === enrollmentId &&
        j.data.position === position,
    );
}

// Starts (or resumes) the next session exactly as authored.
export function startProgramSession(
  r: Repository,
  enrollmentId: string,
  library: Library = programLibrary,
) {
  return r.transaction(() => {
    const { enrollment, next } = requireNext(r, enrollmentId, library);
    const active = r.active();
    if (active && next.state === "in-progress" && active.id === next.workoutId)
      return active;
    if (active)
      throw new Error(
        "Finish or discard your current workout first. It has not been assigned to this program session.",
      );
    const workout = r.startPrescribedWorkout(
      `${enrollment.program!.name} · ${next.session.name}`,
      sessionPrescription(next.session),
    );
    const data: ProgramSessionLog = {
      forgeProgram: 1,
      enrollmentId,
      position: next.position,
      workoutId: workout.id,
      skipped: false,
    };
    const existing = logRecord(r, enrollmentId, next.position);
    if (existing) r.updateJournal(existing.id, data, localDate());
    else r.addJournal("schedule", data);
    return workout;
  });
}

// Skipping is the lifter's choice; the program itself is not changed.
export function skipProgramSession(
  r: Repository,
  enrollmentId: string,
  library: Library = programLibrary,
) {
  r.transaction(() => {
    const { next } = requireNext(r, enrollmentId, library);
    if (next.state === "in-progress")
      throw new Error("Finish or discard the workout in progress first.");
    const data: ProgramSessionLog = {
      forgeProgram: 1,
      enrollmentId,
      position: next.position,
      workoutId: "",
      skipped: true,
    };
    const existing = logRecord(r, enrollmentId, next.position);
    if (existing) r.updateJournal(existing.id, data, localDate());
    else r.addJournal("schedule", data);
  });
}

// Returns a skipped session to the queue.
export function restoreProgramSession(r: Repository, logId: string) {
  const record = r.journal("schedule").find((j) => j.id === logId);
  if (!record || record.data.forgeProgram !== 1)
    throw new Error("Program session not found.");
  if (!programSessionLogSchema.parse(record.data).skipped)
    throw new Error("Only skipped sessions can be restored.");
  r.deleteJournal(logId);
}

export function endProgram(
  r: Repository,
  enrollmentId: string,
  library: Library = programLibrary,
) {
  const enrollment = findEnrollment(r, enrollmentId, library);
  if (enrollment.data.status !== "active") return;
  r.updateJournal(enrollmentId, {
    ...enrollment.record.data,
    status: "archived",
  });
}

// The authored program and session behind a workout, if any.
export function programWorkoutContext(
  r: Repository,
  workoutId: string,
  library: Library = programLibrary,
) {
  const log = r
    .journal("schedule")
    .find((j) => j.data.forgeProgram === 1 && j.data.workoutId === workoutId);
  if (!log) return undefined;
  const data = programSessionLogSchema.parse(log.data);
  const enrollment = enrollments(r, library).find(
    (e) => e.record.id === data.enrollmentId,
  );
  const slot = enrollment?.program
    ? sessionAt(enrollment.program, data.position)
    : undefined;
  return enrollment ? { enrollment, slot } : undefined;
}
