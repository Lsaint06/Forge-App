import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import {
  ENGINE_VERSION,
  generatePath,
  validateDraft,
  type PathDraft,
} from "../src/domain/paths/generator";
import {
  forgePaths,
  menuMovement,
  movementMenu,
} from "../src/domain/paths/catalog";
import { exerciseStimulus } from "../src/domain/paths/stimulus";
import { assessProgram } from "../src/domain/paths/programQuality";
import {
  acceptPath,
  editPathDay,
  pathPrograms,
  pathSessions,
  savedDraft,
  startPathSession,
} from "../src/data/paths";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import type { PathPreferences } from "../src/domain/paths/model";
import { pathPreferences, pathRepository } from "./path-fixture";

const levels = ["Beginner", "Intermediate", "Advanced"] as const;
const ids = (draft: PathDraft) =>
  draft.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
const daysWith = (draft: PathDraft, id: string) =>
  draft.days.filter((d) => d.exercises.some((e) => e.exerciseId === id)).length;
const kindOf = (id: string) => menuMovement(id)?.kind;
const hypertrophy = (
  patch: Partial<PathPreferences> = {},
  each: (draft: PathDraft, label: string) => void,
) => {
  for (const pathKey of ["build-muscle", "advanced-physique"] as const)
    for (const experience of levels)
      for (let frequency = 3; frequency <= 6; frequency++) {
        if (pathKey === "advanced-physique" && experience === "Beginner")
          continue;
        const label = `${pathKey} ${experience} ${frequency}d`;
        each(
          generatePath(
            pathPreferences({ pathKey, experience, frequency, ...patch }),
            exercises,
          ),
          label,
        );
      }
};

test("the reviewed movement library covers each training family with valid catalog entries", () => {
  assert.ok(movementMenu.length >= 100);
  assert.equal(
    new Set(movementMenu.map((m) => m.id)).size,
    movementMenu.length,
  );
  for (const m of movementMenu) {
    const e = exercises.find((x) => x.id === m.id);
    assert.ok(e, m.id);
    assert.equal(e.category, "strength", m.id);
    assert.notEqual(e.difficulty, "Advanced", m.id);
    const s = exerciseStimulus(m.id);
    assert.ok(s.reviewed && s.direct.length > 0, m.id);
  }
  const kinds = new Set(movementMenu.map((m) => m.kind));
  for (const kind of [
    "incline-press",
    "fly",
    "lat-isolation",
    "curl-lengthened",
    "curl-supported",
    "triceps-lying",
    "deadlift",
    "hip-thrust",
    "calf-bent-knee",
    "core-flexion",
  ] as const)
    assert.ok(kinds.has(kind), kind);
  // Corrected catalog labels drive balance and coverage.
  const find = (id: string) => exercises.find((e) => e.id === id)!;
  assert.equal(find("machine-lat-pulldown").pattern, "vertical pull");
  assert.equal(find("reverse-pec-deck").muscle, "Shoulders");
  assert.equal(find("machine-shoulder-press").pattern, "vertical push");
  assert.deepEqual(exerciseStimulus("reverse-pec-deck").direct, ["Rear delts"]);
});

test("full-gym plans draw on a broad pool and generate at engine 9 without errors", () => {
  const used = new Set<string>();
  for (const path of forgePaths)
    for (const experience of levels)
      for (
        let frequency = path.minDays;
        frequency <= path.maxDays;
        frequency++
      ) {
        if (path.key === "advanced-physique" && experience === "Beginner")
          continue;
        const draft = generatePath(
          pathPreferences({ pathKey: path.key, experience, frequency }),
          exercises,
        );
        assert.equal(draft.engineVersion, ENGINE_VERSION);
        assert.deepEqual(
          assessProgram(draft, exercises).filter((f) => f.severity === "error"),
          [],
        );
        ids(draft).forEach((id) => used.add(id));
      }
  assert.ok(used.size >= 45, `${used.size} distinct movements`);
});

test("hypertrophy exercise counts scale with experience instead of padding beginners", () => {
  for (const pathKey of ["build-muscle", "advanced-physique"] as const)
    for (const frequency of [4, 5, 6]) {
      const mean = (experience: (typeof levels)[number]) => {
        const d = generatePath(
          pathPreferences({ pathKey, experience, frequency }),
          exercises,
        );
        return (
          d.days.reduce((n, day) => n + day.exercises.length, 0) / d.days.length
        );
      };
      const intermediate = mean("Intermediate");
      const advanced = mean("Advanced");
      assert.ok(intermediate >= 6, `${pathKey} ${frequency}d I`);
      assert.ok(advanced >= 7, `${pathKey} ${frequency}d A`);
      assert.ok(advanced > intermediate, `${pathKey} ${frequency}d`);
      if (pathKey === "build-muscle")
        assert.ok(mean("Beginner") <= 6, `${frequency}d B`);
    }
});

