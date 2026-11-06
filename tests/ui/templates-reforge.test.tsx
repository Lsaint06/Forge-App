import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import Templates from "../../app/templates";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import type { Prescription } from "../../src/domain/types";

// Phase 7.2C-2: the templates screen on the REFORGE secondary-screen frame,
// with search above eight templates. Template behaviour is covered by
// templates-wp3, templates and workout-wp2.

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
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
});

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
const height = (el: { props: { style?: unknown } }) =>
  Number(flat(el).minHeight ?? flat(el).height ?? 0);
const rx = (exerciseId: string): Prescription => ({
  exerciseId,
  sets: 3,
  reps: 8,
  weight: 40,
  rest: 90,
});
type Repo = ReturnType<typeof pathRepository>["r"];
function save(r: Repo, count: number) {
  for (let i = 1; i <= count; i++)
    r.saveTemplate(`Day ${String(i).padStart(2, "0")}`, [
      rx(i === 3 ? "back-squat" : "barbell-bench-press"),
    ]);
}

test("the screen uses the REFORGE frame with one creation action", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(
      view.getByRole("header", { name: "Workout templates" }),
    ).toBeTruthy();
    expect(view.getByText("No templates yet")).toBeTruthy();
    expect(
      view.getByText(/saved as a template from its ••• menu/),
    ).toBeTruthy();
    expect(view.getAllByLabelText("Create template")).toHaveLength(1);
    expect(view.queryByLabelText("Search templates")).toBeNull();
    expect(view.queryByText("Your templates")).toBeNull();
    await fireEvent.press(view.getByLabelText("Create template"));
    expect(view.getByText("New template")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("eight templates show no search; a ninth adds it", async () => {
  const { r, db } = pathRepository();
  try {
    save(r, 8);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    expect(view.getByText("8 templates")).toBeTruthy();
    expect(view.queryByLabelText("Search templates")).toBeNull();
    expect(view.getAllByLabelText(/^Start Day \d+$/)).toHaveLength(8);
    r.saveTemplate("Day 09", [rx("barbell-bench-press")]);
    await view.rerender(<Templates />);
    expect(view.getByLabelText("Search templates")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("search filters by name or exercise, keeps order and can be cleared", async () => {
  const { r, db } = pathRepository();
  try {
    save(r, 12);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    const starts = () =>
      view
        .getAllByLabelText(/^Start Day \d+$/)
        .map((el) => el.props.accessibilityLabel);
    await fireEvent.changeText(view.getByLabelText("Search templates"), "1");
    expect(starts()).toEqual([
      "Start Day 01",
      "Start Day 10",
      "Start Day 11",
      "Start Day 12",
    ]);
    expect(view.getByText("4 of 12")).toBeTruthy();
    // By exercise: only Day 03 holds the squat.
    await fireEvent.changeText(
      view.getByLabelText("Search templates"),
      "squat",
    );
    expect(starts()).toEqual(["Start Day 03"]);
    await fireEvent.changeText(
      view.getByLabelText("Search templates"),
      "deadlift",
    );
    expect(view.getByText("No matching templates")).toBeTruthy();
    expect(view.queryAllByLabelText(/^Start Day/)).toHaveLength(0);
    await fireEvent.press(view.getByLabelText("Show all templates"));
    expect(starts()).toHaveLength(12);
    expect(view.getByLabelText("Search templates").props.value).toBe("");
    expect(view.queryByText(/of 12$/)).toBeNull();
    // The field's own clear control empties the query too.
    await fireEvent.changeText(
      view.getByLabelText("Search templates"),
      "day 0",
    );
    await fireEvent.press(view.getByLabelText("Clear search"));
    expect(starts()).toHaveLength(12);
  } finally {
    db.close();
  }
});

test("rows edit on tap and start in one; actions keep 44 pt, even at large text", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate("A deliberately long template name for wrapping", [
      rx("barbell-bench-press"),
    ]);
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    const edit = view.getByLabelText(`Edit ${t.name}`);
    expect(edit.props.accessibilityHint).toBe(
      "1 exercise · 3 sets\nBarbell Bench Press",
    );
    for (const label of [
      `Edit ${t.name}`,
      `Start ${t.name}`,
      `Options for ${t.name}`,
      "Create template",
      "Back",
    ])
      expect(height(view.getByLabelText(label))).toBeGreaterThanOrEqual(44);
    await fireEvent.press(view.getByLabelText(`Start ${t.name}`));
    expect(r.active()?.templateId).toBe(t.id);
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    await view.rerender(<Templates />);
    // While training: the row's Start waits; the banner resumes.
    expect(
      view.getByLabelText(`Start ${t.name}`).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(view.getByLabelText(`Resume ${t.name}`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Edit ${t.name}`));
    expect(view.getByText("Edit template")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("the editor numbers exercises and opens one at a time", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveTemplate("Full", [
      rx("barbell-bench-press"),
      rx("back-squat"),
      rx("barbell-bent-over-row"),
    ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Edit Full"));
    expect(view.getByText("Exercises · 3")).toBeTruthy();
    for (const n of ["1", "2", "3"]) expect(view.getByText(n)).toBeTruthy();
    const bench = view.getByLabelText("Barbell Bench Press");
    const squat = view.getByLabelText("Back Squat");
    expect(bench.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(bench);
    expect(
      view.getByLabelText("Barbell Bench Press").props.accessibilityState,
    ).toMatchObject({ expanded: true });
    await fireEvent.press(squat);
    expect(
      view.getByLabelText("Barbell Bench Press").props.accessibilityState,
    ).toMatchObject({ expanded: false });
    expect(view.getAllByLabelText("Increase Sets")).toHaveLength(1);
    expect(
      view.getByRole("button", { name: "Save template" }).props
        .accessibilityState,
    ).toMatchObject({ disabled: false });
  } finally {
    db.close();
  }
});
