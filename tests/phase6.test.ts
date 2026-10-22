import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { exercises } from "../src/data/catalog";
import { defaults } from "../src/domain/types";
import {
  checkLibrary,
  programFingerprint,
  type CuratedProgram,
} from "../src/domain/programs/model";
import {
  libraryCoverage,
  publicationPlan,
  requiredCombinations,
} from "../src/domain/programs/publication";
import { recommendProgram } from "../src/domain/programs/recommend";
import {
  libraryPrograms,
  programLibrary,
  programLock,
  programSources,
} from "../src/programs";
import { draftPreviewEnabled } from "../src/programs/preview";
import {
  currentPath,
  pathPrograms,
  pathSessions,
  pathSummary,
  pausePath,
  reschedulePathSession,
  resumePath,
  skipPathSession,
  startPathSession,
  visibleSchedules,
} from "../src/data/paths";
import {
  enrollProgram,
  currentEnrollment,
  startProgramSession,
} from "../src/data/programs";
import { legacyBackup, legacyUserRepository } from "./legacy-fixture";

const published = (p: CuratedProgram): CuratedProgram => ({
  ...p,
  status: "published",
});
const allPublished = programLibrary.map(published);
// Everything about a user's history that must survive the upgrade.
const history = (r: ReturnType<typeof legacyUserRepository>["r"]) => {
  const b = r.exportBackup();
  return JSON.stringify({
    workouts: b.workouts,
    workoutExercises: b.workoutExercises,
    sets: b.sets,
    customExercises: b.customExercises,
    favorites: b.favorites,
    measurements: b.journals.filter((j) => j.kind === "measurement"),
  });
};

// ---- Program integrity ------------------------------------------------------

test("all 18 curated programs load with unchanged authored content", () => {
  assert.equal(programSources.length, 18);
  assert.equal(programLibrary.length, 18);
  // Content fingerprints with status normalized, so publication alone never
  // trips this check but any prescription change does.
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
    "forge-muscle-beginner-3-day": "6ccf172fb62c",
    "forge-muscle-beginner-4-day": "216b09006d820",
    "forge-muscle-beginner-5-day": "f89497ee25e8a",
    "forge-muscle-intermediate-3-day": "390e2aee2447e",
    "forge-muscle-intermediate-4-day": "b1665d1c0f5d8",
    "forge-muscle-intermediate-5-day": "1b98f022104a3",
    "forge-muscle-advanced-3-day": "1a7dca5e8525fe",
    "forge-muscle-advanced-4-day": "c2a868e42464e",
    "forge-muscle-advanced-5-day": "110d1ecea11bfe",
  };
  assert.deepEqual(
    Object.fromEntries(
      programLibrary.map((p) => [
        p.id,
        programFingerprint({ ...p, status: "draft" }),
      ]),
    ),
    expected,
  );
});

test("published, the library recommends exactly one program for each of the 18 combinations", () => {
  assert.equal(requiredCombinations.length, 18);
  for (const c of requiredCombinations) {
    const rec = recommendProgram(
      {
        ...defaults,
        experience: c.experience,
        goal: c.goal,
        frequency: c.daysPerWeek,
      },
      allPublished,
    );
    assert.equal(rec.kind, "match");
    if (rec.kind !== "match") continue;
    assert.deepEqual(
      [rec.program.goal, rec.program.experience, rec.program.daysPerWeek],
      [c.goal, c.experience, c.daysPerWeek],
    );
  }
});

// ---- Publication -------------------------------------------------------------

const asDraft = (s: unknown) => ({ ...(s as object), status: "draft" });

test("all 18 programs are published and locked to their fingerprints", () => {
  assert.equal(Object.keys(programLock).length, 18);
  assert.deepEqual(checkLibrary(programSources, programLock, exercises), []);
  for (const p of programLibrary) {
    assert.equal(p.status, "published");
    assert.equal(programLock[`${p.id}@${p.version}`], programFingerprint(p));
  }
  // A published program edited after locking is rejected.
  const edited = programLibrary.map((p, i) =>
    i === 0 ? { ...p, summary: `${p.summary} Edited.` } : p,
  );
  assert.match(
    checkLibrary(edited, programLock, exercises).join(),
    /changed after publishing/,
  );
  // Removing a published version is rejected too.
  assert.match(
    checkLibrary(programSources.slice(1), programLock, exercises).join(),
    /no longer bundled/,
  );
});

