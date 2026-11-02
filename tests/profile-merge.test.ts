import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository } from "../src/data/repository";
import { schema, migrationV2 } from "../src/data/schema";
import { exercises as catalog } from "../src/data/catalog";
import { canonical } from "../src/cloud/compare";
import { conflictView } from "../src/domain/presentation/account";
import {
  cloudProfileForPhone,
  mergeProfile,
  wholeSides,
  type ProfileDoc,
} from "../src/domain/profile-merge";
import { FORMAT_KEY } from "../src/domain/format";
import { defaults } from "../src/domain/types";
import { cloud, phone, sqlite, sync, ME } from "./cloud-fixture";

// Phase 7.8D, Objective 2: changes to different profile fields on two
// devices merge; the same field changed differently is the athlete's
// choice, which keeps everything else; nothing is decided by timestamps.

const base: ProfileDoc = { ...defaults, name: "Ada", waterGoal: 2000 };
const V2 = { version: 2, minReader: 1 };
const merged = (m: ReturnType<typeof mergeProfile>) => {
  assert.equal(m.kind, "merged");
  return (m as { profile: ProfileDoc }).profile;
};
const same = (a: unknown, b: unknown) =>
  assert.equal(canonical(a), canonical(b));

// ---- The rules --------------------------------------------------------------

test("changes to different fields merge, in either order", () => {
  const phone = { ...base, name: "Ada L." };
  const other = { ...base, rest: 120 };
  const result = merged(mergeProfile(base, phone, other));
  same(result, { ...base, name: "Ada L.", rest: 120 });
  same(merged(mergeProfile(base, other, phone)), result);
});

test("the same change on both sides needs no choice", () => {
  same(
    merged(mergeProfile(base, { ...base, rest: 60 }, { ...base, rest: 60 })),
    { ...base, rest: 60 },
  );
});

test("one field changed differently is a choice for that field only", () => {
  const m = mergeProfile(
    base,
    { ...base, name: "Phone", rest: 120 },
    { ...base, name: "Cloud", calories: 2500 },
  );
  assert.equal(m.kind, "conflict");
  if (m.kind !== "conflict") return;
  assert.deepEqual(m.fields, ["name"]);
  // Both choices keep every change that didn't conflict.
  same(m.phone, { ...base, name: "Phone", rest: 120, calories: 2500 });
  same(m.cloud, { ...base, name: "Cloud", rest: 120, calories: 2500 });
});

test("clearing a field is a change; clearing against a change is a choice", () => {
  const { waterGoal: _cleared, ...cleared } = base;
  void _cleared;
  same(merged(mergeProfile(base, cleared, { ...base, rest: 75 })), {
    ...cleared,
    rest: 75,
  });
  const m = mergeProfile(base, cleared, { ...base, waterGoal: 2500 });
  assert.equal(m.kind, "conflict");
  if (m.kind !== "conflict") return;
  assert.deepEqual(m.fields, ["waterGoal"]);
  assert.equal("waterGoal" in m.phone, false);
  assert.equal(m.cloud.waterGoal, 2500);
});

test("a field missing because its writer's version predates it keeps its value", () => {
  // Pretend `fluidUnit` arrived in format 2.
  const introducedIn = { fluidUnit: 2 };
  const newer = { ...base, fluidUnit: "oz", [FORMAT_KEY]: V2 };
  const {
    fluidUnit: _f,
    [FORMAT_KEY]: _s,
    ...older
  } = {
    ...newer,
    rest: 45,
  };
  void _f;
  void _s;
  const m = merged(
    mergeProfile(newer, { ...newer, name: "Ada L." }, older, { introducedIn }),
  );
  assert.equal(m.fluidUnit, "oz");
  assert.equal(m.rest, 45);
  assert.equal(m.name, "Ada L.");
  // The same field left out by a version that knows it was cleared.
  const { fluidUnit: _gone, ...cleared } = newer;
  void _gone;
  assert.equal(
    "fluidUnit" in
      merged(mergeProfile(newer, newer, cleared, { introducedIn })),
    false,
  );
  // Applied with no change waiting, the same rule holds.
  assert.equal(
    cloudProfileForPhone(newer, older, introducedIn).fluidUnit,
    "oz",
  );
  assert.equal(
    "fluidUnit" in cloudProfileForPhone(newer, cleared, introducedIn),
    false,
  );
});

