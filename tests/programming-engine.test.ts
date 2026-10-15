import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import {
  generatePath,
  estimatedMinutes,
  validateDraft,
  type PathDraft,
} from "../src/domain/paths/generator";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import {
  estimateSession,
  durationRangeLabel,
} from "../src/domain/paths/duration";
import { exerciseStimulus } from "../src/domain/paths/stimulus";
import { sessionSetCap, weeklyMuscleCap } from "../src/domain/paths/volume";
import { forgePaths } from "../src/domain/paths/catalog";
import type { PathPreferences } from "../src/domain/paths/model";
import { pathPreferences } from "./path-fixture";

const pres = (
  exerciseId: string,
  sets: number,
  reps: number,
  rest: number,
) => ({
  exerciseId,
  sets,
  reps,
  weight: 0,
  rest,
});

// Shared guarantees every generated plan must satisfy.
function assertInvariants(draft: PathDraft, p: PathPreferences) {
  const perExerciseCap =
    p.experience === "Beginner" || p.pathKey === "start-strong" ? 3 : 5;
  const weekly: Record<string, number> = {};
  for (const day of draft.days) {
    const total = day.exercises.reduce((n, e) => n + e.sets, 0);
    assert.ok(total <= sessionSetCap(p), `${day.name}: session set cap`);
    assert.ok(
      estimatedMinutes(day.exercises, exercises) <= p.duration,
      `${day.name}: fits requested duration`,
    );
    for (const item of day.exercises) {
      const ex = exercises.find((e) => e.id === item.exerciseId)!;
      assert.ok(
        item.sets >= 1 && item.sets <= perExerciseCap,
        `${item.exerciseId}: per-exercise set cap`,
      );
      assert.ok(
        !p.excluded.includes(item.exerciseId),
        `${item.exerciseId}: excluded exercise not reintroduced`,
      );
      assert.ok(
        !p.avoidPatterns.includes(
          ex.pattern as (typeof p.avoidPatterns)[number],
        ),
        `${item.exerciseId}: avoided pattern not reintroduced`,
      );
      // Weekly volume is bounded by each movement's primary target muscle.
      const muscle = exerciseStimulus(item.exerciseId).direct[0];
      if (muscle) weekly[muscle] = (weekly[muscle] ?? 0) + item.sets;
    }
  }
  for (const [muscle, sets] of Object.entries(weekly))
    assert.ok(
      sets <= weeklyMuscleCap(p, muscle),
      `${muscle}: weekly direct-set ceiling (${sets})`,
    );
}

// --- Duration engine ---------------------------------------------------------

test("duration model: empty session is zero and ranges are ordered", () => {
  assert.deepEqual(estimateSession([], exercises), {
    low: 0,
    expected: 0,
    high: 0,
  });
  const e = estimateSession(
    [pres("barbell-bench-press", 3, 8, 120)],
    exercises,
  );
  assert.ok(e.low <= e.expected && e.expected <= e.high && e.low > 0);
});

test("duration model: more sets and more rest both cost more time", () => {
  const base = estimateSession(
    [pres("dumbbell-lateral-raise", 2, 12, 75)],
    exercises,
  ).expected;
  const moreSets = estimateSession(
    [pres("dumbbell-lateral-raise", 4, 12, 75)],
    exercises,
  ).expected;
  const moreRest = estimateSession(
    [pres("dumbbell-lateral-raise", 2, 12, 180)],
    exercises,
  ).expected;
  assert.ok(moreSets > base);
  assert.ok(moreRest > base);
});

test("duration model: a heavy compound costs ramp-up an isolation does not", () => {
  const compound = estimateSession(
    [pres("barbell-bench-press", 3, 8, 120)],
    exercises,
  ).expected;
  const isolation = estimateSession(
    [pres("dumbbell-lateral-raise", 3, 8, 120)],
    exercises,
  ).expected;
  assert.ok(compound > isolation);
});

// --- Mandatory scenarios (mapped to Forge's Path model) ----------------------

