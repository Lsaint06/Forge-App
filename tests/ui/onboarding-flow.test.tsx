import React from "react";
import { BackHandler, StyleSheet } from "react-native";
import {
  render,
  fireEvent,
  act,
  waitFor,
  within,
} from "@testing-library/react-native";
import { router } from "expo-router";
import { pathRepository } from "../path-fixture";
import { SetupOnboarding } from "../../src/screens/onboarding/Flow";
import OnboardingPreview from "../../src/screens/onboarding/Preview";
import {
  ARRIVAL_KEY,
  ONBOARDING_KEY,
  readArrival,
  readProgress,
  revealFor,
  revealWorkouts,
  writeProgress,
} from "../../src/domain/onboarding/journey";
import {
  plainSummary,
  revealFit,
  revealTitle,
} from "../../src/domain/onboarding/reveal";
import { entryState } from "../../src/auth/entry";
import { currentEnrollment } from "../../src/data/programs";
import { hasLocalData } from "../../src/data/ownership";
import { programKey, publishedPrograms } from "../../src/domain/programs/model";
import { prescriptionLine } from "../../src/domain/programs/presentation";
import { restDayNames } from "../../src/domain/profile";
import { programLibrary } from "../../src/programs";
import { kgToLb } from "../../src/domain/metrics";

