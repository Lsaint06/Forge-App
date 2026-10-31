import test from "node:test";
import assert from "node:assert/strict";
import {
  conflictTitle,
  conflictView,
  lastSyncNote,
  lastSyncText,
  pendingText,
  restoreOutcome,
  syncFailureText,
  syncSummary,
} from "../src/domain/presentation/account";
import { SyncStopError, type SyncResult } from "../src/cloud/sync";

// Phase 7.5G.3: account wording without internal identifiers or claims.

const row = (kind: string, payload: unknown) =>
  JSON.stringify({
    id: "3f2c9a1e-uuid",
    kind,
    payload,
    revision: 4,
    deleted: false,
  });

test("conflicts are named by what they are, never by their record id", () => {
  assert.equal(
    conflictTitle(row("workout", { workout: { name: "Push day" }, sets: [] })),
    "Workout · Push day",
  );
  assert.equal(
    conflictTitle(
      row("journal", { kind: "goal", data: { name: "Cut to 80" } }),
    ),
    "Goal · Cut to 80",
  );
  assert.equal(
    conflictTitle(row("journal", { kind: "recovery", data: { sleep: 7 } })),
    "Recovery check-in",
  );
  assert.equal(
    conflictTitle(row("template", { name: "Upper A" })),
    "Template · Upper A",
  );
  assert.equal(
    conflictTitle(row("exercise", { name: "Zercher squat" })),
    "Custom exercise · Zercher squat",
  );
  assert.equal(conflictTitle(row("profile", { name: "Alex" })), "Your profile");
  assert.equal(conflictTitle(row("workout", {})), "Workout");
  assert.equal(
    conflictTitle(row("journal", { kind: "unknown" })),
    "Journal entry",
  );
  assert.equal(conflictTitle("not json"), "A synced record");
  for (const title of [
    conflictTitle(row("workout", { workout: { name: "Push day" } })),
    conflictTitle("not json"),
  ])
    assert.doesNotMatch(title, /uuid|3f2c/);
});

test("pending changes are counted, and none is not called 'backed up'", () => {
  assert.equal(pendingText(0), "No local changes waiting to upload");
  assert.equal(pendingText(1), "1 change waiting to upload");
  assert.equal(pendingText(1200), "1,200 changes waiting to upload");
  assert.doesNotMatch(pendingText(0), /safe|backed up|protected/i);
});

// Phase 7.8B: what a sync did, said plainly.

const result = (p: Partial<SyncResult> = {}): SyncResult => ({
  uploaded: 0,
  downloaded: 0,
  matched: 0,
  rejected: 0,
  failed: 0,
  held: { update: 0, active: 0 },
  conflicts: 0,
  pending: 0,
  errors: [],
  ...p,
});

test("a sync that finished says what moved", () => {
  assert.equal(
    syncSummary(result({ uploaded: 3, downloaded: 1 })),
    "Sync complete: 3 uploaded · 1 downloaded.",
  );
  assert.equal(
    syncSummary(result()),
    "Sync complete. Nothing new to upload or download.",
  );
  assert.equal(
    syncSummary(result({ matched: 51 })),
    "Sync complete. Nothing new to upload or download. 51 records already matched the cloud.",
  );
});

test("a sync that stopped says why, what was kept and what to do (H3)", () => {
  assert.equal(
    syncSummary(result({ stopped: "offline", uploaded: 2, pending: 3 })),
    "Forge couldn't reach the cloud, so sync stopped. 2 changes were uploaded first. Nothing was lost: 3 changes are still waiting on this phone. Check your connection and try again.",
  );
  assert.equal(
    syncSummary(result({ stopped: "unavailable", pending: 1 })),
    "Forge's cloud isn't answering right now, so sync stopped. Nothing was lost: 1 change is still waiting on this phone. Try again in a few minutes.",
  );
  assert.equal(
    syncSummary(result({ stopped: "auth" })),
    "Forge couldn't confirm your sign-in, so sync stopped. Nothing was lost. Sign in again, then sync.",
  );
});

