import type { Journal } from "./types";
import { isBodyweightName, validateJournal } from "./validation";
import { newestFirst, readValue, toDisplay, valueText } from "./measurements";
import { kgToLb, lbToKg } from "./metrics";
import { decimalText } from "./numbers";
import { addDays } from "./paths/model";
import { mondayOf } from "./progress/range";
import { loadText } from "./progress/format";
import { dayTitle } from "./calendar-dates";

// Goals (Phase 7B WP4D). Records keep their journal shape (`kind: "goal"`,
// `metric`, `target`, …). Every value shown is derived from recorded data
// with the exact definitions in docs/audits/PHASE_7B_WP4D_GOALS_AUDIT.md
// (section 16A); nothing is estimated or projected. Goals carrying
// `goalRules: 2` use the WP4D definitions; older goals keep their original
// meaning and are converted only when the lifter chooses to.

export type Units = "kg" | "lb";
export type GoalType =
  "bodyweight" | "strength" | "volume" | "workouts" | "duration" | "nutrition";
export type Direction = "atLeast" | "atMost";
export type Goal = Pick<
  Journal,
  "id" | "date" | "createdAt" | "updatedAt" | "data"
>;

export const GOAL_TYPES: readonly GoalType[] = [
  "bodyweight",
  "strength",
  "volume",
  "workouts",
  "duration",
  "nutrition",
];
/** Targets are reached once; habits are kept up period by period. */
export const TYPES: Record<
  GoalType,
  { title: string; detail: string; habit: boolean }
> = {
  bodyweight: {
    title: "Bodyweight",
    detail: "Reach a weight, up or down",
    habit: false,
  },
  strength: {
    title: "Lift",
    detail: "Lift a weight in an exercise",
    habit: false,
  },
  volume: {
    title: "Training volume",
    detail: "Lift a total amount from a day you choose",
    habit: false,
  },
  workouts: {
    title: "Workouts per week",
    detail: "Train a number of times each week",
    habit: true,
  },
  duration: {
    title: "Session length",
    detail: "Keep workouts at least, or at most, a length",
    habit: true,
  },
  nutrition: {
    title: "Daily calories",
    detail: "Eat at least, or at most, an amount each day",
    habit: true,
  },
};
export const VOLUME_MAX_KG = 100_000;
export const DURATION_WINDOW_DAYS = 28;
export const CALORIE_HISTORY_DAYS = 7;
export const WEEK_HISTORY = 4;
export const REPS_MAX = 30;
export const NAME_MAX = 120;

/** A number stored in a goal, read defensively (older edits stored text). */
export function num(v: unknown) {
  const x =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim()
        ? Number(v)
        : NaN;
  return Number.isFinite(x) ? x : undefined;
}
export const typeOf = (g: Goal) =>
  GOAL_TYPES.includes(g.data.metric as GoalType)
    ? (g.data.metric as GoalType)
    : undefined;
export const isV2 = (g: Goal) => g.data.goalRules === 2;
export const directionOf = (g: Goal): Direction | undefined =>
  isV2(g) && (g.data.direction === "atLeast" || g.data.direction === "atMost")
    ? g.data.direction
    : undefined;
export const statusOf = (g: Goal) =>
  g.data.status === "achieved"
    ? "achieved"
    : g.data.status === "archived"
      ? "archived"
      : "active";
/** Required reps for a lift goal (WP4D goals only; otherwise 1). */
export function repsOf(g: Goal) {
  const r = num(g.data.reps);
  return isV2(g) && r !== undefined && Number.isInteger(r) && r >= 1
    ? Math.min(r, REPS_MAX)
    : 1;
}

// ---- Recorded sources (built from the repository; see data/goal-sources) -----

export type DatedWorkout = {
  id: string;
  /** Local day the workout finished. */
  date: string;
  /** Finish time (ms). */
  time: number;
  minutes: number;
};
/** One working set (completed, not a warm-up, ≥ 1 rep) of a finished workout. */
export type LiftSet = {
  date: string;
  time: number;
  weight: number;
  reps: number;
};
export type Sources = {
  today: string;
  units: Units;
  /** Measurement records (any order). */
  measurements: Goal[];
  /** Completed workouts (any order). */
  workouts: DatedWorkout[];
  /** Recorded load × reps of a workout, as workout History shows it. */
  volumeOf: (workoutId: string) => number;
  lifts: (exerciseId: string) => LiftSet[];
  exercise: (exerciseId: string) => { name: string; load: boolean } | undefined;
  /** Logged calories per local day; only days with at least one entry. */
  calories: Map<string, number>;
};

