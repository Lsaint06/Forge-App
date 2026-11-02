import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository } from "../src/data/repository";
import { schema, migrationV2 } from "../src/data/schema";
import { exercises as catalog } from "../src/data/catalog";
import { favoriteId } from "../src/domain/validation";
import { defaults, type Journal } from "../src/domain/types";
import { conflictView } from "../src/domain/presentation/account";
import { synchronize } from "../src/cloud/sync";
import {
  cloud,
  phone,
  postgres,
  sqlite,
  sync,
  ME,
  type Cloud,
} from "./cloud-fixture";

// Phase 7.8D, Objective 1: favourites synchronize as one record per exercise
// (a journal entry of kind "favorite"); unfavouriting leaves a deletion.

const BENCH = "barbell-bench-press";
const SQUAT = "back-squat";
const DEADLIFT = "conventional-deadlift";
const legacyList = (r: Repository) =>
  r.db
    .all<{
      exercise_id: string;
    }>("SELECT exercise_id FROM favorites ORDER BY rowid")
    .map((row) => row.exercise_id);
const pending = (r: Repository) =>
  r
    .outbox()
    .map((o) => `${o.id}${o.deleted ? " (deleted)" : ""}@${o.revision}`)
    .sort();

test("a favourite starred on one phone reaches another and survives a restore", async () => {
  const c = cloud();
  const a = phone();
  a.toggleFavorite(BENCH);
  assert.deepEqual(a.favorites(), [BENCH]);
  assert.deepEqual(pending(a), [`${favoriteId(BENCH)}@0`]);
  assert.equal((await sync(a, c)).uploaded, 1);
  assert.deepEqual(a.outbox(), []);

  const b = phone();
  const result = await sync(b, c);
  assert.equal(result.downloaded, 1);
  assert.deepEqual(b.favorites(), [BENCH]);
  // Versions before 7.8D that open this database still see it.
  assert.deepEqual(legacyList(b), [BENCH]);

  // Reinstall: a new phone restores from the cloud.
  const restored = phone();
  await sync(restored, c);
  assert.deepEqual(restored.favorites(), [BENCH]);
});

test("unfavouriting spreads as a deletion and the star never comes back on its own", async () => {
  const c = cloud();
  const a = phone();
  const b = phone();
  a.toggleFavorite(BENCH);
  a.toggleFavorite(SQUAT);
  await sync(a, c);
  await sync(b, c);
  assert.deepEqual(b.favorites(), [BENCH, SQUAT]);

  a.toggleFavorite(SQUAT);
  assert.deepEqual(pending(a), [`${favoriteId(SQUAT)} (deleted)@1`]);
  await sync(a, c);
  assert.equal(c.row(favoriteId(SQUAT))!.deleted, true);

  await sync(b, c);
  assert.deepEqual(b.favorites(), [BENCH]);
  assert.deepEqual(legacyList(b), [BENCH]);
  // Syncing again, restarting, and restoring elsewhere keep it removed.
  for (let i = 0; i < 2; i++) {
    const again = await sync(b, c);
    assert.equal(again.uploaded + again.downloaded + again.conflicts, 0);
  }
  b.migrate();
  assert.deepEqual(b.favorites(), [BENCH]);
  assert.deepEqual(b.outbox(), []);
  const restored = phone();
  await sync(restored, c);
  assert.deepEqual(restored.favorites(), [BENCH]);

  // Starring it again on purpose is an ordinary change.
  b.toggleFavorite(SQUAT);
  await sync(b, c);
  await sync(a, c);
  assert.deepEqual(a.favorites(), [BENCH, SQUAT]);
});

test("offline favourite changes wait, collapse to the latest, and upload later", async () => {
  const c = cloud();
  const a = phone();
  a.toggleFavorite(BENCH);
  a.toggleFavorite(SQUAT);
  a.toggleFavorite(SQUAT);
  // Starred then unstarred offline: one waiting deletion, nothing else.
  assert.deepEqual(
    pending(a),
    [`${favoriteId(BENCH)}@0`, `${favoriteId(SQUAT)} (deleted)@0`].sort(),
  );
  c.writes.push("drop-request");
  const offline = await sync(a, c);
  assert.equal(offline.stopped, "offline");
  assert.equal(offline.pending, 2);
  assert.deepEqual(a.favorites(), [BENCH]);

  const online = await sync(a, c);
  assert.equal(online.stopped, undefined);
  assert.equal(online.pending, 0);
  const b = phone();
  await sync(b, c);
  assert.deepEqual(b.favorites(), [BENCH]);
});

