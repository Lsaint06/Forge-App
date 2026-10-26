import { test } from "node:test";
import assert from "node:assert/strict";
import { exerciseRowText } from "../src/screens/explore/model";
import { exerciseOverline } from "../src/screens/exercise/model";
import { muscleMap, primaryLabel } from "../src/anatomy/mapping";
import { pathRepository } from "./path-fixture";

// Phase 7.2C-3C: Exercise Library row text.

const { r, db } = pathRepository();
const catalog = r.exercises();
db.close();
const find = (id: string) => catalog.find((e) => e.id === id)!;

test("rows show the primary group, reviewed secondary muscles, equipment and pattern", () => {
  assert.deepEqual(exerciseRowText(find("barbell-bench-press")), {
    primary: "Chest",
    secondary: ["Triceps", "Front deltoids"],
    detail: "Barbell · Horizontal push",
    spoken: "Chest · also Triceps, Front deltoids · Barbell · Horizontal push",
  });
  assert.deepEqual(exerciseRowText(find("back-squat")).secondary, ["Glutes"]);
  assert.deepEqual(exerciseRowText(find("lat-pulldown")).secondary, ["Biceps"]);
});

test("the list never contradicts the detail screen", () => {
  // A fly lists no triceps; a leg curl no glutes (display overrides).
  assert.deepEqual(exerciseRowText(find("dumbbell-fly")).secondary, [
    "Front deltoids",
  ]);
  assert.deepEqual(exerciseRowText(find("lying-leg-curl")).secondary, []);
  // 7.2C-3D: the row's primary is the legend's, not the catalogue group,
  // where an override changed it.
  assert.equal(
    exerciseRowText(find("machine-hip-adduction")).primary,
    "Adductors",
  );
  assert.equal(
    exerciseRowText(find("dumbbell-lateral-raise")).primary,
    "Side deltoids",
  );
  for (const e of catalog) {
    const row = exerciseRowText(e);
    const map = muscleMap(e);
    const detail = map.secondary.map((s) => s.label);
    for (const s of row.secondary) assert.ok(detail.includes(s), e.id);
    assert.equal(row.primary, primaryLabel(map, e.muscle), e.id);
    assert.ok(exerciseOverline(e).startsWith(`${row.primary} · `), e.id);
    for (const p of map.primary)
      assert.ok(!row.secondary.includes(p.label), e.id);
  }
});

test("blank fields and custom groups are handled without empty text", () => {
  const row = exerciseRowText({
    id: "custom",
    muscle: "Forearms & grip",
    secondary: [],
    pattern: "",
    equipment: "",
  });
  assert.deepEqual(row, {
    primary: "Forearms & grip",
    secondary: [],
    detail: "",
    spoken: "Forearms & grip",
  });
  assert.equal(exerciseRowText(find("treadmill-run")).secondary.length, 0);
});
