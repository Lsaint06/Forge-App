import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOCK_NOTE_MS,
  cacheKey,
  entitlementCache,
} from "../src/billing/cache";
import {
  parseEntitlementResponse,
  type VerifiedEntitlement,
} from "../src/billing/entitlement";
import {
  A,
  B,
  DAY,
  HOUR,
  MIN,
  PRODUCT,
  T0,
  answer,
  memoryStore,
  rowFor,
  type Sub,
} from "./billing-fixture";

// Phase 9.1: this phone's copy of the server's answer. One entry per
// account, checked against its account and re-checked on every read, so one
// account's membership is never read as another's, and nothing unverified
// or tampered with is ever used.

function verified(
  userId: string,
  serverNow: number,
  status: "trial" | "expired" | "none" = "trial",
): VerifiedEntitlement {
  const subs: Record<string, Sub> =
    status === "none"
      ? {}
      : {
          [PRODUCT]:
            status === "trial"
              ? {
                  purchased: serverNow,
                  expires: serverNow + 7 * DAY,
                  trial: true,
                }
              : { purchased: serverNow - 31 * DAY, expires: serverNow - DAY },
        };
  const parsed = parseEntitlementResponse(
    answer(userId, serverNow, rowFor(userId, serverNow, subs)),
  );
  assert.ok(parsed.ok);
  return parsed.value;
}

test("an answer is kept for its own account, and read back exactly", async () => {
  const { store, data } = memoryStore();
  const cache = entitlementCache(store);
  const kept = await cache.save(verified(A, T0), T0 + 5);
  assert.deepEqual(kept, {
    ...verified(A, T0),
    receivedAt: T0 + 5,
    checkedAt: T0 + 5,
  });
  assert.deepEqual(await cache.read(A), kept);
  assert.deepEqual([...data.keys()], [`forge.entitlement.${A}`]);
  // Nothing about the membership is readable for another account.
  assert.equal(await cache.read(B), undefined);
});

test("each account has its own entry; one account's entry never answers for another", async () => {
  const { store, data } = memoryStore();
  const cache = entitlementCache(store);
  await cache.save(verified(A, T0, "trial"), T0);
  await cache.save(verified(B, T0, "expired"), T0);
  assert.equal((await cache.read(A))?.entitlement.status, "trial");
  assert.equal((await cache.read(B))?.entitlement.status, "expired");
  // A's entry copied under B's key (a tampered store) isn't B's: it goes,
  // and B keeps only its own answer.
  data.set(cacheKey(B)!, data.get(cacheKey(A)!)!);
  const b = await cache.read(B);
  assert.equal(b?.userId, B);
  assert.equal(b?.entitlement.status, "expired");
  assert.equal(data.has(cacheKey(B)!), false);
  // After a restart, nothing is left for B at all.
  data.set(cacheKey(B)!, data.get(cacheKey(A)!)!);
  assert.equal(
    await entitlementCache(memoryStore(data).store).read(B),
    undefined,
  );
  assert.equal((await cache.read(A))?.entitlement.status, "trial");
});

test("only Forge account IDs make keys", async () => {
  const { store, data } = memoryStore();
  const cache = entitlementCache(store);
  for (const id of ["", "user-a", "../x", "forge.entitlement", `${A}.0`]) {
    assert.equal(cacheKey(id), undefined);
    assert.equal(await cache.read(id), undefined);
  }
  await assert.rejects(
    cache.save({ ...verified(A, T0), userId: "user-a" }, T0),
    /Forge account/,
  );
  assert.equal(data.size, 0);
});

test("an unreadable or altered entry is discarded, never used", async () => {
  const good = async () => {
    const m = memoryStore();
    await entitlementCache(m.store).save(verified(A, T0), T0);
    return m;
  };
  const stored = (raw: string) => JSON.parse(raw) as Record<string, unknown>;
  const alterations: [string, (s: Record<string, unknown>) => unknown][] = [
    ["not JSON", () => "{"],
    ["another version", (s) => ({ ...s, v: 2 })],
    ["no reception time", (s) => ({ ...s, receivedAt: undefined })],
    [
      "checked before received",
      (s) => ({ ...s, checkedAt: (s.receivedAt as number) - 1 }),
    ],
    [
      "another account's answer",
      (s) => ({ ...s, answer: { ...(s.answer as object), user_id: B } }),
    ],
    [
      "access stretched past the period",
      (s) => {
        const a = structuredClone(s.answer) as {
          entitlement: Record<string, number>;
        };
        a.entitlement.access_until! += 30 * DAY;
        return { ...s, answer: a };
      },
    ],
    [
      "an expiry turned into a trial",
      (s) => {
        const a = structuredClone(s.answer) as {
          entitlement: Record<string, unknown>;
        };
        a.entitlement.status = "lifetime";
        return { ...s, answer: a };
      },
    ],
  ];
  for (const [name, alter] of alterations) {
    const m = await good();
    const key = cacheKey(A)!;
    const altered = alter(stored(m.data.get(key)!));
    m.data.set(
      key,
      typeof altered === "string" ? altered : JSON.stringify(altered),
    );
    // A restart reads only what is stored.
    const restarted = entitlementCache(memoryStore(m.data).store);
    assert.equal(await restarted.read(A), undefined, name);
    assert.equal(m.data.has(key), false, `${name}: removed`);
  }
});

