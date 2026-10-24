import React from "react";
import { Alert } from "react-native";
import {
  render,
  fireEvent,
  act,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";

// Phase 7B WP4C: the Recovery screen, its check-in sheet, trends and history.

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
  useLocalSearchParams: () => ({ kind: "recovery" }),
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
function setup() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}
const base = { sleep: 7.5, quality: 4, soreness: 2, energy: 4, stress: 2 };
const add = (r: Repo, date: string, data = {}) =>
  r.addJournal("recovery", { ...base, ...data }, date);
const data = (r: Repo) => r.journal("recovery").map((e) => e.data);
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
const answer = async (view: RenderResult, question: string, n: number) =>
  fireEvent.press(
    within(view.getByLabelText(new RegExp(`^${question}, 1 `))).getByRole(
      "radio",
      { name: new RegExp(`^${n}, `) },
    ),
  );
async function answerAll(view: RenderResult) {
  await fireEvent.press(view.getByLabelText("More sleep"));
  await fireEvent.press(view.getByLabelText("Less sleep"));
  await fireEvent.press(view.getByLabelText("Less sleep"));
  await answer(view, "Sleep quality", 4);
  await answer(view, "Soreness", 2);
  await answer(view, "Energy", 4);
  await answer(view, "Stress", 1);
}

test("a first check-in has nothing prefilled, names what's missing, saves once and can be undone", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Track how you sleep and feel")).toBeTruthy();
    expect(view.queryByText(/\/ ?100/)).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Log check-in" }));
    expect(view.getByRole("header", { name: "Check-in" })).toBeTruthy();
    // Nothing is selected and sleep is not set.
    expect(view.getByText("Not set")).toBeTruthy();
    for (const radio of view.getAllByRole("radio"))
      expect(radio.props.accessibilityState.selected).toBe(false);
    await fireEvent.press(view.getByLabelText("Save check-in"));
    expect(
      view.getByText(
        "Choose last night's sleep, sleep quality, soreness, energy and stress to save this check-in.",
      ),
    ).toBeTruthy();
    expect(r.journal("recovery")).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
    // The first step starts at 8 h; then 15-minute steps.
    await answerAll(view);
    expect(view.getByText("7 h 30 m")).toBeTruthy();
    expect(view.getByText("4 · Good")).toBeTruthy();
    await pressTwiceInOneFrame(view, "Save check-in");
    expect(data(r)).toEqual([
      { sleep: 7.5, quality: 4, soreness: 2, energy: 4, stress: 1 },
    ]);
    expect(r.journal("recovery")[0]!.date).toBe(today);
    expect(view.getByText("Saved Today's check-in")).toBeTruthy();
    expect(
      view.getByRole("button", { name: "Update today's check-in" }),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(data(r)).toEqual([]);
  } finally {
    db.close();
  }
});

