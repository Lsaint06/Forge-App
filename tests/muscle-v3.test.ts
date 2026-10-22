import { test } from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { defaults, type WorkoutSet } from "../src/domain/types";
import {
  programFingerprint,
  publishedPrograms,
  validateProgram,
  type CuratedProgram,
} from "../src/domain/programs/model";
import { recommendProgram } from "../src/domain/programs/recommend";
import { trainingWeekdays } from "../src/domain/programs/schedule";
import { sessionAt, totalSessions } from "../src/domain/programs/enrollment";
import {
  programProgression,
  reducedSets,
  type ProgramSessionEvidence,
} from "../src/domain/programs/progression";
import {
  currentEnrollment,
  enrollProgram,
  programExerciseAdvice,
  programProgress,
  programWorkoutContext,
  startProgramSession,
} from "../src/data/programs";
import { acceptPath, currentPath, pathPrograms } from "../src/data/paths";
import { generatePath } from "../src/domain/paths/generator";
import { libraryPrograms, programLibrary } from "../src/programs";
import { pathPreferences, pathRepository } from "./path-fixture";
import {
  approvedLowerFatigue,
  approvedMapping,
  approvedModel,
  approvedPatterns,
  approvedRir,
  parseMuscleTables,
  restFor,
  roleFor,
} from "./muscle-v3-source";

const authored = parseMuscleTables();
const levels = ["Beginner", "Intermediate", "Advanced"] as const;
const muscle = programLibrary.filter((p) => p.id.startsWith("forge-muscle-"));
const strength = programLibrary.filter((p) =>
  p.id.startsWith("forge-strength-"),
);
const byCode = (code: string) => {
  const a = authored.find((p) => p.code === code)!;
  return muscle.find(
    (p) => p.experience === a.experience && p.daysPerWeek === a.days,
  )!;
};
const published = (p: CuratedProgram): CuratedProgram => ({
  ...p,
  status: "published",
});

test("the authored tables parse into nine programs with the approved splits", () => {
  assert.deepEqual(
    authored.map((p) => p.code),
    ["B-M3", "B-M4", "B-M5", "I-M3", "I-M4", "I-M5", "A-M3", "A-M4", "A-M5"],
  );
  assert.deepEqual(
    authored.map((p) => p.split),
    [
      "Full Body / Upper Body / Lower Body",
      "Upper A / Lower A / Upper B / Lower B",
      "Upper / Lower / Pull / Push / Lower",
      "Full Body A / Full Body B / Full Body C",
      "Upper A / Lower A / Upper B / Lower B",
      "Push / Pull / Legs / Upper / Lower",
      "Full Body A / Full Body B / Full Body C",
      "Upper A / Lower A / Upper B / Lower B",
      "Upper / Lower / Push / Pull / Legs",
    ],
  );
  for (const p of authored) assert.equal(p.sessions.length, p.days);
  const names = new Set(
    authored.flatMap((p) =>
      p.sessions.flatMap((s) => s.rows.map((r) => r.name)),
    ),
  );
  assert.equal(names.size, 44);
  for (const name of names)
    assert.ok(approvedMapping[name], `${name} is unmapped`);
});

test("all nine Muscle Building programs are bundled, valid, open-ended drafts", () => {
  assert.equal(muscle.length, 9);
  for (const level of levels)
    for (const days of [3, 4, 5] as const) {
      const matches = muscle.filter(
        (p) => p.experience === level && p.daysPerWeek === days,
      );
      assert.equal(matches.length, 1, `${level} ${days}-day`);
      const p = matches[0]!;
      assert.equal(p.goal, "Muscle Building");
      assert.equal(p.status, "draft");
      assert.equal(p.durationWeeks, undefined);
      assert.equal(p.phases.length, 1);
      assert.equal(p.phases[0]!.weeks, undefined);
      assert.equal(p.phases[0]!.block, "standard");
      // No scheduled deloads or set reductions.
      assert.equal(p.phases[0]!.setReduction, undefined);
      assert.equal(totalSessions(p), undefined);
      assert.deepEqual(p.weeklyPattern, approvedPatterns[days]);
      assert.equal(p.progressionModel, approvedModel[level]);
      assert.deepEqual(p.lowerFatigue, approvedLowerFatigue);
      const rir = approvedRir[level];
      assert.deepEqual(p.phases[0]!.rir, {
        primary: rir,
        secondary: rir,
        accessory: rir,
      });
    }
});

