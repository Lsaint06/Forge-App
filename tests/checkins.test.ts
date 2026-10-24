import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysCheckedIn,
  defaultRange,
  details,
  draftChanged,
  draftOf,
  editedCheckin,
  emptyDraft,
  inRange,
  latestOfDay,
  newCheckin,
  pointsFor,
  rangeSummary,
  restDayText,
  scaleText,
  sleepSpoken,
  sleepText,
  summaryLine,
  type Checkin,
} from "../src/domain/checkins";
import { readiness } from "../src/domain/metrics";
import { addDays } from "../src/domain/paths/model";
import { pathRepository } from "./path-fixture";

// Phase 7B WP4C: recovery check-ins. Recorded values are shown as recorded,
// nothing is prefilled or scored, edits write only what changed, and trends
// use one real day per point with gaps left empty.

let n = 0;
const c = (
  date: string,
  data: Checkin["data"],
  extra: Partial<Checkin> = {},
): Checkin => ({
  id: `id-${String(++n).padStart(3, "0")}`,
  date,
  createdAt: n * 1000,
  updatedAt: n * 1000,
  data,
  ...extra,
});
const base = { sleep: 7.5, quality: 4, soreness: 2, energy: 4, stress: 2 };

test("sleep is shown in hours and minutes, and spoken in words", () => {
  assert.equal(sleepText(7.5), "7 h 30 m");
  assert.equal(sleepText(8), "8 h");
  assert.equal(sleepText(0), "0 h");
  assert.equal(sleepText(7.33), "7 h 20 m");
  assert.equal(sleepText("7"), undefined);
  assert.equal(sleepSpoken(7.25), "7 hours 15 minutes");
  assert.equal(sleepSpoken(1), "1 hour");
});

test("unusual legacy values are shown exactly as recorded, never corrected", () => {
  assert.equal(scaleText("soreness", 2), "2 · Mild");
  assert.equal(scaleText("stress", 5), "5 · Very stressed");
  assert.equal(scaleText("soreness", 2.5), "2.5");
  assert.equal(scaleText("readiness", 42), "42 (outside 1–5)");
  assert.equal(scaleText("readiness", "high"), "high");
  assert.equal(scaleText("readiness", undefined), undefined);
  assert.equal(restDayText("yes"), "Rest day");
  assert.equal(restDayText(true), "Rest day");
  assert.equal(restDayText("no"), undefined);
  assert.equal(restDayText("maybe"), "Rest day: maybe");
  const legacy = c("2026-10-20", {
    ...base,
    soreness: 2.5,
    readiness: 42,
    restDay: "maybe",
  });
  assert.deepEqual(details(legacy), [
    { label: "Sleep", value: "7 h 30 m" },
    { label: "Sleep quality", value: "4 · Good" },
    { label: "Soreness", value: "2.5" },
    { label: "Energy", value: "4 · High" },
    { label: "Stress", value: "2 · Low" },
    { label: "Ready to train", value: "42 (outside 1–5)" },
    { label: "Rest day", value: "maybe" },
  ]);
  assert.equal(
    summaryLine(legacy),
    "7 h 30 m sleep · Soreness 2.5 · Energy 4 · Stress 2 · Rest day: maybe",
  );
  // The oldest shape (only the five numbers) reads without gaps or noise.
  assert.equal(
    summaryLine(c("2026-10-20", base)),
    "7 h 30 m sleep · Soreness 2 · Energy 4 · Stress 2",
  );
});

test("a new check-in needs every required answer; nothing is assumed", () => {
  const d = emptyDraft("2026-10-24");
  assert.deepEqual(newCheckin(d), {
    error:
      "Choose last night's sleep, sleep quality, soreness, energy and stress to save this check-in.",
  });
  assert.deepEqual(newCheckin({ ...d, ...base, stress: undefined }), {
    error: "Choose stress to save this check-in.",
  });
  assert.deepEqual(newCheckin({ ...d, ...base, sleep: 25 }), {
    error: "Sleep must be between 0 and 24 hours.",
  });
  // Optional answers are left out unless given.
  assert.deepEqual(newCheckin({ ...d, ...base }), {
    data: base,
    date: "2026-10-24",
  });
  assert.deepEqual(
    newCheckin({ ...d, ...base, readiness: 3, restDay: true, notes: " ok " }),
    {
      data: { ...base, readiness: 3, restDay: "yes", notes: "ok" },
      date: "2026-10-24",
    },
  );
  assert.equal(draftChanged(d), false);
  assert.equal(draftChanged({ ...d, soreness: 2 }), true);
});

test("an untouched edit writes nothing, even for unusual legacy values", () => {
  const odd = c("2026-10-20", {
    ...base,
    soreness: 2.5,
    readiness: "high",
    restDay: true,
    notes: "Morning",
    mood: 4,
  });
  assert.equal(editedCheckin(odd, draftOf(odd)), undefined);
  assert.equal(draftChanged(draftOf(odd), odd), false);
  // Notes differing only by surrounding spaces are unchanged.
  assert.equal(
    editedCheckin(odd, { ...draftOf(odd), notes: " Morning " }),
    undefined,
  );
});