// Phase 9.2: first-time setup after the account, on a real SQLite profile:
// About you, Your training, then the Forge Path the real engine recommends,
// shown read-only. Each answer is saved as it is given, setup resumes where
// it was after a restart, and finishing enrolls nothing and opens Forge.

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));
// The real app state, over a real SQLite repository.
jest.mock("../../src/state", () => jest.requireActual("../../src/state"));
let mockRepo: ReturnType<typeof pathRepository>;
jest.mock("../../src/data/native", () => ({
  initializeRepository: async () => {},
  repository: () => mockRepo.r,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo = pathRepository();
  mockRepo.r.setSetting("cloudOwner", "user-a");
});
afterEach(() => mockRepo.db.close());

type View = Awaited<ReturnType<typeof render>>;
const notYou = jest.fn();
const account = { who: "a@example.com", onNotYou: notYou };
const open = () => render(<SetupOnboarding account={account} />);
const press = (view: View, name: string | RegExp) =>
  act(async () => fireEvent.press(view.getByRole("button", { name })));
const pick = (view: View, name: string) =>
  act(async () => fireEvent.press(view.getByRole("radio", { name })));
const type = (view: View, label: string, text: string) =>
  act(async () => fireEvent.changeText(view.getByLabelText(label), text));
const title = (view: View, text: string) =>
  expect(view.getByRole("header", { name: text })).toBeTruthy();
const r = () => mockRepo.r;
const progress = () => readProgress(r().setting(ONBOARDING_KEY));
/** Android's back button, as React Native hands it to a listener. */
type Back = Parameters<typeof BackHandler.addEventListener>[1];
const PRESS = {} as Parameters<Back>[0];

async function aboutYou(view: View) {
  await type(view, "Your name", "Sam");
  await type(view, "Height (cm)", "180");
  await type(view, "Starting weight (kg)", "80");
  await press(view, "Continue");
}
async function yourTraining(
  view: View,
  answers = { experience: "Intermediate", goal: "Strength", days: 4, rest: 6 },
) {
  await pick(view, answers.experience);
  await pick(view, answers.goal);
  await pick(view, `${answers.days} days`);
  await pick(view, restDayNames[answers.rest]!);
}
/** Every row of every table except settings, as stored. */
function dump() {
  return Object.fromEntries(
    r()
      .db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .map(({ name }) => [
        name,
        r().db.all(`SELECT * FROM "${name}" ORDER BY rowid`),
      ]),
  );
}

test("a new athlete sets up, sees the Forge Path the engine recommends, and enters Forge with nothing started", async () => {
  const view = await open();
  title(view, "About you");
  // Who is being set up stays on screen, in one line beside Back.
  expect(
    view.getByRole("button", { name: "Setting up Forge for a@example.com" }),
  ).toBeTruthy();
  expect(view.getByLabelText("Step 1 of 3")).toBeTruthy();
  expect(
    view.getByTestId("onboarding-step-1", { includeHiddenElements: true }),
  ).toBeTruthy();
  await aboutYou(view);
  // Saved to the profile as typed, as setup always has.
  expect(r().profile()).toMatchObject({ name: "Sam", height: 180, weight: 80 });
  expect(r().profile().onboarded).toBe(false);

  title(view, "Your training");
  expect(view.getByLabelText("Step 2 of 3")).toBeTruthy();
  expect(
    view.getByTestId("onboarding-step-2", { includeHiddenElements: true }),
  ).toBeTruthy();
  await yourTraining(view);
  expect(r().profile()).toMatchObject({
    experience: "Intermediate",
    goal: "Strength",
    frequency: 4,
    restDay: 6,
  });
  await press(view, "See my Forge Path");

  title(view, "Your Forge Path");
  const reveal = revealFor(r().profile(), progress(), programLibrary)!;
  const { program } = reveal;
  expect([program.experience, program.goal, program.daysPerWeek]).toEqual([
    "Intermediate",
    "Strength",
    4,
  ]);
  expect(progress()).toEqual({
    stage: "reveal",
    days: 4,
    revealed: `${program.id}@${program.version}`,
  });
  // First layer: who it's for, the program, why it fits, its shape.
  const hero = within(view.getByTestId("onboarding-reveal"));
  expect(hero.getByRole("header", { name: revealTitle(program) })).toBeTruthy();
  expect(hero.getByText("Built for Sam")).toBeTruthy();
  expect(
    hero.getByLabelText(`Why it fits: ${reveal.reasons.join(" ")}`),
  ).toBeTruthy();
  for (const row of revealFit(program, 6))
    expect(hero.getByText(row.value)).toBeTruthy();
  expect(view.getByLabelText("Weeks: 8")).toBeTruthy();
  expect(view.getByLabelText("Sessions: 32")).toBeTruthy();
  // No internal code anywhere on screen.
  expect(view.queryByText(/\b[A-Z]-[A-Z]\d\b|\bV2\b/)).toBeNull();
  // Second layer: the week, around the rest day.
  expect(
    view.getByLabelText(
      `Training days: ${reveal.weekdays.map((d) => restDayNames[d]).join(", ")}. Rest day: Sunday.`,
    ),
  ).toBeTruthy();
  expect(view.getByText(/around your rest day on Sunday/)).toBeTruthy();
  // Third layer: the equipment and the first workout, open.
  for (const item of program.equipment)
    expect(
      within(view.getByTestId("onboarding-equipment")).getByText(item),
    ).toBeTruthy();
  const first = revealWorkouts(program)[0]!;
  for (const item of first.session.exercises) {
    expect(
      view.getAllByText(r().exercise(item.exerciseId)!.name).length,
    ).toBeGreaterThan(0);
    expect(view.getAllByText(prescriptionLine(item)).length).toBeGreaterThan(0);
  }

  await press(view, "Enter Forge");
  expect(r().profile().onboarded).toBe(true);
  expect(router.replace).toHaveBeenCalledWith("/(tabs)");
  // Setup's record goes; Home remembers the Forge Path shown. Nothing was
  // enrolled, started or bought.
  expect(r().setting(ONBOARDING_KEY)).toBeUndefined();
  expect(readArrival(r().setting(ARRIVAL_KEY))).toBe(programKey(program));
  expect(currentEnrollment(r())).toBeUndefined();
  expect(r().journal("program")).toEqual([]);
  expect(r().active()).toBeUndefined();
  // Forge opens on the account's own training: no membership is asked for.
  expect(
    entryState({
      configured: true,
      session: { id: "user-a" },
      owner: "user-a",
      hasLocalData: hasLocalData(r()),
      onboarded: r().profile().onboarded,
    }).kind,
  ).toBe("ready");
});

test("the account chip explains whose setup this is and offers Setup's own way out", async () => {
  const view = await open();
  expect(view.queryByRole("button", { name: "Sign out" })).toBeNull();
  await press(view, "Setting up Forge for a@example.com");
  // The sheet says it in full, beside the chip's short form.
  expect(view.getByText("Setting up Forge for")).toBeTruthy();
  expect(view.getAllByText("a@example.com")).toHaveLength(2);
  expect(notYou).not.toHaveBeenCalled();
  await press(view, "Sign out");
  // Once the sheet has closed (iOS can't present over a closing sheet).
  await waitFor(() => expect(notYou).toHaveBeenCalledTimes(1), {
    timeout: 2000,
  });
  // Nothing was written by asking.
  expect(r().profile().onboarded).toBe(false);
});

test("setup resumes exactly where it was after a restart, at every step", async () => {
  let view = await open();
  await type(view, "Height (cm)", "175");
  await view.unmount();
  // Mid-way through About you: what was typed is kept.
  view = await open();
  title(view, "About you");
  expect(view.getByLabelText("Height (cm)").props.value).toBe("175");
  await type(view, "Starting weight (kg)", "70");
  await press(view, "Continue");
  await pick(view, "Beginner");
  await pick(view, "Muscle Building");
  await view.unmount();

  view = await open();
  title(view, "Your training");
  expect(
    view.getByRole("radio", { name: "Beginner" }).props.accessibilityState,
  ).toMatchObject({ selected: true });
  await pick(view, "3 days");
  await pick(view, "Wednesday");
  await press(view, "See my Forge Path");
  const shown = view.getByTestId("onboarding-reveal");
  const name = within(shown).getByRole("header").props.children;
  await view.unmount();

  view = await open();
  title(view, "Your Forge Path");
  expect(
    within(view.getByTestId("onboarding-reveal")).getByRole("header").props
      .children,
  ).toBe(name);
});

test("Back steps through setup one step at a time and keeps every answer", async () => {
  const view = await open();
  await aboutYou(view);
  await yourTraining(view);
  await press(view, "See my Forge Path");
  title(view, "Your Forge Path");
  await press(view, "Back");
  title(view, "Your training");
  expect(
    view.getByRole("radio", { name: "4 days" }).props.accessibilityState,
  ).toMatchObject({ selected: true });
  await press(view, "Back");
  title(view, "About you");
  expect(view.getByLabelText("Your name").props.value).toBe("Sam");
  expect(view.getByLabelText("Starting weight (kg)").props.value).toBe("80");
  // Forward again: the same answers, the same Forge Path.
  await press(view, "Continue");
  await press(view, "See my Forge Path");
  title(view, "Your Forge Path");
});

test("Android's back button steps back through setup like the on-screen Back", async () => {
  let handler: Back | undefined;
  const spy = jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event, fn) => {
      handler = fn;
      return { remove: () => void (handler = undefined) };
    });
  try {
    const view = await open();
    // About you is setup's first step: back is left to the system.
    expect(handler).toBeUndefined();
    await aboutYou(view);
    await yourTraining(view);
    await press(view, "See my Forge Path");
    title(view, "Your Forge Path");
    await act(async () => expect(handler!(PRESS)).toBe(true));
    title(view, "Your training");
    await act(async () => expect(handler!(PRESS)).toBe(true));
    title(view, "About you");
    expect(handler).toBeUndefined();
    expect(r().profile()).toMatchObject({ name: "Sam", frequency: 4 });
  } finally {
    spy.mockRestore();
  }
});