test("everything a sync couldn't finish is explained, never as an error dump", () => {
  const text = syncSummary(
    result({
      uploaded: 2,
      rejected: 1,
      failed: 1,
      conflicts: 2,
      pending: 3,
      held: { update: 1, active: 1 },
      errors: ["23514: new row violates check constraint"],
    }),
  );
  assert.equal(
    text,
    "2 uploaded · 0 downloaded. 1 change couldn't be uploaded. It stays on this phone, and the next sync tries again. 1 record from a newer version of Forge will appear after you update Forge. A workout in progress on another device will appear after you finish or discard the workout in progress here. 1 record from the cloud couldn't be read on this phone. The cloud copy is kept as it is. 2 records need your choice below.",
  );
  assert.doesNotMatch(text, /23514|constraint/);
  assert.equal(
    syncSummary(result({ pending: 2 })),
    "Nothing new uploaded or downloaded. 2 changes are still waiting to upload. Sync again to send them.",
  );
  for (const s of [
    result(),
    result({ stopped: "offline", pending: 4 }),
    result({ rejected: 1, pending: 1 }),
  ])
    assert.doesNotMatch(syncSummary(s), /backed up|is safe|protected/i);
});

test("a sync that couldn't run says so plainly", () => {
  assert.equal(
    syncFailureText(new SyncStopError("offline", "TypeError: x")),
    "Forge couldn't reach the cloud, so sync stopped. Nothing was lost. Check your connection and try again.",
  );
  assert.match(
    syncFailureText(new TypeError("Network request failed")),
    /^Forge couldn't reach the cloud/,
  );
  assert.equal(
    syncFailureText(new Error("A sync is already in progress")),
    "A sync is already in progress",
  );
  assert.equal(
    syncFailureText("?"),
    "Sync didn't finish. Nothing was lost. Try again.",
  );
});

test("Restore Your Training: done, failed or partial", () => {
  assert.deepEqual(restoreOutcome(result({ downloaded: 5 })), {
    kind: "done",
  });
  // Phase 7.8C: a workout held back (in progress on another device) is
  // never called complete, though it arrives later.
  assert.deepEqual(
    restoreOutcome(result({ downloaded: 5, held: { update: 0, active: 1 } })),
    {
      kind: "partial",
      text: "Restored 5 records. A workout in progress on another device will arrive after the one in progress here is finished.",
    },
  );
  assert.deepEqual(
    restoreOutcome(
      result({ downloaded: 5, failed: 1, held: { update: 0, active: 2 } }),
    ),
    {
      kind: "partial",
      text: "Restored 5 records, but 3 records couldn't be restored. 2 of them are workouts in progress on another device. Try again, or continue and synchronize later in Account & privacy.",
    },
  );
  assert.deepEqual(restoreOutcome(result({ stopped: "offline" })), {
    kind: "failed",
    text: "Forge couldn't restore your training: nothing on this phone changed. Check your connection and try again.",
  });
  assert.match(
    (restoreOutcome(result({ stopped: "auth" })) as { text: string }).text,
    /couldn't confirm your sign-in/,
  );
  assert.deepEqual(restoreOutcome(result({ downloaded: 2, failed: 1 })), {
    kind: "partial",
    text: "Restored 2 records, but 1 record couldn't be restored. Try again, or continue and synchronize later in Account & privacy.",
  });
  assert.deepEqual(
    restoreOutcome(result({ downloaded: 4, held: { update: 1, active: 0 } })),
    {
      kind: "partial",
      text: "Restored 4 records. 1 record needs a newer version of Forge: update Forge, then synchronize in Account & privacy.",
    },
  );
  assert.deepEqual(
    restoreOutcome(
      result({ downloaded: 4, failed: 1, held: { update: 2, active: 0 } }),
    ),
    {
      kind: "partial",
      text: "Restored 4 records, but 3 records couldn't be restored. 2 of them need a newer version of Forge. Try again, or continue and synchronize later in Account & privacy.",
    },
  );
});

// Phase 7.8B, M4: what differs in a conflict.

