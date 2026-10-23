import type { Repository } from "./repository";
import { backupReminder, backupStatus } from "../domain/backup";

// Backup bookkeeping in device settings. Settings are not part of backups or
// sync, and deleting local data clears them with everything else.

const DAY = 86_400_000;

function time(r: Repository, key: string) {
  const n = Number(r.setting(key));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function backupState(r: Repository, now = Date.now()) {
  return backupStatus({
    lastBackupAt: time(r, "lastBackupAt"),
    lastSharedAt: time(r, "lastSharedAt"),
    snoozedUntil: time(r, "backupSnoozedUntil"),
    finishedAt: r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => w.finishedAt ?? w.startedAt),
    now,
  });
}

/**
 * Records a confirmed backup (a file Forge wrote and read back, or an
 * imported backup file) and clears any snoozed reminder. `at` is when the
 * backed-up data was read, so later workouts still count as unprotected.
 */
export function recordBackup(r: Repository, at = Date.now()) {
  r.transaction(() => {
    r.setSetting("lastBackupAt", String(at));
    r.setSetting("backupSnoozedUntil", "0");
  });
}

/**
 * Records that a backup was handed to the share sheet. The share sheet cannot
 * report whether it was saved, so this is never treated as a backup.
 */
export function recordShare(r: Repository, at = Date.now()) {
  r.setSetting("lastSharedAt", String(at));
}

/** "Not now": quiets the after-workout backup prompt for a few days. */
export function snoozeBackupReminder(r: Repository, now = Date.now()) {
  r.setSetting(
    "backupSnoozedUntil",
    String(now + backupReminder.snoozeDays * DAY),
  );
}

/**
 * A readable folder name. Android's Storage Access Framework names folders by
 * document ID ("primary:Documents", "primary:Backups/FORGE").
 */
export function folderLabel(name: string | undefined) {
  const label = String(name ?? "")
    .split(":")
    .pop()!
    .split("/")
    .filter(Boolean)
    .pop();
  return label || "the folder you chose";
}

/**
 * When a backup file was exported. After an import the local data matches
 * that file, so the lifter is protected up to that moment.
 */
export function backupExportedAt(text: string): number | undefined {
  try {
    const at = Number(
      (JSON.parse(text) as { exportedAt?: unknown }).exportedAt,
    );
    return Number.isFinite(at) && at > 0 ? at : undefined;
  } catch {
    return undefined;
  }
}