test("days a week: only what Forge Paths offers, and nothing until the athlete chooses", async () => {
  r().saveProfile({ height: 180, weight: 80 });
  r().setSetting(ONBOARDING_KEY, writeProgress({ stage: "training" }));
  const view = await open();
  title(view, "Your training");
  const days = view
    .getAllByRole("radio")
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => / days$/.test(l));
  expect(days).toEqual(["3 days", "4 days", "5 days"]);
  // A new profile's default weekly goal (3) is never taken as a choice.
  expect(r().profile().frequency).toBe(3);
  for (const d of days)
    expect(
      view.getByRole("radio", { name: d }).props.accessibilityState,
    ).toMatchObject({ selected: false });
  const cta = () => view.getByRole("button", { name: "See my Forge Path" });
  expect(cta().props.accessibilityState).toMatchObject({ disabled: true });
  expect(
    view.getByText(
      "Still to choose: your experience, your goal, days a week and a rest day.",
    ),
  ).toBeTruthy();
  await press(view, "See my Forge Path");
  title(view, "Your training");
  await yourTraining(view, {
    experience: "Advanced",
    goal: "Muscle Building",
    days: 5,
    rest: 0,
  });
  expect(cta().props.accessibilityState).toMatchObject({ disabled: false });
  expect(view.queryByText(/Still to choose/)).toBeNull();
  expect(r().profile().frequency).toBe(5);
});

test("About you asks for a height and starting weight, refuses impossible values and explains", async () => {
  const view = await open();
  await press(view, "Continue");
  title(view, "About you");
  expect(
    view.getByText("Add your height and starting weight to continue."),
  ).toBeTruthy();
  await type(view, "Height (cm)", "301");
  expect(
    view.getByText("Enter a valid height in centimetres (up to 300)."),
  ).toBeTruthy();
  expect(r().profile().height).toBe(0);
  await type(view, "Height (cm)", "182,5");
  expect(r().profile().height).toBe(182.5);
  await type(view, "Starting weight (kg)", "heavy");
  expect(
    view.getByText("Enter a weight up to 700 kg (1,543 lb)."),
  ).toBeTruthy();
  await type(view, "Starting weight (kg)", "90");
  await type(view, "Body fat % (optional)", "140");
  expect(
    view.getByText("Enter a percentage from 0 to 100, or leave it empty."),
  ).toBeTruthy();
  await press(view, "Continue");
  title(view, "About you");
  expect(
    view.getByText("Check the highlighted fields to continue."),
  ).toBeTruthy();
  await type(view, "Body fat % (optional)", "");
  await press(view, "Continue");
  title(view, "Your training");
  // An empty name keeps Forge's default.
  expect(r().profile().name).toBe("Athlete");
});