const NOW = new Date(2026, 9, 30, 18, 0).getTime();
const TODAY = new Date(2026, 9, 30, 14, 5).getTime();
const knows = (id: string) => id !== "from-a-newer-forge";
const saved = (
  kind: string,
  local: unknown,
  remote: unknown,
  deleted = false,
) => ({
  local: JSON.stringify(local),
  remote: JSON.stringify({
    id: "3f2c9a1e-uuid",
    kind,
    payload: remote,
    revision: 4,
    deleted,
  }),
});
function workout(
  sets: { completed: boolean }[],
  updatedAt = TODAY,
  exerciseId = "barbell-bench-press",
) {
  return {
    workout: {
      id: "w-uuid",
      name: "Push day",
      status: "completed",
      startedAt: 1,
      finishedAt: 2,
      pausedAt: null,
      pausedMs: 0,
      notes: "",
      templateId: null,
      updatedAt,
    },
    exercises: [
      {
        id: "row-1",
        workoutId: "w-uuid",
        exerciseId,
        position: 0,
        notes: "",
        rest: 90,
        groupId: "",
      },
      {
        id: "row-2",
        workoutId: "w-uuid",
        exerciseId: "back-squat",
        position: 1,
        notes: "",
        rest: 90,
        groupId: "",
      },
    ],
    sets: sets.map((s, i) => ({
      id: `set-${i}`,
      exerciseRowId: i % 2 ? "row-2" : "row-1",
      position: Math.floor(i / 2),
      weight: 80,
      reps: 8,
      duration: 0,
      distance: 0,
      rpe: null,
      rir: null,
      kind: "working",
      completed: s.completed,
      rest: 90,
      tempo: "",
      notes: "",
      side: "both",
    })),
  };
}

test("a workout conflict shows both versions and what differs", () => {
  const done = (n: number, of: number) =>
    Array.from({ length: of }, (_, i) => ({ completed: i < n }));
  const view = conflictView(
    saved(
      "workout",
      workout(done(3, 5)),
      workout(done(6, 6), TODAY - 3_600_000),
    ),
    undefined,
    knows,
    NOW,
  );
  assert.equal(view.title, "Workout · Push day");
  assert.equal(view.phone[0], "2 exercises · 5 sets, 3 done");
  assert.equal(view.cloud[0], "2 exercises · 6 sets");
  assert.match(view.phone[1]!, /^Changed today, /);
  assert.deepEqual(view.differs, ["Sets"]);
  assert.equal(view.update, false);
  assert.doesNotMatch(JSON.stringify(view), /uuid|row-1|set-0/);
});

test("deletions are said in words on either side", () => {
  const cloudDeleted = conflictView(
    saved("workout", workout([{ completed: true }]), {}, true),
    undefined,
    knows,
    NOW,
  );
  assert.deepEqual(cloudDeleted.cloud, ["Deleted on another device"]);
  assert.equal(cloudDeleted.phone[0], "2 exercises · 1 set");
  const localDeleted = conflictView(
    saved("workout", {}, workout([{ completed: true }])),
    { payload: "{}", deleted: 1 },
    knows,
    NOW,
  );
  assert.deepEqual(localDeleted.phone, ["Deleted on this phone"]);
});

test("profile conflicts name the settings that differ, with their values", () => {
  const base = {
    name: "Ada",
    rest: 90,
    theme: "dark",
    weight: 80,
    onboarded: true,
  };
  const view = conflictView(
    saved("profile", base, { ...base, name: "Ada L.", rest: 150, weight: 81 }),
    undefined,
    knows,
    NOW,
  );
  assert.equal(view.title, "Your profile");
  assert.deepEqual(view.differs, [
    "Display name",
    "Default rest",
    "Starting weight",
  ]);
  assert.deepEqual(view.phone, ["Display name: Ada", "Default rest: 90 s"]);
  assert.deepEqual(view.cloud, ["Display name: Ada L.", "Default rest: 150 s"]);
});

