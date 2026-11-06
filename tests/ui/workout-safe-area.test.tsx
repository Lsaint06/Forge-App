import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import {
  render,
  fireEvent,
  type RenderResult,
} from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import WorkoutModal from "../../app/workout";
import { useRepo, confirm } from "../../src/state";
import { BRAND_TAGLINE } from "../../src/components/reforge/Brand";
import { pathRepository } from "../path-fixture";

// Phase 8.3C (iPhone 17, standalone FORGE Dev build): the logger's back
// arrow, wordmark and tagline drew under the status bar. The logger is a
// native full-screen modal, so on iOS the root SafeAreaProvider's native view
// is not above it, and its safe-area views only get real insets from a
// provider inside the modal. This renderer has no native modals, so these
// tests pin that structure: between the app root and each of the logger's
// safe-area views sits a provider that the logger's route owns.

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
const mockParams: { id?: string } = {};
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
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.id;
});

type HostNode = ReturnType<RenderResult["getByText"]>;
type Edges = Partial<Record<"top" | "right" | "bottom" | "left", string>>;

const APP_ROOT = "app-root";
// app/_layout.tsx's provider, with a Dynamic Island iPhone's portrait insets.
const iPhone = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
const hidden = { includeHiddenElements: true };

function openLogger() {
  return render(
    <SafeAreaProvider testID={APP_ROOT} initialMetrics={iPhone}>
      <WorkoutModal />
    </SafeAreaProvider>,
  );
}

function nearest(node: HostNode, type: string) {
  for (let n = node.parent; n; n = n.parent) if (n.type === type) return n;
  return undefined;
}

/**
 * `node` is laid out in a safe-area view with `edges`, and that view reads
 * its insets from the logger's own provider, which sits under the app root.
 */
function expectOwnSafeArea(node: HostNode, edges: Edges) {
  const view = nearest(node, "RNCSafeAreaView");
  expect(view?.props.edges).toMatchObject(edges);
  const provider = view && nearest(view, "RNCSafeAreaProvider");
  expect(provider).toBeDefined();
  expect(provider!.props.testID).not.toBe(APP_ROOT);
  expect(nearest(provider!, "RNCSafeAreaProvider")?.props.testID).toBe(
    APP_ROOT,
  );
}

function workoutInProgress() {
  const fixture = pathRepository();
  const { r } = fixture;
  const w = r.startWorkout("Freestyle");
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { weight: 60, reps: 8, completed: true });
  r.addSet(row.id, { weight: 60, reps: 8 });
  jest.mocked(useRepo).mockReturnValue(r);
  return { ...fixture, w };
}

test("the back arrow, wordmark and tagline sit below the status bar, the dock above the home indicator", async () => {
  const { db } = workoutInProgress();
  try {
    const view = await openLogger();
    for (const node of [
      view.getByLabelText("Back to training"),
      view.getByLabelText("FORGE"),
      view.getByText(BRAND_TAGLINE, hidden),
    ])
      expectOwnSafeArea(node, { top: "additive" });
    expectOwnSafeArea(view.getByRole("button", { name: "Finish workout" }), {
      bottom: "maximum",
    });
  } finally {
    db.close();
  }
});

test("a paused workout reopens with the same safe areas", async () => {
  const { r, db, w } = workoutInProgress();
  try {
    r.pauseWorkout(w.id);
    const view = await openLogger();
    expect(view.getByText("Workout paused")).toBeTruthy();
    expectOwnSafeArea(view.getByLabelText("Back to training"), {
      top: "additive",
    });
    expectOwnSafeArea(view.getByRole("button", { name: "Resume workout" }), {
      bottom: "maximum",
    });
  } finally {
    db.close();
  }
});

test("a finished workout under review keeps its header below the status bar", async () => {
  const { r, db, w } = workoutInProgress();
  try {
    r.finishWorkout(w.id);
    mockParams.id = w.id;
    const view = await openLogger();
    expect(view.getByText("Completed session")).toBeTruthy();
    expectOwnSafeArea(view.getByLabelText("Back to training"), {
      top: "additive",
      bottom: "additive",
    });
  } finally {
    db.close();
  }
});

test("with no workout to show, the fallback screen's Back is in the same safe area", async () => {
  const { db, r } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await openLogger();
    expect(view.getByText("No active workout")).toBeTruthy();
    expectOwnSafeArea(view.getByLabelText("Back"), { top: "additive" });
  } finally {
    db.close();
  }
});

test("Back to training is a 44 pt target and leaves the workout in progress", async () => {
  const { r, db, w } = workoutInProgress();
  try {
    const before = r.workoutSnapshot(w.id);
    const view = await openLogger();
    const back = view.getByLabelText("Back to training");
    const box: ViewStyle = StyleSheet.flatten(back.props.style) ?? {};
    expect(Number(box.minWidth)).toBeGreaterThanOrEqual(44);
    expect(Number(box.minHeight)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(back);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    // Nothing finished, paused or discarded: Resume finds the same session.
    expect(r.active()?.id).toBe(w.id);
    expect(r.workout(w.id)!.status).toBe("active");
    expect(r.workoutSnapshot(w.id)).toEqual(before);
    // Opened with nothing beneath it, Back still lands on the tabs.
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(back);
    expect(router.replace).toHaveBeenCalledWith("/(tabs)");
    expect(r.active()?.id).toBe(w.id);
  } finally {
    db.close();
  }
});
