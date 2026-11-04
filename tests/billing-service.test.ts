import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAccess, previewAllowed } from "../src/billing/access";
import { cacheKey } from "../src/billing/cache";
import {
  currentAccess,
  purchaseMembership,
  restoreMembership,
  signedIn,
  signedOut,
  verify,
} from "../src/billing/service";
import { Repository, type SqlDatabase } from "../src/data/repository";
import { phone } from "./cloud-fixture";
import { A, B, DAY, HOUR, MIN, PRODUCT, T0, billing } from "./billing-fixture";

// Phase 9.1: the trust chain. The store sells; Forge's server decides; only
// the server's checked answer about the account that asked reaches this
// phone. Membership changes decide which screens may open and never touch
// the athlete's training.

test("a purchase grants access only once Forge's server confirms it", async () => {
  const { deps, store, server, memory } = billing();
  const result = await purchaseMembership(deps, A);
  assert.deepEqual(result.outcome, { kind: "completed" });
  assert.deepEqual(result.access, {
    kind: "granted",
    status: "trial",
    until: T0 + 7 * DAY,
    renews: true,
  });
  assert.equal(result.problem, undefined);
  // The store knew whose purchase it was before it happened.
  assert.deepEqual(store.log, [`identify ${A}`, `purchase ${PRODUCT}`]);
  assert.equal(server.calls.refresh, 1);
  assert.ok(memory.data.has(cacheKey(A)!));
  assert.equal(hasAccess(await currentAccess(deps, A)), true);
});

test("Expo Go's pretend purchase grants nothing: the server has no record", async () => {
  const { deps } = billing({ settles: false });
  const result = await purchaseMembership(deps, A);
  assert.deepEqual(result.outcome, { kind: "completed" });
  assert.deepEqual(result.access, { kind: "denied", reason: "never" });
  // Still in the first onboarding: the preview and the paywall remain.
  assert.equal(previewAllowed(result.access), true);
  assert.deepEqual(await currentAccess(deps, A), {
    kind: "denied",
    reason: "never",
  });
});

test("no purchase outcome reaches the cache or the decision by itself", async () => {
  for (const outcome of [
    { kind: "pending" } as const,
    { kind: "cancelled" } as const,
    { kind: "failed", problem: "notAllowed" } as const,
    new Error("StoreKit exploded"),
  ]) {
    const { deps, store, server, memory } = billing();
    store.purchases.push(outcome);
    const result = await purchaseMembership(deps, A);
    assert.equal(server.calls.refresh, 0);
    assert.equal(memory.data.size, 0);
    assert.deepEqual(result.access, { kind: "unverified", reason: "missing" });
    if (outcome instanceof Error)
      assert.deepEqual(result.outcome, { kind: "failed", problem: "unknown" });
  }
});

test("without the account bound to the store, no purchase is attempted", async () => {
  const { deps, store, server } = billing();
  store.failIdentify = true;
  const result = await purchaseMembership(deps, A);
  assert.deepEqual(result.outcome, { kind: "failed", problem: "unavailable" });
  assert.deepEqual(store.log, [`identify ${A}`]);
  assert.equal(server.rc.size, 0);
  assert.equal(hasAccess(result.access), false);
});

test("a pending purchase waits for the store, then for the server", async () => {
  const { deps, store, server, wait } = billing();
  store.purchases.push({ kind: "pending" });
  const result = await purchaseMembership(deps, A);
  assert.deepEqual(result.outcome, { kind: "pending" });
  assert.equal(hasAccess(result.access), false);
  // Ask to Buy approved an hour later: the store reports a change.
  wait(HOUR);
  server.rc.set(A, {
    [PRODUCT]: {
      purchased: server.now,
      expires: server.now + 7 * DAY,
      trial: true,
    },
  });
  let after: Awaited<ReturnType<typeof verify>> | undefined;
  const unsubscribe = deps.provider.onStoreChange(() => {
    void verify(deps, A).then((v) => (after = v));
  });
  store.change();
  await new Promise((r) => setImmediate(r));
  unsubscribe();
  assert.equal(after?.access.kind, "granted");
});

