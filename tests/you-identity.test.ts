import test from "node:test";
import assert from "node:assert/strict";
import {
  displayName,
  experienceText,
  focusText,
  monogram,
  trainingSince,
} from "../src/screens/you/model";

// Phase 7.5B: the You tab's identity words and monogram, from the profile.

test("display name: the saved name, tidied; the profile default when blank", () => {
  assert.equal(displayName("  Alex   Carter "), "Alex Carter");
  assert.equal(displayName(""), "Athlete");
  assert.equal(displayName("   "), "Athlete");
  assert.equal(displayName(undefined), "Athlete");
});

test("monogram: up to two initials, whole characters, upper case", () => {
  assert.equal(monogram("Alex Carter"), "AC");
  assert.equal(monogram("alex"), "A");
  assert.equal(monogram("Mary Jane Watson"), "MJ");
  assert.equal(monogram("Åsa Öberg"), "ÅÖ");
  assert.equal(monogram("𝒜lex Bo"), "𝒜B");
  assert.equal(monogram("  "), "A");
  assert.equal(monogram(undefined), "A");
});

test("focus, experience and training-since read only what is saved", () => {
  assert.equal(focusText("Strength"), "Strength focus");
  assert.equal(focusText("Muscle Building"), "Muscle building focus");
  assert.equal(focusText(undefined), undefined);
  assert.equal(experienceText("Intermediate"), "Intermediate lifter");
  assert.equal(experienceText(undefined), undefined);
  assert.equal(trainingSince(undefined), undefined);
  assert.match(trainingSince(Date.UTC(2026, 9, 15, 12))!, /^Training since /);
});