test("every program matches its authored prescription exactly", () => {
  for (const a of authored) {
    const program = byCode(a.code);
    const sessions = program.phases[0]!.sessions;
    assert.equal(sessions.length, a.sessions.length);
    sessions.forEach((session, i) => {
      const source = a.sessions[i]!;
      assert.equal(session.id, `day-${source.day}`);
      assert.equal(session.name, source.name);
      assert.deepEqual(
        session.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          perSide: !!e.perSide,
          notes: e.notes,
          loading: e.loading,
        })),
        source.rows.map((row) => ({
          exerciseId: approvedMapping[row.name]!.id,
          sets: row.sets,
          reps: row.reps,
          perSide: row.perSide,
          notes: approvedMapping[row.name]!.notes,
          loading: undefined,
        })),
        `${a.code} ${session.name}`,
      );
    });
  }
});

test("every exercise resolves to a rep-based catalog entry with the approved variation", () => {
  const catalog = new Map(exercises.map((e) => [e.id, e]));
  for (const program of muscle) {
    assert.deepEqual(
      validateProgram(structuredClone(program), exercises),
      program,
    );
    for (const session of program.phases[0]!.sessions)
      for (const item of session.exercises)
        assert.equal(catalog.get(item.exerciseId)?.category, "strength");
  }
  const expected: Record<string, [string, string]> = {
    "Preacher Curl": ["machine-preacher-curl", "Machine"],
    "Cable Fly": ["standing-cable-fly", "Cable"],
    "Supported Bulgarian Split Squat": ["bulgarian-split-squat", "Dumbbell"],
    "Smith Machine Romanian Deadlift": [
      "smith-machine-romanian-deadlift",
      "Smith machine",
    ],
    "Hip Thrust Machine": ["machine-hip-thrust", "Machine"],
    "Incline Smith Machine Press": [
      "smith-machine-incline-press",
      "Smith machine",
    ],
    "Flat Dumbbell Bench Press": ["dumbbell-bench-press", "Dumbbell"],
    "Flat Machine Chest Press": ["machine-chest-press", "Machine"],
    "Single-Arm Cable Pushdown": ["single-arm-pushdown", "Cable"],
    "Single-Arm Cable Lat Pulldown": ["single-arm-lat-pulldown", "Cable"],
  };
  for (const [name, [id, equipment]] of Object.entries(expected)) {
    assert.equal(approvedMapping[name]!.id, id, name);
    assert.equal(catalog.get(id)!.equipment, equipment, name);
  }
  const smithRdl = catalog.get("smith-machine-romanian-deadlift")!;
  assert.deepEqual(
    [smithRdl.pattern, smithRdl.muscle, smithRdl.unilateral],
    ["hinge", "Hamstrings", false],
  );
});

test("the new catalog entry reaches existing local databases on startup", () => {
  const { r, db } = pathRepository();
  try {
    assert.ok(r.exercise("smith-machine-romanian-deadlift"));
    // Simulate a database created before the entry existed.
    db.exec("DELETE FROM exercises WHERE id='smith-machine-romanian-deadlift'");
    assert.equal(r.exercise("smith-machine-romanian-deadlift"), undefined);
    r.migrate();
    assert.equal(
      r.exercise("smith-machine-romanian-deadlift")?.name,
      "Smith Machine Romanian Deadlift",
    );
  } finally {
    db.close();
  }
});

