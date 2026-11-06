import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import { entryRoute, entryState, type EntryFacts } from "../src/auth/entry";
import {
  claimIfEmpty,
  dataOwner,
  hasLocalData,
  linkToAccount,
} from "../src/data/ownership";

// Phase 7.7B: the entry decision and this phone's data ownership. There is
// no guest mode: training is shown only to a signed-in athlete whose data
// this is, and linking existing data is always the athlete's choice.

const me = { id: "user-a", email: "a@example.com" };
const facts = (f: Partial<EntryFacts> = {}): EntryFacts => ({
  configured: true,
  session: me,
  hasLocalData: false,
  onboarded: false,
  ...f,
});

test("an unconfigured or misconfigured build never opens training", () => {
  assert.equal(
    entryState(facts({ configured: false, owner: me.id, onboarded: true }))
      .kind,
    "unconfigured",
  );
  assert.equal(
    entryState(facts({ misconfigured: true, configured: false })).kind,
    "misconfigured",
  );
});

test("restoring the session waits; signed out goes to Welcome", () => {
  assert.equal(entryState(facts({ session: undefined })).kind, "initializing");
  const out = entryState(
    facts({ session: null, owner: me.id, onboarded: true, hasLocalData: true }),
  );
  assert.equal(out.kind, "signedOut");
  assert.equal(entryRoute(out.kind), "/welcome");
});

test("a set-up athlete opens Home; a new one goes to setup", () => {
  const ready = entryState(
    facts({ owner: me.id, hasLocalData: true, onboarded: true }),
  );
  assert.deepEqual(ready, { kind: "ready", user: me, offline: false });
  assert.equal(entryRoute(ready.kind), "/");
  const setup = entryState(facts());
  assert.deepEqual(setup, { kind: "setup", user: me, offline: false });
  assert.equal(entryRoute(setup.kind), "/onboarding");
});

test("offline: a previously signed-in athlete keeps training", () => {
  const offline = entryState(
    facts({
      session: null,
      offline: me,
      owner: me.id,
      hasLocalData: true,
      onboarded: true,
    }),
  );
  assert.deepEqual(offline, { kind: "ready", user: me, offline: true });
  // Also while the session is still being restored.
  assert.equal(
    entryState(
      facts({
        session: undefined,
        offline: me,
        owner: me.id,
        hasLocalData: true,
        onboarded: true,
      }),
    ).kind,
    "ready",
  );
  // Offline never bypasses ownership.
  assert.equal(
    entryState(
      facts({
        session: null,
        offline: me,
        owner: "user-b",
        hasLocalData: true,
        onboarded: true,
      }),
    ).kind,
    "otherAccount",
  );
});

test("another account's data is never shown", () => {
  const other = entryState(
    facts({ owner: "user-b", hasLocalData: true, onboarded: true }),
  );
  assert.equal(other.kind, "otherAccount");
  assert.equal(entryRoute(other.kind), "/account-check");
  // Even when that account's setup was never finished, if anything of it is
  // here (a draft profile waiting to sync counts), or it ever synchronized.
  assert.equal(
    entryState(facts({ owner: "user-b", hasLocalData: true })).kind,
    "otherAccount",
  );
  assert.equal(
    entryState(facts({ owner: "user-b", syncHistory: true })).kind,
    "otherAccount",
  );
});

test("a claim with nothing behind it doesn't lock the phone (7.7C, P4)", () => {
  // Another account signed in here, entered nothing and left: this account
  // sets the phone up instead.
  const setup = entryState(facts({ owner: "user-b" }));
  assert.deepEqual(setup, { kind: "setup", user: me, offline: false });
});

test("data with no owner waits for the athlete's choice to link it", () => {
  const unlinked = entryState(facts({ hasLocalData: true, onboarded: true }));
  assert.equal(unlinked.kind, "unlinked");
  assert.equal(entryRoute(unlinked.kind), "/account-check");
});

test("a password-reset link asks for a new password, online only", () => {
  assert.equal(
    entryState(facts({ recovering: true, owner: me.id, onboarded: true })).kind,
    "recovery",
  );
  assert.equal(
    entryState(
      facts({
        recovering: true,
        session: null,
        offline: me,
        owner: me.id,
        hasLocalData: true,
        onboarded: true,
      }),
    ).kind,
    "ready",
  );
});

