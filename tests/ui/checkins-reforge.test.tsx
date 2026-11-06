import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";
import { theme } from "../../src/theme";

// Phase 7.5G.2: Recovery in REFORGE, with the same organization and
// behaviour (covered by checkins.test, unchanged).

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
  useLocalSearchParams: () => ({ kind: "recovery" }),
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
function setup() {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const add = (r: Repo, date: string, extra: Record<string, unknown> = {}) =>
  r.addJournal(
    "recovery",
    { sleep: 7.5, quality: 4, soreness: 2, energy: 4, stress: 2, ...extra },
    date,
  );
const flat = (n: { props: { style?: unknown } }) =>
  StyleSheet.flatten(n.props.style as never) as Record<string, unknown>;

test("the approved order stays: Today, Trends, then History by month", async () => {
  const { r, db } = setup();
  try {
    add(r, addDays(today, -2));
    add(r, today, { notes: "Felt fresh" });
    const view = await render(<JournalScreen />);
    expect(view.getByRole("header", { name: "Recovery" })).toBeTruthy();
    const order = ["recovery-today", "recovery-trends"];
    const seen: string[] = [];
    for (const n of view.container.queryAll((n) =>
      order.includes(n.props.testID as string),
    ))
      if (!seen.includes(n.props.testID as string))
        seen.push(n.props.testID as string);
    expect(seen).toEqual(order);
    expect(view.getByText("History")).toBeTruthy();
    // Today: what was recorded, row by row, with no score.
    const card = within(view.getByTestId("recovery-today"));
    expect(card.getByText("Today")).toBeTruthy();
    expect(card.getByText("7 h 30 m")).toBeTruthy();
    expect(card.getByText("4 · Good")).toBeTruthy();
    expect(card.getByText("“Felt fresh”")).toBeTruthy();
    expect(view.queryByText(/score|%|\/ ?100/i)).toBeNull();
    // The footer action is the same.
    expect(
      view.getByRole("button", { name: "Update today's check-in" }),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("trends: the REFORGE chart shows the recorded days in order; ranges are spoken", async () => {
  const { r, db } = setup();
  try {
    add(r, addDays(today, -6), { sleep: 6 });
    add(r, addDays(today, -3), { sleep: 7 });
    add(r, today, { sleep: 8.25 });
    const view = await render(<JournalScreen />);
    const trends = within(view.getByTestId("recovery-trends"));
    expect(trends.getByRole("tab", { name: "1 month" })).toBeTruthy();
    const chart = view.getByRole("adjustable", { name: "Sleep, 3 days" });
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(chart.props.accessibilityValue.text);
      await act(async () =>
        fireEvent(chart, "accessibilityAction", {
          nativeEvent: { actionName: "decrement" },
        }),
      );
    }
    expect(seen).toEqual([
      `8 h 15 m, ${dayLabel(today)}`,
      `7 h, ${dayLabel(addDays(today, -3))}`,
      `6 h, ${dayLabel(addDays(today, -6))}`,
    ]);
    // Switching the metric keeps its scale explained.
    await fireEvent.press(trends.getByRole("button", { name: "Soreness" }));
    expect(trends.getByText("1 None · 5 Severe")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("history: same-day check-ins stay separate with their times; long notes are not cut", async () => {
  const { r, db } = setup();
  try {
    const long =
      "Slept badly after a late session; legs heavy, shoulders fine, will keep today light and see how it goes tomorrow.";
    add(r, addDays(today, -1), { notes: long });
    add(r, today);
    add(r, today, { soreness: 1 });
    const view = await render(<JournalScreen />);
    expect(view.getAllByLabelText(/^Today · .*\. Edit$/)).toHaveLength(2);
    const row = view.getByLabelText(/^Yesterday\. .*\. Edit$/);
    const note = within(row).getByText(`“${long}”`);
    expect(note.props.numberOfLines).toBeUndefined();
    expect(Number(flat(row).minHeight)).toBeGreaterThanOrEqual(44);
    expect(view.getByLabelText("Options for Yesterday")).toBeTruthy();
    await fireEvent.press(row);
    expect(
      view.getByRole("header", { name: "Edit Yesterday's check-in" }),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("the sheet: chosen answers are ember, 48 pt; sleep steps keep their labels; Cancel writes nothing", async () => {
  const { r, db } = setup();
  try {
    const entry = add(r, addDays(today, -1));
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Yesterday\. .*\. Edit$/));
    const group = view.getByLabelText("Soreness, 1 None to 5 Severe");
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    const chosen = radios.find((x) => x.props.accessibilityState.selected)!;
    expect(chosen.props.accessibilityLabel).toBe("2, Mild");
    expect(flat(chosen).borderColor).toBe(theme.colors.emberHot);
    for (const x of radios)
      expect(Number(flat(x).minHeight)).toBeGreaterThanOrEqual(48);
    const other = radios.find((x) => !x.props.accessibilityState.selected)!;
    expect(flat(other).borderColor).toBe(theme.colors.cardBorder);
    // Sleep stepper: same labels, comfortable targets.
    for (const label of ["Less sleep", "More sleep"])
      expect(view.getByLabelText(label)).toBeTruthy();
    await fireEvent.press(radios[3]!);
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(r.journal("recovery")[0]!.data).toEqual(entry.data);
  } finally {
    db.close();
  }
});

test("empty state, compact screens, large text and light mode", async () => {
  const empty = setup();
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Track how you sleep and feel")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Log check-in" }));
    expect(view.getByText("Not set")).toBeTruthy();
    expect(view.queryByText(/^0 h/)).toBeNull();
    await view.unmount();
  } finally {
    empty.db.close();
  }
  const { r, db } = setup();
  try {
    add(r, today);
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(<JournalScreen />);
    const card = within(view.getByTestId("recovery-today"));
    expect(flat(card.getByText("7 h 30 m")).color).toBe(
      theme.palettes.light.text,
    );
    const log = view.getByRole("button", { name: "Update today's check-in" });
    expect(Number(flat(log).minHeight)).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});
