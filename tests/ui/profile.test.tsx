import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ProfileForm } from "../../src/components/ProfileForm";
import { defaults, type Profile } from "../../src/domain/types";
import { useRepo } from "../../src/state";
jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: async () => {},
}));
jest.mock("../../src/notifications", () => ({
  enableNotifications: async () => true,
}));
test("saving the profile preserves a just-enabled notification preference", async () => {
  let profile: Profile = {
    ...defaults,
    onboarded: true,
    notifications: false,
    height: 180,
    weight: 80,
  };
  jest.mocked(useRepo).mockReturnValue({
    profile: () => profile,
    saveProfile: (patch: Partial<Profile>) => {
      profile = { ...profile, ...patch };
      return profile;
    },
  } as ReturnType<typeof useRepo>);
  const onDone = jest.fn();
  const view = await render(<ProfileForm onDone={onDone} />);
  await fireEvent.press(view.getByText("Enable local notifications"));
  await waitFor(() => expect(profile.notifications).toBe(true));
  await fireEvent.press(view.getByText("Save settings"));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(profile.notifications).toBe(true);
});

function mockProfile(patch: Partial<Profile> = {}) {
  let profile: Profile = { ...defaults, ...patch };
  const saveProfile = jest.fn((patch: Partial<Profile>) => {
    profile = { ...profile, ...patch };
    return profile;
  });
  const settings = new Map<string, string>();
  jest.mocked(useRepo).mockReturnValue({
    profile: () => profile,
    saveProfile,
    setting: (key: string) => settings.get(key),
    setSetting: (key: string, value: string) => settings.set(key, value),
  } as unknown as ReturnType<typeof useRepo>);
  return { current: () => profile, saveProfile };
}

test("weight units update the label and display without changing the stored weight", async () => {
  const repo = mockProfile({ height: 180, weight: 100 });
  const onDone = jest.fn();
  const view = await render(<ProfileForm onDone={onDone} />);
  expect(view.queryByLabelText("Available equipment")).toBeNull();
  expect(view.queryByLabelText(/workout duration/i)).toBeNull();
  await fireEvent.press(view.getByText("lb", { exact: true }));
  expect(
    view.getByLabelText("Starting weight (lbs, required)").props.value,
  ).toBe("220.46");
  await fireEvent.press(view.getByText("kg", { exact: true }));
  expect(
    view.getByLabelText("Starting weight (kg, required)").props.value,
  ).toBe("100");
  await fireEvent.press(view.getByText("lb", { exact: true }));
  await fireEvent.changeText(
    view.getByLabelText("Starting weight (lbs, required)"),
    "176.3698",
  );
  await fireEvent.press(view.getByText("Save settings"));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(repo.current().weight).toBeCloseTo(80, 3);
  expect(repo.current().units).toBe("lb");
  // The retired duration preference is kept for older backups, not edited.
  expect(repo.current().duration).toBe(45);
});

test("height uses feet and inches while keeping existing metric records intact", async () => {
  const repo = mockProfile({ height: 180, weight: 75 });
  const onDone = jest.fn();
  const view = await render(<ProfileForm onDone={onDone} />);
  expect(view.getByLabelText("Height (feet)").props.value).toBe("5");
  expect(view.getByLabelText("Height (inches)").props.value).toBe("11");
  await fireEvent.press(view.getByText("Save settings"));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(repo.current().height).toBe(180);
  await fireEvent.changeText(view.getByLabelText("Height (feet)"), "6");
  await fireEvent.changeText(view.getByLabelText("Height (inches)"), "2");
  await fireEvent.press(view.getByText("Save settings"));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));
  expect(repo.current().height).toBeCloseTo(187.96, 5);
});

test("required height and weight cannot be bypassed by Next or skipping optional setup", async () => {
  const repo = mockProfile();
  const onDone = jest.fn();
  const view = await render(<ProfileForm onboarding onDone={onDone} />);
  await fireEvent.press(view.getByText("Next", { exact: true }));
  await waitFor(() =>
    expect(view.getByText(/Enter a valid height/)).toBeTruthy(),
  );
  expect(view.getByText(/STEP 1/)).toBeTruthy();
  await fireEvent.press(view.getByText("Skip remaining optional setup"));
  await waitFor(() =>
    expect(view.getByText("Enter your starting weight.")).toBeTruthy(),
  );
  expect(onDone).not.toHaveBeenCalled();
  expect(repo.current().onboarded).toBe(false);
  await fireEvent.changeText(view.getByLabelText("Height (feet)"), "5");
  await fireEvent.changeText(view.getByLabelText("Height (inches)"), "12");
  await fireEvent.changeText(
    view.getByLabelText("Starting weight (kg, required)"),
    "75",
  );
  await fireEvent.press(view.getByText("Skip remaining optional setup"));
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText("Height (inches)"), "10");
  await fireEvent.press(view.getByText("Skip remaining optional setup"));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(repo.current().height).toBeCloseTo(177.8, 3);
  expect(repo.current().weight).toBe(75);
});
