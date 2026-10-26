import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { litRegions, muscleMap, spokenMuscles } from "../src/anatomy/mapping";
import { ENTRY, groupEntry } from "../src/anatomy/groups";
import { OVERRIDES } from "../src/anatomy/overrides";
import type { RegionId } from "../src/anatomy/types";
import { pathRepository } from "./path-fixture";

// Phase 7.2C-3A: exercise → anatomy atlas mapping (presentation only).

const { r, db } = pathRepository();
const catalog = r.exercises();
db.close();
const byId = (id: string) => {
  const e = catalog.find((x) => x.id === id);
  assert.ok(e, `catalogue has ${id}`);
  return e;
};
const regions = (entries: { regions: RegionId[] }[]) =>
  entries.flatMap((x) => x.regions);
const labels = (entries: { label: string }[]) => entries.map((x) => x.label);

// Region ids in the generated atlas (read as text: it requires images).
const generated = readFileSync(
  join(__dirname, "../src/anatomy/atlas.generated.ts"),
  "utf8",
);
const atlasRegions = new Set<string>();
for (const view of ["front", "back"]) {
  const block = generated
    .split(`export const ${view}`)[1]!
    .split("export const")[0]!;
  for (const m of block.matchAll(/"?([a-z][a-z-]*)"?: \{\s+primary/g))
    atlasRegions.add(`${view}.${m[1]}`);
}

test("the three approved prototypes map exactly as reviewed", () => {
  const bench = muscleMap(byId("barbell-bench-press"));
  assert.deepEqual(regions(bench.primary), ["front.pectoralis-major"]);
  assert.deepEqual(labels(bench.secondary), ["Triceps", "Front deltoids"]);
  assert.deepEqual(regions(bench.secondary), ["back.triceps", "front.deltoid"]);
  const lat = muscleMap(byId("lat-pulldown"));
  assert.deepEqual(regions(lat.primary), ["back.latissimus-dorsi"]);
  assert.deepEqual(regions(lat.secondary), ["front.biceps"]);
  const squat = muscleMap(byId("back-squat"));
  assert.deepEqual(regions(squat.primary), ["front.quadriceps"]);
  assert.deepEqual(squat.primary[0]!.muscles, [
    "Rectus femoris",
    "Vastus lateralis",
    "Vastus medialis",
  ]);
  assert.deepEqual(regions(squat.secondary), ["back.gluteus-maximus"]);
  for (const m of [bench, lat, squat]) assert.equal(m.override, undefined);
});

test("every catalogue exercise maps deterministically and only to drawn regions", () => {
  for (const e of catalog) {
    const a = muscleMap(e);
    assert.deepEqual(muscleMap(e), a, e.id);
    if (a.fullBody) {
      assert.equal(regions(a.primary).length + regions(a.secondary).length, 0);
      continue;
    }
    assert.ok(a.primary.length > 0, `${e.id} has a primary`);
    for (const id of [...regions(a.primary), ...regions(a.secondary)])
      assert.ok(atlasRegions.has(id), `${e.id}: ${id} is in the atlas`);
    // No region is both primary and secondary.
    const p = new Set(regions(a.primary));
    for (const id of regions(a.secondary))
      assert.ok(!p.has(id), `${e.id}: ${id}`);
  }
});

test("overrides name real exercises and never add a muscle group", () => {
  const groupsOf = (entries: { label: string }[]) =>
    entries.map((x) => x.label);
  for (const [id, o] of Object.entries(OVERRIDES)) {
    const e = byId(id);
    assert.ok(o.reason.length > 10, `${id} documents a reason`);
    // Secondary overrides only remove or narrow what the catalogue lists.
    if (o.secondary) {
      const listed = e.secondary
        .map((g) => groupEntry(g, e.pattern, "secondary"))
        .filter(Boolean)
        .flatMap((x) => x!.regions);
      for (const rid of regions(o.secondary))
        assert.ok(listed.includes(rid), `${id}: ${rid} is narrowed, not added`);
    }
    if (o.primary)
      assert.ok(groupsOf(o.primary).length > 0, `${id} keeps a primary`);
  }
});

test("fly variations drop the triceps; presses keep them", () => {
  for (const id of ["dumbbell-fly", "pec-deck-fly", "cable-crossover"]) {
    const m = muscleMap(byId(id));
    assert.deepEqual(labels(m.secondary), ["Front deltoids"], id);
  }
  const squeeze = muscleMap(byId("dumbbell-squeeze-press"));
  assert.deepEqual(labels(squeeze.secondary), ["Triceps", "Front deltoids"]);
});

test("deltoid work shows the trained head and drops the default triceps", () => {
  const front = muscleMap(byId("dumbbell-front-raise"));
  assert.deepEqual(regions(front.primary), ["front.deltoid"]);
  assert.equal(front.primary[0]!.label, "Front deltoids");
  assert.deepEqual(front.secondary, []);
  const side = muscleMap(byId("dumbbell-lateral-raise"));
  assert.deepEqual(regions(side.primary), ["front.deltoid", "back.deltoid"]);
  const rear = muscleMap(byId("bent-over-reverse-fly"));
  assert.deepEqual(regions(rear.primary), ["back.deltoid"]);
  // Face pulls are read from the pattern, no override needed.
  const face = muscleMap(byId("face-pull"));
  assert.equal(face.override, undefined);
  assert.equal(face.primary[0]!.label, "Rear deltoids");
  assert.deepEqual(regions(face.secondary), ["back.trapezius"]);
  // A press keeps both front heads and the triceps.
  const ohp = muscleMap(byId("overhead-press"));
  assert.deepEqual(ohp.primary[0]!.muscles, [
    "Anterior deltoid",
    "Lateral deltoid",
  ]);
  assert.deepEqual(labels(ohp.secondary), ["Triceps"]);
  // A muscle that cannot be seen is named and not drawn.
  const internal = muscleMap(byId("cable-internal-rotation"));
  assert.deepEqual(internal.primary[0]!.muscles, ["Subscapularis"]);
  assert.deepEqual(regions(internal.primary), []);
});

test("hip, knee and back corrections are conservative", () => {
  assert.deepEqual(labels(muscleMap(byId("lying-leg-curl")).secondary), []);
  assert.deepEqual(labels(muscleMap(byId("leg-extension")).secondary), []);
  assert.deepEqual(regions(muscleMap(byId("machine-hip-adduction")).primary), [
    "front.adductors",
  ]);
  assert.deepEqual(regions(muscleMap(byId("cable-hip-abduction")).primary), [
    "back.gluteus-medius",
  ]);
  assert.deepEqual(labels(muscleMap(byId("barbell-shrug")).secondary), []);
  assert.deepEqual(regions(muscleMap(byId("barbell-shrug")).primary), [
    "front.trapezius",
    "back.trapezius",
  ]);
  assert.deepEqual(regions(muscleMap(byId("seated-cable-row")).primary), [
    "back.latissimus-dorsi",
    "back.trapezius",
  ]);
  assert.deepEqual(regions(muscleMap(byId("dumbbell-pullover")).primary), [
    "back.latissimus-dorsi",
  ]);
  // Deadlifts show what the catalogue lists; erectors await review (A2).
  const dl = muscleMap(byId("conventional-deadlift"));
  assert.deepEqual(regions(dl.primary), ["back.hamstrings"]);
  assert.deepEqual(regions(dl.secondary), ["back.gluteus-maximus"]);
});

test("no secondaries, full-body work and custom exercises stay honest", () => {
  const calf = muscleMap(byId("standing-calf-raise"));
  assert.deepEqual(regions(calf.primary), [
    "back.gastrocnemius",
    "back.soleus",
  ]);
  assert.deepEqual(calf.secondary, []);
  const run = muscleMap(byId("treadmill-run"));
  assert.equal(run.fullBody, true);
  assert.deepEqual(run.primary, []);
  assert.match(spokenMuscles(run), /^Full body conditioning/);
  // Custom exercises use the same rules; an unknown group is named only.
  const custom = muscleMap({
    id: "custom-1",
    muscle: "Chest",
    secondary: ["Forearms"],
    pattern: "custom",
  });
  assert.deepEqual(regions(custom.primary), ["front.pectoralis-major"]);
  assert.deepEqual(custom.secondary, [
    { label: "Forearms", muscles: [], regions: [] },
  ]);
  assert.deepEqual(
    muscleMap({ id: "custom-2", muscle: "", secondary: [], pattern: "" })
      .primary,
    [],
  );
});

test("lit regions keep primary over secondary, and the legend reads aloud", () => {
  const bench = muscleMap(byId("barbell-bench-press"));
  assert.deepEqual(
    [...litRegions(bench)],
    [
      ["back.triceps", "secondary"],
      ["front.deltoid", "secondary"],
      ["front.pectoralis-major", "primary"],
    ],
  );
  assert.equal(
    spokenMuscles(bench),
    "Primary: Chest, pectoralis major. Secondary: Triceps, triceps brachii; Front deltoids, anterior deltoid.",
  );
  assert.ok(Object.keys(ENTRY).length >= 20);
});