test("the committed lock is exactly what the publication procedure produces", () => {
  const plan = publicationPlan(programSources.map(asDraft), {}, exercises);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.publish.length, 18);
  assert.deepEqual(plan.lock, programLock);
  assert.equal(plan.coverage.complete, true);
  // Re-running on the published library is a no-op.
  const again = publicationPlan(programSources, programLock, exercises);
  assert.deepEqual(again.errors, []);
  assert.equal(again.publish.length, 0);
  assert.deepEqual(again.lock, programLock);
});

test("publication is blocked when coverage is incomplete, ambiguous or an id is unknown", () => {
  const drafts = programSources.map(asDraft);
  const partial = publicationPlan(drafts, {}, exercises, [
    "forge-strength-beginner-3-day",
  ]);
  assert.equal(partial.publish.length, 1);
  assert.match(partial.errors.join(), /does not cover/);
  const unknown = publicationPlan(drafts, {}, exercises, [
    "forge-strength-elite-9-day",
  ]);
  assert.match(unknown.errors.join(), /not a bundled program/);
  const duplicate = publicationPlan(
    [...drafts, { ...drafts[0]!, id: "forge-strength-beginner-3-day-b" }],
    {},
    exercises,
  );
  assert.match(duplicate.errors.join(), /More than one published program/);
});

test("production lists and recommends exactly the 18 published programs", () => {
  assert.equal(libraryPrograms().length, 18);
  const coverage = libraryCoverage(programLibrary);
  assert.deepEqual(
    [coverage.complete, coverage.missing, coverage.duplicated],
    [true, [], []],
  );
  assert.equal(draftPreviewEnabled, false);
  assert.equal(programLibrary.filter((p) => p.status === "draft").length, 0);
  for (const c of requiredCombinations) {
    const rec = recommendProgram(
      {
        ...defaults,
        experience: c.experience,
        goal: c.goal,
        frequency: c.daysPerWeek,
      },
      programLibrary,
    );
    assert.equal(rec.kind, "match");
    if (rec.kind !== "match") continue;
    assert.equal(rec.program.status, "published");
    assert.deepEqual(
      [rec.program.goal, rec.program.experience, rec.program.daysPerWeek],
      [c.goal, c.experience, c.daysPerWeek],
    );
  }
});

// ---- Generator retirement -----------------------------------------------------

const root = join(__dirname, "..");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sources(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : [];
  });
}

