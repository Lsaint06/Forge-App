import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import Templates from "../../app/templates";
import JournalScreen from "../../src/screens/Journal";
import { ProfileForm } from "../../src/components/ProfileForm";
import { useRepo } from "../../src/state";
import { defaults, type Profile } from "../../src/domain/types";
import { pathRepository } from "../path-fixture";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ kind: "measurement" }),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  enableNotifications: async () => true,
}));
jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: async () => {},
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));

type AlertButton = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const discardPrompts = () =>
  alert.mock.calls.filter(([title]) => title === "Discard changes?");
const pressDiscard = () =>
  (discardPrompts().at(-1)![2] as AlertButton[]).find(
    (b) => b.text === "Discard",
  )!.onPress!();
beforeEach(() => alert.mockClear());

test("closing the template editor with changes asks before discarding them", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    // Untouched: closes without a prompt.
    await fireEvent.press(view.getByLabelText("Create template"));
    await fireEvent.press(view.getByLabelText("Close"));
    expect(discardPrompts()).toHaveLength(0);
    expect(view.queryByText("New template")).toBeNull();
    // Edited: × asks, the draft survives "Keep editing", then Discard closes.
    await fireEvent.press(view.getByLabelText("Create template"));
    await fireEvent.changeText(view.getByLabelText("Template name"), "Push A");
    await fireEvent.press(view.getByLabelText("Close"));
    expect(discardPrompts()).toHaveLength(1);
    expect(view.getByLabelText("Template name").props.value).toBe("Push A");
    await waitFor(() => pressDiscard());
    await waitFor(() => expect(view.queryByText("New template")).toBeNull());
    // Reverting an edit leaves nothing to lose.
    await fireEvent.press(view.getByLabelText("Create template"));
    await fireEvent.changeText(view.getByLabelText("Template name"), "x");
    await fireEvent.changeText(view.getByLabelText("Template name"), "");
    await fireEvent.press(view.getByLabelText("Close"));
    expect(discardPrompts()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("closing a measurement with changes asks before discarding them", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<JournalScreen />);
    await fireEvent.press(
      view.getByRole("button", { name: "Log measurement" }),
    );
    await fireEvent.press(view.getByLabelText("Close"));
    expect(discardPrompts()).toHaveLength(0);
    await fireEvent.press(
      view.getByRole("button", { name: "Log measurement" }),
    );
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "81.5");
    await fireEvent.press(view.getByLabelText("Close"));
    expect(discardPrompts()).toHaveLength(1);
    expect(view.getByLabelText("Bodyweight (kg)").props.value).toBe("81.5");
    await waitFor(() => pressDiscard());
    await waitFor(() =>
      expect(view.queryByLabelText("Bodyweight (kg)")).toBeNull(),
    );
    expect(r.journal("measurement")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("the preferences form reports unsaved changes to its sheet", async () => {
  let profile: Profile = { ...defaults, onboarded: true, height: 180 };
  profile = { ...profile, weight: 80 };
  jest.mocked(useRepo).mockReturnValue({
    profile: () => profile,
    saveProfile: (patch: Partial<Profile>) =>
      (profile = { ...profile, ...patch }),
    setting: () => undefined,
    setSetting: () => undefined,
  } as unknown as ReturnType<typeof useRepo>);
  const dirty = jest.fn();
  const view = await render(
    <ProfileForm onDone={jest.fn()} onDirtyChange={dirty} />,
  );
  expect(dirty).toHaveBeenLastCalledWith(false);
  await fireEvent.press(view.getByText("lb", { exact: true }));
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true));
  // Nothing is saved until the user chooses to save.
  expect(profile.units).toBe(defaults.units);
});
