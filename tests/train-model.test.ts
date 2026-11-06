import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextWhen,
  planOverview,
  progressText,
  templateOrder,
  trainHero,
  type PlanNext,
} from "../src/screens/train/model";
import { phaseLabel } from "../src/screens/home/model";
import { enrollProgram } from "../src/data/programs";
import { pathPrograms, pathSummary } from "../src/data/paths";
import { programLibrary } from "../src/programs";
import { totalSessions } from "../src/domain/programs/enrollment";
import { localDate, type Template } from "../src/domain/types";
import { pathRepository } from "./path-fixture";
import { freshPathRepository } from "./legacy-fixture";

// Phase 7.2B: the Train hub's presentation rules over existing data.

const template = (id: string): Template => ({
  id,
  name: id,
  notes: "",
  updatedAt: 0,
  exercises: [],
});

test("templates trained most recently come first; the rest keep name order", () => {
  const list = ["A", "B", "C", "D"].map(template);
  assert.deepEqual(
    templateOrder(list, []).map((t) => t.id),
    ["A", "B", "C", "D"],
  );
  const order = templateOrder(list, [
    { templateId: "C", startedAt: 100 },
    { templateId: "B", startedAt: 300 },
    { templateId: "C", startedAt: 200 },
    { templateId: null, startedAt: 900 },
    // A deleted template's workouts are ignored.
    { templateId: "Z", startedAt: 999 },
  ]);
  assert.deepEqual(
    order.map((t) => t.id),
    ["B", "C", "A", "D"],
  );
});

test("plan progress reads sessions of the plan, or sessions done when open-ended", () => {
  assert.equal(progressText({ done: 7, total: 36 }), "7 of 36 sessions");
  assert.equal(progressText({ done: 1, total: 1 }), "1 of 1 session");
  assert.equal(progressText({ done: 5 }), "5 sessions completed");
  assert.equal(progressText({ done: 1 }), "1 session completed");
});

test("the next session says when it is due", () => {
  const next = (when: PlanNext["when"], kind: PlanNext["kind"] = "program") =>
    ({ kind, when, date: "2026-10-29" }) as PlanNext;
  assert.equal(nextWhen(next("today"), "2026-10-27"), "Today");
  assert.match(nextWhen(next("missed", "path"), "2026-10-30"), /^Missed · /);
  assert.equal(
    nextWhen(
      { ...next("upcoming"), date: "2026-10-28" } as PlanNext,
      "2026-10-27",
    ),
    "Suggested for tomorrow",
  );
  assert.match(
    nextWhen(next("upcoming", "path"), "2026-10-27"),
    /^Scheduled for /,
  );
});

test("a curated program shows its level, real session counts and next session", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    const program = programLibrary.find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    const today = localDate();
    enrollProgram(r, program, today);
    const plan = planOverview(r, today)!;
    assert.equal(plan.kind, "program");
    assert.equal(
      plan.level,
      `${program.experience} · ${program.daysPerWeek} days a week`,
    );
    assert.equal(plan.done, 0);
    assert.equal(plan.total, totalSessions(program));
    assert.equal(plan.state, "active");
    assert.equal(
      plan.context,
      `Week 1 · ${phaseLabel(program.phases[0]!.name)}`,
    );
    assert.equal(plan.next?.kind, "program");
    assert.equal(plan.next?.name, program.phases[0]!.sessions[0]!.name);
  } finally {
    db.close();
  }
});

test("an existing Path shows its 8-week session count and scheduled session", () => {
  const { r, db } = freshPathRepository();
  try {
    const path = pathPrograms(r)[0]!;
    const today = localDate();
    const plan = planOverview(r, today)!;
    const stats = pathSummary(r, path, today);
    assert.equal(plan.kind, "path");
    assert.equal(plan.name, path.data.name);
    assert.equal(plan.total, stats.expected);
    assert.equal(plan.done, stats.completed);
    assert.equal(plan.next?.kind, "path");
  } finally {
    db.close();
  }
});

test("the hero puts the workout in progress before the plan, and Forge Paths last", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    const today = localDate();
    assert.deepEqual(trainHero(r, today, 18), { kind: "none", programs: 18 });
    const program = programLibrary.find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    enrollProgram(r, program, today);
    assert.equal(trainHero(r, today, 18).kind, "plan");
    const w = r.startWorkout("Freestyle");
    const row = r.addExercise(w.id, "barbell-bench-press");
    r.editSet(r.addSet(row.id, { weight: 60, reps: 8 }).id, {
      completed: true,
    });
    r.addSet(row.id, { weight: 60, reps: 8 });
    assert.deepEqual(trainHero(r, today, 18), {
      kind: "active",
      title: "Freestyle",
      plan: undefined,
      paused: false,
      sets: { done: 1, total: 2 },
    });
    r.pauseWorkout(w.id);
    const paused = trainHero(r, today, 18);
    assert.ok(paused.kind === "active" && paused.paused);
  } finally {
    db.close();
  }
});