test("Today shows what was recorded in words, with no score", async () => {
  const { r, db } = setup();
  try {
    add(r, today, { readiness: 4, restDay: "yes", notes: "Legs heavy" });
    const view = await render(<JournalScreen />);
    const card = view.getByLabelText(/^Today's check-in\. /);
    expect(card.props.accessibilityLabel).toBe(
      "Today's check-in. Sleep 7 hours 30 minutes. Sleep quality 4, Good. Soreness 2, Mild. Energy 4, High. Stress 2, Low. Ready to train 4, Mostly. Rest day Yes. Note: Legs heavy",
    );
    expect(view.queryByText(/100/)).toBeNull();
    expect(view.queryByText(/Readiness/)).toBeNull();
    expect(view.getByText("Checked in on 1 of the last 30 days")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("an untouched edit writes nothing; an edit changes only the answer changed", async () => {
  const { r, db } = setup();
  try {
    const original = add(r, yesterday, {
      quality: 4.5,
      readiness: 42,
      restDay: "maybe",
      mood: 3,
    });
    const outbox = r.outbox().length;
    const view = await render(<JournalScreen />);
    expect(view.getByText("No check-in today")).toBeTruthy();
    expect(view.getByText("Last check-in: Yesterday")).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/^Yesterday\. Sleep .*\. Edit$/));
    expect(
      view.getByRole("header", { name: "Edit Yesterday's check-in" }),
    ).toBeTruthy();
    // Unusual values are stated as recorded; nothing is selected for them.
    expect(view.getByText("4.5 (recorded)")).toBeTruthy();
    expect(view.getByText("42 (outside 1–5) (recorded)")).toBeTruthy();
    expect(view.getByText('Recorded as "maybe"')).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Save changes"));
    expect(r.journal("recovery")[0]).toEqual(original);
    expect(r.outbox()).toHaveLength(outbox);
    await fireEvent.press(view.getByLabelText(/^Yesterday\. Sleep .*\. Edit$/));
    await answer(view, "Soreness", 3);
    await fireEvent.press(view.getByLabelText("Save changes"));
    const [changed] = r.journal("recovery");
    expect(changed!.data).toEqual({ ...original.data, soreness: 3 });
    expect(changed!.id).toBe(original.id);
    expect(changed!.createdAt).toBe(original.createdAt);
    // Undo restores the earlier answers.
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(r.journal("recovery")[0]!.data).toEqual(original.data);
  } finally {
    db.close();
  }
});

test("a missed day is logged from the calendar; a day with a check-in offers to edit it", async () => {
  const { r, db } = setup();
  try {
    add(r, yesterday);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Log check-in" }));
    expect(view.queryByText(/You already checked in/)).toBeNull();
    await fireEvent.press(view.getByLabelText("Day, Today. Change day"));
    await fireEvent.press(
      view.getByRole("button", { name: dayLabel(yesterday) }),
    );
    await fireEvent.press(
      view.getByLabelText(`Choose for ${dayLabel(yesterday)}`),
    );
    expect(view.getByText(/You already checked in on Yesterday/)).toBeTruthy();
    await answerAll(view);
    await fireEvent.press(view.getByLabelText("Save check-in"));
    expect(r.journal("recovery").map((e) => e.date)).toEqual([
      yesterday,
      yesterday,
    ]);
  } finally {
    db.close();
  }
});

test("same-day check-ins are all kept; Today shows the latest and says so", async () => {
  const { r, db } = setup();
  try {
    const morning = add(r, today, { soreness: 4, notes: "Morning" });
    add(r, today, { soreness: 1, notes: "Evening" });
    db.prepare("UPDATE journal SET created_at=? WHERE id=?").run(
      morning.createdAt - 3_600_000,
      morning.id,
    );
    const view = await render(<JournalScreen />);
    expect(view.getByText("Today · 2 check-ins")).toBeTruthy();
    expect(
      view.getByText("Showing the latest. Earlier ones are in History."),
    ).toBeTruthy();
    expect(
      view.getByLabelText(/^Today's check-in\. .*Soreness 1, None/),
    ).toBeTruthy();
    // History tells them apart by time.
    expect(view.getAllByLabelText(/^Today · .*\. Edit$/)).toHaveLength(2);
    await fireEvent.press(
      view.getByRole("button", { name: "Add another check-in for today" }),
    );
    expect(view.getByText(/You already checked in today/)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("delete asks first, can be undone, and is written when the screen closes", async () => {
  const { r, db } = setup();
  try {
    add(r, yesterday);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Options for Yesterday"));
    await fireEvent.press(view.getByRole("menuitem", { name: "Delete" }));
    await waitFor(
      () =>
        expect(alert).toHaveBeenCalledWith(
          "Delete check-in?",
          "Yesterday's check-in will be removed.",
          expect.any(Array),
        ),
      { timeout: 3000 },
    );
    await act(async () => pressAlert("Delete check-in?", "Delete"));
    expect(view.queryByLabelText(/^Yesterday\. /)).toBeNull();
    expect(view.getByText("Deleted Yesterday's check-in")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(view.getByLabelText(/^Yesterday\. /)).toBeTruthy();
    expect(r.journal("recovery")).toHaveLength(1);
    await fireEvent.press(view.getByLabelText("Options for Yesterday"));
    await fireEvent.press(view.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await act(async () => pressAlert("Delete check-in?", "Delete"));
    expect(r.journal("recovery")).toHaveLength(1);
    await view.unmount();
    expect(r.journal("recovery")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("trends chart real days with an explained scale; history is grouped by month and paged", async () => {
  const { r, db } = setup();
  try {
    for (let d = 0; d < 400; d++)
      if (d % 3 === 0 || d < 10)
        add(r, addDays(today, -d), { sleep: 6 + (d % 4) * 0.5 });
    const total = r.journal("recovery").length;
    const view = await render(<JournalScreen />);
    expect(view.getByText("Trends")).toBeTruthy();
    expect(view.getByText(/^Average .* · \d+ days$/)).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Soreness" }));
    expect(view.getByText("1 None · 5 Severe")).toBeTruthy();
    expect(view.getByText(/^Most often 2 · Mild · \d+ days$/)).toBeTruthy();
    // Only the first 60 check-ins render until asked.
    expect(view.getAllByLabelText(/\. Edit$/)).toHaveLength(60);
    expect(
      view.getByRole("button", { name: `Show earlier (${total - 60})` }),
    ).toBeTruthy();
    expect(view.queryByText(/NaN|undefined/)).toBeNull();
  } finally {
    db.close();
  }
});

test("errors are plain sentences, never raw validation output", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Log check-in" }));
    await answer(view, "Soreness", 2);
    await fireEvent.press(view.getByLabelText("Save check-in"));
    const message = view.getByText(/^Choose /).props.children as string;
    expect(message).toBe(
      "Choose last night's sleep, sleep quality, energy and stress to save this check-in.",
    );
    expect(message).not.toMatch(/[{}"]|code|pattern/);
    expect(r.journal("recovery")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("scale answers are labelled radio buttons with both ends named", async () => {
  const { db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Log check-in" }));
    for (const label of [
      "Sleep quality, 1 Poor to 5 Great",
      "Soreness, 1 None to 5 Severe",
      "Energy, 1 Drained to 5 Energised",
      "Stress, 1 Calm to 5 Very stressed",
      "Ready to train, 1 Not at all to 5 Fully, optional",
    ])
      expect(
        within(view.getByLabelText(label)).getAllByRole("radio"),
      ).toHaveLength(5);
    // The optional rating clears when tapped again.
    await answer(view, "Ready to train", 3);
    expect(view.getByText("3 · Somewhat")).toBeTruthy();
    await answer(view, "Ready to train", 3);
    expect(view.getByText("Optional")).toBeTruthy();
    expect(view.getByLabelText("Last night's sleep")).toBeTruthy();
  } finally {
    db.close();
  }
});
