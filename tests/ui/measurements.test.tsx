import React from "react";
import { Alert } from "react-native";
import {
  render,
  fireEvent,
  act,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import JournalScreen from "../../src/screens/Journal";
import Progress from "../../app/(tabs)/progress";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";
import { PROFILE_WEIGHT_OFFER } from "../../src/domain/measurements";

// Phase 7B WP4B: the Measurements screen, its log/edit sheet, the one-time
// profile weight offer and the scoped Progress → Body chart fix.

jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
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

type AlertButton = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const pressAlert = (title: string, button: string) => {
  const call = alert.mock.calls.filter(([t]) => t === title).at(-1);
  if (!call) throw new Error(`No "${title}" alert`);
  (call[2] as AlertButton[]).find((b) => b.text === button)!.onPress?.();
};
beforeEach(() => jest.clearAllMocks());

const today = localDate();
const yesterday = addDays(today, -1);
type Repo = ReturnType<typeof pathRepository>["r"];
function setup(profile: Parameters<Repo["saveProfile"]>[0] = {}) {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}
const m = (
  r: Repo,
  name: string,
  value: number,
  unit: string,
  date: string,
  extra = {},
) => r.addJournal("measurement", { name, value, unit, ...extra }, date);
const data = (r: Repo) => r.journal("measurement").map((e) => e.data);
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
const openLog = (view: RenderResult) =>
  fireEvent.press(view.getByRole("button", { name: "Log measurement" }));

test("a first weigh-in takes a few taps, accepts a comma, saves once and can be undone", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Track how your body changes")).toBeTruthy();
    await openLog(view);
    expect(view.getByRole("header", { name: "Log measurement" })).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "81,5");
    await pressTwiceInOneFrame(view, "Save measurement");
    expect(data(r)).toEqual([{ name: "Bodyweight", value: 81.5, unit: "kg" }]);
    expect(r.journal("measurement")[0]!.date).toBe(today);
    expect(view.getByText("Saved Bodyweight 81.5 kg")).toBeTruthy();
    expect(view.getAllByText("81.5 kg").length).toBeGreaterThan(0);
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(data(r)).toEqual([]);
  } finally {
    db.close();
  }
});

test("pounds and inches are typed in the lifter's units and stored as kg and cm", async () => {
  const { r, db } = setup({ units: "lb" });
  try {
    const view = await render(<JournalScreen />);
    await openLog(view);
    await fireEvent.changeText(view.getByLabelText("Bodyweight (lb)"), "180");
    await fireEvent.press(
      view.getByLabelText("Save and add another measurement"),
    );
    expect(view.getByText(/Choose the next measurement/)).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Waist" }));
    await fireEvent.changeText(view.getByLabelText("Waist (in)"), "33");
    await fireEvent.press(view.getByLabelText("Save measurement"));
    const [waist, weight] = data(r);
    expect(weight!.unit).toBe("kg");
    expect(Number(weight!.value)).toBeCloseTo(81.6466, 4);
    expect(waist).toEqual({ name: "Waist", value: 83.82, unit: "cm" });
    expect(view.getAllByText("180 lb").length).toBeGreaterThan(0);
    expect(view.getAllByText("33 in").length).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});

test("a past day is chosen from a calendar; errors are explained plainly", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openLog(view);
    await fireEvent.press(view.getByLabelText("Save measurement"));
    expect(view.getByText("Enter a number, e.g. 81.5")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "abc");
    await fireEvent.press(view.getByLabelText("Save measurement"));
    expect(view.getByText("Enter a number, e.g. 81.5")).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "82");
    await fireEvent.press(view.getByLabelText("Day, Today. Change day"));
    await fireEvent.press(
      view.getByRole("button", { name: dayLabel(yesterday) }),
    );
    await fireEvent.press(
      view.getByLabelText(`Choose for ${dayLabel(yesterday)}`),
    );
    await fireEvent.press(view.getByLabelText("Save measurement"));
    expect(r.journal("measurement")[0]!.date).toBe(yesterday);
  } finally {
    db.close();
  }
});

