import { localDate } from "./types";
import { plural } from "./training-display";

// Backup reminders. Forge stores training history only on this phone, so it
// tracks when the lifter last saved a backup and how much has been logged
// since, and asks again when enough is at risk.
//
// Only a confirmed backup counts: a file Forge wrote to a folder and read
// back, or a backup file that was imported. Handing a file to the share
// sheet is recorded separately as unconfirmed, because the share sheet never
// reports whether the file was actually saved.

const DAY = 86_400_000;
export const backupReminder = {
  /** Ask again once this many workouts are unprotected… */
  workouts: 3,
  /** …or this many days have passed with at least one new workout. */
  days: 7,
  /** "Not now", or an unconfirmed share, quiets the prompt for this long. */
  snoozeDays: 3,
} as const;

export type BackupStatus = {
  /** The last confirmed backup. */
  lastBackupAt?: number;
  /** Completed workouts finished after the last confirmed backup. */
  workoutsSince: number;
  /** Unprotected training is worth a reminder. */
  due: boolean;
  /** Due, not snoozed and not just shared: offer a backup after a workout. */
  prompt: boolean;
  /** The latest copy went to the share sheet and was never confirmed. */
  unconfirmed: boolean;
  /** One line for the backup row, e.g. "Last backup Oct 20 · 2 workouts since". */
  text: string;
};

function when(time: number, now: number) {
  const day = localDate(time);
  if (day === localDate(now)) return "today";
  if (day === localDate(now - DAY)) return "yesterday";
  const d = new Date(time);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" as const }),
  });
}

export function backupStatus({
  lastBackupAt,
  lastSharedAt,
  snoozedUntil,
  finishedAt,
  now = Date.now(),
}: {
  /** The last confirmed backup. */
  lastBackupAt?: number;
  /** The last time a backup was handed to the share sheet. */
  lastSharedAt?: number;
  snoozedUntil?: number;
  /** Finish times of completed workouts. */
  finishedAt: number[];
  now?: number;
}): BackupStatus {
  const workoutsSince = finishedAt.filter(
    (t) => lastBackupAt === undefined || t > lastBackupAt,
  ).length;
  const days =
    lastBackupAt === undefined ? Infinity : (now - lastBackupAt) / DAY;
  const due =
    workoutsSince > 0 &&
    (lastBackupAt === undefined ||
      workoutsSince >= backupReminder.workouts ||
      days >= backupReminder.days);
  const unconfirmed =
    lastSharedAt !== undefined &&
    (lastBackupAt === undefined || lastSharedAt > lastBackupAt);
  const quiet =
    (snoozedUntil !== undefined && snoozedUntil > now) ||
    (unconfirmed && now - lastSharedAt! < backupReminder.snoozeDays * DAY);
  const text = unconfirmed
    ? `Shared ${when(lastSharedAt!, now)} · not confirmed saved${
        lastBackupAt === undefined
          ? ""
          : ` · last backup ${when(lastBackupAt, now)}`
      }`
    : lastBackupAt === undefined
      ? workoutsSince
        ? `Never backed up · ${plural(workoutsSince, "workout")} on this phone`
        : "Not backed up yet"
      : `Last backup ${when(lastBackupAt, now)}${
          workoutsSince ? ` · ${plural(workoutsSince, "workout")} since` : ""
        }`;
  return {
    lastBackupAt,
    workoutsSince,
    due,
    prompt: due && !quiet,
    unconfirmed,
    text,
  };
}
