import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { router } from "expo-router";
import ForgePaths from "../../src/screens/ForgePaths";
import { ProgramSummary } from "../../src/components/ProgramSummary";
import { useRepo, confirm } from "../../src/state";
import { pathRepository, pathPreferences } from "../path-fixture";
import { placeholderProgram } from "../program-fixture";
import { acceptPath, currentPath } from "../../src/data/paths";
import { currentEnrollment } from "../../src/data/programs";
import { generatePath } from "../../src/domain/paths/generator";
import { exercises } from "../../src/data/catalog";
import type { CuratedProgram } from "../../src/domain/programs/model";
import strengthDraft from "../../src/programs/library/forge-strength-intermediate-3-day.json";
import muscleDraft from "../../src/programs/library/forge-muscle-beginner-3-day.json";

// Test-only published copies of the development placeholder.
const mockLibrary: CuratedProgram[] = [];
jest.mock("../../src/programs", () => {
  const model = jest.requireActual("../../src/domain/programs/model");
  return {
    get programLibrary() {
      return mockLibrary;
    },
    programSources: [],
    programLock: {},
    libraryPrograms: () => model.publishedPrograms(mockLibrary),
    libraryProgram: (id: string, version: number) =>
      model.findProgramVersion(mockLibrary, id, version),
  };
});
const mockPreview = { enabled: true };
jest.mock("../../src/programs/preview", () => ({
  get draftPreviewEnabled() {
    return mockPreview.enabled;
  },
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  restNotification: jest.fn(async () => {}),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));

const strength = placeholderProgram({
  status: "published",
  id: "test-strength",
  name: "Test Strength Program",
  summary: "Test summary.",
});
const muscle = placeholderProgram({
  status: "published",
  id: "test-muscle",
  name: "Test Muscle Program",
  goal: "Muscle Building",
  experience: "Intermediate",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.enabled = true;
  mockLibrary.splice(0, mockLibrary.length, strength, muscle);
});

test("an empty library shows an honest empty state, not generated content", async () => {
  mockLibrary.splice(0);
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    expect(view.getByText("Programs are on the way")).toBeTruthy();
    expect(view.getByText("Tell Forge where you are")).toBeTruthy();
    // The generated Path builder stays reachable during the transition.
    await fireEvent.press(view.getByLabelText("Open the Path builder"));
    expect(router.push).toHaveBeenLastCalledWith("/paths");
  } finally {
    db.close();
  }
});