// ---- Formatting ------------------------------------------------------------------

const massText = (kg: number, units: Units) => valueText(kg, "mass", units);
const liftText = (kg: number, units: Units) => loadText(kg, units);
export function volumeText(kg: number, units: Units) {
  return `${Math.round(units === "lb" ? kgToLb(kg) : kg).toLocaleString()} ${units}`;
}
const kcal = (n: number) => `${Math.round(n).toLocaleString()} kcal`;
const minutes = (n: number) => `${Math.round(n)} min`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- Evaluation ------------------------------------------------------------------

export type Qualifying = { date: string; time: number; value: number };
export type HistoryMark = {
  label: string;
  state: "met" | "missed" | "none";
  detail: string;
};
export type GoalView = {
  goal: Goal;
  type: GoalType | undefined;
  habit: boolean;
  status: "active" | "achieved" | "archived";
  name: string;
  /** What is measured, in words ("Lift · Bench press · 5+ reps"). */
  measure: string;
  /** The latest recorded value and its basis ("82 kg · Thu, Oct 22"). */
  current?: string;
  target: string;
  /** 0–1, only where a real start or zero exists (audit section 16A). */
  ratio?: number;
  ratioLabel?: string;
  /** One plain sentence about where things stand. */
  state: string;
  reached: boolean;
  /** The recorded value that met a target goal (for Mark as achieved). */
  qualifying?: Qualifying;
  /** The qualifying record predates the goal. */
  historical: boolean;
  notes: string[];
  history?: HistoryMark[];
  targetDate?: string;
  spoken: string;
};

/** The latest bodyweight weigh-in (WP4B ordering, any spelling). */
export function latestWeighIn(measurements: Goal[]) {
  return measurements
    .filter(
      (m) => isBodyweightName(m.data.name) && (num(m.data.value) ?? 0) > 0,
    )
    .sort(newestFirst)[0];
}

