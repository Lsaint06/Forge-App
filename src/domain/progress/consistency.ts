import { addDays } from "../paths/model";
import { weekdayIndex, type Bucket } from "./range";

// Training consistency (Design System 2.0, Phase 5). Completed workouts are
// facts; "planned" comes only from the lifter's own plans:
// - a curated program's suggested weekdays, counted per week (sessions may
//   be trained on any day, so a 3-day program trained three times that week
//   is fully on plan, whatever the days);
// - dated sessions: an existing generated Path and saved calendar plans.
// Without a plan nothing is counted as missed. Rest days are never failures.

export type ProgramPlan = {
  name: string;
  /** First planned day (the enrollment's start date). */
  start: string;
  /** Last planned day: today while active, else the last recorded session. */
  end: string;
  /** Suggested weekdays, 0 = Monday. */
  weekdays: number[];
  /** Dates program sessions were completed. */
  done: string[];
  /** Dates program sessions were skipped. */
  skipped: string[];
};

export type DatedSession = {
  date: string;
  name: string;
  source: "path" | "plan";
  state: "completed" | "skipped" | "missed" | "scheduled";
};

export type ConsistencyInput = {
  today: string;
  workouts: { date: string; workoutId: string; name: string }[];
  programs: ProgramPlan[];
  dated: DatedSession[];
  /** Suggested upcoming program sessions (shown, never counted). */
  upcoming: { date: string; name: string }[];
};

export type PeriodSummary = {
  start: string;
  end: string;
  /** Every completed workout. */
  completed: number;
  /** Planned sessions in the period (including ones still ahead). */
  planned: number;
  /** Planned sessions done. */
  onPlan: number;
  skipped: number;
  /** Planned sessions not done once their time has passed. */
  missed: number;
  /** Planned sessions that count for adherence so far, and those done. */
  due: number;
  dueDone: number;
};

const between = (date: string, start: string, end: string) =>
  date >= start && date <= end;

function weekSummary(input: ConsistencyInput, week: string): PeriodSummary {
  const end = addDays(week, 6);
  const past = end < input.today;
  const s: PeriodSummary = {
    start: week,
    end,
    completed: input.workouts.filter((w) => between(w.date, week, end)).length,
    planned: 0,
    onPlan: 0,
    skipped: 0,
    missed: 0,
    due: 0,
    dueDone: 0,
  };
  for (const p of input.programs) {
    let planned = 0;
    for (let d = week; d <= end; d = addDays(d, 1))
      if (between(d, p.start, p.end) && p.weekdays.includes(weekdayIndex(d)))
        planned++;
    if (!planned) continue;
    const done = p.done.filter((d) => between(d, week, end)).length;
    const skipped = p.skipped.filter((d) => between(d, week, end)).length;
    const onPlan = Math.min(planned, done);
    const skippedOnPlan = Math.min(planned - onPlan, skipped);
    s.planned += planned;
    s.onPlan += onPlan;
    s.skipped += skippedOnPlan;
    if (past) {
      // The week is over: the shortfall was missed.
      s.missed += planned - onPlan - skippedOnPlan;
      s.due += planned;
    } else {
      // The week is still running: credit what is done or skipped; the rest
      // can still happen.
      s.due += onPlan + skippedOnPlan;
    }
    s.dueDone += onPlan;
  }
  for (const d of input.dated.filter((x) => between(x.date, week, end))) {
    s.planned++;
    if (d.state === "completed") {
      s.onPlan++;
      s.due++;
      s.dueDone++;
    } else if (d.state === "skipped") {
      s.skipped++;
      s.due++;
    } else if (d.state === "missed") {
      s.missed++;
      s.due++;
    }
  }
  return s;
}

/** Summaries for each week starting on the given Mondays. */
export function weekSummaries(input: ConsistencyInput, weeks: string[]) {
  return weeks.map((w) => weekSummary(input, w));
}

/**
 * Folds weekly summaries into chart buckets. A week counts in the bucket its
 * Monday falls in, so no week is split or counted twice.
 */
export function bucketSummaries(
  weeks: PeriodSummary[],
  bucketList: Bucket[],
): PeriodSummary[] {
  return bucketList.map((b) => {
    const inside = weeks.filter((w) => between(w.start, b.start, b.end));
    const sum = (k: keyof PeriodSummary) =>
      inside.reduce((n, w) => n + (w[k] as number), 0);
    return {
      start: b.start,
      end: b.end,
      completed: sum("completed"),
      planned: sum("planned"),
      onPlan: sum("onPlan"),
      skipped: sum("skipped"),
      missed: sum("missed"),
      due: sum("due"),
      dueDone: sum("dueDone"),
    };
  });
}

export type Consistency = {
  completed: number;
  planned: number;
  skipped: number;
  missed: number;
  /** Share of due planned sessions completed; undefined without a plan. */
  adherence?: number;
  due: number;
  dueDone: number;
  /** Weeks with at least one completed workout, and weeks counted. */
  activeWeeks: number;
  weeks: number;
};

export function consistency(weeks: PeriodSummary[]): Consistency {
  const sum = (k: keyof PeriodSummary) =>
    weeks.reduce((n, w) => n + (w[k] as number), 0);
  const due = sum("due");
  const dueDone = sum("dueDone");
  return {
    completed: sum("completed"),
    planned: sum("planned"),
    skipped: sum("skipped"),
    missed: sum("missed"),
    ...(due ? { adherence: dueDone / due } : {}),
    due,
    dueDone,
    activeWeeks: weeks.filter((w) => w.completed > 0).length,
    weeks: weeks.length,
  };
}

// ---- Days ------------------------------------------------------------------

export type DayStatus =
  "completed" | "missed" | "skipped" | "scheduled" | "rest";

export type DayDetail = {
  date: string;
  status: DayStatus;
  workouts: { workoutId: string; name: string }[];
  sessions: { name: string; state: DatedSession["state"]; source: string }[];
};

/**
 * What happened (or is planned) on a day. A completed workout outranks the
 * rest; then a missed, skipped or scheduled session. Days with nothing
 * planned or done are rest days. Curated programs never mark a particular
 * day as missed: their sessions are not tied to dates.
 */
export function dayDetail(input: ConsistencyInput, date: string): DayDetail {
  const workouts = input.workouts
    .filter((w) => w.date === date)
    .map(({ workoutId, name }) => ({ workoutId, name }));
  const sessions: DayDetail["sessions"] = [
    ...input.dated
      .filter((d) => d.date === date)
      .map((d) => ({ name: d.name, state: d.state, source: d.source })),
    ...input.programs.flatMap((p) =>
      p.skipped
        .filter((d) => d === date)
        .map(() => ({
          name: p.name,
          state: "skipped" as const,
          source: "program",
        })),
    ),
    ...(date >= input.today
      ? input.upcoming
          .filter((u) => u.date === date)
          .map((u) => ({
            name: u.name,
            state: "scheduled" as const,
            source: "program",
          }))
      : []),
  ];
  const has = (state: DatedSession["state"]) =>
    sessions.some((s) => s.state === state);
  const status: DayStatus = workouts.length
    ? "completed"
    : has("missed")
      ? "missed"
      : has("skipped")
        ? "skipped"
        : has("scheduled")
          ? "scheduled"
          : "rest";
  return { date, status, workouts, sessions };
}
