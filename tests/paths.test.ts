import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exercises } from "../src/data/catalog";
import { forgePaths, movementMenu } from "../src/domain/paths/catalog";
import {
  generatePath,
  validateDraft,
  scheduledDates,
  compatibleMovements,
  evolutionDays,
  EVOLUTION_VOLUME_INCREASE,
} from "../src/domain/paths/generator";
import { addDays, defaultWeekdays } from "../src/domain/paths/model";
import {
  pathPrograms,
  pathSummary,
  pathSessions,
  startPathSession,
  pausePath,
  resumePath,
  reschedulePathSession,
  skipPathSession,
  visibleSchedules,
} from "../src/data/paths";
import { acceptPath, savedDraft, editPathDay } from "../src/data/pathBuilder";
import { pathPreferences, pathRepository } from "./path-fixture";

test("all six Paths use distinct, valid goal prescriptions and their own frequency limits", () => {
  const signatures = new Set<string>();
  for (const path of forgePaths) {
    const p = pathPreferences({
      pathKey: path.key,
      frequency: path.frequency,
      experience: path.key === "start-strong" ? "Beginner" : "Advanced",
      weekdays: defaultWeekdays(path.frequency),
    });
    const draft = generatePath(p, exercises);
    signatures.add(
      JSON.stringify({
        days: draft.days.map((d) => d.exercises),
        frequency: p.frequency,
      }),
    );
    assert.equal(draft.days.length, p.frequency);
    assert.deepEqual(generatePath(p, exercises), draft);
    if (path.key === "get-strong")
      assert.ok(
        draft.days[0]!.exercises.slice(0, 2).every(
          (e) => e.reps <= 6 && e.rest >= 180,
        ),
      );
    if (path.key === "advanced-physique")
      assert.ok(draft.days.some((d) => d.roles.includes("biceps")));
    if (path.key === "athlete-mode")
      assert.ok(draft.days.every((d) => d.roles.includes("core")));
  }
  assert.equal(signatures.size, 6);
  assert.ok(
    movementMenu.every((m) => exercises.some((e) => e.id === m.id)),
    "every curated movement must exist in the original catalog",
  );
});
test("six goals remain different when availability and equipment are identical", () => {
  const signatures = forgePaths.map((path) => {
    const plan = generatePath(
      pathPreferences({
        pathKey: path.key,
        frequency: 3,
        experience: "Advanced",
      }),
      exercises,
    );
    return JSON.stringify(plan.days.map((d) => d.exercises));
  });
  assert.equal(new Set(signatures).size, 6);
});

