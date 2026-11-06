import React from "react";
import { StyleSheet } from "react-native";
import {
  render,
  fireEvent,
  within,
  act,
  waitFor,
} from "@testing-library/react-native";
import JournalScreen from "../../src/screens/Journal";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";
import { bodyweight } from "../../src/screens/home/model";
import { evaluate, type Goal } from "../../src/domain/goals";
import { goalSources } from "../../src/data/goal-sources";
import { theme } from "../../src/theme";

// Phase 7.5G.1: the REFORGE Measurements screen, series card and sheet.
// Storage, series, changes and validation are covered by measurements.test.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: 0, profile: mockProfile }),
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
  useLocalSearchParams: () => ({ kind: "measurement" }),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

const today = localDate();
type Repo = ReturnType<typeof pathRepository>["r"];
function setup(profile: Parameters<Repo["saveProfile"]>[0] = {}) {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const m = (
  r: Repo,
  name: string,
  value: number,
  unit: string,
  date: string,
  extra: Record<string, unknown> = {},
) => r.addJournal("measurement", { name, value, unit, ...extra }, date);
const trend = (view: Awaited<ReturnType<typeof render>>, name: string) =>
  view.getByRole("adjustable", { name: `${name} trend` });

test("overview: the latest real weigh-in leads; the chart is the recorded days, in order", async () => {
  const { r, db } = setup();
  try {
    m(r, "Bodyweight", 83.1, "kg", addDays(today, -20));
    m(r, "Bodyweight", 82.4, "kg", addDays(today, -6));
    // Two entries today: one point for the day, two rows in history.
    m(r, "Bodyweight", 82.0, "kg", today, { notes: "Morning" });
    m(r, "Bodyweight", 81.8, "kg", today, { notes: "Evening" });
    const view = await render(<JournalScreen />);
    expect(view.getByRole("header", { name: "Measurements" })).toBeTruthy();
    expect(view.getByText("4 entries")).toBeTruthy();
    const card = within(view.getByTestId("measurement-series"));
    expect(card.getByText("Bodyweight")).toBeTruthy();
    expect(card.getByText("Today · 2 entries")).toBeTruthy();
    // Range segments have spoken names.
    expect(card.getByRole("tab", { name: "3 months" })).toBeTruthy();
    const chart = trend(view, "Bodyweight");
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(chart.props.accessibilityValue.text);
      await act(async () =>
        fireEvent(chart, "accessibilityAction", {
          nativeEvent: { actionName: "decrement" },
        }),
      );
    }
    expect(seen[1]).toBe(`82.4 kg, ${dayLabel(addDays(today, -6))}`);
    expect(seen[2]).toBe(`83.1 kg, ${dayLabel(addDays(today, -20))}`);
    expect(seen[0]).toMatch(new RegExp(`, ${dayLabel(today)} · 2 entries$`));
    // History keeps both of today's entries, each with its note.
    expect(
      view.getByLabelText(/^Bodyweight, 82 kg, Today, Morning\. Edit$/),
    ).toBeTruthy();
    expect(
      view.getByLabelText(/^Bodyweight, 81\.8 kg, Today, Evening\. Edit$/),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("pounds and inches throughout; other measurements are rows with their values", async () => {
  const { r, db } = setup({ units: "lb" });
  try {
    m(r, "Bodyweight", 82, "kg", addDays(today, -1));
    m(r, "Waist", 84, "cm", addDays(today, -10));
    m(r, "Waist", 83, "cm", addDays(today, -1));
    m(
      r,
      "A very long custom measurement name for the left forearm",
      30,
      "cm",
      today,
    );
    const view = await render(<JournalScreen />);
    expect(view.getAllByText("180.8 lb").length).toBeGreaterThan(0);
    expect(
      view.getByLabelText(/^Waist, 32\.7 in, −[\d.]+ in since /),
    ).toBeTruthy();
    expect(
      view.getByLabelText(
        /^A very long custom measurement name for the left forearm, 11\.8 in, Logged Today$/,
      ),
    ).toBeTruthy();
    // A row opens its own measurement, with its own log action.
    await fireEvent.press(
      view.getByLabelText(/^Waist, 32\.7 in, −[\d.]+ in since /),
    );
    expect(view.getByRole("header", { name: "Waist" })).toBeTruthy();
    expect(view.getByText("2 entries")).toBeTruthy();
    expect(view.getByRole("button", { name: "Log Waist" })).toBeTruthy();
    expect(view.queryByLabelText(/^Bodyweight, /)).toBeNull();
  } finally {
    db.close();
  }
});

test("profile weight is labelled as such and is never shown as a weigh-in", async () => {
  const { r, db } = setup({ weight: 82 });
  try {
    const view = await render(<JournalScreen />);
    const offer = within(view.getByTestId("profile-weight-offer"));
    expect(offer.getByText("From your profile")).toBeTruthy();
    expect(offer.getByText("Your profile weight is 82 kg.")).toBeTruthy();
    // No weigh-in yet: no series card, no history, nothing shown as recorded.
    expect(view.queryByTestId("measurement-series")).toBeNull();
    expect(view.getByText("Track how your body changes")).toBeTruthy();
    expect(view.queryByText("History")).toBeNull();
    expect(r.journal("measurement")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("one weigh-in explains when a trend appears; empty states lead to logging", async () => {
  const empty = setup();
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Track how your body changes")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Log measurement" }),
    );
    expect(view.getByLabelText("Bodyweight (kg)")).toBeTruthy();
    await view.unmount();
  } finally {
    empty.db.close();
  }
  const one = setup();
  try {
    m(one.r, "Bodyweight", 81, "kg", today);
    const view = await render(<JournalScreen />);
    expect(
      view.getByText(
        "Log another weigh-in on another day to see how it changes.",
      ),
    ).toBeTruthy();
    expect(view.queryByRole("adjustable")).toBeNull();
    expect(view.queryByText(/^0 kg/)).toBeNull();
  } finally {
    one.db.close();
  }
});

test("logging, editing and deleting reach Home, You and Goals through the same records", async () => {
  const { r, db } = setup({ weight: 90 });
  try {
    r.addJournal(
      "goal",
      {
        name: "Cut to 80",
        metric: "bodyweight",
        start: 84,
        target: 80,
        goalRules: 2,
      },
      addDays(today, -10),
    );
    const read = () => ({
      shown: bodyweight(r.journal("measurement"), r.profile()),
      goal: evaluate(
        (r.journal("goal") as Goal[])[0]!,
        goalSources(r, today, "kg"),
      ),
    });
    // Before: the profile weight, labelled as such by Home and You; the goal
    // has no weigh-in.
    expect(read().shown).toEqual({ value: 90, unit: "kg" });
    expect(read().goal.current).toBeUndefined();
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Not now" }));
    await fireEvent.press(
      view.getByRole("button", { name: "Log measurement" }),
    );
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "82");
    await fireEvent.press(view.getByLabelText("Save measurement"));
    expect(read().shown).toEqual({ value: 82, unit: "kg", date: today });
    expect(read().goal.current).toBe("82 kg · Today");
    // Edit.
    await view.rerender(<JournalScreen />);
    await fireEvent.press(
      view.getByLabelText(/^Bodyweight, 82 kg, Today\. Edit$/),
    );
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "81.5");
    await fireEvent.press(view.getByLabelText("Save changes"));
    expect(read().shown?.value).toBe(81.5);
    expect(read().goal.current).toBe("81.5 kg · Today");
    // Delete, after confirming.
    await view.rerender(<JournalScreen />);
    await fireEvent.press(
      view.getByLabelText("Options for Bodyweight on Today"),
    );
    await fireEvent.press(view.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled(), { timeout: 3000 });
    expect(r.journal("measurement")).toHaveLength(1);
    jest.mocked(confirm).mock.calls.at(-1)![2]!();
    expect(read().shown).toEqual({ value: 90, unit: "kg" });
    expect(read().goal.current).toBeUndefined();
  } finally {
    db.close();
  }
});

test("compact screens, large text and light mode", async () => {
  const { r, db } = setup();
  try {
    m(r, "Bodyweight", 82, "kg", addDays(today, -3));
    m(r, "Bodyweight", 81.5, "kg", today, {
      notes: "After a long weekend away",
    });
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(<JournalScreen />);
    const row = view.getByLabelText(
      /^Bodyweight, 81\.5 kg, Today, After a long weekend away\. Edit$/,
    );
    expect(
      Number(StyleSheet.flatten(row.props.style).minHeight),
    ).toBeGreaterThanOrEqual(44);
    const name = within(row).getByText("Bodyweight");
    expect(name.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(name.props.style).color).toBe(
      theme.palettes.light.text,
    );
    // The note is shown in full, not cut off.
    expect(
      within(row).getByText("After a long weekend away").props.numberOfLines,
    ).toBeUndefined();
    const log = view.getByRole("button", { name: "Log measurement" });
    expect(
      Number(StyleSheet.flatten(log.props.style).minHeight),
    ).toBeGreaterThanOrEqual(44);
    expect(view.getByLabelText("Options for Bodyweight on Today")).toBeTruthy();
  } finally {
    db.close();
  }
});
