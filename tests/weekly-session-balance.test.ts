import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { forgePaths } from "../src/domain/paths/catalog";
import {
  generatePath,
  structure,
  validateDraft,
} from "../src/domain/paths/generator";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import {
  weeklySessionBalance,
  sessionWorkload,
} from "../src/domain/paths/balance";
import {
  directSets,
  sessionExerciseCap,
  weeklyVolumeTarget,
} from "../src/domain/paths/policy";
import {
  assessProgram,
  programErrors,
  programWarnings,
} from "../src/domain/paths/programQuality";
import { auditWeek } from "../src/domain/paths/weekAudit";
import type { PathPreferences } from "../src/domain/paths/model";
import { pathPreferences, pathRepository } from "./path-fixture";
import {
  pathPrograms,
  startPathSession,
  pathSessions,
} from "../src/data/paths";
import { acceptPath, savedDraft, editPathDay } from "../src/data/pathBuilder";

function assertConstraints(draft: ReturnType<typeof generatePath>) {
  const p = draft.preferences;
  assert.deepEqual(auditWeek(draft.days), []);
  assert.deepEqual(programErrors(assessProgram(draft, exercises)), []);
  const sessions = weeklySessionBalance(
    draft,
    exercises,
    structure(p),
  ).sessions;
  for (const session of sessions) {
    assert.ok(session.exerciseCount >= 1);
    assert.ok(session.exerciseCount <= sessionExerciseCap(p), session.name);
    assert.equal(
      session.compoundSets + session.isolationSets,
      session.workingSets,
    );
  }
  for (const [muscle, sets] of Object.entries(
    directSets(draft.days.flatMap((d) => d.exercises)),
  ))
    assert.ok(sets <= weeklyVolumeTarget(p, muscle).max, muscle);
}

test("customization above a recommendation warns, while breaking an integrity rule blocks", () => {
  const draft = generatePath(pathPreferences(), exercises);
  const withSets = (sets: number) => ({
    ...draft,
    days: draft.days.map((d, i) =>
      i === 0
        ? {
            ...d,
            exercises: d.exercises.map((e, j) =>
              j === 0 ? { ...e, sets } : e,
            ),
          }
        : d,
    ),
  });
  // Five sets is a user choice the engine flags but accepts.
  const five = assessProgram(withSets(5), exercises);
  assert.deepEqual(programErrors(five), []);
  assert.ok(programWarnings(five).some((f) => f.code === "set-count"));
  assert.doesNotThrow(() => validateDraft(withSets(5), exercises));
  // Six sets on one exercise breaks the per-exercise integrity rule.
  assert.throws(
    () => validateDraft(withSets(6), exercises),
    /1–5 working sets/,
  );
});

test("weekly volume far beyond a muscle's ceiling is an error; modestly above is a warning", () => {
  const draft = generatePath(pathPreferences({ frequency: 6 }), exercises);
  const ceiling = weeklyVolumeTarget(draft.preferences, "Chest").max;
  const chest = (d: typeof draft) =>
    directSets(d.days.flatMap((x) => x.exercises)).Chest ?? 0;
  const edited = structuredClone(draft);
  const chestItems = edited.days.flatMap((d) =>
    d.exercises.filter(
      (e) =>
        exercises.find((x) => x.id === e.exerciseId)?.pattern ===
        "horizontal push",
    ),
  );
  // Add chest sets one at a time until just above the ceiling.
  for (let i = 0; chest(edited) <= ceiling; i = (i + 1) % chestItems.length)
    chestItems[i]!.sets++;
  assert.ok(chest(edited) <= ceiling * 1.25);
  const mild = assessProgram(edited, exercises);
  assert.ok(programWarnings(mild).some((f) => f.code === "weekly-volume-high"));
  assert.ok(!programErrors(mild).some((f) => f.code === "weekly-volume-high"));
  for (const item of chestItems) item.sets = 5;
  assert.ok(chest(edited) > ceiling * 1.25);
  assert.ok(
    programErrors(assessProgram(edited, exercises)).some(
      (f) =>
        f.code === "weekly-volume-high" && /Chest.*well above/.test(f.message),
    ),
  );
  assert.throws(() => validateDraft(edited, exercises));
});

