import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { forgePaths } from "../src/domain/paths/catalog";
import {
  generatePath,
  structure,
  validateDraft,
} from "../src/domain/paths/generator";
import {
  weeklySessionBalance,
  redistributeWeeklySets,
  sessionWorkload,
} from "../src/domain/paths/balance";
import { workloadReview } from "../src/domain/paths/review";
import { exerciseStimulus } from "../src/domain/paths/stimulus";
import { sessionSetCap, weeklyMuscleCap } from "../src/domain/paths/volume";
import type { PathPreferences } from "../src/domain/paths/model";
import { pathPreferences, pathRepository } from "./path-fixture";
import {
  acceptPath,
  pathPrograms,
  savedDraft,
  startPathSession,
  pathSessions,
  editPathDay,
} from "../src/data/paths";

test("new-plan edits cannot exceed a goal session cap even when each exercise stays within its own cap", () => {
  const draft = generatePath(pathPreferences({ duration: 90 }), exercises);
  const day = draft.days[0]!;
  assert.equal(
    day.exercises.reduce((n, e) => n + e.sets, 0),
    24,
  );
  const edited = {
    ...draft,
    days: draft.days.map((d, i) =>
      i === 0
        ? {
            ...d,
            exercises: d.exercises.map((e, j) =>
              j === 0 ? { ...e, sets: e.sets + 1 } : e,
            ),
          }
        : d,
    ),
  };
  assert.throws(() => validateDraft(edited, exercises), /session limit/);
  assert.doesNotThrow(() =>
    validateDraft({ ...edited, engineVersion: 5 }, exercises),
  );
});

test("weekly primary-target ceilings are checked independently of session and exercise caps", () => {
  const draft = generatePath(
    pathPreferences({ frequency: 6, duration: 90 }),
    exercises,
  );
  assert.equal(
    workloadReview(draft, exercises).sets.Core,
    weeklyMuscleCap(draft.preferences, "Core"),
  );
  const edited = structuredClone(draft);
  const day = edited.days.find((d) =>
    d.exercises.some(
      (e) => exerciseStimulus(e.exerciseId).direct[0] === "Core" && e.sets < 4,
    ),
  )!;
  const core = day.exercises.find(
    (e) => exerciseStimulus(e.exerciseId).direct[0] === "Core",
  )!;
  const donor = day.exercises.find(
    (e) => exerciseStimulus(e.exerciseId).direct[0] !== "Core" && e.sets > 1,
  )!;
  core.sets++;
  donor.sets--;
  assert.throws(() => validateDraft(edited, exercises), /Core.*ceiling/);
});

test("omitting strength main lifts does not promote higher-rep assistance to five-set main work", () => {
  const draft = generatePath(
    pathPreferences({
      pathKey: "get-strong",
      frequency: 3,
      duration: 90,
      avoidPatterns: ["squat", "horizontal push"],
    }),
    exercises,
  );
  for (const day of draft.days)
    for (const item of day.exercises)
      if (item.reps >= 8) assert.ok(item.sets <= 3, item.exerciseId);
});

function assertConstraints(draft: ReturnType<typeof generatePath>) {
  const sessions = weeklySessionBalance(
    draft,
    exercises,
    structure(draft.preferences),
  ).sessions;
  const weekly: Record<string, number> = {};
  for (const session of sessions) {
    assert.ok(
      session.duration.expected <= draft.preferences.duration,
      session.name,
    );
    assert.ok(
      session.workingSets <= sessionSetCap(draft.preferences),
      session.name,
    );
    assert.ok(session.exerciseCount >= 1);
    assert.equal(
      session.compoundSets + session.isolationSets,
      session.workingSets,
    );
    for (const [muscle, sets] of Object.entries(session.primary))
      weekly[muscle] = (weekly[muscle] ?? 0) + sets;
  }
  for (const [muscle, sets] of Object.entries(weekly))
    assert.ok(sets <= weeklyMuscleCap(draft.preferences, muscle), muscle);
}

test("more efficient balancing cannot turn saved time into extra weekly volume", () => {
  const draft = generatePath(
    pathPreferences({ frequency: 6, duration: 45 }),
    exercises,
  );
  // Measured Planner 5 baseline for the same full-equipment request.
  assert.ok(workloadReview(draft, exercises).total <= 107);
  assertConstraints(draft);
});

