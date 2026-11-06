import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeText,
  dayNumber,
  defaultRange,
  editText,
  editedRecord,
  inRange,
  nameKey,
  newRecord,
  newestFirst,
  overRange,
  plausibility,
  profileWeightOffer,
  readValue,
  seriesOf,
  sincePrevious,
  valueText,
  type Entry,
} from "../src/domain/measurements";
import { latestBodyweight } from "../src/domain/analytics";
import { pathRepository } from "./path-fixture";

// Phase 7B WP4B: measurement grouping, ordering, per-day series, ranges,
// comparisons, units and change-only edits. Records keep their shape.

let n = 0;
const e = (
  date: string,
  name: string,
  value: number,
  unit = "kg",
  extra: Partial<Entry> = {},
): Entry => ({
  id: `id-${String(++n).padStart(3, "0")}`,
  date,
  createdAt: n * 1000,
  updatedAt: n * 1000,
  data: { name, value, unit },
  ...extra,
});

test("spelling variants share a series without renaming anything", () => {
  const list = [
    e("2026-10-01", "Bodyweight", 84),
    e("2026-10-08", "Body weight", 83),
    e("2026-10-15", " BODYWEIGHT ", 82.5),
    e("2026-10-01", "Waist", 86, "cm"),
    e("2026-10-08", "waist ", 85, "cm"),
    e("2026-10-08", "Right arm (flexed)", 38, "cm"),
  ];
  const before = JSON.stringify(list);
  const s = seriesOf(list);
  assert.equal(s.length, 3);
  const bw = s.find((x) => x.bodyweight)!;
  assert.deepEqual(
    bw.days.map((d) => d.value),
    [84, 83, 82.5],
  );
  assert.equal(bw.name, "BODYWEIGHT");
  assert.equal(s.find((x) => x.key === "waist|length")!.days.length, 2);
  assert.equal(JSON.stringify(list), before);
  assert.equal(nameKey("Body  weight"), "bodyweight");
  assert.equal(nameKey("Waist "), "waist");
});

test("one name holding different unit families is never combined", () => {
  const s = seriesOf([
    e("2026-10-01", "Waist", 84, "cm"),
    e("2026-10-02", "Waist", 30, "percent"),
  ]);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.family).sort(), ["length", "percent"]);
});

test("one comparator everywhere: day, then created, then updated, then ID", () => {
  const a = e("2026-10-10", "Bodyweight", 80, "kg", {
    id: "b",
    createdAt: 5,
    updatedAt: 5,
  });
  const b = e("2026-10-10", "Bodyweight", 81, "kg", {
    id: "a",
    createdAt: 5,
    updatedAt: 9,
  });
  const c = e("2026-10-10", "Bodyweight", 82, "kg", {
    id: "c",
    createdAt: 5,
    updatedAt: 9,
  });
  const d = e("2026-10-10", "Bodyweight", 83, "kg", {
    id: "z",
    createdAt: 9,
    updatedAt: 1,
  });
  const older = e("2026-10-09", "Bodyweight", 90, "kg", {
    createdAt: 99,
    updatedAt: 99,
  });
  const sorted = [a, b, c, d, older].sort(newestFirst);
  assert.deepEqual(
    sorted.map((x) => x.data.value),
    [83, 82, 81, 80, 90],
  );
  // Every input order gives the same result.
  assert.deepEqual(
    [older, d, c, b, a].sort(newestFirst).map((x) => x.id),
    sorted.map((x) => x.id),
  );
  // The day's chart point is its latest entry; all entries are kept.
  const s = seriesOf([a, b, c, d, older])[0]!;
  assert.equal(s.entries.length, 5);
  assert.deepEqual(
    s.days.map((x) => [x.date, x.value, x.count]),
    [
      ["2026-10-09", 90, 1],
      ["2026-10-10", 83, 4],
    ],
  );
  assert.equal(s.latest.data.value, 83);
});

test("the overview's latest bodyweight agrees with Goals", () => {
  const { r, db } = pathRepository();
  try {
    r.addJournal(
      "measurement",
      { name: "Body weight", value: 83, unit: "kg" },
      "2026-10-01",
    );
    r.addJournal(
      "measurement",
      { name: "Bodyweight", value: 81.75, unit: "kg" },
      "2026-10-16",
    );
    r.addJournal(
      "measurement",
      { name: "Waist", value: 84, unit: "cm" },
      "2026-10-17",
    );
    const s = seriesOf(r.journal("measurement")).find((x) => x.bodyweight)!;
    assert.equal(
      Number(s.latest.data.value),
      latestBodyweight(r.journal("measurement")),
    );
  } finally {
    db.close();
  }
});

