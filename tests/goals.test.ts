import { test } from "node:test";
import assert from "node:assert/strict";
import {
  achievedData,
  bestLift,
  canAchieve,
  draftOf,
  editedGoal,
  evaluate,
  newGoal,
  readTarget,
  type DraftContext,
  type Goal,
  type GoalDraft,
  type LiftSet,
  type Sources,
} from "../src/domain/goals";
import { goalSources } from "../src/data/goal-sources";
import { validateJournal } from "../src/domain/validation";
import { pathRepository } from "./path-fixture";

// Phase 7B WP4D: goals measured only from recorded data, with the exact
// definitions approved in the WP4D audit (section 16A). Legacy goals keep
// their meaning; confirmed achievements never change.

const today = "2026-10-24"; // a Saturday
const at = (date: string, hour = 12) =>
  new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime();
let n = 0;
const goal = (
  date: string,
  data: Goal["data"],
  created = at(date, 9),
): Goal => ({
  id: `g-${++n}`,
  date,
  createdAt: created,
  updatedAt: created,
  data,
});
const weigh = (date: string, value: number, name = "Bodyweight", hour = 7) => ({
  id: `m-${++n}`,
  date,
  createdAt: at(date, hour),
  updatedAt: at(date, hour),
  data: { name, value, unit: "kg" },
});
const set = (date: string, weight: number, reps: number): LiftSet => ({
  date,
  time: at(date, 18),
  weight,
  reps,
});
const workout = (date: string, minutes = 60, id = `w-${++n}`) => ({
  id,
  date,
  time: at(date, 18),
  minutes,
});
function sources(p: Partial<Sources> = {}): Sources {
  return {
    today,
    units: "kg",
    measurements: [],
    workouts: [],
    volumeOf: () => 0,
    lifts: () => [],
    exercise: (id) =>
      id === "bench"
        ? { name: "Bench press", load: true }
        : id === "pullup"
          ? { name: "Assisted pull-up", load: false }
          : undefined,
    calories: new Map(),
    ...p,
  };
}
const ctx = (s: Sources): DraftContext => ({
  units: s.units,
  today,
  best: (id, reps) => bestLift(s.lifts(id), reps)?.weight,
});
const draft = (p: Partial<GoalDraft>): GoalDraft => ({
  name: "",
  target: "",
  start: "",
  exerciseId: "",
  reps: 1,
  date: today,
  notes: "",
  convert: false,
  ...p,
});

// ---- Bodyweight -------------------------------------------------------------

test("bodyweight: losing and gaining both measure from the recorded start", () => {
  const s = sources({
    measurements: [
      weigh("2026-10-01", 84),
      weigh("2026-10-20", 82, "Body weight"),
    ],
  });
  const lose = evaluate(
    goal("2026-09-30", {
      name: "Cut",
      metric: "bodyweight",
      start: 84,
      target: 80,
    }),
    s,
  );
  assert.equal(lose.measure, "Bodyweight · lose");
  assert.equal(lose.current, "82 kg · Tue, Oct 20");
  assert.equal(lose.ratio, 0.5);
  assert.equal(lose.state, "2 kg to go");
  assert.equal(lose.reached, false);
  const gain = evaluate(
    goal("2026-09-30", {
      name: "Bulk",
      metric: "bodyweight",
      start: 80,
      target: 86,
    }),
    s,
  );
  assert.equal(gain.measure, "Bodyweight · gain");
  assert.ok(Math.abs(gain.ratio! - 2 / 6) < 1e-9);
  // Moving the wrong way is stated, never shown as negative progress.
  const wrong = evaluate(
    goal("2026-09-30", {
      name: "Gain",
      metric: "bodyweight",
      start: 83,
      target: 86,
    }),
    s,
  );
  assert.equal(wrong.ratio, 0);
  assert.equal(wrong.state, "1 kg below your start");
});

test("bodyweight: no weigh-in means no progress and nothing to achieve", () => {
  const v = evaluate(
    goal(today, { name: "Cut", metric: "bodyweight", start: 84, target: 80 }),
    sources(),
  );
  assert.equal(v.state, "No weigh-in yet. Log one in Measurements.");
  assert.equal(v.ratio, undefined);
  assert.equal(v.reached, false);
  assert.equal(canAchieve(v), false);
});

