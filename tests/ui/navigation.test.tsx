import React from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import TabLayout from "../../app/(tabs)/_layout";
import { router } from "expo-router";
import { useRepo } from "../../src/state";
import { dark } from "../../src/components/ui";
const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
const mockTab = { index: 0 };
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => {
  const Tabs = Object.assign(
    (props: { tabBar: (props: unknown) => React.ReactNode }) =>
      props.tabBar({
        state: {
          index: mockTab.index,
          routes: ["index", "train", "progress", "profile"].map((name) => ({
            name,
            key: name,
          })),
        },
        // Expo Router 58 tab bar props.
        emitter: { emit: mockEmit },
        navigateToTab: mockNavigate,
      }),
    { Screen: () => null },
  );
  return { Tabs, router: { push: jest.fn() } };
});
beforeEach(() => {
  mockTab.index = 0;
  jest.clearAllMocks();
});
test("four destinations navigate and resume keeps the persisted active session", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => ({ name: "Saved session", status: "active" }),
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  expect(view.getAllByRole("tab")).toHaveLength(4);
  expect(view.getByLabelText("Today").props.accessibilityState).toEqual({
    selected: true,
  });
  // The exercise library moved into Train; it is no longer a tab.
  expect(view.queryByLabelText(/explore/i)).toBeNull();
  for (const label of ["Train", "Progress", "You"])
    await fireEvent.press(view.getByLabelText(label));
  expect(mockNavigate.mock.calls.map((call) => call[0])).toEqual([
    "train",
    "progress",
    "profile",
  ]);
  // Today's hero offers Resume, so the banner appears on the other tabs.
  expect(view.queryByLabelText("Resume active workout")).toBeNull();
  mockTab.index = 1;
  await view.rerender(<TabLayout />);
  expect(view.getByText("Saved session")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Resume active workout"));
  expect(router.push).toHaveBeenCalledWith("/workout");
});

test("the selected tab is white, never orange", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => undefined,
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  const flat = (style: unknown) =>
    StyleSheet.flatten(style as StyleProp<TextStyle>);
  expect(flat(view.getByText("Today").props.style)?.color).toBe(dark.text);
  expect(flat(view.getByText("Train").props.style)?.color).toBe(dark.text2);
  expect(view.queryByLabelText("Resume active workout")).toBeNull();
});

test("tapping the current tab does not navigate, and a prevented press is respected", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => undefined,
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  await fireEvent.press(view.getByLabelText("Today"));
  expect(mockEmit).toHaveBeenCalledWith({
    type: "tabPress",
    target: "index",
    canPreventDefault: true,
  });
  expect(mockNavigate).not.toHaveBeenCalled();
  mockEmit.mockReturnValueOnce({ defaultPrevented: true });
  await fireEvent.press(view.getByLabelText("Train"));
  expect(mockNavigate).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Train"));
  expect(mockNavigate).toHaveBeenCalledWith("train");
});