test("two phones starring the same exercise settle without a choice or a duplicate", async () => {
  const c = cloud();
  const a = phone();
  const b = phone();
  a.toggleFavorite(BENCH);
  b.toggleFavorite(BENCH);
  await sync(a, c);
  const result = await sync(b, c);
  assert.equal(result.conflicts, 0);
  assert.equal(result.matched, 1);
  assert.deepEqual(b.outbox(), []);
  assert.deepEqual(
    [...c.rows.keys()].filter((id) => id.startsWith("favorite:")),
    [favoriteId(BENCH)],
  );
  assert.deepEqual(b.favorites(), [BENCH]);
});

test("opposite favourite actions on two phones become an explicit choice", async () => {
  for (const choice of ["keep", "cloud"] as const) {
    const c = cloud();
    const a = phone();
    const b = phone();
    a.toggleFavorite(BENCH);
    await sync(a, c);
    await sync(b, c);
    // A removes it; B, not yet synced, unstars and stars it again.
    a.toggleFavorite(BENCH);
    await sync(a, c);
    b.toggleFavorite(BENCH);
    b.toggleFavorite(BENCH);
    const result = await sync(b, c);
    assert.equal(result.conflicts, 1);
    // Nothing is decided for the athlete: B keeps its star meanwhile.
    assert.deepEqual(b.favorites(), [BENCH]);
    const [saved] = b.conflicts();
    const view = conflictView(
      saved!,
      b.outboxRow(saved!.id),
      (id) => b.knowsExercise(id),
      undefined,
      { exerciseName: (id) => b.exercise(id)?.name },
    );
    assert.equal(view.title, `Favorite exercise · ${b.exercise(BENCH)!.name}`);
    assert.deepEqual(view.phone, ["Favorite on this phone"]);
    assert.deepEqual(view.cloud, ["Removed from favorites on another device"]);
    assert.equal(view.update, false);

    if (choice === "keep") b.keepLocal(saved!.id);
    else b.useCloudVersion(saved!.id);
    await sync(b, c);
    await sync(a, c);
    const expected = choice === "keep" ? [BENCH] : [];
    assert.deepEqual(b.favorites(), expected);
    assert.deepEqual(a.favorites(), expected);
    assert.deepEqual(legacyList(b), expected);
    assert.equal(b.conflicts().length, 0);
  }
});

/** A phone's database as Forge left it before 7.8D, opened by this version. */
function updatedPhone(setup: (db: DatabaseSync) => void, owner = ME) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.exec(migrationV2);
  const adapter = sqlite(db);
  for (const e of catalog)
    adapter.run("INSERT INTO exercises(id,data,custom) VALUES(?,?,0)", [
      e.id,
      JSON.stringify(e),
    ]);
  adapter.run("INSERT INTO profile(id,data) VALUES('local',?)", [
    JSON.stringify({ ...defaults, onboarded: true }),
  ]);
  adapter.run("INSERT INTO settings(key,value) VALUES('cloudOwner',?)", [
    owner,
  ]);
  setup(db);
  const r = new Repository(adapter);
  r.migrate();
  return r;
}

