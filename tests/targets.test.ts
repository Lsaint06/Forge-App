import test from "node:test";
import assert from "node:assert/strict";
import { readFormNumber } from "../src/domain/numbers";
import {
  TARGET_HELP,
  macroEnergy,
  readTargets,
  targetTexts,
} from "../src/domain/targets";
import { defaults } from "../src/domain/types";

// Phase 7.3G G2: the daily-target rules shared by the Nutrition targets
// sheet and the You tab's editor (the profile schema's limits, unchanged).

const profile = {
  ...defaults,
  name: "Alex",
  onboarded: true,
  height: 180,
  weight: 80,
};
const texts = (
  patch: Partial<Record<"calories" | "protein" | "carbs" | "fat", string>> = {},
) => ({
  ...targetTexts(profile),
  ...patch,
});

test("numbers are read as the profile form reads them", () => {
  assert.equal(readFormNumber("2500"), 2500);
  assert.equal(readFormNumber("2,5"), 2.5);
  assert.equal(readFormNumber(" 2.5 "), 2.5);
  assert.equal(readFormNumber(""), 0);
  assert.ok(Number.isNaN(readFormNumber("-5")));
  assert.ok(Number.isNaN(readFormNumber("abc")));
  assert.ok(Number.isNaN(readFormNumber("1.2.3")));
  assert.ok(Number.isNaN(readFormNumber("1,234.5")));
});

test("each target keeps its own limit, inclusive; zero and decimals are allowed", () => {
  const ok = (patch: Parameters<typeof texts>[0]) => {
    const r = readTargets(profile, texts(patch));
    assert.ok("values" in r, JSON.stringify(r));
    return r.values;
  };
  const bad = (patch: Parameters<typeof texts>[0]) => {
    const r = readTargets(profile, texts(patch));
    assert.ok("errors" in r, JSON.stringify(r));
    return r.errors;
  };
  assert.equal(ok({ calories: "20000" }).calories, 20000);
  assert.equal(bad({ calories: "20000.5" }).calories, TARGET_HELP.calories);
  assert.equal(ok({ protein: "2000" }).protein, 2000);
  assert.equal(bad({ protein: "2001" }).protein, TARGET_HELP.protein);
  assert.equal(ok({ carbs: "3000" }).carbs, 3000);
  assert.equal(bad({ carbs: "3001" }).carbs, TARGET_HELP.carbs);
  assert.equal(ok({ fat: "2000" }).fat, 2000);
  assert.equal(bad({ fat: "2000.1" }).fat, TARGET_HELP.fat);
  assert.equal(ok({ fat: "0" }).fat, 0);
  assert.equal(ok({ fat: "" }).fat, 0);
  assert.equal(ok({ protein: "180,5" }).protein, 180.5);
  assert.deepEqual(Object.keys(bad({ calories: "-5", carbs: "x" })).sort(), [
    "calories",
    "carbs",
  ]);
});

test("only the four targets are returned; nothing derives one from another", () => {
  const r = readTargets(profile, texts({ protein: "200" }));
  assert.ok("values" in r);
  assert.deepEqual(r.values, {
    calories: 2000,
    protein: 200,
    carbs: 200,
    fat: 65,
  });
  assert.equal(macroEnergy(r.values), 4 * 200 + 4 * 200 + 9 * 65);
});

test("a stored profile value that is itself invalid is reported, not saved over", () => {
  const r = readTargets({ ...profile, repMin: 12, repMax: 8 }, texts());
  assert.ok("errors" in r);
  assert.match(String(r.errors.form), /needs fixing in You/);
});
