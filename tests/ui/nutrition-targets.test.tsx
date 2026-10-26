import React from "react";
import { Alert, StyleSheet } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import NutritionTab from "../../app/(tabs)/nutrition";
import You from "../../src/screens/You";
import { TARGETS_SAVED } from "../../src/domain/nutrition";
import { theme } from "../../src/theme";
import { pathRepository } from "../path-fixture";

// Phase 7.3G G2: daily targets edited in context, in Nutrition. The same
// profile storage, reading and validation as the You tab's editor.

const mockProfile: { theme: "dark" | "light" } = { theme: "dark" };
// Like the app's store: useRepo re-renders on every saved change (revision).
const mockStore: { repo: unknown; listeners: Set<() => void> } = {
  repo: undefined,
  listeners: new Set(),
};
jest.mock("../../src/state", () => {
  const React = jest.requireActual("react");
  const touch = () => mockStore.listeners.forEach((l) => l());
  return {
    useRepo: jest.fn(() => {
      const [, set] = React.useState(0);
      React.useEffect(() => {
        const l = () => set((n: number) => n + 1);
        mockStore.listeners.add(l);
        return () => mockStore.listeners.delete(l);
      }, []);
      return mockStore.repo;
    }),
    mutate: (fn: () => unknown) => {
      const v = fn();
      touch();
      return v;
    },
    confirm: jest.fn(),
    useApp: Object.assign(
      (selector: (s: { revision: number; profile: unknown }) => unknown) =>
        selector({ revision: 0, profile: { ...mockProfile } }),
      { getState: () => ({ touch }) },
    ),
  };
});
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
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
const discard = (choice: "Discard" | "Keep editing") => {
  const call = alert.mock.calls
    .filter(([t]) => t === "Discard changes?")
    .at(-1);
  expect(call).toBeTruthy();
  (call![2] as AlertButton[]).find((b) => b.text === choice)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.theme = "dark";
});

function setup(own?: { calories: number; protein: number }, file?: string) {
  const fixture = pathRepository(file);
  fixture.r.saveProfile({
    onboarded: true,
    name: "Alex",
    height: 180,
    weight: 80,
  });
  if (own) {
    fixture.r.saveProfile(own);
    fixture.r.setSetting(TARGETS_SAVED, "1");
  }
  mockStore.repo = fixture.r;
  return fixture;
}
type View = Awaited<ReturnType<typeof render>>;
const value = (view: View, label: string) =>
  view.getByLabelText(label).props.value;
const type = (view: View, label: string, text: string) =>
  fireEvent.changeText(view.getByLabelText(label), text);
const save = (view: View) =>
  fireEvent.press(view.getByRole("button", { name: "Save targets" }));

test("unset targets: Set targets opens the sheet in Nutrition with the suggested values; Cancel keeps nothing", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByRole("button", { name: "Set your daily targets" }),
    );
    expect(view.getByRole("header", { name: "Daily targets" })).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(view.getByText(/Suggested starting targets/)).toBeTruthy();
    expect(value(view, "Calories (kcal)")).toBe("2000");
    expect(value(view, "Protein (g)")).toBe("150");
    expect(value(view, "Carbs (g)")).toBe("200");
    expect(value(view, "Fat (g)")).toBe("65");
    expect(
      view.getByText(/These macros add up to about 1,985 kcal/),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(view.queryByRole("header", { name: "Daily targets" })).toBeNull();
    // Opening and cancelling never makes the defaults the lifter's own.
    expect(r.setting(TARGETS_SAVED)).toBeUndefined();
    expect(
      view.getByRole("button", { name: "Set your daily targets" }),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("saving one changed field: only it changes, the targets become the lifter's own, and the dashboard updates at once", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByRole("button", { name: "Set your daily targets" }),
    );
    await type(view, "Calories (kcal)", "2500");
    await save(view);
    expect(view.queryByRole("header", { name: "Daily targets" })).toBeNull();
    expect(r.profile()).toMatchObject({
      calories: 2500,
      protein: 150,
      carbs: 200,
      fat: 65,
    });
    expect(r.setting(TARGETS_SAVED)).toBe("1");
    expect(view.getByLabelText("0 of 2,500 calories, 2,500 left")).toBeTruthy();
    expect(
      view.getByLabelText(
        "Calorie goal: 2,500 kcal left. Edit your daily targets",
      ),
    ).toBeTruthy();
    expect(
      view.queryByRole("button", { name: "Set your daily targets" }),
    ).toBeNull();
  } finally {
    db.close();
  }
});