test("an edit changes only what the lifter changed, keeping types and unknown keys", () => {
  const odd = c("2026-10-20", {
    ...base,
    soreness: 2.5,
    readiness: 42,
    restDay: true,
    mood: 4,
  });
  const result = editedCheckin(odd, { ...draftOf(odd), energy: 2 });
  assert.deepEqual(result, {
    data: {
      ...base,
      soreness: 2.5,
      readiness: 42,
      restDay: true,
      mood: 4,
      energy: 2,
    },
    date: "2026-10-20",
  });
  // Clearing the optional rating removes it; required answers can't be cleared.
  const cleared = editedCheckin(odd, { ...draftOf(odd), readiness: undefined });
  assert.ok(cleared && !("error" in cleared));
  assert.equal("readiness" in cleared.data, false);
  assert.ok(
    "error" in editedCheckin(odd, { ...draftOf(odd), stress: undefined })!,
  );
  // Turning a recorded rest day off writes "no"; the day can move.
  const moved = editedCheckin(odd, {
    ...draftOf(odd),
    restDay: false,
    date: "2026-10-19",
  });
  assert.deepEqual(moved, {
    data: { ...odd.data, restDay: "no" },
    date: "2026-10-19",
  });
});

test("same-day check-ins are all kept; the latest stands for the day", () => {
  const morning = c("2026-10-23", { ...base, notes: "Morning" });
  const evening = c("2026-10-23", { ...base, soreness: 4, notes: "Evening" });
  // Same creation time: the later update, then the greater ID, wins.
  const tie = c(
    "2026-10-23",
    { ...base, soreness: 5 },
    {
      createdAt: evening.createdAt,
      updatedAt: evening.updatedAt,
      id: "id-000",
    },
  );
  const days = latestOfDay([morning, tie, evening]);
  assert.equal(days.get("2026-10-23")!.entry.id, evening.id);
  assert.equal(days.get("2026-10-23")!.count, 3);
  const points = pointsFor([morning, tie, evening], "soreness");
  assert.deepEqual(
    points.map((p) => [p.date, p.value, p.count]),
    [["2026-10-23", 4, 3]],
  );
});

test("trends use real days, leave missing days out and skip unusual values", () => {
  const entries = [
    c("2026-10-01", { ...base, sleep: 6 }),
    c("2026-10-03", { ...base, sleep: 8, readiness: 42 }),
    c("2026-10-20", { ...base, sleep: 7, readiness: 4 }),
  ];
  assert.deepEqual(
    pointsFor(entries, "sleep").map((p) => [p.date, p.value]),
    [
      ["2026-10-01", 6],
      ["2026-10-03", 8],
      ["2026-10-20", 7],
    ],
  );
  // The optional rating: days without it, or with an unusual value, are gaps.
  assert.deepEqual(
    pointsFor(entries, "readiness").map((p) => p.date),
    ["2026-10-20"],
  );
  const today = "2026-10-24";
  assert.equal(inRange(pointsFor(entries, "sleep"), today, "1M").length, 3);
  assert.equal(defaultRange(pointsFor(entries, "sleep"), today), "1M");
  assert.equal(
    rangeSummary(pointsFor(entries, "sleep"), "sleep"),
    "Average 7 h · 6 h to 8 h · 3 days",
  );
  assert.equal(
    rangeSummary(pointsFor(entries, "soreness"), "soreness"),
    "Most often 2 · Mild · 3 days",
  );
  assert.equal(rangeSummary([], "sleep"), undefined);
});

test("consistency counts distinct days in the last 30, including today", () => {
  const today = "2026-10-24";
  const entries = [
    c(today, base),
    c(today, base),
    c(addDays(today, -29), base),
    c(addDays(today, -30), base),
  ];
  assert.equal(daysCheckedIn(entries, today), 2);
});

test("check-ins save through the repository unchanged; untouched edits queue nothing", () => {
  const { r, db } = pathRepository();
  try {
    const made = newCheckin({ ...emptyDraft("2026-10-24"), ...base });
    assert.ok(!("error" in made));
    const saved = r.addJournal("recovery", made.data, made.date);
    const legacy = r.addJournal(
      "recovery",
      { ...base, quality: 4.5, readiness: -3, restDay: "maybe" },
      "2026-10-20",
    );
    db.exec("DELETE FROM outbox");
    for (const e of r.journal("recovery"))
      assert.equal(editedCheckin(e, draftOf(e)), undefined);
    assert.equal(r.outbox().length, 0);
    // A backup round trip keeps every recovery record byte for byte.
    const before = JSON.stringify(r.journal("recovery"));
    const backup = r.exportBackup();
    const other = pathRepository();
    try {
      other.r.importBackup(JSON.stringify(backup));
      assert.equal(JSON.stringify(other.r.journal("recovery")), before);
    } finally {
      other.db.close();
    }
    assert.ok(saved.id && legacy.id);
  } finally {
    db.close();
  }
});

test("the compatibility score function is unchanged (no longer shown)", () => {
  assert.equal(readiness(base).score, 79);
});