test("accessory work rotates across the week rather than repeating one exercise", () => {
  hypertrophy({}, (draft, label) => {
    // The generic dumbbell curl and the dead bug no longer appear every day.
    assert.ok(daysWith(draft, "dumbbell-curl") <= 1, label);
    assert.ok(daysWith(draft, "dead-bug") <= 1, label);
    // A Romanian deadlift is not repeated; the second hinge is a variation.
    assert.ok(daysWith(draft, "romanian-deadlift") <= 1, label);
    // Two biceps exercises on a day are different movement families.
    for (const day of draft.days) {
      const curls = day.exercises
        .map((e) => e.exerciseId)
        .filter((id) => menuMovement(id)?.role === "biceps");
      assert.equal(new Set(curls.map(kindOf)).size, curls.length, label);
    }
  });
});

test("advanced pull days specialise: vertical pull, row, lat work, rear delts and two curl types", () => {
  for (const frequency of [5, 6]) {
    const draft = generatePath(
      pathPreferences({
        pathKey: "advanced-physique",
        experience: "Advanced",
        frequency,
      }),
      exercises,
    );
    const pull = draft.days.find((d) => /Back, rear delts/.test(d.name))!;
    const kinds = pull.exercises.map((e) => kindOf(e.exerciseId));
    for (const kind of ["vertical-pull", "row", "lat-isolation", "rear-delt"])
      assert.ok(kinds.includes(kind as never), `${frequency}d ${kind}`);
    const curls = pull.exercises.filter(
      (e) => menuMovement(e.exerciseId)?.role === "biceps",
    );
    assert.equal(curls.length, 2);
    assert.ok(!kinds.includes("core-stability"));
    const back = pull.exercises.filter(
      (e) => exerciseStimulus(e.exerciseId).direct[0] === "Back",
    );
    assert.ok(back.length <= 3);
  }
});

test("Advanced Physique keeps every trained muscle, including quads, in range", () => {
  for (const experience of ["Intermediate", "Advanced"] as const)
    for (let frequency = 3; frequency <= 6; frequency++) {
      const draft = generatePath(
        pathPreferences({
          pathKey: "advanced-physique",
          experience,
          frequency,
        }),
        exercises,
      );
      const low = assessProgram(draft, exercises).filter(
        (f) => f.code === "weekly-volume-low",
      );
      assert.deepEqual(low, [], `${experience} ${frequency}d`);
      assert.ok(
        draft.days.some((d) =>
          d.exercises.some(
            (e) => exerciseStimulus(e.exerciseId).direct[0] === "Quads",
          ),
        ),
      );
    }
});

test("generated plans never stack three movements from one family in a session", () => {
  const kits: PathPreferences["equipment"][] = [
    ["Barbell", "Bench", "Squat rack", "Dumbbell", "Pull-up bar"],
    ["Dumbbell", "Bench"],
    ["Dumbbell", "Bench", "Pull-up bar", "Resistance band", "Band anchor"],
  ];
  for (const equipment of kits)
    hypertrophy({ equipment, gymAccess: false }, (draft, label) =>
      assert.deepEqual(
        assessProgram(draft, exercises)
          .filter((f) => f.code === "redundancy")
          .map((f) => f.message),
        [],
        `${label} ${equipment.join("+")}`,
      ),
    );
});

test("a Romanian deadlift is never presented as a deadlift day", () => {
  const strength = (equipment: PathPreferences["equipment"]) =>
    generatePath(
      pathPreferences({ pathKey: "get-strong", frequency: 3, equipment }),
      exercises,
    );
  const barbell = strength([
    "Barbell",
    "Bench",
    "Squat rack",
    "Dumbbell",
    "Pull-up bar",
  ]);
  const deadliftDay = barbell.days.find((d) => /Deadlift/.test(d.name))!;
  assert.equal(deadliftDay.exercises[0]!.exerciseId, "conventional-deadlift");
  const dumbbells = strength(["Dumbbell", "Bench", "Pull-up bar"]);
  assert.ok(dumbbells.days.every((d) => !/deadlift/i.test(d.name)));
  assert.ok(dumbbells.days.some((d) => /Hinge/.test(d.name)));
});

test("restricted equipment never assigns an unloaded drill as an advanced second compound", () => {
  const draft = generatePath(
    pathPreferences({
      experience: "Advanced",
      equipment: ["Dumbbell"],
      gymAccess: false,
    }),
    exercises,
  );
  assert.equal(daysWith(draft, "bodyweight-squat"), 0);
  for (const day of draft.days)
    assert.ok(!/ & .* & /.test(day.name) || day.name.length <= 60, day.name);
});

