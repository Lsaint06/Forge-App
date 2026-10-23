import React from "react";
import {
  render,
  fireEvent,
  act,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
import { router } from "expo-router";
import Library from "../../src/screens/programs/Library";
import Details from "../../src/screens/programs/Details";
import Dashboard from "../../src/screens/programs/Dashboard";
import Home from "../../src/screens/Home";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { legacyUserRepository } from "../legacy-fixture";
import { placeholderProgram } from "../program-fixture";
import { currentPath } from "../../src/data/paths";
import { currentEnrollment } from "../../src/data/programs";
import type { CuratedProgram } from "../../src/domain/programs/model";
import strengthJson from "../../src/programs/library/forge-strength-intermediate-3-day.json";
import muscleJson from "../../src/programs/library/forge-muscle-beginner-3-day.json";

// Forge Paths: Library (/forge-paths), Program details
// (/forge-paths/[programId]) and Your program (/forge-paths/current).

// Draft versions of bundled programs, as future programs or new versions are
// authored before publication.
const strengthDraft = { ...strengthJson, status: "draft" } as CuratedProgram;
const muscleDraft = { ...muscleJson, status: "draft" } as CuratedProgram;

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
const mockParams: { programId?: string; version?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
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
  delete mockParams.programId;
  delete mockParams.version;
});

const generatorWords = /builder|generated|generator/i;

// The route Library pushed for a program, applied to the details screen.
function opened(program: Pick<CuratedProgram, "id" | "version">) {
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/forge-paths/[programId]",
    params: { programId: program.id, version: String(program.version) },
  });
  mockParams.programId = program.id;
  mockParams.version = String(program.version);
}

// Start program → choose a date → confirm in the sheet. The enrollment runs
// once the sheet has closed.
async function start(view: RenderResult, when = "Start today") {
  await fireEvent.press(view.getByLabelText("Start program"));
  await fireEvent.press(view.getByLabelText(when));
}

test("an empty library shows an honest empty state, not generated content", async () => {
  mockLibrary.splice(0);
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Library />);
    expect(view.getByText("Programs are on the way")).toBeTruthy();
    expect(view.getByText("Tell Forge where you are")).toBeTruthy();
    expect(view.getByText("0 programs")).toBeTruthy();
    // No generated plan is offered in its place.
    expect(view.queryByLabelText("Open the Path builder")).toBeNull();
    expect(view.queryAllByText(generatorWords)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("the library groups published programs into families by goal and hides drafts", async () => {
  mockLibrary.push(placeholderProgram({ id: "hidden-draft", name: "Draft" }));
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Library />);
    expect(view.getByText("2 programs")).toBeTruthy();
    expect(view.getByText("Strength")).toBeTruthy();
    expect(view.getByText("Muscle Building")).toBeTruthy();
    expect(view.getByText("Beginner Strength")).toBeTruthy();
    expect(view.getByText("Intermediate Muscle Building")).toBeTruthy();
    expect(view.queryByText("Draft")).toBeNull();
    // No internal codes or long summaries in the list.
    expect(view.queryByText("Test summary.")).toBeNull();
    await fireEvent.press(
      view.getByLabelText("Intermediate Muscle Building, 3 days · Ongoing"),
    );
    opened(muscle);
  } finally {
    db.close();
  }
});