test("unilateral prescriptions are per side and match unilateral catalog movements", () => {
  const catalog = new Map(exercises.map((e) => [e.id, e]));
  let perSide = 0;
  for (const program of muscle)
    for (const session of program.phases[0]!.sessions)
      for (const item of session.exercises) {
        if (!item.perSide) continue;
        perSide++;
        assert.ok(
          catalog.get(item.exerciseId)!.unilateral ||
            ["dead-bug", "pallof-press"].includes(item.exerciseId),
          item.exerciseId,
        );
      }
  assert.ok(perSide > 0);
  const bulgarian = byCode("I-M4").phases[0]!.sessions[3]!.exercises[1]!;
  assert.deepEqual(
    [bulgarian.exerciseId, bulgarian.perSide, bulgarian.sets, bulgarian.reps],
    ["bulgarian-split-squat", true, 3, { min: 8, max: 10 }],
  );
  assert.match(bulgarian.notes!, /support/);
});

test("roles, rest guidance and session sizes follow the approved rules", () => {
  for (const program of muscle) {
    const counts: number[] = [];
    for (const session of program.phases[0]!.sessions) {
      counts.push(session.exercises.length);
      for (const item of session.exercises) {
        assert.equal(item.role, roleFor(item.exerciseId), item.exerciseId);
        assert.notEqual(item.role, "primary");
        assert.deepEqual(
          item.rest,
          restFor(roleFor(item.exerciseId), program.experience),
        );
        assert.equal(item.restSeconds, item.rest!.min);
      }
      assert.ok(session.exercises.some((e) => e.role === "secondary"));
      const ids = session.exercises.map((e) => e.exerciseId);
      assert.equal(new Set(ids).size, ids.length);
    }
    assert.ok(Math.max(...counts) < 2 * Math.min(...counts), program.id);
  }
  assert.deepEqual(restFor("secondary", "Advanced"), { min: 120, max: 240 });
  assert.deepEqual(restFor("secondary", "Beginner"), { min: 120, max: 180 });
  assert.deepEqual(restFor("accessory", "Advanced"), { min: 60, max: 120 });
});

test("matching selects the right goal, level and frequency across all 18 programs", () => {
  const library = [...strength, ...muscle].map(published);
  assert.equal(publishedPrograms(library).length, 18);
  for (const goal of ["Strength", "Muscle Building"] as const)
    for (const level of levels)
      for (const frequency of [3, 4, 5]) {
        const rec = recommendProgram(
          { ...defaults, experience: level, goal, frequency },
          library,
        );
        assert.equal(rec.kind, "match");
        if (rec.kind !== "match") continue;
        assert.deepEqual(
          [rec.program.goal, rec.program.experience, rec.program.daysPerWeek],
          [goal, level, frequency],
        );
        assert.ok(rec.alternatives.every((p) => p.goal === goal));
      }
  // The older "Build muscle" goal reads as Muscle Building.
  const legacy = recommendProgram(
    { ...defaults, experience: "Beginner", goal: "Build muscle", frequency: 4 },
    library,
  );
  assert.equal(
    legacy.kind === "match" && legacy.program.id,
    "forge-muscle-beginner-4-day",
  );
});

test("drafts stay out of production listings and recommendations", () => {
  assert.equal(
    libraryPrograms().filter((p) => p.goal === "Muscle Building").length,
    0,
  );
  assert.equal(
    recommendProgram(
      { ...defaults, experience: "Advanced", goal: "Muscle Building" },
      programLibrary,
    ).kind,
    "none",
  );
  const { r, db } = pathRepository();
  try {
    assert.throws(
      () => enrollProgram(r, byCode("B-M3"), "2026-10-19"),
      /published/,
    );
  } finally {
    db.close();
  }
});

