import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { forgePaths } from "../src/domain/paths/catalog";
import { generatePath, validateDraft } from "../src/domain/paths/generator";
import { auditWeek, MAX_EXERCISE_SPREAD } from "../src/domain/paths/weekAudit";
import { workloadReview } from "../src/domain/paths/review";
import type { PathDay } from "../src/domain/paths/generator";
import type { PathPreferences } from "../src/domain/paths/model";
import { equipmentOptions } from "../src/domain/paths/model";
import {
  acceptPath,
  editPathDay,
  pathPrograms,
  pathSessions,
  savedDraft,
  startPathSession,
  workloadGuidance,
} from "../src/data/paths";
import { pathPreferences, pathRepository } from "./path-fixture";

const experiences = ["Beginner", "Intermediate", "Advanced"] as const;
const kits: Record<string, PathPreferences["equipment"]> = {
  "full gym": [...equipmentOptions],
  "dumbbells & bench": ["Dumbbell", "Bench"],
  "dumbbells & pull-up bar": ["Dumbbell", "Pull-up bar"],
  "bands only": ["Resistance band", "Band anchor"],
  bodyweight: [],
};

function day(key: string, ids: string[], sets = 3, reps = 10, rest = 90) {
  return {
    key,
    name: key,
    offset: 0,
    roles: ids.map(() => "push" as const),
    exercises: ids.map((exerciseId) => ({
      exerciseId,
      sets,
      reps,
      weight: 0,
      rest,
    })),
  } satisfies PathDay;
}
const upper = [
  "dumbbell-bench-press",
  "seated-cable-row",
  "lat-pulldown",
  "dumbbell-lateral-raise",
  "dumbbell-curl",
  "triceps-rope-pushdown",
  "bent-over-reverse-fly",
  "standing-cable-fly",
];

// --- Reusable week audit ------------------------------------------------------

test("audit flags a day with twice the exercises of another (4 vs 8)", () => {
  const week = [
    day("Mon", upper.slice(0, 4)),
    day("Tue", upper.slice(0, 5)),
    day("Wed", upper.slice(0, 4)),
    day("Thu", upper.slice(0, 8)),
    day("Fri", upper.slice(0, 5)),
  ];
  const issues = auditWeek(week);
  assert.ok(issues.some((i) => i.kind === "exercise-ratio"));
  assert.deepEqual(issues.find((i) => i.kind === "exercise-ratio")!.dayKeys, [
    "Thu",
    "Mon",
  ]);
});

test("audit accepts a 5/6/5/6/5 week", () => {
  const week = [5, 6, 5, 6, 5].map((n, i) => day(`d${i}`, upper.slice(0, n)));
  assert.deepEqual(auditWeek(week), []);
});

test("audit flags exercise spreads beyond two even below the 2x ratio", () => {
  const week = [day("a", upper.slice(0, 5)), day("b", upper.slice(0, 8))];
  assert.equal(8 - 5 > MAX_EXERCISE_SPREAD, true);
  assert.deepEqual(
    auditWeek(week).map((i) => i.kind),
    ["exercise-spread"],
  );
});

test("audit flags poorly distributed working-set load and weights heavy compound sets", () => {
  const light = day("light", upper.slice(0, 5), 2);
  const heavy = day("heavy", upper.slice(0, 5), 4);
  assert.ok(auditWeek([light, heavy]).some((i) => i.kind === "volume-ratio"));
  // Three heavy compound sets (x1.5) are not twice four light sets.
  const strength = day(
    "strength",
    ["back-squat", "barbell-bench-press"],
    3,
    5,
    180,
  );
  const assistance = day("assist", ["goblet-squat", "push-up"], 4, 8, 120);
  assert.deepEqual(auditWeek([strength, assistance]), []);
});

test("audit flags excessive same-muscle duplication within a session", () => {
  const chest = day("chest", [
    "barbell-bench-press",
    "dumbbell-bench-press",
    "incline-dumbbell-bench-press",
    "standing-cable-fly",
  ]);
  assert.ok(auditWeek([chest]).some((i) => i.kind === "duplication"));
});

