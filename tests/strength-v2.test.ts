import { test } from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { defaults, type WorkoutSet } from "../src/domain/types";
import {
  publishedPrograms,
  validateProgram,
  type CuratedProgram,
} from "../src/domain/programs/model";
import { recommendProgram } from "../src/domain/programs/recommend";
import { trainingWeekdays } from "../src/domain/programs/schedule";
import {
  programSessionLogSchema,
  sessionAt,
} from "../src/domain/programs/enrollment";
import {
  reducedSets,
  programProgression,
  type ProgramSessionEvidence,
} from "../src/domain/programs/progression";
import {
  currentEnrollment,
  enrollments,
  enrollProgram,
  programExerciseAdvice,
  programProgress,
  programWorkoutContext,
  startProgramSession,
} from "../src/data/programs";
import { libraryPrograms, programLibrary } from "../src/programs";
import { draftPreviewEnabled } from "../src/programs/preview";
import { pathRepository } from "./path-fixture";
import { placeholderProgram } from "./program-fixture";
import {
  approvedMapping,
  approvedPatterns,
  approvedRir,
  approvedAssessmentReduction,
  approvedSetReduction,
  parseStrengthTables,
  restFor,
  roleFor,
} from "./strength-v2-source";

const authored = parseStrengthTables();
const levels = ["Beginner", "Intermediate", "Advanced"] as const;
const strength = programLibrary.filter((p) =>
  p.id.startsWith("forge-strength-"),
);
const byCode = (code: string) => {
  const a = authored.find((p) => p.code === code)!;
  return strength.find(
    (p) => p.experience === a.experience && p.daysPerWeek === a.days,
  )!;
};
const published = (p: CuratedProgram): CuratedProgram => ({
  ...p,
  status: "published",
});

test("the authored tables parse into nine programs covering the full matrix", () => {
  assert.equal(authored.length, 9);
  assert.deepEqual(
    authored.map((p) => p.code),
    ["B-S3", "B-S4", "B-S5", "I-S3", "I-S4", "I-S5", "A-S3", "A-S4", "A-S5"],
  );
  for (const p of authored) assert.equal(p.sessions.length, p.days);
  // 49 distinct prescribed names, every one mapped.
  const names = new Set(
    authored.flatMap((p) =>
      p.sessions.flatMap((s) => s.rows.map((r) => r.name)),
    ),
  );
  assert.equal(names.size, 49);
  for (const name of names)
    assert.ok(approvedMapping[name], `${name} is unmapped`);
});

test("all nine Strength programs are bundled, valid and published", () => {
  assert.equal(strength.length, 9);
  for (const level of levels)
    for (const days of [3, 4, 5] as const) {
      const matches = strength.filter(
        (p) => p.experience === level && p.daysPerWeek === days,
      );
      assert.equal(matches.length, 1, `${level} ${days}-day`);
      assert.equal(matches[0]!.goal, "Strength");
      assert.equal(matches[0]!.status, "published");
    }
  // Published programs are listed and recommended to users.
  assert.equal(
    libraryPrograms().filter((p) => p.goal === "Strength").length,
    9,
  );
  const rec = recommendProgram(
    { ...defaults, experience: "Beginner", goal: "Build strength" },
    programLibrary,
  );
  assert.equal(rec.kind === "match" && rec.program.goal, "Strength");
});

test("every program matches its authored prescription exactly, in every phase", () => {
  for (const a of authored) {
    const program = byCode(a.code);
    for (const phase of program.phases) {
      assert.equal(phase.sessions.length, a.sessions.length);
      phase.sessions.forEach((session, i) => {
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
            loading: approvedMapping[row.name]!.loading,
          })),
          `${a.code} ${phase.name} ${session.name}`,
        );
      });
    }
  }
});

test("every exercise resolves to a rep-based catalog entry", () => {
  const catalog = new Map(exercises.map((e) => [e.id, e]));
  for (const program of strength) {
    assert.deepEqual(
      validateProgram(structuredClone(program), exercises),
      program,
    );
    for (const phase of program.phases)
      for (const session of phase.sessions)
        for (const item of session.exercises)
          assert.equal(catalog.get(item.exerciseId)?.category, "strength");
  }
  // Approved non-exact mappings.
  const expected: Record<string, string> = {
    "Hip Thrust": "barbell-hip-thrust",
    "Cable Triceps Pushdown": "triceps-rope-pushdown",
    "Chest-Supported Row": "chest-supported-dumbbell-row",
    "Paused Back Squat": "paused-squat",
    "Pull-Up / Assisted Pull-Up": "pull-up",
    "Weighted Pull-Up": "pull-up",
    "Weighted Chin-Up": "chin-up",
    "Supported Split Squat": "dumbbell-split-squat",
  };
  for (const [name, id] of Object.entries(expected))
    assert.equal(approvedMapping[name]!.id, id);
  assert.equal(catalog.get("paused-squat")!.equipment, "Barbell");
  assert.equal(catalog.get("paused-squat")!.pattern, "squat");
});

