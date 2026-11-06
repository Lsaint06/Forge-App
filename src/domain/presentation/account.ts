// Account & privacy (Phase 7.5G.3): plain words for the account screen.
// Presentation only: sync, conflicts and records are unchanged.

import { canonical } from "../../cloud/compare";
import { stopReason, type SyncStop } from "../../cloud/errors";
import type { SyncResult } from "../../cloud/sync";
import type { SyncStatus } from "../../cloud/sync-state";
import { cloudCopyNeedsUpdate, namesUnknownExercises } from "../format";
import { localDate } from "../types";
import { dayLabel, plural, templateLine } from "../training-display";

const JOURNAL: Record<string, string> = {
  goal: "Goal",
  measurement: "Measurement",
  recovery: "Recovery check-in",
  nutrition: "Food log entry",
  food: "Saved food",
  hydration: "Water log entry",
  schedule: "Scheduled workout",
  program: "Program",
  favorite: "Favorite exercise",
};
/** The exercise a favourite record names, from its id (Phase 7.8D). */
const favoriteOf = (recordId: unknown) =>
  typeof recordId === "string" && recordId.startsWith("favorite:")
    ? recordId.slice("favorite:".length)
    : undefined;

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * What a sync conflict is about, from the preserved cloud record, without
 * internal identifiers: "Workout · Push day", "Goal · Cut to 80",
 * "Your profile", "Favorite exercise · Back Squat". Unreadable records are
 * "A synced record".
 */
export function conflictTitle(
  remote: string,
  exerciseName?: (exerciseId: string) => string | undefined,
) {
  let row: { id?: unknown; kind?: unknown; payload?: unknown };
  try {
    row = JSON.parse(remote) as typeof row;
  } catch {
    return "A synced record";
  }
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  // Known by its id even when the cloud copy is a deletion.
  const favorite = row.kind === "journal" ? favoriteOf(row.id) : undefined;
  if (favorite !== undefined) {
    const name = text(exerciseName?.(favorite));
    return name ? `Favorite exercise · ${clip(name)}` : "Favorite exercise";
  }
  switch (row.kind) {
    case "profile":
      return "Your profile";
    case "workout": {
      const name = text((p.workout as { name?: unknown } | undefined)?.name);
      return name ? `Workout · ${name}` : "Workout";
    }
    case "template":
      return text(p.name) ? `Template · ${text(p.name)}` : "Template";
    case "exercise":
      return text(p.name)
        ? `Custom exercise · ${text(p.name)}`
        : "Custom exercise";
    case "journal": {
      const kind =
        typeof p.kind === "string"
          ? (JOURNAL[p.kind] ?? "Journal entry")
          : "Journal entry";
      const name = text(data.name);
      return name ? `${kind} · ${name}` : kind;
    }
    default:
      return "A synced record";
  }
}

/** "3 changes waiting to upload" / "No local changes waiting to upload". */
export function pendingText(pending: number) {
  return pending
    ? `${pending.toLocaleString()} ${pending === 1 ? "change" : "changes"} waiting to upload`
    : "No local changes waiting to upload";
}

// Phase 7.8E (M6): before anything deletes this phone's data, say how much
// of it was never synchronized, because nothing can bring that back.

/** The unsynchronized changes that deleting this phone's data would lose. */
export function unsyncedLossText(unsynced: number) {
  if (!unsynced) return undefined;
  return `${plural(unsynced, "change")} ${unsynced === 1 ? "was" : "were"} never synchronized: ${unsynced === 1 ? "it exists" : "they exist"} only on this phone and would be lost for good.`;
}

/** The same, short enough for the delete row itself. */
export function unsyncedRowText(unsynced: number) {
  if (!unsynced) return undefined;
  return `${plural(unsynced, "change")} ${unsynced === 1 ? "hasn't" : "haven't"} been synchronized and would be lost.`;
}

/**
 * The confirmation for "Delete all local data". `linked`: this phone's data
 * belongs to an account, which keeps whatever was synchronized.
 */
