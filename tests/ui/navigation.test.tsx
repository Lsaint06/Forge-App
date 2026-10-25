import React from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
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
          routes: ["index", "train", "nutrition", "progress", "profile"].map(
            (name) => ({
              name,
              key: name,
            }),
          ),
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
// Phase 7.1A: five destinations (Home, Train, Nutrition, Progress, You) in the
// REFORGE tab bar. Earlier versions asserted four tabs, a "Today" label and a
// white selected tab; those were Design System 2.0 visual rules, superseded
// by the approved references. Navigation behaviour is asserted as before.
test("five destinations navigate in order and resume keeps the persisted active session", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => ({ name: "Saved session", status: "active" }),
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  const tabs = view.getAllByRole("tab");
  expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual([
    "Home",
    "Train",
    "Nutrition",
    "Progress",
    "You",
  ]);
  expect(view.getByLabelText("Home").props.accessibilityState).toEqual({
    selected: true,
  });
  // The exercise library moved into Train; it is no longer a tab.
  expect(view.queryByLabelText(/explore/i)).toBeNull();
  for (const label of ["Train", "Nutrition", "Progress", "You"])
    await fireEvent.press(view.getByLabelText(label));
  expect(mockNavigate.mock.calls.map((call) => call[0])).toEqual([
    "train",
    "nutrition",
    "progress",
    "profile",
  ]);
  // Home's hero offers Resume, so the banner appears on the other tabs.
  expect(view.queryByLabelText("Resume active workout")).toBeNull();
  for (const tab of [1, 2, 3, 4]) {
    mockTab.index = tab;
    await view.rerender(<TabLayout />);
    expect(view.getByText("Saved session")).toBeTruthy();
  }
  await fireEvent.press(view.getByLabelText("Resume active workout"));
  expect(router.push).toHaveBeenCalledWith("/workout");
});

test("the selected tab is ember and bolder; the others are secondary", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => undefined,
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  const flat = (style: unknown) =>
    StyleSheet.flatten(style as StyleProp<TextStyle>);
  const home = flat(view.getByText("Home").props.style);
  const train = flat(view.getByText("Train").props.style);
  expect(home?.color).toBe(dark.emberHot);
  expect(home?.fontWeight).toBe("700");
  expect(train?.color).toBe(dark.text2);
  expect(train?.fontWeight).toBe("500");
  // Labels stay readable at large text sizes without pushing tabs off screen.
  expect(view.getByText("Nutrition").props.maxFontSizeMultiplier).toBe(1.3);
  // Every tab keeps a 56 pt target.
  for (const tab of view.getAllByRole("tab"))
    expect(flat(tab.props.style)?.minHeight).toBeGreaterThanOrEqual(56);
  expect(view.queryByLabelText("Resume active workout")).toBeNull();
});

test("in every position the selected icon and label are solid ember, with one small glow behind that icon only", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => undefined,
  } as unknown as ReturnType<typeof useRepo>);
  const names = ["index", "train", "nutrition", "progress", "profile"];
  const labels = ["Home", "Train", "Nutrition", "Progress", "You"];
  const flat = (style: unknown) =>
    StyleSheet.flatten(style as StyleProp<TextStyle>);
  for (let selected = 0; selected < names.length; selected++) {
    mockTab.index = selected;
    const view = await render(<TabLayout />);
    const tabs = view.getAllByRole("tab");
    names.forEach((name, i) => {
      const on = i === selected;
      expect(tabs[i]!.props.accessibilityState).toEqual({ selected: on });
      expect(view.getByTestId(`tab-icon-${name}`).props.color).toBe(
        on ? dark.emberHot : dark.text2,
      );
      const label = flat(view.getByText(labels[i]!).props.style);
      expect(label?.color).toBe(on ? dark.emberHot : dark.text2);
      // The label itself is never faded.
      expect(label?.opacity).toBeUndefined();
    });
    // Exactly one glow, inside the selected tab, no larger than the icon's
    // immediate surroundings (44 × 32 pt).
    const glows = view.getAllByTestId("tab-glow", {
      includeHiddenElements: true,
    });
    expect(glows).toHaveLength(1);
    expect(
      within(tabs[selected]!).getByTestId("tab-glow", {
        includeHiddenElements: true,
      }),
    ).toBe(glows[0]);
    const box = flat(glows[0]!.props.style) as Record<string, number>;
    expect(box.width).toBeLessThanOrEqual(44);
    expect(box.height).toBeLessThanOrEqual(32);
    expect(box.position).toBe("absolute");
    await view.unmount();
  }
});

test("a paused workout shows as paused in the resume strip", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => ({ name: "Program · Upper A", status: "paused" }),
  } as unknown as ReturnType<typeof useRepo>);
  mockTab.index = 2;
  const view = await render(<TabLayout />);
  expect(view.getByText("Paused")).toBeTruthy();
  expect(view.getByText("Upper A")).toBeTruthy();
  expect(
    view.getByLabelText("Resume active workout").props.accessibilityHint,
  ).toBe("Paused: Program · Upper A");
});

test("tapping the current tab does not navigate, and a prevented press is respected", async () => {
  jest.mocked(useRepo).mockReturnValue({
    active: () => undefined,
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<TabLayout />);
  await fireEvent.press(view.getByLabelText("Home"));
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