test("every supported Advanced Physique and Build Muscle frequency has purpose-aware session review", () => {
  for (const pathKey of ["advanced-physique", "build-muscle"] as const) {
    const path = forgePaths.find((p) => p.key === pathKey)!;
    for (let frequency = path.minDays; frequency <= path.maxDays; frequency++) {
      const draft = generatePath(
        pathPreferences({ pathKey, frequency, duration: 90 }),
        exercises,
      );
      assertConstraints(draft);
      const review = weeklySessionBalance(
        draft,
        exercises,
        structure(draft.preferences),
      );
      assert.equal(review.sessions.length, frequency);
      assert.ok(
        review.sessions.every(
          (s) => s.patterns.length && Object.keys(s.direct).length,
        ),
      );
      assert.ok(!review.diagnostics.some((d) => d.kind === "review"));
    }
  }
});

test("broad upper and focused push/pull days retain different exercise counts with explicit explanations", () => {
  const draft = generatePath(
    pathPreferences({
      pathKey: "advanced-physique",
      frequency: 5,
      duration: 90,
    }),
    exercises,
  );
  const review = weeklySessionBalance(
    draft,
    exercises,
    structure(draft.preferences),
  );
  assert.equal(review.sessions[0]!.purpose, "upper");
  assert.equal(review.sessions[2]!.purpose, "push");
  assert.equal(review.sessions[3]!.purpose, "pull");
  assert.ok(
    review.sessions[0]!.exerciseCount > review.sessions[2]!.exerciseCount,
  );
  assert.ok(
    review.diagnostics.some(
      (d) =>
        d.kind === "intentional" &&
        d.dayKeys.includes("day-0") &&
        d.dayKeys.includes("day-2"),
    ),
  );
  const overlap = review.overlaps.find(
    (entry) =>
      entry.dayKeys.includes("day-0") && entry.dayKeys.includes("day-2"),
  )!;
  assert.ok(overlap.directMuscles.includes("Chest"));
  assert.ok(overlap.supportingMuscles.includes("Triceps"));
  assert.ok(overlap.daysApart >= 2);
});

test("redistribution balances comparable days without adding weekly sets, changing coverage or moving recovery exposures", () => {
  const draft = generatePath(pathPreferences({ duration: 90 }), exercises);
  const changed = {
    ...draft,
    days: draft.days.map((d, i) => ({
      ...d,
      exercises: d.exercises.map((e) => ({
        ...e,
        sets:
          i === 0
            ? exerciseStimulus(e.exerciseId).isolation
              ? 2
              : 4
            : i === 2
              ? 2
              : e.sets,
      })),
    })),
  };
  const original = JSON.stringify(changed);
  const before = workloadReview(changed, exercises);
  assert.ok(before.balance.diagnostics.some((d) => d.kind === "review"));
  const result = redistributeWeeklySets(
    changed,
    exercises,
    structure(changed.preferences),
  );
  const afterDraft = { ...changed, days: result.days };
  const after = workloadReview(afterDraft, exercises);
  assert.ok(result.transfers.length > 0);
  assert.equal(after.total, before.total);
  assert.deepEqual(after.sets, before.sets);
  assert.deepEqual(after.assistance, before.assistance);
  assert.equal(JSON.stringify(changed), original);
  assert.deepEqual(
    result.days.map((d) => [
      d.roles,
      d.offset,
      d.exercises.map((e) => e.exerciseId),
    ]),
    changed.days.map((d) => [
      d.roles,
      d.offset,
      d.exercises.map((e) => e.exerciseId),
    ]),
  );
  const daySets = (d: (typeof draft.days)[number]) =>
    d.exercises.reduce((n, e) => n + e.sets, 0);
  assert.ok(
    Math.abs(daySets(result.days[0]!) - daySets(result.days[2]!)) <
      Math.abs(daySets(changed.days[0]!) - daySets(changed.days[2]!)),
  );
  assertConstraints(afterDraft);
  assert.ok(Math.abs(daySets(result.days[0]!) - daySets(result.days[2]!)) <= 3);
  assert.equal(
    redistributeWeeklySets(
      afterDraft,
      exercises,
      structure(changed.preferences),
    ).transfers.length,
    0,
  );
});

test("restrictions create coverage diagnostics, not unrelated filler or restored excluded exercises", () => {
  const restrictions: Partial<PathPreferences>[] = [
    { equipment: ["Dumbbell", "Bench", "Pull-up bar"] },
    { excluded: ["barbell-bench-press", "seated-leg-curl"] },
    { avoidPatterns: ["vertical pull", "elbow flexion"] },
  ];
  for (const patch of restrictions) {
    const p = pathPreferences({
      frequency: 5,
      pathKey: "advanced-physique",
      duration: 90,
      ...patch,
    });
    const draft = generatePath(p, exercises);
    assertConstraints(draft);
    assert.ok(
      draft.days.every((d) =>
        d.exercises.every((e) => !p.excluded.includes(e.exerciseId)),
      ),
    );
    const balance = weeklySessionBalance(draft, exercises, structure(p));
    assert.ok(balance.diagnostics.some((d) => d.kind === "restricted"));
  }
});