test("every program keeps the preferred rest day free and never trains a muscle directly on back-to-back days", () => {
  for (const program of muscle) {
    for (let restDay = 0; restDay < 7; restDay++) {
      const days = trainingWeekdays(program.weeklyPattern, restDay);
      assert.equal(days.length, program.daysPerWeek);
      assert.ok(!days.includes(restDay), `${program.id} rest day ${restDay}`);
    }
    // Consecutive training days in the authored pattern, including the
    // wrap from the last to the first session of the next week.
    const train = program.weeklyPattern.flatMap((d, i) =>
      d === "train" ? [i] : [],
    );
    const sessions = program.phases[0]!.sessions;
    // The catalog groups all delt heads as "Shoulders"; distinguish them.
    const head: Record<string, string> = {
      "reverse-pec-deck": "Rear delts",
      "cable-lateral-raise": "Side delts",
      "dumbbell-lateral-raise": "Side delts",
      "machine-shoulder-press": "Front delts",
    };
    const muscles = (i: number) =>
      new Set(
        sessions[i]!.exercises.map((e) =>
          exercises.find((x) => x.id === e.exerciseId)!,
        )
          .filter((x) => !["Core", "Abs", "Abdominals"].includes(x.muscle))
          .map((x) => head[x.id] ?? x.muscle),
      );
    train.forEach((day, k) => {
      const next = (k + 1) % train.length;
      const gap = train[next]! + (next === 0 ? 7 : 0) - day;
      if (gap !== 1) return;
      const shared = [...muscles(k)].filter((m) => muscles(next).has(m));
      assert.deepEqual(shared, [], `${program.id} day ${k + 1} → ${next + 1}`);
    });
  }
});

// ---- Hypertrophy progression ------------------------------------------------

let n = 0;
const set = (
  weight: number,
  reps: number,
  effort: { rir?: number; rpe?: number } = {},
  patch: Partial<WorkoutSet> = {},
): WorkoutSet => ({
  id: `m${n++}`,
  exerciseRowId: "row",
  position: 0,
  weight,
  reps,
  duration: 0,
  distance: 0,
  rpe: effort.rpe ?? null,
  rir: effort.rir ?? null,
  kind: "working",
  completed: true,
  rest: 0,
  tempo: "",
  notes: "",
  side: "both",
  ...patch,
});
const evidence = (sets: WorkoutSet[], week = 1): ProgramSessionEvidence => ({
  week,
  block: "standard",
  lowerFatigue: false,
  sets,
});
const advise = (
  program: CuratedProgram,
  item: CuratedProgram["phases"][number]["sessions"][number]["exercises"][number],
  history: ProgramSessionEvidence[],
  lowerFatigue = false,
) =>
  programProgression({
    program,
    phase: program.phases[0]!,
    item,
    history,
    increment: 2.5,
    lowerFatigue,
  });

const bM4 = byCode("B-M4");
const iM5 = byCode("I-M5");
const aM5 = byCode("A-M5");

test("beginner double progression on a compound and an isolation exercise", () => {
  // B-M4 Upper A: Flat Dumbbell Bench Press 2 × 8–10; Dumbbell Lateral Raise 2 × 10–15.
  const bench = bM4.phases[0]!.sessions[0]!.exercises[0]!;
  const raise = bM4.phases[0]!.sessions[0]!.exercises[3]!;
  assert.deepEqual(
    [bench.exerciseId, bench.sets, bench.role],
    ["dumbbell-bench-press", 2, "secondary"],
  );
  assert.deepEqual(
    [raise.exerciseId, raise.role],
    ["dumbbell-lateral-raise", "accessory"],
  );
  assert.equal(advise(bM4, bench, []).action, "establish");
  const up = advise(bM4, bench, [
    evidence([set(24, 10, { rir: 2 }), set(24, 10, { rir: 3 })]),
  ]);
  assert.deepEqual(
    [up.action, up.weight, up.rir],
    ["increase", 26.5, { min: 2, max: 3 }],
  );
  // Isolation work progresses under the same rule: roles never block it.
  const raiseUp = advise(bM4, raise, [
    evidence([set(8, 15, { rir: 2 }), set(8, 15, { rir: 2 })]),
  ]);
  assert.equal(raiseUp.action, "increase");
  const building = advise(bM4, bench, [
    evidence([set(24, 10, { rir: 2 }), set(24, 9, { rir: 2 })]),
  ]);
  assert.deepEqual([building.action, building.weight], ["hold", 24]);
  // Warm-ups never count as working sets.
  const warm = advise(bM4, bench, [
    evidence([
      set(10, 12, {}, { kind: "warmup" }),
      set(24, 10, { rir: 2 }),
      set(24, 10, { rir: 2 }),
    ]),
  ]);
  assert.equal(warm.action, "increase");
});

