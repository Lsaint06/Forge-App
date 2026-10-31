import React, { useState, useSyncExternalStore } from "react";
import { Text } from "react-native";
import { render, act, fireEvent } from "@testing-library/react-native";
import {
  COVERED_AFTER_MS,
  TabFreeze,
  tabFreeze,
} from "../../src/components/TabFreeze";

// Phase 7.6: background tabs stop re-rendering on every saved change, and
// show the latest data the moment they are shown again.

let mockPath = "/train";
jest.mock("expo-router", () => ({ usePathname: () => mockPath }));

// A stand-in for the store revision every screen subscribes to.
let revision = 0;
const listeners = new Set<() => void>();
const store = {
  subscribe: (fn: () => void) => (
    listeners.add(fn),
    () => listeners.delete(fn)
  ),
  get: () => revision,
};
const save = () =>
  act(() => {
    revision++;
    listeners.forEach((fn) => fn());
  });
let renders = 0;
function Screen() {
  const r = useSyncExternalStore(store.subscribe, store.get);
  const [taps, setTaps] = useState(0);
  renders++;
  return (
    <Text accessibilityLabel="probe" onPress={() => setTaps(taps + 1)}>
      {`revision ${r} · taps ${taps}`}
    </Text>
  );
}
const tab = () => (
  <TabFreeze path="/train">
    <Screen />
  </TabFreeze>
);
beforeEach(() => {
  mockPath = "/train";
  revision = 0;
  renders = 0;
});

test("the rule: hidden tabs freeze; the shown tab and the one under a pushed screen stay live", () => {
  expect(tabFreeze("/train", "/train", true)).toBe("live");
  expect(tabFreeze("/progress", "/train", true)).toBe("frozen");
  expect(tabFreeze("/", "/train", true)).toBe("frozen");
  expect(tabFreeze("/workout", "/train", true)).toBe("covered");
  expect(tabFreeze("/workout", "/train", false)).toBe("covered");
  // Pushed screens (History, Goals, Account …): as before they were pushed.
  expect(tabFreeze("/history", "/train", true)).toBe("live");
  expect(tabFreeze("/journal", "/train", false)).toBe("frozen");
});

test("a hidden tab doesn't re-render on saves, then shows the latest data and keeps its state", async () => {
  const view = await render(tab());
  await fireEvent.press(view.getByLabelText("probe"));
  expect(view.getByText("revision 0 · taps 1")).toBeTruthy();
  // Another tab is shown.
  mockPath = "/progress";
  await view.rerender(tab());
  const before = renders;
  await save();
  await save();
  expect(renders).toBe(before);
  // Shown again: current data, same local state.
  mockPath = "/train";
  await view.rerender(tab());
  expect(view.getByText("revision 2 · taps 1")).toBeTruthy();
});

test("the shown tab, and the tab under a pushed screen, stay live", async () => {
  const view = await render(tab());
  await save();
  expect(view.getByText("revision 1 · taps 0")).toBeTruthy();
  // History is pushed over this tab: it stays live for the swipe back.
  mockPath = "/history";
  await view.rerender(tab());
  await save();
  expect(view.getByText("revision 2 · taps 0")).toBeTruthy();
});

test("under the workout logger: live while it slides in, then frozen until it closes", async () => {
  jest.useFakeTimers();
  try {
    const view = await render(tab());
    mockPath = "/workout";
    await view.rerender(tab());
    await save();
    // Still drawn while the logger animates in.
    expect(view.getByText("revision 1 · taps 0")).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(COVERED_AFTER_MS));
    const before = renders;
    for (let i = 0; i < 6; i++) await save();
    expect(renders).toBe(before);
    // The logger closes back to History, over this tab: live at once.
    mockPath = "/history";
    await view.rerender(tab());
    expect(view.getByText("revision 7 · taps 0")).toBeTruthy();
    // Opening the logger again waits for the slide-in again.
    mockPath = "/workout";
    await view.rerender(tab());
    await save();
    expect(view.getByText("revision 8 · taps 0")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
