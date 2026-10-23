import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import { backupStatus, backupReminder } from "../src/domain/backup";
import {
  backupState,
  recordBackup,
  recordShare,
  snoozeBackupReminder,
  folderLabel,
  backupExportedAt,
} from "../src/data/backup";
import { hasValues, unmarkedSets, setNumbers } from "../src/domain/finish";
import { isBodyweightName, validateJournal } from "../src/domain/validation";
import {
  latestBodyweight,
  bodyweightGoal,
  goalProgress,
} from "../src/domain/analytics";
import { rescueData } from "../src/data/rescue";
import type { WorkoutSet } from "../src/domain/types";

// Phase 7B WP1: backup status and reminders, the finish safeguard for
// unticked sets, bodyweight goals and the recovery order.

const DAY = 86_400_000;
const now = new Date("2026-10-23T12:00:00").getTime();

// ---- Backup status ----------------------------------------------------------

test("a new lifter with nothing logged is not nagged", () => {
  const s = backupStatus({ finishedAt: [], now });
  assert.equal(s.due, false);
  assert.equal(s.prompt, false);
  assert.equal(s.text, "Not backed up yet");
});

test("the first unprotected workout makes a backup due", () => {
  const s = backupStatus({ finishedAt: [now - DAY], now });
  assert.equal(s.due, true);
  assert.equal(s.prompt, true);
  assert.equal(s.workoutsSince, 1);
  assert.equal(s.text, "Never backed up · 1 workout on this phone");
});

test("reminders wait for enough new workouts or enough time", () => {
  const last = now - 2 * DAY;
  const one = backupStatus({ lastBackupAt: last, finishedAt: [now], now });
  assert.equal(one.due, false);
  assert.match(one.text, /^Last backup .+ · 1 workout since$/);
  const three = backupStatus({
    lastBackupAt: last,
    finishedAt: [last - DAY, now - DAY, now - 1000, now],
    now,
  });
  assert.equal(three.workoutsSince, backupReminder.workouts);
  assert.equal(three.due, true);
  const week = now - backupReminder.days * DAY;
  assert.equal(
    backupStatus({ lastBackupAt: week, finishedAt: [now], now }).due,
    true,
  );
  // Time alone, with nothing new logged, never nags.
  assert.equal(
    backupStatus({ lastBackupAt: week, finishedAt: [week - DAY], now }).due,
    false,
  );
});

test("backup text says today and yesterday", () => {
  assert.equal(
    backupStatus({ lastBackupAt: now - 1000, finishedAt: [], now }).text,
    "Last backup today",
  );
  assert.equal(
    backupStatus({ lastBackupAt: now - DAY, finishedAt: [], now }).text,
    "Last backup yesterday",
  );
});

test("a snoozed reminder stays due but does not prompt after workouts", () => {
  const s = backupStatus({
    finishedAt: [now],
    snoozedUntil: now + DAY,
    now,
  });
  assert.equal(s.due, true);
  assert.equal(s.prompt, false);
  assert.equal(
    backupStatus({ finishedAt: [now], snoozedUntil: now - 1, now }).prompt,
    true,
  );
});

// ---- Shared, unconfirmed copies ---------------------------------------------

test("a share is reported as unconfirmed and never counts as a backup", () => {
  const s = backupStatus({
    lastSharedAt: now - 1000,
    finishedAt: [now - DAY],
    now,
  });
  assert.equal(s.unconfirmed, true);
  assert.equal(s.lastBackupAt, undefined);
  assert.equal(s.workoutsSince, 1);
  assert.equal(s.due, true);
  assert.equal(s.text, "Shared today · not confirmed saved");
});

test("an unconfirmed share pauses the after-workout prompt, then it returns", () => {
  const shared = now - DAY;
  assert.equal(
    backupStatus({ lastSharedAt: shared, finishedAt: [now], now }).prompt,
    false,
  );
  const later = shared + (backupReminder.snoozeDays + 0.5) * DAY;
  assert.equal(
    backupStatus({ lastSharedAt: shared, finishedAt: [now], now: later })
      .prompt,
    true,
  );
});

test("a share after a confirmed backup keeps the confirmed date and counts", () => {
  const s = backupStatus({
    lastBackupAt: now - 2 * DAY,
    lastSharedAt: now - 1000,
    finishedAt: [now - 3 * DAY, now - DAY],
    now,
  });
  assert.equal(s.unconfirmed, true);
  assert.equal(s.workoutsSince, 1);
  assert.match(s.text, /^Shared today · not confirmed saved · last backup /);
  // A confirmed backup after the share replaces the unconfirmed state.
  const confirmed = backupStatus({
    lastBackupAt: now - 500,
    lastSharedAt: now - 1000,
    finishedAt: [now - DAY],
    now,
  });
  assert.equal(confirmed.unconfirmed, false);
  assert.equal(confirmed.text, "Last backup today");
});

