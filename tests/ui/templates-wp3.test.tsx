import React from "react";
import { Alert } from "react-native";
import type { TestInstance } from "test-renderer";
import {
  render,
  fireEvent,
  waitFor,
  act,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import { router } from "expo-router";
import Templates from "../../app/templates";
import { useRepo, confirm } from "../../src/state";
import { notifyAt } from "../../src/notifications";
import { pathRepository } from "../path-fixture";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";
import { lbToKg } from "../../src/domain/metrics";
import { localDate, type Prescription } from "../../src/domain/types";

// Phase 7B WP3: the template library, editor, units and scheduling.

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
const mockParams: { edit?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

type AlertButton = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const pressAlert = (title: string, button: string) => {
  const call = alert.mock.calls.filter(([t]) => t === title).at(-1);
  if (!call) throw new Error(`No "${title}" alert`);
  const choice = (call[2] as AlertButton[]).find((b) => b.text === button);
  if (!choice) throw new Error(`No "${button}" in "${title}"`);
  choice.onPress?.();
};
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.edit;
});

type Repo = ReturnType<typeof pathRepository>["r"];
const bench: Prescription = {
  exerciseId: "barbell-bench-press",
  sets: 3,
  reps: 6,
  repMax: 8,
  weight: 60,
  rest: 120,
};
const row: Prescription = {
  exerciseId: "barbell-bent-over-row",
  sets: 3,
  reps: 10,
  weight: 50,
  rest: 90,
};
const squat: Prescription = {
  exerciseId: "back-squat",
  sets: 5,
  reps: 5,
  weight: 100,
  rest: 180,
};

async function menu(view: RenderResult, label: string, item: string) {
  await fireEvent.press(view.getByLabelText(label));
  await fireEvent.press(view.getByRole("menuitem", { name: item }));
}

// ---- Library ------------------------------------------------------------------