test("omitting strength main lifts does not promote higher-rep assistance to heavy main work", () => {
  const draft = generatePath(
    pathPreferences({
      pathKey: "get-strong",
      frequency: 3,
      avoidPatterns: ["squat", "horizontal push"],
    }),
    exercises,
  );
  for (const day of draft.days)
    for (const item of day.exercises)
      if (item.reps >= 8)
        assert.ok(item.sets <= 4 && item.rest < 180, item.exerciseId);
});

test("every supported Advanced Physique and Build Muscle frequency has purpose-aware session review", () => {
  for (const pathKey of ["advanced-physique", "build-muscle"] as const) {
    const path = forgePaths.find((p) => p.key === pathKey)!;
    for (let frequency = path.minDays; frequency <= path.maxDays; frequency++) {
      const draft = generatePath(
        pathPreferences({ pathKey, frequency }),
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
      assert.deepEqual(review.issues, []);
    }
  }
});

test("broad upper and focused push/pull days keep their purposes with balanced exercise counts", () => {
  const draft = generatePath(
    pathPreferences({
      pathKey: "advanced-physique",
      frequency: 5,
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
  const counts = review.sessions.map((s) => s.exerciseCount);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, String(counts));
  assert.deepEqual(review.issues, []);
  const overlap = review.overlaps.find(
    (entry) =>
      entry.dayKeys.includes("day-0") && entry.dayKeys.includes("day-2"),
  )!;
  assert.ok(overlap.directMuscles.includes("Chest"));
  assert.ok(overlap.daysApart >= 2);
});

test("restrictions create coverage diagnostics, not unrelated filler or restored excluded exercises", () => {
  // Exclusions with remaining alternatives are simply substituted; the
  // diagnostic appears when a planned movement family has no option left.
  const restrictions: Partial<PathPreferences>[] = [
    { equipment: ["Dumbbell"] },
    {
      excluded: [
        "barbell-bench-press",
        "seated-leg-curl",
        "lying-leg-curl",
        "sliding-leg-curl",
      ],
    },
    { avoidPatterns: ["vertical pull", "elbow flexion"] },
  ];
  for (const patch of restrictions) {
    const p = pathPreferences({
      frequency: 5,
      pathKey: "advanced-physique",
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

test("goal limits hold for every supported Path, frequency and experience", () => {
  for (const path of forgePaths)
    for (const experience of ["Beginner", "Intermediate", "Advanced"] as const)
      for (
        let frequency = path.minDays;
        frequency <= path.maxDays;
        frequency++
      ) {
        if (path.key === "advanced-physique" && experience === "Beginner")
          continue;
        assertConstraints(
          generatePath(
            pathPreferences({ pathKey: path.key, frequency, experience }),
            exercises,
          ),
        );
      }
});

test("strength and beginner work is not padded to match hypertrophy exercise counts", () => {
  const strength = generatePath(
    pathPreferences({ pathKey: "get-strong", frequency: 4 }),
    exercises,
  );
  const beginner = generatePath(
    pathPreferences({
      pathKey: "start-strong",
      experience: "Beginner",
      frequency: 3,
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
});

test("a named back-and-hamstrings day opens with its back work, not a leg movement", () => {
  const draft = generatePath(
    pathPreferences({
      pathKey: "advanced-physique",
      frequency: 3,
    }),
    exercises,
  );
  const day = draft.days[1]!;
  assert.equal(day.roles[0], "pull");
  const lead = day.exercises[0]!;
  assert.equal(lead.exerciseId, "lat-pulldown");
  assert.ok(
    lead.rest >= 180 && lead.reps <= 8,
    "back work is the heavy anchor",
  );
});

test("saved earlier-engine plans and logged targets are not regenerated on load or edits", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, legacyPath(pathPreferences(), exercises));
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
    assert.equal(savedDraft(r, pathPrograms(r)[0]!).engineVersion, 1);
    assert.deepEqual(r.workoutExercises(workout.id), targets);
  } finally {
    db.close();
  }
});