test("roles and rest guidance are explicit on every entry and follow the approved rules", () => {
  for (const program of strength)
    for (const phase of program.phases)
      for (const session of phase.sessions) {
        for (const item of session.exercises) {
          assert.equal(
            item.role,
            roleFor(item.exerciseId, session.name),
            item.exerciseId,
          );
          assert.deepEqual(item.rest, restFor[item.role!]);
          assert.equal(item.restSeconds, item.rest!.min);
        }
        assert.ok(
          session.exercises.some((e) => e.role !== "accessory"),
          `${program.id} ${session.name} has no strength movement`,
        );
        // The workout card finds program guidance by exercise ID.
        const ids = session.exercises.map((e) => e.exerciseId);
        assert.equal(new Set(ids).size, ids.length);
      }
  // Roles are specific to the session: the overhead press is primary only
  // where the session prioritises upper-body strength.
  const press = strength.flatMap((p) =>
    p.phases[0]!.sessions.flatMap((s) =>
      s.exercises
        .filter((e) => e.exerciseId === "overhead-press")
        .map((e) => `${p.id}/${s.name}:${e.role}`),
    ),
  );
  assert.deepEqual(
    press.filter((p) => p.endsWith(":primary")),
    ["forge-strength-intermediate-3-day/Deadlift + Upper Strength:primary"],
  );
  assert.ok(press.length > 1);
  assert.equal(roleFor("overhead-press", "Deadlift + Press"), "primary");
  assert.equal(roleFor("overhead-press", "Bench Strength"), "secondary");
  assert.equal(roleFor("leg-press", "Squat Strength"), "secondary");
  assert.equal(roleFor("dead-bug", "Lower B (Hinge)"), "accessory");
});

test("no session has twice as many exercises as another in the same program", () => {
  for (const program of strength) {
    const counts = program.phases[0]!.sessions.map((s) => s.exercises.length);
    assert.ok(Math.max(...counts) < 2 * Math.min(...counts), program.id);
  }
});

test("phase structure, effort targets and lower-fatigue settings follow the approved framework", () => {
  for (const program of strength) {
    assert.deepEqual(
      program.weeklyPattern,
      approvedPatterns[program.daysPerWeek],
    );
    assert.deepEqual(program.lowerFatigue, {
      setReduction: approvedSetReduction,
      rir: { min: 3, max: 4 },
    });
    if (program.experience === "Beginner") {
      assert.equal(program.progressionModel, "double-progression");
      assert.equal(program.durationWeeks, undefined);
      assert.equal(program.phases.length, 1);
      assert.deepEqual(program.phases[0]!.rir, approvedRir.Beginner.standard);
      // Beginner deloads are optional only, never scheduled.
      assert.equal(program.phases[0]!.block, "standard");
      assert.equal(program.phases[0]!.setReduction, undefined);
      continue;
    }
    assert.equal(
      program.progressionModel,
      program.experience === "Intermediate" ? "structured" : "autoregulated",
    );
    assert.equal(program.durationWeeks, 8);
    assert.deepEqual(
      program.phases.map((p) => [p.block, p.weeks]),
      [
        ["accumulation", 3],
        ["lower-fatigue", 1],
        ["intensification", 3],
        ["assessment", 1],
      ],
    );
    const rir = approvedRir[program.experience];
    for (const phase of program.phases)
      assert.deepEqual(phase.rir, rir[phase.block as keyof typeof rir]);
    // Only the assessment week carries a default set reduction (about 30%);
    // the week-4 reduction comes from lowerFatigue.
    assert.deepEqual(
      program.phases.map((p) => p.setReduction),
      [undefined, undefined, undefined, approvedAssessmentReduction],
    );
    // Week 4 and week 8 positions land in the right blocks.
    assert.equal(
      sessionAt(program, 3 * program.daysPerWeek)!.phase.block,
      "lower-fatigue",
    );
    assert.equal(
      sessionAt(program, 7 * program.daysPerWeek)!.phase.block,
      "assessment",
    );
  }
});