test("scenario: beginner 30-minute full-body stays manageable and unpadded", () => {
  const p = pathPreferences({
    pathKey: "start-strong",
    experience: "Beginner",
    frequency: 3,
    duration: 30,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  // Beginners are not volume-filled: every exercise keeps its foundation dose.
  assert.ok(draft.days.every((d) => d.exercises.every((e) => e.sets <= 3)));
});

test("scenario: intermediate hypertrophy fills toward longer targets up to a cap", () => {
  const short = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 60 }),
    exercises,
  );
  const long = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 90 }),
    exercises,
  );
  const sets = (d: PathDraft) =>
    d.days.reduce(
      (n, day) => n + day.exercises.reduce((m, e) => m + e.sets, 0),
      0,
    );
  assert.ok(sets(long) >= sets(short));
  assertInvariants(long, long.preferences);
});

test("scenario: advanced 90-minute hypertrophy is volume-capped, not padded to 90", () => {
  const p = pathPreferences({
    pathKey: "advanced-physique",
    experience: "Advanced",
    frequency: 5,
    duration: 90,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  // A productive cap means sessions land well under 90 rather than being padded.
  assert.ok(
    draft.days.every(
      (d) => estimateSession(d.exercises, exercises).expected < 85,
    ),
  );
});

test("scenario: advanced 90-minute strength keeps heavy fives, not hypertrophy reps", () => {
  const p = pathPreferences({
    pathKey: "get-strong",
    experience: "Advanced",
    frequency: 3,
    duration: 90,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  for (const d of draft.days) {
    const primary = d.exercises.slice(0, 2);
    assert.ok(primary.every((e) => e.reps === 5 && e.rest === 180));
  }
});

test("scenario: beyond the goal volume cap, extra time adds no junk", () => {
  const seventyFive = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 75 }),
    exercises,
  );
  const ninety = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 90 }),
    exercises,
  );
  // Both already reach the goal volume cap, so more time changes nothing.
  assert.deepEqual(ninety.days, seventyFive.days);
});

test("scenario: limited home equipment adapts without barbells or excluded gear", () => {
  const p = pathPreferences({
    pathKey: "build-muscle",
    frequency: 3,
    duration: 60,
    equipment: ["Dumbbell", "Bench", "Pull-up bar"],
    style: "Free weights",
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  for (const day of draft.days)
    for (const item of day.exercises) {
      const ex = exercises.find((e) => e.id === item.exerciseId)!;
      assert.ok(
        !/barbell/i.test(ex.equipment),
        `${item.exerciseId} needs no barbell`,
      );
    }
});

test("scenario: excluding a primary pattern omits it rather than forcing it back", () => {
  const p = pathPreferences({
    pathKey: "build-muscle",
    frequency: 4,
    duration: 75,
    avoidPatterns: ["horizontal push"],
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  for (const day of draft.days)
    for (const item of day.exercises)
      assert.notEqual(
        exercises.find((e) => e.id === item.exerciseId)!.pattern,
        "horizontal push",
      );
});

test("scenario: high-frequency hypertrophy respects weekly per-muscle ceilings", () => {
  const p = pathPreferences({
    pathKey: "build-muscle",
    experience: "Advanced",
    frequency: 6,
    duration: 75,
  });
  const draft = generatePath(p, exercises);
  assert.equal(draft.days.length, 6);
  // assertInvariants verifies no primary muscle exceeds its weekly ceiling.
  assertInvariants(draft, p);
});

test("scenario: a request that cannot be met productively is explained, not cut", () => {
  assert.throws(
    () =>
      generatePath(
        pathPreferences({
          pathKey: "build-muscle",
          frequency: 4,
          duration: 30,
        }),
        exercises,
      ),
    /will not silently cut/,
  );
});

test("scenario: regenerating with more time yields at least as much volume", () => {
  const sets = (d: PathDraft) =>
    d.days.reduce(
      (n, day) => n + day.exercises.reduce((m, e) => m + e.sets, 0),
      0,
    );
  const tight = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 55 }),
    exercises,
  );
  const roomy = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 90 }),
    exercises,
  );
  assert.ok(sets(roomy) > sets(tight));
});