test("fields this version doesn't know are never cleared by it or by older versions", () => {
  const known = { ...base, cycleTracking: true, [FORMAT_KEY]: V2 };
  // This phone lost the field somehow: still not a change of its own.
  const { cycleTracking: _c, ...phone } = { ...known, name: "Ada L." };
  void _c;
  same(merged(mergeProfile(known, phone, known)), { ...known, name: "Ada L." });
  // A newer device changes it.
  assert.equal(
    merged(mergeProfile(known, phone, { ...known, cycleTracking: false }))
      .cycleTracking,
    false,
  );
  // An older version's upload without it (no format stamp) keeps it.
  const {
    cycleTracking: _o,
    [FORMAT_KEY]: _s,
    ...older
  } = {
    ...known,
    rest: 45,
  };
  void _o;
  void _s;
  const kept = merged(mergeProfile(known, phone, older));
  assert.equal(kept.cycleTracking, true);
  assert.equal(kept.rest, 45);
  assert.deepEqual(kept[FORMAT_KEY], V2);
  // Without a base, keeping this phone's version keeps the cloud's field.
  assert.equal(wholeSides(phone, known).phone.cycleTracking, true);
});

test("a merge that would break the profile's rules is the athlete's choice", () => {
  const ranged = { ...base, repMin: 8, repMax: 12 };
  const m = mergeProfile(
    ranged,
    { ...ranged, repMin: 11 },
    { ...ranged, repMax: 10 },
  );
  assert.equal(m.kind, "conflict");
  if (m.kind !== "conflict") return;
  assert.deepEqual(m.fields.sort(), ["repMax", "repMin"]);
  // Each choice is one side's whole range, both valid.
  assert.deepEqual([m.phone.repMin, m.phone.repMax], [11, 12]);
  assert.deepEqual([m.cloud.repMin, m.cloud.repMax], [8, 10]);
});

// ---- Two phones, one account -------------------------------------------------

async function twoPhones() {
  const c = cloud();
  const a = phone();
  a.saveProfile({ name: "Ada" });
  await sync(a, c);
  const b = phone();
  await sync(b, c);
  return { c, a, b };
}

test("two phones changing different settings merge, whichever syncs first", async () => {
  for (const first of ["a", "b"] as const) {
    const { c, a, b } = await twoPhones();
    a.saveProfile({ rest: 120 });
    b.saveProfile({ calories: 2600 });
    const [one, two] = first === "a" ? [a, b] : [b, a];
    await sync(one, c);
    const result = await sync(two, c);
    assert.equal(result.conflicts, 0);
    assert.equal(result.uploaded, 1);
    await sync(one, c);
    for (const r of [a, b]) {
      assert.equal(r.profile().name, "Ada");
      assert.equal(r.profile().rest, 120);
      assert.equal(r.profile().calories, 2600);
      assert.deepEqual(r.outbox(), []);
    }
    same(a.profileDocument(), b.profileDocument());
    same(c.row("profile")!.payload, a.profileDocument());
    // Repeating changes nothing.
    for (const r of [a, b]) {
      const again = await sync(r, c);
      assert.equal(again.uploaded + again.downloaded + again.conflicts, 0);
    }
  }
});

test("one setting changed differently: only it is the athlete's choice, and both answers keep the rest", async () => {
  for (const choice of ["keep", "cloud"] as const) {
    const { c, a, b } = await twoPhones();
    a.saveProfile({ name: "Ada A", rest: 120 });
    b.saveProfile({ name: "Ada B", calories: 2600 });
    await sync(a, c);
    const result = await sync(b, c);
    assert.equal(result.conflicts, 1);
    // Nothing is decided yet: B keeps its own name meanwhile.
    assert.equal(b.profile().name, "Ada B");
    const [saved] = b.conflicts();
    const view = conflictView(
      saved!,
      b.outboxRow(saved!.id),
      (id) => b.knowsExercise(id),
      undefined,
      { profile: b.profileConflictSides() },
    );
    assert.equal(view.title, "Your profile");
    assert.deepEqual(view.differs, ["Display name"]);
    assert.deepEqual(view.phone, ["Display name: Ada B"]);
    assert.deepEqual(view.cloud, ["Display name: Ada A"]);

    if (choice === "keep") b.keepLocal("profile");
    else b.useCloudVersion("profile");
    const name = choice === "keep" ? "Ada B" : "Ada A";
    for (const r of [b, a, b]) await sync(r, c);
    for (const r of [a, b]) {
      assert.equal(r.profile().name, name);
      assert.equal(r.profile().rest, 120);
      assert.equal(r.profile().calories, 2600);
      assert.equal(r.conflicts().length, 0);
      assert.deepEqual(r.outbox(), []);
    }
  }
});

test("a saved profile conflict settles once the athlete's own edit resolves it", async () => {
  const { c, a, b } = await twoPhones();
  a.saveProfile({ name: "Ada A" });
  b.saveProfile({ name: "Ada B", rest: 100 });
  await sync(a, c);
  await sync(b, c);
  assert.equal(b.conflicts().length, 1);
  b.saveProfile({ name: "Ada A" });
  const result = await sync(b, c);
  assert.equal(result.conflicts, 0);
  assert.equal(b.conflicts().length, 0);
  await sync(a, c);
  assert.equal(a.profile().rest, 100);
  assert.equal(a.profile().name, "Ada A");
});

