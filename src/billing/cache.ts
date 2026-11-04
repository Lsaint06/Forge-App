import {
  isAccountId,
  parseEntitlementResponse,
  toEntitlementResponse,
  type CachedEntitlement,
  type EntitlementResponse,
  type VerifiedEntitlement,
} from "./entitlement";

// This phone's copy of the server's latest answer (Phase 9.1), so a verified
// membership keeps working offline until its verified end, and no longer.
// One entry per account, in the secure store, under a key made from the
// account's ID; each entry also names its account and is checked against it
// on every read, so one account's membership can never be read as another's.
// Only answers that passed entitlement.ts are written, and each read checks
// them again: anything unreadable is discarded, and then only the server can
// grant access. Training data never lives here.

/** The secure store's shape (expo-secure-store, chunked: secure-cache.ts). */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const VERSION = 1;
const PREFIX = "forge.entitlement.";

/** How often a later clock reading is written down (access.ts, trustedNow). */
export const CLOCK_NOTE_MS = 60_000;

/** The account's entry key; none for anything that isn't an account ID. */
export const cacheKey = (userId: string) =>
  isAccountId(userId) ? `${PREFIX}${userId}` : undefined;

type Stored = {
  v: typeof VERSION;
  receivedAt: number;
  checkedAt: number;
  answer: EntitlementResponse;
};

const isDeviceTime = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function decode(raw: string, userId: string): CachedEntitlement | undefined {
  try {
    const s = JSON.parse(raw) as Partial<Stored> | null;
    if (
      !s ||
      s.v !== VERSION ||
      !isDeviceTime(s.receivedAt) ||
      !isDeviceTime(s.checkedAt) ||
      s.checkedAt < s.receivedAt
    )
      return undefined;
    const parsed = parseEntitlementResponse(s.answer);
    if (!parsed.ok || parsed.value.userId !== userId) return undefined;
    return {
      ...parsed.value,
      receivedAt: s.receivedAt,
      checkedAt: s.checkedAt,
    };
  } catch {
    return undefined;
  }
}

/** The newer of two answers about one account. */
function newer(a?: CachedEntitlement, b?: CachedEntitlement) {
  if (!a || !b) return a ?? b;
  if (a.serverNow !== b.serverNow) return a.serverNow > b.serverNow ? a : b;
  return a.checkedAt >= b.checkedAt ? a : b;
}

const caches = new WeakMap<KeyValueStore, ReturnType<typeof create>>();

/**
 * The cache on `store`: always the same one for the same store, whoever asks,
 * so its operations run one at a time and it remembers the newest answers.
 */
export function entitlementCache(store: KeyValueStore) {
  let cache = caches.get(store);
  if (!cache) caches.set(store, (cache = create(store)));
  return cache;
}

function create(store: KeyValueStore) {
  // One operation at a time, so a slow write never brings back an answer a
  // newer one replaced.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  // The newest answer per account in this process: a write the secure store
  // refuses (a locked phone, say) never lets an older stored answer back.
  const latest = new Map<string, CachedEntitlement>();

  async function load(userId: string) {
    const key = cacheKey(userId);
    if (!key) return undefined;
    let raw: string | null;
    try {
      raw = await store.getItem(key);
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;
    const held = decode(raw, userId);
    if (!held) await store.removeItem(key).catch(() => undefined);
    return held;
  }

  async function current(userId: string) {
    const held = newer(latest.get(userId), await load(userId));
    if (held) latest.set(userId, held);
    return held;
  }

  async function write(held: CachedEntitlement) {
    const stored: Stored = {
      v: VERSION,
      receivedAt: held.receivedAt,
      checkedAt: held.checkedAt,
      answer: toEntitlementResponse(held),
    };
    await store.setItem(`${PREFIX}${held.userId}`, JSON.stringify(stored));
  }

  return {
    /** This account's verified answer, if this phone holds a valid one. */
    read: (userId: string) => serial(() => current(userId)),

    /**
     * Keeps a checked server answer, received at `receivedAt` (this phone's
     * clock). An answer older than the one kept (a slow reply overtaken by a
     * newer one) changes nothing; the kept one is returned. When the secure
     * store refuses the write, the older stored answer is removed (so a
     * restart can't bring it back) and the error is passed on.
     */
    save: (answer: VerifiedEntitlement, receivedAt: number) =>
      serial(async () => {
        if (!isAccountId(answer.userId) || !isDeviceTime(receivedAt))
          throw new Error("Only a Forge account's answer can be kept");
        const kept = await current(answer.userId);
        if (kept && kept.serverNow > answer.serverNow) return kept;
        const held: CachedEntitlement = {
          ...answer,
          receivedAt,
          checkedAt: receivedAt,
        };
        latest.set(answer.userId, held);
        try {
          await write(held);
        } catch (e) {
          await store
            .removeItem(`${PREFIX}${held.userId}`)
            .catch(() => undefined);
          throw e;
        }
        return held;
      }),

    /**
     * Notes the latest time this phone's clock has shown, so setting it back
     * later is caught. Never moves backwards; written at most every minute.
     */
    noteClock: (userId: string, now: number) =>
      serial(async () => {
        const kept = await current(userId);
        if (!kept || !isDeviceTime(now) || now < kept.checkedAt + CLOCK_NOTE_MS)
          return kept;
        const held = { ...kept, checkedAt: now };
        latest.set(userId, held);
        await write(held);
        return held;
      }),

    /** Sign-out or account deletion: this account's entry goes. */
    forget: (userId: string) =>
      serial(async () => {
        latest.delete(userId);
        const key = cacheKey(userId);
        if (key) await store.removeItem(key);
      }),
  };
}

export type EntitlementCache = ReturnType<typeof entitlementCache>;