test("scenario: saved older-version plans still validate", () => {
  const legacy = legacyPath(pathPreferences(), exercises);
  assert.ok((legacy.engineVersion ?? 1) === 1);
  assert.doesNotThrow(() => validateDraft(legacy, exercises));
});

// --- Invariants across the configuration space -------------------------------

test("invariant: every duration either fits or is explained, never mislabelled", () => {
  for (const duration of [30, 45, 60, 75, 90]) {
    const p = pathPreferences({
      pathKey: "build-muscle",
      frequency: 4,
      duration,
    });
    try {
      const draft = generatePath(p, exercises);
      assertInvariants(draft, p);
    } catch (e) {
      assert.match((e as Error).message, /will not silently cut|needs about/);
    }
  }
});

test("invariant: generation is deterministic", () => {
  const p = pathPreferences({
    pathKey: "advanced-physique",
    experience: "Advanced",
    frequency: 5,
    duration: 90,
  });
  assert.deepEqual(generatePath(p, exercises), generatePath(p, exercises));
});

// --- Budget enforcement: duration is a ceiling, quality over filling ---------
// Forge treats the selected duration primarily as a time budget (never exceed)
// and only secondarily as a fill target. These regressions guard against a
// generator ever emitting a session that substantially exceeds the user's
// available time, and against padding a generous budget with junk volume.

function prefsForPath(
  path: (typeof forgePaths)[number],
  duration: number,
): PathPreferences {
  return pathPreferences({
    pathKey: path.key,
    experience: path.key === "advanced-physique" ? "Advanced" : "Intermediate",
    frequency: path.frequency,
    duration,
  });
}

test("budget enforcement: no generated session ever exceeds the requested time budget", () => {
  for (const path of forgePaths) {
    for (const duration of [30, 45, 60, 75, 90]) {
      let draft: PathDraft;
      try {
        draft = generatePath(prefsForPath(path, duration), exercises);
      } catch (e) {
        // A plan that cannot fit the budget is explained, never emitted at a
        // length that exceeds the user's available time.
        assert.match((e as Error).message, /will not silently cut/);
        continue;
      }
      for (const day of draft.days) {
        const est = estimateSession(day.exercises, exercises);
        assert.ok(
          est.expected <= duration,
          `${path.key} ${duration}min: ${day.name} expected ${est.expected}`,
        );
        // Even the unhurried high end stays within the modelled spread of the
        // budget, so a session never realistically balloons past the budget.
        assert.ok(
          est.high <= Math.ceil(duration * 1.2),
          `${path.key} ${duration}min: ${day.name} high ${est.high}`,
        );
      }
    }
  }
});

test("budget enforcement: a 30-minute request never yields a double-length session", () => {
  // Volume-led paths cannot fit 30 minutes, so they are explained rather than
  // emitted at roughly double the budget.
  for (const key of [
    "build-muscle",
    "advanced-physique",
    "get-strong",
  ] as const) {
    const path = forgePaths.find((p) => p.key === key)!;
    assert.throws(
      () => generatePath(prefsForPath(path, 30), exercises),
      /will not silently cut/,
    );
  }
});

test("quality over filling: a generous budget yields a shorter productive session, not padding", () => {
  // Build Muscle at 90 minutes lands well under the budget: surplus time is
  // left unused rather than filled with junk volume to reach the target.
  const draft = generatePath(
    pathPreferences({ pathKey: "build-muscle", frequency: 4, duration: 90 }),
    exercises,
  );
  for (const day of draft.days) {
    const est = estimateSession(day.exercises, exercises);
    assert.ok(est.expected <= 90);
    assert.ok(
      est.expected < 75,
      `session padded past productive length: ${est.expected}`,
    );
  }
});

test("duration display: the label reflects the computed range honestly", () => {
  const items = [
    pres("barbell-bench-press", 3, 8, 120),
    pres("dumbbell-lateral-raise", 3, 12, 75),
  ];
  const { low, high } = estimateSession(items, exercises);
  assert.equal(durationRangeLabel(items, exercises), `${low}–${high} min`);
  // An empty session collapses to a single honest value, not a fake range.
  assert.equal(durationRangeLabel([], exercises), "0 min");
});