// --- Every Path, experience level, training frequency and equipment kit -------

test("every supported Path × experience × frequency × equipment kit yields a balanced week or explained guidance", () => {
  let generated = 0;
  for (const path of forgePaths)
    for (const experience of experiences)
      for (let frequency = path.minDays; frequency <= path.maxDays; frequency++)
        for (const [kit, equipment] of Object.entries(kits)) {
          const label = `${path.key} ${experience} ${frequency}d ${kit}`;
          const p = pathPreferences({
            pathKey: path.key,
            experience,
            frequency,
            equipment,
            gymAccess: kit === "full gym",
          });
          if (path.key === "advanced-physique" && experience === "Beginner") {
            assert.throws(() => generatePath(p, exercises), /experienced/);
            continue;
          }
          let draft;
          try {
            draft = generatePath(p, exercises);
          } catch (error) {
            // Only restricted equipment may be unbalanceable, and it is
            // rejected with guidance rather than assigned unbalanced.
            assert.notEqual(kit, "full gym", label);
            assert.match(
              (error as Error).message,
              /will not assign unbalanced training days|need a pulling exercise to stay balanced/,
              label,
            );
            continue;
          }
          generated++;
          assert.equal(draft.engineVersion, 7, label);
          assert.deepEqual(auditWeek(draft.days), [], label);
          const counts = draft.days.map((d) => d.exercises.length);
          assert.ok(
            Math.max(...counts) < 2 * Math.min(...counts),
            `${label}: ${counts}`,
          );
          assert.ok(
            Math.max(...counts) - Math.min(...counts) <= MAX_EXERCISE_SPREAD,
            `${label}: ${counts}`,
          );
          assert.deepEqual(workloadReview(draft, exercises).balance.issues, []);
        }
  assert.ok(generated > 250, `generated ${generated} balanced weeks`);
});

test("the five-day split no longer pairs an eight-exercise day with five-exercise days", () => {
  for (const pathKey of ["build-muscle", "advanced-physique"] as const) {
    const draft = generatePath(
      pathPreferences({ pathKey, frequency: 5, weekdays: [0, 1, 3, 4, 5] }),
      exercises,
    );
    const counts = draft.days.map((d) => d.exercises.length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, String(counts));
  }
});

test("restricted equipment is corrected with planned-slot substitutes, not unrelated filler", () => {
  const draft = generatePath(
    pathPreferences({ frequency: 4, equipment: ["Dumbbell", "Bench"] }),
    exercises,
  );
  assert.deepEqual(auditWeek(draft.days), []);
  for (const d of draft.days)
    assert.equal(
      new Set(d.exercises.map((e) => e.exerciseId)).size,
      d.exercises.length,
    );
  // The lower-body days stay lower-body: no upper-body work is used as filler.
  for (const d of draft.days.filter((d) => d.roles.includes("squat")))
    assert.ok(
      d.roles.every((r) => ["squat", "posterior", "calf", "core"].includes(r)),
      d.roles.join(","),
    );
});

test("a no-equipment week that cannot be balanced names working frequencies and affordable pulling equipment", () => {
  const message = (p: Partial<PathPreferences>) => {
    try {
      generatePath(
        pathPreferences({ equipment: [], gymAccess: false, ...p }),
        exercises,
      );
    } catch (error) {
      return (error as Error).message;
    }
    assert.fail("expected the unbalanceable week to be rejected");
  };
  assert.equal(
    message({ frequency: 5 }),
    "Your upper-body days need a pulling exercise to stay balanced, and none is possible with your current equipment and exclusions. Choose 2, 3 or 4 training days, or add a resistance band with a door anchor or a doorway pull-up bar to train 5 days a week.",
  );
  // Pull-ups are not unlocked for beginners, so only the band is suggested.
  assert.match(
    message({ frequency: 6, experience: "Beginner" }),
    /add a resistance band with a door anchor to train 6 days a week\.$/,
  );
  // Every suggested fix really does produce a balanced week.
  for (const equipment of [
    ["Resistance band", "Band anchor"],
    ["Pull-up bar"],
  ] as PathPreferences["equipment"][])
    assert.deepEqual(
      auditWeek(
        generatePath(
          pathPreferences({ frequency: 5, equipment, gymAccess: false }),
          exercises,
        ).days,
      ),
      [],
    );
});

