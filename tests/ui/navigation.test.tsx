import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import TabLayout from "../../app/(tabs)/_layout";
import { router } from "expo-router";
import { useRepo } from "../../src/state";
const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => {
  const Tabs = Object.assign(
    (props: { tabBar: (props: unknown) => React.ReactNode }) =>
      props.tabBar({
        state: {
          index: 0,
          routes: ["index", "train", "explore", "progress", "profile"].map(
            (name) => ({ name, key: name }),
          ),
        },
        navigation: { navigate: mockNavigate, emit: mockEmit },
      }),
    { Screen: () => null },
  );
  return { Tabs, router: { push: jest.fn() } };
});
test("all five destinations navigate and resume keeps the persisted active session", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => ({ name: "Saved session", status: "active" }),
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  for (const label of ["train", "explore", "progress", "You"])
    await fireEvent.press(view.getByLabelText(label));
  expect(mockNavigate.mock.calls.map((call) => call[0])).toEqual([
    "train",
    "explore",
    "progress",
    "profile",
  ]);
  await fireEvent.press(view.getByLabelText("Resume active workout"));
  expect(router.push).toHaveBeenCalledWith("/workout");
});
