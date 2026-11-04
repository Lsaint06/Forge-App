import { test } from "node:test";
import assert from "node:assert/strict";
import {
  offeredIn,
  showRestAlertInvite,
  type RestAlertAnswer,
} from "../src/domain/rest-alerts";

// Phase 8.3C-3 (W-2): when the logger invites the lifter to turn on the
// alert that ends a rest.

const resting = {
  resting: true,
  alertsOn: false,
  available: true,
  answer: undefined,
  workoutId: "w1",
};

test("rest alerts are offered only during a rest, while off and possible on this phone", () => {
  assert.equal(showRestAlertInvite(resting), true);
  assert.equal(showRestAlertInvite({ ...resting, resting: false }), false);
  assert.equal(showRestAlertInvite({ ...resting, alertsOn: true }), false);
  // Expo Go on Android has no notifications: nothing to offer.
  assert.equal(showRestAlertInvite({ ...resting, available: false }), false);
});

test("any answer ends the offer; one left unanswered stays with its workout", () => {
  const answers: RestAlertAnswer[] = [
    "enabled",
    "declined",
    "dismissed",
    "settings",
  ];
  for (const answer of answers)
    assert.equal(showRestAlertInvite({ ...resting, answer }), false, answer);
  assert.equal(showRestAlertInvite({ ...resting, answer: "" }), true);
  assert.equal(
    showRestAlertInvite({ ...resting, answer: offeredIn("w1") }),
    true,
  );
  assert.equal(
    showRestAlertInvite({ ...resting, answer: offeredIn("w0") }),
    false,
  );
});