test("matching covers every experience level and weekly frequency", () => {
  const library = strength.map(published);
  for (const level of levels)
    for (const frequency of [3, 4, 5]) {
      const rec = recommendProgram(
        { ...defaults, experience: level, goal: "Strength", frequency },
        library,
      );
      assert.equal(rec.kind, "match");
      if (rec.kind !== "match") continue;
      assert.equal(rec.program.experience, level);
      assert.equal(rec.program.daysPerWeek, frequency);
      assert.equal(rec.alternatives.length, 2);
    }
  assert.equal(
    recommendProgram(
      { ...defaults, experience: "Advanced", goal: "Muscle Building" },
      library,
    ).kind,
    "none",
  );
  assert.equal(publishedPrograms(library).length, 9);
});

test("every program keeps the preferred rest day free", () => {
  for (const program of strength)
    for (let restDay = 0; restDay < 7; restDay++) {
      const days = trainingWeekdays(program.weeklyPattern, restDay);
      assert.equal(days.length, program.daysPerWeek);
      assert.ok(!days.includes(restDay), `${program.id} rest day ${restDay}`);
    }
});

// ---- Progression engine ----------------------------------------------------

let n = 0;
const set = (
  weight: number,
  reps: number,
  effort: { rir?: number; rpe?: number } = {},
  patch: Partial<WorkoutSet> = {},
): WorkoutSet => ({
  id: `s${n++}`,
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
const session = (
  sets: WorkoutSet[],
  patch: Partial<ProgramSessionEvidence> = {},
): ProgramSessionEvidence => ({
  week: 1,
  block: "accumulation",
  lowerFatigue: false,
  sets,
  ...patch,
});

const beginner = byCode("B-S3");
const intermediate = byCode("I-S3");
const advanced = byCode("A-S3");
// B-S3 day 3: Barbell Bench Press 3 × 6–8.
const bench = beginner.phases[0]!.sessions[2]!.exercises[0]!;
const advise = (
  program: CuratedProgram,
  phaseIndex: number,
  item: CuratedProgram["phases"][number]["sessions"][number]["exercises"][number],
  history: ProgramSessionEvidence[],
  lowerFatigue = false,
) =>
  programProgression({
    program,
    phase: program.phases[phaseIndex]!,
    item,
    history,
    increment: 2.5,
    lowerFatigue,
  });

test("beginner double progression: increase only when every set tops the range at the target effort", () => {
  assert.equal(bench.exerciseId, "barbell-bench-press");
  assert.deepEqual([bench.sets, bench.reps.min, bench.reps.max], [3, 6, 8]);
  assert.equal(advise(beginner, 0, bench, []).action, "establish");
  const top = [
    set(60, 8, { rir: 2 }),
    set(60, 8, { rir: 2 }),
    set(60, 8, { rir: 3 }),
  ];
  const up = advise(beginner, 0, bench, [session(top)]);
  assert.equal(up.action, "increase");
  assert.equal(up.weight, 62.5);
  assert.deepEqual(up.rir, { min: 2, max: 3 });
  // Warm-up sets are separate and never count as working sets.
  const withWarmup = [set(20, 10, {}, { kind: "warmup" }), ...top];
  assert.equal(
    advise(beginner, 0, bench, [session(withWarmup)]).action,
    "increase",
  );
  // Building reps within the range holds the load.
  const building = [
    set(60, 8, { rir: 2 }),
    set(60, 7, { rir: 2 }),
    set(60, 6, { rir: 2 }),
  ];
  const hold = advise(beginner, 0, bench, [session(building)]);
  assert.deepEqual([hold.action, hold.weight], ["hold", 60]);
  // RPE converts to estimated RIR (10 − RPE).
  const rpe = [
    set(60, 8, { rpe: 8 }),
    set(60, 8, { rpe: 7.5 }),
    set(60, 8, { rpe: 8 }),
  ];
  assert.equal(advise(beginner, 0, bench, [session(rpe)]).action, "increase");
});

test("missing effort data or harder-than-target effort never unlocks an increase", () => {
  const noEffort = [set(60, 8, { rir: 2 }), set(60, 8), set(60, 8, { rir: 2 })];
  const a = advise(beginner, 0, bench, [session(noEffort)]);
  assert.deepEqual([a.action, a.weight], ["hold", 60]);
  assert.match(a.reason, /not logged/);
  const grinding = [
    set(60, 8, { rir: 2 }),
    set(60, 8, { rir: 1 }),
    set(60, 8, { rir: 2 }),
  ];
  const b = advise(beginner, 0, bench, [session(grinding)]);
  assert.deepEqual([b.action, b.weight], ["hold", 60]);
  assert.match(b.reason, /harder/);
});

test("missed reps keep the load, and repeated misses suggest a reduction without touching history", () => {
  const missed = [
    set(60, 6, { rir: 1 }),
    set(60, 5, { rir: 0 }),
    set(60, 5, { rir: 0 }),
  ];
  const once = advise(beginner, 0, bench, [session(missed)]);
  assert.deepEqual([once.action, once.weight], ["hold", 60]);
  const history = [session(missed), session(structuredClone(missed))];
  const frozen = JSON.stringify(history);
  const twice = advise(beginner, 0, bench, history);
  assert.deepEqual([twice.action, twice.weight], ["reduce", 52.5]);
  assert.equal(JSON.stringify(history), frozen);
  // Incomplete working sets count as missed work.
  const incomplete = [
    set(60, 8, { rir: 2 }),
    set(60, 8, { rir: 2 }),
    set(60, 8, { rir: 2 }, { completed: false }),
  ];
  assert.equal(
    advise(beginner, 0, bench, [session(incomplete)]).action,
    "hold",
  );
  // Mixed working loads need a manual choice.
  const mixed = [
    set(60, 8, { rir: 2 }),
    set(62.5, 8, { rir: 2 }),
    set(60, 8, { rir: 2 }),
  ];
  assert.deepEqual(advise(beginner, 0, bench, [session(mixed)]).weight, null);
});

test("stalled performance is flagged, not acted on", () => {
  const same = [
    set(60, 7, { rir: 2 }),
    set(60, 7, { rir: 2 }),
    set(60, 6, { rir: 2 }),
  ];
  const advice = advise(beginner, 0, bench, [
    session(same),
    session(structuredClone(same)),
  ]);
  assert.deepEqual(
    [advice.action, advice.weight, advice.stalled],
    ["hold", 60, true],
  );
  assert.match(advice.reason, /lower-fatigue/);
});

test("intermediate blocks: lower-fatigue and assessment weeks never increase load", () => {
  // I-S3 day 1: Barbell Back Squat 4 × 4–6 (primary).
  const squat = intermediate.phases[0]!.sessions[0]!.exercises[0]!;
  assert.deepEqual(
    [squat.exerciseId, squat.role, squat.sets],
    ["back-squat", "primary", 4],
  );
  const top = Array.from({ length: 4 }, () => set(100, 6, { rir: 3 }));
  assert.equal(
    advise(intermediate, 0, squat, [session(top)]).action,
    "increase",
  );
  const deload = advise(intermediate, 1, squat, [session(top)], true);
  assert.deepEqual(
    [deload.action, deload.weight, deload.sets],
    ["lower-fatigue", 100, 3],
  );
  assert.deepEqual(deload.rir, { min: 3, max: 4 });
  const check = advise(intermediate, 3, squat, [
    session(top, { week: 7, block: "intensification" }),
  ]);
  assert.deepEqual([check.action, check.weight], ["assess", 100]);
  assert.deepEqual(check.rir, { min: 1, max: 3 });
  // Week 8 is reduced-volume (4 → 3 sets) and never increases load, even
  // when the last session would otherwise earn it.
  assert.equal(check.sets, 3);
  assert.match(check.reason, /No maximal attempts/);
  // Week 5 builds on week 3, not on the lower-fatigue week.
  const week5 = advise(intermediate, 2, squat, [
    session(
      Array.from({ length: 3 }, () => set(90, 6, { rir: 4 })),
      { week: 4, block: "lower-fatigue", lowerFatigue: true },
    ),
    session(top, { week: 3 }),
  ]);
  assert.deepEqual([week5.action, week5.weight], ["increase", 102.5]);
  assert.deepEqual(week5.rir, { min: 1, max: 2 });
  // Secondary effort target differs from primary.
  const paused = intermediate.phases[0]!.sessions[2]!.exercises[1]!;
  assert.equal(paused.role, "secondary");
  assert.deepEqual(advise(intermediate, 0, paused, []).rir, { min: 3, max: 3 });
});

test("advanced autoregulation raises clearly easy loads but holds hard ones", () => {
  // A-S3 day 1: Barbell Back Squat 4 × 3–5.
  const squat = advanced.phases[0]!.sessions[0]!.exercises[0]!;
  const easy = Array.from({ length: 4 }, () => set(140, 4, { rir: 5 }));
  assert.equal(advise(advanced, 0, squat, [session(easy)]).action, "increase");
  // Intermediate does not autoregulate on effort alone.
  const iSquat = intermediate.phases[0]!.sessions[0]!.exercises[0]!;
  const iEasy = Array.from({ length: 4 }, () => set(100, 5, { rir: 5 }));
  assert.equal(
    advise(intermediate, 0, iSquat, [session(iEasy)]).action,
    "hold",
  );
  const hard = Array.from({ length: 4 }, () => set(140, 5, { rir: 1 }));
  assert.equal(advise(advanced, 0, squat, [session(hard)]).action, "hold");
});

test("assisted and weighted pull-ups never receive load suggestions", () => {
  for (const code of ["I-S3", "A-S3"]) {
    const program = byCode(code);
    const pull = program.phases[0]!.sessions[1]!.exercises.find(
      (e) => e.exerciseId === "pull-up",
    )!;
    assert.ok(pull.loading);
    const history = [
      session(Array.from({ length: 3 }, () => set(10, 8, { rir: 3 }))),
    ];
    const advice = advise(program, 0, pull, history);
    assert.deepEqual([advice.action, advice.weight], ["manual", null]);
    assert.match(advice.reason, /assistance/);
  }
});

test("per-side prescriptions are explicit", () => {
  const split = byCode("I-S4").phases[0]!.sessions[2]!.exercises[2]!;
  assert.deepEqual(
    [split.exerciseId, split.perSide, split.sets, split.reps.min],
    ["dumbbell-split-squat", true, 2, 8],
  );
  assert.match(split.notes!, /support/);
  assert.match(advise(byCode("I-S4"), 0, split, []).reason, /per side/);
  assert.deepEqual(
    [2, 3, 4].map((s) => reducedSets(s, approvedSetReduction)),
    [1, 2, 3],
  );
  // The ~30% assessment reduction keeps at least one set per exercise.
  assert.deepEqual(
    [1, 2, 3, 4].map((s) => reducedSets(s, approvedAssessmentReduction)),
    [1, 1, 2, 3],
  );
});

// ---- Enrollment integration ------------------------------------------------

function completeNext(
  r: ReturnType<typeof pathRepository>["r"],
  enrollmentId: string,
  program: CuratedProgram,
  fill: (exerciseId: string) => { weight: number; reps: number; rir: number },
  options: { lowerFatigue?: boolean } = {},
) {
  const workout = startProgramSession(r, enrollmentId, [program], options);
  for (const row of r.workoutExercises(workout.id))
    for (const s of r.sets(row.id))
      r.editSet(s.id, { ...fill(row.exerciseId), completed: true });
  r.finishWorkout(workout.id);
  return workout;
}

test("enrolled Strength sessions progress from recorded performance and support lower-fatigue weeks", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ restDay: 6 });
    const program = published(intermediate);
    const { id } = enrollProgram(r, program, "2026-10-19");
    const good = () => ({ weight: 100, reps: 6, rir: 3 });
    // Week 1, all three sessions at the top of the range.
    for (let i = 0; i < 3; i++) completeNext(r, id, program, good);
    // Week 2, day 1: the squat earned an increase from week 1's day 1 only.
    const week2 = startProgramSession(r, id, [program]);
    const squat = programExerciseAdvice(r, week2.id, "back-squat", [program])!;
    assert.equal(squat.slot.week, 2);
    assert.deepEqual(
      [squat.advice.action, squat.advice.weight],
      ["increase", 102.5],
    );
    // Pull-ups (day 2) are not in this session.
    assert.equal(
      programExerciseAdvice(r, week2.id, "pull-up", [program]),
      undefined,
    );
    r.finishWorkout(week2.id);
    // Finish weeks 2–3 (positions 4–8).
    for (let i = 0; i < 5; i++) completeNext(r, id, program, good);
    // Week 4 defaults to a lower-fatigue session with reduced working sets.
    const progress = programProgress(r, currentEnrollmentOf(r, program));
    assert.equal(progress.next!.week, 4);
    const deload = startProgramSession(r, id, [program]);
    const rows = r.workoutExercises(deload.id);
    assert.deepEqual(
      rows.map((row) => row.target?.sets),
      program.phases[1]!.sessions[0]!.exercises.map((e) =>
        reducedSets(e.sets, approvedSetReduction),
      ),
    );
    const context = programWorkoutContext(r, deload.id, [program])!;
    assert.equal(context.log.lowerFatigue, true);
    const advice = programExerciseAdvice(r, deload.id, "back-squat", [
      program,
    ])!.advice;
    assert.equal(advice.action, "lower-fatigue");
    // The authored program is unchanged.
    assert.equal(program.phases[1]!.sessions[0]!.exercises[0]!.sets, 4);
    r.finishWorkout(deload.id);
    // The lifter may train the next week-4 session (day 2) normally instead.
    const normal = startProgramSession(r, id, [program], {
      lowerFatigue: false,
    });
    assert.deepEqual(
      r.workoutExercises(normal.id).map((row) => row.target?.sets),
      program.phases[1]!.sessions[1]!.exercises.map((e) => e.sets),
    );
    assert.equal(
      programWorkoutContext(r, normal.id, [program])!.log.lowerFatigue,
      undefined,
    );
    r.finishWorkout(normal.id);
    // Finish week 4 day 3 and weeks 5–7 (positions 11–20).
    for (let i = 0; i < 10; i++) completeNext(r, id, program, good);
    // Week 8 starts with about 30% fewer working sets and never increases load.
    const check = startProgramSession(r, id, [program]);
    const week8 = program.phases[3]!.sessions[0]!.exercises;
    assert.deepEqual(
      r.workoutExercises(check.id).map((row) => row.target?.sets),
      week8.map((e) => reducedSets(e.sets, approvedAssessmentReduction)),
    );
    assert.deepEqual(
      week8.map((e) => e.sets),
      intermediate.phases[0]!.sessions[0]!.exercises.map((e) => e.sets),
    );
    const assess = programExerciseAdvice(r, check.id, "back-squat", [program])!;
    assert.equal(assess.slot.week, 8);
    assert.deepEqual(
      [assess.advice.action, assess.advice.weight],
      ["assess", 100],
    );
  } finally {
    db.close();
  }
});