export function deleteLocalDataText(unsynced: number, linked: boolean) {
  return [
    "Every workout, template, preference and journal entry on this phone is deleted, and FORGE starts again from setup. This can't be undone, so export a backup first.",
    unsyncedLossText(unsynced),
    linked
      ? "Your cloud account and cloud records are not deleted; a later sync can restore what was synchronized."
      : "This training isn't linked to a Forge account, so only a backup file can restore it.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The sentence that opens a whole-phone replacement or deletion while a
 * workout is in progress (Phase 8.3C-3), so the lifter knows the session
 * goes too. Empty when nothing is in progress.
 */
export function activeWorkoutWarning(
  active: { name: string; done: number } | undefined,
  effect: "replaced" | "deleted",
) {
  if (!active) return "";
  const done = active.done
    ? `${active.done} ${active.done === 1 ? "set" : "sets"} done`
    : "no sets done yet";
  return `Your workout in progress, ${active.name} (${done}), is ${effect} too.`;
}

// Phase 7.8E, Stage 2: deleting the account, in plain words. What a phone
// knows comes from its deletion marker and record (src/auth/account-deletion).

type DeletionFacts = {
  marker?: { state: "requested" | "deleted" | "notDeleted" };
  deleted?: { localRemoved: boolean };
};

export const DELETED_HERE_TEXT =
  "Your Forge account was deleted, with its cloud training and the training on this phone. Signing up again with the same email creates a new, empty account; a backup you exported can be imported into it from Account & privacy.";
export const DELETION_UNCONFIRMED_SIGNED_OUT =
  "Forge couldn't confirm whether your account was deleted, so nothing on this phone was removed. Sign in to that account to finish checking. If it no longer exists, its training stays locked on this phone, and signing in with another account lets you remove it.";
export const OWNER_DELETED_SIGNED_OUT =
  "The Forge account that used this phone was deleted. Its training is still here, locked to that account: no other account can open it. Sign in with any account to remove it.";
export const DELETION_UNCONFIRMED_HERE =
  "Forge couldn't confirm your account deletion, so nothing on this phone was removed yet. Open Delete Forge account to check again. If you've added training since, export a backup first: a confirmed deletion removes this phone's training.";
export const DELETION_DIDNT_HAPPEN =
  "Your account deletion didn't go through: your account, its cloud training and this phone's training are unchanged.";
export const ACCOUNT_GONE_HERE =
  "This Forge account no longer exists, so this phone's training can't be synchronized again. It stays here until you remove it: export a backup now to keep a copy.";
export const OWNER_DELETED_TEXT =
  "The account that owned this training was deleted, so no account can open it in Forge again. You can remove it from this phone.";
export const OWNER_DELETION_UNCONFIRMED =
  "That account's deletion was requested on this phone but never confirmed. Its training stays locked to it: no other account can open it.";

/** For Welcome, signed out. */
export function welcomeDeletionText({ marker, deleted }: DeletionFacts) {
  if (deleted?.localRemoved) return DELETED_HERE_TEXT;
  if (deleted) return OWNER_DELETED_SIGNED_OUT;
  if (marker?.state === "requested") return DELETION_UNCONFIRMED_SIGNED_OUT;
  return undefined;
}

/** For Account & privacy, while the account that owns this phone is signed in. */
export function accountDeletionText({ marker, deleted }: DeletionFacts) {
  if (marker?.state === "requested") return DELETION_UNCONFIRMED_HERE;
  if (marker?.state === "notDeleted") return DELETION_DIDNT_HAPPEN;
  if (deleted && !deleted.localRemoved) return ACCOUNT_GONE_HERE;
  return undefined;
}

/** For the conflict screen, when another account is signed in. */
export function ownerDeletionText({ marker, deleted }: DeletionFacts) {
  if (deleted && !deleted.localRemoved) return OWNER_DELETED_TEXT;
  if (marker?.state === "requested") return OWNER_DELETION_UNCONFIRMED;
  return undefined;
}

// Phase 7.8B: what a sync did, in plain words. Nothing is called "backed up"
// or "safe" beyond what the sync itself confirmed.

const STOP_LEAD: Record<SyncStop, string> = {
  offline: "Forge couldn't reach the cloud, so sync stopped.",
  unavailable: "Forge's cloud isn't answering right now, so sync stopped.",
  auth: "Forge couldn't confirm your sign-in, so sync stopped.",
  deleted: "This Forge account no longer exists, so sync stopped.",
};
const STOP_NEXT: Record<SyncStop, string> = {
  offline: "Check your connection and try again.",
  unavailable: "Try again in a few minutes.",
  auth: "Sign in again, then sync.",
  deleted: "To keep this phone's training, export a backup now.",
};
/**
 * The account was deleted (Phase 7.8E): whatever this phone sent first went
 * with it, and nothing waiting here can ever be sent.
 */
export const ACCOUNT_GONE_SYNC_TEXT = `${STOP_LEAD.deleted} Nothing on this phone was removed, but it can't be synchronized again. ${STOP_NEXT.deleted}`;
const are = (n: number) => (n === 1 ? "is" : "are");

/** The result of "Synchronize now", for the account screen. */
export function syncSummary(s: SyncResult) {
  if (s.stopped === "deleted") return ACCOUNT_GONE_SYNC_TEXT;
  if (s.stopped)
    return [
      STOP_LEAD[s.stopped],
      s.uploaded
        ? `${plural(s.uploaded, "change")} ${s.uploaded === 1 ? "was" : "were"} uploaded first.`
        : "",
      s.pending
        ? `Nothing was lost: ${plural(s.pending, "change")} ${are(s.pending)} still waiting on this phone.`
        : "Nothing was lost.",
      STOP_NEXT[s.stopped],
    ]
      .filter(Boolean)
      .join(" ");
  const held = s.held.update + s.held.active;
  const clean = !s.pending && !s.conflicts && !s.rejected && !s.failed && !held;
  const moved =
    s.uploaded || s.downloaded
      ? `${s.uploaded.toLocaleString()} uploaded · ${s.downloaded.toLocaleString()} downloaded`
      : "";
  const waiting = s.pending - s.rejected - s.conflicts;
  return [
    clean
      ? moved
        ? `Sync complete: ${moved}.`
        : "Sync complete. Nothing new to upload or download."
      : moved
        ? `${moved}.`
        : "Nothing new uploaded or downloaded.",
    s.matched
      ? `${plural(s.matched, "record")} already matched the cloud.`
      : "",
    s.rejected
      ? `${plural(s.rejected, "change")} couldn't be uploaded. ${s.rejected === 1 ? "It stays" : "They stay"} on this phone, and the next sync tries again.`
      : "",
    s.held.update
      ? `${plural(s.held.update, "record")} from a newer version of Forge will appear after you update Forge.`
      : "",
    s.held.active
      ? `${s.held.active === 1 ? "A workout" : `${s.held.active} workouts`} in progress on another device will appear after you finish or discard the workout in progress here.`
      : "",
    s.failed
      ? `${plural(s.failed, "record")} from the cloud couldn't be read on this phone. The cloud copy is kept as it is.`
      : "",
    s.conflicts
      ? `${s.conflicts === 1 ? "1 record needs" : `${s.conflicts.toLocaleString()} records need`} your choice below.`
      : "",
    waiting > 0
      ? `${plural(waiting, "change")} ${are(waiting)} still waiting to upload. Sync again to send ${waiting === 1 ? "it" : "them"}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** A sync that couldn't start or ended abruptly (it threw). */
export function syncFailureText(e: unknown) {
  const reason = stopReason(e);
  if (reason === "deleted") return ACCOUNT_GONE_SYNC_TEXT;
  if (reason)
    return `${STOP_LEAD[reason]} Nothing was lost. ${STOP_NEXT[reason]}`;
  return e instanceof Error && e.message
    ? e.message
    : "Sync didn't finish. Nothing was lost. Try again.";
}

export type RestoreOutcome =
  { kind: "done" } | { kind: "failed" | "partial"; text: string };

/**
 * Restore Your Training (Phase 7.7C P1) after its single sync. Complete
 * only when nothing was held back or unreadable (Phase 7.8C): a workout in
 * progress elsewhere that will arrive later still makes it partial.
 */
export function restoreOutcome(s: SyncResult): RestoreOutcome {
  if (s.stopped === "deleted")
    return {
      kind: "failed",
      text: s.downloaded
        ? "This Forge account no longer exists, so the restore stopped and this phone's training can't be synchronized again."
        : "This Forge account no longer exists, so there's nothing to restore. Nothing on this phone changed.",
    };
  if (s.stopped && !s.downloaded)
    return {
      kind: "failed",
      text:
        s.stopped === "auth"
          ? "Forge couldn't confirm your sign-in, so nothing was restored and nothing on this phone changed. Sign in again, then try again."
          : "Forge couldn't restore your training: nothing on this phone changed. Check your connection and try again.",
    };
  const { update, active } = s.held;
  const missing = s.failed + update + active;
  if (!s.stopped && !missing) return { kind: "done" };
  const later =
    "Try again, or continue and synchronize later in Account & privacy.";
  const restored = `Restored ${plural(s.downloaded, "record")}`;
  if (s.stopped)
    return {
      kind: "partial",
      text: `${restored}, but the restore stopped before it finished. ${later}`,
    };
  const ofThem = (n: number) => `${n.toLocaleString()} of them`;
  if (!s.failed)
    return {
      kind: "partial",
      text: [
        `${restored}.`,
        update
          ? `${plural(update, "record")} ${update === 1 ? "needs" : "need"} a newer version of Forge: update Forge, then synchronize in Account & privacy.`
          : "",
        active
          ? `${active === 1 ? "A workout" : `${active.toLocaleString()} workouts`} in progress on another device will arrive after the one in progress here is finished.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  return {
    kind: "partial",
    text: [
      `${restored}, but ${plural(missing, "record")} couldn't be restored.`,
      update
        ? `${ofThem(update)} ${update === 1 ? "needs" : "need"} a newer version of Forge.`
        : "",
      active
        ? `${ofThem(active)} ${active === 1 ? "is a workout" : "are workouts"} in progress on another device.`
        : "",
      later,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

// Phase 7.8C: the last complete sync, said plainly. "Complete" follows
// `syncOutcome`: the sync ran to the end and nothing was left over.

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Today, 2:05 PM"; before any complete sync, "Not yet", or "Not recorded
 * yet" on a phone that synchronized before Phase 7.8C kept a record.
 */
export function lastSyncText(
  status: SyncStatus | undefined,
  syncedBefore = false,
  now = Date.now(),
) {
  if (status?.completeAt) return sentence(moment(status.completeAt, now));
  return syncedBefore ? "Not recorded yet" : "Not yet";
}

/** When the latest sync didn't complete, what happened to it. */
export function lastSyncNote(status: SyncStatus | undefined, now = Date.now()) {
  if (!status || status.outcome === "complete") return undefined;
  const when = moment(status.at, now);
  return status.outcome === "stopped"
    ? `Your last sync (${when}) stopped before it finished.`
    : `Your last sync (${when}) finished, but some records still need attention.`;
}

// Phase 7.8B, M4: what differs in a conflict, so the choice isn't blind.
// Both versions are described the same way; nothing internal is shown.

export type ConflictView = {
  /** "Workout · Push day", as before. */
  title: string;
  /** This phone's version in a few lines. */
  phone: string[];
  /** The cloud's version in a few lines. */
  cloud: string[];
  /** What differs, in words: "Sets", "Display name". */
  differs: string[];
  /**
   * The cloud version uses exercises (or a kind of record, a format or
   * fields) this version of Forge doesn't know: both choices wait for an
   * update, so the newer record is neither replaced nor half-applied.
   */
  update: boolean;
  /** Why both choices wait, when they do. */
  updateText: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};
const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

/** "today, 2:05 PM", "yesterday, 9:10 AM", "Oct 20, 6:40 PM". */
function moment(time: number, now: number) {
  const clock = new Date(time).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const day = localDate(time);
  if (day === localDate(now)) return `today, ${clock}`;
  if (day === localDate(now - 86_400_000)) return `yesterday, ${clock}`;
  const d = new Date(time);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" as const }),
  });
  return `${date}, ${clock}`;
}
const changed = (time: unknown, now: number) =>
  typeof time === "number" && Number.isFinite(time) && time > 0
    ? [`Changed ${moment(time, now)}`]
    : [];

const PROFILE_FIELDS: Record<
  string,
  { label: string; value?: (v: unknown) => string }
> = {
  name: { label: "Display name", value: (v) => clip(String(v ?? "")) },
  units: { label: "Units", value: (v) => String(v ?? "") },
  theme: {
    label: "Appearance",
    value: (v) =>
      ({ dark: "Dark", light: "Light", system: "Match system" })[String(v)] ??
      String(v ?? ""),
  },
  notifications: { label: "Reminders", value: (v) => (v ? "On" : "Off") },
  rest: { label: "Default rest", value: (v) => `${String(v)} s` },
  frequency: {
    label: "Weekly workout goal",
    value: (v) => `${String(v)} a week`,
  },
  duration: { label: "Workout length", value: (v) => `${String(v)} min` },
  calories: {
    label: "Calorie goal",
    value: (v) => `${Number(v).toLocaleString()} kcal`,
  },
  protein: { label: "Protein goal", value: (v) => `${String(v)} g` },
  carbs: { label: "Carbohydrate goal", value: (v) => `${String(v)} g` },
  fat: { label: "Fat goal", value: (v) => `${String(v)} g` },
  repMin: { label: "Minimum target reps", value: (v) => String(v) },
  repMax: { label: "Maximum target reps", value: (v) => String(v) },
  experience: { label: "Experience" },
  goal: { label: "Training goal" },
  restDay: { label: "Rest day" },
  height: { label: "Height" },
  weight: { label: "Starting weight" },
  bodyFat: { label: "Body fat" },
  equipment: { label: "Equipment" },
  muscles: { label: "Target muscle groups" },
  increment: { label: "Progression increment" },
  waterGoal: { label: "Water goal" },
  fluidUnit: { label: "Fluid unit" },
  onboarded: { label: "Setup" },
};
const EXERCISE_FIELDS: Record<string, string> = {
  name: "Name",
  muscle: "Main muscle",
  secondary: "Other muscles",
  equipment: "Equipment",
  instructions: "Instructions",
  category: "Tracking",
  tracking: "Tracking",
  unilateral: "One side at a time",
};
/** "restDay" → "Rest day"; internal links and versions are "Details". */
function fieldLabel(key: string) {
  if (/^forge|Ids?$|^v$/.test(key)) return "Details";
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
const differentKeys = (a: Obj, b: Obj, skip: string[] = []) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => !skip.includes(k) && canonical(a[k]) !== canonical(b[k]),
  );
const unique = (items: string[]) => [...new Set(items)];

/** A workout's exercises in order, and its sets per exercise, without ids. */
function workoutParts(p: Obj) {
  const rows = list(p.exercises)
    .map(obj)
    .sort((a, b) => Number(a.position) - Number(b.position));
  const order = new Map(rows.map((r, i) => [String(r.id), i]));
  const exercises = rows.map(
    ({ id: _id, workoutId: _w, position: _p, ...rest }) => {
      void _id;
      void _w;
      void _p;
      return rest;
    },
  );
  const sets = list(p.sets)
    .map(obj)
    .map(({ id: _id, exerciseRowId, ...rest }): Obj & { exercise: number } => {
      void _id;
      return { ...rest, exercise: order.get(String(exerciseRowId)) ?? -1 };
    })
    .sort(
      (a, b) =>
        a.exercise - b.exercise || Number(a.position) - Number(b.position),
    );
  return { exercises, sets };
}

function summary(kind: string, payload: unknown, now: number): string[] {
  const p = obj(payload);
  switch (kind) {
    case "workout": {
      const w = obj(p.workout);
      const sets = list(p.sets).map(obj);
      const done = sets.filter((s) => s.completed === true).length;
      return [
        `${plural(list(p.exercises).length, "exercise")} · ${plural(sets.length, "set")}${
          done < sets.length ? `, ${done.toLocaleString()} done` : ""
        }`,
        ...(w.status === "active" || w.status === "paused"
          ? ["In progress"]
          : []),
        ...changed(w.updatedAt, now),
      ];
    }
    case "template":
      return [
        templateLine(
          list(p.exercises).map((e) => ({ sets: Number(obj(e).sets) || 0 })),
        ),
        ...changed(p.updatedAt, now),
      ];
    case "journal":
      return [
        ...(typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
          ? [`Dated ${dayLabel(p.date)}`]
          : []),
        ...changed(p.updatedAt, now),
      ];
    case "exercise":
      return [
        ...(typeof p.name === "string" ? [clip(p.name)] : []),
        [p.muscle, p.equipment]
          .filter((x): x is string => typeof x === "string" && !!x)
          .join(" · "),
      ].filter(Boolean);
    default:
      return [];
  }
}

function differences(kind: string, local: Obj, cloud: Obj): string[] {
  switch (kind) {
    case "workout": {
      const a = obj(local.workout);
      const b = obj(cloud.workout);
      const pa = workoutParts(local);
      const pb = workoutParts(cloud);
      return [
        ...(a.name !== b.name ? ["Name"] : []),
        ...(a.startedAt !== b.startedAt || a.finishedAt !== b.finishedAt
          ? ["Date and time"]
          : []),
        ...(a.status !== b.status ? ["Finished or in progress"] : []),
        ...(a.notes !== b.notes ? ["Notes"] : []),
        ...(canonical(pa.exercises) !== canonical(pb.exercises)
          ? ["Exercises"]
          : []),
        ...(canonical(pa.sets) !== canonical(pb.sets) ? ["Sets"] : []),
      ];
    }
    case "template":
      return [
        ...(local.name !== cloud.name ? ["Name"] : []),
        ...(local.notes !== cloud.notes ? ["Notes"] : []),
        ...(canonical(local.exercises) !== canonical(cloud.exercises)
          ? ["Exercises"]
          : []),
      ];
    case "journal":
      return unique([
        ...(local.date !== cloud.date ? ["Date"] : []),
        ...differentKeys(obj(local.data), obj(cloud.data)).map(fieldLabel),
      ]);
    case "profile":
      return unique(
        differentKeys(local, cloud).map(
          (k) => PROFILE_FIELDS[k]?.label ?? fieldLabel(k),
        ),
      );
    case "exercise":
      return unique(
        differentKeys(local, cloud, ["id"]).map(
          (k) => EXERCISE_FIELDS[k] ?? fieldLabel(k),
        ),
      );
    default:
      return [];
  }
}

/** A profile's differing settings with their values, a few at most. */
function profileLines(local: Obj, cloud: Obj) {
  const shown = differentKeys(local, cloud)
    .filter((k) => PROFILE_FIELDS[k]?.value)
    .slice(0, 3);
  const line = (p: Obj) =>
    shown.map((k) => {
      const f = PROFILE_FIELDS[k]!;
      return `${f.label}: ${p[k] === undefined ? "not set" : f.value!(p[k])}`;
    });
  return { phone: line(local), cloud: line(cloud) };
}

const UPDATE_EXERCISES =
  "The cloud version uses exercises from a newer version of Forge. Update Forge on this phone to choose; both versions are kept until then.";
const UPDATE_NEWER =
  "The cloud version was saved by a newer version of Forge. Update Forge on this phone to choose; both versions are kept until then.";

/**
 * Why both choices must wait for an update, if they must: the same rule the
 * data layer enforces (Phase 7.8D).
 */
function updateReason(
  kind: string,
  payload: unknown,
  knows: (exerciseId: string) => boolean,
) {
  if (!cloudCopyNeedsUpdate(kind, payload, knows)) return "";
  return namesUnknownExercises(kind, payload, knows)
    ? UPDATE_EXERCISES
    : UPDATE_NEWER;
}

/**
 * Both versions of a saved conflict, side by side. "This phone" is the
 * change waiting to upload now (what Keep local version would send), or
 * the copy saved with the conflict when none is waiting.
 */
export function conflictView(
  saved: { local: string; remote: string },
  waiting: { payload: string; deleted: number | boolean } | undefined,
  knows: (exerciseId: string) => boolean,
  now = Date.now(),
  extra: {
    /** Names favourites by their exercise. */
    exerciseName?: (exerciseId: string) => string | undefined;
    /**
     * The profile's two choices (Phase 7.8D), which differ only in the
     * fields the athlete decides; everything else merged already.
     */
    profile?: { phone: Obj; cloud: Obj };
  } = {},
): ConflictView {
  const title = conflictTitle(saved.remote, extra.exerciseName);
  const row = obj(parse(saved.remote));
  const kind = typeof row.kind === "string" ? row.kind : "";
  const local = parse(waiting?.payload ?? saved.local);
  const localDeleted = waiting ? !!waiting.deleted : canonical(local) === "{}";
  const cloudDeleted = row.deleted === true;
  const updateText = cloudDeleted ? "" : updateReason(kind, row.payload, knows);
  const update = !!updateText;
  const favorite = kind === "journal" && favoriteOf(row.id) !== undefined;
  if (localDeleted || cloudDeleted)
    return {
      title,
      phone: localDeleted
        ? [
            favorite
              ? "Removed from favorites on this phone"
              : "Deleted on this phone",
          ]
        : favorite
          ? ["Favorite on this phone"]
          : summary(kind, local, now),
      cloud: cloudDeleted
        ? [
            favorite
              ? "Removed from favorites on another device"
              : "Deleted on another device",
          ]
        : favorite
          ? ["Favorite on another device"]
          : summary(kind, row.payload, now),
      differs: [],
      update,
      updateText,
    };
  const sides = kind === "profile" ? extra.profile : undefined;
  const differs = sides
    ? differences(kind, sides.phone, sides.cloud)
    : differences(kind, obj(local), obj(row.payload));
  const lines =
    kind === "profile"
      ? sides
        ? profileLines(sides.phone, sides.cloud)
        : profileLines(obj(local), obj(row.payload))
      : {
          phone: summary(kind, local, now),
          cloud: summary(kind, row.payload, now),
        };
  return {
    title,
    ...lines,
    differs: differs.length ? differs : ["Other details"],
    update,
    updateText,
  };
}

// Phase 7.8E, Stage 4: a workout kept going after the account service ended
// this phone's sign-in without the athlete asking.

/** Welcome, while the workout can be returned to. */
export const WORKOUT_CONTINUES_TEXT =
  "Your workout in progress is saved on this phone. Return to it to keep logging and finish it; sign in again afterwards to sync it.";
/** Welcome, once it's finished. */
export const WORKOUT_FINISHED_SIGNED_OUT_TEXT =
  "Your workout is saved on this phone. Sign in with the same account to keep training and to sync it.";
/** On the workout itself. */
export const WORKOUT_SIGNED_OUT_NOTE =
  "Signed out · Saved on this phone. Finish your workout, then sign in again to sync it.";
