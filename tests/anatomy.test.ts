import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  litRegions,
  muscleMap,
  primaryLabel,
  spokenMuscles,
} from "../src/anatomy/mapping";
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
    // Secondary overrides only remove, narrow or demote what the catalogue
    // lists (a bent-knee calf raise shows the gastrocnemius as secondary).
    if (o.secondary) {
      const listed = [e.muscle, ...e.secondary]
        .flatMap((g) => [
          groupEntry(g, e.pattern, "primary"),
          groupEntry(g, e.pattern, "secondary"),
        ])
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
  // 7.2C-3D: floor deadlifts show the gluteus maximus as a prime mover with
  // the hamstrings; Romanian deadlifts keep the hamstring emphasis.
  // Erectors await catalogue review (A2, C-5).
  const dl = muscleMap(byId("conventional-deadlift"));
  assert.deepEqual(regions(dl.primary), [
    "back.hamstrings",
    "back.gluteus-maximus",
  ]);
  assert.deepEqual(dl.secondary, []);
  const rdl = muscleMap(byId("romanian-deadlift"));
  assert.deepEqual(regions(rdl.primary), ["back.hamstrings"]);
  assert.deepEqual(regions(rdl.secondary), ["back.gluteus-maximus"]);
  assert.deepEqual(labels(muscleMap(byId("kettlebell-swing")).primary), [
    "Glutes",
    "Hamstrings",
  ]);
});

// Which catalogue group each atlas entry belongs to. Exhaustive, so a new
// entry must declare its group.
const GROUP_OF = {
  chest: "Chest",
  protractors: "Chest",
  deltoids: "Shoulders",
  pressDeltoids: "Shoulders",
  frontDeltoids: "Shoulders",
  sideDeltoids: "Shoulders",
  rearDeltoids: "Shoulders",
  externalRotators: "Shoulders",
  internalRotators: "Shoulders",
  lats: "Back",
  upperBack: "Back",
  retractors: "Back",
  traps: "Back",
  biceps: "Biceps",
  brachioradialis: "Biceps",
  triceps: "Triceps",
  core: "Core",
  obliques: "Core",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  gluteMedius: "Glutes",
  adductors: "Adductors",
  calves: "Calves",
  soleus: "Calves",
  gastrocnemius: "Calves",
  tibialis: "Tibialis",
} satisfies Record<keyof typeof ENTRY, string>;

test("overrides only use muscle groups the catalogue lists for the exercise", () => {
  // Hip adduction is filed under Glutes; the adductor display is the one
  // documented correction (C-4).
  const misfiled = new Set(["cable-hip-adduction", "machine-hip-adduction"]);
  for (const [id, o] of Object.entries(OVERRIDES)) {
    const e = byId(id);
    const listed = new Set([e.muscle, ...e.secondary]);
    for (const x of [...(o.primary ?? []), ...(o.secondary ?? [])]) {
      const key = (Object.keys(ENTRY) as (keyof typeof ENTRY)[]).find(
        (k) => ENTRY[k] === x,
      );
      assert.ok(key, `${id}: override entries come from ENTRY`);
      const group = GROUP_OF[key];
      assert.ok(
        listed.has(group) || (misfiled.has(id) && group === "Adductors"),
        `${id}: ${key} (${group}) is listed in the catalogue`,
      );
    }
  }
});

test("7.2C-3D: trunk, calf, curl and scapular corrections", () => {
  // Rotation and side bending narrow to the obliques; flexion keeps both.
  for (const id of ["russian-twist", "cable-woodchop", "side-plank"]) {
    const m = muscleMap(byId(id));
    assert.deepEqual(labels(m.primary), ["Obliques"], id);
    assert.deepEqual(regions(m.primary), ["front.obliques", "back.obliques"]);
  }
  assert.deepEqual(labels(muscleMap(byId("crunch")).primary), ["Core"]);
  assert.deepEqual(labels(muscleMap(byId("pallof-press")).primary), ["Core"]);
  // Bent knee: soleus leads; straight knee keeps the whole calf.
  const seated = muscleMap(byId("seated-calf-raise"));
  assert.deepEqual(regions(seated.primary), ["back.soleus"]);
  assert.deepEqual(regions(seated.secondary), ["back.gastrocnemius"]);
  assert.deepEqual(regions(muscleMap(byId("standing-calf-raise")).primary), [
    "back.gastrocnemius",
    "back.soleus",
  ]);
  // Pronated curls name the brachioradialis without drawing it; hammer
  // curls are unchanged.
  const reverse = muscleMap(byId("reverse-barbell-curl"));
  assert.deepEqual(labels(reverse.primary), ["Biceps", "Forearm"]);
  assert.deepEqual(regions(reverse.primary), ["front.biceps"]);
  assert.equal(muscleMap(byId("hammer-curl")).override, undefined);
  // Scapular push-ups: protractors, named, nothing drawn, no triceps.
  const scap = muscleMap(byId("scapular-push-up"));
  assert.deepEqual(scap.primary[0]!.muscles, [
    "Serratus anterior",
    "Pectoralis minor",
  ]);
  assert.deepEqual(regions(scap.primary), []);
  assert.deepEqual(scap.secondary, []);
  assert.deepEqual(labels(muscleMap(byId("push-up")).secondary), [
    "Triceps",
    "Front deltoids",
  ]);
});

test("primaryLabel uses the legend's words and falls back to the group", () => {
  const label = (id: string) => {
    const e = byId(id);
    return primaryLabel(muscleMap(e), e.muscle);
  };
  assert.equal(label("barbell-bench-press"), "Chest");
  assert.equal(label("dumbbell-lateral-raise"), "Side deltoids");
  assert.equal(label("machine-hip-adduction"), "Adductors");
  assert.equal(label("conventional-deadlift"), "Hamstrings · Glutes");
  assert.equal(label("treadmill-run"), "Full body");
  assert.equal(
    primaryLabel(
      muscleMap({ id: "c", muscle: "", secondary: [], pattern: "" }),
      "",
    ),
    "",
  );
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
