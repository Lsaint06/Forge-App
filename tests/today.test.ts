import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import { freshPathRepository } from "./legacy-fixture";
import { placeholderProgram } from "./program-fixture";
import { enrollProgram, programProgress } from "../src/data/programs";
import { currentPath, pathSessions } from "../src/data/paths";
import { nextSession, startNextSession } from "../src/data/today";
import { localDate } from "../src/domain/types";
import { addDays } from "../src/domain/paths/model";
import type { CuratedProgram } from "../src/domain/programs/model";

// Test-only published copy of the development placeholder: Mon/Wed/Fri with a
// Sunday rest day, two weeks long.
function testProgram(): CuratedProgram {
  const base = placeholderProgram();
  return placeholderProgram({
    status: "published",
    durationWeeks: 2,
    phases: [
      { name: "Placeholder", weeks: 2, sessions: base.phases[0]!.sessions },
    ],
  });
}

type Repo = ReturnType<typeof pathRepository>["r"];
function finish(r: Repo, workoutId: string) {
  for (const row of r.workoutExercises(workoutId))
    for (const set of r.sets(row.id))
      r.editSet(set.id, { completed: true, weight: 20 });
  r.finishWorkout(workoutId);
}
const schedules = (r: Repo) => JSON.stringify(r.journal("schedule"));

test("with nothing planned, Today offers a freestyle workout", () => {
  const { r, db } = pathRepository();
  try {
    const next = nextSession(r, "2026-10-19");
    assert.equal(next.kind, "none");
    const w = startNextSession(r, next)!;
    assert.equal(w.name, "Freestyle");
    assert.equal(r.active()?.id, w.id);
  } finally {
    db.close();
  }
});

test("the workout in progress always comes first", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    r.saveProfile({ restDay: 6 });
    enrollProgram(r, program, "2026-10-19");
    const w = r.startWorkout();
    const next = nextSession(r, "2026-10-19", [program]);
    assert.equal(next.kind, "active");
    assert.equal(startNextSession(r, next, [program])?.id, w.id);
  } finally {
    db.close();
  }
});

test("a program session on a training day is due today; on a rest day it is the next session and can start early", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    r.saveProfile({ restDay: 6 });
    enrollProgram(r, program, "2026-10-19");
    const monday = nextSession(r, "2026-10-19", [program]);
    assert.equal(monday.kind, "program");
    assert.equal(monday.kind === "program" && monday.when, "today");
    assert.equal(
      monday.kind === "program" && monday.name,
      "Placeholder session a",
    );
    assert.equal(monday.kind === "program" && monday.week, 1);

    const tuesday = nextSession(r, "2026-10-20", [program]);
    assert.ok(tuesday.kind === "program");
    assert.equal(tuesday.when, "upcoming");
    assert.equal(tuesday.date, "2026-10-21");
    // Starting early is the program's own start: the first session, as
    // authored, with nothing rescheduled.
    const before = schedules(r);
    const w = startNextSession(r, tuesday, [program])!;
    assert.equal(w.name, `${program.name} · Placeholder session a`);
    const enrollment = (tuesday as Extract<typeof tuesday, { kind: "program" }>)
      .enrollment;
    assert.equal(programProgress(r, enrollment).next?.state, "in-progress");
    assert.equal(
      JSON.parse(schedules(r)).length,
      JSON.parse(before).length + 1,
    );
  } finally {
    db.close();
  }
});

test("after finishing today's program session, the next one is not shown as due today", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const today = localDate();
    // Every day is a training day, so only the finished session can move the
    // next one to tomorrow.
    const daily = {
      ...program,
      weeklyPattern: Array(7).fill("train"),
    } as CuratedProgram;
    enrollProgram(r, daily, today);
    const first = nextSession(r, today, [daily]);
    assert.ok(first.kind === "program" && first.when === "today");
    finish(r, startNextSession(r, first, [daily])!.id);
    const second = nextSession(r, today, [daily]);
    assert.ok(second.kind === "program");
    assert.equal(second.name, "Placeholder session b");
    assert.equal(second.when, "upcoming");
    assert.equal(second.date, addDays(today, 1));
  } finally {
    db.close();
  }
});

