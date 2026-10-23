import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryPrograms, programLock } from "../src/programs";
import {
  programFingerprint,
  programKey,
  type CuratedProgram,
} from "../src/domain/programs/model";
import { recommendProgram } from "../src/domain/programs/recommend";
import {
  familyFacts,
  phaseSummary,
  phaseTimeline,
  preferredVariant,
  prescriptionLine,
  programFamilies,
  programTitle,
  programWorkouts,
} from "../src/domain/programs/presentation";
import { defaults } from "../src/domain/types";

const published = libraryPrograms();
const byId = (id: string) => published.find((p) => p.id === id)!;
const clone = (p: CuratedProgram) =>
  JSON.parse(JSON.stringify(p)) as CuratedProgram;

test("the 18 published programs form six families of three distinct programs", () => {
  assert.equal(published.length, 18);
  const families = programFamilies(published);
  assert.deepEqual(
    families.map((f) => f.name),
    [
      "Beginner Strength",
      "Intermediate Strength",
      "Advanced Strength",
      "Beginner Muscle Building",
      "Intermediate Muscle Building",
      "Advanced Muscle Building",
    ],
  );
  const keys = new Set<string>();
  for (const f of families) {
    assert.deepEqual(
      f.programs.map((p) => p.daysPerWeek),
      [3, 4, 5],
    );
    for (const p of f.programs) {
      assert.equal(p.experience, f.experience);
      assert.equal(p.goal, f.goal);
      keys.add(programKey(p));
    }
  }
  // Every program appears once; nothing is merged or synthesized.
  assert.equal(keys.size, 18);
  assert.deepEqual([...keys].sort(), published.map(programKey).sort());
  assert.equal(familyFacts(families[1]!), "3, 4 or 5 days · 8 weeks");
  assert.equal(familyFacts(families[3]!), "3, 4 or 5 days · Ongoing");
});

test("presentation never changes a program: fingerprints still match the publication lock", () => {
  for (const p of published) {
    const before = programFingerprint(p);
    programWorkouts(p);
    phaseTimeline(p);
    programFamilies(published);
    assert.equal(programFingerprint(p), before);
    assert.equal(programLock[programKey(p)], before, programKey(p));
  }
});

test("each recommendation and family choice is the exact authored program for the lifter's level, goal and days", () => {
  for (const f of programFamilies(published))
    for (const days of [3, 4, 5]) {
      const rec = recommendProgram(
        {
          ...defaults,
          experience: f.experience,
          goal: f.goal,
          frequency: days,
        },
        published,
      );
      assert.ok(rec.kind === "match");
      assert.equal(rec.program.experience, f.experience);
      assert.equal(rec.program.goal, f.goal);
      assert.equal(rec.program.daysPerWeek, days);
      assert.equal(preferredVariant(f, days), rec.program);
    }
  const f = programFamilies(published)[0]!;
  assert.equal(preferredVariant(f, 2).daysPerWeek, 3);
  assert.equal(preferredVariant(f, 6).daysPerWeek, 5);
});

test("every published program shows each authored workout once, losing nothing", () => {
  for (const p of published) {
    const { workouts, uniform } = programWorkouts(p);
    assert.ok(uniform, programKey(p));
    assert.equal(workouts.length, p.daysPerWeek, programKey(p));
    // Every phase's every session is shown, field for field.
    p.phases.forEach((phase, i) =>
      phase.sessions.forEach((s) => {
        const shown = workouts.filter(
          (w) => w.phases.includes(i) && w.session.id === s.id,
        );
        assert.equal(shown.length, 1);
        assert.deepEqual(shown[0]!.session, s);
      }),
    );
    assert.equal(
      workouts.reduce((n, w) => n + w.phases.length, 0),
      p.phases.reduce((n, phase) => n + phase.sessions.length, 0),
    );
  }
});

