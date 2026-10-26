import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import ExerciseScreen from "../../app/exercise";
import { figureHeight } from "../../src/components/anatomy/MuscleAtlas";
import { muscleMap, spokenMuscles } from "../../src/anatomy/mapping";
import { exerciseChips } from "../../src/screens/exercise/model";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";

// Phase 7.2C-3B: the exercise detail with the anatomy atlas. Records,
// history and custom exercises are covered by wp5, wp6 and progress.

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
const mockParams: { id?: string; custom?: string } = {};
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
  delete mockParams.id;
  delete mockParams.custom;
});

const hidden = { includeHiddenElements: true };
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
type Repo = ReturnType<typeof pathRepository>["r"];
type View = Awaited<ReturnType<typeof render>>;
/** The highlighted regions drawn on the figures, as "side.region:role". */
const highlights = (view: View) =>
  view
    .queryAllByTestId(/^atlas-/, hidden)
    .map((el) =>
      String(el.props.testID).replace(
        /^atlas-(front|back)-(.+)-(primary|secondary)$/,
        "$1.$2:$3",
      ),
    )
    .sort();

async function open(r: Repo, id: string) {
  jest.mocked(useRepo).mockReturnValue(r);
  mockParams.id = id;
  return render(<ExerciseScreen />);
}

test("bench press: REFORGE header, the approved chips and primary plus secondary highlights", async () => {
  const { r, db } = pathRepository();
  try {
    const e = r.exercise("barbell-bench-press")!;
    const view = await open(r, e.id);
    expect(view.getByRole("header", { name: e.name })).toBeTruthy();
    expect(view.getByText("Chest · Horizontal push")).toBeTruthy();
    for (const chip of ["Barbell", "Horizontal push", "Strength"])
      expect(view.getByLabelText(chip)).toBeTruthy();
    expect(highlights(view)).toEqual([
      "back.triceps:secondary",
      "front.deltoid:secondary",
      "front.pectoralis-major:primary",
    ]);
    // Text equivalents: one image description, then the legend rows.
    const diagram = view.getByRole("image", { name: /^Muscle diagram/ });
    expect(diagram.props.accessibilityLabel).toBe(
      `Muscle diagram, front and back. ${spokenMuscles(muscleMap(e))}`,
    );
    expect(
      view.getByLabelText("Primary: Chest, pectoralis major"),
    ).toBeTruthy();
    expect(
      view.getByLabelText(
        "Secondary: Triceps, triceps brachii; Front deltoids, anterior deltoid",
      ),
    ).toBeTruthy();
    // No developer text and no old doodle illustration.
    expect(view.queryByText(/Highlights follow/)).toBeNull();
    expect(view.queryByText(/not a demonstration/)).toBeNull();
    expect(view.queryByText(/^Also works/)).toBeNull();
  } finally {
    db.close();
  }
});

test("lat pulldown and squat light the approved regions", async () => {
  const { r, db } = pathRepository();
  try {
    const lat = await open(r, "lat-pulldown");
    expect(highlights(lat)).toEqual([
      "back.latissimus-dorsi:primary",
      "front.biceps:secondary",
    ]);
    await lat.unmount();
    const squat = await open(r, "back-squat");
    expect(highlights(squat)).toEqual([
      "back.gluteus-maximus:secondary",
      "front.quadriceps:primary",
    ]);
    expect(
      squat.getByLabelText(
        "Primary: Quadriceps, rectus femoris, vastus lateralis, vastus medialis",
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("primary-only exercises show no secondary legend", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r, "standing-calf-raise");
    expect(highlights(view)).toEqual([
      "back.gastrocnemius:primary",
      "back.soleus:primary",
    ]);
    expect(view.getByTestId("legend-primary", hidden)).toBeTruthy();
    expect(view.queryByTestId("legend-secondary", hidden)).toBeNull();
    expect(view.queryByText("Secondary")).toBeNull();
  } finally {
    db.close();
  }
});

test("display overrides apply on screen: a fly shows no triceps", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r, "dumbbell-fly");
    expect(highlights(view)).toEqual([
      "front.deltoid:secondary",
      "front.pectoralis-major:primary",
    ]);
    expect(view.queryByLabelText(/Triceps/)).toBeNull();
  } finally {
    db.close();
  }
});