test("recommend, review, start and train a program", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ experience: "Beginner", goal: "Strength", restDay: 6 });
    jest.mocked(useRepo).mockReturnValue(r);
    const library = await render(<Library />);
    expect(library.getByText("Recommended for you")).toBeTruthy();
    expect(library.getByText(/Written for beginner lifters/)).toBeTruthy();
    await fireEvent.press(library.getByLabelText("View program"));
    opened(strength);

    const view = await render(<Details />);
    expect(view.getByText("Test Strength Program")).toBeTruthy();
    expect(view.getByText("Mon · Wed · Fri")).toBeTruthy();
    expect(view.getByText(/Sunday stays a rest day/)).toBeTruthy();
    // Workouts start collapsed; each expands to its authored prescription.
    expect(view.queryByText("Barbell Bench Press")).toBeNull();
    for (const id of ["a", "b", "c"])
      await fireEvent.press(
        view.getByLabelText(`Placeholder session ${id}, 1 exercise`),
      );
    expect(view.getAllByText("Barbell Bench Press")).toHaveLength(3);
    expect(view.getAllByText("1 × 1 reps · 0s rest")).toHaveLength(3);
    await start(view);
    await waitFor(() =>
      expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(
        "test-strength",
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenLastCalledWith("/forge-paths/current");

    const dashboard = await render(<Dashboard />);
    expect(dashboard.getByText("Your program")).toBeTruthy();
    expect(dashboard.getByText("Next session")).toBeTruthy();
    await fireEvent.press(dashboard.getByLabelText("Start session"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(r.active()?.name).toBe(
      "Test Strength Program · Placeholder session a",
    );
    const today = await render(<Home />);
    expect(today.getByText("In progress")).toBeTruthy();
    expect(today.getByText("Placeholder session a")).toBeTruthy();
    expect(
      today.getByLabelText("Your program: Test Strength Program"),
    ).toBeTruthy();
    expect(today.getByLabelText("Resume workout")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("replacing a generated Path asks first and archives it on confirmation", async () => {
  // An existing user's generated Path, restored from a pre-Phase-6 backup.
  const { r, db } = legacyUserRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    mockParams.programId = strength.id;
    mockParams.version = "1";
    const view = await render(<Details />);
    await fireEvent.press(view.getByLabelText("Start program"));
    expect(view.getByText(/GET STRONG will be archived/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Start today"));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "Replace your current plan?",
        expect.stringContaining("preserved"),
        expect.any(Function),
      ),
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
    const view = await render(<Library />);
    // Drafts are never listed or recommended, even in development.
    expect(view.getByText("No match yet")).toBeTruthy();
    expect(view.getByText("Programs are on the way")).toBeTruthy();
    expect(view.getByText("Development build only")).toBeTruthy();
    expect(view.queryByText(draft.name)).toBeNull();
    await fireEvent.press(view.getByLabelText("Preview draft programs (1)"));
    await fireEvent.press(view.getByLabelText(`Preview draft ${draft.name}`));
    opened(draft);
    const details = await render(<Details />);
    expect(details.getByText(/Draft preview/)).toBeTruthy();
    expect(details.getByText("Weeks 1–3 · Accumulation")).toBeTruthy();
    await start(details);
    await waitFor(() =>
      expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(draft.id),
    );
    const dashboard = await render(<Dashboard />);
    expect(
      dashboard.getByText("Draft preview · development build only"),
    ).toBeTruthy();
    expect(
      dashboard.getByRole("header", { name: "Squat + Bench Strength" }),
    ).toBeTruthy();
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
    const view = await render(<Library />);
    expect(view.queryByText("Development build only")).toBeNull();
    expect(view.queryByLabelText(/Preview draft/)).toBeNull();
    expect(view.queryByText(draft.name)).toBeNull();
    mockParams.programId = draft.id;
    mockParams.version = String(draft.version);
    const details = await render(<Details />);
    expect(details.getByText("Program unavailable")).toBeTruthy();
    expect(details.queryByLabelText("Start program")).toBeNull();
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
    const view = await render(<Library />);
    expect(view.getByText("No match yet")).toBeTruthy();
    expect(view.queryByText(musclePreview.name)).toBeNull();
    await fireEvent.press(view.getByLabelText("Preview draft programs (2)"));
    expect(view.getByText(strengthPreview.name)).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`Preview draft ${musclePreview.name}`),
    );
    opened(musclePreview);
    const details = await render(<Details />);
    expect(details.getByText(/Draft preview/)).toBeTruthy();
    // One open-ended phase that repeats every week.
    expect(details.getByLabelText("Ongoing, details")).toBeTruthy();
    await start(details);
    await waitFor(() =>
      expect(currentEnrollment(r, mockLibrary)?.data.programId).toBe(
        musclePreview.id,
      ),
    );
    const dashboard = await render(<Dashboard />);
    expect(
      dashboard.getByText("Draft preview · development build only"),
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

test("with all 18 programs published Forge Paths is curated-only and the earlier Path stays available", async () => {
  const library = [
    ...[
      "beginner-3",
      "beginner-4",
      "beginner-5",
      "intermediate-3",
      "intermediate-4",
      "intermediate-5",
      "advanced-3",
      "advanced-4",
      "advanced-5",
    ].flatMap((k) => [
      jest.requireActual(
        `../../src/programs/library/forge-strength-${k}-day.json`,
      ),
      jest.requireActual(
        `../../src/programs/library/forge-muscle-${k}-day.json`,
      ),
    ]),
  ].map((p) => ({ ...p, status: "published" }) as CuratedProgram);
  mockPreview.enabled = false;
  mockLibrary.splice(0, mockLibrary.length, ...library);
  const { r, db } = legacyUserRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Library />);
    expect(view.getByText("18 programs")).toBeTruthy();
    // The existing user's goal "Build muscle", Intermediate, 4 days a week.
    expect(view.getByText("Recommended for you")).toBeTruthy();
    expect(
      view.getByText(/^Intermediate Muscle Building · 4\sDays$/),
    ).toBeTruthy();
    for (const level of ["Beginner", "Intermediate", "Advanced"])
      for (const goal of ["Strength", "Muscle Building"])
        expect(view.getByText(`${level} ${goal}`)).toBeTruthy();
    expect(view.queryByLabelText("Open the Path builder")).toBeNull();
    expect(view.queryAllByText(generatorWords)).toHaveLength(0);
    // The earlier Path stays one tap away and opens its own screen.
    await fireEvent.press(view.getByLabelText("Your Path: GET STRONG"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/paths",
      params: { programId: currentPath(r)!.record.id },
    });
    expect(view.queryByText("Development build only")).toBeNull();
    // Starting a program still asks before replacing the current Path.
    await fireEvent.press(view.getByLabelText("View program"));
    opened(library.find((p) => p.id === "forge-muscle-intermediate-4-day")!);
    const details = await render(<Details />);
    await start(details);
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "Replace your current plan?",
        expect.stringContaining("preserved"),
        expect.any(Function),
      ),
    );
    expect(currentPath(r)?.data.name).toBe("GET STRONG");
  } finally {
    db.close();
  }
});