test("no generator code, route or entry point remains in the app", () => {
  for (const file of [
    "src/domain/paths/generator.ts",
    "src/domain/paths/legacyGenerator.ts",
    "src/domain/paths/versionTwoGenerator.ts",
    "src/domain/paths/catalog.ts",
    "src/domain/paths/policy.ts",
    "src/domain/paths/balance.ts",
    "src/domain/paths/volume.ts",
    "src/domain/paths/stimulus.ts",
    "src/domain/paths/programQuality.ts",
    "src/domain/paths/review.ts",
    "src/domain/paths/weekAudit.ts",
    "src/data/pathBuilder.ts",
    "src/screens/Paths.tsx",
    "src/components/PathPlanEditor.tsx",
    "src/components/PathWorkoutList.tsx",
    "src/programs/activation.ts",
  ])
    assert.equal(existsSync(join(root, file)), false, file);
  const forbidden =
    /generatePath|acceptPath|editPathDay|validateDraft|evolutionDays|legacyGenerator|versionTwoGenerator|domain\/paths\/(generator|catalog|policy|balance|volume|stimulus|programQuality|review|weekAudit)|pathBuilder|PathPlanEditor|PathWorkoutList|screens\/Paths"|Path builder/;
  const offenders = [
    ...sources(join(root, "src")),
    ...sources(join(root, "app")),
  ].filter((file) => forbidden.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
  // /paths only continues or reviews existing Paths.
  assert.match(
    readFileSync(join(root, "app", "paths.tsx"), "utf8"),
    /screens\/LegacyPath/,
  );
  // Only the generated Path record schema and calendar helpers remain.
  assert.deepEqual(readdirSync(join(root, "src", "domain", "paths")).sort(), [
    "calendar.ts",
    "model.ts",
  ]);
});

// ---- Existing users ---------------------------------------------------------

test("an existing user's backup restores with every generated Path readable", () => {
  const { r, db } = legacyUserRepository();
  try {
    assert.equal(r.profile().onboarded, true);
    const paths = pathPrograms(r);
    assert.deepEqual(
      paths.map((p) => [p.data.name, p.data.engineVersion, p.data.status]),
      [
        ["GET STRONG", 9, "active"],
        ["BUILD MUSCLE", 1, "archived"],
      ],
    );
    const active = currentPath(r)!;
    const summary = pathSummary(r, active);
    assert.equal(summary.completed, 3);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.expected, 32);
    const archived = paths.find((p) => p.data.status === "archived")!;
    assert.equal(pathSummary(r, archived).completed, 1);
    // Completed sessions keep their workout links and logged sets.
    for (const s of pathSessions(r, active).filter(
      (s) => s.state === "completed",
    )) {
      const sets = r
        .workoutExercises(s.data.workoutId)
        .flatMap((row) => r.sets(row.id));
      assert.ok(sets.length > 0);
      assert.ok(sets.every((x) => x.completed && x.rir === 2 && x.reps === 6));
    }
    // Every record in the backup is present after restore.
    const b = r.exportBackup();
    assert.equal(b.workouts.length, legacyBackup.workouts.length);
    assert.equal(b.sets.length, legacyBackup.sets.length);
    assert.equal(b.templates.length, legacyBackup.templates.length);
    assert.equal(b.journals.length, legacyBackup.journals.length);
    assert.deepEqual(
      b.sets.map((s) => [s.id, s.weight, s.reps]).sort(),
      legacyBackup.sets.map((s) => [s.id, s.weight, s.reps]).sort(),
    );
  } finally {
    db.close();
  }
});

test("re-running startup migration on existing data is idempotent and lossless", () => {
  const { r, db } = legacyUserRepository();
  try {
    const before = history(r);
    const journals = JSON.stringify(r.journal());
    r.migrate();
    r.migrate();
    assert.equal(history(r), before);
    assert.equal(JSON.stringify(r.journal()), journals);
  } finally {
    db.close();
  }
});

test("an active generated Path continues from its saved templates without the generator", () => {
  const { r, db } = legacyUserRepository();
  try {
    const path = currentPath(r)!;
    const before = history(r);
    const next = pathSessions(r, path).find((s) =>
      ["scheduled", "missed"].includes(s.state),
    )!;
    const template = r.templates().find((t) => t.id === next.data.templateId)!;
    const workout = startPathSession(r, next.record.id);
    assert.deepEqual(
      r.workoutExercises(workout.id).map((row) => row.exerciseId),
      template.exercises.map((e) => e.exerciseId),
    );
    assert.deepEqual(
      r.workoutExercises(workout.id).map((row) => r.sets(row.id).length),
      template.exercises.map((e) => e.sets),
    );
    for (const row of r.workoutExercises(workout.id))
      for (const s of r.sets(row.id))
        r.editSet(s.id, { weight: 70, reps: 5, rpe: 8, completed: true });
    r.finishWorkout(workout.id);
    assert.equal(pathSummary(r, currentPath(r)!).completed, 4);
    // Earlier history is untouched by continuing.
    const after = JSON.parse(history(r));
    const was = JSON.parse(before);
    for (const w of was.workouts)
      assert.deepEqual(
        after.workouts.find((x: { id: string }) => x.id === w.id),
        w,
      );
    for (const s of was.sets)
      assert.deepEqual(
        after.sets.find((x: { id: string }) => x.id === s.id),
        s,
      );
  } finally {
    db.close();
  }
});