test("offline right after paying: no access until the server answers", async () => {
  const { deps, server } = billing();
  server.faults.push("offline");
  const result = await purchaseMembership(deps, A);
  assert.equal(result.problem, "offline");
  assert.deepEqual(result.access, { kind: "unverified", reason: "missing" });
  // Back online, the next verification confirms it.
  const later = await verify(deps, A);
  assert.equal(later.access.kind, "granted");
});

test("the server's failures are named, and grant nothing", async () => {
  for (const [fault, problem] of [
    ["offline", "offline"],
    ["unavailable", "unavailable"],
    ["auth", "auth"],
    ["malformed", "invalid"],
    ["otherAccount", "account"],
  ] as const) {
    const { deps, server, memory } = billing();
    server.rc.set(A, {
      [PRODUCT]: { purchased: T0, expires: T0 + 7 * DAY, trial: true },
    });
    server.rc.set(B, {
      [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY },
    });
    server.faults.push(fault);
    const result = await verify(deps, A);
    assert.equal(result.problem, problem);
    assert.deepEqual(result.access, { kind: "unverified", reason: "missing" });
    // Above all, B's membership is never kept as A's.
    assert.equal(memory.data.size, 0, fault);
  }
});

test("a malformed answer leaves the last verified one in place", async () => {
  const { deps, server } = billing();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY },
  });
  assert.equal((await verify(deps, A)).access.kind, "granted");
  server.faults.push("malformed");
  const result = await verify(deps, A);
  assert.equal(result.problem, "invalid");
  assert.equal(result.access.kind, "granted");
});

test("restoring purchases: the server decides what was restored", async () => {
  const lapsed = billing();
  lapsed.server.rc.set(A, {
    [PRODUCT]: { purchased: T0 - 40 * DAY, expires: T0 - 10 * DAY },
  });
  const ended = await restoreMembership(lapsed.deps, A);
  assert.deepEqual(ended.outcome, { kind: "completed" });
  assert.deepEqual(ended.access, { kind: "denied", reason: "expired" });
  assert.equal(previewAllowed(ended.access), false);

  const paying = billing();
  paying.server.rc.set(A, {
    [PRODUCT]: { purchased: T0 - 5 * DAY, expires: T0 + 25 * DAY },
  });
  assert.equal(
    (await restoreMembership(paying.deps, A)).access.kind,
    "granted",
  );

  const failed = billing();
  failed.store.restores.push({ kind: "failed", problem: "offline" });
  const r = await restoreMembership(failed.deps, A);
  assert.deepEqual(r.outcome, { kind: "failed", problem: "offline" });
  assert.equal(failed.server.calls.refresh, 0);
});

test("switching accounts: one account's membership never opens another's", async () => {
  const { deps, store, phone: device, memory } = billing();
  await purchaseMembership(deps, A);
  assert.equal(hasAccess(await currentAccess(deps, A)), true);
  // B signs in on the same phone, A's answer still stored: nothing for B.
  device.user = B;
  assert.deepEqual(await currentAccess(deps, B), {
    kind: "unverified",
    reason: "missing",
  });
  const b = await signedIn(deps, B);
  assert.deepEqual(b.access, { kind: "denied", reason: "never" });
  assert.equal(store.identified, B);
  // B signs out: B's answer goes, A's stays A's.
  await signedOut(deps, B);
  assert.equal(store.identified, undefined);
  assert.equal(memory.data.has(cacheKey(B)!), false);
  assert.equal(memory.data.has(cacheKey(A)!), true);
  // A signs out: nothing of A's membership is left on the phone.
  await signedOut(deps, A);
  assert.equal(memory.data.size, 0);
});