test("recording a share never records a backup", () => {
  const { r, db } = pathRepository();
  try {
    finished(r);
    recordShare(r);
    assert.equal(r.setting("lastBackupAt"), undefined);
    assert.ok(Number(r.setting("lastSharedAt")) > 0);
    assert.equal(backupState(r).unconfirmed, true);
    assert.equal(backupState(r).workoutsSince, 1);
  } finally {
    db.close();
  }
});

// ---- Backup bookkeeping in the repository -----------------------------------

test("saved folders are named the way a person sees them", () => {
  assert.equal(folderLabel("primary:Documents"), "Documents");
  assert.equal(folderLabel("primary:Backups/FORGE"), "FORGE");
  assert.equal(folderLabel("Downloads"), "Downloads");
  assert.equal(folderLabel(""), "the folder you chose");
  assert.equal(folderLabel(undefined), "the folder you chose");
});

function finished(r: ReturnType<typeof pathRepository>["r"]) {
  const w = r.startWorkout("Push");
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { weight: 60, reps: 5, completed: true });
  r.finishWorkout(w.id);
  return w;
}

test("backup state counts only workouts finished after the last backup", () => {
  const { r, db } = pathRepository();
  try {
    finished(r);
    assert.equal(
      backupState(r).text,
      "Never backed up · 1 workout on this phone",
    );
    recordBackup(r);
    assert.equal(backupState(r).workoutsSince, 0);
    assert.equal(backupState(r).due, false);
    finished(r);
    assert.equal(backupState(r).workoutsSince, 1);
    // An active workout is not yet history.
    r.startWorkout("Pull");
    assert.equal(backupState(r).workoutsSince, 1);
  } finally {
    db.close();
  }
});

test("Not now snoozes; a backup clears the snooze", () => {
  const { r, db } = pathRepository();
  try {
    finished(r);
    snoozeBackupReminder(r);
    assert.equal(backupState(r).prompt, false);
    assert.equal(
      backupState(r, Date.now() + (backupReminder.snoozeDays + 1) * DAY).prompt,
      true,
    );
    recordBackup(r);
    assert.equal(r.setting("backupSnoozedUntil"), "0");
  } finally {
    db.close();
  }
});

test("backup bookkeeping never changes the backup format or user data", () => {
  const { r, db } = pathRepository();
  try {
    finished(r);
    const before = r.exportBackup();
    recordBackup(r);
    snoozeBackupReminder(r);
    const after = r.exportBackup();
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    assert.deepEqual({ ...after, exportedAt: 0 }, { ...before, exportedAt: 0 });
    // Deleting local data forgets the backup too.
    r.clearData();
    assert.equal(r.setting("lastBackupAt"), undefined);
  } finally {
    db.close();
  }
});

test("an imported backup counts as protected up to its export time", () => {
  const { r, db } = pathRepository();
  try {
    finished(r);
    const text = JSON.stringify(r.exportBackup());
    const at = backupExportedAt(text);
    assert.ok(at && at > 0);
    r.importBackup(text);
    recordBackup(r, at);
    assert.equal(backupState(r).workoutsSince, 0);
    assert.equal(backupExportedAt("not json"), undefined);
    assert.equal(backupExportedAt("{}"), undefined);
  } finally {
    db.close();
  }
});

// ---- Finish: unticked sets with values --------------------------------------

const set = (patch: Partial<WorkoutSet>): WorkoutSet =>
  ({
    id: Math.random().toString(36),
    exerciseRowId: "row",
    position: 0,
    weight: 0,
    reps: 0,
    duration: 0,
    distance: 0,
    rpe: null,
    rir: null,
    kind: "working",
    completed: false,
    rest: 90,
    tempo: "",
    notes: "",
    side: "both",
    ...patch,
  }) as WorkoutSet;

test("a set can be included when it has reps, time or distance", () => {
  assert.equal(hasValues(set({})), false);
  // A load without reps cannot be recorded as a completed set.
  assert.equal(hasValues(set({ weight: 50 })), false);
  assert.equal(hasValues(set({ reps: 8 })), true);
  assert.equal(hasValues(set({ duration: 30 })), true);
  assert.equal(hasValues(set({ distance: 400 })), true);
});