test("beginner constraints, equipment prerequisites and exercise exclusions are enforced", () => {
  const p = pathPreferences({
    pathKey: "start-strong",
    experience: "Beginner",
    frequency: 3,
    equipment: ["Dumbbell"],
    excluded: ["goblet-squat", "dumbbell-floor-press"],
    avoidPatterns: ["hinge"],
  });
  const draft = generatePath(p, exercises);
  for (const day of draft.days)
    for (const e of day.exercises) {
      assert.ok(!p.excluded.includes(e.exerciseId));
      assert.notEqual(
        exercises.find((x) => x.id === e.exerciseId)!.pattern,
        "hinge",
      );
      assert.ok(
        movementMenu
          .find((m) => m.id === e.exerciseId)!
          .needs.every((n) => n === "Dumbbell"),
      );
      assert.ok(e.sets <= 3);
    }
  assert.throws(
    () =>
      generatePath(
        { ...p, frequency: 4, weekdays: defaultWeekdays(4) },
        exercises,
      ),
    /days per week|three training/,
  );
  assert.throws(
    () => generatePath({ ...p, pathKey: "advanced-physique" }, exercises),
    /experienced lifters/,
  );
  const bodyweight = generatePath({ ...p, equipment: [] }, exercises);
  assert.ok(
    bodyweight.days.every((day) =>
      day.exercises.every(
        (item) =>
          movementMenu.find((m) => m.id === item.exerciseId)!.needs.length ===
          0,
      ),
    ),
  );
  assert.throws(
    () => generatePath({ ...p, weekdays: [0, 1, 2] }, exercises),
    /adjacent days/,
  );
});
test("eight-week dates preserve local weekdays across daylight-saving boundaries", () => {
  const p = pathPreferences({
    startDate: "2027-03-05",
    frequency: 3,
    weekdays: [0, 2, 4],
  });
  const draft = generatePath(p, exercises);
  const dates = scheduledDates(draft);
  assert.equal(dates.length, 24);
  assert.equal(new Set(dates.map((d) => d.date)).size, 24);
  assert.ok(
    dates.every((d) =>
      [1, 3, 5].includes(new Date(`${d.date}T12:00:00`).getDay()),
    ),
  );
  assert.equal(dates.filter((d) => d.phase === "foundation").length, 12);
  assert.equal(dates.filter((d) => d.phase === "evolution").length, 12);
  assert.equal(addDays("2027-03-13", 2), "2027-03-15");
});
test("preview overrides remain constrained and do not mutate generator inputs", () => {
  const p = pathPreferences();
  const draft = generatePath(p, exercises);
  const before = JSON.stringify(draft);
  const copy = validateDraft(draft, exercises);
  const choices = compatibleMovements(p, copy.days[0]!.roles[0]!, exercises);
  copy.days[0]!.exercises[0]!.exerciseId = choices.find(
    (e) => !copy.days[0]!.exercises.some((x) => x.exerciseId === e.id),
  )!.id;
  copy.days[0]!.exercises[0]!.weight = 15;
  assert.doesNotThrow(() => validateDraft(copy, exercises));
  assert.equal(JSON.stringify(draft), before);
  copy.days[0]!.exercises[0]!.exerciseId = "pistol-squat";
  assert.throws(
    () => validateDraft(copy, exercises),
    /restrictions|conflicts with your equipment/,
  );
  copy.days[0]!.exercises[0]!.exerciseId =
    draft.days[0]!.exercises[0]!.exerciseId;
  copy.days[0]!.exercises[0]!.sets = 30;
  assert.throws(() => validateDraft(copy, exercises), /1–3 sets|1–5/);
});

