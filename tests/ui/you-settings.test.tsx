import React from "react";
import { Alert, StyleSheet } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import You from "../../src/screens/You";
import Preferences from "../../src/screens/Preferences";
import Account from "../../app/account";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import {
  cancelAllNotifications,
  enableNotifications,
} from "../../src/notifications";
import { theme } from "../../src/theme";

// Phase 7.5D: You ends with one Tools & settings card; the settings live in
// Preferences and the data actions, membership and About in Account &
// privacy, with the same controls and behaviour.

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
const params: { edit?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => params,
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
  delete params.edit;
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

function setup(profile: Record<string, unknown> = {}) {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const journal = (kind: string) => ({ pathname: "/journal", params: { kind } });

// ---- You: Tools & settings -----------------------------------------------------

test("Tools & settings: every row opens its existing destination", async () => {
  const { db } = setup();
  try {
    const view = await render(<You />);
    const tools = within(view.getByTestId("you-tools"));
    const rows: [string, unknown][] = [
      ["Goals", journal("goal")],
      ["Body measurements", journal("measurement")],
      ["Recovery", journal("recovery")],
      ["Preferences", "/preferences"],
      ["Account & privacy", "/account"],
    ];
    expect(
      tools.getAllByRole("button").map((b) => b.props.accessibilityLabel),
    ).toEqual(rows.map(([label]) => label));
    for (const [label, to] of rows) {
      await fireEvent.press(tools.getByRole("button", { name: label }));
      expect(router.push).toHaveBeenLastCalledWith(to);
    }
    // Guest mode is said plainly; nothing implies sync needs building.
    expect(
      tools.getByRole("button", { name: "Account & privacy" }).props
        .accessibilityHint,
    ).toBe("Guest mode · backups, privacy and membership");
    // Training history stays the performance strip's row, once.
    expect(view.getAllByLabelText("Training history")).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("You no longer lists settings, data actions, membership or About", async () => {
  const { db } = setup({ name: "Alex Carter" });
  try {
    const view = await render(<You />);
    for (const gone of [
      "Units",
      "Appearance",
      "Training reminders switch",
      "Training preferences",
      "Nutrition targets",
      "Hydration",
      "Nutrition log",
      "Export backup",
      "Import backup",
      "Privacy & training guidance",
      "Delete all local data",
      "Account & cloud sync",
    ])
      expect(view.queryByLabelText(gone)).toBeNull();
    expect(view.queryByTestId("you-membership")).toBeNull();
    expect(view.queryByText(/^FORGE \d/)).toBeNull();
    expect(view.queryByText(/development only/)).toBeNull();
    // The approved sections above are all still there.
    for (const id of [
      "you-identity",
      "you-plan",
      "you-performance",
      "you-goal",
      "you-stats",
    ])
      expect(view.getByTestId(id)).toBeTruthy();
    expect(view.getByRole("header", { name: "Alex Carter" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("You's editor links still open their editors on You", async () => {
  for (const [edit, save] of [
    ["profile", "Save profile"],
    ["focus", "Save training focus"],
    ["training", "Save preferences"],
    ["nutrition", "Save targets"],
  ]) {
    const { db } = setup();
    try {
      params.edit = edit;
      const view = await render(<You />);
      expect(view.getByText(save!)).toBeTruthy();
      expect(router.setParams).toHaveBeenCalledWith({ edit: undefined });
      await view.unmount();
    } finally {
      db.close();
      delete params.edit;
    }
  }
});

// ---- Preferences --------------------------------------------------------------

test("Preferences loads every saved value, grouped", async () => {
  const { db } = setup({
    experience: "Intermediate",
    goal: "Strength",
    restDay: 0,
    frequency: 4,
    rest: 120,
    repMin: 6,
    repMax: 10,
    units: "lb",
    theme: "light",
    notifications: true,
    waterGoal: 3000,
  });
  try {
    const view = await render(<Preferences />);
    expect(view.getByRole("header", { name: "Preferences" })).toBeTruthy();
    for (const group of [
      "Training",
      "Nutrition",
      "Display & units",
      "Notifications",
    ])
      expect(view.getByRole("header", { name: group })).toBeTruthy();
    const hint = (label: string) =>
      view.getByLabelText(label).props.accessibilityHint;
    expect(hint("Training focus")).toBe(
      "Intermediate · Strength · Rests Monday",
    );
    expect(hint("Training preferences")).toMatch(
      /^4× a week · 120s rest · 6–10 reps · \+/,
    );
    expect(hint("Nutrition targets")).toBe("Not set");
    expect(hint("Hydration")).toMatch(/a day · /);
    expect(hint("Training reminders")).toBe("On");
    expect(view.getByLabelText("Training reminders switch").props.value).toBe(
      true,
    );
    const selected = (label: string) =>
      within(view.getByLabelText(label))
        .getAllByRole("tab")
        .filter((t) => t.props.accessibilityState?.selected)
        .map((t) => t.props.accessibilityLabel);
    expect(selected("Units")).toEqual(["Pounds"]);
    expect(selected("Appearance")).toEqual(["Light"]);
  } finally {
    db.close();
  }
});

test("Preferences: reminders keep their side effects; Back returns to You", async () => {
  const { r, db } = setup({ notifications: false });
  try {
    const view = await render(<Preferences />);
    await fireEvent(
      view.getByLabelText("Training reminders switch"),
      "valueChange",
      true,
    );
    expect(enableNotifications).toHaveBeenCalled();
    await new Promise((done) => setImmediate(done));
    expect(r.profile().notifications).toBe(true);
    await view.rerender(<Preferences />);
    await fireEvent.press(view.getByLabelText("Training reminders"));
    expect(r.profile().notifications).toBe(false);
    expect(cancelAllNotifications).toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/profile");
  } finally {
    db.close();
  }
});

test("Preferences: Training preferences saves, and unsaved edits ask first", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { r, db } = setup({ frequency: 3, height: 180, weight: 80 });
  try {
    const view = await render(<Preferences />);
    await fireEvent.press(view.getByLabelText("Training preferences"));
    await fireEvent.press(view.getByLabelText("Increase Weekly workout goal"));
    // Cancel with an unsaved change asks before discarding.
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(alert).toHaveBeenLastCalledWith(
      "Discard changes?",
      expect.any(String),
      expect.any(Array),
    );
    expect(r.profile().frequency).toBe(3);
    await fireEvent.press(view.getByText("Save preferences"));
    expect(r.profile().frequency).toBe(4);
    expect(view.queryByText("Save preferences")).toBeNull();
    await view.rerender(<Preferences />);
    expect(
      view.getByLabelText("Training preferences").props.accessibilityHint,
    ).toMatch(/^4× a week/);
  } finally {
    alert.mockRestore();
    db.close();
  }
});

test("Preferences: hydration opens its sheet; development tools stay development-only", async () => {
  const { db } = setup();
  try {
    const view = await render(<Preferences />);
    await fireEvent.press(view.getByRole("button", { name: "Hydration" }));
    expect(view.getByRole("tab", { name: "US fluid ounces" })).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    // Jest runs as a development build: the tools are shown, labelled.
    await fireEvent.press(
      view.getByLabelText("Design system (development only)"),
    );
    expect(router.push).toHaveBeenLastCalledWith("/design-system");
    expect(view.getByLabelText("Replay intro (development only)")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Preferences on a compact screen with large text, in light mode", async () => {
  const { db } = setup();
  try {
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(<Preferences />);
    const title = within(view.getByLabelText("Training focus")).getByText(
      "Training focus",
    );
    expect(StyleSheet.flatten(title.props.style).color).toBe(
      theme.palettes.light.text,
    );
    for (const label of ["Training focus", "Nutrition targets", "Hydration"])
      expect(
        Number(
          StyleSheet.flatten(view.getByLabelText(label).props.style).minHeight,
        ),
      ).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});

// ---- Account & privacy --------------------------------------------------------

test("Account & privacy: membership, data actions and About, unchanged", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<Account />);
    expect(
      view.getByRole("header", { name: "Account & privacy" }),
    ).toBeTruthy();
    // Guest mode (no cloud backend configured), pointing at the backups here.
    expect(view.getByText("Guest mode is active")).toBeTruthy();
    expect(view.getByText(/Data & privacy below/)).toBeTruthy();
    // Membership: the same honest card; nothing to buy.
    const member = within(view.getByTestId("you-membership"));
    expect(member.getByText("Free plan")).toBeTruthy();
    expect(member.getByText(/There's nothing to buy yet/)).toBeTruthy();
    expect(view.queryByText(/\$|subscribe|purchase|billing/i)).toBeNull();
    // About.
    expect(view.getByText(/^FORGE \d/)).toBeTruthy();
    expect(view.getByText("Local schema v1 · guest mode")).toBeTruthy();
    // Data & privacy.
    await fireEvent.press(view.getByLabelText("Privacy & training guidance"));
    expect(view.getByText(/No advertising or analytics SDK/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("Export backup"));
    expect(view.getByText("Back up your data")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Delete all local data"));
    expect(confirm).toHaveBeenLastCalledWith(
      "Delete all local data?",
      expect.stringContaining("can't be undone"),
      expect.any(Function),
      { action: "Delete everything" },
    );
    // Nothing is deleted until the lifter confirms.
    expect(r.profile().onboarded).toBe(true);
  } finally {
    db.close();
  }
});