test("any phase-specific change to a workout is listed separately with its phases", () => {
  const base = byId("forge-strength-intermediate-4-day");
  const before = JSON.stringify(base);
  const changes: [string, (s: CuratedProgram) => void][] = [
    ["reps", (p) => (p.phases[2]!.sessions[0]!.exercises[0]!.reps.max = 6)],
    ["sets", (p) => (p.phases[2]!.sessions[0]!.exercises[0]!.sets += 1)],
    [
      "rest",
      (p) => (p.phases[2]!.sessions[0]!.exercises[0]!.restSeconds += 30),
    ],
    [
      "exercise",
      (p) =>
        (p.phases[2]!.sessions[0]!.exercises[0]!.exerciseId = "front-squat"),
    ],
    [
      "note",
      (p) => (p.phases[2]!.sessions[0]!.exercises[0]!.notes = "Belt optional."),
    ],
    [
      "session note",
      (p) => (p.phases[2]!.sessions[0]!.notes = "Heavier week."),
    ],
    [
      "added exercise",
      (p) =>
        p.phases[2]!.sessions[0]!.exercises.push({
          ...p.phases[2]!.sessions[0]!.exercises[0]!,
        }),
    ],
    ["order", (p) => p.phases[2]!.sessions[0]!.exercises.reverse()],
  ];
  for (const [what, change] of changes) {
    const varied = clone(base);
    change(varied);
    const { workouts, uniform } = programWorkouts(varied);
    assert.equal(uniform, false, what);
    assert.equal(workouts.length, 5, what);
    const first = workouts.filter(
      (w) => w.session.id === varied.phases[0]!.sessions[0]!.id,
    );
    assert.deepEqual(
      first.map((w) => w.phases),
      [[0, 1, 3], [2]],
      what,
    );
    assert.deepEqual(first[1]!.session, varied.phases[2]!.sessions[0], what);
  }
  assert.equal(JSON.stringify(base), before);
});

test("the phase timeline shows weeks, effort and planned volume reductions", () => {
  const strength = byId("forge-strength-intermediate-4-day");
  const steps = phaseTimeline(strength);
  assert.deepEqual(
    steps.map((s) => [s.weeks, s.name]),
    strength.phases.map((p, i) => [
      ["Weeks 1–3", "Week 4", "Weeks 5–7", "Week 8"][i],
      p.name,
    ]),
  );
  assert.deepEqual(steps.map(phaseSummary), [
    "RIR 2–3",
    `RIR 3–4 · about ${Math.round(strength.lowerFatigue!.setReduction * 100)}% fewer working sets`,
    "RIR 1–2",
    "RIR 1–3 · about 30% fewer working sets",
  ]);
  assert.deepEqual(
    steps.map((s) => s.lowerFatigue),
    [false, true, false, false],
  );
  const muscle = phaseTimeline(byId("forge-muscle-intermediate-4-day"));
  assert.equal(muscle.length, 1);
  assert.equal(muscle[0]!.weeks, "Every week");
  assert.equal(muscle[0]!.reduction, undefined);
});

test("prescriptions read as authored", () => {
  const ex = byId("forge-strength-intermediate-4-day").phases[0]!.sessions[0]!
    .exercises[0]!;
  assert.match(prescriptionLine(ex), /^\d+ × \d+–\d+ reps · Primary · rest /);
  assert.equal(
    prescriptionLine({
      exerciseId: "x",
      sets: 4,
      reps: { min: 8, max: 8 },
      restSeconds: 90,
      perSide: true,
    }),
    "4 × 8 reps per side · 90s rest",
  );
  // A planned reduction rounds the authored sets the same way workouts do.
  assert.match(
    prescriptionLine(
      { exerciseId: "x", sets: 4, reps: { min: 5, max: 5 }, restSeconds: 60 },
      0.3,
    ),
    /^3 × 5 reps/,
  );
});

test("program titles keep the day count together and are otherwise unchanged", () => {
  assert.equal(
    programTitle("Intermediate Strength · 4 Days"),
    "Intermediate Strength · 4\u00a0Days",
  );
  assert.equal(programTitle("Test Strength Program"), "Test Strength Program");
  for (const p of published)
    assert.equal(programTitle(p.name).replace("\u00a0", " "), p.name);
});