test("unreadable legacy entries stay out of series and are never guessed", () => {
  const s = seriesOf([
    e("2026-10-01", "Bodyweight", 82),
    {
      ...e("2026-10-02", "Bodyweight", 0),
      data: { name: "Bodyweight", value: "abc" },
    },
    { ...e("2026-10-03", "Mystery", 5), data: { name: "Mystery", value: 5 } },
  ]);
  assert.equal(s.length, 1);
  assert.deepEqual(
    s[0]!.days.map((d) => d.value),
    [82],
  );
});

test("ranges use real dates; comparisons only against real entries", () => {
  const today = "2026-10-24";
  const s = seriesOf([
    e("2026-04-01", "Bodyweight", 90),
    e("2026-07-20", "Bodyweight", 86),
    e("2026-10-01", "Bodyweight", 84),
    e("2026-10-20", "Bodyweight", 83.4),
    e("2026-10-24", "Bodyweight", 83),
  ])[0]!;
  assert.equal(dayNumber("2026-10-24") - dayNumber("2026-10-23"), 1);
  assert.equal(dayNumber("2026-03-30") - dayNumber("2026-03-28"), 2);
  assert.deepEqual(
    inRange(s, today, "1M").map((d) => d.date),
    ["2026-10-01", "2026-10-20", "2026-10-24"],
  );
  assert.equal(defaultRange(s, today), "3M");
  const prev = sincePrevious(s)!;
  assert.equal(prev.since, "2026-10-20");
  assert.ok(Math.abs(prev.delta - -0.4) < 1e-9);
  // 3 months back is 2026-07-25: the newest entry on or before it is 07-20.
  assert.deepEqual(overRange(s, today, "3M"), {
    delta: -3,
    since: "2026-07-20",
  });
  // All: from the first entry.
  assert.deepEqual(overRange(s, today, "All"), {
    delta: -7,
    since: "2026-04-01",
  });
  // One entry: nothing to compare.
  const one = seriesOf([e("2026-10-24", "Waist", 84, "cm")])[0]!;
  assert.equal(sincePrevious(one), undefined);
  assert.equal(overRange(one, today, "1M"), undefined);
  assert.equal(defaultRange(one, today), "All");
});

test("values and changes read in the lifter's units, one decimal, neutrally", () => {
  assert.equal(valueText(82.4, "mass", "kg"), "82.4 kg");
  assert.equal(valueText(82.4, "mass", "lb"), "181.7 lb");
  assert.equal(valueText(84, "length", "lb"), "33.1 in");
  assert.equal(valueText(17.9, "percent", "lb"), "17.9 %");
  assert.equal(changeText(-0.3, "mass", "kg"), "−0.3 kg");
  assert.equal(changeText(1, "length", "kg"), "+1 cm");
  assert.equal(changeText(0.01, "mass", "kg"), "No change");
  assert.equal(changeText(-1, "mass", "lb"), "−2.2 lb");
});

test("typed values: comma or point, converted once, friendly errors", () => {
  assert.deepEqual(readValue("81,5", "mass", "kg"), {
    value: 81.5,
    unit: "kg",
  });
  const lb = readValue("180", "mass", "lb");
  assert.ok("value" in lb && Math.abs(lb.value - 81.6466266) < 1e-6);
  assert.deepEqual(readValue("10", "length", "lb"), {
    value: 25.4,
    unit: "cm",
  });
  assert.deepEqual(readValue("17.9", "percent", "lb"), {
    value: 17.9,
    unit: "percent",
  });
  for (const bad of ["", "abc", "1,2,3", "1.234,5", ".", "-5"])
    assert.ok("error" in readValue(bad, "mass", "kg"), bad);
  assert.deepEqual(readValue("0", "mass", "kg"), {
    error: "Enter a number greater than 0",
  });
  assert.deepEqual(readValue("101", "percent", "kg"), {
    error: "Enter a percentage up to 100",
  });
  assert.ok("error" in readValue("20000", "length", "kg"));
});

