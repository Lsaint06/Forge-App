import type { Repository } from "../data/repository";
import { dataOwner } from "../data/ownership";

// Keeping a workout going after an unexpected sign-out (Phase 7.8E, Stage 4,
// E4). When the account service ends this phone's sign-in without the
// athlete asking (a refresh that fails for good, a sign-out of all devices
// elsewhere, a deleted account), and that account's own workout is in
// progress here, the athlete can finish it on this phone. Nothing else opens,
// nothing is synchronized, and no other account is involved: the workout is
// already the owner's, and stays theirs.
//
// A marker (the owner's ID, the workout's ID and a time: never a token)
// lets that one workout continue across an app restart, for a limited time.
// Any sign-in ends it.

const MARKER = "sessionEnded";

/** How long an unexpectedly signed-out workout can continue across restarts. */
export const CONTINUE_FOR_MS = 12 * 60 * 60_000;

export type SessionEnded = { owner: string; workout: string; at: number };

/** The marker, if it is readable. */
export function sessionEnded(r: Repository): SessionEnded | undefined {
  try {
    const raw = r.setting(MARKER);
    const m = raw ? (JSON.parse(raw) as Partial<SessionEnded>) : undefined;
    return m &&
      typeof m.owner === "string" &&
      !!m.owner &&
      typeof m.workout === "string" &&
      !!m.workout &&
      typeof m.at === "number"
      ? { owner: m.owner, workout: m.workout, at: m.at }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The account `ended` just lost its sign-in without asking. Recorded only
 * when that account owns this phone's training and its workout is in
 * progress; returns whether the workout can continue.
 */
export function noteSessionEnded(
  r: Repository,
  ended: string,
  now = Date.now(),
): boolean {
  const workout = r.active();
  if (!workout || dataOwner(r) !== ended) return false;
  const marker: SessionEnded = { owner: ended, workout: workout.id, at: now };
  r.setSetting(MARKER, JSON.stringify(marker));
  return true;
}

/**
 * The workout that may continue while signed out: the same workout, still
 * in progress, still the same owner's, within the time limit. Anything else
 * is no longer a continuation.
 */
export function continuation(
  r: Repository,
  now = Date.now(),
): SessionEnded | undefined {
  const marker = sessionEnded(r);
  if (!marker) return undefined;
  const workout = r.active();
  return workout?.id === marker.workout &&
    dataOwner(r) === marker.owner &&
    now - marker.at >= 0 &&
    now - marker.at < CONTINUE_FOR_MS
    ? marker
    : undefined;
}

/** Someone signed in, or the workout is over: the continuation ends. */
export function endContinuation(r: Repository) {
  if (r.setting(MARKER)) r.clearSetting(MARKER);
}

/** A continued workout's summary stays open this long after it's finished. */
export const FINISHED_GRACE_MS = 10 * 60_000;

/**
 * What `ended` can still open while signed out: its workout in progress
 * ("active"), or the one it continued and has just finished, so its summary
 * can be read ("finished"). Never another account's.
 */
export function continuedWorkout(
  r: Repository,
  ended: string,
  now = Date.now(),
): "active" | "finished" | undefined {
  if (dataOwner(r) !== ended) return undefined;
  if (r.active()) return "active";
  const marker = sessionEnded(r);
  if (marker?.owner !== ended) return undefined;
  const done = r.workout(marker.workout);
  return done?.status === "completed" &&
    typeof done.finishedAt === "number" &&
    now - done.finishedAt >= 0 &&
    now - done.finishedAt < FINISHED_GRACE_MS
    ? "finished"
    : undefined;
}