// --- Enforcement --------------------------------------------------------------

test("an unbalanced current-engine program cannot be validated, assigned or saved by an edit", () => {
  const draft = generatePath(pathPreferences(), exercises);
  const unbalanced = {
    ...draft,
    days: draft.days.map((d, i) =>
      i === 1
        ? {
            ...d,
            roles: d.roles.slice(0, 3),
            exercises: d.exercises.slice(0, 3),
          }
        : d,
    ),
  };
  assert.throws(() => validateDraft(unbalanced, exercises), /twice as many/);
  const { r, db } = pathRepository();
  try {
    assert.throws(() => acceptPath(r, unbalanced), /twice as many/);
    assert.equal(pathPrograms(r).length, 0);
    acceptPath(r, draft);
    const program = pathPrograms(r)[0]!;
    const items = savedDraft(r, program).days[0]!.exercises.map((e) => ({
      ...e,
      sets: 1,
    }));
    assert.throws(
      () => editPathDay(r, program.record.id, 0, items),
      /working-set load/,
    );
  } finally {
    db.close();
  }
});

test("saved earlier-engine plans stay usable and are flagged for a rebuild, with history intact", () => {
  const { r, db } = pathRepository();
  try {
    const draft = generatePath(pathPreferences(), exercises);
    const old = {
      ...draft,
      engineVersion: 6 as const,
      days: draft.days.map((d, i) =>
        i === 1
          ? {
              ...d,
              roles: d.roles.slice(0, 3),
              exercises: d.exercises.slice(0, 3),
            }
          : d,
      ),
    };
    acceptPath(r, old);
    const program = pathPrograms(r)[0]!;
    assert.equal(program.data.engineVersion, 6);
    const workout = startPathSession(r, pathSessions(r, program)[0]!.record.id);
    r.editSet(r.workoutSets(workout.id)[0]!.id, { reps: 8, completed: true });
    r.finishWorkout(workout.id);
    assert.ok(
      auditWeek(savedDraft(r, program).days).some(
        (i) => i.kind === "exercise-ratio",
      ),
    );
    acceptPath(r, generatePath(pathPreferences(), exercises), true);
    assert.equal(r.workout(workout.id)!.status, "completed");
    assert.equal(pathPrograms(r).length, 2);
  } finally {
    db.close();
  }
});

// --- Experience-level guidance ------------------------------------------------

function complete(
  r: ReturnType<typeof pathRepository>["r"],
  sessionId: string,
  all: boolean,
) {
  const workout = startPathSession(r, sessionId);
  const rows = r.workoutExercises(workout.id);
  for (const [index, row] of rows.entries())
    for (const set of r.sets(row.id))
      if (all || (index === 0 && set.position === 0))
        r.editSet(set.id, { reps: 20, completed: true });
  r.finishWorkout(workout.id);
}

test("consistent workload shortfalls suggest, but never apply, a lower experience level", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
    let program = pathPrograms(r)[0]!;
    const sessions = pathSessions(r, program);
    for (const s of sessions.slice(0, 2)) complete(r, s.record.id, false);
    assert.equal(workloadGuidance(r, program), undefined);
    complete(r, sessions[2]!.record.id, false);
    const guidance = workloadGuidance(r, program)!;
    assert.equal(guidance.suggested, "Beginner");
    assert.match(guidance.message, /will not change your level automatically/);
    program = pathPrograms(r)[0]!;
    assert.equal(program.data.preferences.experience, "Intermediate");
  } finally {
    db.close();
  }
});

test("completing the prescribed workload produces no downgrade suggestion", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(
      r,
      generatePath(pathPreferences({ experience: "Advanced" }), exercises),
    );
    const program = pathPrograms(r)[0]!;
    for (const s of pathSessions(r, program).slice(0, 4))
      complete(r, s.record.id, true);
    assert.equal(workloadGuidance(r, program), undefined);
  } finally {
    db.close();
  }
});
