import { test } from "node:test";
import assert from "node:assert/strict";
import type { Repository } from "../src/data/repository";
import { cloud, phone, sync, type Cloud, type Fault } from "./cloud-fixture";

// Phase 8.5 (M4): two phones on one account, editing the same food log and
// finished sessions in a random order, syncing over a network that loses
// requests and replies, goes down, or expires the sign-in mid-sync. Conflicts
// are settled the way an athlete would, choosing either version at random.
// Once the network is back and every choice is made:
// - both phones and the cloud hold the same records;
// - every record ends at its most recent edit, or at the version the athlete
//   chose in a conflict (a choice counts as the latest edit): nothing is
//   lost silently, and every choice is honoured;
// - nothing appears that no edit ever wrote.

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DELETED = "(deleted)";
const BENCH = "barbell-bench-press";
type Value = string | number;

/** The food log and finished sessions as one value per record. */
function stateOf(r: Repository) {
  const state = new Map<string, Value>();
  for (const j of r.journal("nutrition")) state.set(j.id, String(j.data.name));
  for (const w of r.workouts())
    if (w.status === "completed")
      state.set(w.id, r.workoutSets(w.id)[0]?.weight ?? DELETED);
  return state;
}
function cloudState(c: Cloud) {
  const state = new Map<string, Value>();
  for (const row of c.rows.values()) {
    if (row.deleted) continue;
    const p = row.payload as {
      kind?: string;
      data?: { name?: unknown };
      sets?: { weight: number }[];
    };
    if (row.kind === "journal" && p.kind === "nutrition")
      state.set(row.id, String(p.data?.name));
    if (row.kind === "workout")
      state.set(row.id, p.sets?.[0]?.weight ?? DELETED);
  }
  return state;
}

const FAULTS: Fault[] = ["drop-request", "drop-reply", "unavailable", "auth"];