test("hasLocalData: a fresh phone holds nothing; any athlete data counts", () => {
  const empty = pathRepository();
  try {
    // The bundled catalogue and default profile are not the athlete's data.
    assert.equal(hasLocalData(empty.r), false);
  } finally {
    empty.db.close();
  }
  const cases: [string, (r: ReturnType<typeof pathRepository>["r"]) => void][] =
    [
      ["finished setup", (r) => r.saveProfile({ onboarded: true })],
      ["a workout", (r) => void r.startWorkout()],
      [
        "a template",
        (r) =>
          void r.saveTemplate("Push", [
            {
              exerciseId: "barbell-bench-press",
              sets: 3,
              reps: 8,
              weight: 40,
              rest: 90,
            },
          ]),
      ],
      [
        "a journal entry",
        (r) =>
          void r.addJournal("measurement", {
            name: "Bodyweight",
            value: 80,
            unit: "kg",
          }),
      ],
      [
        "a custom exercise",
        (r) =>
          void r.saveExercise({
            id: "custom-grip",
            name: "Grip hang",
            muscle: "Forearms & grip",
            equipment: "Trap bar",
            instructions: ["Hang on"],
            secondary: ["Back"],
            pattern: "Carry",
            difficulty: "Hard",
            mistakes: "Shrugging",
            safety: "Chalk up",
            category: "duration",
            unilateral: false,
            tracking: ["seconds", "kg"],
          }),
      ],
    ];
  for (const [name, add] of cases) {
    const f = pathRepository();
    try {
      add(f.r);
      assert.equal(hasLocalData(f.r), true, name);
    } finally {
      f.db.close();
    }
  }
});

test("linking marks the owner only; it never moves or uploads data", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.startWorkout();
    const rows = (t: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    const before = { outbox: rows("outbox"), workouts: rows("workouts") };
    assert.equal(dataOwner(r), undefined);
    linkToAccount(r, me.id);
    assert.equal(dataOwner(r), me.id);
    assert.deepEqual(
      { outbox: rows("outbox"), workouts: rows("workouts") },
      before,
    );
    // Linking again is harmless; another account is refused.
    linkToAccount(r, me.id);
    assert.throws(() => linkToAccount(r, "user-b"), /another account/);
    assert.equal(dataOwner(r), me.id);
  } finally {
    db.close();
  }
});

test("setup on an empty phone claims it, so setup never asks to link", () => {
  const { r, db } = pathRepository();
  try {
    const state = () =>
      entryState(
        facts({
          owner: dataOwner(r),
          hasLocalData: hasLocalData(r),
          onboarded: r.profile().onboarded,
        }),
      ).kind;
    assert.equal(state(), "setup");
    assert.equal(claimIfEmpty(r, me.id), true);
    // The athlete finishes onboarding: their own profile, not unlinked data.
    r.saveProfile({ onboarded: true });
    assert.equal(state(), "ready");
  } finally {
    db.close();
  }
});

test("claiming never takes existing or owned data", () => {
  const { r, db } = pathRepository();
  try {
    r.startWorkout();
    assert.equal(claimIfEmpty(r, me.id), false);
    assert.equal(dataOwner(r), undefined);
  } finally {
    db.close();
  }
  // Another account's claim with anything behind it stays theirs: data, a
  // draft waiting to sync, or sync history.
  const cases: [string, (r: ReturnType<typeof pathRepository>["r"]) => void][] =
    [
      ["a workout", (r) => void r.startWorkout()],
      ["a setup draft", (r) => void r.saveProfile({ name: "B" })],
      [
        "sync history",
        (r) =>
          r.db.run("INSERT INTO sync_meta(id,revision) VALUES(?,?)", [
            "profile",
            3,
          ]),
      ],
    ];
  for (const [name, add] of cases) {
    const owned = pathRepository();
    try {
      owned.r.setSetting("cloudOwner", "user-b");
      add(owned.r);
      assert.equal(claimIfEmpty(owned.r, me.id), false, name);
      assert.equal(dataOwner(owned.r), "user-b", name);
    } finally {
      owned.db.close();
    }
  }
});

test("a claim with nothing behind it is replaced at setup (7.7C, P4)", () => {
  const { r, db } = pathRepository();
  try {
    r.setSetting("cloudOwner", "user-b");
    assert.equal(claimIfEmpty(r, me.id), true);
    assert.equal(dataOwner(r), me.id);
    // Claiming again for the same account changes nothing.
    assert.equal(claimIfEmpty(r, me.id), false);
  } finally {
    db.close();
  }
});