test("journal, template and custom exercise conflicts say what differs", () => {
  const entry = {
    id: "j-uuid",
    kind: "measurement",
    date: "2026-10-20",
    data: { name: "Bodyweight", value: 80, unit: "kg" },
    createdAt: 1,
    updatedAt: TODAY,
  };
  const journal = conflictView(
    saved("journal", entry, {
      ...entry,
      date: "2026-10-21",
      data: { ...entry.data, value: 79 },
    }),
    undefined,
    knows,
    NOW,
  );
  assert.deepEqual(journal.differs, ["Date", "Value"]);
  assert.match(journal.phone[0]!, /^Dated /);
  const t = {
    id: "t-uuid",
    name: "Upper A",
    notes: "",
    exercises: [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 8,
        weight: 60,
        rest: 120,
      },
    ],
    updatedAt: TODAY,
  };
  const template = conflictView(
    saved("template", t, {
      ...t,
      name: "Upper B",
      exercises: [{ ...t.exercises[0], sets: 4 }],
    }),
    undefined,
    knows,
    NOW,
  );
  assert.deepEqual(template.differs, ["Name", "Exercises"]);
  assert.equal(template.phone[0], "1 exercise · 3 sets");
  assert.equal(template.cloud[0], "1 exercise · 4 sets");
  const e = {
    id: "custom-uuid",
    name: "Sled drag",
    muscle: "Quadriceps",
    equipment: "Sled",
  };
  const exercise = conflictView(
    saved("exercise", e, { ...e, equipment: "Prowler" }),
    undefined,
    knows,
    NOW,
  );
  assert.deepEqual(exercise.differs, ["Equipment"]);
  assert.deepEqual(exercise.cloud, ["Sled drag", "Quadriceps · Prowler"]);
});

test("a cloud version from a newer Forge waits for an update (M3)", () => {
  const newer = conflictView(
    saved(
      "workout",
      workout([{ completed: true }]),
      workout([{ completed: true }], TODAY, "from-a-newer-forge"),
    ),
    undefined,
    knows,
    NOW,
  );
  assert.equal(newer.update, true);
  assert.equal(
    conflictView(saved("favorite", {}, {}), undefined, knows, NOW).update,
    true,
  );
  const unreadable = conflictView(
    { local: '{"name":"x"}', remote: "not json" },
    undefined,
    knows,
    NOW,
  );
  assert.deepEqual(unreadable, {
    title: "A synced record",
    phone: [],
    cloud: [],
    differs: ["Other details"],
    update: false,
  });
});

test("the waiting change is what 'This phone' shows, not an older saved copy", () => {
  const view = conflictView(
    saved(
      "workout",
      workout([{ completed: true }]),
      workout([{ completed: true }]),
    ),
    {
      payload: JSON.stringify(
        workout([{ completed: true }, { completed: true }]),
      ),
      deleted: 0,
    },
    knows,
    NOW,
  );
  assert.equal(view.phone[0], "2 exercises · 2 sets");
  assert.deepEqual(view.differs, ["Sets"]);
});

// Phase 7.8C: the last complete sync, and what happened to the latest one.

test("the last complete sync is said plainly; an unfinished last sync is said too", () => {
  const now = new Date(2026, 9, 30, 18, 0).getTime();
  const at = new Date(2026, 9, 30, 14, 5).getTime();
  assert.equal(lastSyncText(undefined, false, now), "Not yet");
  assert.equal(lastSyncText(undefined, true, now), "Not recorded yet");
  assert.equal(lastSyncText({ at, outcome: "stopped" }, false, now), "Not yet");
  assert.match(
    lastSyncText({ at, outcome: "complete", completeAt: at }, false, now),
    /^Today, 2:05\sPM$/,
  );
  const later = at + 3_600_000;
  assert.equal(
    lastSyncNote({ at: later, outcome: "complete", completeAt: later }, now),
    undefined,
  );
  assert.match(
    lastSyncNote({ at: later, outcome: "stopped", completeAt: at }, now)!,
    /^Your last sync \(today, 3:05\sPM\) stopped before it finished\.$/,
  );
  assert.match(
    lastSyncNote({ at: later, outcome: "partial" }, now)!,
    /finished, but some records still need attention\.$/,
  );
  for (const text of [
    lastSyncText({ at, outcome: "complete", completeAt: at }, false, now),
    lastSyncNote({ at, outcome: "partial" }, now)!,
  ])
    assert.doesNotMatch(text, /backed up|is safe|protected/i);
});