test("bodyweight in pounds: entered, shown and stored canonically; legacy kg targets read as recorded", () => {
  const s = sources({ units: "lb", measurements: [weigh("2026-10-20", 82)] });
  const made = newGoal(
    draft({ type: "bodyweight", target: "176,5", start: "185" }),
    ctx(s),
  );
  assert.ok(!("error" in made));
  assert.ok(Math.abs(Number(made.data.target) - 80.059) < 0.001);
  assert.ok(Math.abs(Number(made.data.start) - 83.915) < 0.001);
  const v = evaluate(goal(today, made.data), s);
  assert.equal(v.target, "Target 176.5 lb");
  assert.equal(v.current, "180.8 lb · Tue, Oct 20");
  // A legacy pounds-typed target (175 stored as kg) is shown as recorded,
  // converted, with a neutral note; nothing is rewritten.
  const legacy = goal("2026-10-23", {
    name: "Get to 175 lb",
    metric: "bodyweight",
    start: 82,
    target: 175,
  });
  const lv = evaluate(legacy, s);
  assert.equal(lv.target, "Target 385.8 lb");
  assert.match(lv.notes.join(" "), /Edit it if it was entered in pounds/);
  assert.equal(legacy.data.target, 175);
});

// ---- Lift -------------------------------------------------------------------

test("lift best is the heaviest weight lifted at the goal's reps; ties go to the earliest day", () => {
  const sets = [
    set("2026-10-01", 90, 3),
    set("2026-10-05", 90, 5),
    set("2026-10-10", 85, 8),
  ];
  assert.equal(bestLift(sets, 1)!.date, "2026-10-01");
  assert.equal(bestLift(sets, 5)!.date, "2026-10-05");
  assert.equal(bestLift(sets, 6)!.weight, 85);
  assert.equal(bestLift(sets, 9), undefined);
});

test("lift: progress from the best at creation; reps-aware; reached only by a real set", () => {
  const sets = [
    set("2026-10-01", 80, 5),
    set("2026-10-20", 92.5, 5),
    set("2026-10-21", 97.5, 1),
  ];
  const s = sources({ lifts: () => sets });
  const made = newGoal(
    draft({ type: "strength", exerciseId: "bench", target: "100", reps: 5 }),
    ctx(s),
    "Bench press",
  );
  assert.ok(!("error" in made));
  assert.equal(made.data.start, 92.5);
  assert.equal(made.data.reps, 5);
  assert.equal(made.data.name, "Bench press 100 kg × 5");
  const g = goal("2026-10-22", made.data, at("2026-10-22", 9));
  const v = evaluate(g, s);
  assert.equal(v.measure, "Lift · Bench press · 5+ reps");
  assert.equal(v.current, "Best 92.5 kg × 5 · Tue, Oct 20");
  assert.equal(v.ratio, 0);
  assert.equal(v.state, "7.5 kg to go");
  // A later 100 × 5 reaches it; the heavier single never counted.
  const later = sources({ lifts: () => [...sets, set("2026-10-23", 100, 5)] });
  const r = evaluate(g, later);
  assert.equal(r.reached, true);
  assert.equal(r.state, "Target reached");
  assert.deepEqual(r.qualifying, {
    date: "2026-10-23",
    time: at("2026-10-23", 18),
    value: 100,
  });
  assert.equal(r.ratio, 1);
});