test("the library lists published programs and filters by goal", async () => {
  mockLibrary.push(placeholderProgram({ id: "hidden-draft", name: "Draft" }));
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    expect(view.getByText("Test Strength Program")).toBeTruthy();
    expect(view.getByText("Test Muscle Program")).toBeTruthy();
    expect(view.queryByText("Draft")).toBeNull();
    await fireEvent.press(view.getByText("Muscle Building"));
    expect(view.queryByText("Test Strength Program")).toBeNull();
    expect(view.getByText("Test Muscle Program")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("recommend, review, start and train a program", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ experience: "Beginner", goal: "Strength", restDay: 6 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    expect(view.getByText("RECOMMENDED FOR YOU")).toBeTruthy();
    expect(view.getByText(/Written for beginner lifters/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("View program"));
    expect(view.getByText("Mon · Wed · Fri")).toBeTruthy();
    expect(view.getByText(/Sunday stays a rest day/)).toBeTruthy();
    expect(view.getAllByText("1. Barbell Bench Press").length).toBe(3);
    expect(view.getAllByText("1 × 1 reps · 0s rest").length).toBe(3);
    await fireEvent.press(view.getByLabelText("Start this program"));
    expect(confirm).not.toHaveBeenCalled();
    expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(
      "test-strength",
    );
    const dashboard = await render(<ForgePaths />);
    expect(dashboard.getByText("YOUR PROGRAM")).toBeTruthy();
    expect(dashboard.getByText("NEXT SESSION")).toBeTruthy();
    await fireEvent.press(dashboard.getByLabelText("Start session"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(r.active()?.name).toBe(
      "Test Strength Program · Placeholder session a",
    );
    const summary = await render(<ProgramSummary />);
    expect(summary.getByLabelText("Resume program session")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("replacing a generated Path asks first and archives it on confirmation", async () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    await fireEvent.press(view.getByLabelText("View Test Strength Program"));
    await fireEvent.press(view.getByLabelText("Start this program"));
    expect(confirm).toHaveBeenCalledWith(
      "Replace your current plan?",
      expect.stringContaining("preserved"),
      expect.any(Function),
    );
    expect(currentEnrollment(r, mockLibrary)).toBeUndefined();
    await act(async () => jest.mocked(confirm).mock.calls[0]![2]());
    expect(currentPath(r)).toBeUndefined();
    expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(
      "test-strength",
    );
  } finally {
    db.close();
  }
});

test("development builds can preview and train a draft program through the real flow", async () => {
  const draft = strengthDraft as CuratedProgram;
  mockLibrary.splice(0, mockLibrary.length, draft);
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ experience: "Intermediate", goal: "Strength" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    // Drafts are never listed or recommended, even in development.
    expect(view.getByText("No match yet")).toBeTruthy();
    expect(view.getByText("Programs are on the way")).toBeTruthy();
    expect(view.getByText("DEVELOPMENT BUILD ONLY")).toBeTruthy();
    expect(view.queryByText(draft.name)).toBeNull();
    await fireEvent.press(view.getByLabelText("Preview draft programs (1)"));
    await fireEvent.press(view.getByLabelText(`Preview draft ${draft.name}`));
    expect(view.getByText(/DRAFT PREVIEW/)).toBeTruthy();
    expect(view.getByText("Weeks 1–3 · Accumulation")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Start this program"));
    expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(draft.id);
    const dashboard = await render(<ForgePaths />);
    expect(
      dashboard.getByText("DRAFT PREVIEW · DEVELOPMENT BUILD ONLY"),
    ).toBeTruthy();
    expect(dashboard.getByText("Squat + Bench Strength")).toBeTruthy();
    await fireEvent.press(dashboard.getByLabelText("Start session"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(r.active()?.name).toBe(`${draft.name} · Squat + Bench Strength`);
    expect(
      r.workoutExercises(r.active()!.id).map((row) => row.exerciseId),
    ).toEqual(draft.phases[0]!.sessions[0]!.exercises.map((e) => e.exerciseId));
  } finally {
    db.close();
  }
});

test("without a development build drafts stay hidden and cannot be resolved", async () => {
  mockPreview.enabled = false;
  const draft = strengthDraft as CuratedProgram;
  mockLibrary.splice(0, mockLibrary.length, draft);
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    expect(view.queryByText("DEVELOPMENT BUILD ONLY")).toBeNull();
    expect(view.queryByLabelText(/Preview draft/)).toBeNull();
    expect(view.queryByText(draft.name)).toBeNull();
  } finally {
    db.close();
  }
});

test("the development preview lists Strength and Muscle Building drafts and trains either", async () => {
  const strengthPreview = strengthDraft as CuratedProgram;
  const musclePreview = muscleDraft as CuratedProgram;
  mockLibrary.splice(0, mockLibrary.length, strengthPreview, musclePreview);
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ experience: "Beginner", goal: "Muscle Building" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<ForgePaths />);
    expect(view.getByText("No match yet")).toBeTruthy();
    expect(view.queryByText(musclePreview.name)).toBeNull();
    await fireEvent.press(view.getByLabelText("Preview draft programs (2)"));
    expect(view.getByText(strengthPreview.name)).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`Preview draft ${musclePreview.name}`),
    );
    expect(view.getByText(/DRAFT PREVIEW/)).toBeTruthy();
    expect(view.getByText("Repeats each week")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Start this program"));
    expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(
      musclePreview.id,
    );
    const dashboard = await render(<ForgePaths />);
    expect(
      dashboard.getByText("DRAFT PREVIEW · DEVELOPMENT BUILD ONLY"),
    ).toBeTruthy();
    // No planned lower-fatigue week; the lifter may still choose one.
    expect(dashboard.getByText(/Choose a lower-fatigue session/)).toBeTruthy();
    await fireEvent.press(dashboard.getByLabelText("Start session"));
    expect(r.active()?.name).toBe(`${musclePreview.name} · Full Body`);
    expect(
      r.workoutExercises(r.active()!.id).map((row) => row.target?.sets),
    ).toEqual(
      musclePreview.phases[0]!.sessions[0]!.exercises.map((e) => e.sets),
    );
  } finally {
    db.close();
  }
});
