import { test } from "node:test";
import assert from "node:assert/strict";
import { phone } from "./cloud-fixture";
import { entryState, type AuthUser, type EntryFacts } from "../src/auth/entry";
import { tokenSubject } from "../src/auth/jwt";
import {
  CONTINUE_FOR_MS,
  continuation,
  continuedWorkout,
  sessionEnded,
} from "../src/auth/continuation";
import {
  checkDeletion,
  deletedAccount,
  noteAccountGone,
  pendingDeletion,
  resumeDeletion,
  type DeletionDeps,
} from "../src/auth/account-deletion";
import { dataOwner, localSummary } from "../src/data/ownership";

// Phase 7.8E, Stage 6: adversarial checks across the lifecycle work. Every
// combination of entry facts, malformed tokens, and corrupted or hostile
// stored markers: nothing throws, and nothing opens one account's training
// to another or removes it on another account's say-so.

const A = "user-a";
const B = "user-b";

test("entry: every combination of facts keeps each account's training its own", () => {
  const a: AuthUser = { id: A };
  const b: AuthUser = { id: B };
  let checked = 0;
  for (const misconfigured of [undefined, true])
    for (const configured of [true, false])
      for (const session of [undefined, null, a, b])
        for (const offline of [undefined, a, b])
          for (const owner of [undefined, A, B])
            for (const hasLocalData of [true, false])
              for (const syncHistory of [undefined, true])
                for (const onboarded of [true, false])
                  for (const recovering of [undefined, true])
                    for (const ended of [undefined, a, b])
                      for (const continued of [undefined, true]) {
                        const f: EntryFacts = {
                          misconfigured,
                          configured,
                          session,
                          offline,
                          owner,
                          hasLocalData,
                          syncHistory,
                          onboarded,
                          recovering,
                          ended,
                          continued,
                        };
                        const e = entryState(f);
                        const why = JSON.stringify(f);
                        checked++;
                        const signedIn = session ?? offline;
                        if (misconfigured) {
                          assert.equal(e.kind, "misconfigured", why);
                          continue;
                        }
                        if (!configured) {
                          assert.equal(e.kind, "unconfigured", why);
                          continue;
                        }
                        // Another account's protected training never opens.
                        const othersData =
                          !!owner &&
                          (hasLocalData || !!syncHistory) &&
                          owner !== (signedIn ?? ended)?.id;
                        if (e.kind === "ready" || e.kind === "setup") {
                          assert.equal(e.user.id, signedIn?.id, why);
                          assert.ok(!othersData, why);
                          assert.ok(owner || !hasLocalData, why);
                        }
                        // Continuing: nobody signed in, and only the ended
                        // account's own training.
                        if (e.kind === "continuing") {
                          assert.equal(signedIn, undefined, why);
                          assert.equal(session, null, why);
                          assert.equal(e.user.id, ended?.id, why);
                          assert.equal(owner, ended?.id, why);
                          assert.ok(continued, why);
                        }
                        // Someone signed in: an earlier ending changes nothing.
                        if (signedIn)
                          assert.deepEqual(
                            e,
                            entryState({
                              ...f,
                              ended: undefined,
                              continued: undefined,
                            }),
                            why,
                          );
                        if (e.kind === "unlinked") {
                          assert.equal(owner, undefined, why);
                          assert.ok(hasLocalData, why);
                        }
                      }
  assert.equal(checked, 13_824);
});

