import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "../data/repository";
import { dataOwner } from "../data/ownership";

// Deleting the Forge account (Phase 7.8E, Stage 2). `forge_delete_account`
// deletes the account and, through the database, every cloud record; then
// this phone's training is removed too, as the athlete confirmed. Before the
// request is sent, a marker in local settings records it (the account's ID,
// a state and a time: never a token, password or email), so an interrupted
// deletion is finished or reported on evidence only: the server's answer, or
// the account service saying the account no longer exists. Nothing is
// removed on a guess.

const MARKER = "accountDeletion";
const DELETED = "accountDeleted";

/**
 * requested: sent, and not yet confirmed either way. deleted: confirmed;
 * this phone's part may still be unfinished. notDeleted: checked, and the
 * account still exists.
 */
export type DeletionState = "requested" | "deleted" | "notDeleted";
export type DeletionMarker = {
  owner: string;
  state: DeletionState;
  at: number;
};
/** An account this phone knows was deleted. */
export type DeletedAccount = {
  owner: string;
  at: number;
  /** This phone's training was removed with it. */
  localRemoved: boolean;
  /** Deleted here, or found deleted when this phone tried to sync. */
  source: "this-phone" | "sync";
};

export type DeletionOutcome =
  /** Confirmed; this phone's part is done. */
  | { kind: "deleted" }
  /** Checked: the account still exists, and nothing changed. */
  | { kind: "notDeleted" }
  /** The account service asks for a fresh sign-in first (Stage 3). */
  | { kind: "reauthenticate" }
  /** Couldn't be confirmed either way; nothing on this phone was removed. */
  | { kind: "uncertain" };

/** What deleting needs; `cloudDeletion` provides the account-service parts. */
export type DeletionDeps = {
  /** Calls `forge_delete_account` for the signed-in account. */
  deleteInCloud: () => Promise<{ error?: CloudError | null }>;
  /**
   * The signed-in account as the account service sees it now: its ID,
   * `missing` when the service says it no longer exists, or neither.
   */
  currentUser: () => Promise<{ id?: string; missing?: boolean }>;
  /** Ends this phone's sign-in; never throws. */
  signOut: () => Promise<void>;
  /** After this phone's data is removed (reminders, screens). */
  afterRemove?: () => void;
};
type CloudError = { message?: string; hint?: string; code?: string };

/** The account-service parts of `DeletionDeps`, from a Supabase client. */
export function cloudDeletion(
  client: Pick<SupabaseClient, "rpc" | "auth">,
): Pick<DeletionDeps, "deleteInCloud" | "currentUser"> {
  return {
    async deleteInCloud() {
      try {
        const { error } = await client.rpc("forge_delete_account");
        return { error };
      } catch (e) {
        return { error: { message: e instanceof Error ? e.message : "" } };
      }
    },
    async currentUser() {
      try {
        const { data, error } = await client.auth.getUser();
        if (data.user) return { id: data.user.id };
        const code = (error as { code?: unknown } | null)?.code;
        return code === "user_not_found" ? { missing: true } : {};
      } catch {
        return {};
      }
    },
  };
}

