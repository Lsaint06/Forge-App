import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays } from "../src/domain/paths/model";
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
import { enrollProgram } from "../src/data/programs";
import { programLibrary } from "../src/programs";
import { pathRepository } from "./path-fixture";
import { freshPathBackupText, freshPathRepository } from "./legacy-fixture";

// Existing generated Paths after the generator's retirement (Phase 6B). Each
// test restores a Path exported by the pre-Phase-6 app and continues it with
// the compatibility layer only.

function accepted(filename?: string) {
  const { r, db } = freshPathRepository(filename);
  const program = pathPrograms(r)[0]!;
  return { r, db, program };
}
function finish(r: ReturnType<typeof pathRepository>["r"], sessionId: string) {
  const w = startPathSession(r, sessionId);
  const set = r.workoutSets(w.id)[0]!;
  r.editSet(set.id, { reps: 8, completed: true });
  r.finishWorkout(w.id);
  return w;
}

test("a restored Path keeps its 8-week schedule and independent phase templates", () => {
  const { r, program } = accepted();
  assert.equal(program.data.engineVersion, 9);
  assert.equal(program.data.status, "active");
  assert.equal(pathSessions(r, program).length, 32);
  assert.deepEqual(
    program.data.phases.map((p) => [p.from, p.to]),
    [
      [1, 4],
      [5, 8],
    ],
  );
  const templates = new Set(r.templates().map((t) => t.id));
  for (const phase of program.data.phases)
    for (const id of phase.templateIds) assert.ok(templates.has(id));
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
  }
  assert.equal(pathSummary(r, pathPrograms(r)[0]!, "2026-10-29").week, 1);
  assert.equal(pathSummary(r, pathPrograms(r)[0]!).completed, 1);
});
test("later template edits preserve active and completed workout snapshots", () => {
  const { r, program } = accepted();
  const session = pathSessions(r, program)[0]!;
  const w = startPathSession(r, session.record.id);
  const before = r.workoutSets(w.id);
  const template = r.templates().find((t) => t.id === session.data.templateId)!;
  r.saveTemplate(
    template.name,
    template.exercises.map((e) => ({ ...e, weight: 20 })),
    template.id,
    template.notes,
  );
  assert.deepEqual(r.workoutSets(w.id), before);
  r.finishWorkout(w.id);
  assert.deepEqual(r.workoutSets(w.id), before);
});
test("backup round-trip and curated program replacement preserve complete history and phase metadata", () => {
  const { r, program } = accepted();
  const w = finish(r, pathSessions(r, program)[0]!.record.id);
  const sets = r.workoutSets(w.id);
  const backup = JSON.stringify(r.exportBackup());
  const restored = pathRepository().r;
  restored.importBackup(backup);
  assert.equal(pathSummary(restored, pathPrograms(restored)[0]!).completed, 1);
  assert.deepEqual(pathPrograms(restored)[0]!.data.phases, program.data.phases);
  const curated = programLibrary.find(
    (p) => p.id === "forge-muscle-intermediate-4-day",
  )!;
  assert.throws(() => enrollProgram(r, curated), /Confirm replacement/);
  enrollProgram(r, curated, "2026-10-26", true);
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
test("saved Path state survives a disk database close and reopen offline", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-path-"));
  try {
    const file = join(dir, "forge.db");
    const first = accepted(file);
    finish(first.r, pathSessions(first.r, first.program)[0]!.record.id);
    first.db.close();
    const second = pathRepository(file);
    assert.equal(pathPrograms(second.r)[0]!.record.id, first.program.record.id);
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
  const invalid = JSON.parse(freshPathBackupText);
  const program = invalid.journals.find(
    (j: { kind: string }) => j.kind === "program",
  );
  const phases = JSON.parse(program.data.phases);
  phases[1].from = 4;
  program.data.phases = JSON.stringify(phases);
  assert.throws(() => r.importBackup(JSON.stringify(invalid)));
  assert.deepEqual(r.exportBackup().journals, before.journals);
});
test("Evolution templates can change independently without recreating the cycle or touching logged Foundation sets", () => {
  const { r, program } = accepted();
  const sessions = pathSessions(r, program);
  const foundation = finish(r, sessions[0]!.record.id);
  const originalSets = r.workoutSets(foundation.id);
  const foundationTemplates = () =>
    program.data.phases[0].templateIds.map((id) =>
      r.templates().find((t) => t.id === id),
    );
  const originalPlan = foundationTemplates();
  const evolutionId = program.data.phases[1].templateIds[0]!;
  const template = r.templates().find((t) => t.id === evolutionId)!;
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
  assert.deepEqual(foundationTemplates(), originalPlan);
  assert.deepEqual(r.workoutSets(foundation.id), originalSets);
  assert.equal(pathPrograms(r)[0]!.record.id, program.record.id);
  assert.equal(pathSessions(r, program).length, 32);
});