test("a phone updated from before 7.8D uploads its favourites once and never overrides a removal", async () => {
  const c = cloud();
  // Another phone (already updated) starred both; then removed the squat.
  const a = phone();
  a.toggleFavorite(BENCH);
  a.toggleFavorite(SQUAT);
  await sync(a, c);
  a.toggleFavorite(SQUAT);
  await sync(a, c);
  const squatRevision = c.row(favoriteId(SQUAT))!.revision;

  // The older phone had both starred locally, a measurement waiting to
  // upload, and had already downloaded the squat's deletion (stored as an
  // unknown kind, so only its revision remains).
  const b = updatedPhone((db) => {
    db.exec(`
      INSERT INTO favorites VALUES('${BENCH}');
      INSERT INTO favorites VALUES('${SQUAT}');
      INSERT INTO journal VALUES('m1','measurement','2026-10-30','{"name":"Waist","value":82,"unit":"cm"}',1,2);
      INSERT INTO outbox(id,kind,payload,revision) VALUES('m1','journal','{"id":"m1","kind":"measurement","date":"2026-10-30","data":{"name":"Waist","value":82,"unit":"cm"},"createdAt":1,"updatedAt":2}',0);
      INSERT INTO sync_meta VALUES('${favoriteId(SQUAT)}',${squatRevision});
    `);
  });
  assert.deepEqual(b.favorites(), [BENCH, SQUAT]);
  // Both favourites go up as new records; the waiting change is kept.
  assert.deepEqual(
    pending(b),
    [`${favoriteId(BENCH)}@0`, `${favoriteId(SQUAT)}@0`, "m1@0"].sort(),
  );

  const result = await sync(b, c);
  // The bench press matches the cloud; the squat's removal is a choice.
  assert.equal(result.matched, 1);
  assert.equal(result.uploaded, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(b.conflicts()[0]!.id, favoriteId(SQUAT));
  assert.equal(c.row(favoriteId(SQUAT))!.deleted, true);
  assert.equal(c.row(favoriteId(SQUAT))!.revision, squatRevision);
  assert.ok(c.row("m1"));
  // A restart adds nothing more.
  b.migrate();
  assert.deepEqual(pending(b), [`${favoriteId(SQUAT)}@0`]);
});

test("a lost reply while starring or unstarring settles without duplicates", async () => {
  const c = cloud();
  const a = phone();
  a.toggleFavorite(BENCH);
  c.writes.push("drop-reply");
  assert.equal((await sync(a, c)).stopped, "offline");
  assert.equal(c.row(favoriteId(BENCH))!.revision, 1);
  const retry = await sync(a, c);
  assert.equal(retry.conflicts, 0);
  assert.deepEqual(a.outbox(), []);

  a.toggleFavorite(BENCH);
  c.writes.push("drop-reply");
  await sync(a, c);
  const again = await sync(a, c);
  assert.equal(again.conflicts, 0);
  assert.equal(c.row(favoriteId(BENCH))!.deleted, true);
  assert.equal(c.rows.size, 1);
  const b = phone();
  await sync(b, c);
  assert.deepEqual(b.favorites(), []);
});

test("favourites stay with their account", async () => {
  const mine = cloud();
  const theirs = cloud();
  const a = phone();
  a.toggleFavorite(BENCH);
  await sync(a, mine);
  // Another account can't synchronize this phone's data.
  await assert.rejects(
    () => sync(a, theirs, "user-b"),
    /belongs to a different account/,
  );
  assert.equal(theirs.rows.size, 0);
  // Switching accounts starts from cleared data: nothing carries over.
  a.clearData();
  assert.deepEqual(a.favorites(), []);
  assert.deepEqual(legacyList(a), []);
  assert.deepEqual(a.db.all("SELECT * FROM favorites_seen"), []);
  a.setSetting("cloudOwner", "user-b");
  await sync(a, theirs, "user-b");
  assert.deepEqual(a.favorites(), []);
  assert.equal(theirs.rows.size, 0);
});

test("a favourite of an exercise this version doesn't have is kept and synced, not listed", async () => {
  const c = cloud();
  const future = {
    id: favoriteId("future-press"),
    kind: "favorite",
    date: "2026-11-01",
    data: { exerciseId: "future-press" },
    createdAt: 1,
    updatedAt: 1,
  };
  c.put(future.id, "journal", future);
  const b = phone();
  b.toggleFavorite(BENCH);
  const result = await sync(b, c);
  assert.equal(result.failed + result.held.update, 0);
  assert.deepEqual(b.favorites(), [BENCH]);
  assert.deepEqual(legacyList(b), [BENCH]);
  assert.ok(b.exportBackup().journals.some((j) => j.id === future.id));
  assert.deepEqual(c.row(future.id)!.payload, future);
});

test("backups carry favourites both ways without duplicates", async () => {
  // A backup from before 7.8D lists favourites only in `favorites`.
  const old = phone();
  const before = {
    ...old.exportBackup(),
    favorites: [BENCH, SQUAT, BENCH],
  };
  const restored = phone();
  restored.importBackup(JSON.stringify(before));
  assert.deepEqual(restored.favorites(), [BENCH, SQUAT]);
  assert.deepEqual(
    pending(restored).filter((p) => p.startsWith("favorite:")),
    [`${favoriteId(BENCH)}@0`, `${favoriteId(SQUAT)}@0`].sort(),
  );
  // This version's backup carries them as records and in the old list.
  const now = restored.exportBackup();
  assert.deepEqual(now.favorites, [BENCH, SQUAT]);
  assert.equal(now.journals.filter((j) => j.kind === "favorite").length, 2);
  const again = phone();
  again.importBackup(JSON.stringify(now));
  assert.deepEqual(again.favorites(), [BENCH, SQUAT]);
  assert.equal(
    again.journal("favorite").length,
    2,
    "one record per favourite after importing a backup that lists it twice",
  );
  // Uploading the restored favourites to an account that already has them
  // settles without a choice.
  const c = cloud();
  await sync(restored, c);
  const result = await sync(again, c);
  assert.equal(result.conflicts, 0);
  assert.deepEqual(again.outbox(), []);
});

// ---- An older Forge on the same phone ---------------------------------------
// Two versions can share one phone's data: a development phone served by two
// checkouts, or an older TestFlight build installed over a newer one.

/**
 * What a version of Forge from before 7.8D does to this database: it stars
 * and unstars in the older list only, and keeps downloaded favourite records
 * as an unknown kind (Phase 7.3C), or deletes them when they're removed.
 */
function olderForge(r: Repository) {
  return {
    star: (exerciseId: string) =>
      r.db.run("INSERT INTO favorites(exercise_id) VALUES(?)", [exerciseId]),
    unstar: (exerciseId: string) =>
      r.db.run("DELETE FROM favorites WHERE exercise_id=?", [exerciseId]),
    download: (c: Cloud, recordId: string) => {
      const row = c.row(recordId)!;
      if (row.deleted) r.db.run("DELETE FROM journal WHERE id=?", [recordId]);
      else {
        const j = row.payload as Journal;
        r.db.run(
          "INSERT INTO journal(id,kind,date,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,data=excluded.data,updated_at=excluded.updated_at",
          [
            j.id,
            j.kind,
            j.date,
            JSON.stringify(j.data),
            j.createdAt,
            j.updatedAt,
          ],
        );
      }
      r.db.run(
        "INSERT INTO sync_meta(id,revision) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision",
        [recordId, row.revision],
      );
    },
  };
}

test("an older Forge's unstar on this phone is sent as a removal and never comes back", async () => {
  const c = cloud();
  const a = phone();
  a.toggleFavorite(BENCH);
  a.toggleFavorite(SQUAT);
  await sync(a, c);
  const squatRevision = c.row(favoriteId(SQUAT))!.revision;
  olderForge(a).unstar(SQUAT);
  olderForge(a).star(DEADLIFT);

  a.migrate();
  assert.deepEqual(a.favorites(), [BENCH, DEADLIFT]);
  assert.deepEqual(
    pending(a),
    [
      `${favoriteId(DEADLIFT)}@0`,
      `${favoriteId(SQUAT)} (deleted)@${squatRevision}`,
    ].sort(),
  );
  assert.equal((await sync(a, c)).conflicts, 0);
  assert.equal(c.row(favoriteId(SQUAT))!.deleted, true);
  a.migrate();
  a.migrate();
  assert.deepEqual(a.favorites(), [BENCH, DEADLIFT]);
  assert.deepEqual(legacyList(a), [BENCH, DEADLIFT]);
  assert.deepEqual(a.outbox(), []);
  const b = phone();
  await sync(b, c);
  assert.deepEqual(b.favorites(), [BENCH, DEADLIFT]);
});

test("an older Forge's downloads are listed; a removal it downloaded is never silently undone", async () => {
  const c = cloud();
  const a = phone();
  const other = phone();
  a.toggleFavorite(BENCH);
  await sync(a, c);
  await sync(other, c);
  other.toggleFavorite(SQUAT);
  other.toggleFavorite(BENCH);
  await sync(other, c);
  const removal = c.row(favoriteId(BENCH))!;
  assert.equal(removal.deleted, true);
  // The older Forge on phone a downloads both changes.
  olderForge(a).download(c, favoriteId(SQUAT));
  olderForge(a).download(c, favoriteId(BENCH));

  a.migrate();
  assert.ok(a.favorites().includes(SQUAT));
  assert.ok(legacyList(a).includes(SQUAT));
  // The older list still has the bench press, which can't be told apart
  // from a new star there: it's sent as new, and the cloud asks.
  assert.deepEqual(pending(a), [`${favoriteId(BENCH)}@0`]);
  assert.equal((await sync(a, c)).conflicts, 1);
  assert.deepEqual(c.row(favoriteId(BENCH)), removal);

  a.useCloudVersion(favoriteId(BENCH));
  a.migrate();
  await sync(a, c);
  assert.deepEqual(a.favorites(), [SQUAT]);
  assert.deepEqual(legacyList(a), [SQUAT]);
  assert.deepEqual(a.outbox(), []);
  assert.deepEqual(a.conflicts(), []);
  assert.deepEqual(c.row(favoriteId(BENCH)), removal);
});

test("an older Forge's unstar of a favourite that changed elsewhere meanwhile becomes a choice", async (t) => {
  // A stopped clock: both phones' records are identical, timestamps
  // included, so only revisions can tell that the cloud moved on.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-01T12:00") });
  const c = cloud();
  const a = phone();
  const other = phone();
  a.toggleFavorite(BENCH);
  await sync(a, c);
  await sync(other, c);
  // Another phone removes the bench press and stars it again. The older
  // Forge on phone a downloads that, and the athlete unstars it there; which
  // came first isn't known.
  other.toggleFavorite(BENCH);
  await sync(other, c);
  other.toggleFavorite(BENCH);
  await sync(other, c);
  olderForge(a).download(c, favoriteId(BENCH));
  olderForge(a).unstar(BENCH);

  a.migrate();
  assert.deepEqual(a.favorites(), []);
  assert.deepEqual(pending(a), [`${favoriteId(BENCH)} (deleted)@0`]);
  assert.equal((await sync(a, c)).conflicts, 1);
  assert.equal(c.row(favoriteId(BENCH))!.deleted, false);
  a.keepLocal(favoriteId(BENCH));
  await sync(a, c);
  await sync(other, c);
  assert.equal(c.row(favoriteId(BENCH))!.deleted, true);
  assert.deepEqual(a.favorites(), []);
  assert.deepEqual(other.favorites(), []);
  a.migrate();
  assert.deepEqual(a.favorites(), []);
  assert.deepEqual(a.outbox(), []);
});

test("a favourite that can't be settled is left as it was and never stops Forge from opening", () => {
  // Longer than any exercise identity this version accepts.
  const odd = "x".repeat(200);
  const r = updatedPhone((db) => {
    db.prepare("INSERT INTO exercises(id,data,custom) VALUES(?,?,1)").run(
      odd,
      JSON.stringify({ id: odd, name: "Odd" }),
    );
    db.exec(`
      INSERT INTO favorites VALUES('${odd}');
      INSERT INTO favorites VALUES('${BENCH}');
    `);
  });
  assert.deepEqual(r.favorites(), [BENCH]);
  assert.deepEqual(legacyList(r), [odd, BENCH]);
  assert.deepEqual(pending(r), [`${favoriteId(BENCH)}@0`]);
  r.migrate();
  assert.deepEqual(legacyList(r), [odd, BENCH]);
  assert.deepEqual(pending(r), [`${favoriteId(BENCH)}@0`]);
});

test("two phones updated from before 7.8D share their favourites once, without a choice", async () => {
  const c = cloud();
  const a = updatedPhone((db) =>
    db.exec(`
      INSERT INTO favorites VALUES('${BENCH}');
      INSERT INTO favorites VALUES('${SQUAT}');
    `),
  );
  const b = updatedPhone((db) =>
    db.exec(`
      INSERT INTO favorites VALUES('${SQUAT}');
      INSERT INTO favorites VALUES('${DEADLIFT}');
    `),
  );
  await sync(a, c);
  assert.equal((await sync(b, c)).conflicts, 0);
  await sync(a, c);
  // Before 7.8D each phone's list was its own and removals weren't
  // recorded, so the account starts with every favourite either phone had.
  const all = [BENCH, DEADLIFT, SQUAT].sort();
  assert.deepEqual([...a.favorites()].sort(), all);
  assert.deepEqual([...b.favorites()].sort(), all);
  assert.equal(c.rows.size, 3);
  a.migrate();
  b.migrate();
  assert.deepEqual(a.outbox(), []);
  assert.deepEqual(b.outbox(), []);
});

test("on the real cloud table, an updated phone's favourite never replaces a removal", async () => {
  const pg = await postgres();
  const row = async () =>
    (
      await pg.db.query(
        "SELECT payload,revision,deleted,updated_at FROM public.forge_records WHERE id=$1",
        [favoriteId(BENCH)],
      )
    ).rows[0];
  try {
    const a = phone(pg.user);
    a.toggleFavorite(BENCH);
    await synchronize(a, pg.transport, pg.user);
    a.toggleFavorite(BENCH);
    await synchronize(a, pg.transport, pg.user);
    const removal = await row();
    assert.equal((removal as { deleted: boolean }).deleted, true);

    const b = updatedPhone(
      (db) => db.exec(`INSERT INTO favorites VALUES('${BENCH}');`),
      pg.user,
    );
    assert.deepEqual(pending(b), [`${favoriteId(BENCH)}@0`]);
    assert.equal((await synchronize(b, pg.transport, pg.user)).conflicts, 1);
    assert.deepEqual(await row(), removal);
    b.useCloudVersion(favoriteId(BENCH));
    b.migrate();
    await synchronize(b, pg.transport, pg.user);
    assert.deepEqual(b.favorites(), []);
    assert.deepEqual(b.outbox(), []);
    assert.deepEqual(await row(), removal);
  } finally {
    await pg.db.close();
  }
});