/** A small seeded generator, so any failure can be replayed. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("tokenSubject: random and malformed tokens never throw, and only a top-level string sub counts", () => {
  const next = random(78);
  const pieces = [
    ".",
    "..",
    "=",
    "-",
    "_",
    "+",
    "/",
    "A",
    "z",
    "0",
    "eyJ",
    "é",
    "🏋️",
    "\u0000",
    "\n",
    " ",
    "%",
    "\\",
    '"',
  ];
  for (let i = 0; i < 5000; i++) {
    let token = "";
    const length = Math.floor(next() * 120);
    for (let j = 0; j < length; j++)
      token += pieces[Math.floor(next() * pieces.length)];
    const sub = tokenSubject(token);
    assert.ok(sub === undefined || (typeof sub === "string" && sub), token);
  }
  // Real shapes, with names and emojis in the metadata, in either base64.
  const encode = (claims: unknown, encoding: "base64url" | "base64") =>
    `h.${Buffer.from(JSON.stringify(claims)).toString(encoding)}.s`;
  for (let i = 0; i < 500; i++) {
    const id = `${Math.floor(next() * 1e12).toString(16)}-${i}`;
    const claims = {
      sub: id,
      role: "authenticated",
      amr: [{ method: "oauth", timestamp: i }],
      user_metadata: { full_name: `José Ñandú ${i} 🏋️`, sub: "not-this" },
    };
    assert.equal(tokenSubject(encode(claims, "base64url")), id);
    assert.equal(tokenSubject(encode(claims, "base64")), id);
  }
  for (const claims of [
    { sub: 7 },
    { sub: null },
    { sub: "" },
    { sub: ["user-a"] },
    { sub: { id: "user-a" } },
    { user_metadata: { sub: "user-a" } },
    ["user-a"],
    "user-a",
    7,
    null,
  ])
    assert.equal(
      tokenSubject(encode(claims, "base64url")),
      undefined,
      JSON.stringify(claims),
    );
  // Very large tokens are read without trouble.
  assert.equal(
    tokenSubject(encode({ sub: A, pad: "x".repeat(1_000_000) }, "base64url")),
    A,
  );
});

const HOSTILE = [
  "",
  " ",
  "null",
  "true",
  "0",
  "-1",
  "1e999",
  "NaN",
  "[]",
  "{}",
  "[{}]",
  '"user-a"',
  "{",
  "\u0000",
  '{"owner":123,"workout":"w","state":"deleted","at":1}',
  '{"owner":"","workout":"w","state":"deleted","localRemoved":false,"at":1}',
  '{"owner":["user-a"],"workout":"w","state":"deleted","at":1}',
  '{"owner":"user-a","workout":"","at":1}',
  '{"owner":"user-a","workout":"w","state":"deleted","localRemoved":false,"at":"1"}',
  '{"owner":"user-a","workout":"w","state":"deleted","localRemoved":false}',
  '{"owner":"user-a","state":"erased","at":1}',
  '{"owner":"user-a","state":"deleted","at":null}',
  '{"owner":"user-a","localRemoved":"false","at":1}',
  '{"__proto__":{"owner":"user-a","workout":"w","state":"deleted","localRemoved":false,"at":1}}',
  '{"constructor":{"prototype":{"owner":"user-a"}}}',
  "x".repeat(1_000_000),
];

test("stored markers: corrupted or hostile values are ignored, never thrown, never trusted", () => {
  const r = phone(A);
  r.saveProfile({ onboarded: true });
  for (const raw of HOSTILE) {
    const why = raw.slice(0, 80);
    for (const key of ["sessionEnded", "accountDeletion", "accountDeleted"])
      r.setSetting(key, raw);
    assert.equal(sessionEnded(r), undefined, why);
    assert.equal(continuation(r), undefined, why);
    assert.equal(continuedWorkout(r, A), undefined, why);
    assert.equal(pendingDeletion(r), undefined, why);
    assert.equal(deletedAccount(r), undefined, why);
  }
  // Nothing leaked into every object.
  assert.equal(({} as { owner?: unknown }).owner, undefined);
  assert.equal(dataOwner(r), A);
});

test("a continuation marker for another account, workout or time never continues", () => {
  const r = phone(A);
  r.saveProfile({ onboarded: true });
  const w = r.startWorkout("Push day");
  const now = Date.UTC(2026, 10, 2, 18);
  const marker = (m: object) => r.setSetting("sessionEnded", JSON.stringify(m));
  marker({ owner: A, workout: w.id, at: now });
  assert.ok(continuation(r, now), "the genuine marker continues");
  for (const m of [
    { owner: B, workout: w.id, at: now },
    { owner: A, workout: "another-workout", at: now },
    { owner: A, workout: w.id, at: now + 60_000 },
    { owner: A, workout: w.id, at: 1e308 },
    { owner: A, workout: w.id, at: now - CONTINUE_FOR_MS },
    { owner: A, workout: w.id, at: -now },
  ]) {
    marker(m);
    assert.equal(continuation(r, now), undefined, JSON.stringify(m));
  }
  // B never opens A's workout, whatever the marker says.
  marker({ owner: B, workout: w.id, at: now });
  assert.equal(continuedWorkout(r, B, now), undefined);
});

test("a deletion marker naming another account never removes this phone's training", async () => {
  const r = phone(A);
  r.saveProfile({ onboarded: true });
  r.startWorkout("Push day");
  const before = localSummary(r);
  assert.equal(before.workouts, 1);
  const calls: string[] = [];
  const deps: DeletionDeps = {
    deleteInCloud: async () => {
      calls.push("deleteInCloud");
      return {};
    },
    currentUser: async () => {
      calls.push("currentUser");
      return { missing: true };
    },
    signOut: async () => void calls.push("signOut"),
    afterRemove: () => void calls.push("afterRemove"),
  };
  const marker = (state: string) =>
    r.setSetting("accountDeletion", JSON.stringify({ owner: B, state, at: 1 }));
  // A's own screens ignore B's marker entirely.
  marker("requested");
  assert.equal(await checkDeletion(r, A, deps), undefined);
  // At launch, signed in as A: B's unconfirmed request isn't checked.
  assert.equal(await resumeDeletion(r, A, deps), undefined);
  assert.equal(calls.length, 0);
  // Even a "confirmed" marker for B removes nothing of A's.
  marker("deleted");
  await resumeDeletion(r, A, deps);
  assert.ok(!calls.includes("afterRemove"));
  assert.ok(!calls.includes("deleteInCloud"));
  assert.deepEqual(localSummary(r), before);
  assert.equal(dataOwner(r), A);
  assert.equal(deletedAccount(r)?.localRemoved, false);
  // The account service saying B is gone changes nothing on A's phone.
  r.clearSetting("accountDeleted");
  noteAccountGone(r, B);
  assert.equal(deletedAccount(r), undefined);
  assert.deepEqual(localSummary(r), before);
});
