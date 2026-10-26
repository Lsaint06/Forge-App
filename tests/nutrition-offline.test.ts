import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathRepository } from "./path-fixture";
import {
  TARGETS_SAVED,
  entriesOn,
  entryFromFood,
  savedChoice,
  targetsPersonalized,
  totalsOf,
} from "../src/domain/nutrition";
import { readTargets, targetTexts } from "../src/domain/targets";
import { localDate } from "../src/domain/types";

// Phase 7.3H: Nutrition needs no network. Targets, logged food and saved
// foods are written to the device database with the network cut, survive a
// restart (the database closed and reopened), and wait in the sync outbox.
// Personal barcode foods and corrections have their own restart test
// (personal-foods.test.ts); search, branded lookup and scanning theirs.

test("targets, logs and saved foods work offline and survive a restart", () => {
  const original = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls++;
    throw new Error("offline");
  }) as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), "forge-nutrition-"));
  const file = join(dir, "forge.db");
  const today = localDate();
  try {
    const first = pathRepository(file);
    let before: string;
    try {
      const { r } = first;
      // Unset targets stay suggestions until saved explicitly.
      assert.equal(
        targetsPersonalized(r.profile(), r.setting(TARGETS_SAVED) === "1"),
        false,
      );
      const read = readTargets(r.profile(), {
        ...targetTexts(r.profile()),
        calories: "2650",
        protein: "190",
      });
      assert.ok("values" in read);
      r.saveProfile(read.values);
      r.setSetting(TARGETS_SAVED, "1");
      const oats = r.addJournal("food", {
        name: "Oats",
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
        quantity: 1,
        serving: "40 g",
      });
      r.addJournal(
        "nutrition",
        entryFromFood(savedChoice(oats), "Breakfast", 2),
      );
      r.addJournal("nutrition", {
        name: "Chicken",
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        quantity: 1,
        serving: "100 g",
        meal: "Lunch",
      });
      before = JSON.stringify(r.journal("nutrition"));
      // Every write waits for the next sync.
      const queued = new Set(r.outbox().map((o) => o.id));
      for (const j of [...r.journal("food"), ...r.journal("nutrition")])
        assert.ok(queued.has(j.id), `${j.id} queued`);
    } finally {
      first.db.close();
    }

    const reopened = pathRepository(file);
    try {
      const { r } = reopened;
      const p = r.profile();
      assert.equal(p.calories, 2650);
      assert.equal(p.protein, 190);
      assert.equal(
        targetsPersonalized(p, r.setting(TARGETS_SAVED) === "1"),
        true,
      );
      assert.equal(JSON.stringify(r.journal("nutrition")), before);
      const totals = totalsOf(entriesOn(r.journal("nutrition"), today));
      assert.equal(totals.calories, 465);
      assert.equal(totals.protein, 41);
      assert.deepEqual(
        r.journal("food").map((f) => f.data.name),
        ["Oats"],
      );
    } finally {
      reopened.db.close();
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