test("lift: a target already met before the goal says so and keeps the real date", () => {
  const s = sources({
    lifts: () => [set("2026-09-10", 100, 3), set("2026-10-20", 102.5, 1)],
  });
  const g = goal("2026-10-22", {
    name: "Bench 100",
    metric: "strength",
    target: 100,
    exerciseId: "bench",
    goalRules: 2,
    start: 102.5,
  });
  const v = evaluate(g, s);
  assert.equal(v.historical, true);
  assert.equal(v.state, "Already lifted before this goal was set");
  assert.match(
    v.notes[0]!,
    /first lifted this on Thu, Sep 10, before this goal was set/,
  );
  // Confirming keeps the real qualifying workout date and the tap time.
  const data = achievedData(v, at(today, 15));
  assert.equal(data.achievedOn, "2026-09-10");
  assert.equal(data.achievedValue, 100);
  assert.equal(data.confirmedAt, at(today, 15));
  const done = evaluate({ ...g, data }, s);
  assert.equal(done.state, "Achieved Thu, Sep 10 · 100 kg");
  assert.ok(done.notes.includes("Confirmed Today."));
  assert.ok(
    done.notes.includes(
      "The qualifying record is from before this goal was set.",
    ),
  );
});

test("lift: legacy goals show no bar; unknown and non-load exercises are explained, never 0", () => {
  const s = sources({ lifts: () => [set("2026-10-20", 90, 6)] });
  const legacy = evaluate(
    goal(today, {
      name: "Bench 100",
      metric: "strength",
      target: 100,
      start: 84.2,
      exerciseId: "bench",
    }),
    s,
  );
  assert.equal(legacy.ratio, undefined);
  assert.equal(legacy.current, "Best 90 kg × 6 · Tue, Oct 20");
  const unknown = evaluate(
    goal(today, {
      name: "Squat",
      metric: "strength",
      target: 160,
      exerciseId: "squat",
    }),
    s,
  );
  assert.equal(
    unknown.state,
    "Exercise not found (squat). Edit the goal to choose an exercise.",
  );
  assert.equal(unknown.current, undefined);
  const assisted = evaluate(
    goal(today, {
      name: "Pull",
      metric: "strength",
      target: 20,
      exerciseId: "pullup",
    }),
    s,
  );
  assert.match(assisted.state, /isn't counted as load/);
});

// ---- Training volume ---------------------------------------------------------

test("volume: new goals count from their day; legacy goals keep lifetime meaning", () => {
  const ws = [
    workout("2026-09-01", 60, "a"),
    workout("2026-10-20", 60, "b"),
    workout("2026-10-23", 60, "c"),
  ];
  const vol: Record<string, number> = { a: 20000, b: 3000, c: 4000 };
  const s = sources({ workouts: ws, volumeOf: (id) => vol[id]! });
  const fresh = evaluate(
    goal("2026-10-20", {
      name: "V",
      metric: "volume",
      target: 10000,
      goalRules: 2,
    }),
    s,
  );
  assert.equal(fresh.measure, "Training volume · from Tue, Oct 20");
  assert.equal(fresh.current, "7,000 kg so far");
  assert.equal(fresh.ratio, 0.7);
  assert.equal(fresh.state, "3,000 kg to go");
  const legacy = evaluate(
    goal("2026-10-22", {
      name: "V",
      metric: "volume",
      target: 10000,
      start: 84.2,
    }),
    s,
  );
  assert.equal(legacy.measure, "Lifetime volume");
  assert.equal(legacy.current, "27,000 kg lifetime");
  assert.equal(legacy.reached, true);
  // Its crossing happened before the goal existed, and says so.
  assert.equal(legacy.historical, true);
  assert.equal(legacy.state, "Already passed before this goal was set");
  assert.equal(legacy.qualifying!.date, "2026-09-01");
  // Pounds.
  const lb = evaluate(
    goal("2026-10-20", {
      name: "V",
      metric: "volume",
      target: 10000,
      goalRules: 2,
    }),
    { ...s, units: "lb" },
  );
  assert.equal(lb.current, "15,432 lb so far");
});

test("volume targets are entered in the lifter's units and capped by storage", () => {
  const kg = readTarget("volume", "220462", "lb");
  assert.ok("value" in kg && Math.abs(kg.value - 99999.881) < 0.001);
  assert.deepEqual(readTarget("volume", "100001", "kg"), {
    error: "Volume targets can be up to 100,000 kg",
  });
  assert.deepEqual(readTarget("volume", "0", "kg"), {
    error: "The target must be more than zero",
  });
  assert.deepEqual(readTarget("volume", "1,5", "kg"), { value: 1.5 });
});

// ---- Workouts per week ---------------------------------------------------------

test("workouts per week: Monday to Sunday; recent weeks only after the goal was set", () => {
  const ws = [
    "2026-10-19",
    "2026-10-21",
    "2026-10-13",
    "2026-10-15",
    "2026-10-16",
    "2026-10-07",
    "2026-09-28",
  ].map((d) => workout(d));
  const v = evaluate(
    goal("2026-10-01", { name: "4×", metric: "workouts", target: 3 }),
    sources({ workouts: ws }),
  );
  assert.equal(v.current, "2 of 3 this week");
  assert.equal(v.ratio, 2 / 3);
  assert.equal(v.state, "1 more this week");
  assert.equal(v.habit, true);
  assert.equal(canAchieve(v), false);
  assert.deepEqual(
    v.history!.map((h) => [h.label, h.state, h.detail]),
    [
      // A week counts once it ends on or after the day the goal was set.
      ["Week of Mon, Sep 28", "missed", "1 of 3"],
      ["Week of Mon, Oct 5", "missed", "1 of 3"],
      ["Week of Mon, Oct 12", "met", "3 of 3"],
    ],
  );
});

// ---- Session length -------------------------------------------------------------

test("session length: a direction is required for new goals; legacy goals show values only", () => {
  const ws = [
    workout("2026-10-01", 70),
    workout("2026-10-20", 50),
    workout("2026-10-22", 58),
    workout("2026-08-01", 120),
  ];
  const s = sources({ workouts: ws });
  const atMost = evaluate(
    goal("2026-09-01", {
      name: "Hour",
      metric: "duration",
      target: 60,
      goalRules: 2,
      direction: "atMost",
    }),
    s,
  );
  assert.equal(atMost.current, "Average 59 min · 3 workouts, last 4 weeks");
  assert.equal(atMost.state, "Within target");
  assert.equal(atMost.ratio, undefined);
  const atLeast = evaluate(
    goal("2026-10-15", {
      name: "Long",
      metric: "duration",
      target: 60,
      goalRules: 2,
      direction: "atLeast",
    }),
    s,
  );
  // Only workouts since the goal's day count: 50 and 58 minutes.
  assert.equal(atLeast.current, "Average 54 min · 2 workouts, last 4 weeks");
  assert.equal(atLeast.state, "6 min under target");
  const legacy = evaluate(
    goal("2026-09-01", {
      name: "Hour",
      metric: "duration",
      target: 60,
      start: 0,
    }),
    s,
  );
  assert.equal(legacy.measure, "Average of all workouts");
  assert.equal(legacy.current, "Average 75 min · 4 workouts");
  assert.equal(legacy.state, "Edit this goal to choose at least or at most.");
  assert.equal(legacy.ratio, undefined);
  const none = evaluate(
    goal(today, {
      name: "Hour",
      metric: "duration",
      target: 60,
      goalRules: 2,
      direction: "atMost",
    }),
    sources(),
  );
  assert.equal(none.state, "No workouts in the last 4 weeks");
  assert.deepEqual(newGoal(draft({ type: "duration", target: "60" }), ctx(s)), {
    error: "Choose at least or at most",
  });
});

// ---- Daily calories ---------------------------------------------------------------

test("daily calories: logged intake only; unlogged days are unmeasured, never zero or success", () => {
  const calories = new Map([
    ["2026-10-24", 1800],
    ["2026-10-23", 2600],
    ["2026-10-21", 1500],
  ]);
  const s = sources({ calories });
  const limit = evaluate(
    goal("2026-10-20", {
      name: "Limit",
      metric: "nutrition",
      target: 2000,
      goalRules: 2,
      direction: "atMost",
    }),
    s,
  );
  assert.equal(limit.current, "1,800 kcal logged so far today");
  assert.equal(limit.ratio, undefined);
  assert.equal(limit.state, "200 kcal left today, by what you've logged");
  assert.match(limit.notes[0]!, /Days with nothing logged aren't counted/);
  assert.deepEqual(
    limit.history!.map((h) => [h.label, h.state, h.detail]),
    [
      ["Tue, Oct 20", "none", "Nothing logged"],
      ["Wed, Oct 21", "met", "1,500 kcal logged"],
      ["Thu, Oct 22", "none", "Nothing logged"],
      ["Yesterday", "missed", "2,600 kcal logged"],
    ],
  );
  const minimum = evaluate(
    goal("2026-10-20", {
      name: "Eat",
      metric: "nutrition",
      target: 2500,
      goalRules: 2,
      direction: "atLeast",
    }),
    s,
  );
  assert.equal(minimum.ratio, 0.72);
  assert.equal(minimum.ratioLabel, "Logged so far today");
  assert.equal(minimum.state, "700 kcal to go today");
  assert.equal(canAchieve(minimum), false);
  const empty = evaluate(
    goal("2026-10-20", {
      name: "Limit",
      metric: "nutrition",
      target: 2000,
      goalRules: 2,
      direction: "atMost",
    }),
    sources(),
  );
  assert.equal(empty.state, "Nothing logged today");
  assert.equal(empty.current, undefined);
  const legacy = evaluate(
    goal("2026-10-20", {
      name: "Eat",
      metric: "nutrition",
      target: 2500,
      start: 0,
    }),
    s,
  );
  assert.equal(legacy.measure, "Today's calories");
  assert.equal(legacy.current, "1,800 kcal logged today");
  assert.equal(legacy.ratio, undefined);
});

// ---- Achievements ------------------------------------------------------------------

test("a confirmed achievement keeps its date and value even after records change", () => {
  const before = sources({ measurements: [weigh("2026-10-12", 79.6)] });
  const g = goal("2026-09-01", {
    name: "Cut",
    metric: "bodyweight",
    start: 84,
    target: 80,
  });
  const v = evaluate(g, before);
  assert.equal(canAchieve(v), true);
  const data = achievedData(v, at("2026-10-14", 8));
  assert.deepEqual(
    [
      data.status,
      data.achievedOn,
      data.achievedValue,
      data.confirmedAt,
      data.start,
      data.target,
    ],
    ["achieved", "2026-10-12", 79.6, at("2026-10-14", 8), 84, 80],
  );
  validateJournal("goal", data);
  const done = { ...g, data };
  // A newer, heavier weigh-in doesn't change it or flag it.
  const newer = evaluate(
    done,
    sources({
      measurements: [weigh("2026-10-12", 79.6), weigh("2026-10-20", 81.2)],
    }),
  );
  assert.equal(newer.state, "Achieved Mon, Oct 12 · 79.6 kg");
  assert.equal(
    newer.notes.some((x) => x.includes("records have changed")),
    false,
  );
  assert.equal(newer.ratio, undefined);
  assert.equal(canAchieve(newer), false);
  // Deleting the qualifying weigh-in keeps the snapshot and says so.
  const gone = evaluate(
    done,
    sources({ measurements: [weigh("2026-10-20", 81.2)] }),
  );
  assert.equal(gone.state, "Achieved Mon, Oct 12 · 79.6 kg");
  assert.ok(
    gone.notes.includes("Your records have changed since this was achieved."),
  );
  // An older app version's edit may have stored the value as text.
  const texted = evaluate(
    { ...done, data: { ...data, achievedValue: "79.6" } },
    before,
  );
  assert.equal(texted.state, "Achieved Mon, Oct 12 · 79.6 kg");
});

test("nothing can be achieved without a qualifying record, and habits never", () => {
  const s = sources({ lifts: () => [set("2026-10-20", 90, 5)] });
  const v = evaluate(
    goal(today, {
      name: "B",
      metric: "strength",
      target: 100,
      exerciseId: "bench",
      goalRules: 2,
      start: 90,
    }),
    s,
  );
  assert.equal(canAchieve(v), false);
  assert.throws(() => achievedData(v, Date.now()));
  const archived = evaluate(
    goal(today, {
      name: "B",
      metric: "strength",
      target: 80,
      exerciseId: "bench",
      status: "archived",
    }),
    s,
  );
  assert.equal(archived.status, "archived");
  assert.equal(canAchieve(archived), false);
});

// ---- Entering and editing ----------------------------------------------------------

test("new goals store only what the lifter chose, with WP4D rules", () => {
  const s = sources({ measurements: [weigh("2026-10-20", 82)] });
  const c = ctx(s);
  assert.deepEqual(newGoal(draft({ type: "workouts", target: "4" }), c), {
    data: {
      name: "Train 4× a week",
      metric: "workouts",
      target: 4,
      goalRules: 2,
    },
    date: today,
  });
  assert.deepEqual(
    newGoal(
      draft({
        type: "nutrition",
        target: "2.000",
        direction: "atMost",
        notes: " cut ",
      }),
      c,
    ),
    {
      data: {
        name: "At most 2 kcal a day",
        metric: "nutrition",
        target: 2,
        goalRules: 2,
        direction: "atMost",
        notes: "cut",
      },
      date: today,
    },
  );
  assert.deepEqual(newGoal(draft({ type: "bodyweight", target: "80" }), c), {
    error: "Enter your starting weight",
  });
  assert.deepEqual(
    newGoal(draft({ type: "bodyweight", target: "80", start: "80" }), c),
    {
      error: "Your target is your starting weight. Choose a different target.",
    },
  );
  assert.deepEqual(newGoal(draft({ type: "strength", target: "100" }), c), {
    error: "Choose an exercise",
  });
  assert.deepEqual(newGoal(draft({ type: "workouts", target: "2.5" }), c), {
    error: "Choose between 1 and 14 workouts a week",
  });
  assert.deepEqual(
    newGoal(draft({ type: "bodyweight", target: "abc", start: "82" }), c),
    { error: "Enter a number, e.g. 81.5" },
  );
  assert.deepEqual(newGoal(draft({}), c), {
    error: "Choose what kind of goal this is",
  });
  const dated = newGoal(
    draft({
      type: "volume",
      target: "5000",
      date: "2026-10-01",
      targetDate: "2026-12-31",
    }),
    c,
  );
  assert.ok(!("error" in dated));
  assert.equal(dated.date, "2026-10-01");
  assert.equal(dated.data.targetDate, "2026-12-31");
  assert.equal("start" in dated.data, false);
});

test("an untouched edit writes nothing, legacy junk and all; conversion is explicit", () => {
  const s = sources({ units: "lb" });
  const c = ctx(s);
  const legacy = goal("2026-09-01", {
    name: "Eat",
    metric: "nutrition",
    target: 2500,
    start: 84.2,
    exerciseId: "",
    notes: "",
  });
  assert.equal(editedGoal(legacy, draftOf(legacy, "lb"), c), undefined);
  const bw = goal("2026-09-01", {
    name: "Cut",
    metric: "bodyweight",
    start: 84.2,
    target: 80,
    flag: true,
  });
  assert.equal(editedGoal(bw, draftOf(bw, "lb"), c), undefined);
  // A direction alone doesn't change a legacy goal's meaning…
  assert.equal(
    editedGoal(legacy, { ...draftOf(legacy, "lb"), direction: "atMost" }, c),
    undefined,
  );
  // …converting does, writing only the new rule keys.
  const converted = editedGoal(
    legacy,
    { ...draftOf(legacy, "lb"), direction: "atMost", convert: true },
    c,
  );
  assert.deepEqual(converted, {
    data: { ...legacy.data, goalRules: 2, direction: "atMost" },
    date: "2026-09-01",
  });
  assert.deepEqual(
    editedGoal(legacy, { ...draftOf(legacy, "lb"), convert: true }, c),
    { error: "Choose at least or at most" },
  );
  // Changing one value changes only that key; types and unknown keys stay.
  const edited = editedGoal(bw, { ...draftOf(bw, "lb"), target: "170" }, c);
  assert.ok(edited && !("error" in edited));
  assert.equal(edited.data.start, 84.2);
  assert.equal(edited.data.flag, true);
  assert.ok(Math.abs(Number(edited.data.target) - 77.1107) < 0.001);
  // Target dates can be added and cleared.
  const withDate = editedGoal(
    bw,
    { ...draftOf(bw, "lb"), targetDate: "2026-12-31" },
    c,
  );
  assert.ok(withDate && !("error" in withDate));
  const cleared = editedGoal(
    { ...bw, data: withDate.data },
    { ...draftOf({ ...bw, data: withDate.data }, "lb"), targetDate: undefined },
    c,
  );
  assert.ok(cleared && !("error" in cleared));
  assert.equal("targetDate" in cleared.data, false);
});

// ---- Repository ----------------------------------------------------------------------

test("lift sources count only completed working sets of finished workouts", () => {
  const { r, db } = pathRepository();
  try {
    const done = r.startWorkout("A");
    const bench = r.addExercise(done.id, "barbell-bench-press");
    r.editSet(r.addSet(bench.id).id, {
      weight: 120,
      reps: 5,
      kind: "warmup",
      completed: true,
    });
    // Older data can hold a completed set with no reps (no longer enterable).
    const zero = r.addSet(bench.id);
    r.editSet(zero.id, { weight: 110, reps: 1, completed: true });
    db.prepare("UPDATE workout_sets SET reps=0 WHERE id=?").run(zero.id);
    r.editSet(r.addSet(bench.id).id, {
      weight: 105,
      reps: 5,
      completed: false,
    });
    r.editSet(r.addSet(bench.id).id, {
      weight: 95,
      reps: 5,
      kind: "drop",
      completed: true,
    });
    r.editSet(r.addSet(bench.id).id, { weight: 90, reps: 3, completed: true });
    const assisted = r.addExercise(done.id, "assisted-pull-up");
    r.editSet(r.addSet(assisted.id).id, {
      weight: 40,
      reps: 8,
      completed: true,
    });
    r.finishWorkout(done.id);
    const open = r.startWorkout("B");
    const row = r.addExercise(open.id, "barbell-bench-press");
    r.editSet(r.addSet(row.id).id, { weight: 150, reps: 1, completed: true });
    const s = goalSources(r, today, "kg");
    assert.deepEqual(
      s.lifts("barbell-bench-press").map((x) => [x.weight, x.reps]),
      [
        [95, 5],
        [90, 3],
      ],
    );
    assert.equal(s.exercise("assisted-pull-up")!.load, false);
    assert.equal(s.exercise("barbell-bench-press")!.load, true);
    assert.equal(bestLift(s.lifts("barbell-bench-press"), 1)!.weight, 95);
  } finally {
    db.close();
  }
});

test("goals with new keys save, back up byte for byte and leave untouched edits unqueued", () => {
  const { r, db } = pathRepository();
  try {
    const made = newGoal(
      draft({
        type: "strength",
        exerciseId: "barbell-bench-press",
        target: "100",
        reps: 5,
        targetDate: "2027-01-01",
      }),
      {
        units: "kg",
        today,
        best: () => 80,
      },
    );
    assert.ok(!("error" in made));
    r.addJournal("goal", made.data, made.date);
    r.addJournal(
      "goal",
      {
        name: "Old",
        metric: "volume",
        target: 50000,
        start: 84.2,
        exerciseId: "",
        notes: "",
      },
      "2026-09-01",
    );
    r.addJournal(
      "goal",
      {
        name: "Done",
        metric: "bodyweight",
        start: 84,
        target: 80,
        status: "achieved",
        achievedOn: "2026-10-12",
        achievedValue: 79.6,
        confirmedAt: 1,
      },
      "2026-09-01",
    );
    db.exec("DELETE FROM outbox");
    for (const g of r.journal("goal"))
      assert.equal(
        editedGoal(g, draftOf(g, "kg"), {
          units: "kg",
          today,
          best: () => undefined,
        }),
        undefined,
      );
    assert.equal(r.outbox().length, 0);
    const before = JSON.stringify(r.journal("goal"));
    const other = pathRepository();
    try {
      other.r.importBackup(JSON.stringify(r.exportBackup()));
      assert.equal(JSON.stringify(other.r.journal("goal")), before);
    } finally {
      other.db.close();
    }
  } finally {
    db.close();
  }
});