test("missing effort data never proves the target was met", () => {
  const bench = bM4.phases[0]!.sessions[0]!.exercises[0]!;
  const a = advise(bM4, bench, [
    evidence([set(24, 10, { rir: 2 }), set(24, 10)]),
  ]);
  assert.deepEqual([a.action, a.weight], ["hold", 24]);
  assert.match(a.reason, /not logged/);
  // Beginner sets harder than 2–3 RIR hold.
  const hard = advise(bM4, bench, [
    evidence([set(24, 10, { rir: 1 }), set(24, 10, { rir: 2 })]),
  ]);
  assert.equal(hard.action, "hold");
});

test("intermediate effort targets allow 1 RIR but not failure, and do not autoregulate", () => {
  // I-M5 Push: Incline Dumbbell Bench Press 3 × 6–10.
  const incline = iM5.phases[0]!.sessions[0]!.exercises[0]!;
  assert.deepEqual([incline.sets, incline.reps], [3, { min: 6, max: 10 }]);
  const rir1 = Array.from({ length: 3 }, () => set(30, 10, { rir: 1 }));
  assert.equal(advise(iM5, incline, [evidence(rir1)]).action, "increase");
  const failure = Array.from({ length: 3 }, () => set(30, 10, { rir: 0 }));
  assert.equal(advise(iM5, incline, [evidence(failure)]).action, "hold");
  const easy = Array.from({ length: 3 }, () => set(30, 8, { rir: 5 }));
  assert.equal(advise(iM5, incline, [evidence(easy)]).action, "hold");
});

test("advanced autoregulation raises clearly easy loads and holds sets taken past the target", () => {
  // A-M5 Pull: Preacher Curl 3 × 8–12.
  const preacher = aM5.phases[0]!.sessions[3]!.exercises[4]!;
  assert.deepEqual(
    [preacher.exerciseId, preacher.role],
    ["machine-preacher-curl", "accessory"],
  );
  const easy = Array.from({ length: 3 }, () => set(30, 10, { rir: 4 }));
  assert.equal(advise(aM5, preacher, [evidence(easy)]).action, "increase");
  const failure = Array.from({ length: 3 }, () => set(30, 12, { rir: 0 }));
  assert.equal(advise(aM5, preacher, [evidence(failure)]).action, "hold");
});

test("one missed exposure holds; persistent misses suggest a conservative reduction", () => {
  const bench = bM4.phases[0]!.sessions[0]!.exercises[0]!;
  const missed = [set(24, 7, { rir: 1 }), set(24, 6, { rir: 0 })];
  const once = advise(bM4, bench, [evidence(missed)]);
  assert.deepEqual([once.action, once.weight], ["hold", 24]);
  const history = [evidence(missed, 2), evidence(structuredClone(missed), 1)];
  const frozen = JSON.stringify(history);
  const twice = advise(bM4, bench, history);
  // About 10%, rounded down to the 2.5 kg increment.
  assert.deepEqual([twice.action, twice.weight], ["reduce", 20]);
  assert.equal(JSON.stringify(history), frozen);
});

test("lower-fatigue sessions are optional and never scheduled", () => {
  const bench = bM4.phases[0]!.sessions[0]!.exercises[0]!;
  const lf = advise(
    bM4,
    bench,
    [evidence([set(24, 10, { rir: 2 }), set(24, 10, { rir: 2 })])],
    true,
  );
  assert.deepEqual(
    [lf.action, lf.weight, lf.sets, lf.rir],
    ["lower-fatigue", 24, 1, { min: 3, max: 4 }],
  );
  assert.deepEqual(
    [2, 3].map((s) => reducedSets(s, approvedLowerFatigue.setReduction)),
    [1, 2],
  );
  for (const program of muscle)
    for (let position = 0; position < program.daysPerWeek * 52; position += 7)
      assert.notEqual(
        sessionAt(program, position)!.phase.block,
        "lower-fatigue",
      );
});

