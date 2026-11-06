import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import Explore from "../../app/explore";
import * as design from "../../src/components/design";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";

// Phase 7.2C-3C: the text-first Exercise Library. The rejected doodle
// illustrations (MuscleIllustration, ExerciseVisual, ExerciseCard) are gone.

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
    (selector: (s: { profile: undefined }) => unknown) =>
      selector({ profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
const mockParams: { search?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
  delete mockParams.search;
});

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
type Node = { type?: unknown; children?: unknown[] };
/** Host element types inside an element (e.g. "RNSVGPath"). */
function types(el: Node, out: string[] = []) {
  if (typeof el.type === "string") out.push(el.type);
  for (const child of el.children ?? [])
    if (child && typeof child === "object") types(child as Node, out);
  return out;
}

async function open(r: ReturnType<typeof pathRepository>["r"]) {
  jest.mocked(useRepo).mockReturnValue(r);
  return render(<Explore />);
}

test("the rejected doodle illustrations are gone from the library and the codebase", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    // No captions, no category-illustration labels, no thumbnails.
    expect(view.queryByText(/Muscle illustration/)).toBeNull();
    expect(view.queryByText("Media available")).toBeNull();
    expect(view.queryAllByLabelText(/category illustration/)).toHaveLength(0);
    const rows = view.getAllByTestId("exercise-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const inside = types(row as unknown as Node);
      expect(inside.filter((t) => t.startsWith("RNSVG"))).toEqual([]);
      expect(inside).not.toContain("Image");
    }
    // The old components no longer exist to be reused.
    for (const name of ["MuscleIllustration", "ExerciseVisual", "ExerciseCard"])
      expect(name in design).toBe(false);
  } finally {
    db.close();
  }
});

test("REFORGE header with the real count, search, segments and Create custom exercise", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    expect(view.getByRole("header", { name: "Exercise library" })).toBeTruthy();
    expect(view.getByText(`${r.exercises().length} exercises`)).toBeTruthy();
    expect(view.getByLabelText("Search exercises")).toBeTruthy();
    expect(
      view.getByRole("tab", { name: "All" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(view.getByRole("tab", { name: "Favorites" })).toBeTruthy();
    expect(view.getByRole("tab", { name: "Recent" })).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Create custom exercise"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/exercise",
      params: { custom: "new" },
    });
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("a row shows name, muscles, equipment and pattern, and opens the detail", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "barbell bench press",
    );
    const row = view.getByLabelText("View Barbell Bench Press");
    expect(row.props.accessibilityHint).toBe(
      "Chest · also Triceps, Front deltoids · Barbell · Horizontal push",
    );
    expect(
      view.getAllByText("Barbell · Horizontal push").length,
    ).toBeGreaterThan(0);
    await fireEvent.press(row);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/exercise",
      params: { id: "barbell-bench-press" },
    });
    // Rows follow the reviewed anatomy: a fly lists no triceps.
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "dumbbell fly",
    );
    expect(
      view.getByLabelText("View Dumbbell Fly").props.accessibilityHint,
    ).toBe("Chest · also Front deltoids · Dumbbell · Horizontal push");
  } finally {
    db.close();
  }
});

test("7.2C-3D: rows use the legend's words; the Muscle filter keeps the catalogue group", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    await fireEvent.press(view.getByLabelText(/^Filters/));
    await fireEvent.press(view.getByRole("button", { name: "Glutes" }));
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "machine hip adduction",
    );
    // Still found under Glutes (filter semantics unchanged), but the row
    // agrees with the detail screen.
    expect(
      view.getByLabelText("View Machine Hip Adduction").props.accessibilityHint,
    ).toBe("Adductors · Machine · Hip isolation");
    expect(view.getByText("Adductors")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Remove Glutes filter"));
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "conventional deadlift",
    );
    expect(
      view.getByLabelText("View Conventional Deadlift").props.accessibilityHint,
    ).toBe("Hamstrings · Glutes · Barbell · Hinge");
  } finally {
    db.close();
  }
});

test("favourites toggle from the star and fill the Favorites view", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    await fireEvent.press(view.getByRole("tab", { name: "Favorites" }));
    expect(view.getByText("No favorites yet")).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "All" }));
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "back squat",
    );
    await fireEvent.press(view.getByLabelText("Favorite Back Squat"));
    expect(r.favorites()).toContain("back-squat");
    await view.rerender(<Explore />);
    expect(
      view.getByLabelText("Unfavorite Back Squat").props.accessibilityState,
    ).toEqual({ selected: true });
    await fireEvent.changeText(view.getByLabelText("Search exercises"), "");
    await fireEvent.press(view.getByRole("tab", { name: "Favorites" }));
    expect(
      view.getAllByTestId("exercise-row").map((x) => x.props.testID),
    ).toHaveLength(1);
    expect(view.getByLabelText("View Back Squat")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Recent lists exercises from the last workouts", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    await fireEvent.press(view.getByRole("tab", { name: "Recent" }));
    expect(view.getByText("No recent exercises")).toBeTruthy();
    const w = r.startWorkout();
    r.addExercise(w.id, "lat-pulldown");
    r.finishWorkout(w.id);
    await view.rerender(<Explore />);
    expect(view.getByLabelText("View Lat Pulldown")).toBeTruthy();
    expect(view.getAllByTestId("exercise-row")).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("filters keep their semantics, show active pills and can be removed", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r);
    await fireEvent.press(view.getByLabelText(/^Filters/));
    await fireEvent.press(view.getByRole("button", { name: "Chest" }));
    const chest = r.exercises("", "Chest", "All").length;
    expect(view.getByText(`${chest} of ${r.exercises().length}`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/^Filters/));
    expect(view.getByLabelText("Filters, 1 active")).toBeTruthy();
    expect(view.getByText("Filters · 1")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Remove Chest filter"));
    expect(view.queryByLabelText("Remove Chest filter")).toBeNull();
    expect(view.getByText(`${r.exercises().length} exercises`)).toBeTruthy();
    // Sort by muscle still reorders.
    await fireEvent.press(view.getByLabelText(/^Filters/));
    await fireEvent.press(view.getByRole("button", { name: "Muscle" }));
    expect(view.getByText("By muscle")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("rows and controls keep comfortable 44 pt targets; the list stays virtualised", async () => {
  const { r, db } = pathRepository();
  try {
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 1.5 });
    const view = await open(r);
    const row = view.getAllByLabelText(/^View /)[0]!;
    expect(Number(flat(row).minHeight)).toBeGreaterThanOrEqual(64);
    const star = view.getAllByLabelText(/^Favorite /)[0]!;
    expect(Number(flat(star).width)).toBeGreaterThanOrEqual(44);
    expect(Number(flat(star).minHeight)).toBeGreaterThanOrEqual(44);
    for (const tab of view.getAllByRole("tab"))
      expect(Number(flat(tab).minHeight)).toBeGreaterThanOrEqual(44);
    // Only the first screens of rows are mounted, not the whole catalogue.
    expect(view.getAllByTestId("exercise-row").length).toBeLessThan(
      r.exercises().length,
    );
  } finally {
    db.close();
  }
});
