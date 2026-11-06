import { test } from "node:test";
import assert from "node:assert/strict";
import {
  targetSummary,
  inlineAdvice,
  plannedSets,
  previousBySet,
  previousText,
  timer,
  workoutTitle,
  keepSegmentsTogether,
  firstSentence,
  adviceSummary,
} from "../src/domain/workout-display";
import { setGridLayout } from "../src/components/set-grid-layout";
import type { WorkoutSet } from "../src/domain/types";

// Workout logger presentation (Design System 2.0, Phase 2). These helpers
// only format and select existing data.

const set = (patch: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: "s",
  exerciseRowId: "row",
  position: 0,
  weight: 60,
  reps: 8,
  duration: 0,
  distance: 0,
  rpe: null,
  rir: null,
  kind: "working",
  completed: false,
  rest: 90,
  tempo: "",
  notes: "",
  side: "both",
  ...patch,
});

test("the target summary is one line with sets, reps, RIR and rest", () => {
  assert.equal(
    targetSummary({
      target: { sets: 4, min: 6, max: 8 },
      item: { perSide: true, rest: { min: 180, max: 300 } },
      rir: { min: 2, max: 3 },
      rest: 180,
      workingSets: 4,
    }),
    "4 × 6-8 reps per side · 2–3 RIR · rest 3–5 min",
  );
  assert.equal(
    targetSummary({
      target: { sets: 3, min: 10, max: 10 },
      rest: 120,
      workingSets: 3,
    }),
    "3 × 10 reps · 120s rest",
  );
  assert.equal(
    targetSummary({ target: undefined, rest: 90, workingSets: 1 }),
    "1 working set · 90s rest",
  );
});

test("inline advice appears only when it changes or explains this session", () => {
  const planned = [60, 60];
  // A load suggestion shows only when it differs from the planned sets.
  assert.deepEqual(
    inlineAdvice(
      { action: "increase", weight: 62.5, rir: undefined },
      planned,
      "kg",
    ),
    { headline: "Increase to 62.5 kg", apply: 62.5, kind: "up" },
  );
  assert.equal(
    inlineAdvice({ action: "increase", weight: 60 }, planned, "kg"),
    undefined,
  );
  assert.equal(
    inlineAdvice({ action: "hold", weight: 60 }, planned, "kg"),
    undefined,
  );
  // "Stay at" never shows a rising icon, even when sets are planned lower.
  assert.deepEqual(inlineAdvice({ action: "hold", weight: 60 }, [0], "kg"), {
    headline: "Stay at 60 kg",
    apply: 60,
    kind: "hold",
  });
  assert.deepEqual(
    inlineAdvice({ action: "reduce", weight: 54 }, planned, "lb"),
    {
      headline: "Consider 119.05 lb",
      apply: 54,
      kind: "down",
    },
  );
  // Session context is always shown; a load is offered only if it differs.
  assert.deepEqual(
    inlineAdvice({ action: "lower-fatigue", weight: 60 }, planned, "kg"),
    {
      headline: "Lower-fatigue session · no increase",
      apply: undefined,
      kind: "lower-fatigue",
    },
  );
  assert.deepEqual(
    inlineAdvice({ action: "assess", weight: 65 }, planned, "kg"),
    { headline: "Performance check · no increase", apply: 65, kind: "assess" },
  );
  assert.deepEqual(
    inlineAdvice(
      { action: "establish", weight: null, rir: { min: 2, max: 3 } },
      [0],
      "kg",
    ),
    { headline: "Choose a starting load at 2–3 RIR", kind: "establish" },
  );
  assert.deepEqual(
    inlineAdvice({ action: "review", weight: null }, planned, "kg"),
    { headline: "Choose this session's load", kind: "review" },
  );
  // Assisted movements never get a load suggestion.
  assert.equal(
    inlineAdvice({ action: "manual", weight: null }, planned, "kg"),
    undefined,
  );
  // Generic suggestions: only a real, different load; the icon follows it.
  assert.deepEqual(inlineAdvice({ weight: 52.5 }, [50], "kg"), {
    headline: "Suggested 52.5 kg",
    apply: 52.5,
    kind: "up",
  });
  assert.equal(inlineAdvice({ weight: 45 }, [50], "kg")?.kind, "down");
  assert.equal(inlineAdvice({ weight: 0 }, [50], "kg"), undefined);
  assert.equal(inlineAdvice({ weight: null }, [50], "kg"), undefined);
  // Nothing left to change: no advice at all.
  assert.equal(
    inlineAdvice({ action: "lower-fatigue", weight: 60 }, [], "kg"),
    undefined,
  );
});

test("timers, header titles and summaries read cleanly", () => {
  assert.deepEqual([0, 59, 92, 1440, 3600, 3840, 8046].map(timer), [
    "0:00",
    "0:59",
    "1:32",
    "24:00",
    "1:00:00",
    "1:04:00",
    "2:14:06",
  ]);
  assert.equal(
    workoutTitle("Intermediate Strength · 4 Days · Lower A (Squat Strength)"),
    "Lower A (Squat Strength)",
  );
  assert.equal(workoutTitle("Freestyle"), "Freestyle");
  // Each " · " segment wraps as a unit ("rest 3–5 min" never splits).
  const kept = keepSegmentsTogether("4 × 3-5 reps · 2–3 RIR · rest 3–5 min");
  const nb = "\u00a0";
  const wj = "\u2060";
  assert.deepEqual(kept.split(" · "), [
    `4${nb}×${nb}3${wj}-${wj}5${nb}reps`,
    `2${wj}–${wj}3${nb}RIR`,
    `rest${nb}3${wj}–${wj}5${nb}min`,
  ]);
  // Visible text is unchanged apart from the invisible joiners.
  assert.equal(
    kept.replace(/\u2060/g, "").replace(/\u00a0/g, " "),
    "4 × 3-5 reps · 2–3 RIR · rest 3–5 min",
  );
});