test("lifters can add, remove and reorder exercises; the plan is judged on its merits", () => {
  const draft = generatePath(pathPreferences(), exercises);
  const day = draft.days[0]!;
  // Reorder the first two, remove the last, add a preacher curl.
  const exercisesOut = [
    day.exercises[1]!,
    day.exercises[0]!,
    ...day.exercises.slice(2, -1),
  ];
  const rolesOut = [day.roles[1]!, day.roles[0]!, ...day.roles.slice(2, -1)];
  exercisesOut.push({
    exerciseId: "dumbbell-preacher-curl",
    sets: 2,
    reps: 10,
    repMax: 15,
    weight: 0,
    rest: 90,
  });
  rolesOut.push("biceps");
  const edited: PathDraft = {
    ...draft,
    days: draft.days.map((d, i) =>
      i ? d : { ...d, exercises: exercisesOut, roles: rolesOut },
    ),
  };
  assert.doesNotThrow(() => validateDraft(edited, exercises));
  // An exercise outside the lifter's equipment is still rejected.
  const blocked: PathDraft = {
    ...edited,
    preferences: { ...edited.preferences, equipment: ["Dumbbell"] },
  };
  assert.throws(() => validateDraft(blocked, exercises));

  const { r, db } = pathRepository();
  try {
    acceptPath(r, draft);
    const program = pathPrograms(r)[0]!;
    editPathDay(r, program.record.id, 0, exercisesOut, rolesOut);
    const saved = savedDraft(r, pathPrograms(r)[0]!);
    assert.deepEqual(saved.days[0]!.roles, rolesOut);
    assert.deepEqual(
      saved.days[0]!.exercises.map((e) => e.exerciseId),
      exercisesOut.map((e) => e.exerciseId),
    );
    const evolution = savedDraft(r, pathPrograms(r)[0]!, 1);
    assert.deepEqual(
      evolution.days[0]!.exercises.map((e) => e.exerciseId),
      exercisesOut.map((e) => e.exerciseId),
    );
    const workout = startPathSession(
      r,
      pathSessions(r, pathPrograms(r)[0]!)[0]!.record.id,
    );
    assert.equal(r.workoutExercises(workout.id).length, exercisesOut.length);
  } finally {
    db.close();
  }
});

test("plans from earlier planners keep their fixed slots", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, legacyPath(pathPreferences(), exercises));
    const program = pathPrograms(r)[0]!;
    const day = savedDraft(r, program).days[0]!;
    assert.throws(
      () =>
        editPathDay(
          r,
          program.record.id,
          0,
          day.exercises.slice(1),
          day.roles.slice(1),
        ),
      /earlier planner/,
    );
  } finally {
    db.close();
  }
});

test("saved engine 8 plans still validate under engine 9", () => {
  const draft = generatePath(pathPreferences(), exercises);
  assert.doesNotThrow(() =>
    validateDraft({ ...draft, engineVersion: 8 }, exercises),
  );
});

test("customization findings flag back-to-back compound work and redundant sessions without blocking", () => {
  const draft = generatePath(pathPreferences({ frequency: 4 }), exercises);
  // Swap the second and third workouts so the two upper days sit together.
  const [a, b, c, d] = draft.days;
  const content = (day: typeof a) => ({
    name: day!.name,
    roles: day!.roles,
    exercises: day!.exercises,
  });
  const swapped: PathDraft = {
    ...draft,
    days: [a!, { ...b!, ...content(c) }, { ...c!, ...content(b) }, d!],
  };
  const findings = assessProgram(swapped, exercises);
  assert.ok(findings.some((f) => f.code === "recovery"));
  assert.ok(
    findings.every((f) => f.code !== "recovery" || f.severity === "warning"),
  );
  assert.doesNotThrow(() => validateDraft(swapped, exercises));

  const presses = ["dumbbell-bench-press", "machine-chest-press", "push-up"];
  const redundant: PathDraft = {
    ...draft,
    days: draft.days.map((day, i) =>
      i
        ? day
        : {
            ...day,
            roles: ["push", "push", "push", "pull"],
            exercises: [
              ...presses.map((exerciseId) => ({
                exerciseId,
                sets: 2,
                reps: 8,
                repMax: 12,
                weight: 0,
                rest: 120,
              })),
              day.exercises.find(
                (e) => menuMovement(e.exerciseId)?.role === "pull",
              )!,
            ],
          },
    ),
  };
  assert.ok(
    assessProgram(redundant, exercises).some((f) => f.code === "redundancy"),
  );
});