test("every set the finish sheet offers passes set validation when completed", () => {
  const { r, db } = pathRepository();
  try {
    const w = r.startWorkout("Mixed");
    const row = r.addExercise(w.id, "barbell-bench-press");
    for (const patch of [
      { weight: 60, reps: 5 },
      { weight: 60 },
      { reps: 0 },
      { reps: 8 },
    ])
      r.editSet(r.addSet(row.id).id, patch);
    const [group] = unmarkedSets([{ row: row.id, sets: r.sets(row.id) }]);
    assert.deepEqual(
      group!.sets.map((s) => s.number),
      [1, 4],
    );
    for (const { set: s } of group!.sets)
      assert.doesNotThrow(() => r.editSet(s.id, { completed: true }));
  } finally {
    db.close();
  }
});

test("unmarked sets are grouped per exercise with their set numbers", () => {
  const groups = unmarkedSets([
    {
      row: "bench",
      sets: [
        set({ weight: 60, reps: 5, completed: true }),
        set({ weight: 60, reps: 5 }),
        set({}),
        set({ weight: 55, reps: 6 }),
      ],
    },
    { row: "row", sets: [set({ weight: 50, reps: 8, completed: true })] },
    { row: "curl", sets: [set({}), set({ reps: 12 })] },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.row, g.sets.map((s) => s.number)]),
    [
      ["bench", [2, 4]],
      ["curl", [2]],
    ],
  );
  assert.equal(setNumbers([2, 4]), "Sets 2 and 4");
  assert.equal(setNumbers([1, 2, 4]), "Sets 1, 2 and 4");
  assert.equal(setNumbers([3]), "Set 3");
});

// ---- Bodyweight goals -------------------------------------------------------

test("bodyweight is recognised in any common spelling", () => {
  for (const name of [
    "Bodyweight",
    "Body weight",
    "body  weight",
    " BODYWEIGHT ",
  ])
    assert.equal(isBodyweightName(name), true, name);
  for (const name of ["Waist", "Body fat", "weight", ""])
    assert.equal(isBodyweightName(name), false, name);
  // Validation still insists bodyweight is stored in kilograms.
  assert.throws(() =>
    validateJournal("measurement", {
      name: "Body weight",
      value: 180,
      unit: "lb" as never,
    }),
  );
});

test("the latest bodyweight comes from the newest matching entry", () => {
  const entries = [
    { data: { name: "Waist", value: 84, unit: "cm" } },
    { data: { name: "Body weight", value: 81.75, unit: "kg" } },
    { data: { name: "Bodyweight", value: 83, unit: "kg" } },
  ];
  assert.equal(latestBodyweight(entries), 81.75);
  assert.equal(latestBodyweight([entries[0]!]), undefined);
});

test("a bodyweight goal without a logged weight is never reported complete", () => {
  // The old behaviour: a missing weight counted as 0, and a cut from 84 to
  // 80 kg read as 100 % complete.
  assert.equal(goalProgress(0, 80, 84).ratio, 1);
  assert.deepEqual(bodyweightGoal(undefined, 80, 84), {
    current: undefined,
    ratio: 0,
  });
  assert.equal(bodyweightGoal(82, 80, 84).ratio, 0.5);
  assert.equal(bodyweightGoal(79.5, 80, 84).ratio, 1);
  assert.equal(bodyweightGoal(85, 80, 84).ratio, 0);
  // Gaining weight works the same way.
  assert.equal(bodyweightGoal(72, 75, 70).ratio, 0.4);
});

// ---- Recovery order ---------------------------------------------------------

test("recovery shares a readable backup first", async () => {
  const shared: string[] = [];
  const result = await rescueData({
    exportJson: () => "{}",
    shareJson: async (text) => void shared.push(`json:${text}`),
    shareDatabase: async () => void shared.push("db"),
  });
  assert.deepEqual(result, { kind: "backup" });
  assert.deepEqual(shared, ["json:{}"]);
});

test("recovery falls back to a raw database copy when records are unreadable", async () => {
  const shared: string[] = [];
  const result = await rescueData({
    exportJson: () => {
      throw new Error("malformed");
    },
    shareJson: async () => void shared.push("json"),
    shareDatabase: async () => void shared.push("db"),
  });
  assert.deepEqual(result, { kind: "database", reason: "malformed" });
  assert.deepEqual(shared, ["db"]);
});

test("recovery reports a failure instead of throwing", async () => {
  const result = await rescueData({
    exportJson: () => {
      throw new Error("malformed");
    },
    shareJson: async () => {},
    shareDatabase: async () => {
      throw new Error("no file");
    },
  });
  assert.deepEqual(result, { kind: "failed", message: "no file" });
  assert.deepEqual(
    await rescueData({
      exportJson: () => "{}",
      shareJson: async () => {
        throw new Error("share unavailable");
      },
      shareDatabase: async () => {},
    }),
    { kind: "failed", message: "share unavailable" },
  );
});
