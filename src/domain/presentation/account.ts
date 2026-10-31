// Account & privacy (Phase 7.5G.3): plain words for the account screen.
// Presentation only: sync, conflicts and records are unchanged.

import { canonical } from "../../cloud/compare";
import { stopReason, type SyncStop } from "../../cloud/errors";
import type { SyncResult } from "../../cloud/sync";
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
};

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * What a sync conflict is about, from the preserved cloud record, without
 * internal identifiers: "Workout · Push day", "Goal · Cut to 80",
 * "Your profile". Unreadable records are "A synced record".
 */
export function conflictTitle(remote: string) {
  let row: { kind?: unknown; payload?: unknown };
  try {
    row = JSON.parse(remote) as typeof row;
  } catch {
    return "A synced record";
  }
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
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

// Phase 7.8B: what a sync did, in plain words. Nothing is called "backed up"
// or "safe" beyond what the sync itself confirmed.

const STOP_LEAD: Record<SyncStop, string> = {
  offline: "Forge couldn't reach the cloud, so sync stopped.",
  unavailable: "Forge's cloud isn't answering right now, so sync stopped.",
  auth: "Forge couldn't confirm your sign-in, so sync stopped.",
};
const STOP_NEXT: Record<SyncStop, string> = {
  offline: "Check your connection and try again.",
  unavailable: "Try again in a few minutes.",
  auth: "Sign in again, then sync.",
};
const are = (n: number) => (n === 1 ? "is" : "are");

/** The result of "Synchronize now", for the account screen. */
export function syncSummary(s: SyncResult) {
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
  if (reason)
    return `${STOP_LEAD[reason]} Nothing was lost. ${STOP_NEXT[reason]}`;
  return e instanceof Error && e.message
    ? e.message
    : "Sync didn't finish. Nothing was lost. Try again.";
}

export type RestoreOutcome =
  { kind: "done" } | { kind: "failed" | "partial"; text: string };

/** Restore Your Training (Phase 7.7C P1) after its single sync. */
export function restoreOutcome(s: SyncResult): RestoreOutcome {
  if (s.stopped && !s.downloaded)
    return {
      kind: "failed",
      text:
        s.stopped === "auth"
          ? "Forge couldn't confirm your sign-in, so nothing was restored and nothing on this phone changed. Sign in again, then try again."
          : "Forge couldn't restore your training: nothing on this phone changed. Check your connection and try again.",
    };
  const missing = s.failed + s.held.update;
  if (!s.stopped && !missing) return { kind: "done" };
  const later =
    "Try again, or continue and synchronize later in Account & privacy.";
  if (s.stopped)
    return {
      kind: "partial",
      text: `Restored ${plural(s.downloaded, "record")}, but the restore stopped before it finished. ${later}`,
    };
  if (!s.failed)
    return {
      kind: "partial",
      text: `Restored ${plural(s.downloaded, "record")}. ${plural(s.held.update, "record")} ${s.held.update === 1 ? "needs" : "need"} a newer version of Forge: update Forge, then synchronize in Account & privacy.`,
    };
  return {
    kind: "partial",
    text: `Restored ${plural(s.downloaded, "record")}, but ${plural(missing, "record")} couldn't be restored.${
      s.held.update
        ? ` ${s.held.update.toLocaleString()} of them ${s.held.update === 1 ? "needs" : "need"} a newer version of Forge.`
        : ""
    } ${later}`,
  };
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
   * The cloud version uses exercises (or a kind of record) this version of
   * Forge doesn't know: both choices wait for an update, so the newer
   * record is neither replaced nor half-applied.
   */
  update: boolean;
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
const KNOWN_KINDS = ["profile", "exercise", "workout", "template", "journal"];

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

/** Whether a cloud version needs exercises or a record kind this Forge lacks. */
function needsUpdate(
  kind: string,
  payload: unknown,
  knows: (exerciseId: string) => boolean,
) {
  if (!kind) return false;
  if (!KNOWN_KINDS.includes(kind)) return true;
  if (kind !== "workout" && kind !== "template") return false;
  return list(obj(payload).exercises).some((e) => {
    const exerciseId = obj(e).exerciseId;
    return typeof exerciseId === "string" && !knows(exerciseId);
  });
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
): ConflictView {
  const title = conflictTitle(saved.remote);
  const row = obj(parse(saved.remote));
  const kind = typeof row.kind === "string" ? row.kind : "";
  const local = parse(waiting?.payload ?? saved.local);
  const localDeleted = waiting ? !!waiting.deleted : canonical(local) === "{}";
  const cloudDeleted = row.deleted === true;
  const update = !cloudDeleted && needsUpdate(kind, row.payload, knows);
  if (localDeleted || cloudDeleted)
    return {
      title,
      phone: localDeleted
        ? ["Deleted on this phone"]
        : summary(kind, local, now),
      cloud: cloudDeleted
        ? ["Deleted on another device"]
        : summary(kind, row.payload, now),
      differs: [],
      update,
    };
  const differs = differences(kind, obj(local), obj(row.payload));
  const lines =
    kind === "profile"
      ? profileLines(obj(local), obj(row.payload))
      : {
          phone: summary(kind, local, now),
          cloud: summary(kind, row.payload, now),
        };
  return {
    title,
    ...lines,
    differs: differs.length ? differs : ["Other details"],
    update,
  };
}