test("offline, a verified membership lasts exactly to its verified end", async () => {
  const { deps, server, wait } = billing();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 7 * DAY, trial: true },
  });
  await verify(deps, A);
  // The gym has no signal for the rest of the week.
  server.faults.push(...Array<"offline">(10).fill("offline"));
  wait(7 * DAY - 1);
  assert.equal(hasAccess(await currentAccess(deps, A)), true);
  wait(1);
  assert.deepEqual(await currentAccess(deps, A), {
    kind: "unverified",
    reason: "renewal",
  });
  const offline = await verify(deps, A);
  assert.equal(offline.problem, "offline");
  assert.equal(hasAccess(offline.access), false);
  // Online again: Apple renewed it into a paid month.
  server.faults.length = 0;
  server.rc.set(A, {
    [PRODUCT]: {
      purchased: T0 + 7 * DAY,
      expires: T0 + 37 * DAY,
      original: T0,
    },
  });
  assert.deepEqual((await verify(deps, A)).access, {
    kind: "granted",
    status: "active",
    until: T0 + 37 * DAY,
    renews: true,
  });
});

test("cancelling keeps the membership to its end; then it ends", async () => {
  const { deps, server, wait } = billing();
  await purchaseMembership(deps, A);
  wait(2 * DAY);
  const sub = server.rc.get(A)![PRODUCT]!;
  server.rc.set(A, { [PRODUCT]: { ...sub, unsubscribed: server.now } });
  assert.deepEqual((await verify(deps, A)).access, {
    kind: "granted",
    status: "trial",
    until: T0 + 7 * DAY,
    renews: false,
  });
  wait(5 * DAY - MIN);
  assert.equal(hasAccess((await verify(deps, A)).access), true);
  wait(MIN);
  assert.deepEqual((await verify(deps, A)).access, {
    kind: "denied",
    reason: "expired",
  });
});

test("a refund ends access at the next verification", async () => {
  const { deps, server, wait } = billing();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY },
  });
  await verify(deps, A);
  wait(DAY);
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY, refunded: server.now },
  });
  assert.deepEqual((await verify(deps, A)).access, {
    kind: "denied",
    reason: "revoked",
  });
});

test("a phone clock set back is caught; the server's next answer recovers", async () => {
  const { deps, server, phone: device } = billing();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY },
  });
  await verify(deps, A);
  device.now = T0 + 2 * HOUR;
  assert.equal(hasAccess(await currentAccess(deps, A)), true);
  device.now = T0 + HOUR;
  assert.deepEqual(await currentAccess(deps, A), {
    kind: "unverified",
    reason: "clock",
  });
  server.now = T0 + 2 * HOUR;
  assert.equal((await verify(deps, A)).access.kind, "granted");
});

test("a secure store that can't keep the answer still lets the fresh answer decide", async () => {
  const { deps, server, memory, restart } = billing();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY },
  });
  memory.fail.set = true;
  assert.equal((await verify(deps, A)).access.kind, "granted");
  assert.equal(hasAccess(await currentAccess(deps, A)), true);
  // Nothing kept for offline use: after a restart, the server must answer.
  assert.deepEqual(await currentAccess(restart().deps, A), {
    kind: "unverified",
    reason: "missing",
  });
});

test("a refund the phone couldn't store still ends access, now and after a restart", async () => {
  const { deps, server, memory, wait, restart } = billing();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY },
  });
  await verify(deps, A);
  wait(DAY);
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0, expires: T0 + 30 * DAY, refunded: server.now },
  });
  // The refund arrives while the phone is locked: the secure store refuses.
  memory.fail.set = true;
  assert.deepEqual((await verify(deps, A)).access, {
    kind: "denied",
    reason: "revoked",
  });
  memory.fail.set = false;
  // Offline afterwards: the paid month never comes back.
  server.faults.push("offline", "offline");
  assert.deepEqual(await currentAccess(deps, A), {
    kind: "denied",
    reason: "revoked",
  });
  assert.equal(hasAccess((await verify(deps, A)).access), false);
  const after = restart();
  assert.equal(hasAccess(await currentAccess(after.deps, A)), false);
  assert.equal(hasAccess((await verify(after.deps, A)).access), false);
});

/** Every table's rows, as stored. */
function dump(db: SqlDatabase) {
  return Object.fromEntries(
    db
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .map(({ name }) => [
        name,
        db.all(`SELECT * FROM "${name}" ORDER BY rowid`),
      ]),
  );
}

