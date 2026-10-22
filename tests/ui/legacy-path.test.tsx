import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { router } from "expo-router";
import LegacyPath from "../../src/screens/LegacyPath";
import PathsRoute from "../../app/paths";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { legacyUserRepository } from "../legacy-fixture";
import {
  currentPath,
  pathPrograms,
  pathSessions,
  pathSummary,
} from "../../src/data/paths";

const mockActivation = { curated: false };
jest.mock("../../src/programs/activation", () => ({
  curatedOnly: () => mockActivation.curated,
}));
jest.mock("../../src/notifications", () => ({
  restNotification: jest.fn(async () => {}),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));

// Generator vocabulary must never reach the compatibility screens.
const generatorWords =
  /builder|rebuild|generat|planner|Edit plan|Browse Paths|eight-week plan/i;

beforeEach(() => {
  jest.clearAllMocks();
  mockActivation.curated = false;
});

test("an existing user can continue their generated Path from the compatibility screen", async () => {
  const { r, db } = legacyUserRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const before = pathSummary(r, currentPath(r)!).completed;
    const view = await render(<LegacyPath />);
    expect(view.getByText("GET STRONG")).toBeTruthy();
    expect(view.getByText(`${before} / 32 workouts completed`)).toBeTruthy();
    expect(view.getByText("Ready for a Forge program?")).toBeTruthy();
    expect(view.getByText("YOUR TRAINING CALENDAR")).toBeTruthy();
    expect(view.queryAllByText(generatorWords)).toHaveLength(0);
    expect(view.queryAllByLabelText(generatorWords)).toHaveLength(0);
    await fireEvent.press(view.getByLabelText("Start workout"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    const active = r.active()!;
    const session = pathSessions(r, currentPath(r)!).find(
      (s) => s.data.workoutId === active.id,
    )!;
    expect(active.templateId).toBe(session.data.templateId);
    await fireEvent.press(view.getByLabelText("Browse Forge programs"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
  } finally {
    db.close();
  }
});

test("calendar navigation, skipping and pausing work without the generator", async () => {
  const { r, db } = legacyUserRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<LegacyPath />);
    const week = Number(
      view.getByText(/^Calendar week \d+$/).props.children.at(-1),
    );
    await fireEvent.press(view.getByLabelText("Next week →"));
    expect(view.getByText(`Calendar week ${week + 1}`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("← Previous week"));
    expect(view.getByText(`Calendar week ${week}`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Workout options"));
    expect(view.queryByLabelText("Edit this workout")).toBeNull();
    const skip = view.getByLabelText(/^Skip /);
    await fireEvent.press(skip);
    await act(async () => jest.mocked(confirm).mock.calls.at(-1)![2]());
    expect(pathSummary(r, currentPath(r)!).skipped).toBe(2);
    await fireEvent.press(view.getByLabelText("Manage Path"));
    await fireEvent.press(view.getByLabelText("Pause Path"));
    await act(async () => jest.mocked(confirm).mock.calls.at(-1)![2]());
    expect(currentPath(r)!.data.status).toBe("paused");
  } finally {
    db.close();
  }
});

test("earlier Paths open read-only for review", async () => {
  const { r, db } = legacyUserRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const archived = pathPrograms(r).find((p) => p.data.status === "archived")!;
    const view = await render(<LegacyPath />);
    await fireEvent.press(
      view.getByLabelText(
        `Review ${archived.data.name} · ${archived.data.started}`,
      ),
    );
    expect(view.getByText("Archived · read only")).toBeTruthy();
    expect(view.queryByLabelText("Start workout")).toBeNull();
    expect(view.queryByLabelText("Workout options")).toBeNull();
    expect(view.queryByText("Ready for a Forge program?")).toBeNull();
  } finally {
    db.close();
  }
});

test("without a saved Path the screen points to Forge programs", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<LegacyPath />);
    expect(view.getByText("No current Path")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Choose a Forge program"));
    expect(router.replace).toHaveBeenLastCalledWith("/forge-paths");
    expect(view.queryAllByText(generatorWords)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("the /paths route offers the Path builder only until curated programs are active", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const before = await render(<PathsRoute />);
    expect(before.getByText("A clear next step.")).toBeTruthy();
    mockActivation.curated = true;
    const after = await render(<PathsRoute />);
    expect(after.getByText("No current Path")).toBeTruthy();
    expect(after.queryByText("A clear next step.")).toBeNull();
    expect(after.queryAllByText(generatorWords)).toHaveLength(0);
    expect(after.queryAllByLabelText(/^Choose [A-Z ]+$/)).toHaveLength(0);
  } finally {
    db.close();
  }
});
