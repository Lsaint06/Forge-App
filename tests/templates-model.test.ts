import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_THRESHOLD,
  filterTemplates,
  showsSearch,
} from "../src/screens/templates/model";
import type { Template } from "../src/domain/types";

// Phase 7.2C-2: template search (founder decision C6).

const names: Record<string, string> = {
  bench: "Barbell Bench Press",
  squat: "Back Squat",
  row: "Barbell Bent-Over Row",
};
const t = (name: string, ...ids: string[]): Template => ({
  id: name,
  name,
  notes: "",
  updatedAt: 0,
  exercises: ids.map((exerciseId) => ({
    exerciseId,
    sets: 3,
    reps: 8,
    weight: 0,
    rest: 90,
  })),
});
const list = [
  t("Full body", "squat", "bench", "row"),
  t("Lower A", "squat"),
  t("Pull day", "row"),
  t("Push day", "bench"),
];
const find = (q: string) =>
  filterTemplates(list, q, (id) => names[id]).map((x) => x.name);

test("search appears only above eight templates", () => {
  assert.equal(SEARCH_THRESHOLD, 8);
  assert.equal(showsSearch(0), false);
  assert.equal(showsSearch(8), false);
  assert.equal(showsSearch(9), true);
});

test("search matches names and exercises, every word, ignoring case and accents", () => {
  assert.deepEqual(
    find(""),
    list.map((x) => x.name),
  );
  assert.deepEqual(
    find("  "),
    list.map((x) => x.name),
  );
  assert.deepEqual(find("day"), ["Pull day", "Push day"]);
  assert.deepEqual(find("SQUAT"), ["Full body", "Lower A"]);
  assert.deepEqual(find("bench full"), ["Full body"]);
  assert.deepEqual(find("prèss"), ["Full body", "Push day"]);
  assert.deepEqual(find("deadlift"), []);
  // Missing exercises never break the search.
  assert.deepEqual(
    filterTemplates([t("Odd", "gone")], "odd", () => undefined).map(
      (x) => x.name,
    ),
    ["Odd"],
  );
});
