import type { Repository } from "./repository";
import { hasSyncHistory } from "./ownership";
import { syncStatus } from "../cloud/sync-state";
import { syncReminder, syncReminderRule } from "../domain/sync-reminder";

// The sync reminder's bookkeeping (Phase 7.8C), in device settings like the
// backup reminder's: never synced or backed up, cleared with local data.

const SNOOZED = "syncReminderSnoozedUntil";
const DAY = 86_400_000;

/** The reminder for this phone's owner, if one is due. */
export function syncReminderFor(
  r: Repository,
  owner: string,
  now = Date.now(),
) {
  const snoozed = Number(r.setting(SNOOZED));
  return syncReminder({
    pending: r.outbox().length,
    completeAt: syncStatus(r, owner)?.completeAt,
    // Phones that synchronized before Phase 7.8C kept no record of when.
    syncedBefore: hasSyncHistory(r),
    finishedAt: r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => w.finishedAt ?? w.startedAt),
    snoozedUntil: Number.isFinite(snoozed) && snoozed > 0 ? snoozed : undefined,
    now,
  });
}

/** "Not now": quiets the sync reminder for a few days. */
export function snoozeSyncReminder(r: Repository, now = Date.now()) {
  r.setSetting(SNOOZED, String(now + syncReminderRule.snoozeDays * DAY));
}
