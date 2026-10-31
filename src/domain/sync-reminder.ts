import { localDate } from "./types";
import { plural } from "./training-display";

// A gentle reminder to synchronize (Phase 7.8C). Only ever shown when
// changes on this phone aren't in the cloud, and only after some training
// or time since the last complete sync. It never notifies, never syncs and
// never claims anything is backed up; "Not now" quiets it for a few days.

const DAY = 86_400_000;
export const syncReminderRule = {
  /** Remind once the last complete sync is this many days old… */
  days: 3,
  /** …or once this many workouts have been finished since it. */
  workouts: 3,
  /** "Not now" quiets the reminder for this long. */
  snoozeDays: 3,
} as const;

/** Calendar days between two times, in words: "today", "2 days ago". */
function ago(time: number, now: number) {
  const noon = (t: number) => Date.parse(`${localDate(t)}T12:00:00`);
  const days = Math.round((noon(now) - noon(time)) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The reminder's text, or undefined when none is due. Never synced: after
 * the first finished workout. Synced before this phone kept a record of its
 * last complete sync (`syncedBefore`): the waiting changes, without a date.
 * Otherwise once the last complete sync is `days` old, or `workouts`
 * workouts have been finished since it.
 */
export function syncReminder({
  pending,
  completeAt,
  syncedBefore = false,
  finishedAt,
  snoozedUntil,
  now = Date.now(),
}: {
  /** Changes waiting to upload. */
  pending: number;
  /** The last complete sync, if any. */
  completeAt?: number;
  /** This phone has synchronized before, when or how completely unknown. */
  syncedBefore?: boolean;
  /** Finish times of completed workouts. */
  finishedAt: number[];
  snoozedUntil?: number;
  now?: number;
}): string | undefined {
  if (pending <= 0) return undefined;
  if (snoozedUntil !== undefined && snoozedUntil > now) return undefined;
  const waiting = `${plural(pending, "change")} ${pending === 1 ? "isn't" : "aren't"} in the cloud yet`;
  const workouts = finishedAt.filter(
    (t) => completeAt === undefined || t > completeAt,
  ).length;
  if (completeAt === undefined) {
    if (!workouts) return undefined;
    return syncedBefore
      ? `${waiting}.`
      : "Your training on this phone isn't in the cloud yet.";
  }
  if (
    now - completeAt < syncReminderRule.days * DAY &&
    workouts < syncReminderRule.workouts
  )
    return undefined;
  return `${waiting} · last complete sync ${ago(completeAt, now)}`;
}