test("budget sweeps preserve fitting sessions or explicitly reject an infeasible base prescription", () => {
  for (const path of forgePaths)
    for (const duration of [30, 45, 60, 75, 90])
      for (
        let frequency = path.minDays;
        frequency <= path.maxDays;
        frequency++
      ) {
        const p = pathPreferences({
          pathKey: path.key,
          frequency,
          duration,
          experience: path.key === "start-strong" ? "Beginner" : "Intermediate",
        });
        let draft;
        try {
          draft = generatePath(p, exercises);
        } catch (error) {
          assert.ok(
            error instanceof Error && /minutes|duration/.test(error.message),
            String(error),
          );
          continue;
        }
        assertConstraints(draft);
      }
});

test("strength and beginner work is not padded to match advanced hypertrophy exercise counts", () => {
  const strength = generatePath(
    pathPreferences({ pathKey: "get-strong", frequency: 4, duration: 90 }),
    exercises,
  );
  const beginner = generatePath(
    pathPreferences({
      pathKey: "start-strong",
      experience: "Beginner",
      frequency: 3,
      duration: 30,
    }),
    exercises,
  );
  assert.ok(strength.days.every((d) => d.exercises.length === 4));
  assert.ok(beginner.days.every((d) => d.exercises.every((e) => e.sets === 2)));
  const review = weeklySessionBalance(
    strength,
    exercises,
    structure(strength.preferences),
  );
  assert.ok(review.sessions.some((s) => s.heavyCompoundSets > 0));
  assert.equal(sessionWorkload(strength.days[0]!, exercises).exerciseCount, 4);
  assert.deepEqual(
    redistributeWeeklySets(strength, exercises).days,
    strength.days,
  );
  for (const path of forgePaths.filter((p) => p.key !== "advanced-physique"))
    for (let frequency = path.minDays; frequency <= path.maxDays; frequency++)
      assertConstraints(
        generatePath(
          pathPreferences({
            pathKey: path.key,
            frequency,
            duration: 90,
            experience: "Beginner",
          }),
          exercises,
        ),
      );
});

test("a named back-and-hamstrings focus allocates main work to those roles, not simply the first two slots", () => {
  const draft = generatePath(
    pathPreferences({
      pathKey: "advanced-physique",
      frequency: 3,
      duration: 90,
    }),
    exercises,
  );
  const day = draft.days[1]!;
  const sets = (id: string) =>
    day.exercises.find((e) => e.exerciseId === id)!.sets;
  assert.ok(sets("lat-pulldown") > sets("incline-dumbbell-bench-press"));
  assert.ok(sets("seated-leg-curl") >= sets("dumbbell-split-squat"));
});

test("new-plan validation enforces goal-specific session and weekly primary-target limits after edits", () => {
  const strength = generatePath(
    pathPreferences({ pathKey: "get-strong", frequency: 3, duration: 90 }),
    exercises,
  );
  assert.throws(
    () =>
      validateDraft(
        {
          ...strength,
          days: strength.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((e) => ({ ...e, sets: 5 })),
          })),
        },
        exercises,
      ),
    /limit|ceiling/,
  );
  const muscle = generatePath(
    pathPreferences({ frequency: 6, duration: 90 }),
    exercises,
  );
  assert.throws(
    () =>
      validateDraft(
        {
          ...muscle,
          days: muscle.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((e) => ({
              ...e,
              sets: Math.min(5, e.sets + 1),
            })),
          })),
        },
        exercises,
      ),
    /limit|ceiling/,
  );
});

test("saved pre-balance plans and logged targets are not regenerated on load or edits", () => {
  const { r, db } = pathRepository();
  try {
    const draft = generatePath(pathPreferences({ duration: 90 }), exercises);
    acceptPath(r, { ...draft, engineVersion: 5 });
    const program = pathPrograms(r)[0]!;
    const before = savedDraft(r, program);
    const workout = startPathSession(r, pathSessions(r, program)[0]!.record.id);
    const targets = r.workoutExercises(workout.id);
    editPathDay(
      r,
      program.record.id,
      0,
      before.days[0]!.exercises.map((e) => ({ ...e, weight: 10 })),
    );
    assert.equal(savedDraft(r, pathPrograms(r)[0]!).engineVersion, 5);
    assert.deepEqual(r.workoutExercises(workout.id), targets);
  } finally {
    db.close();
  }
});
