import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import {
  generatePath,
  validateDraft,
  type PathDraft,
} from "../src/domain/paths/generator";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import { exerciseStimulus } from "../src/domain/paths/stimulus";
import { sessionSetCap, weeklyMuscleCap } from "../src/domain/paths/volume";
import { auditWeek } from "../src/domain/paths/weekAudit";
import { pathPreferencesSchema } from "../src/domain/paths/model";
import type { PathPreferences } from "../src/domain/paths/model";
import { pathPreferences } from "./path-fixture";

// Shared guarantees every generated plan must satisfy.
function assertInvariants(draft: PathDraft, p: PathPreferences) {
  const perExerciseCap =
    p.experience === "Beginner" || p.pathKey === "start-strong" ? 3 : 5;
  const weekly: Record<string, number> = {};
  assert.deepEqual(auditWeek(draft.days), [], "balanced training week");
  for (const day of draft.days) {
    const total = day.exercises.reduce((n, e) => n + e.sets, 0);
    assert.ok(total <= sessionSetCap(p), `${day.name}: session set cap`);
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
  assert.equal(draft.engineVersion, 7);
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

test("scenario: advanced strength keeps heavy fives, not hypertrophy reps", () => {
  const p = pathPreferences({
    pathKey: "get-strong",
    experience: "Advanced",
    frequency: 3,
  });
  const draft = generatePath(p, exercises);
  assertInvariants(draft, p);
  for (const d of draft.days) {
    const primary = d.exercises.slice(0, 2);
    assert.ok(primary.every((e) => e.reps === 5 && e.rest === 180));
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
