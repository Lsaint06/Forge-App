// Rest alerts (Phase 8.3C-3): when the logger invites the lifter to turn on
// the notification that marks the end of a rest. Decisions only: the logger
// shows the invitation, and Preferences records the lifter's own choice.

/** Local setting: the lifter's answer to the invitation. */
export const REST_ALERT_INVITE = "restAlertInvite";

/** The answers kept in REST_ALERT_INVITE once the lifter has chosen. */
export type RestAlertAnswer =
  | "enabled" // turned on from the invitation
  | "declined" // the phone's permission was refused
  | "dismissed" // Not now
  | "settings"; // chosen in Preferences

/** The setting's value while an unanswered offer is open in a workout. */
export const offeredIn = (workoutId: string) => `offered:${workoutId}`;

/**
 * Whether the logger invites the lifter to turn on rest alerts: only during
 * a rest, only while alerts are off and can work on this phone, and only
 * until the lifter answers. An offer left unanswered stays with the workout
 * it first appeared in, so it never follows the lifter from workout to
 * workout.
 */
export function showRestAlertInvite(state: {
  resting: boolean;
  alertsOn: boolean;
  available: boolean;
  answer: string | undefined;
  workoutId: string;
}) {
  if (!state.resting || state.alertsOn || !state.available) return false;
  return !state.answer || state.answer === offeredIn(state.workoutId);
}