test("open-ended programs repeat their week indefinitely and progress from the same session slot", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ restDay: 6 });
    const program = published(byCode("I-M4"));
    const { id } = enrollProgram(r, program, "2026-10-19");
    const fill = () => ({ weight: 40, reps: 12, rir: 2 });
    // Ten full weeks.
    for (let i = 0; i < 4 * 10; i++) {
      const w = startProgramSession(r, id, [program]);
      for (const row of r.workoutExercises(w.id))
        for (const s of r.sets(row.id))
          r.editSet(s.id, { ...fill(), completed: true });
      r.finishWorkout(w.id);
    }
    const progress = programProgress(r, currentEnrollment(r, [program])!);
    assert.equal(progress.total, undefined);
    assert.equal(progress.complete, false);
    assert.equal(progress.next!.week, 11);
    assert.equal(progress.next!.session.id, "day-1");
    // Standard sessions keep every authored working set.
    const w = startProgramSession(r, id, [program]);
    assert.deepEqual(
      r.workoutExercises(w.id).map((row) => row.target?.sets),
      program.phases[0]!.sessions[0]!.exercises.map((e) => e.sets),
    );
    assert.equal(
      programWorkoutContext(r, w.id, [program])!.log.lowerFatigue,
      undefined,
    );
    // Week 11 day 1 builds on week 10 day 1: lat pulldown 3 × 8–12 at 12 reps, 2 RIR.
    const pulldown = programExerciseAdvice(r, w.id, "lat-pulldown", [program])!;
    assert.deepEqual(
      [pulldown.advice.action, pulldown.advice.weight],
      ["increase", 42.5],
    );
    r.finishWorkout(w.id);
    // The lifter may choose a lower-fatigue session.
    const lf = startProgramSession(r, id, [program], { lowerFatigue: true });
    assert.deepEqual(
      r.workoutExercises(lf.id).map((row) => row.target?.sets),
      program.phases[0]!.sessions[1]!.exercises.map((e) =>
        reducedSets(e.sets, approvedLowerFatigue.setReduction),
      ),
    );
  } finally {
    db.close();
  }
});

test("changing the preferred rest day never rewrites an enrollment or completed workouts", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ restDay: 6 });
    const program = published(byCode("A-M5"));
    const { id } = enrollProgram(r, program, "2026-10-19");
    const w = startProgramSession(r, id, [program]);
    r.finishWorkout(w.id);
    const before = JSON.stringify({
      enrollment: currentEnrollment(r, [program])!.record,
      workouts: r.workouts(),
    });
    r.saveProfile({ restDay: 2 });
    assert.equal(
      JSON.stringify({
        enrollment: currentEnrollment(r, [program])!.record,
        workouts: r.workouts(),
      }),
      before,
    );
  } finally {
    db.close();
  }
});

test("enrolling archives a generated Path without deleting its plan or workouts", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
    const path = currentPath(r)!;
    const workouts = r.workouts().length;
    enrollProgram(r, byCode("I-M3"), "2026-10-19", true, true);
    assert.equal(currentPath(r), undefined);
    assert.ok(pathPrograms(r).some((p) => p.record.id === path.record.id));
    assert.equal(r.workouts().length, workouts);
  } finally {
    db.close();
  }
});

test("the nine Strength programs are unchanged", () => {
  const expected: Record<string, string> = {
    "forge-strength-beginner-3-day": "92dfcd7293e90",
    "forge-strength-beginner-4-day": "ce3a2a1a57a39",
    "forge-strength-beginner-5-day": "3002204b2a31f",
    "forge-strength-intermediate-3-day": "103519f67abd61",
    "forge-strength-intermediate-4-day": "1dd635f8a20fd6",
    "forge-strength-intermediate-5-day": "1ea35cac625444",
    "forge-strength-advanced-3-day": "74779f49b4fba",
    "forge-strength-advanced-4-day": "1b7c0a7eb443cf",
    "forge-strength-advanced-5-day": "2ea6d6fdb27aa",
  };
  assert.deepEqual(
    Object.fromEntries(strength.map((p) => [p.id, programFingerprint(p)])),
    expected,
  );
  assert.ok(strength.every((p) => p.status === "draft"));
  assert.equal(programLibrary.length, 18);
});