function accepted() {
  const { r, db } = pathRepository();
  const record = acceptPath(r, generatePath(pathPreferences(), exercises));
  const program = pathPrograms(r).find((p) => p.record.id === record.id)!;
  return { r, db, program };
}
function finish(r: ReturnType<typeof pathRepository>["r"], sessionId: string) {
  const w = startPathSession(r, sessionId);
  const set = r.workoutSets(w.id)[0]!;
  r.editSet(set.id, { reps: 8, completed: true });
  r.finishWorkout(w.id);
  return w;
}
test("acceptance persists independent phase references; Evolution keeps the exercises and adds bounded accessory volume", () => {
  const { r, program } = accepted();
  assert.equal(pathSessions(r, program).length, 32);
  assert.equal(program.data.phases[0].from, 1);
  assert.equal(program.data.phases[0].to, 4);
  assert.equal(program.data.phases[1].from, 5);
  assert.equal(program.data.phases[1].to, 8);
  const foundation = savedDraft(r, program, 0);
  const evolution = savedDraft(r, program, 1);
  const sets = (d: typeof foundation) =>
    d.days.flatMap((x) => x.exercises).reduce((n, e) => n + e.sets, 0);
  for (let i = 0; i < 4; i++) {
    assert.notEqual(
      program.data.phases[0].templateIds[i],
      program.data.phases[1].templateIds[i],
    );
    // Same exercises, order, rest and rep targets: progress stays comparable.
    assert.deepEqual(
      evolution.days[i]!.exercises.map(({ sets, ...rest }) => {
        void sets;
        return rest;
      }),
      foundation.days[i]!.exercises.map(({ sets, ...rest }) => {
        void sets;
        return rest;
      }),
    );
    evolution.days[i]!.exercises.forEach((e, j) =>
      assert.ok(e.sets - foundation.days[i]!.exercises[j]!.sets <= 1),
    );
  }
  assert.ok(sets(evolution) > sets(foundation));
  assert.ok(
    sets(evolution) <=
      sets(foundation) +
        Math.floor(sets(foundation) * EVOLUTION_VOLUME_INCREASE),
  );
  assert.doesNotThrow(() => validateDraft(evolution, exercises));
  const backup = r.exportBackup();
  r.migrate();
  assert.deepEqual(r.exportBackup().journals, backup.journals);
});
test("beginner Paths repeat Foundation in Evolution and strength Paths move main lifts heavier", () => {
  const beginner = generatePath(
    pathPreferences({
      pathKey: "start-strong",
      experience: "Beginner",
      frequency: 3,
    }),
    exercises,
  );
  assert.deepEqual(evolutionDays(beginner, exercises), beginner.days);
  const strength = generatePath(
    pathPreferences({ pathKey: "get-strong", frequency: 3 }),
    exercises,
  );
  const later = evolutionDays(strength, exercises);
  const squat = (days: typeof later) =>
    days[0]!.exercises.find((e) => e.exerciseId === "back-squat")!;
  assert.deepEqual(
    [squat(strength.days).reps, squat(strength.days).repMax],
    [4, 6],
  );
  assert.deepEqual([squat(later).reps, squat(later).repMax], [3, 5]);
  assert.equal(squat(later).sets, squat(strength.days).sets);
});
test("editing a current Path day re-derives Evolution from the edited Foundation", () => {
  const { r, program } = accepted();
  const day = savedDraft(r, program, 0).days[1]!;
  const items = day.exercises.map((e, i) => (i === 0 ? { ...e, reps: 7 } : e));
  editPathDay(r, program.record.id, 1, items);
  const refreshed = pathPrograms(r)[0]!;
  assert.equal(savedDraft(r, refreshed, 0).days[1]!.exercises[0]!.reps, 7);
  assert.equal(savedDraft(r, refreshed, 1).days[1]!.exercises[0]!.reps, 7);
});
test("only explicitly linked completed workouts count, with no duplicate session credit", () => {
  const { r, program } = accepted();
  const sessions = pathSessions(r, program);
  const first = sessions[0]!;
  const unrelated = r.startWorkout("Unrelated", first.data.templateId);
  r.finishWorkout(unrelated.id);
  assert.equal(pathSummary(r, program).completed, 0);
  const w = startPathSession(r, first.record.id);
  assert.equal(startPathSession(r, first.record.id).id, w.id);
  assert.throws(
    () => startPathSession(r, sessions[1]!.record.id),
    /current workout/,
  );
  assert.equal(pathSummary(r, program).completed, 0);
  r.editSet(r.workoutSets(w.id)[0]!.id, { reps: 8, completed: true });
  r.finishWorkout(w.id);
  assert.equal(pathSummary(r, program).completed, 1);
  assert.throws(
    () => startPathSession(r, first.record.id),
    /already completed/,
  );
  // A malformed duplicate association must never inflate completion.
  const duplicate = sessions.find(
    (s) => s.data.week === 2 && s.data.dayIndex === 0,
  )!;
  r.updateJournal(duplicate.record.id, {
    ...duplicate.record.data,
    workoutId: w.id,
  });
  assert.equal(pathSummary(r, program).completed, 1);
});
test("unrelated active workouts are not bound and skipped or missed sessions are not completed", () => {
  const { r, program } = accepted();
  const first = pathSessions(r, program)[0]!;
  const w = r.startWorkout("Existing freestyle");
  assert.throws(() => startPathSession(r, first.record.id), /current workout/);
  assert.equal(pathSessions(r, program)[0]!.data.workoutId, "");
  r.deleteWorkout(w.id);
  skipPathSession(r, first.record.id, true);
  assert.equal(pathSummary(r, program, "2026-12-31").completed, 0);
  assert.equal(pathSummary(r, program, "2026-12-31").skipped, 1);
  assert.throws(() => startPathSession(r, first.record.id), /Restore/);
  skipPathSession(r, first.record.id, false);
  assert.equal(pathSessions(r, program, "2026-12-31")[0]!.state, "missed");
});
test("rescheduling recovers missed sessions and preserves their week and identity", () => {
  const { r, program } = accepted();
  const first = pathSessions(r, program)[0]!;
  skipPathSession(r, first.record.id, true);
  reschedulePathSession(r, first.record.id, "2027-01-04", "2027-01-01");
  const moved = pathSessions(r, program, "2027-01-01").find(
    (s) => s.record.id === first.record.id,
  )!;
  assert.equal(moved.record.date, "2027-01-04");
  assert.equal(moved.data.week, 1);
  assert.equal(moved.data.skipped, false);
  assert.equal(moved.data.templateId, first.data.templateId);
  const workout = finish(r, moved.record.id);
  assert.equal(pathSummary(r, program).completed, 1);
  assert.throws(
    () => reschedulePathSession(r, moved.record.id, "2027-01-06"),
    /keep their dates/,
  );
  assert.equal(
    pathSessions(r, program).find((s) => s.record.id === first.record.id)!.data
      .workoutId,
    workout.id,
  );
});
test("rescheduling rejects collisions and inadequate recovery without changing the schedule", () => {
  const { r, program } = accepted();
  const sessions = pathSessions(r, program);
  const before = r.exportBackup().journals;
  assert.throws(
    () =>
      reschedulePathSession(
        r,
        sessions[0]!.record.id,
        sessions[1]!.record.date,
        "2026-10-01",
      ),
    /already scheduled/,
  );
  assert.throws(
    () =>
      reschedulePathSession(
        r,
        sessions[0]!.record.id,
        addDays(sessions[2]!.record.date, -1),
        "2026-10-01",
      ),
    /recovery day/,
  );
  assert.deepEqual(r.exportBackup().journals, before);
});
test("pause/resume shifts upcoming sessions while preserving completed and earlier missed dates", () => {
  const { r, program } = accepted();
  const sessions = pathSessions(r, program);
  finish(r, sessions[0]!.record.id);
  pausePath(r, program.record.id, "2026-10-22");
  const paused = pathPrograms(r)[0]!;
  assert.throws(() => startPathSession(r, sessions[1]!.record.id), /Resume/);
  assert.equal(
    visibleSchedules(r).filter((s) => s.data.forgePath === 1).length,
    0,
  );
  assert.equal(pathSummary(r, paused, "2026-12-31").week, 1);
  resumePath(r, program.record.id, "2026-10-29");
  const shifted = pathSessions(r, pathPrograms(r)[0]!);
  for (const original of sessions) {
    const found = shifted.find((s) => s.record.id === original.record.id)!;
    assert.equal(
      found.record.date,
      original.record.date >= "2026-10-22"
        ? addDays(original.record.date, 7)
        : original.record.date,
    );
    assert.equal(
      found.data.workoutId,
      original.record.id === sessions[0]!.record.id
        ? pathSessions(r, program).find(
            (s) => s.record.id === original.record.id,
          )!.data.workoutId
        : original.data.workoutId,
    );
  }
  assert.equal(pathSummary(r, pathPrograms(r)[0]!, "2026-10-29").week, 1);
  assert.equal(pathSummary(r, pathPrograms(r)[0]!).completed, 1);
});
test("future edits preserve active and completed workout snapshots", () => {
  const { r, program } = accepted();
  const session = pathSessions(r, program)[0]!;
  const w = startPathSession(r, session.record.id);
  const before = r.workoutSets(w.id);
  const items = savedDraft(r, program).days[0]!.exercises.map((e) => ({
    ...e,
    weight: 20,
  }));
  editPathDay(r, program.record.id, 0, items);
  assert.deepEqual(r.workoutSets(w.id), before);
  assert.deepEqual(
    savedDraft(r, program, 0).days[0]!.exercises.map((e) => ({ ...e })),
    items,
  );
  assert.deepEqual(
    savedDraft(r, program, 1).days[0]!.exercises.map((e) => ({ ...e })),
    items,
  );
  r.finishWorkout(w.id);
  assert.deepEqual(r.workoutSets(w.id), before);
});
test("backup round-trip and program replacement preserve complete history and phase metadata", () => {
  const { r, program } = accepted();
  const w = finish(r, pathSessions(r, program)[0]!.record.id);
  const sets = r.workoutSets(w.id);
  const backup = JSON.stringify(r.exportBackup());
  const restored = pathRepository().r;
  restored.importBackup(backup);
  assert.equal(pathSummary(restored, pathPrograms(restored)[0]!).completed, 1);
  assert.deepEqual(pathPrograms(restored)[0]!.data.phases, program.data.phases);
  assert.throws(
    () => acceptPath(r, generatePath(pathPreferences(), exercises)),
    /Confirm replacement/,
  );
  acceptPath(
    r,
    generatePath(pathPreferences({ pathKey: "lean-strong" }), exercises),
    true,
  );
  assert.equal(
    pathPrograms(r).find((p) => p.record.id === program.record.id)!.data.status,
    "archived",
  );
  assert.deepEqual(r.workoutSets(w.id), sets);
  assert.throws(
    () => startPathSession(r, pathSessions(r, program)[1]!.record.id),
    /Archived/,
  );
});
test("eight-week completion comes from all real session links, not elapsed dates", () => {
  const { r, program } = accepted();
  assert.equal(pathSummary(r, program, "2028-01-01").complete, false);
  for (const s of pathSessions(r, program)) finish(r, s.record.id);
  const stats = pathSummary(r, program);
  assert.equal(stats.completed, 32);
  assert.equal(stats.complete, true);
  assert.equal(stats.ratio, 1);
  const w = pathSessions(r, program)[0]!.data.workoutId;
  r.deleteWorkout(w);
  assert.equal(pathSummary(r, program).complete, false);
});
test("saved program state survives a disk database close and reopen offline", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-path-"));
  try {
    const file = join(dir, "forge.db");
    const first = pathRepository(file);
    const saved = acceptPath(
      first.r,
      generatePath(pathPreferences(), exercises),
    );
    finish(
      first.r,
      pathSessions(first.r, pathPrograms(first.r)[0]!)[0]!.record.id,
    );
    first.db.close();
    const second = pathRepository(file);
    assert.equal(pathPrograms(second.r)[0]!.record.id, saved.id);
    assert.equal(
      pathSummary(second.r, pathPrograms(second.r)[0]!).completed,
      1,
    );
    assert.equal(pathSessions(second.r, pathPrograms(second.r)[0]!).length, 32);
    second.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("malformed phase metadata rejects before backup replacement", () => {
  const { r } = accepted();
  const before = r.exportBackup();
  const invalid = JSON.parse(JSON.stringify(before));
  const program = invalid.journals.find(
    (j: { kind: string }) => j.kind === "program",
  );
  const phases = JSON.parse(program.data.phases);
  phases[1].from = 4;
  program.data.phases = JSON.stringify(phases);
  assert.throws(() => r.importBackup(JSON.stringify(invalid)));
  assert.deepEqual(r.exportBackup().journals, before.journals);
});

test("failed acceptance rolls back templates, schedules and prior Path archival together", () => {
  const { r, program } = accepted();
  const before = r.exportBackup();
  const run = r.db.run.bind(r.db);
  let schedules = 0;
  r.db.run = (sql, params = []) => {
    if (
      sql.startsWith("INSERT INTO journal") &&
      params[1] === "schedule" &&
      ++schedules === 3
    )
      throw new Error("Simulated storage failure");
    run(sql, params);
  };
  assert.throws(
    () => acceptPath(r, generatePath(pathPreferences(), exercises), true),
    /storage failure/,
  );
  r.db.run = run;
  assert.equal(
    pathPrograms(r).find((p) => p.record.id === program.record.id)!.data.status,
    "active",
  );
  assert.deepEqual(r.exportBackup().templates, before.templates);
  assert.deepEqual(r.exportBackup().journals, before.journals);
});

test("Evolution templates can change independently without recreating the cycle or touching logged Foundation sets", () => {
  const { r, program } = accepted();
  const sessions = pathSessions(r, program);
  const foundation = finish(r, sessions[0]!.record.id);
  const originalSets = r.workoutSets(foundation.id);
  const originalPlan = savedDraft(r, program, 0);
  const evolutionId = program.data.phases[1].templateIds[0]!;
  const template = r.templates().find((t) => t.id === evolutionId)!;
  // Exercise the existing template storage interface, not a rotation engine.
  r.saveTemplate(
    template.name,
    template.exercises.map((e, index) => ({
      ...e,
      exerciseId: index === 0 ? "dumbbell-floor-press" : e.exerciseId,
      weight: 15,
    })),
    evolutionId,
    template.notes,
  );
  const week5 = sessions.find(
    (s) => s.data.week === 5 && s.data.dayIndex === 0,
  )!;
  const evolved = startPathSession(r, week5.record.id);
  assert.ok(r.workoutSets(evolved.id).every((s) => s.weight === 15));
  assert.equal(
    r.workoutExercises(evolved.id)[0]!.exerciseId,
    "dumbbell-floor-press",
  );
  assert.deepEqual(savedDraft(r, program, 0), originalPlan);
  assert.deepEqual(r.workoutSets(foundation.id), originalSets);
  assert.equal(pathPrograms(r)[0]!.record.id, program.record.id);
  assert.equal(pathSessions(r, program).length, 32);
});