test("unusual values ask, never block", () => {
  assert.match(
    plausibility(500, "mass", true, undefined, "kg")!,
    /usual range for bodyweight/,
  );
  assert.match(
    plausibility(2, "length", false, undefined, "kg")!,
    /usual range/,
  );
  assert.match(
    plausibility(68, "mass", true, 82, "kg")!,
    /14 kg less than your last entry \(82 kg\)/,
  );
  assert.equal(plausibility(71, "mass", true, 82, "kg"), undefined);
  assert.equal(plausibility(81, "mass", true, 82, "kg"), undefined);
  assert.equal(
    plausibility(40, "percent", false, 18, "kg")?.includes("more"),
    true,
  );
});

test("new records keep the existing journal shape", () => {
  assert.deepEqual(newRecord(" Waist ", { value: 84, unit: "cm" }, ""), {
    name: "Waist",
    value: 84,
    unit: "cm",
  });
  assert.deepEqual(
    newRecord("Bodyweight", { value: 81.5, unit: "kg" }, " fasted "),
    {
      name: "Bodyweight",
      value: 81.5,
      unit: "kg",
      notes: "fasted",
    },
  );
  assert.throws(() => newRecord("Body weight", { value: 180, unit: "cm" }, ""));
});

test("an untouched edit writes nothing, even in pounds", () => {
  const legacy = e("2026-10-10", "Waist", 84, "cm", {
    data: { name: "Waist", value: 84, unit: "cm", custom: 7, flag: true },
  });
  for (const units of ["kg", "lb"] as const)
    for (const original of [e("2026-10-10", "Bodyweight", 82.4), legacy])
      assert.equal(
        editedRecord(
          original,
          {
            name: String(original.data.name),
            valueText: editText(original, units),
            notes: "",
            date: original.date,
          },
          units,
        ),
        undefined,
      );
});

test("edits merge only what changed and keep other keys and types", () => {
  const original = e("2026-10-10", "Waist", 84, "cm", {
    data: { name: "Waist", value: 84, unit: "cm", custom: 7, flag: true },
  });
  const value = editedRecord(
    original,
    { name: "Waist", valueText: "33", notes: "", date: original.date },
    "lb",
  );
  assert.deepEqual(value, {
    data: { name: "Waist", value: 83.82, unit: "cm", custom: 7, flag: true },
    date: "2026-10-10",
  });
  const moved = editedRecord(
    original,
    { name: "Waist", valueText: "84", notes: "after run", date: "2026-10-09" },
    "kg",
  );
  assert.deepEqual(moved, {
    data: { ...original.data, notes: "after run" },
    date: "2026-10-09",
  });
  assert.deepEqual(
    editedRecord(
      original,
      { name: "Waist", valueText: "x", notes: "", date: original.date },
      "kg",
    ),
    { error: "Enter a number, e.g. 81.5" },
  );
  // Typing the same stored value differently is not a change.
  assert.equal(
    editedRecord(
      original,
      { name: "Waist", valueText: "84,0", notes: "", date: original.date },
      "kg",
    ),
    undefined,
  );
});

test("the profile weight is offered once, only without any bodyweight entry", () => {
  const none: Entry[] = [e("2026-10-01", "Waist", 84, "cm")];
  assert.equal(profileWeightOffer(none, 82, false), 82);
  assert.equal(profileWeightOffer(none, 82, true), undefined);
  assert.equal(profileWeightOffer(none, 0, false), undefined);
  assert.equal(profileWeightOffer(none, Number.NaN, false), undefined);
  assert.equal(
    profileWeightOffer(
      [...none, e("2026-10-02", "Body weight", 80)],
      82,
      false,
    ),
    undefined,
  );
});

test("records written here survive backup and restore unchanged", () => {
  const a = pathRepository();
  const b = pathRepository();
  try {
    a.r.addJournal(
      "measurement",
      newRecord("Waist", { value: 83.82, unit: "cm" }, "tape"),
      "2026-10-10",
    );
    a.r.addJournal(
      "measurement",
      { name: "Body weight", value: 81.75, unit: "kg", legacy: true },
      "2026-10-11",
    );
    const before = JSON.stringify(a.r.journal("measurement"));
    b.r.importBackup(JSON.stringify(a.r.exportBackup()));
    assert.equal(JSON.stringify(b.r.journal("measurement")), before);
  } finally {
    a.db.close();
    b.db.close();
  }
});