test("a lost reply while sending a merged profile settles on the next sync", async () => {
  const { c, a, b } = await twoPhones();
  a.saveProfile({ rest: 120 });
  b.saveProfile({ calories: 2600 });
  await sync(a, c);
  // B's first try meets A's change; the merged upload's reply is lost.
  c.writes.push("ok", "drop-reply");
  assert.equal((await sync(b, c)).stopped, "offline");
  const retry = await sync(b, c);
  assert.equal(retry.conflicts, 0);
  assert.deepEqual(b.outbox(), []);
  await sync(a, c);
  same(a.profileDocument(), b.profileDocument());
});

test("an edit made during a sync is never replaced by a merge", async () => {
  const { c, a, b } = await twoPhones();
  a.saveProfile({ rest: 120 });
  await sync(a, c);
  b.saveProfile({ calories: 2600 });
  const read = b.outboxRow("profile")!;
  // The athlete changes something else before the merge runs.
  b.saveProfile({ duration: 60 });
  assert.equal(b.mergeProfileChange(read, c.row("profile")!), undefined);
  assert.equal(b.profile().duration, 60);
  assert.equal(b.profile().calories, 2600);
  // The next sync merges the latest change instead.
  assert.equal((await sync(b, c)).conflicts, 0);
  await sync(a, c);
  assert.deepEqual(
    [a.profile().rest, a.profile().calories, a.profile().duration],
    [120, 2600, 60],
  );
});

test("an older version's upload without a newer field doesn't erase it here", async () => {
  const { c, a, b } = await twoPhones();
  // A newer device added a setting; both phones keep it.
  c.put("profile", "profile", {
    ...(c.row("profile")!.payload as ProfileDoc),
    cycleTracking: true,
    [FORMAT_KEY]: V2,
  });
  await sync(a, c);
  await sync(b, c);
  b.saveProfile({ calories: 2600 });
  // An older version (before 7.8D) changes the rest timer and, not knowing
  // the setting, uploads the profile without it.
  const {
    cycleTracking: _c,
    [FORMAT_KEY]: _s,
    ...older
  } = c.row("profile")!.payload as ProfileDoc;
  void _c;
  void _s;
  c.put("profile", "profile", { ...older, rest: 45 });
  assert.equal((await sync(b, c)).conflicts, 0);
  const sent = c.row("profile")!.payload as ProfileDoc;
  assert.equal(sent.cycleTracking, true);
  assert.equal(sent.rest, 45);
  assert.equal(sent.calories, 2600);
});

test("a profile change waiting since before 7.8D is a whole-profile choice, with nothing lost", async () => {
  const c = cloud();
  const a = phone();
  a.saveProfile({ name: "Ada" });
  await sync(a, c);
  // The cloud moves on while an older phone has its own change waiting.
  c.put("profile", "profile", {
    ...(c.row("profile")!.payload as ProfileDoc),
    rest: 120,
    cycleTracking: true,
    [FORMAT_KEY]: V2,
  });
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.exec(migrationV2);
  const adapter = sqlite(db);
  for (const e of catalog)
    adapter.run("INSERT INTO exercises(id,data,custom) VALUES(?,?,0)", [
      e.id,
      JSON.stringify(e),
    ]);
  const waiting = JSON.stringify({ ...defaults, name: "Ada", calories: 2600 });
  adapter.run("INSERT INTO profile(id,data) VALUES('local',?)", [waiting]);
  adapter.run("INSERT INTO settings(key,value) VALUES('cloudOwner',?)", [ME]);
  adapter.run("INSERT INTO sync_meta(id,revision) VALUES('profile',1)");
  adapter.run(
    "INSERT INTO outbox(id,kind,payload,revision) VALUES('profile','profile',?,1)",
    [waiting],
  );
  const old = new Repository(adapter);
  old.migrate();
  const result = await sync(old, c);
  // No base to merge against: the athlete chooses, and nothing is lost.
  assert.equal(result.conflicts, 1);
  assert.equal(old.profile().calories, 2600);
  const sides = old.profileConflictSides()!;
  assert.equal(sides.phone.calories, 2600);
  assert.equal(sides.cloud.rest, 120);
  // Keeping this phone's version still keeps the newer device's setting.
  old.keepLocal("profile");
  await sync(old, c);
  const sent = c.row("profile")!.payload as ProfileDoc;
  assert.equal(sent.calories, 2600);
  assert.equal(sent.cycleTracking, true);
  assert.equal(old.conflicts().length, 0);
});

test("the merge base belongs to the account and goes with its data", async () => {
  const { c, b } = await twoPhones();
  assert.equal(b.db.all("SELECT * FROM sync_base").length, 1);
  b.clearData();
  assert.deepEqual(b.db.all("SELECT * FROM sync_base"), []);
  // Another account on this phone starts without it.
  b.setSetting("cloudOwner", "user-b");
  await assert.rejects(() => sync(b, c), /different account/);
});