test("pounds mean feet and inches; the stored profile stays in kilograms and centimetres", async () => {
  const view = await open();
  await type(view, "Starting weight (kg)", "80");
  await pick(view, "Pounds, feet and inches");
  expect(r().profile().units).toBe("lb");
  expect(view.getByLabelText("Starting weight (lb)").props.value).toBe(
    String(Math.round(kgToLb(80) * 100) / 100),
  );
  await type(view, "Height (ft)", "5");
  await type(view, "Height (in)", "11");
  expect(r().profile().height).toBeCloseTo(180.34, 2);
  await type(view, "Height (in)", "12");
  expect(
    view.getByText("Enter a valid height in feet and inches (0–11 inches)."),
  ).toBeTruthy();
  expect(r().profile().height).toBeCloseTo(180.34, 2);
  await type(view, "Starting weight (lb)", "200");
  expect(r().profile().weight).toBeCloseTo(90.72, 2);
});

test("the reveal is read-only: no start, no logging, no way into Forge Paths before setup is done", async () => {
  const view = await open();
  await aboutYou(view);
  await yourTraining(view);
  await press(view, "See my Forge Path");
  const before = dump();
  const buttons = view
    .getAllByRole("button")
    .map((b) => b.props.accessibilityLabel as string);
  expect(
    buttons.some((b) => /start|log|begin|enroll|subscribe|trial/i.test(b)),
  ).toBe(false);
  expect(view.queryByText(/Start program|Start workout|Resume/)).toBeNull();
  // Everything that can be opened only shows more of the program (the
  // account chip is setup's own, tested above).
  for (const name of buttons.filter(
    (b) => !/^(Back|Enter Forge|Setting up Forge for .*)$/.test(b),
  ))
    await press(view, name);
  expect(router.push).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
  expect(router.dismissTo).not.toHaveBeenCalled();
  expect(dump()).toEqual(before);
  expect(currentEnrollment(r())).toBeUndefined();
  expect(r().active()).toBeUndefined();
});

test("every one of the 18 published programs is revealed exactly as authored", async () => {
  const programs = publishedPrograms(programLibrary);
  expect(programs).toHaveLength(18);
  for (const program of programs) {
    mockRepo.db.close();
    mockRepo = pathRepository();
    r().saveProfile({
      name: "Sam",
      height: 180,
      weight: 80,
      experience: program.experience,
      goal: program.goal,
      frequency: program.daysPerWeek,
      restDay: 6,
    });
    r().setSetting(
      ONBOARDING_KEY,
      writeProgress({ stage: "reveal", days: program.daysPerWeek }),
    );
    const view = await open();
    const reveal = revealFor(r().profile(), progress(), programLibrary)!;
    expect(reveal.program).toBe(program);
    const hero = within(view.getByTestId("onboarding-reveal"));
    expect(
      hero.getByRole("header", { name: revealTitle(program) }),
    ).toBeTruthy();
    for (const row of revealFit(program, 6))
      expect(hero.getAllByText(row.value).length).toBeGreaterThan(0);
    expect(
      view.getByLabelText(
        `Training days: ${reveal.weekdays.map((d) => restDayNames[d]).join(", ")}. Rest day: Sunday.`,
      ),
    ).toBeTruthy();
    // Each distinct workout is listed with its day and exercise count.
    for (const w of revealWorkouts(program)) {
      const count = `${w.session.exercises.length} ${w.session.exercises.length === 1 ? "exercise" : "exercises"}`;
      expect(
        view.getAllByLabelText(`${w.session.name}, ${count}`).length,
      ).toBeGreaterThan(0);
    }
    const first = revealWorkouts(program)[0]!;
    for (const item of first.session.exercises)
      expect(view.getAllByText(prescriptionLine(item)).length).toBeGreaterThan(
        0,
      );
    const equipment = within(view.getByTestId("onboarding-equipment"));
    for (const item of program.equipment)
      expect(equipment.getByText(item)).toBeTruthy();
    if (program.phases.length > 1)
      for (const phase of program.phases)
        expect(view.getAllByText(phase.name).length).toBeGreaterThan(0);
    // The program's own summary, without its internal code.
    await press(view, "About this program");
    expect(view.getByText(plainSummary(program))).toBeTruthy();
    await view.unmount();
  }
});