test("an unusual value asks first but can still be saved", async () => {
  const { r, db } = setup();
  try {
    m(r, "Bodyweight", 82, "kg", yesterday);
    const view = await render(<JournalScreen />);
    await openLog(view);
    await fireEvent.changeText(view.getByLabelText("Bodyweight (kg)"), "60");
    await fireEvent.press(view.getByLabelText("Save measurement"));
    expect(alert.mock.calls.at(-1)![1]).toMatch(
      /22 kg less than your last entry \(82 kg\)/,
    );
    expect(r.journal("measurement")).toHaveLength(1);
    await act(async () => pressAlert("Check this value", "Save anyway"));
    expect(r.journal("measurement")).toHaveLength(2);
  } finally {
    db.close();
  }
});

test("an untouched edit writes nothing; an edit changes only what changed", async () => {
  const { r, db } = setup({ units: "lb" });
  try {
    const original = m(r, "Waist", 84, "cm", yesterday, {
      custom: 7,
      flag: true,
    });
    const outbox = r.outbox().length;
    const view = await render(<JournalScreen />);
    await fireEvent.press(
      view.getByLabelText(/^Waist, 33.1 in, Yesterday\. Edit$/),
    );
    expect(view.getByRole("header", { name: "Edit Waist" })).toBeTruthy();
    expect(view.getByLabelText("Waist (in)").props.value).toBe("33.07");
    await fireEvent.press(view.getByLabelText("Save changes"));
    const [same] = r.journal("measurement");
    expect(same).toEqual(original);
    expect(r.outbox()).toHaveLength(outbox);
    await fireEvent.press(
      view.getByLabelText(/^Waist, 33.1 in, Yesterday\. Edit$/),
    );
    await fireEvent.changeText(view.getByLabelText("Waist (in)"), "33");
    await fireEvent.press(view.getByLabelText("Save changes"));
    const [changed] = r.journal("measurement");
    expect(changed!.data).toEqual({
      name: "Waist",
      value: 83.82,
      unit: "cm",
      custom: 7,
      flag: true,
    });
    expect(changed!.id).toBe(original.id);
    expect(changed!.createdAt).toBe(original.createdAt);
  } finally {
    db.close();
  }
});

