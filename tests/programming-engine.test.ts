import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import {
  ENGINE_VERSION,
  generatePath,
  validateDraft,
  type PathDraft,
} from "../src/domain/paths/generator";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import {
  directSets,
  generationCeiling,
  maxSetsPerExercise,
  muscleLoad,
  SECONDARY_WEIGHT,
  secondarySets,
  sessionExerciseCap,
  weeklyVolumeTarget,
} from "../src/domain/paths/policy";
import {
  assessProgram,
  programErrors,
} from "../src/domain/paths/programQuality";
import { auditWeek } from "../src/domain/paths/weekAudit";
import { pathPreferencesSchema } from "../src/domain/paths/model";
import type { PathPreferences } from "../src/domain/paths/model";
import { pathPreferences } from "./path-fixture";

// Shared guarantees every generated plan must satisfy.
function assertInvariants(draft: PathDraft, p: PathPreferences) {
  assert.deepEqual(auditWeek(draft.days), [], "balanced training week");
  assert.deepEqual(
    programErrors(assessProgram(draft, exercises)),
    [],
    "program-quality errors",
  );
  for (const day of draft.days) {
    assert.ok(
      day.exercises.length <= sessionExerciseCap(p),
      `${day.name}: exercise count`,
    );
    for (const item of day.exercises) {
      const ex = exercises.find((e) => e.id === item.exerciseId)!;
      assert.ok(
        item.sets >= 1 && item.sets <= maxSetsPerExercise(p, true),
        `${item.exerciseId}: generated set limit`,
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
    }
  }
  for (const [muscle, sets] of Object.entries(
    directSets(draft.days.flatMap((d) => d.exercises)),
  ))
    assert.ok(
      sets <= weeklyVolumeTarget(p, muscle).max,
      `${muscle}: weekly ceiling (${sets})`,
    );
}

// --- Time limits are gone -----------------------------------------------------

test("preferences no longer carry a session duration; legacy values are dropped on parse", () => {
  const parsed = pathPreferencesSchema.parse({
    ...pathPreferences(),
    duration: 30,
  });
  assert.equal("duration" in parsed, false);
  const draft = generatePath(
    { ...pathPreferences(), duration: 30 } as PathPreferences,
    exercises,
  );
  assert.equal("duration" in draft.preferences, false);
  assert.equal(draft.engineVersion, ENGINE_VERSION);
});

test("volume-led Paths that once failed a short time budget now generate full sessions", () => {
  for (const pathKey of [
    "build-muscle",
    "advanced-physique",
    "get-strong",
  ] as const) {
    const p = pathPreferences({ pathKey, frequency: 4 });
    assertInvariants(generatePath(p, exercises), p);
  }
});

// --- Volume accounting --------------------------------------------------------

test("direct sets exclude secondary involvement, which only feeds the load estimate", () => {
  const items = [
    { exerciseId: "back-squat", sets: 3 },
    { exerciseId: "bodyweight-glute-bridge", sets: 2 },
  ];
  assert.deepEqual(directSets(items), { Quads: 3, Glutes: 2 });
  assert.deepEqual(secondarySets(items), { Glutes: 3 });
  assert.equal(muscleLoad(items).Glutes, 2 + 3 * SECONDARY_WEIGHT);
});

test("weekly floors account for training frequency; defaults stay at or below the default ceiling", () => {
  const split = pathPreferences({ frequency: 4 });
  const fullBody = pathPreferences({ frequency: 3, experience: "Advanced" });
  // Three full-body exposures hold about nine direct sets, not five-day volume.
  assert.equal(weeklyVolumeTarget(fullBody, "Chest", 3).min, 9);
  assert.equal(weeklyVolumeTarget(split, "Chest", 2).min, 10);
  for (const [pathKey, experience, frequency] of [
    ["build-muscle", "Intermediate", 4],
    ["advanced-physique", "Intermediate", 6],
    ["advanced-physique", "Advanced", 5],
  ] as const) {
    const p = pathPreferences({ pathKey, experience, frequency });
    const draft = generatePath(p, exercises);
    for (const [muscle, load] of Object.entries(
      muscleLoad(draft.days.flatMap((d) => d.exercises)),
    ))
      assert.ok(
        load <= generationCeiling(p, muscle),
        `${pathKey} ${experience} ${frequency}d ${muscle} ${load}`,
      );
  }
});

// --- Mandatory scenarios (mapped to Forge's Path model) ----------------------

test("scenario: beginner full-body stays manageable and unpadded", () => {
  const p = pathPreferences({
    pathKey: "start-strong",
    experience: "Beginner",
    frequency: 3,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  // Beginners are not volume-filled: every exercise keeps its foundation dose.
  assert.ok(draft.days.every((d) => d.exercises.every((e) => e.sets <= 3)));
});

test("scenario: experienced hypertrophy is volume-capped by goal, not by time", () => {
  const p = pathPreferences({
    pathKey: "advanced-physique",
    experience: "Advanced",
    frequency: 5,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
});

test("scenario: advanced strength keeps heavy low-rep main lifts with long rests, not hypertrophy reps", () => {
  const p = pathPreferences({
    pathKey: "get-strong",
    experience: "Advanced",
    frequency: 3,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  for (const d of draft.days) {
    const primary = d.exercises.slice(0, 2);
    assert.ok(
      primary.every(
        (e) => (e.repMax ?? e.reps) <= 6 && e.rest >= 210 && e.sets <= 4,
      ),
      d.name,
    );
    // Non-hinge main lifts keep their exact heavy range (regression: the RDL
    // five-rep floor once widened every main lift to 3-6).
    for (const e of primary)
      if (exercises.find((x) => x.id === e.exerciseId)!.pattern !== "hinge")
        assert.deepEqual([e.reps, e.repMax], [3, 5], e.exerciseId);
      else assert.deepEqual([e.reps, e.repMax], [5, 6], e.exerciseId);
  }
});

test("scenario: limited home equipment adapts without barbells or excluded gear", () => {
  const p = pathPreferences({
    pathKey: "build-muscle",
    frequency: 3,
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
  });
  const draft = generatePath(p, exercises);
  assert.equal(draft.days.length, 6);
  // assertInvariants verifies no primary muscle exceeds its weekly ceiling.
  assertInvariants(draft, p);
});

test("scenario: saved older-version plans still validate", () => {
  const legacy = legacyPath(pathPreferences(), exercises);
  assert.ok((legacy.engineVersion ?? 1) === 1);
  assert.doesNotThrow(() => validateDraft(legacy, exercises));
});

test("invariant: generation is deterministic", () => {
  const p = pathPreferences({
    pathKey: "advanced-physique",
    experience: "Advanced",
    frequency: 5,
  });
  assert.deepEqual(generatePath(p, exercises), generatePath(p, exercises));
});