/** Heaviest working set at ≥ reps; ties go to the earliest workout. */
export function bestLift(sets: LiftSet[], reps: number) {
  let best: LiftSet | undefined;
  for (const s of sets) {
    if (s.reps < reps || !(s.weight > 0)) continue;
    if (
      !best ||
      s.weight > best.weight + 1e-6 ||
      (Math.abs(s.weight - best.weight) <= 1e-6 && s.time < best.time)
    )
      best = s;
  }
  return best;
}
/** The earliest working set at ≥ reps that meets the target. */
export function firstLiftAt(sets: LiftSet[], reps: number, target: number) {
  return sets
    .filter((s) => s.reps >= reps && s.weight >= target - 1e-6)
    .sort((a, b) => a.time - b.time)[0];
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const directionWord = (d: Direction) =>
  d === "atLeast" ? "at least" : "at most";

export function evaluate(g: Goal, s: Sources): GoalView {
  const type = typeOf(g);
  const target = num(g.data.target) ?? 0;
  const base = {
    goal: g,
    type,
    habit: type ? TYPES[type].habit : false,
    status: statusOf(g) as GoalView["status"],
    name: String(g.data.name ?? "").trim() || "Goal",
    reached: false,
    historical: false,
    notes: [] as string[],
    targetDate:
      typeof g.data.targetDate === "string" ? g.data.targetDate : undefined,
  };
  let v: Omit<GoalView, "spoken">;
  switch (type) {
    case "bodyweight":
      v = { ...base, ...bodyweight(g, s, target) };
      break;
    case "strength":
      v = { ...base, ...lift(g, s, target) };
      break;
    case "volume":
      v = { ...base, ...volumeGoal(g, s, target) };
      break;
    case "workouts":
      v = { ...base, ...weekly(g, s, target) };
      break;
    case "duration":
      v = { ...base, ...duration(g, s, target) };
      break;
    case "nutrition":
      v = { ...base, ...calories(g, s, target) };
      break;
    default:
      v = {
        ...base,
        measure: "Unknown goal type",
        target: String(g.data.target ?? ""),
        state: "This goal's type isn't recognised; it is kept as recorded.",
      };
  }
  if (v.targetDate && v.status === "active" && v.targetDate < s.today)
    v.notes.push(`Target date passed (${dayTitle(v.targetDate, s.today)}).`);
  if (v.status === "achieved") v = { ...v, ...achieved(g, v, s) };
  return { ...v, spoken: spoken(v, s) };
}

type Part = Omit<
  GoalView,
  | "goal"
  | "type"
  | "habit"
  | "status"
  | "name"
  | "targetDate"
  | "spoken"
  | "reached"
  | "historical"
  | "notes"
> &
  Partial<Pick<GoalView, "reached" | "historical" | "notes">>;

function bodyweight(g: Goal, s: Sources, target: number): Part {
  const units = s.units;
  const start = num(g.data.start);
  const losing = start !== undefined ? target < start : undefined;
  const latest = latestWeighIn(s.measurements);
  const notes: string[] = [];
  const reference = latest ? num(latest.data.value)! : start;
  if (reference && Math.abs(target - reference) / reference > 0.5)
    notes.push(
      "This target is far from your recorded weight. Edit it if it was entered in pounds.",
    );
  const measure = `Bodyweight${losing === undefined ? "" : losing ? " · lose" : " · gain"}`;
  const targetText = `Target ${massText(target, units)}`;
  if (!latest)
    return {
      measure,
      target: targetText,
      state: "No weigh-in yet. Log one in Measurements.",
      reached: false,
      historical: false,
      notes,
    };
  const cur = num(latest.data.value)!;
  const reached =
    losing === undefined ? false : losing ? cur <= target : cur >= target;
  const ratio =
    start !== undefined && start !== target
      ? clamp((cur - start) / (target - start))
      : undefined;
  const away = Math.abs(target - cur);
  const wrongWay =
    start !== undefined &&
    losing !== undefined &&
    (losing ? cur > start : cur < start);
  const state = reached
    ? "Target reached"
    : wrongWay
      ? `${massText(Math.abs(cur - start!), units)} ${losing ? "above" : "below"} your start`
      : `${massText(away, units)} to go`;
  const qualifying = reached
    ? { date: latest.date, time: latest.createdAt, value: cur }
    : undefined;
  const historical = !!qualifying && qualifying.date < g.date;
  if (historical)
    notes.push(
      `Your latest weigh-in (${dayTitle(latest.date, s.today)}) is from before this goal was set.`,
    );
  return {
    measure,
    current: `${massText(cur, units)} · ${dayTitle(latest.date, s.today)}`,
    target: targetText,
    ratio,
    ratioLabel:
      start !== undefined
        ? `From ${massText(start, units)} to ${massText(target, units)}`
        : undefined,
    state,
    reached,
    qualifying,
    historical,
    notes,
  };
}

function lift(g: Goal, s: Sources, target: number): Part {
  const units = s.units;
  const id = String(g.data.exerciseId ?? "").trim();
  const reps = repsOf(g);
  const ex = id ? s.exercise(id) : undefined;
  const repsText = reps > 1 ? ` · ${reps}+ reps` : "";
  const targetText = `Target ${liftText(target, units)}${reps > 1 ? ` × ${reps}` : ""}`;
  if (!ex)
    return {
      measure: `Lift${repsText}`,
      target: targetText,
      state: id
        ? `Exercise not found (${id}). Edit the goal to choose an exercise.`
        : "No exercise chosen. Edit the goal to choose one.",
    };
  const measure = `Lift · ${ex.name}${repsText}`;
  if (!ex.load)
    return {
      measure,
      target: targetText,
      state:
        "This exercise's logged weight isn't counted as load (bodyweight, assisted or band work), so it can't be measured by weight lifted.",
    };
  const sets = s.lifts(id);
  const best = bestLift(sets, reps);
  const first = firstLiftAt(sets, reps, target);
  const reached = !!first;
  const qualifying = first
    ? { date: first.date, time: first.time, value: first.weight }
    : undefined;
  const historical = !!first && first.time < g.createdAt;
  const notes: string[] = [];
  if (historical)
    notes.push(
      `You first lifted this on ${dayTitle(first!.date, s.today)}, before this goal was set.`,
    );
  // Only goals created with WP4D rules have a trusted starting best.
  const start = isV2(g) ? (num(g.data.start) ?? 0) : undefined;
  const ratio =
    best && start !== undefined && target > start
      ? clamp((best.weight - start) / (target - start))
      : start !== undefined && target > start
        ? 0
        : undefined;
  return {
    measure,
    current: best
      ? `Best ${liftText(best.weight, units)} × ${best.reps} · ${dayTitle(best.date, s.today)}`
      : undefined,
    target: targetText,
    ratio,
    ratioLabel:
      ratio !== undefined
        ? `From ${liftText(start!, units)} when the goal was set`
        : undefined,
    state: reached
      ? historical
        ? "Already lifted before this goal was set"
        : "Target reached"
      : best
        ? `${liftText(target - best.weight, units)} to go`
        : reps > 1
          ? `No sets of ${reps} or more reps recorded yet`
          : "No sets recorded yet",
    reached,
    qualifying,
    historical,
    notes,
  };
}

function volumeGoal(g: Goal, s: Sources, target: number): Part {
  const units = s.units;
  const from = isV2(g) ? g.date : undefined;
  const list = s.workouts
    .filter((w) => !from || w.date >= from)
    .sort((a, b) => a.time - b.time);
  let total = 0;
  let crossing: Qualifying | undefined;
  for (const w of list) {
    total += s.volumeOf(w.id);
    if (!crossing && total >= target)
      crossing = { date: w.date, time: w.time, value: total };
  }
  const historical = !!crossing && crossing.time < g.createdAt;
  const notes: string[] = [];
  if (historical)
    notes.push(
      `This total was passed on ${dayTitle(crossing!.date, s.today)}, before this goal was set.`,
    );
  return {
    measure: from
      ? `Training volume · from ${dayTitle(from, s.today)}`
      : "Lifetime volume",
    current: `${volumeText(total, units)} ${from ? "so far" : "lifetime"}`,
    target: `Target ${volumeText(target, units)}`,
    ratio: target > 0 ? clamp(total / target) : undefined,
    ratioLabel: from
      ? `Counted from ${dayTitle(from, s.today)}`
      : "Counted over all your workouts",
    state: crossing
      ? historical
        ? "Already passed before this goal was set"
        : "Target reached"
      : `${volumeText(target - total, units)} to go`,
    reached: !!crossing,
    qualifying: crossing,
    historical,
    notes,
  };
}

const countIn = (s: Sources, from: string, to: string) =>
  s.workouts.filter((w) => w.date >= from && w.date <= to).length;

function weekly(g: Goal, s: Sources, target: number): Part {
  const monday = mondayOf(s.today);
  const count = countIn(s, monday, s.today);
  const history: HistoryMark[] = [];
  for (let k = WEEK_HISTORY; k >= 1; k--) {
    const start = addDays(monday, -7 * k);
    const end = addDays(start, 6);
    if (end < g.date) continue;
    const n = countIn(s, start, end);
    history.push({
      label: `Week of ${dayTitle(start, s.today)}`,
      state: n >= target ? "met" : "missed",
      detail: `${n} of ${target}`,
    });
  }
  return {
    measure: "Workouts per week",
    current: `${count} of ${target} this week`,
    target: `Target ${plural(target, "workout")} a week`,
    ratio: target > 0 ? clamp(count / target) : undefined,
    ratioLabel: "This week (Monday to Sunday)",
    state:
      count >= target ? "Met this week" : `${target - count} more this week`,
    history,
  };
}

function duration(g: Goal, s: Sources, target: number): Part {
  const dir = directionOf(g);
  if (!dir) {
    // Legacy: the average of all workouts; its direction was never recorded.
    const all = s.workouts;
    const avg = all.length
      ? all.reduce((t, w) => t + w.minutes, 0) / all.length
      : undefined;
    return {
      measure: "Average of all workouts",
      current:
        avg === undefined
          ? undefined
          : `Average ${minutes(avg)} · ${plural(all.length, "workout")}`,
      target: `Target ${minutes(target)}`,
      state:
        avg === undefined
          ? "No workouts recorded yet"
          : "Edit this goal to choose at least or at most.",
    };
  }
  const first = addDays(s.today, -(DURATION_WINDOW_DAYS - 1));
  const from = g.date > first ? g.date : first;
  const list = s.workouts.filter((w) => w.date >= from && w.date <= s.today);
  const measure = `Session length · ${directionWord(dir)}`;
  const targetText = `Target ${directionWord(dir)} ${minutes(target)}`;
  if (!list.length)
    return {
      measure,
      target: targetText,
      state: "No workouts in the last 4 weeks",
    };
  const avg = list.reduce((t, w) => t + w.minutes, 0) / list.length;
  const met = dir === "atMost" ? avg <= target : avg >= target;
  const gap = Math.abs(avg - target);
  return {
    measure,
    current: `Average ${minutes(avg)} · ${plural(list.length, "workout")}, last 4 weeks`,
    target: targetText,
    state: met
      ? "Within target"
      : `${minutes(gap)} ${dir === "atMost" ? "over" : "under"} target`,
  };
}

function calories(g: Goal, s: Sources, target: number): Part {
  const dir = directionOf(g);
  const today = s.calories.get(s.today);
  if (!dir)
    return {
      measure: "Today's calories",
      current: today === undefined ? undefined : `${kcal(today)} logged today`,
      target: `Target ${kcal(target)}`,
      state:
        today === undefined
          ? "Nothing logged today"
          : "Edit this goal to choose at least or at most.",
    };
  const history: HistoryMark[] = [];
  for (let k = CALORIE_HISTORY_DAYS; k >= 1; k--) {
    const day = addDays(s.today, -k);
    if (day < g.date) continue;
    const logged = s.calories.get(day);
    history.push(
      logged === undefined
        ? {
            label: dayTitle(day, s.today),
            state: "none",
            detail: "Nothing logged",
          }
        : {
            label: dayTitle(day, s.today),
            state: (dir === "atLeast" ? logged >= target : logged <= target)
              ? "met"
              : "missed",
            detail: `${kcal(logged)} logged`,
          },
    );
  }
  const measure = `Daily calories · ${directionWord(dir)}`;
  const targetText = `Target ${directionWord(dir)} ${kcal(target)} a day`;
  const notes = [
    "Based on the food you log in Nutrition. Days with nothing logged aren't counted.",
  ];
  if (today === undefined)
    return {
      measure,
      target: targetText,
      state: "Nothing logged today",
      history,
      notes,
    };
  return {
    measure,
    current: `${kcal(today)} logged so far today`,
    target: targetText,
    ratio: dir === "atLeast" && target > 0 ? clamp(today / target) : undefined,
    ratioLabel: dir === "atLeast" ? "Logged so far today" : undefined,
    state:
      dir === "atLeast"
        ? today >= target
          ? "Today's logged intake has reached the minimum"
          : `${kcal(target - today)} to go today`
        : today <= target
          ? `${kcal(target - today)} left today, by what you've logged`
          : `${kcal(today - target)} over today, by what you've logged`,
    history,
    notes,
  };
}

/** The confirmed snapshot of an achieved goal; never recomputed. */
export function snapshotOf(g: Goal) {
  const on = typeof g.data.achievedOn === "string" ? g.data.achievedOn : "";
  return {
    on,
    value: num(g.data.achievedValue),
    confirmedAt: num(g.data.confirmedAt),
  };
}
function snapshotValue(
  type: GoalType | undefined,
  value: number,
  units: Units,
) {
  if (type === "bodyweight") return massText(value, units);
  if (type === "strength") return liftText(value, units);
  if (type === "volume") return volumeText(value, units);
  return String(value);
}
function achieved(g: Goal, v: Omit<GoalView, "spoken">, s: Sources) {
  const snap = snapshotOf(g);
  const notes = v.notes.filter((n) => !n.startsWith("Target date passed"));
  const parts = [
    snap.on ? `Achieved ${dayTitle(snap.on, s.today)}` : "Achieved",
    snap.value !== undefined
      ? snapshotValue(v.type, snap.value, s.units)
      : undefined,
  ].filter(Boolean);
  if (snap.confirmedAt !== undefined) {
    const confirmed = new Date(snap.confirmedAt);
    const day = `${confirmed.getFullYear()}-${String(confirmed.getMonth() + 1).padStart(2, "0")}-${String(confirmed.getDate()).padStart(2, "0")}`;
    if (day !== snap.on) notes.push(`Confirmed ${dayTitle(day, s.today)}.`);
  }
  if (snap.on && snap.on < g.date)
    notes.push("The qualifying record is from before this goal was set.");
  const q = v.qualifying;
  const same =
    !!q &&
    q.date === snap.on &&
    snap.value !== undefined &&
    Math.abs(q.value - snap.value) <= 1e-6;
  // A bodyweight goal stays matched while the weigh-in it was achieved with
  // still exists, even after newer weigh-ins.
  const stillRecorded =
    v.type === "bodyweight"
      ? s.measurements.some(
          (m) =>
            isBodyweightName(m.data.name) &&
            m.date === snap.on &&
            snap.value !== undefined &&
            Math.abs((num(m.data.value) ?? NaN) - snap.value) <= 1e-6,
        )
      : same;
  if (!stillRecorded)
    notes.push("Your records have changed since this was achieved.");
  return { state: parts.join(" · "), notes, ratio: undefined };
}

function spoken(v: Omit<GoalView, "spoken">, s: Sources) {
  return [
    v.name,
    v.measure,
    v.current,
    v.target,
    v.ratio !== undefined ? `${Math.round(v.ratio * 100)} percent` : undefined,
    v.state,
    v.targetDate ? `Target date ${dayTitle(v.targetDate, s.today)}` : undefined,
    ...v.notes,
  ]
    .filter(Boolean)
    .join(". ");
}

/** Whether "Mark as achieved" can be offered: a reached target with a record. */
export const canAchieve = (v: GoalView) =>
  v.status === "active" && !v.habit && v.reached && !!v.qualifying;

/** The data written when the lifter confirms an achievement. */
export function achievedData(v: GoalView, confirmedAt: number) {
  if (!canAchieve(v)) throw new Error("This goal can't be marked as achieved");
  const data: Journal["data"] = {
    ...v.goal.data,
    status: "achieved",
    achievedOn: v.qualifying!.date,
    achievedValue: Math.round(v.qualifying!.value * 1e6) / 1e6,
    confirmedAt,
  };
  validateJournal("goal", data);
  return data;
}

// ---- Entering a goal -------------------------------------------------------------

export type GoalDraft = {
  type?: GoalType;
  name: string;
  /** Typed in the lifter's units (kg/lb, kcal, minutes, count). */
  target: string;
  /** Bodyweight only: starting weight in the lifter's units. */
  start: string;
  exerciseId: string;
  reps: number;
  direction?: Direction;
  /** "Counts from" (the goal row's date). */
  date: string;
  targetDate?: string;
  notes: string;
  /** Explicitly switch a legacy goal to WP4D rules. */
  convert: boolean;
};
export type DraftContext = {
  units: Units;
  today: string;
  /** Best working set at ≥ reps for an exercise, in kg. */
  best: (exerciseId: string, reps: number) => number | undefined;
};

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const shown2 = (n: number) => String(Math.round(n * 100) / 100);
/** A stored kg value as an edit field shows it, in the lifter's units. */
export const massEditText = (kg: number, units: Units) =>
  shown2(toDisplay(kg, "kg", units));

/** A stored goal as the sheet starts it. */
export function draftOf(g: Goal, units: Units): GoalDraft {
  const type = typeOf(g);
  const target = num(g.data.target);
  const start = num(g.data.start);
  return {
    type,
    name: String(g.data.name ?? ""),
    target:
      target === undefined
        ? ""
        : type === "bodyweight" || type === "strength"
          ? massEditText(target, units)
          : type === "volume"
            ? shown2(units === "lb" ? kgToLb(target) : target)
            : shown2(target),
    start:
      type === "bodyweight" && start !== undefined
        ? massEditText(start, units)
        : "",
    exerciseId: String(g.data.exerciseId ?? ""),
    reps: repsOf(g),
    direction: directionOf(g),
    date: g.date,
    targetDate:
      typeof g.data.targetDate === "string" ? g.data.targetDate : undefined,
    notes: String(g.data.notes ?? ""),
    convert: false,
  };
}

function readNumber(text: string) {
  const t = decimalText(text.trim());
  if (!t) return undefined;
  if (!/^\d*\.?\d*$/.test(t)) return NaN;
  return Number(t);
}
/** A typed target as stored (kg for weights), or what to fix. */
export function readTarget(
  type: GoalType,
  text: string,
  units: Units,
): { value: number } | { error: string } {
  if (type === "bodyweight" || type === "strength") {
    if (!text.trim()) return { error: "Enter a target, e.g. 80" };
    const read = readValue(text, "mass", units);
    return "error" in read ? read : { value: read.value };
  }
  const n = readNumber(text);
  if (n === undefined) return { error: "Enter a target" };
  if (!Number.isFinite(n)) return { error: "Enter a number, e.g. 60" };
  if (n <= 0) return { error: "The target must be more than zero" };
  if (type === "volume") {
    const kg = r6(units === "lb" ? lbToKg(n) : n);
    if (kg > VOLUME_MAX_KG)
      return {
        error: `Volume targets can be up to ${volumeText(VOLUME_MAX_KG, units)}`,
      };
    return { value: kg };
  }
  if (type === "workouts" && (!Number.isInteger(n) || n > 14))
    return { error: "Choose between 1 and 14 workouts a week" };
  if (n > 100_000) return { error: "That target is too large to record" };
  return { value: n };
}

/** The name shown when the lifter leaves it blank. */
export function defaultName(d: GoalDraft, units: Units, exerciseName?: string) {
  const t = d.type ? readTarget(d.type, d.target, units) : undefined;
  const value = t && "value" in t ? t.value : undefined;
  if (value === undefined || !d.type) return "";
  switch (d.type) {
    case "bodyweight":
      return `Reach ${massText(value, units)}`;
    case "strength":
      return `${exerciseName ?? "Lift"} ${liftText(value, units)}${d.reps > 1 ? ` × ${d.reps}` : ""}`;
    case "volume":
      return `Lift ${volumeText(value, units)} in total`;
    case "workouts":
      return `Train ${value}× a week`;
    case "duration":
      return `Sessions ${d.direction === "atLeast" ? "of at least" : "of at most"} ${minutes(value)}`;
    case "nutrition":
      return `${d.direction === "atLeast" ? "At least" : "At most"} ${kcal(value)} a day`;
  }
}

/** Soft checks that ask before saving; never block. */
export function confirmations(
  d: GoalDraft,
  ctx: DraftContext,
  original?: Goal,
): string[] {
  const asks: string[] = [];
  if (!d.type) return asks;
  const t = readTarget(d.type, d.target, ctx.units);
  const value = "value" in t ? t.value : undefined;
  if (d.type === "bodyweight") {
    const start = readValue(d.start, "mass", ctx.units);
    for (const kg of [value, "value" in start ? start.value : undefined])
      if (kg !== undefined && (kg < 25 || kg > 350)) {
        asks.push(
          `${massText(kg, ctx.units)} is outside the usual range for bodyweight. Save it anyway?`,
        );
        break;
      }
  }
  if (d.type === "strength" && value !== undefined && d.exerciseId) {
    const best = ctx.best(d.exerciseId, d.reps);
    const changed =
      !original ||
      num(original.data.target) !== value ||
      repsOf(original) !== d.reps;
    if (best !== undefined && best >= value - 1e-6 && changed)
      asks.push(
        `You've already lifted ${liftText(best, ctx.units)}${d.reps > 1 ? ` for ${d.reps}+ reps` : ""}, before this goal. It will show as already met. Save it anyway?`,
      );
  }
  return asks;
}

function needsDirection(type: GoalType) {
  return type === "duration" || type === "nutrition";
}

/** A new goal's record, or what to fix. Created goals use WP4D rules. */
export function newGoal(
  d: GoalDraft,
  ctx: DraftContext,
  exerciseName?: string,
): { data: Journal["data"]; date: string } | { error: string } {
  if (!d.type) return { error: "Choose what kind of goal this is" };
  const t = readTarget(d.type, d.target, ctx.units);
  if ("error" in t) return t;
  const data: Journal["data"] = {
    name: (d.name.trim() || defaultName(d, ctx.units, exerciseName)).slice(
      0,
      NAME_MAX,
    ),
    metric: d.type,
    target: t.value,
    goalRules: 2,
  };
  if (d.type === "bodyweight") {
    if (!d.start.trim()) return { error: "Enter your starting weight" };
    const start = readValue(d.start, "mass", ctx.units);
    if ("error" in start) return start;
    if (Math.abs(start.value - t.value) < 1e-6)
      return {
        error:
          "Your target is your starting weight. Choose a different target.",
      };
    data.start = start.value;
  }
  if (d.type === "strength") {
    if (!d.exerciseId) return { error: "Choose an exercise" };
    data.exerciseId = d.exerciseId;
    data.start = r6(ctx.best(d.exerciseId, d.reps) ?? 0);
    if (d.reps > 1) data.reps = Math.min(d.reps, REPS_MAX);
  }
  if (needsDirection(d.type)) {
    if (!d.direction) return { error: "Choose at least or at most" };
    data.direction = d.direction;
  }
  if (d.targetDate) data.targetDate = d.targetDate;
  const notes = d.notes.trim();
  if (notes) data.notes = notes;
  validateJournal("goal", data);
  return { data, date: d.date };
}

/**
 * An edit: only what the lifter changed is merged into the stored data; every
 * other key keeps its exact value and type. Undefined when nothing changed,
 * so an untouched save writes nothing and queues nothing for sync. The type
 * never changes; a legacy goal changes rules only when `convert` is chosen.
 */
export function editedGoal(
  original: Goal,
  d: GoalDraft,
  ctx: DraftContext,
): { data: Journal["data"]; date: string } | { error: string } | undefined {
  const type = typeOf(original);
  if (!type) return { error: "This goal's type can't be edited here" };
  const start = draftOf(original, ctx.units);
  const changes: Journal["data"] = {};
  const removed: string[] = [];
  const v2 = isV2(original) || d.convert;
  if (d.name.trim() !== start.name.trim()) {
    const name = (
      d.name.trim() || defaultName({ ...d, type }, ctx.units)
    ).slice(0, NAME_MAX);
    if (!name) return { error: "Enter a name" };
    changes.name = name;
  }
  if (d.target.trim() !== start.target.trim()) {
    const t = readTarget(type, d.target, ctx.units);
    if ("error" in t) return t;
    if (t.value !== num(original.data.target)) changes.target = t.value;
  }
  if (type === "bodyweight" && d.start.trim() !== start.start.trim()) {
    if (!d.start.trim()) return { error: "Enter your starting weight" };
    const read = readValue(d.start, "mass", ctx.units);
    if ("error" in read) return read;
    if (read.value !== num(original.data.start)) changes.start = read.value;
  }
  if (type === "bodyweight") {
    const tgt = num(changes.target ?? original.data.target);
    const st = num(changes.start ?? original.data.start);
    if (tgt !== undefined && st !== undefined && Math.abs(tgt - st) < 1e-6)
      return {
        error:
          "Your target is your starting weight. Choose a different target.",
      };
  }
  if (type === "strength" && d.exerciseId !== start.exerciseId) {
    if (!d.exerciseId) return { error: "Choose an exercise" };
    changes.exerciseId = d.exerciseId;
  }
  if (type === "strength" && isV2(original) && d.reps !== start.reps) {
    if (d.reps > 1) changes.reps = Math.min(d.reps, REPS_MAX);
    else removed.push("reps");
  }
  if (needsDirection(type) && d.direction !== start.direction) {
    if (!d.direction) return { error: "Choose at least or at most" };
    if (v2) changes.direction = d.direction;
  }
  if (d.convert && !isV2(original)) {
    if (needsDirection(type) && !d.direction)
      return { error: "Choose at least or at most" };
    changes.goalRules = 2;
    if (needsDirection(type)) changes.direction = d.direction!;
  }
  if (d.targetDate !== start.targetDate) {
    if (d.targetDate) changes.targetDate = d.targetDate;
    else removed.push("targetDate");
  }
  const notes = d.notes.trim();
  if (notes !== String(original.data.notes ?? "").trim()) {
    if (notes) changes.notes = notes;
    else if ("notes" in original.data) changes.notes = "";
  }
  const dateChanged = d.date !== original.date;
  if (!Object.keys(changes).length && !removed.length && !dateChanged)
    return undefined;
  const data = { ...original.data, ...changes };
  for (const k of removed) delete data[k];
  validateJournal("goal", data);
  return { data, date: d.date };
}

/** Whether the sheet holds anything that would be lost by closing it. */
export function draftChanged(d: GoalDraft, ctx: DraftContext, original?: Goal) {
  if (original) {
    const e = editedGoal(original, d, ctx);
    return e !== undefined;
  }
  return (
    !!d.type &&
    (!!d.target.trim() ||
      !!d.name.trim() ||
      !!d.start.trim() ||
      !!d.exerciseId ||
      !!d.notes.trim() ||
      !!d.targetDate ||
      !!d.direction)
  );
}