test("saved targets: Edit targets shows them; several fields save together; calories untouched", async () => {
  const { r, db } = setup({ calories: 2400, protein: 180 });
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByLabelText(
        "Calorie goal: 2,400 kcal left. Edit your daily targets",
      ),
    );
    expect(view.getByText(/Your targets for every day/)).toBeTruthy();
    expect(value(view, "Calories (kcal)")).toBe("2400");
    expect(value(view, "Protein (g)")).toBe("180");
    await type(view, "Protein (g)", "200");
    await type(view, "Carbs (g)", "250,5");
    await type(view, "Fat (g)", "0");
    await save(view);
    expect(r.profile()).toMatchObject({
      calories: 2400,
      protein: 200,
      carbs: 250.5,
      fat: 0,
    });
    expect(view.getByLabelText("Protein 0 g of 200 g")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("validation: limits, negatives and unreadable numbers are refused with plain messages; nothing is saved", async () => {
  const { r, db } = setup({ calories: 2400, protein: 180 });
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByLabelText(
        "Calorie goal: 2,400 kcal left. Edit your daily targets",
      ),
    );
    await type(view, "Calories (kcal)", "20001");
    await type(view, "Protein (g)", "-5");
    await type(view, "Carbs (g)", "abc");
    await type(view, "Fat (g)", "2001");
    await save(view);
    expect(view.getByRole("header", { name: "Daily targets" })).toBeTruthy();
    expect(view.getByText("Enter a number from 0 to 20,000.")).toBeTruthy();
    expect(view.getAllByText("Enter a number from 0 to 2,000.")).toHaveLength(
      2,
    );
    expect(view.getByText("Enter a number from 0 to 3,000.")).toBeTruthy();
    expect(r.profile()).toMatchObject({ calories: 2400, protein: 180 });
    // The upper limits themselves are allowed.
    await type(view, "Calories (kcal)", "20000");
    await type(view, "Protein (g)", "2000");
    await type(view, "Carbs (g)", "3000");
    await type(view, "Fat (g)", "2000");
    expect(view.queryByText("Enter a number from 0 to 20,000.")).toBeNull();
    await save(view);
    expect(r.profile()).toMatchObject({
      calories: 20000,
      protein: 2000,
      carbs: 3000,
      fat: 2000,
    });
  } finally {
    db.close();
  }
});

test("unsaved changes: Cancel and Close ask first; Keep editing stays, Discard keeps nothing", async () => {
  const { r, db } = setup({ calories: 2400, protein: 180 });
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByLabelText(
        "Calorie goal: 2,400 kcal left. Edit your daily targets",
      ),
    );
    await type(view, "Calories (kcal)", "1800");
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    await waitFor(() => discard("Keep editing"));
    expect(value(view, "Calories (kcal)")).toBe("1800");
    await fireEvent.press(view.getByLabelText("Close"));
    await waitFor(() => discard("Discard"));
    expect(view.queryByRole("header", { name: "Daily targets" })).toBeNull();
    expect(r.profile().calories).toBe(2400);
  } finally {
    db.close();
  }
});

test("the You editor and the Nutrition sheet share the same targets, both ways", async () => {
  const { r, db } = setup();
  try {
    // Both screens at once, as in the app's tabs: no remounting.
    const view = await render(
      <>
        <NutritionTab />
        <You />
      </>,
    );
    await fireEvent.press(
      view.getByRole("button", { name: "Set your daily targets" }),
    );
    await type(view, "Calories (kcal)", "2500");
    await save(view);
    expect(
      view.getByLabelText("Nutrition targets").props.accessibilityHint,
    ).toBe("2,500 kcal · 150 g protein");
    // You's editor opens on what Nutrition saved, and saves through the profile.
    await fireEvent.press(view.getByLabelText("Nutrition targets"));
    expect(value(view, "Daily calorie goal (kcal)")).toBe("2500");
    await type(view, "Daily calorie goal (kcal)", "2700");
    await fireEvent.press(view.getByText("Save targets"));
    await waitFor(() => expect(r.profile().calories).toBe(2700));
    // Nutrition reflects it at once, and its sheet opens on it.
    await waitFor(() =>
      expect(
        view.getByLabelText(
          "Calorie goal: 2,700 kcal left. Edit your daily targets",
        ),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      view.getByLabelText(
        "Calorie goal: 2,700 kcal left. Edit your daily targets",
      ),
    );
    expect(value(view, "Calories (kcal)")).toBe("2700");
  } finally {
    db.close();
  }
});

test("saved targets survive an app restart (a second connection to the same file)", async () => {
  const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
  const file = `${process.env.TEMP ?? "/tmp"}/forge-targets-${process.pid}.db`;
  fs.rmSync(file, { force: true });
  const first = setup(undefined, file);
  const reopened = { db: undefined as undefined | { close(): void } };
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByRole("button", { name: "Set your daily targets" }),
    );
    await type(view, "Calories (kcal)", "2600");
    await type(view, "Protein (g)", "190");
    await save(view);
    const again = pathRepository(file);
    reopened.db = again.db;
    expect(again.r.profile()).toMatchObject({ calories: 2600, protein: 190 });
    expect(again.r.setting(TARGETS_SAVED)).toBe("1");
    // Queued for sync like any profile change.
    expect(again.r.outbox().some((o) => o.kind === "profile")).toBe(true);
  } finally {
    reopened.db?.close();
    first.db.close();
    fs.rmSync(file, { force: true });
  }
});
test("light mode and accessibility: light palette, labelled numeric fields, comfortable targets", async () => {
  mockProfile.theme = "light";
  const { db } = setup({ calories: 2400, protein: 180 });
  try {
    const view = await render(<NutritionTab />);
    await fireEvent.press(
      view.getByLabelText(
        "Calorie goal: 2,400 kcal left. Edit your daily targets",
      ),
    );
    for (const label of [
      "Calories (kcal)",
      "Protein (g)",
      "Carbs (g)",
      "Fat (g)",
    ]) {
      const field = view.getByLabelText(label);
      expect(field.props.keyboardType).toBe("decimal-pad");
      const style = StyleSheet.flatten(field.props.style) as {
        minHeight?: number;
        color?: string;
      };
      expect(Number(style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(style.color).toBe(theme.palettes.light.text);
    }
    await type(view, "Calories (kcal)", "x");
    await save(view);
    expect(view.getByLabelText("Calories (kcal)").props.accessibilityHint).toBe(
      "Error: Enter a number from 0 to 20,000.",
    );
  } finally {
    db.close();
  }
});