for (const seed of [21, 22, 23, 24, 25, 26]) {
  test(`two phones, seed ${seed}: they converge and nothing is lost without the athlete's choice`, async () => {
    const next = random(seed);
    const c = cloud();
    const phones = [phone(), phone()];
    const pick = <T>(list: readonly T[]) =>
      list[Math.floor(next() * list.length)]!;
    /** The most recent edit of each record, on either phone. */
    const latest = new Map<string, Value>();
    /** Every value each record ever had. */
    const written = new Map<string, Set<Value>>();
    /** Records where the athlete chose a version. */
    const chosen = new Set<string>();
    let serial = 0;
    const exercised = { conflicts: 0, faults: 0, syncs: 0 };
    const edit = (id: string, value: Value) => {
      latest.set(id, value);
      written.set(id, (written.get(id) ?? new Set()).add(value));
    };
    const choose = (r: Repository) => {
      for (const conflict of r.conflicts()) {
        chosen.add(conflict.id);
        exercised.conflicts++;
        // The athlete's choice is itself the record's latest edit: the
        // version they keep must be the one every device ends with.
        if (next() < 0.5) {
          edit(conflict.id, stateOf(r).get(conflict.id) ?? DELETED);
          r.keepLocal(conflict.id);
        } else {
          edit(conflict.id, cloudState(c).get(conflict.id) ?? DELETED);
          r.useCloudVersion(conflict.id);
        }
      }
    };
    const trySync = async (r: Repository, faults: boolean) => {
      c.writes.length = 0;
      c.lists.length = 0;
      if (faults) {
        for (let n = Math.floor(next() * 3); n > 0; n--)
          (next() < 0.7 ? c.writes : c.lists).splice(
            Math.floor(next() * 3),
            0,
            pick(FAULTS),
          );
      }
      const queued = c.writes.length + c.lists.length;
      exercised.syncs++;
      try {
        await sync(r, c);
      } catch {
        // A stopped sync: the next one carries on.
      }
      exercised.faults += queued - c.writes.length - c.lists.length;
      c.writes.length = 0;
      c.lists.length = 0;
    };

    for (let step = 0; step < 160; step++) {
      const r = pick(phones);
      const food = [...r.journal("nutrition")];
      const sessions = r.workouts().filter((w) => w.status === "completed");
      const roll = next();
      try {
        if (roll < 0.2) {
          const name = `food ${++serial}`;
          const j = r.addJournal("nutrition", {
            name,
            calories: 100,
            protein: 10,
            carbs: 10,
            fat: 1,
            quantity: 1,
            serving: "1",
            meal: "Lunch",
          });
          edit(j.id, name);
        } else if (roll < 0.35 && food.length) {
          const j = pick(food);
          const name = `food ${++serial}`;
          r.updateJournal(j.id, { ...j.data, name });
          edit(j.id, name);
        } else if (roll < 0.42 && food.length) {
          const j = pick(food);
          r.deleteJournal(j.id);
          edit(j.id, DELETED);
        } else if (roll < 0.52) {
          const weight = ++serial;
          const w = r.startWorkout(`Session ${serial}`);
          const row = r.addExercise(w.id, BENCH);
          r.addSet(row.id, { weight, reps: 5, completed: true });
          r.finishWorkout(w.id);
          edit(w.id, weight);
        } else if (roll < 0.62 && sessions.length) {
          const w = pick(sessions);
          const first = r.workoutSets(w.id)[0];
          if (first) {
            const weight = ++serial;
            r.editSet(first.id, { weight });
            edit(w.id, weight);
          }
        } else if (roll < 0.66 && sessions.length) {
          const w = pick(sessions);
          r.deleteWorkout(w.id);
          edit(w.id, DELETED);
        } else if (roll < 0.72) choose(r);
        else await trySync(r, next() < 0.6);
      } catch (e) {
        // Only a record held for a newer Forge may refuse a change, and this
        // test never creates one.
        throw new Error(`step ${step}: ${(e as Error).message}`);
      }
    }

    // The network is back: sync both phones until nothing is waiting,
    // settling every conflict as it appears.
    for (let round = 0; round < 12; round++) {
      for (const r of phones) {
        choose(r);
        // Time passes: any back-off from a refused change has expired.
        r.db.run("UPDATE outbox SET next_attempt=0");
        await trySync(r, false);
      }
      if (phones.every((r) => !r.outbox().length && !r.conflicts().length))
        break;
    }
    for (const r of phones) {
      assert.deepEqual(r.conflicts(), [], "every conflict settled");
      assert.deepEqual(r.outbox(), [], "nothing left waiting");
    }
    // One final download each, so both phones have seen everything.
    for (const r of phones) await trySync(r, false);

    const [a, b] = phones.map(stateOf) as [
      Map<string, Value>,
      Map<string, Value>,
    ];
    const inCloud = cloudState(c);
    for (const id of new Set([
      ...latest.keys(),
      ...a.keys(),
      ...b.keys(),
      ...inCloud.keys(),
    ])) {
      const values = [
        a.get(id) ?? DELETED,
        b.get(id) ?? DELETED,
        inCloud.get(id) ?? DELETED,
      ];
      assert.deepEqual(
        new Set(values).size,
        1,
        `${id}: phones and cloud disagree (${values.join(" / ")})`,
      );
      const final = values[0]!;
      assert.ok(
        final === DELETED || written.get(id)?.has(final),
        `${id}: ${final} was never written`,
      );
      assert.equal(
        final,
        latest.get(id) ?? DELETED,
        `${id}: ended at ${final}, not its latest edit or the athlete's choice`,
      );
    }
    assert.ok(latest.size > 20, `${latest.size} records`);
    // The run really exercised the hard cases.
    assert.ok(exercised.faults > 5, `${exercised.faults} network faults`);
    assert.ok(exercised.conflicts > 0, `${exercised.conflicts} conflicts`);
    console.log(
      `seed ${seed}: ${latest.size} records, ${exercised.syncs} syncs, ${exercised.faults} faults, ${exercised.conflicts} conflicts settled by choice`,
    );
  });
}
