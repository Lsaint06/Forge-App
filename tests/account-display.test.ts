import test from "node:test";
import assert from "node:assert/strict";
import { conflictTitle, pendingText } from "../src/domain/presentation/account";

// Phase 7.5G.3: account wording without internal identifiers or claims.

const row = (kind: string, payload: unknown) =>
  JSON.stringify({
    id: "3f2c9a1e-uuid",
    kind,
    payload,
    revision: 4,
    deleted: false,
  });

test("conflicts are named by what they are, never by their record id", () => {
  assert.equal(
    conflictTitle(row("workout", { workout: { name: "Push day" }, sets: [] })),
    "Workout · Push day",
  );
  assert.equal(
    conflictTitle(
      row("journal", { kind: "goal", data: { name: "Cut to 80" } }),
    ),
    "Goal · Cut to 80",
  );
  assert.equal(
    conflictTitle(row("journal", { kind: "recovery", data: { sleep: 7 } })),
    "Recovery check-in",
  );
  assert.equal(
    conflictTitle(row("template", { name: "Upper A" })),
    "Template · Upper A",
  );
  assert.equal(
    conflictTitle(row("exercise", { name: "Zercher squat" })),
    "Custom exercise · Zercher squat",
  );
  assert.equal(conflictTitle(row("profile", { name: "Alex" })), "Your profile");
  assert.equal(conflictTitle(row("workout", {})), "Workout");
  assert.equal(
    conflictTitle(row("journal", { kind: "unknown" })),
    "Journal entry",
  );
  assert.equal(conflictTitle("not json"), "A synced record");
  for (const title of [
    conflictTitle(row("workout", { workout: { name: "Push day" } })),
    conflictTitle("not json"),
  ])
    assert.doesNotMatch(title, /uuid|3f2c/);
});

test("pending changes are counted, and none is not called 'backed up'", () => {
  assert.equal(pendingText(0), "No local changes waiting to upload");
  assert.equal(pendingText(1), "1 change waiting to upload");
  assert.equal(pendingText(1200), "1,200 changes waiting to upload");
  assert.doesNotMatch(pendingText(0), /safe|backed up|protected/i);
});