test("full-body conditioning highlights nothing and says why", async () => {
  const { r, db } = pathRepository();
  try {
    const e = r.exercise("treadmill-run")!;
    const view = await open(r, e.id);
    expect(highlights(view)).toEqual([]);
    expect(view.getByText(/^Full body · conditioning\./)).toBeTruthy();
    expect(view.queryByText("Primary")).toBeNull();
    expect(
      view.getByRole("image", { name: /^Muscle diagram/ }).props
        .accessibilityLabel,
    ).toBe(
      "Muscle diagram, front and back. Full body conditioning: no single muscle group.",
    );
    // The chips still follow the same rule.
    for (const chip of exerciseChips(e))
      expect(view.getByLabelText(chip)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a muscle the figures cannot show is named, not drawn", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r, "cable-internal-rotation");
    expect(highlights(view)).toEqual([]);
    expect(
      view.getByText(/Subscapularis — Not visible on the figures/),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("custom exercises use the same atlas; unknown groups are named only", async () => {
  const { r, db } = pathRepository();
  try {
    const base = {
      equipment: "Dumbbell",
      instructions: ["Lift"],
      pattern: "Custom",
      difficulty: "User defined",
      mistakes: "",
      safety: "",
      category: "strength" as const,
      unilateral: false,
      tracking: ["kg", "reps"],
    };
    const chest = r.saveExercise({
      ...base,
      id: "custom-chest",
      name: "Cable press variation",
      muscle: "Chest",
      secondary: [],
    });
    const view = await open(r, chest.id);
    expect(highlights(view)).toEqual(["front.pectoralis-major:primary"]);
    expect(view.getByLabelText("Edit custom exercise")).toBeTruthy();
    expect(view.getByLabelText("Custom")).toBeTruthy();
    await view.unmount();
    const grip = r.saveExercise({
      ...base,
      id: "custom-grip",
      name: "Grip hang",
      muscle: "Forearms & grip",
      secondary: ["Back"],
    });
    const other = await open(r, grip.id);
    expect(highlights(other)).toEqual(["back.trapezius:secondary"]);
    expect(other.getByLabelText("Primary: Forearms & grip")).toBeTruthy();
    // Editing still opens the custom form in the REFORGE frame.
    await fireEvent.press(other.getByLabelText("Edit custom exercise"));
    expect(other.getByRole("header", { name: "Edit exercise" })).toBeTruthy();
    expect(other.getByLabelText("Save exercise")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("figures fit compact iPhones; actions keep 44 pt; Add to workout still starts one", async () => {
  expect(figureHeight(393 - 64)).toBe(300);
  expect(figureHeight(320 - 64)).toBeLessThan(240);
  expect(figureHeight(100)).toBe(160);
  const { r, db } = pathRepository();
  try {
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 1.5 });
    const view = await open(r, "barbell-bench-press");
    for (const name of ["Back", "Add to workout"])
      expect(
        Number(flat(view.getByRole("button", { name })).minHeight ?? 0),
      ).toBeGreaterThanOrEqual(44);
    await fireEvent.press(view.getByLabelText("Add to workout"));
    const w = r.active()!;
    expect(r.workoutExercises(w.id).map((x) => x.exerciseId)).toEqual([
      "barbell-bench-press",
    ]);
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("the atlas credit (CC BY-SA 4.0) is one tap away on every exercise", async () => {
  const { r, db } = pathRepository();
  try {
    const view = await open(r, "treadmill-run");
    const link = view.getByRole("button", {
      name: "Anatomy illustration credits",
    });
    expect(Number(flat(link).minHeight ?? 0)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(link);
    expect(
      view.getByRole("header", { name: "Anatomy illustration" }),
    ).toBeTruthy();
    expect(
      view.getByText(/OpenStax, Tomáš Kebert \(Nefronus\) and umimeto\.org/),
    ).toBeTruthy();
    expect(view.getByText(/^Licensed under Creative Commons/)).toBeTruthy();
    expect(view.getByLabelText("Source illustration")).toBeTruthy();
    expect(view.getByLabelText("CC BY-SA 4.0 licence")).toBeTruthy();
  } finally {
    db.close();
  }
});
