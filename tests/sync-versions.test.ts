import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NewerRecordError,
  isHeldRecord,
  type Repository,
} from "../src/data/repository";
import {
  commitPending,
  markPending,
  readPending,
} from "../src/data/pending-deletes";
import { canonical } from "../src/cloud/compare";
import { synchronize } from "../src/cloud/sync";
import { conflictView } from "../src/domain/presentation/account";
import {
  journalSchema,
  profileSchema,
  templateSchema,
  workoutSchema,
} from "../src/domain/validation";
import { FORMAT_KEY, unknownRecordFields } from "../src/domain/format";
import type { Exercise } from "../src/domain/types";
import { cloud, phone, postgres, sync } from "./cloud-fixture";

// Phase 7.8D, Objective 3: records written by a newer Forge keep what this
// version doesn't know, and are never overwritten or deleted by it.

const BENCH = "barbell-bench-press";
const NEWER = { version: 2, minReader: 1 };
type Obj = Record<string, unknown>;

function session(r: Repository, name = "Push day") {
  const w = r.startWorkout(name);
  const row = r.addExercise(w.id, BENCH);
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.finishWorkout(w.id);
  return { w, row };
}
const custom: Exercise = {
  id: "custom-landmine-press",
  name: "Landmine press",
  muscle: "Shoulders",
  secondary: ["Triceps"],
  equipment: "Barbell",
  pattern: "Press",
  difficulty: "Intermediate",
  instructions: ["Press the bar up and forward."],
  mistakes: "",
  safety: "",
  category: "strength",
  unilateral: true,
  tracking: ["weight", "reps"],
};
const recovery = { sleep: 7, quality: 3, soreness: 2, energy: 4, stress: 2 };
const payloadOf = (c: ReturnType<typeof cloud>, id: string) =>
  structuredClone(c.row(id)!.payload) as Obj;

test("profile fields from a newer Forge survive edits, sync, restore and backups", async () => {
  const c = cloud();
  const a = phone();
  a.saveProfile({ name: "Athlete" });
  await sync(a, c);
  // A newer Forge adds a setting this version doesn't know.
  c.put("profile", "profile", {
    ...payloadOf(c, "profile"),
    cycleTracking: true,
    [FORMAT_KEY]: NEWER,
  });
  await sync(a, c);
  assert.equal(a.profile().name, "Athlete");
  assert.equal(a.profileDocument().cycleTracking, true);
  // Editing here sends it back untouched.
  a.saveProfile({ rest: 120 });
  await sync(a, c);
  const sent = payloadOf(c, "profile");
  assert.equal(sent.rest, 120);
  assert.equal(sent.cycleTracking, true);
  assert.deepEqual(sent[FORMAT_KEY], NEWER);
  // Restoring elsewhere, and backing up and restoring, keep it.
  const b = phone();
  await sync(b, c);
  assert.equal(b.profileDocument().cycleTracking, true);
  const restored = phone();
  restored.importBackup(JSON.stringify(b.exportBackup()));
  assert.equal(restored.profileDocument().cycleTracking, true);
  assert.equal(
    (JSON.parse(restored.outboxRow("profile")!.payload) as Obj).cycleTracking,
    true,
  );
  // Clearing a field this version knows still clears it.
  a.saveProfile({ waterGoal: 2500 });
  a.saveProfile({ waterGoal: undefined });
  assert.equal("waterGoal" in a.profileDocument(), false);
  assert.equal(a.profileDocument().cycleTracking, true);
});

