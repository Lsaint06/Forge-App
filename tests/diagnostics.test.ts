import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLine, errorShape, failureCode } from "../src/domain/diagnostics";

// Phase 8.5 (M6): a beta report names the build and the kind of failure,
// and nothing about the athlete.

test("the build line names the app, its version and build, and the platform", () => {
  assert.equal(
    buildLine({
      appId: "com.lsaint06.forge.preview",
      version: "1.0.0",
      build: "14",
      os: "ios",
      osVersion: "27.0",
    }),
    "FORGE Preview 1.0.0 (14) · iOS 27.0",
  );
  assert.equal(
    buildLine({
      appId: "com.lsaint06.forge",
      version: "1.2.0",
      build: "31",
      os: "android",
      osVersion: "16",
      apiLevel: 36,
    }),
    "FORGE 1.2.0 (31) · Android 16 (API 36)",
  );
  assert.equal(
    buildLine({
      appId: "com.lsaint06.forge.dev",
      version: "1.0.0",
      build: null,
      os: "ios",
      osVersion: "26.1",
    }),
    "FORGE Dev 1.0.0 · iOS 26.1",
  );
  // In Expo Go the native app is Expo Go: the project's version is shown.
  assert.equal(
    buildLine({
      appId: "host.exp.Exponent",
      version: "58.0.0",
      build: "300",
      expoGo: true,
      projectVersion: "1.0.0",
      os: "ios",
      osVersion: "27.0",
    }),
    "FORGE in Expo Go 1.0.0 · iOS 27.0",
  );
  assert.equal(
    buildLine({ appId: "com.example.other", os: "android", apiLevel: 35 }),
    "FORGE (unrecognised build) · Android (API 35)",
  );
});

test("a failure code says where and what, and matches the same failure without its particulars", () => {
  const disk = new Error(
    "Call to function 'NativeDatabase.execSync' has been rejected. Caused by: Error code 11: database disk image is malformed",
  );
  assert.match(failureCode(disk, "start"), /^S-DB-[0-9A-F]{6}$/);
  assert.match(failureCode(disk, "screen"), /^R-DB-[0-9A-F]{6}$/);
  const invalid = Object.assign(new Error("[]"), {
    name: "ZodError",
    issues: [],
  });
  assert.match(failureCode(invalid, "screen"), /^R-DATA-[0-9A-F]{6}$/);
  assert.match(
    failureCode(
      new TypeError("Cannot read properties of undefined (reading 'weight')"),
      "screen",
    ),
    /^R-APP-[0-9A-F]{6}$/,
  );
  // Names, IDs and numbers don't change the code; other wording does.
  const missing = (name: string, id: string, n: number) =>
    new Error(`Workout "${name}" (${id}) has no set ${n}`);
  const first = missing("Leg day", "5f0c2d1e-9b7a-4c3e-8d2f-1a2b3c4d5e6f", 3);
  assert.equal(errorShape(first), "Error: Workout … (#) has no set #");
  assert.equal(
    failureCode(
      missing("Push", "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", 12),
      "screen",
    ),
    failureCode(first, "screen"),
  );
  assert.notEqual(
    failureCode(new Error("Exercise not found"), "screen"),
    failureCode(first, "screen"),
  );
  assert.match(failureCode("a thrown string", "screen"), /^R-APP-/);
});