test("delete names what is removed and asks first", async () => {
  const { r, db } = setup();
  try {
    m(r, "Bodyweight", 81.7, "kg", today);
    const view = await render(<JournalScreen />);
    await fireEvent.press(
      view.getByLabelText("Options for Bodyweight on Today"),
    );
    await fireEvent.press(view.getByRole("menuitem", { name: "Delete" }));
    await waitFor(
      () =>
        expect(jest.mocked(confirm)).toHaveBeenCalledWith(
          "Delete measurement?",
          "Bodyweight 81.7 kg from Today will be removed.",
          expect.any(Function),
          { action: "Delete measurement" },
        ),
      { timeout: 3000 },
    );
    expect(r.journal("measurement")).toHaveLength(1);
    jest.mocked(confirm).mock.calls[0]![2]!();
    expect(r.journal("measurement")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("the overview groups spellings, compares real entries and opens each measurement", async () => {
  const { r, db } = setup();
  try {
    m(r, "Bodyweight", 84.2, "kg", addDays(today, -56));
    m(r, "Body weight", 83.1, "kg", addDays(today, -28), { notes: "Fasted" });
    m(r, "Bodyweight", 82.0, "kg", yesterday);
    m(r, "Bodyweight", 81.7, "kg", today);
    m(r, "Waist", 86, "cm", addDays(today, -56));
    m(r, "Waist", 83.5, "cm", today);
    m(r, "Right arm (flexed)", 38.2, "cm", addDays(today, -14));
    const view = await render(<JournalScreen />);
    expect(view.getAllByText("81.7 kg").length).toBeGreaterThan(0);
    expect(view.getByText("−0.3 kg since Yesterday")).toBeTruthy();
    expect(view.getByText("−2.5 kg in 3 months")).toBeTruthy();
    // "Body weight" belongs to the same series.
    expect(view.queryByText("Body weight", { exact: true })).toBeTruthy(); // in history
    expect(view.getByLabelText(/^Waist, 83.5 cm, −2.5 cm since/)).toBeTruthy();
    expect(
      view.getByLabelText(/^Right arm \(flexed\), 38.2 cm, Logged /),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(/^Waist, 83.5 cm, −2.5 cm since/),
    );
    expect(view.getByRole("header", { name: "Waist" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Log Waist" })).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(view.getByRole("header", { name: "Measurements" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("the profile weight is offered once, only when no weigh-in exists", async () => {
  const { r, db } = setup({ weight: 82 });
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Your profile weight is 82 kg.")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText("Log profile weight as first weigh-in"),
    );
    expect(data(r)).toEqual([{ name: "Bodyweight", value: 82, unit: "kg" }]);
    expect(r.journal("measurement")[0]!.date).toBe(today);
    expect(r.setting(PROFILE_WEIGHT_OFFER)).toBe("settled");
    expect(r.profile().weight).toBe(82);
    // Removing the weigh-in doesn't bring the offer back.
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    await view.rerender(<JournalScreen />);
    expect(view.queryByText("Your profile weight is 82 kg.")).toBeNull();
  } finally {
    db.close();
  }
});

test("dismissing the offer never blocks logging a weight by hand", async () => {
  const { r, db } = setup({ weight: 82, units: "lb" });
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Your profile weight is 180.8 lb.")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Not now" }));
    await view.rerender(<JournalScreen />);
    expect(view.queryByText(/Your profile weight/)).toBeNull();
    expect(r.journal("measurement")).toHaveLength(0);
    await openLog(view);
    await fireEvent.changeText(view.getByLabelText("Bodyweight (lb)"), "181");
    await fireEvent.press(view.getByLabelText("Save measurement"));
    expect(r.journal("measurement")).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("no offer with an existing weigh-in or without a profile weight", async () => {
  const a = setup({ weight: 82 });
  try {
    m(a.r, "Body weight", 80, "kg", yesterday);
    const view = await render(<JournalScreen />);
    expect(view.queryByText(/Your profile weight/)).toBeNull();
  } finally {
    a.db.close();
  }
  const b = setup({ weight: 0 });
  try {
    const view = await render(<JournalScreen />);
    expect(view.queryByText(/Your profile weight/)).toBeNull();
  } finally {
    b.db.close();
  }
});

test("Progress → Body: variants share a series, one point a day, and switching shows the latest", async () => {
  const { r, db } = setup();
  try {
    m(r, "Bodyweight", 84.2, "kg", addDays(today, -42));
    m(r, "Body weight", 83.1, "kg", addDays(today, -28));
    m(r, "Bodyweight", 82.4, "kg", addDays(today, -14));
    m(r, "Bodyweight", 82.6, "kg", yesterday);
    const later = m(r, "Bodyweight", 82.0, "kg", yesterday); // same day
    db.prepare("UPDATE journal SET created_at=created_at+1000 WHERE id=?").run(
      later.id,
    );
    m(r, "Waist", 86, "cm", addDays(today, -56));
    m(r, "Waist", 85, "cm", addDays(today, -40));
    m(r, "Waist", 84.5, "cm", addDays(today, -28));
    m(r, "Waist", 83.5, "cm", today);
    const view = await render(<Progress />);
    // 7.4D: bodyweight has its own card; the other measurements keep theirs.
    const waist = () => view.getByLabelText("Waist trend");
    expect(view.getByText("83.5 cm")).toBeTruthy();
    // Select an older Waist point.
    await act(async () =>
      waist().props.onAccessibilityAction({
        nativeEvent: { actionName: "decrement" },
      }),
    );
    expect(view.getByText("84.5 cm")).toBeTruthy();
    // Spelling variants share the bodyweight series, one point a day, and
    // the latest entry of the day counts.
    const chart = () => view.getByLabelText("Bodyweight trend");
    expect(view.getByText("82 kg")).toBeTruthy();
    expect(chart().props.accessibilityValue.text).toBe(
      `82 kg, ${dayLabel(yesterday)} · 2 entries`,
    );
    expect(view.queryByRole("button", { name: "Body weight" })).toBeNull();
    expect(view.queryByRole("button", { name: "Bodyweight" })).toBeNull();
    // Four days for Bodyweight: the same-day pair is one point.
    for (let i = 0; i < 3; i++)
      await act(async () =>
        chart().props.onAccessibilityAction({
          nativeEvent: { actionName: "decrement" },
        }),
      );
    expect(chart().props.accessibilityValue.text).toMatch(/^84.2 kg/);
  } finally {
    db.close();
  }
});