test("an empty library explains templates and offers one clear action", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(view.getByText("No templates yet")).toBeTruthy();
    expect(view.getByLabelText("Create template")).toBeTruthy();
    // No date box anywhere: scheduling belongs to a template.
    expect(view.queryByLabelText(/Schedule date/)).toBeNull();
    expect(view.queryByText("Scheduled")).toBeNull();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("each template shows what it holds, starts in one tap and keeps the rest in its menu", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate("Upper A", [bench, row, squat]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(view.getByText("1 template")).toBeTruthy();
    expect(
      view.getByText(
        "3 exercises · 11 sets\nBarbell Bench Press, Barbell Bent-Over Row, Back Squat",
      ),
    ).toBeTruthy();
    // Only Start sits on the row; Edit, Duplicate and Delete are in •••.
    expect(view.queryByRole("button", { name: "Duplicate" })).toBeNull();
    await fireEvent.press(view.getByLabelText("Options for Upper A"));
    expect(
      view.getAllByRole("menuitem").map((i) => i.props.accessibilityLabel),
    ).toEqual(["Edit", "Schedule…", "Duplicate", "Delete"]);
    await fireEvent.press(view.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(r.templates()).toHaveLength(2));
    const copy = r.templates().find((x) => x.name === "Upper A copy")!;
    expect(copy.exercises).toEqual(t.exercises);
    expect(copy.id).not.toBe(t.id);

    await fireEvent.press(view.getByLabelText("Start Upper A"));
    expect(r.active()!.templateId).toBe(t.id);
    expect(router.push).toHaveBeenCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("Delete still asks, then removes only that template", async () => {
  const { r, db } = pathRepository();
  try {
    const keep = r.saveTemplate("Keep", [bench]);
    r.saveTemplate("Remove me", [row]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await menu(view, "Options for Remove me", "Delete");
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "Delete template?",
        "Completed workouts are preserved. Planned sessions will need a new template.",
        expect.any(Function),
      ),
    );
    expect(r.templates()).toHaveLength(2);
    jest.mocked(confirm).mock.calls[0]![2]();
    expect(r.templates().map((t) => t.id)).toEqual([keep.id]);
  } finally {
    db.close();
  }
});

test("while a workout is in progress, Start is unavailable and Resume is offered", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveTemplate("Upper A", [bench]);
    r.startWorkout("Freestyle");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(
      view.getByLabelText("Start Upper A").props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(view.getByLabelText("Start Upper A"));
    expect(r.workouts()).toHaveLength(1);
    await fireEvent.press(view.getByLabelText("Resume Freestyle"));
    expect(router.push).toHaveBeenCalledWith("/workout");
  } finally {
    db.close();
  }
});

// ---- Editor -------------------------------------------------------------------

test("creating a template uses steppers, then saves exactly once and reopens the same", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ rest: 90 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Create template"));
    expect(view.getByText("New template")).toBeTruthy();
    // Nothing to save yet.
    expect(
      view.getByRole("button", { name: "Save template" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.changeText(view.getByLabelText("Template name"), "Push A");
    await fireEvent.press(view.getByLabelText("Add exercise"));
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "bench",
    );
    await fireEvent.press(view.getByLabelText("Add Barbell Bench Press"));
    // The new exercise opens with its controls.
    await fireEvent.press(view.getByLabelText("Increase Sets"));
    await fireEvent.press(view.getByLabelText("Decrease Reps"));
    await fireEvent.press(view.getByLabelText("Decrease Reps"));
    await fireEvent.press(view.getByLabelText("Increase Up to reps"));
    await fireEvent.press(view.getByLabelText("Increase Up to reps"));
    await fireEvent.press(view.getByLabelText("Increase Rest"));
    const load = view.getByLabelText("Barbell Bench Press load (kg)");
    await fireEvent(load, "focus");
    await fireEvent.changeText(load, "62.5");
    await fireEvent.press(
      view.getByLabelText("Increase Barbell Bench Press load (kg) by 2.5"),
    );
    // Screen readers adjust a stepper directly.
    await fireEvent(view.getByLabelText("Sets"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    const save = view.getByRole("button", { name: "Save template" });
    const { handler } = findEventHandler(save, "press", { bubbles: true });
    await act(async () => {
      handler!({ nativeEvent: {} });
      handler!({ nativeEvent: {} });
    });
    expect(r.templates()).toHaveLength(1);
    const saved = r.templates()[0]!;
    expect(saved.name).toBe("Push A");
    expect(saved.exercises).toEqual([
      {
        exerciseId: "barbell-bench-press",
        sets: 5,
        reps: 8,
        repMax: 10,
        weight: 65,
        rest: 105,
      },
    ]);
    expect(view.queryByText("New template")).toBeNull();
    // Reopening shows what was saved.
    await fireEvent.press(view.getByLabelText("Edit Push A"));
    expect(view.getByText("Edit template")).toBeTruthy();
    expect(view.getByText("5 × 8–10 · 65 kg · 1:45 rest")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a pound user edits in pounds; 135 lb is stored as about 61.23 kg", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ units: "lb" });
    const t = r.saveTemplate("Push", [{ ...bench, weight: lbToKg(135) }]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(view.queryByText(/kg/)).toBeNull();
    await fireEvent.press(view.getByLabelText("Edit Push"));
    expect(view.getByText("3 × 6–8 · 135 lb · 2:00 rest")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Barbell Bench Press"));
    const load = view.getByLabelText("Barbell Bench Press load (lb)");
    expect(load.props.value).toBe("135");
    // Saving without touching the load keeps it exactly.
    await fireEvent.press(view.getByLabelText("Increase Sets"));
    await fireEvent.press(view.getByRole("button", { name: "Save template" }));
    const kept = r.templates()[0]!.exercises[0]!.weight;
    expect(kept).toBe(lbToKg(135));
    expect(kept).toBeCloseTo(61.23, 2);
    // Stepping uses 5 lb; storage stays kilograms.
    await fireEvent.press(view.getByLabelText("Edit Push"));
    await fireEvent.press(view.getByLabelText("Barbell Bench Press"));
    await fireEvent.press(
      view.getByLabelText("Increase Barbell Bench Press load (lb) by 5"),
    );
    await fireEvent.press(view.getByRole("button", { name: "Save template" }));
    expect(r.templates()[0]!.exercises[0]!.weight).toBeCloseTo(lbToKg(140), 6);
    await fireEvent.press(view.getByLabelText("Edit Push"));
    await fireEvent.press(view.getByLabelText("Barbell Bench Press"));
    expect(
      view.getByLabelText("Barbell Bench Press load (lb)").props.value,
    ).toBe("140");
    expect(r.templates()[0]!.id).toBe(t.id);
    expect(r.templates()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("removing and reordering exercises keeps every other value", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate("Full", [bench, row, squat]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Edit Full"));
    // Move squat to the top through the reorder sheet.
    await fireEvent.press(view.getByLabelText("Reorder exercises"));
    await fireEvent.press(view.getByLabelText("3. Back Squat"));
    await fireEvent.press(view.getByLabelText("Move Back Squat to top"));
    await fireEvent.press(view.getByLabelText("Done reordering"));
    // Remove the row: asks first; Keep changes nothing.
    await fireEvent.press(view.getByLabelText("Barbell Bent-Over Row"));
    await fireEvent.press(view.getByLabelText("Remove Barbell Bent-Over Row"));
    pressAlert("Remove Barbell Bent-Over Row?", "Keep");
    expect(view.getByLabelText("Barbell Bent-Over Row")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Remove Barbell Bent-Over Row"));
    pressAlert("Remove Barbell Bent-Over Row?", "Remove");
    await waitFor(() =>
      expect(view.queryByLabelText("Barbell Bent-Over Row")).toBeNull(),
    );
    // Nothing is stored until Save.
    expect(r.templates()[0]!.exercises).toEqual(t.exercises);
    await fireEvent.press(view.getByRole("button", { name: "Save template" }));
    expect(r.templates()[0]!.exercises).toEqual([squat, bench]);
    expect(r.templates()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("Add exercise and Reorder open inside the editor sheet (iOS presents nested modals only)", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveTemplate("Full", [bench, row]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Edit Full"));
    const openModals = () =>
      view.container.queryAll((n) => n.type === "Modal" && n.props.visible);
    const insideAnotherModal = (node: TestInstance) => {
      for (let p = node.parent; p; p = p.parent)
        if (p.type === "Modal") return true;
      return false;
    };
    expect(openModals()).toHaveLength(1);
    await fireEvent.press(view.getByLabelText("Add exercise"));
    expect(openModals()).toHaveLength(2);
    expect(openModals().filter(insideAnotherModal)).toHaveLength(1);
    await fireEvent.press(view.getAllByLabelText("Close").at(-1)!);
    await fireEvent.press(view.getByLabelText("Reorder exercises"));
    expect(openModals()).toHaveLength(2);
    expect(openModals().filter(insideAnotherModal)).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("Cancel asks before discarding edits and leaves the template unchanged", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate("Upper A", [bench]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    // No changes: Cancel closes without asking.
    await fireEvent.press(view.getByLabelText("Edit Upper A"));
    await fireEvent.press(view.getByLabelText("Cancel"));
    expect(alert).not.toHaveBeenCalled();
    expect(view.queryByText("Edit template")).toBeNull();
    // With changes: Cancel asks; Keep editing keeps them.
    await fireEvent.press(view.getByLabelText("Edit Upper A"));
    await fireEvent.press(view.getByLabelText("Barbell Bench Press"));
    await fireEvent.press(view.getByLabelText("Increase Sets"));
    await fireEvent.press(view.getByLabelText("Cancel"));
    pressAlert("Discard changes?", "Keep editing");
    expect(view.getByText("Edit template")).toBeTruthy();
    // The × asks too, then Discard closes.
    await fireEvent.press(view.getByLabelText("Close"));
    pressAlert("Discard changes?", "Discard");
    await waitFor(() => expect(view.queryByText("Edit template")).toBeNull());
    expect(r.templates()).toEqual([t]);
  } finally {
    db.close();
  }
});

test("Train's Edit link opens that template's editor", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate("Upper A", [bench]);
    r.saveTemplate("Lower A", [squat]);
    mockParams.edit = t.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(view.getByText("Edit template")).toBeTruthy();
    expect(view.getByLabelText("Template name").props.value).toBe("Upper A");
  } finally {
    db.close();
  }
});

// ---- Scheduling -----------------------------------------------------------------

// Pinned "now" for the scheduling tests, restored after each test (without
// touching the Alert spy shared by every test).
const realNow = Date.now;
function fixToday(date: string) {
  const at = new Date(`${date}T23:30:00`).getTime();
  Date.now = () => at;
}
afterEach(() => {
  Date.now = realNow;
});

test("scheduling picks a day from a calendar and writes the same planned record", async () => {
  const { r, db } = pathRepository();
  try {
    // Late in the evening: the chosen day must not slip by a day.
    fixToday("2026-10-23");
    const t = r.saveTemplate("Upper A", [bench]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await menu(view, "Options for Upper A", "Schedule…");
    await waitFor(() =>
      expect(
        view.getByRole("header", { name: "Schedule workout" }),
      ).toBeTruthy(),
    );
    expect(view.getByText("October 2026")).toBeTruthy();
    // Today is selected; earlier days can't be chosen.
    expect(
      view.getByRole("button", { name: `${dayLabel("2026-10-23")}, today` })
        .props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      view.getByRole("button", { name: dayLabel("2026-10-22") }).props
        .accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(view.getByLabelText("Previous month"));
    expect(view.getByText("October 2026")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Next month"));
    expect(view.getByText("November 2026")).toBeTruthy();
    await fireEvent.press(view.getByLabelText(dayLabel("2026-11-02")));
    const schedule = view.getByLabelText(
      `Schedule for ${dayLabel("2026-11-02")}`,
    );
    const { handler } = findEventHandler(schedule, "press", { bubbles: true });
    await act(async () => {
      handler!({ nativeEvent: {} });
      handler!({ nativeEvent: {} });
    });
    const planned = r.journal("schedule");
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({
      date: "2026-11-02",
      data: { name: "Upper A", templateId: t.id },
    });
    expect(Object.keys(planned[0]!.data).sort()).toEqual([
      "name",
      "templateId",
    ]);
    expect(notifyAt).toHaveBeenCalledWith(
      "Planned workout",
      "Upper A",
      new Date("2026-11-02T09:00:00").getTime(),
    );
    await waitFor(() =>
      expect(
        view.queryByRole("header", { name: "Schedule workout" }),
      ).toBeNull(),
    );
    // The planned session is listed with its day.
    expect(view.getByText("Scheduled")).toBeTruthy();
    expect(
      view.getByLabelText(`Upper A, ${dayLabel("2026-11-02")}`),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("closing the date picker schedules nothing", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveTemplate("Upper A", [bench]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await menu(view, "Options for Upper A", "Schedule…");
    await waitFor(() =>
      expect(
        view.getByRole("header", { name: "Schedule workout" }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      view.getByLabelText(dayLabel(addDays(localDate(), 1))),
    );
    await fireEvent.press(view.getByLabelText("Close"));
    expect(r.journal("schedule")).toHaveLength(0);
    expect(notifyAt).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("planned sessions start, and removing one still asks first", async () => {
  const { r, db } = pathRepository();
  try {
    const today = localDate();
    const t = r.saveTemplate("Upper A", [bench]);
    const entry = r.addJournal(
      "schedule",
      { name: t.name, templateId: t.id },
      today,
    );
    r.addJournal(
      "schedule",
      { name: t.name, templateId: t.id },
      addDays(today, -2),
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(view.getByText(/^Today$/)).toBeTruthy();
    expect(
      view.getByText(`Past · ${dayLabel(addDays(today, -2))}`),
    ).toBeTruthy();
    await menu(
      view,
      `Options for Upper A, ${dayLabel(today)}`,
      "Remove from schedule",
    );
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "Remove planned session?",
        "Your recorded workouts will remain.",
        expect.any(Function),
      ),
    );
    jest.mocked(confirm).mock.calls[0]![2]();
    expect(r.journal("schedule").map((j) => j.id)).not.toContain(entry.id);
    await view.rerender(<Templates />);
    await fireEvent.press(view.getByLabelText("Start planned session"));
    expect(r.active()!.templateId).toBe(t.id);
    expect(router.push).toHaveBeenCalledWith("/workout");
  } finally {
    db.close();
  }
});