test("planned sets are the unfinished sets a suggestion would change", () => {
  const sets = [
    set({ id: "w", kind: "warmup" }),
    set({ id: "a", completed: true }),
    set({ id: "b" }),
  ];
  assert.deepEqual(
    plannedSets(sets, true).map((s) => s.id),
    ["b"],
  );
  assert.deepEqual(
    plannedSets(sets, false).map((s) => s.id),
    ["w", "b"],
  );
});

test("previous results pair sets of the same type in order", () => {
  const current = [
    set({ id: "w1", kind: "warmup" }),
    set({ id: "1" }),
    set({ id: "2" }),
    set({ id: "3" }),
  ];
  const previous = [
    set({ id: "pw", kind: "warmup", weight: 20, completed: true }),
    set({ id: "p1", weight: 60, reps: 8, completed: true }),
    set({ id: "px", weight: 99, completed: false }),
    set({ id: "p2", weight: 60, reps: 7, completed: true }),
  ];
  assert.deepEqual(
    previousBySet(current, previous).map((s) => s?.id),
    ["pw", "p1", "p2", undefined],
  );
  assert.deepEqual(previousBySet(current, undefined), [
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  assert.deepEqual(previousText(previous[1], "strength", "kg"), {
    text: "60×8",
    spoken: "Previous 60 kg × 8",
  });
  assert.equal(previousText(previous[1], "strength", "lb").text, "132.3×8");
  assert.equal(
    previousText(set({ weight: 0, reps: 12 }), "strength", "kg").text,
    "12 reps",
  );
  assert.equal(
    previousText(set({ duration: 45 }), "duration", "kg").text,
    "45s",
  );
  assert.equal(
    previousText(set({ distance: 400 }), "distance", "kg").text,
    "400 m",
  );
  assert.deepEqual(previousText(undefined, "strength", "kg"), {
    text: "—",
    spoken: "No previous set",
  });
});

test("the set grid adapts to the iPhone width and text size instead of clipping", () => {
  // Grid width = screen − 2 × 20 pt margin − 2 × 12 pt card padding.
  const grid = (screen: number) => screen - 64;
  const program = { secondary: true, rir: true };
  const freestyle = { secondary: true, rir: false };
  // Six columns fit on every iPhone from the SE (375 pt) up at the default
  // text size (verified visually on Android at 375, 393 and 430 dp).
  assert.equal(setGridLayout(grid(430), 1, program).mode, "wide");
  assert.equal(setGridLayout(grid(393), 1, program).mode, "wide");
  assert.equal(setGridLayout(grid(375), 1, program).mode, "wide");
  // The first-generation SE (320 pt) moves the previous result under the row.
  assert.equal(setGridLayout(grid(320), 1, program).mode, "compact");
  assert.equal(setGridLayout(grid(320), 1, freestyle).mode, "compact");
  // Larger accessibility text widens the inputs, then stacks the row.
  assert.equal(setGridLayout(grid(393), 1.2, program).mode, "compact");
  assert.equal(setGridLayout(grid(375), 1.3, program).mode, "compact");
  // Even at the input cap, the SE keeps one row per set.
  assert.equal(setGridLayout(grid(375), 1.4, program).mode, "compact");
  assert.equal(setGridLayout(grid(320), 1.2, program).mode, "stacked");
  // Inputs stop growing at the cap, so the largest phone stays compact.
  assert.equal(setGridLayout(grid(430), 3, program).mode, "compact");
  // Minimum widths scale with text size up to the input cap, never below 1×.
  const large = setGridLayout(grid(430), 3, program).min;
  const small = setGridLayout(grid(430), 0.8, program).min;
  assert.deepEqual(small, { prev: 56, primary: 64, secondary: 48, rir: 44 });
  assert.deepEqual(large, { prev: 78, primary: 90, secondary: 67, rir: 62 });
});

test("the Progression sheet leads with the action, load and first sentence", () => {
  assert.equal(
    firstSentence("Keep the load. Build reps. Log effort."),
    "Keep the load.",
  );
  assert.equal(firstSentence("No period here"), "No period here");
  // Decimal points are not sentence ends.
  assert.equal(
    firstSentence("Use 102.5 kg today. Then rest."),
    "Use 102.5 kg today.",
  );
  assert.deepEqual(
    adviceSummary(
      {
        action: "increase",
        weight: 102.5,
        reason: "Every set reached 6 reps. Add one increment.",
      },
      "kg",
    ),
    {
      headline: "Increase the load",
      load: "102.5 kg",
      detail: "Every set reached 6 reps.",
      more: true,
    },
  );
  assert.deepEqual(
    adviceSummary(
      {
        action: "establish",
        weight: null,
        reason: "Choose a load you can lift.",
      },
      "lb",
    ),
    {
      headline: "Choose a starting load",
      load: undefined,
      detail: "Choose a load you can lift.",
      more: false,
    },
  );
  assert.equal(
    adviceSummary({ action: "hold", weight: null, reason: "x." }, "kg")!
      .headline,
    "Keep the same load",
  );
  assert.equal(
    adviceSummary({ action: "manual", weight: null, reason: "x." }, "kg")!
      .headline,
    "Set the load yourself",
  );
  assert.equal(
    adviceSummary({ weight: 52.5, reason: "x." }, "lb")!.load,
    "115.74 lb",
  );
  assert.equal(
    adviceSummary({ weight: null, reason: "x." }, "kg")!.headline,
    "No load suggestion yet",
  );
  assert.equal(adviceSummary(undefined, "kg"), undefined);
});