test("an existing Path's session today comes first, then missed or upcoming sessions keep their dates", () => {
  const { r, db } = freshPathRepository();
  try {
    const path = currentPath(r)!;
    const dates = pathSessions(r, path).map((s) => s.record.date);
    const first = dates[0]!;
    const second = dates.find((d) => d > first)!;

    const due = nextSession(r, first);
    assert.ok(due.kind === "path");
    assert.equal(due.when, "today");
    assert.equal(due.date, first);

    const before = nextSession(r, addDays(first, -1));
    assert.ok(before.kind === "path");
    assert.equal(before.when, "upcoming");
    assert.equal(before.date, first);

    // On a later day with no session of its own, the oldest open session is
    // offered as missed, at its original date.
    let gap = addDays(first, 1);
    while (dates.includes(gap)) gap = addDays(gap, 1);
    const missed = nextSession(r, gap);
    assert.ok(missed.kind === "path");
    assert.equal(missed.when, "missed");
    assert.equal(missed.date, first);

    // Today's own session outranks a missed one.
    const onSecond = nextSession(r, second);
    assert.ok(onSecond.kind === "path");
    assert.equal(onSecond.when, "today");
    assert.equal(onSecond.date, second);

    // Starting early links the workout without moving the session.
    const dated = JSON.parse(schedules(r)) as { id: string; date: string }[];
    const w = startNextSession(r, before)!;
    const after = JSON.parse(schedules(r)) as {
      id: string;
      date: string;
      data: { workoutId: string };
    }[];
    assert.deepEqual(
      after.map((j) => [j.id, j.date]),
      dated.map((j) => [j.id, j.date]),
    );
    assert.equal(
      after.find((j) => j.id === before.entry.id)?.data.workoutId,
      w.id,
    );
  } finally {
    db.close();
  }
});

test("a paused Path offers no session start", () => {
  const { r, db } = freshPathRepository();
  try {
    const path = currentPath(r)!;
    r.updateJournal(path.record.id, {
      ...path.record.data,
      status: "paused",
      pausedOn: "2026-10-19",
    });
    assert.equal(nextSession(r, "2026-10-19").kind, "none");
  } finally {
    db.close();
  }
});

test("a template planned for today is offered until it has been trained today", () => {
  const { r, db } = pathRepository();
  try {
    const today = localDate();
    const t = r.saveTemplate("Upper", [
      {
        exerciseId: "barbell-bench-press",
        sets: 2,
        reps: 5,
        weight: 40,
        rest: 90,
      },
    ]);
    r.addJournal("schedule", { name: t.name, templateId: t.id }, today);
    const planned = nextSession(r, today);
    assert.ok(planned.kind === "planned");
    assert.equal(planned.template?.id, t.id);
    const w = startNextSession(r, planned)!;
    assert.equal(w.templateId, t.id);
    finish(r, w.id);
    assert.equal(nextSession(r, today).kind, "none");
    // Another day's plan is not "today".
    r.addJournal(
      "schedule",
      { name: t.name, templateId: t.id },
      addDays(today, 1),
    );
    assert.equal(nextSession(r, today).kind, "none");
  } finally {
    db.close();
  }
});

test("a plan whose template was removed is reported, and a program due today outranks it", () => {
  const { r, db } = pathRepository();
  try {
    r.addJournal(
      "schedule",
      { name: "Removed", templateId: "gone" },
      "2026-10-19",
    );
    const planned = nextSession(r, "2026-10-19");
    assert.ok(planned.kind === "planned");
    assert.equal(planned.template, undefined);

    const program = testProgram();
    r.saveProfile({ restDay: 6 });
    enrollProgram(r, program, "2026-10-19");
    assert.equal(nextSession(r, "2026-10-19", [program]).kind, "program");
    // On a rest day the plan for that day wins over an upcoming session.
    r.addJournal(
      "schedule",
      { name: "Removed", templateId: "gone" },
      "2026-10-20",
    );
    assert.equal(nextSession(r, "2026-10-20", [program]).kind, "planned");
  } finally {
    db.close();
  }
});
