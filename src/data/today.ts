import type { Repository } from "./repository";
import {
  localDate,
  type Journal,
  type Template,
  type Workout,
} from "../domain/types";
import { addDays } from "../domain/paths/model";
import type { CuratedProgram } from "../domain/programs/model";
import {
  currentEnrollment,
  programProgress,
  startProgramSession,
  type Enrollment,
} from "./programs";
import {
  currentPath,
  pathSummary,
  startScheduledSession,
  visibleSchedules,
  type PathSession,
} from "./paths";

// Today's single next-workout choice (Design System 2.0, Phase 3). Read-only:
// it picks among sessions the program, Path and calendar code already offer,
// and starts them only through those same functions. Nothing is rescheduled.

export type NextSession =
  | { kind: "active"; workout: Workout }
  | {
      kind: "program";
      when: "today" | "upcoming";
      /** The program's suggested date for this session. */
      date: string;
      name: string;
      plan: string;
      week: number;
      enrollment: Enrollment;
    }
  | {
      kind: "path";
      when: "today" | "upcoming" | "missed";
      /** The date the session is scheduled for in the Path. */
      date: string;
      name: string;
      plan: string;
      week: number;
      entry: Journal;
    }
  | {
      kind: "planned";
      date: string;
      name: string;
      entry: Journal;
      template: Template | undefined;
    }
  | { kind: "none" };

type Library = readonly CuratedProgram[];

/** The current program's next session as Today presents it. */
export function programNext(
  r: Repository,
  today: string,
  library?: Library,
): Extract<NextSession, { kind: "program" }> | undefined {
  const enrollment = currentEnrollment(r, library);
  if (!enrollment) return undefined;
  const progress = programProgress(r, enrollment, today);
  const next = progress.next;
  if (!next || next.state !== "ready") return undefined;
  // Once a program session is finished today, the next one is suggested from
  // tomorrow, so Today never presents a second session as due today.
  const workouts = new Map(r.workouts().map((w) => [w.id, w]));
  const trainedToday = progress.logs.some((l) => {
    const w = workouts.get(l.data.workoutId);
    return (
      l.state === "completed" &&
      !!w &&
      localDate(w.finishedAt ?? w.startedAt) === today
    );
  });
  const suggested = trainedToday
    ? programProgress(r, enrollment, addDays(today, 1)).upcoming[0]?.suggested
    : progress.upcoming[0]?.suggested;
  const date = suggested ?? today;
  return {
    kind: "program",
    when: date <= today ? "today" : "upcoming",
    date,
    name: next.session.name,
    plan: enrollment.data.name,
    week: next.week,
    enrollment,
  };
}

/**
 * The Path session Today offers: today's open session, otherwise the oldest
 * open one (missed sessions first). The Path screen focuses the same one.
 */
export function pathFocus(sessions: PathSession[], today = localDate()) {
  const open = (s: PathSession) =>
    ["scheduled", "unlinked", "missed"].includes(s.state);
  return (
    sessions.find((s) => open(s) && s.record.date === today) ??
    sessions.find(open)
  );
}

function pathSession(
  r: Repository,
  today: string,
): Extract<NextSession, { kind: "path" }> | undefined {
  const path = currentPath(r);
  if (!path || path.data.status !== "active") return undefined;
  const session = pathFocus(pathSummary(r, path, today).sessions, today);
  if (!session) return undefined;
  const date = session.record.date;
  return {
    kind: "path",
    when: date === today ? "today" : date < today ? "missed" : "upcoming",
    date,
    name: session.data.name,
    plan: path.data.name,
    week: session.data.week,
    entry: session.record,
  };
}

// A calendar plan for a saved template, unless that template was already
// trained today.
function plannedToday(
  r: Repository,
  today: string,
): Extract<NextSession, { kind: "planned" }> | undefined {
  const done = new Set(
    r
      .workouts()
      .filter(
        (w) =>
          w.status === "completed" &&
          localDate(w.finishedAt ?? w.startedAt) === today,
      )
      .map((w) => w.templateId),
  );
  const entry = visibleSchedules(r).find(
    (j) =>
      j.date === today &&
      j.data.forgePath !== 1 &&
      !done.has(String(j.data.templateId)),
  );
  if (!entry) return undefined;
  return {
    kind: "planned",
    date: entry.date,
    name: String(entry.data.name),
    entry,
    template: r.templates().find((t) => t.id === entry.data.templateId),
  };
}

/**
 * Priority: the workout in progress; a session due today (program, Path,
 * then a planned template); the next program or Path session (which may be
 * started early, as the program and Path screens allow); otherwise none.
 */
export function nextSession(
  r: Repository,
  today = localDate(),
  library?: Library,
): NextSession {
  const workout = r.active();
  if (workout) return { kind: "active", workout };
  const program = programNext(r, today, library);
  const path = pathSession(r, today);
  if (program?.when === "today") return program;
  if (path?.when === "today") return path;
  const planned = plannedToday(r, today);
  if (planned) return planned;
  return program ?? path ?? { kind: "none" };
}

/** Starts or resumes the chosen session through the existing guarded paths. */
export function startNextSession(
  r: Repository,
  next: NextSession,
  library?: Library,
): Workout | undefined {
  switch (next.kind) {
    case "active":
      return next.workout;
    case "program":
      return startProgramSession(r, next.enrollment.record.id, library);
    case "path":
    case "planned":
      return startScheduledSession(r, next.entry);
    case "none":
      return r.startWorkout();
  }
}
