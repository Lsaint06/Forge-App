import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import You from "../../src/screens/You";
import { useRepo } from "../../src/state";
import { EntryContext } from "../../src/auth/session";
import { recordSyncOutcome } from "../../src/cloud/sync-state";
import { pathRepository } from "../path-fixture";

// Phase 7.8C: the gentle sync reminder on You. Shown only to this phone's
// owner while signed in, only with changes waiting; it opens Account &
// privacy and "Not now" quiets it. Nothing is synchronized from here.

let mockRevision = 0;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => {
    const value = fn();
    mockRevision++;
    return value;
  },
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number }) => unknown) =>
      selector({ revision: mockRevision }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
}));
jest.mock("../../src/cloud/client", () => ({
  cloudClient: () => ({}),
  transport: jest.fn(),
}));

const me = { id: "user-a", email: "a@example.com" };
function phone() {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, name: "Alex" });
  f.r.setSetting("cloudOwner", me.id);
  const w = f.r.startWorkout("Push day");
  f.r.finishWorkout(w.id);
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const tree = (user = me) => (
  <EntryContext.Provider
    value={{
      entry: { kind: "ready", user, offline: false },
      client: null,
      finishRecovery: jest.fn(),
    }}
  >
    <You />
  </EntryContext.Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 0;
});

test("training that isn't in the cloud yet: a quiet card that opens Account & privacy", async () => {
  const { db } = phone();
  try {
    const view = await render(tree());
    const card = view.getByTestId("you-sync-reminder");
    expect(card).toBeTruthy();
    const row = view.getByRole("button", { name: "Sync your latest training" });
    expect(row.props.accessibilityHint).toBe(
      "Your training on this phone isn't in the cloud yet.",
    );
    await fireEvent.press(row);
    expect(router.push).toHaveBeenLastCalledWith("/account");
    expect(view.queryByText(/backed up/i)).toBeNull();
  } finally {
    db.close();
  }
});

test("'Not now' quiets the reminder for a few days", async () => {
  const { r, db } = phone();
  try {
    const view = await render(tree());
    await fireEvent.press(view.getByRole("button", { name: "Not now" }));
    expect(Number(r.setting("syncReminderSnoozedUntil"))).toBeGreaterThan(
      Date.now(),
    );
    await view.rerender(tree());
    expect(view.queryByTestId("you-sync-reminder")).toBeNull();
  } finally {
    db.close();
  }
});

test("no reminder after a recent complete sync, without changes, or for another account", async () => {
  const { r, db } = phone();
  try {
    recordSyncOutcome(r, me.id, "complete", Date.now());
    const view = await render(tree());
    expect(view.queryByTestId("you-sync-reminder")).toBeNull();
    // Nothing waiting at all.
    r.db.run("DELETE FROM outbox");
    recordSyncOutcome(r, me.id, "complete", Date.now() - 30 * 86_400_000);
    mockRevision++;
    await view.rerender(tree());
    expect(view.queryByTestId("you-sync-reminder")).toBeNull();
    view.unmount();
    // Signed in as someone who doesn't own this phone's data.
    const other = phone();
    try {
      const otherView = await render(tree({ id: "user-b", email: "b@x.co" }));
      expect(otherView.queryByTestId("you-sync-reminder")).toBeNull();
    } finally {
      other.db.close();
    }
  } finally {
    db.close();
  }
});
