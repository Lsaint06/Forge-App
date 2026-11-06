import type { Repository } from "./repository";

// Which account this phone's data belongs to (Phase 7.7B). The marker is the
// existing `cloudOwner` setting: the first synchronization has always written
// it, and synchronization refuses a different account. Nothing here uploads,
// downloads, merges or deletes anything.

export const OWNER = "cloudOwner";

/** The account this phone's data belongs to, if any. */
export const dataOwner = (r: Repository) => r.setting(OWNER) || undefined;

/**
 * Whether this phone holds the athlete's own data: a finished setup, any
 * workout, template, journal entry (goals, measurements, food, recovery …),
 * custom exercise, or anything waiting to be synchronized (such as a
 * deletion). The bundled catalogue and default profile don't count.
 */
export function hasLocalData(r: Repository) {
  if (r.profile().onboarded) return true;
  // Existence checks only: cheap enough to run on every data change.
  const any = (sql: string) => r.db.all<{ x: number }>(sql)[0]?.x === 1;
  return (
    any("SELECT EXISTS(SELECT 1 FROM workouts) AS x") ||
    any("SELECT EXISTS(SELECT 1 FROM templates) AS x") ||
    any("SELECT EXISTS(SELECT 1 FROM journal) AS x") ||
    any("SELECT EXISTS(SELECT 1 FROM exercises WHERE custom=1) AS x") ||
    any("SELECT EXISTS(SELECT 1 FROM outbox) AS x")
  );
}

/**
 * Links this phone's data to the signed-in account, as the first
 * synchronization does. Only after the athlete confirms and the account is
 * known to hold no cloud records (`linkChecked` in `src/cloud/link.ts`);
 * nothing is uploaded until they choose to synchronize.
 */
export function linkToAccount(r: Repository, userId: string) {
  const owner = dataOwner(r);
  if (owner && owner !== userId)
    throw new Error("This phone's training belongs to another account.");
  r.setSetting(OWNER, userId);
}

/**
 * Sync bookkeeping: records this phone has synchronized with an account, or
 * conflicts waiting for a choice, even when no records are left.
 */
export function hasSyncHistory(r: Repository) {
  const any = (sql: string) => r.db.all<{ x: number }>(sql)[0]?.x === 1;
  return (
    any("SELECT EXISTS(SELECT 1 FROM sync_meta) AS x") ||
    any("SELECT EXISTS(SELECT 1 FROM conflicts) AS x")
  );
}

/**
 * Claims an empty phone for the signed-in account as setup begins, so what
 * the athlete enters during setup is theirs from the start (otherwise their
 * own new profile would look like someone else's unlinked data). It also
 * replaces a claim with nothing behind it: an account that signed in here,
 * entered nothing and left (Phase 7.7C, P4). Never takes a phone holding any
 * data, anything waiting to sync, or sync history: that is protected.
 */
export function claimIfEmpty(r: Repository, userId: string) {
  if (dataOwner(r) === userId || hasLocalData(r) || hasSyncHistory(r))
    return false;
  r.setSetting(OWNER, userId);
  return true;
}

// Who owns this phone's training, for the conflict screen's words only
// (Phase 7.7C, P2). Never authorization: ownership is the account ID in
// `cloudOwner` alone. The email is stored already masked.

export const OWNER_HINT = "cloudOwnerHint";
export type OwnerHint = { email?: string; methods?: string[] };

/** "lstamand@gmail.com" → "l•••@gmail.com"; never the whole address. */
export function maskEmail(email: string | undefined) {
  if (!email) return undefined;
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return undefined;
  return `${email[0]}•••${email.slice(at)}`;
}

/**
 * Records the owner's masked email and sign-in methods while that owner is
 * signed in. Returns whether anything changed.
 */
export function recordOwnerHint(
  r: Repository,
  user: { id: string; email?: string; methods?: string[] },
) {
  if (dataOwner(r) !== user.id) return false;
  const hint = JSON.stringify({
    owner: user.id,
    email: maskEmail(user.email),
    methods: user.methods?.length ? user.methods : undefined,
  });
  if (r.setting(OWNER_HINT) === hint) return false;
  r.setSetting(OWNER_HINT, hint);
  return true;
}

/** The owner's hint, only if it describes the current owner. */
export function ownerHint(r: Repository): OwnerHint | undefined {
  const raw = r.setting(OWNER_HINT);
  if (!raw) return undefined;
  try {
    const h = JSON.parse(raw) as {
      owner?: unknown;
      email?: unknown;
      methods?: unknown;
    };
    if (typeof h.owner !== "string" || h.owner !== dataOwner(r))
      return undefined;
    const email =
      typeof h.email === "string" && h.email.includes("•••")
        ? h.email
        : undefined;
    const methods = Array.isArray(h.methods)
      ? h.methods.filter((m): m is string => typeof m === "string")
      : [];
    return email || methods.length
      ? { email, methods: methods.length ? methods : undefined }
      : undefined;
  } catch {
    return undefined;
  }
}

/** What deleting this phone's data would remove, counted (never shown). */
export function localSummary(r: Repository) {
  const count = (sql: string) => r.db.all<{ n: number }>(sql)[0]?.n ?? 0;
  return {
    workouts: count("SELECT COUNT(*) AS n FROM workouts"),
    templates: count("SELECT COUNT(*) AS n FROM templates"),
    journal: count("SELECT COUNT(*) AS n FROM journal"),
    customExercises: count(
      "SELECT COUNT(*) AS n FROM exercises WHERE custom=1",
    ),
    /** Changes never synchronized: they exist only on this phone. */
    unsynced: count("SELECT COUNT(*) AS n FROM outbox"),
  };
}

/**
 * Replaces this phone's data from a backup the signed-in athlete chose in
 * Account & privacy, keeping it with their account. `importBackup` clears
 * every setting, including the owner; before accounts were required the next
 * synchronization simply claimed it again. Keeping it here gives the same
 * result without sending the athlete back to the link check.
 */
export function importBackupKeepingOwner(r: Repository, text: string) {
  const owner = dataOwner(r);
  r.transaction(() => {
    r.importBackup(text);
    if (owner) r.setSetting(OWNER, owner);
  });
}
