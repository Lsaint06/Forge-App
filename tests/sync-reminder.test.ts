import { test } from "node:test";
import assert from "node:assert/strict";
import { syncReminder, syncReminderRule } from "../src/domain/sync-reminder";
import { snoozeSyncReminder, syncReminderFor } from "../src/data/sync-reminder";
import { recordSyncOutcome } from "../src/cloud/sync-state";
import { backupState, recordBackup } from "../src/data/backup";
import { pathRepository } from "./path-fixture";

// Phase 7.8C: the gentle sync reminder. Only with changes waiting, only
// after some training or time since the last complete sync, quiet for a
// few days after "Not now", and never a claim that anything is backed up.

const DAY = 86_400_000;
const now = new Date(2026, 9, 30, 18, 0).getTime();

test("no changes waiting: never a reminder", () => {
  assert.equal(
    syncReminder({ pending: 0, finishedAt: [now - 20 * DAY], now }),
    undefined,
  );
  assert.equal(
    syncReminder({
      pending: 0,
      completeAt: now - 30 * DAY,
      finishedAt: [now - DAY],
      now,
    }),
    undefined,
  );
});

test("never synced: after the first finished workout", () => {
  assert.equal(syncReminder({ pending: 3, finishedAt: [], now }), undefined);
  assert.equal(
    syncReminder({ pending: 3, finishedAt: [now - DAY], now }),
    "Your training on this phone isn't in the cloud yet.",
  );
  // Synced before this phone recorded when: only what's waiting is said.
  assert.equal(
    syncReminder({
      pending: 3,
      syncedBefore: true,
      finishedAt: [now - DAY],
      now,
    }),
    "3 changes aren't in the cloud yet.",
  );
});

test("synced before: once the last complete sync is 3 days old, or 3 workouts later", () => {
  const recent = now - DAY;
  assert.equal(
    syncReminder({
      pending: 2,
      completeAt: recent,
      finishedAt: [now - 1000],
      now,
    }),
    undefined,
    "a day old, one workout since",
  );
  assert.equal(
    syncReminder({
      pending: 2,
      completeAt: recent,
      finishedAt: [1, 2, 3].map((i) => recent + i * 1000),
      now,
    }),
    "2 changes aren't in the cloud yet · last complete sync yesterday",
  );
  assert.equal(
    syncReminder({
      pending: 1,
      completeAt: now - syncReminderRule.days * DAY,
      finishedAt: [],
      now,
    }),
    "1 change isn't in the cloud yet · last complete sync 3 days ago",
  );
  // Workouts before the last complete sync are already in the cloud.
  assert.equal(
    syncReminder({
      pending: 1,
      completeAt: recent,
      finishedAt: [1, 2, 3].map((i) => recent - i * 1000),
      now,
    }),
    undefined,
  );
});

test("'Not now' quiets it for a few days, then it returns if still due", () => {
  const due = { pending: 1, finishedAt: [now - DAY], now };
  assert.ok(syncReminder(due));
  assert.equal(syncReminder({ ...due, snoozedUntil: now + DAY }), undefined);
  assert.ok(syncReminder({ ...due, snoozedUntil: now - 1 }));
  for (const text of [
    syncReminder(due)!,
    syncReminder({ ...due, completeAt: now - 9 * DAY })!,
  ])
    assert.doesNotMatch(text, /backed up|is safe|protected/i);
});

test("on the phone: the owner's own last sync counts, and 'Not now' is remembered", () => {
  const { r, db } = pathRepository();
  try {
    r.setSetting("cloudOwner", "user-a");
    const w = r.startWorkout();
    r.finishWorkout(w.id);
    assert.equal(
      syncReminderFor(r, "user-a", now),
      "Your training on this phone isn't in the cloud yet.",
    );
    // Synchronized before Phase 7.8C (sync history, no recorded date): the
    // waiting changes are named, never "isn't in the cloud" for everything.
    r.db.run("INSERT INTO sync_meta(id,revision) VALUES('profile',1)");
    assert.equal(
      syncReminderFor(r, "user-a", now),
      "1 change isn't in the cloud yet.",
    );
    // Another account's complete sync is never used for this one.
    recordSyncOutcome(r, "user-b", "complete", now);
    assert.ok(syncReminderFor(r, "user-a", now));
    recordSyncOutcome(r, "user-a", "complete", now);
    assert.equal(syncReminderFor(r, "user-a", now), undefined);
    recordSyncOutcome(r, "user-a", "complete", now - 4 * DAY);
    assert.ok(syncReminderFor(r, "user-a", now));
    snoozeSyncReminder(r, now);
    assert.equal(syncReminderFor(r, "user-a", now + DAY), undefined);
    assert.ok(syncReminderFor(r, "user-a", now + 4 * DAY));
    // Deleting this phone's data removes the reminder's memory too.
    r.clearData();
    assert.equal(r.setting("syncReminderSnoozedUntil"), undefined);
  } finally {
    db.close();
  }
});

// Decision D5 (Phase 7.8C review): cloud sync and backup files serve
// different recovery purposes, so neither ever stands in for the other.
test("a complete sync never counts as a file backup, and a file backup never counts as a sync", () => {
  const { r, db } = pathRepository();
  try {
    r.setSetting("cloudOwner", "user-a");
    const w = r.startWorkout();
    r.finishWorkout(w.id);
    const before = backupState(r, now);
    recordSyncOutcome(r, "user-a", "complete", now);
    const after = backupState(r, now);
    assert.deepEqual(after, before);
    assert.equal(after.lastBackupAt, undefined);
    assert.equal(after.due, true);
    assert.match(after.text, /^Never backed up/);
    // The other way round: a confirmed backup file leaves sync alone.
    r.clearSetting("syncStatus");
    recordBackup(r, now);
    assert.equal(
      syncReminderFor(r, "user-a", now),
      "Your training on this phone isn't in the cloud yet.",
    );
  } finally {
    db.close();
  }
});