test("a custom exercise keeps a newer Forge's fields when edited here", async () => {
  const c = cloud();
  const a = phone();
  a.saveExercise(custom);
  await sync(a, c);
  c.put(custom.id, "exercise", {
    ...payloadOf(c, custom.id),
    demoClip: "landmine-7",
    [FORMAT_KEY]: NEWER,
  });
  await sync(a, c);
  assert.equal(a.exercise(custom.id)!.name, "Landmine press");
  a.saveExercise({ ...a.exercise(custom.id)!, name: "Half-kneeling landmine" });
  await sync(a, c);
  const sent = payloadOf(c, custom.id);
  assert.equal(sent.name, "Half-kneeling landmine");
  assert.equal(sent.demoClip, "landmine-7");
  const copy = phone();
  copy.importBackup(JSON.stringify(a.exportBackup()));
  assert.equal(
    (JSON.parse(copy.outboxRow(custom.id)!.payload) as Obj).demoClip,
    "landmine-7",
  );
});

test("a workout saved by a newer Forge is shown, but this version can't change or delete it", async () => {
  const c = cloud();
  const a = phone();
  const { w, row } = session(a);
  await sync(a, c);
  const newer = payloadOf(c, w.id) as Obj & {
    workout: Obj;
    sets: Obj[];
  };
  newer.workout.effort = 8;
  newer.sets[0]!.tempoMs = 3000;
  newer[FORMAT_KEY] = NEWER;
  c.put(w.id, "workout", newer);
  const result = await sync(a, c);
  assert.equal(result.downloaded, 1);
  assert.equal(result.held.update, 0);
  // Shown, with its sets, and counted in history.
  assert.equal(a.workout(w.id)!.name, "Push day");
  assert.equal(a.workoutSets(w.id).length, 2);
  assert.equal(a.canChange(w.id), false);

  const setId = a.workoutSets(w.id)[0]!.id;
  const before = JSON.stringify([a.workout(w.id), a.workoutSets(w.id)]);
  for (const change of [
    () => a.updateWorkout(w.id, { name: "Renamed" }),
    () => a.addSet(row.id),
    () => a.editSet(setId, { reps: 1 }),
    () => a.removeSet(setId),
    () => a.addExercise(w.id, BENCH),
    () => a.deleteWorkout(w.id),
  ])
    assert.throws(change, (e: unknown) => e instanceof NewerRecordError);
  assert.equal(JSON.stringify([a.workout(w.id), a.workoutSets(w.id)]), before);
  assert.deepEqual(a.outbox(), []);

  // The cloud copy is never replaced.
  const revision = c.row(w.id)!.revision;
  await sync(a, c);
  assert.equal(c.row(w.id)!.revision, revision);
  assert.equal(canonical(c.row(w.id)!.payload), canonical(newer));

  // It travels whole in backups, and stays protected after a restore.
  const backup = a.exportBackup();
  assert.deepEqual(
    backup.newerRecords?.map((n) => n.id),
    [w.id],
  );
  const restored = phone();
  restored.importBackup(JSON.stringify(backup));
  assert.equal(restored.canChange(w.id), false);
  const queued = JSON.parse(restored.outboxRow(w.id)!.payload) as typeof newer;
  assert.equal(queued.workout.effort, 8);
  assert.equal(queued.sets[0]!.tempoMs, 3000);
  assert.throws(
    () => restored.deleteWorkout(w.id),
    (e: unknown) => e instanceof NewerRecordError,
  );
});

