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
  let profile: Profile = { ...defaults, onboarded: true, notifications: false };
  jest.mocked(useRepo).mockReturnValue({
    profile: () => profile,
    saveProfile: (patch: Partial<Profile>) => {
      profile = { ...profile, ...patch };
      return profile;
    },
  } as ReturnType<typeof useRepo>);
  const view = await render(<ProfileForm onDone={() => {}} />);
  await fireEvent.press(view.getByText("Enable local notifications"));
  await waitFor(() => expect(profile.notifications).toBe(true));
  await fireEvent.press(view.getByText("Save settings"));
  await waitFor(() => expect(profile.notifications).toBe(true));
});