test("existing Path schedules can still be skipped, restored, moved, paused and resumed", () => {
  const { r, db } = legacyUserRepository();
  try {
    const path = currentPath(r)!;
    const pending = pathSessions(r, path).filter((s) =>
      ["scheduled", "missed"].includes(s.state),
    );
    skipPathSession(r, pending[0]!.record.id, true);
    assert.equal(pathSummary(r, currentPath(r)!).skipped, 2);
    skipPathSession(r, pending[0]!.record.id, false);
    const target = "2027-03-03";
    reschedulePathSession(r, pending.at(-1)!.record.id, target, "2026-10-22");
    assert.equal(
      pathSessions(r, currentPath(r)!).find(
        (s) => s.record.id === pending.at(-1)!.record.id,
      )!.record.date,
      target,
    );
    pausePath(r, path.record.id, "2026-10-22");
    assert.equal(currentPath(r)!.data.status, "paused");
    assert.throws(() => startPathSession(r, pending[1]!.record.id), /Resume/);
    resumePath(r, path.record.id, "2026-10-24");
    assert.equal(currentPath(r)!.data.status, "active");
    assert.ok(visibleSchedules(r).length > 0);
  } finally {
    db.close();
  }
});

test("archived Paths are read-only and saved workouts are never silently changed", () => {
  const { r, db } = legacyUserRepository();
  try {
    const archived = pathPrograms(r).find((p) => p.data.status === "archived")!;
    const pending = pathSessions(r, archived).find(
      (s) => s.state !== "completed",
    )!;
    assert.throws(() => startPathSession(r, pending.record.id), /Archived/);
    assert.throws(
      () => skipPathSession(r, pending.record.id, true),
      /read-only/,
    );
    // Saved Path workouts can never point at a missing exercise: the database
    // rejects it, so nothing is ever substituted when a session starts.
    const path = currentPath(r)!;
    const next = pathSessions(r, path).find((s) =>
      ["scheduled", "missed"].includes(s.state),
    )!;
    const template = r.templates().find((t) => t.id === next.data.templateId)!;
    assert.throws(
      () =>
        r.saveTemplate(
          template.name,
          [{ ...template.exercises[0]!, exerciseId: "retired-movement" }],
          template.id,
          template.notes,
        ),
      /FOREIGN KEY/,
    );
    assert.deepEqual(
      r.templates().find((t) => t.id === template.id),
      template,
    );
  } finally {
    db.close();
  }
});

test("moving to a curated program is deliberate and keeps all history", () => {
  const { r, db } = legacyUserRepository();
  try {
    const before = history(r);
    const program = allPublished.find(
      (p) => p.id === "forge-muscle-intermediate-4-day",
    )!;
    // Never replaces an active plan without confirmation.
    assert.throws(
      () => enrollProgram(r, program, "2026-10-26"),
      /Confirm replacement/,
    );
    assert.equal(currentPath(r)!.data.status, "active");
    enrollProgram(r, program, "2026-10-26", true);
    assert.equal(currentPath(r), undefined);
    assert.equal(pathPrograms(r).length, 2);
    assert.ok(pathPrograms(r).every((p) => p.data.status === "archived"));
    assert.equal(history(r), before);
    // Training the curated program adds history without rewriting it.
    const w = startProgramSession(
      r,
      currentEnrollment(r, [program])!.record.id,
      [program],
    );
    r.finishWorkout(w.id);
    const after = JSON.parse(history(r));
    assert.equal(after.workouts.length, JSON.parse(before).workouts.length + 1);
    for (const s of JSON.parse(before).sets)
      assert.deepEqual(
        after.sets.find((x: { id: string }) => x.id === s.id),
        s,
      );
    // Changing the rest day later never moves completed sessions.
    const completed = pathSessions(r, pathPrograms(r)[0]!)
      .filter((s) => s.state === "completed")
      .map((s) => s.record.date);
    r.saveProfile({ restDay: 3 });
    assert.deepEqual(
      pathSessions(r, pathPrograms(r)[0]!)
        .filter((s) => s.state === "completed")
        .map((s) => s.record.date),
      completed,
    );
    assert.equal(r.profile().onboarded, true);
  } finally {
    db.close();
  }
});