test("journal entries and templates from a newer Forge are protected, Undo-delete included", async () => {
  const c = cloud();
  const a = phone();
  const entry = a.addJournal("recovery", recovery);
  const kept = a.addJournal("recovery", { ...recovery, sleep: 8 });
  const template = a.saveTemplate("Upper", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  await sync(a, c);
  // Marked for deletion (Undo showing) just before the newer copy arrives.
  markPending(a, "recovery", kept);
  for (const id of [entry.id, kept.id])
    c.put(id, "journal", { ...payloadOf(c, id), source: "watch" });
  c.put(template.id, "template", {
    ...payloadOf(c, template.id),
    deloadWeek: 4,
  });
  await sync(a, c);
  assert.equal(a.canChange(entry.id), false);
  assert.equal(a.canChange(template.id), false);
  assert.throws(
    () => a.updateJournal(entry.id, { ...recovery, sleep: 9 }),
    /newer version of Forge/,
  );
  assert.throws(() => a.deleteJournal(entry.id), /newer version of Forge/);
  assert.throws(
    () => markPending(a, "recovery", entry),
    (e: unknown) => e instanceof NewerRecordError,
  );
  assert.equal(readPending(a, "recovery")?.id, kept.id);
  // The earlier Undo window ends without deleting it; it shows again.
  assert.equal(commitPending(a, "recovery", kept.id), "newer");
  assert.equal(readPending(a, "recovery"), undefined);
  assert.ok(a.journal("recovery").some((j) => j.id === kept.id));
  assert.throws(
    () =>
      a.saveTemplate(
        "Upper",
        [{ exerciseId: BENCH, sets: 4, reps: 8, weight: 60, rest: 120 }],
        template.id,
      ),
    /newer version of Forge/,
  );
  assert.throws(() => a.deleteTemplate(template.id), /newer version of Forge/);
  assert.deepEqual(a.outbox(), []);
  // Other records stay editable.
  a.addJournal("recovery", { ...recovery, sleep: 6 });
  assert.equal(a.outbox().length, 1);
});

test("a format this version can't read is held, untouched, and never replaced", async () => {
  const c = cloud();
  const a = phone();
  const { w } = session(a);
  await sync(a, c);
  const b = phone();
  await sync(b, c);
  // B changes the workout; meanwhile a much newer Forge rewrites it in a
  // format older versions would misread.
  b.updateWorkout(w.id, { name: "Push day (heavy)" });
  c.put(w.id, "workout", {
    ...payloadOf(c, w.id),
    [FORMAT_KEY]: { version: 3, minReader: 3 },
  });
  c.put("future-entry", "journal", {
    ...payloadOf(c, w.id),
    [FORMAT_KEY]: { version: 3, minReader: 3 },
  });
  const result = await sync(b, c);
  assert.equal(result.held.update, 1);
  assert.equal(result.conflicts, 1);
  const [saved] = b.conflicts();
  // Neither choice can replace or half-apply it.
  assert.throws(
    () => b.keepLocal(saved!.id),
    (e: unknown) => isHeldRecord(e),
  );
  assert.throws(
    () => b.useCloudVersion(saved!.id),
    (e: unknown) => isHeldRecord(e),
  );
  const view = conflictView(saved!, b.outboxRow(saved!.id), (id) =>
    b.knowsExercise(id),
  );
  assert.equal(view.update, true);
  assert.match(
    view.updateText,
    /^The cloud version was saved by a newer version of Forge\./,
  );
  assert.equal(b.workout(w.id)!.name, "Push day (heavy)");
  assert.equal((c.row(w.id)!.payload as Obj)[FORMAT_KEY] !== undefined, true);
  // A newer record that fails this version's checks waits for an update
  // too, rather than counting as unreadable.
  c.put("future-measure", "journal", {
    id: "future-measure",
    kind: "measurement",
    date: "2026-11-01",
    data: { name: "Waist", value: "eighty", unit: "cm" },
    createdAt: 1,
    updatedAt: 1,
    [FORMAT_KEY]: NEWER,
  });
  const again = await sync(a, c);
  assert.equal(again.failed, 0);
  assert.equal(again.held.update, 3);
  assert.equal(a.workout(w.id)!.name, "Push day");
});

test("after Forge is updated, kept records are read again and can be changed", async () => {
  const c = cloud();
  const a = phone();
  const { w } = session(a);
  await sync(a, c);
  const revision = c.row(w.id)!.revision;
  // A copy kept by an earlier version that this version fully understands.
  a.db.run(
    "INSERT INTO newer_records(id,kind,revision,payload) VALUES(?,?,?,?)",
    [w.id, "workout", revision, JSON.stringify(c.row(w.id)!.payload)],
  );
  assert.equal(a.canChange(w.id), false);
  a.migrate();
  assert.equal(a.canChange(w.id), true);
  assert.deepEqual(a.db.all("SELECT * FROM newer_records"), []);
  a.updateWorkout(w.id, { name: "Push day (edited)" });
  assert.equal(a.outbox().length, 1);
  // A kept copy that a later version of the record replaced is dropped.
  a.db.run(
    "INSERT INTO newer_records(id,kind,revision,payload) VALUES(?,?,?,?)",
    [w.id, "workout", revision - 1, '{"stale":true}'],
  );
  assert.equal(a.canChange(w.id), true);
  a.migrate();
  assert.deepEqual(a.db.all("SELECT * FROM newer_records"), []);
});

test("a backup from a newer Forge is refused with a clear message", () => {
  const a = phone();
  a.addJournal("recovery", recovery);
  const before = a.journal().length;
  const newer = { ...a.exportBackup(), version: 2 };
  const other = phone();
  other.addJournal("recovery", { ...recovery, sleep: 5 });
  assert.throws(
    () => other.importBackup(JSON.stringify(newer)),
    /made by a newer version of Forge. Update Forge on this phone, then restore it\./,
  );
  assert.equal(other.journal().length, 1);
  assert.equal(a.journal().length, before);
});

test("unknown fields survive the real cloud table and forge_write", async () => {
  const pg = await postgres();
  try {
    const a = phone(pg.user);
    a.saveProfile({ name: "Athlete" });
    await synchronize(a, pg.transport, pg.user);
    // A newer Forge on another device writes the profile with a new field.
    const { rows } = await pg.db.query<{ payload: Obj; revision: number }>(
      "SELECT payload,revision FROM public.forge_records WHERE id='profile'",
    );
    await pg.db.query("SELECT public.forge_write($1,$2,$3::jsonb,$4,false)", [
      "profile",
      "profile",
      JSON.stringify({
        ...rows[0]!.payload,
        cycleTracking: true,
        [FORMAT_KEY]: NEWER,
      }),
      Number(rows[0]!.revision),
    ]);
    await synchronize(a, pg.transport, pg.user);
    a.saveProfile({ rest: 150 });
    const result = await synchronize(a, pg.transport, pg.user);
    assert.equal(result.uploaded, 1);
    const after = await pg.db.query<{ payload: Obj }>(
      "SELECT payload FROM public.forge_records WHERE id='profile'",
    );
    assert.equal(after.rows[0]!.payload.rest, 150);
    assert.equal(after.rows[0]!.payload.cycleTracking, true);
    assert.deepEqual(after.rows[0]!.payload[FORMAT_KEY], NEWER);
    const restored = phone(pg.user);
    await synchronize(restored, pg.transport, pg.user);
    assert.equal(restored.profileDocument().cycleTracking, true);
  } finally {
    await pg.db.close();
  }
});

test("what this version sends is exactly what older versions already read", async () => {
  const c = cloud();
  const a = phone();
  a.saveProfile({ name: "Athlete", waterGoal: 2500 });
  const { w } = session(a);
  a.saveTemplate("Upper", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  a.addJournal("recovery", recovery);
  a.toggleFavorite(BENCH);
  await sync(a, c);
  for (const row of c.rows.values()) {
    // No format stamp: format 1, as before 7.8D.
    assert.equal(FORMAT_KEY in (row.payload as Obj), false, row.id);
    assert.deepEqual(unknownRecordFields(row.kind, row.payload), [], row.id);
  }
  // The same rules older versions apply accept every record.
  profileSchema.parse(c.row("profile")!.payload);
  workoutSchema.parse((c.row(w.id)!.payload as Obj).workout);
  for (const row of c.rows.values()) {
    if (row.kind === "template") templateSchema.parse(row.payload);
    // A favourite is a journal kind older versions keep as recorded.
    if (row.kind === "journal") journalSchema.parse(row.payload);
  }
  assert.ok(
    [...c.rows.values()].some(
      (row) =>
        row.kind === "journal" && (row.payload as Obj).kind === "favorite",
    ),
  );
});
