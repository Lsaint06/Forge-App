import { test } from "node:test";
import assert from "node:assert/strict";
import { exercises as catalog } from "../src/data/catalog";
import released from "./fixtures/catalogue-ids.json";

// Phase 7.8B, M3: workouts, templates, goals, backups and every phone's
// cloud records name catalogue exercises by id. An id that disappears would
// make those records unreadable: restores and backups would fail on them.
// So ids are only ever added. `catalogue-ids.json` lists every id released
// so far (all four versions of the catalogue, checked when it was made);
// add new ids to it when the catalogue grows, and never remove one.

test("M3: no released catalogue exercise id is ever removed or renamed", () => {
  const current = new Set(catalog.map((e) => e.id));
  const missing = (released as string[]).filter((id) => !current.has(id));
  assert.deepEqual(
    missing,
    [],
    "Keep these exercises in the catalogue (they can be hidden, not removed): records already use them",
  );
});

test("catalogue ids are unique", () => {
  const ids = catalog.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});