function read<T>(r: Repository, key: string, valid: (v: T) => boolean) {
  try {
    const raw = r.setting(key);
    const value = raw ? (JSON.parse(raw) as T) : undefined;
    return value && valid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The deletion this phone started and hasn't finished, if any. */
export function pendingDeletion(r: Repository): DeletionMarker | undefined {
  return read<DeletionMarker>(
    r,
    MARKER,
    (m) =>
      typeof m.owner === "string" &&
      !!m.owner &&
      ["requested", "deleted", "notDeleted"].includes(m.state) &&
      typeof m.at === "number",
  );
}

/** The account this phone knows was deleted, if any. */
export function deletedAccount(r: Repository): DeletedAccount | undefined {
  const record = read<DeletedAccount>(
    r,
    DELETED,
    (d) =>
      typeof d.owner === "string" &&
      !!d.owner &&
      typeof d.localRemoved === "boolean" &&
      typeof d.at === "number",
  );
  if (record) return record;
  // Before Stage 2, deleting the account kept this phone's training and set
  // this flag (never read until now). Only the owner's own Account & privacy
  // could set it, and the owner has never changed since: nothing reassigns
  // training, and removing it clears the flag with every other setting.
  try {
    const owner = dataOwner(r);
    if (owner && r.setting(LEGACY_FLAG) === "true")
      return { owner, at: 0, localRemoved: false, source: "this-phone" };
  } catch {
    // Unreadable settings: nothing is known about a deletion.
  }
  return undefined;
}
const LEGACY_FLAG = "cloudAccountDeleted";

const mark = (r: Repository, m: DeletionMarker) =>
  r.setSetting(
    MARKER,
    JSON.stringify({ owner: m.owner, state: m.state, at: m.at }),
  );

/** The account service refusing until the athlete signs in again (Stage 3). */
const needsFreshSignIn = (e: CloudError) =>
  e.hint === "reauthentication_needed" ||
  /sign in again to delete/i.test(e.message ?? "");

// One deletion, or one check of it, at a time. A second delete (a double
// tap) shares the one running; a delete that meets a check started at launch
// waits for it, and stops there if the check settled anything.
type Run = Promise<DeletionOutcome | undefined>;
let running: { kind: "delete" | "resume"; promise: Run } | undefined;
function start<T extends DeletionOutcome | undefined>(
  kind: "delete" | "resume",
  run: () => Promise<T>,
): Promise<T> {
  const promise: Promise<T> = run().finally(() => {
    if (running?.promise === promise) running = undefined;
  });
  running = { kind, promise };
  return promise;
}

/**
 * Deletes the signed-in account, which must own this phone's training.
 * Called again while a request is in flight, it returns that request.
 */
export async function deleteAccount(
  r: Repository,
  owner: string,
  deps: DeletionDeps,
): Promise<DeletionOutcome> {
  while (running) {
    if (running.kind === "delete")
      return running.promise as Promise<DeletionOutcome>;
    const settled = await running.promise.catch(() => undefined);
    if (settled) return settled;
  }
  return start("delete", async (): Promise<DeletionOutcome> => {
    if (dataOwner(r) !== owner)
      throw new Error(
        "Only the account that owns this phone's training can delete it here.",
      );
    mark(r, { owner, state: "requested", at: Date.now() });
    const { error } = await deps.deleteInCloud();
    if (!error) return finish(r, owner, deps, "this-phone");
    if (needsFreshSignIn(error)) {
      r.clearSetting(MARKER);
      return { kind: "reauthenticate" };
    }
    return check(r, owner, deps);
  });
}

/**
 * Settles an earlier request: finishes a confirmed deletion (no connection
 * needed), and checks an unconfirmed one only while `signedIn` is the same
 * account. Anything else is left exactly as it is.
 */
export function resumeDeletion(
  r: Repository,
  signedIn: string | undefined,
  deps: DeletionDeps,
): Promise<DeletionOutcome | undefined> {
  if (running) return running.promise;
  return start("resume", async () => {
    const marker = pendingDeletion(r);
    if (!marker) return undefined;
    if (marker.state === "deleted")
      return finish(r, marker.owner, deps, "this-phone");
    if (marker.state === "requested" && signedIn === marker.owner)
      return check(r, marker.owner, deps);
    return undefined;
  });
}

/** Asks the account service whether the account still exists. */
async function check(
  r: Repository,
  owner: string,
  deps: DeletionDeps,
): Promise<DeletionOutcome> {
  const user = await deps.currentUser();
  if (user.missing) return finish(r, owner, deps, "this-phone");
  if (user.id === owner) {
    mark(r, { owner, state: "notDeleted", at: Date.now() });
    return { kind: "notDeleted" };
  }
  // Offline, or another account's sign-in: nothing to go on.
  return { kind: "uncertain" };
}

/**
 * This phone's part of a confirmed deletion: the useless sign-in ends, and
 * the training is removed only while it still belongs to the deleted
 * account. Safe to repeat after an interruption.
 */
async function finish(
  r: Repository,
  owner: string,
  deps: DeletionDeps,
  source: DeletedAccount["source"],
): Promise<DeletionOutcome> {
  const previous = pendingDeletion(r);
  mark(r, { owner, state: "deleted", at: previous?.at ?? Date.now() });
  await deps.signOut().catch(() => {});
  const removed = dataOwner(r) === owner;
  // Clearing the data clears every setting, the marker included.
  if (removed) r.clearData();
  else r.clearSetting(MARKER);
  const record: DeletedAccount = {
    owner,
    at: Date.now(),
    localRemoved: removed,
    source,
  };
  r.setSetting(DELETED, JSON.stringify(record));
  if (removed) deps.afterRemove?.();
  return { kind: "deleted" };
}

/** "Keep my account": a checked request that didn't delete anything. */
export function dismissDeletion(r: Repository, owner: string) {
  const marker = pendingDeletion(r);
  if (marker?.owner === owner && marker.state === "notDeleted")
    r.clearSetting(MARKER);
}

/**
 * Another device deleted the account, found out when this phone tried to
 * upload. Nothing is removed: the athlete is told to export first.
 */
export function noteAccountGone(r: Repository, owner: string) {
  if (dataOwner(r) !== owner || deletedAccount(r)?.owner === owner) return;
  const record: DeletedAccount = {
    owner,
    at: Date.now(),
    localRemoved: false,
    source: "sync",
  };
  r.setSetting(DELETED, JSON.stringify(record));
}

/** The notice for a removed phone has been seen: someone signed in. */
export function acknowledgeDeletedAccount(r: Repository) {
  if (deletedAccount(r)?.localRemoved) r.clearSetting(DELETED);
}