function currentEnrollmentOf(
  r: ReturnType<typeof pathRepository>["r"],
  program: CuratedProgram,
) {
  return currentEnrollment(r, [program])!;
}

test("drafts are enrolled and resolved only when draft preview is allowed", () => {
  // Node tests are not a development build: preview is off by default.
  assert.equal(draftPreviewEnabled, false);
  // A future draft version of a program, e.g. one under review.
  const draft: CuratedProgram = { ...intermediate, status: "draft" };
  const { r, db } = pathRepository();
  try {
    assert.throws(() => enrollProgram(r, draft, "2026-10-19"), /published/);
    enrollProgram(r, draft, "2026-10-19", false, true);
    assert.equal(currentEnrollment(r, [draft])!.program, undefined);
    assert.equal(currentEnrollment(r, [draft])!.data.programId, draft.id);
    const preview = enrollments(r, [draft], true)[0]!;
    assert.equal(preview.program, draft);
    // Published programs enroll normally.
    enrollProgram(r, intermediate, "2026-10-19", true);
    assert.equal(currentEnrollment(r, strength)!.program, intermediate);
  } finally {
    db.close();
  }
});

test("existing enrollments, session logs and unstructured programs keep working", () => {
  // Session logs written before Strength V2 have no lowerFatigue field.
  assert.deepEqual(
    programSessionLogSchema.parse({
      forgeProgram: 1,
      enrollmentId: "e",
      position: 0,
      workoutId: "w",
      skipped: false,
    }).lowerFatigue,
    undefined,
  );
  const { r, db } = pathRepository();
  try {
    const legacy = placeholderProgram({ status: "published" });
    const { id } = enrollProgram(r, legacy, "2026-10-19");
    // Programs without a progression model get no structured advice and never
    // a lower-fatigue reduction.
    const workout = startProgramSession(r, id, [legacy], {
      lowerFatigue: true,
    });
    assert.equal(r.workoutExercises(workout.id)[0]!.target?.sets, 1);
    assert.equal(
      programExerciseAdvice(r, workout.id, "barbell-bench-press", [legacy]),
      undefined,
    );
  } finally {
    db.close();
  }
});