/**
 * Every call of any Repository's methods, anywhere in this process, and of
 * this phone's database, while `run` runs.
 */
async function trainingCalls(r: Repository, run: () => Promise<void>) {
  const calls: string[] = [];
  const proto = Repository.prototype as unknown as Record<string, unknown>;
  const originals: [string, PropertyDescriptor][] = [];
  for (const name of Object.getOwnPropertyNames(Repository.prototype)) {
    const d = Object.getOwnPropertyDescriptor(Repository.prototype, name);
    if (name === "constructor" || typeof d?.value !== "function") continue;
    originals.push([name, d]);
    const original = d.value as (...args: unknown[]) => unknown;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      calls.push(`Repository.${name}`);
      return original.apply(this, args);
    };
  }
  const db = r.db as unknown as Record<string, (...args: unknown[]) => unknown>;
  const direct = { ...db };
  for (const name of ["exec", "run", "all"])
    db[name] = (...args: unknown[]) => {
      calls.push(`db.${name}`);
      return direct[name]!(...args);
    };
  try {
    await run();
  } finally {
    for (const [name, d] of originals)
      Object.defineProperty(Repository.prototype, name, d);
    Object.assign(db, direct);
  }
  return calls;
}

test("membership changes never touch the athlete's training", async () => {
  const r = phone(A);
  r.saveProfile({ name: "Lifter", onboarded: true });
  const done = r.startWorkout("Push");
  const row = r.addExercise(done.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { weight: 60, reps: 5, completed: true });
  r.finishWorkout(done.id);
  r.addJournal("measurement", { name: "Bodyweight", value: 80, unit: "kg" });
  // A workout in progress when the membership ends.
  const open = r.startWorkout("Pull");
  r.addSet(r.addExercise(open.id, "barbell-bench-press").id);
  const before = dump(r.db);

  const { deps, server, store, wait } = billing();
  const steps: string[] = [];
  const step = async (name: string, run: () => Promise<unknown>) => {
    await run();
    steps.push(`${name}: ${(await currentAccess(deps, A)).kind}`);
  };
  const calls = await trainingCalls(r, async () => {
    await step("trial", () => purchaseMembership(deps, A));
    await step("cancelled", async () => {
      const sub = server.rc.get(A)![PRODUCT]!;
      server.rc.set(A, { [PRODUCT]: { ...sub, unsubscribed: server.now } });
      return verify(deps, A);
    });
    await step("expired", async () => {
      wait(8 * DAY);
      return verify(deps, A);
    });
    await step("resubscribed", () => purchaseMembership(deps, A));
    await step("billing retry", async () => {
      wait(31 * DAY);
      const sub = server.rc.get(A)![PRODUCT]!;
      server.rc.set(A, {
        [PRODUCT]: { ...sub, billingIssue: server.now - HOUR },
      });
      return verify(deps, A);
    });
    await step("grace", async () => {
      const sub = server.rc.get(A)![PRODUCT]!;
      server.rc.set(A, { [PRODUCT]: { ...sub, grace: server.now + 3 * DAY } });
      return verify(deps, A);
    });
    await step("refunded", async () => {
      const sub = server.rc.get(A)![PRODUCT]!;
      server.rc.set(A, { [PRODUCT]: { ...sub, refunded: server.now } });
      return verify(deps, A);
    });
    await step("restored", () => restoreMembership(deps, A));
    await step("signed out", () => signedOut(deps, A));
  });
  assert.deepEqual(steps, [
    "trial: granted",
    "cancelled: granted",
    "expired: denied",
    "resubscribed: granted",
    "billing retry: denied",
    "grace: granted",
    "refunded: denied",
    "restored: denied",
    "signed out: unverified",
  ]);
  assert.ok(store.log.length > 0);
  // Nothing in the membership flows read or wrote training data…
  assert.deepEqual(calls, []);
  // …every table is exactly as it was, and the workout is still in progress.
  assert.deepEqual(dump(r.db), before);
  assert.equal(r.active()?.id, open.id);
});