test("a secure store that fails: this run keeps its answer, a restart has none", async () => {
  const m = memoryStore();
  const cache = entitlementCache(m.store);
  await cache.save(verified(A, T0), T0);
  m.fail.get = true;
  assert.equal((await cache.read(A))?.serverNow, T0);
  const unreadable = memoryStore(m.data);
  unreadable.fail.get = true;
  assert.equal(await entitlementCache(unreadable.store).read(A), undefined);
  m.fail.get = false;
  m.fail.set = true;
  await assert.rejects(cache.save(verified(A, T0 + HOUR), T0 + HOUR));
  // The failure stops nothing that follows.
  m.fail.set = false;
  assert.equal((await cache.read(A))?.serverNow, T0 + HOUR);
});

test("a refused write never lets an older, wider answer come back", async () => {
  const m = memoryStore();
  const cache = entitlementCache(m.store);
  await cache.save(verified(A, T0, "trial"), T0);
  // The refund arrives while the phone is locked: the write is refused.
  m.fail.set = true;
  await assert.rejects(
    cache.save(verified(A, T0 + HOUR, "expired"), T0 + HOUR),
  );
  m.fail.set = false;
  // This run decides from the newer answer…
  assert.equal((await cache.read(A))?.entitlement.status, "expired");
  // …and the older stored answer is gone, so a restart can't use it.
  assert.equal(m.data.has(cacheKey(A)!), false);
  assert.equal(
    await entitlementCache(memoryStore(m.data).store).read(A),
    undefined,
  );
});

test("every caller on one secure store shares one cache", async () => {
  const m = memoryStore();
  const gate = entitlementCache(m.store);
  const session = entitlementCache(m.store);
  assert.equal(gate, session);
  await session.save(verified(A, T0, "trial"), T0);
  // The gate's slow clock note and the session's newer answer, together.
  m.slowWrites.push(30);
  await Promise.all([
    gate.noteClock(A, T0 + HOUR),
    session.save(verified(A, T0 + 2 * HOUR, "expired"), T0 + 2 * HOUR),
  ]);
  const restarted = entitlementCache(memoryStore(m.data).store);
  assert.equal((await restarted.read(A))?.entitlement.status, "expired");
});

test("a late, older answer never replaces a newer one", async () => {
  const cache = entitlementCache(memoryStore().store);
  await cache.save(verified(A, T0 + HOUR, "expired"), T0 + HOUR);
  const kept = await cache.save(verified(A, T0, "trial"), T0 + 2 * HOUR);
  assert.equal(kept.serverNow, T0 + HOUR);
  assert.equal((await cache.read(A))?.entitlement.status, "expired");
});

test("the latest clock reading only moves forward, at most once a minute", async () => {
  const cache = entitlementCache(memoryStore().store);
  await cache.save(verified(A, T0), T0);
  await cache.noteClock(A, T0 + 30_000);
  assert.equal((await cache.read(A))?.checkedAt, T0);
  await cache.noteClock(A, T0 + HOUR);
  assert.equal((await cache.read(A))?.checkedAt, T0 + HOUR);
  // A clock set back changes nothing.
  await cache.noteClock(A, T0);
  assert.equal((await cache.read(A))?.checkedAt, T0 + HOUR);
  await cache.noteClock(A, T0 + HOUR + CLOCK_NOTE_MS);
  assert.equal((await cache.read(A))?.checkedAt, T0 + HOUR + MIN);
  // No entry, nothing to note.
  assert.equal(await cache.noteClock(B, T0 + DAY), undefined);
});

test("a slow write never brings back an answer a newer one replaced", async () => {
  const m = memoryStore();
  const cache = entitlementCache(m.store);
  await cache.save(verified(A, T0, "trial"), T0);
  // The clock note's write is slow; the newer answer arrives meanwhile.
  m.slowWrites.push(30);
  const noting = cache.noteClock(A, T0 + HOUR);
  const saving = cache.save(
    verified(A, T0 + 2 * HOUR, "expired"),
    T0 + 2 * HOUR,
  );
  await Promise.all([noting, saving]);
  const held = await cache.read(A);
  assert.equal(held?.entitlement.status, "expired");
  assert.equal(held?.serverNow, T0 + 2 * HOUR);
});

test("forgetting an account removes its entry only", async () => {
  const m = memoryStore();
  const cache = entitlementCache(m.store);
  await cache.save(verified(A, T0), T0);
  await cache.save(verified(B, T0), T0);
  await cache.forget(A);
  assert.equal(await cache.read(A), undefined);
  assert.equal((await cache.read(B))?.userId, B);
  await cache.forget("user-a");
  assert.equal(m.data.size, 1);
});
