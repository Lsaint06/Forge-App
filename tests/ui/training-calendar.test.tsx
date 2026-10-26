import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import CalendarRoute from "../../app/calendar";
import { useRepo } from "../../src/state";
import { consistencyInput } from "../../src/data/progress";
import type { ConsistencyInput } from "../../src/domain/progress/consistency";
import { localDate } from "../../src/domain/types";
import { dayLabel } from "../../src/domain/training-display";
import { theme } from "../../src/theme";
import { pathRepository } from "../path-fixture";

// Phase 7.2C-4: the REFORGE Training calendar. The day details come from the
// real `dayDetail`; only the repository read is replaced, so every state can
// be shown on fixed days of the current month.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { profile: undefined; revision: number }) => unknown) =>
      selector({ profile: undefined, revision: 0 }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/data/progress", () => {
  const actual = jest.requireActual("../../src/data/progress");
  return { ...actual, consistencyInput: jest.fn(actual.consistencyInput) };
});

const today = localDate();
const month = today.slice(0, 7);
// Four other days of this month, whatever today is.
const [missed, skipped, planned, path] = [10, 11, 12, 13, 14]
  .map((n) => `${month}-${n}`)
  .filter((d) => d !== today)
  .slice(0, 4) as [string, string, string, string];

const input = (): ConsistencyInput => ({
  today,
  workouts: [{ date: today, workoutId: "w-1", name: "Push day" }],
  programs: [],
  dated: [
    { date: missed, name: "Upper A", source: "path", state: "missed" },
    { date: skipped, name: "Lower B", source: "path", state: "skipped" },
    { date: planned, name: "Full body", source: "plan", state: "scheduled" },
    { date: path, name: "Upper C", source: "path", state: "scheduled" },
  ],
  upcoming: [],
});

const hidden = { includeHiddenElements: true };
// Either palette: the test renderer may report a light or dark scheme.
const ember = [theme.palettes.dark.emberHot, theme.palettes.light.emberHot];
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
  jest.mocked(router.canGoBack).mockReturnValue(true);
});

async function open() {
  const fixture = pathRepository();
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  jest.mocked(consistencyInput).mockReturnValue(input());
  return { ...fixture, view: await render(<CalendarRoute />) };
}

test("REFORGE frame: header, month, five distinguishable states and a key", async () => {
  const { view, db } = await open();
  try {
    expect(
      view.getByRole("header", { name: "Training calendar" }),
    ).toBeTruthy();
    expect(view.getByLabelText("Back")).toBeTruthy();
    expect(
      view.getByLabelText(`${dayLabel(today)}, today: workout completed`),
    ).toBeTruthy();
    for (const [date, spoken] of [
      [missed, "planned session missed"],
      [skipped, "session skipped"],
      [planned, "session planned"],
    ] as const)
      expect(view.getByLabelText(`${dayLabel(date)}: ${spoken}`)).toBeTruthy();
    // Each state has its own shape, not just its own colour.
    const marks = (state: string) =>
      view.queryAllByTestId(`calendar-mark-${state}`, hidden);
    expect(marks("completed")[0]!.props.name).toBe("checkmark-circle");
    expect(marks("missed")[0]!.props.name).toBe("alert-circle-outline");
    expect(marks("skipped")[0]!.props.name).toBe("play-skip-forward-outline");
    expect(marks("scheduled").length).toBe(2);
    expect(marks("rest")).toHaveLength(0);
    expect(ember).toContain(marks("completed")[0]!.props.color);
    expect(
      view.getByLabelText(
        "Key: Completed, Planned, Missed, Skipped. Unmarked days are rest days.",
      ),
    ).toBeTruthy();
    expect(
      view.getByText("1 workout this month · 1 skipped · 1 missed"),
    ).toBeTruthy();
    // Every visible day is one button; whole weeks only.
    expect(view.getAllByTestId("calendar-day").length % 7).toBe(0);
  } finally {
    db.close();
  }
});

test("the selected day lists its sessions; workouts and history stay one tap away", async () => {
  const { view, db, r } = await open();
  try {
    const before = r.workouts().length;
    expect(view.getByText("Today")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Review Push day"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: "w-1" },
    });
    await fireEvent.press(
      view.getByLabelText(`${dayLabel(missed)}: planned session missed`),
    );
    expect(view.getByLabelText("Upper A, Missed · Path")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`${dayLabel(skipped)}: session skipped`),
    );
    expect(view.getByLabelText("Lower B, Skipped · Path")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`${dayLabel(planned)}: session planned`),
    );
    expect(view.getByLabelText("Full body, Planned")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Training history"));
    expect(router.push).toHaveBeenLastCalledWith("/history");
    // Looking at the calendar never changes training data.
    expect(r.workouts().length).toBe(before);
  } finally {
    db.close();
  }
});

test("Back returns to the previous screen, or to Train from a deep link", async () => {
  const { view, db } = await open();
  try {
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenLastCalledWith("/(tabs)/train");
  } finally {
    db.close();
  }
});

test("compact iPhones and large text keep 44 pt targets and a clear selection", async () => {
  Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
  const { view, db } = await open();
  try {
    for (const day of view.getAllByTestId("calendar-day")) {
      expect(Number(flat(day).minHeight)).toBeGreaterThanOrEqual(44);
      expect(flat(day).width).toBe(`${100 / 7}%`);
    }
    const next = flat(view.getByLabelText("Next month"));
    expect(Number(next.width)).toBeGreaterThanOrEqual(44);
    expect(Number(next.height)).toBeGreaterThanOrEqual(44);
    const selected = view.getByLabelText(
      `${dayLabel(today)}, today: workout completed`,
    );
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(ember).toContain(flat(selected).borderColor);
    expect(
      Number(flat(view.getByLabelText("Training history")).minHeight),
    ).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});