test("the development preview walks the whole journey and saves nothing", async () => {
  r().saveProfile({
    name: "Founder",
    height: 180,
    weight: 82,
    onboarded: true,
  });
  const before = dump();
  const settings = r().db.all("SELECT * FROM settings ORDER BY key");
  const view = await render(<OnboardingPreview />);
  expect(view.getByTestId("onboarding-preview-banner")).toBeTruthy();
  expect(view.getByTestId("intro-welcome")).toBeTruthy();
  await press(view, "Get started");
  await press(view, "Skip to your account");
  title(view, "About you");
  // A new athlete's setup, not the founder's profile.
  expect(view.getByLabelText("Your name").props.value).toBe("");
  await aboutYou(view);
  await yourTraining(view, {
    experience: "Beginner",
    goal: "Strength",
    days: 3,
    rest: 6,
  });
  await press(view, "See my Forge Path");
  title(view, "Your Forge Path");
  await press(view, "Enter Forge");
  expect(router.back).toHaveBeenCalled();
  // Nothing was written: profile, training, settings, outbox.
  expect(dump()).toEqual(before);
  expect(r().db.all("SELECT * FROM settings ORDER BY key")).toEqual(settings);
  expect(r().profile()).toMatchObject({ name: "Founder", onboarded: true });
});

test("after setup, training works as before", async () => {
  const view = await open();
  await aboutYou(view);
  await yourTraining(view);
  await press(view, "See my Forge Path");
  await press(view, "Enter Forge");
  const w = r().startWorkout("Push");
  const row = r().addExercise(w.id, "barbell-bench-press");
  r().editSet(r().addSet(row.id).id, { weight: 60, reps: 5, completed: true });
  r().finishWorkout(w.id);
  expect(r().workout(w.id)?.status).toBe("completed");
  expect(r().active()).toBeUndefined();
});

test("the rest day is a week of whole short names, each read in full", async () => {
  r().saveProfile({ height: 180, weight: 80 });
  r().setSetting(ONBOARDING_KEY, writeProgress({ stage: "training" }));
  const view = await open();
  title(view, "Your training");
  for (const name of restDayNames) {
    // Seen as "Mon" … "Sun", never broken; heard as "Monday" … "Sunday".
    expect(view.getByText(name.slice(0, 3))).toBeTruthy();
    expect(view.getByRole("radio", { name })).toBeTruthy();
  }
  await pick(view, "Wednesday");
  expect(
    view.getByRole("radio", { name: "Wednesday" }).props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(view.getByText("REST")).toBeTruthy();
  expect(r().profile().restDay).toBe(2);
});

test("until Your training is complete, its action is a legible outline, never a dimmed button", async () => {
  r().saveProfile({ height: 180, weight: 80 });
  r().setSetting(ONBOARDING_KEY, writeProgress({ stage: "training" }));
  const view = await open();
  const cta = () => view.getByRole("button", { name: "See my Forge Path" });
  expect(cta().props.accessibilityState).toMatchObject({ disabled: true });
  const style = StyleSheet.flatten(cta().props.style);
  expect(style.opacity ?? 1).toBe(1);
  await yourTraining(view);
  expect(cta().props.accessibilityState).toMatchObject({ disabled: false });
  expect(StyleSheet.flatten(cta().props.style).opacity ?? 1).toBe(1);
});

test("About you: placeholders never look like answers, and what's missing is said above the action", async () => {
  const view = await open();
  expect(view.getByLabelText("Your name").props.placeholder).toBe("First name");
  expect(view.getByLabelText("Height (cm)").props.placeholder).toBeUndefined();
  expect(
    view.getByLabelText("Starting weight (kg)").props.placeholder,
  ).toBeUndefined();
  expect(view.getByLabelText("Body fat % (optional)").props.placeholder).toBe(
    "Optional",
  );
  await press(view, "Continue");
  expect(
    view.getByRole("alert", {
      name: "Add your height and starting weight to continue.",
    }),
  ).toBeTruthy();
  // Each field says what it needs.
  expect(view.getByText("Enter your height.")).toBeTruthy();
  expect(view.getByText("Enter your starting weight.")).toBeTruthy();
});
