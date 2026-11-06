import { test } from "node:test";
import assert from "node:assert/strict";
import { cloud, phone, sync } from "./cloud-fixture";
import { entryRoute, entryState, type EntryFacts } from "../src/auth/entry";
import {
  CONTINUE_FOR_MS,
  FINISHED_GRACE_MS,
  continuation,
  continuedWorkout,
  endContinuation,
  noteSessionEnded,
  sessionEnded,
} from "../src/auth/continuation";
import { dataOwner, localSummary } from "../src/data/ownership";

// Phase 7.8E, Stage 4: a workout kept going after the account service ends
// this phone's sign-in without the athlete asking. Only that account's own
// workout continues, only on this phone, and nothing synchronizes until the
// same account signs in again.

const A = "user-a";
const B = "user-b";
const T0 = Date.UTC(2026, 10, 2, 18);

/** A's phone with A's workout in progress, one set logged. */
function midWorkout(owner = A) {
  const r = phone(owner);
  r.saveProfile({ onboarded: true });
  const w = r.startWorkout("Push day");
  const exercise = r.exercises()[0]!;
  const row = r.addExercise(w.id, exercise.id);
  r.addSet(row.id);
  return { r, w };
}
const facts = (f: Partial<EntryFacts> = {}): EntryFacts => ({
  configured: true,
  session: null,
  hasLocalData: true,
  onboarded: true,
  ...f,
});

test("entry: only the ended account's own workout continues; anything else is signed out", () => {
  const ended = { id: A, email: "a@example.com" };
  assert.deepEqual(entryState(facts({ ended, continued: true, owner: A })), {
    kind: "continuing",
    user: ended,
  });
  for (const f of [
    { ended, continued: false, owner: A },
    { ended, continued: true, owner: B },
    { ended, continued: true, owner: undefined },
    { ended: undefined, continued: true, owner: A },
  ])
    assert.equal(entryState(facts(f)).kind, "signedOut", JSON.stringify(f));
  // Anyone signed in: the ordinary rules, whatever ended before.
  assert.equal(
    entryState(facts({ session: { id: B }, ended, continued: true, owner: A }))
      .kind,
    "otherAccount",
  );
  assert.equal(
    entryState(facts({ session: { id: A }, ended, continued: true, owner: A }))
      .kind,
    "ready",
  );
  // Still restoring: nothing yet.
  assert.equal(
    entryState(facts({ session: undefined, ended, continued: true, owner: A }))
      .kind,
    "initializing",
  );
  // Anything not allowed while continuing leads to Welcome.
  assert.equal(entryRoute("continuing"), "/welcome");
});

test("the marker is written only for the owner's workout in progress, and holds no secret", () => {
  const { r, w } = midWorkout();
  assert.equal(noteSessionEnded(r, B, T0), false);
  assert.equal(sessionEnded(r), undefined);
  assert.equal(noteSessionEnded(r, A, T0), true);
  assert.deepEqual(sessionEnded(r), { owner: A, workout: w.id, at: T0 });
  const raw = r.setting("sessionEnded")!;
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), [
    "at",
    "owner",
    "workout",
  ]);
  assert.doesNotMatch(raw, /@|token|eyJ|password/i);
  // No workout in progress: nothing to continue.
  const idle = phone(A);
  assert.equal(noteSessionEnded(idle, A, T0), false);
});

test("after a restart: the same workout, still in progress, the same owner, within 12 hours", () => {
  const { r, w } = midWorkout();
  noteSessionEnded(r, A, T0);
  assert.equal(continuation(r, T0 + 60_000)?.workout, w.id);
  assert.equal(continuation(r, T0 + CONTINUE_FOR_MS - 1)?.workout, w.id);
  assert.equal(continuation(r, T0 + CONTINUE_FOR_MS), undefined);
  // A clock that went backwards proves nothing.
  assert.equal(continuation(r, T0 - 60_000), undefined);
  // Another owner now (training removed and claimed again): no.
  r.setSetting("cloudOwner", B);
  assert.equal(continuation(r, T0 + 60_000), undefined);
  r.setSetting("cloudOwner", A);
  // A different workout in progress: no.
  r.finishWorkout(w.id);
  r.startWorkout("Another");
  assert.equal(continuation(r, T0 + 60_000), undefined);
});

test("a just-finished continued workout stays open for its summary, then not", () => {
  const { r, w } = midWorkout();
  noteSessionEnded(r, A, T0);
  assert.equal(continuedWorkout(r, A, T0), "active");
  assert.equal(continuedWorkout(r, B, T0), undefined);
  r.finishWorkout(w.id);
  const finishedAt = r.workout(w.id)!.finishedAt!;
  assert.equal(continuedWorkout(r, A, finishedAt + 1000), "finished");
  assert.equal(
    continuedWorkout(r, A, finishedAt + FINISHED_GRACE_MS),
    undefined,
  );
  // Without the marker (another sign-in ended it), nothing stays open.
  endContinuation(r);
  assert.equal(sessionEnded(r), undefined);
  assert.equal(continuedWorkout(r, A, finishedAt + 1000), undefined);
});

test("continuing changes nothing that belongs to the account or the cloud", () => {
  const { r, w } = midWorkout();
  const before = localSummary(r);
  noteSessionEnded(r, A, T0);
  // Logged and finished while signed out: it stays the owner's, waiting.
  const row = r.workoutExercises(w.id)[0]!;
  r.addSet(row.id);
  r.finishWorkout(w.id);
  assert.equal(dataOwner(r), A);
  assert.ok(localSummary(r).unsynced >= before.unsynced);
  assert.equal(localSummary(r).workouts, 1);
});

test("back with the same account: one sync uploads everything once; the next uploads nothing", async () => {
  const c = cloud();
  const { r, w } = midWorkout(A);
  noteSessionEnded(r, A, T0);
  const row = r.workoutExercises(w.id)[0]!;
  r.addSet(row.id);
  r.finishWorkout(w.id);
  // Signed in again as A: the marker ends, and sync runs as A.
  endContinuation(r);
  const first = await sync(r, c, A);
  assert.equal(first.stopped, undefined);
  assert.ok(first.uploaded > 0);
  assert.equal(localSummary(r).unsynced, 0);
  const second = await sync(r, c, A);
  assert.equal(second.uploaded, 0);
  assert.equal(c.calls.writes, first.uploaded);
});

test("another account can't take the continued workout: sync as B is refused, nothing moves", async () => {
  const c = cloud();
  const { r, w } = midWorkout(A);
  noteSessionEnded(r, A, T0);
  r.finishWorkout(w.id);
  const waiting = localSummary(r).unsynced;
  await assert.rejects(sync(r, c, B), /different account/);
  assert.equal(c.calls.writes, 0);
  assert.equal(dataOwner(r), A);
  assert.equal(localSummary(r).unsynced, waiting);
});
