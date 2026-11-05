import React from "react";
import { BackHandler, Dimensions, StyleSheet } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { pathRepository } from "../path-fixture";
import WelcomeRoute from "../../src/screens/onboarding/WelcomeRoute";
import { introMark } from "../../src/screens/onboarding/handoff";
import { EntryContext } from "../../src/auth/session";
import type { Entry } from "../../src/auth/entry";
import { INTRO_KEY } from "../../src/domain/onboarding/journey";
import {
  DISCOVER_PAGES,
  LANDING,
  LANDING_SPOKEN,
} from "../../src/domain/onboarding/discover";
import { Intro } from "../../src/screens/onboarding/Intro";
import { BRAND_TAGLINE } from "../../src/components/reforge";
import { dark } from "../../src/components/ui";
import { forgeRoleFor, forgeText } from "../../src/theme";
import { hasLocalData } from "../../src/data/ownership";

// Phase 9.2: before the account, on a fresh phone, the brand intro (Stage A)
// and Discover Forge (Stage B). Every way out leads to Welcome, the account
// screen, which is unchanged (tests/ui/entry-screens.test.tsx); established
// phones and Welcome's messages skip the intro, as before.

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock("../../src/state", () => jest.requireActual("../../src/state"));
let mockRepo: ReturnType<typeof pathRepository>;
jest.mock("../../src/data/native", () => ({
  initializeRepository: async () => {},
  repository: () => mockRepo.r,
}));
jest.mock("../../src/screens/entry/Welcome", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { __esModule: true, default: () => <T>welcome-account</T> };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo = pathRepository();
});
afterEach(() => mockRepo.db.close());

type Context = Partial<React.ContextType<typeof EntryContext>>;
type View = Awaited<ReturnType<typeof render>>;
function open(context: Context = {}, entry: Entry = { kind: "signedOut" }) {
  return render(
    <EntryContext.Provider
      value={{ entry, client: null, finishRecovery: () => {}, ...context }}
    >
      <WelcomeRoute />
    </EntryContext.Provider>,
  );
}
const press = (view: View, name: string) =>
  act(async () => fireEvent.press(view.getByRole("button", { name })));
const buttons = (view: View) =>
  view.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
const seen = () => mockRepo.r.setting(INTRO_KEY);
/** Android's back button, as React Native hands it to a listener. */
type Back = Parameters<typeof BackHandler.addEventListener>[1];
const PRESS = {} as Parameters<Back>[0];

test("a fresh phone opens on the brand: FORGE, BUILT THROUGH DISCIPLINE, and both ways on", async () => {
  const view = await open();
  expect(view.getByTestId("intro-welcome")).toBeTruthy();
  expect(view.getByLabelText("FORGE")).toBeTruthy();
  // The brand line is one heading, said once, whichever layer is showing.
  const line = view.getByRole("header", { name: BRAND_TAGLINE });
  expect(line.props.testID).toBe("intro-welcome-line");
  expect(view.getAllByRole("header", { name: BRAND_TAGLINE })).toHaveLength(1);
  expect(view.getByTestId("intro-welcome-line-intro").props.children).toBe(
    BRAND_TAGLINE,
  );
  // No guest mode, no way into Forge without an account.
  expect(buttons(view)).toEqual(["Get started", "I already have an account"]);
  expect(view.queryByText("welcome-account")).toBeNull();
  expect(seen()).toBeUndefined();
});

test("Stage A says what Forge stands for, not what it holds: THE WORK SHOWS, without a period, one sentence, no statistics", async () => {
  const view = await open();
  // One heading, said as one phrase, with no closing punctuation anywhere.
  const statement = view.getByRole("header", { name: LANDING_SPOKEN });
  expect(statement.props.accessibilityLabel).toBe("The work shows");
  for (const line of LANDING.lines) {
    expect(view.getByText(line)).toBeTruthy();
    expect(line).not.toMatch(/[.,;:!?]$/);
  }
  expect(view.queryByText(/shows\./i)).toBeNull();
  expect(view.getByText(LANDING.support)).toBeTruthy();
  // The numbers belong to Discover now.
  for (const fact of ["18", "3–5", "3,730", "Forge Paths", "Foods built in"])
    expect(view.queryByText(fact)).toBeNull();
  // Its imagery is decoration: no image but the wordmark is announced.
  expect(
    view.getAllByRole("image").map((i) => i.props.accessibilityLabel),
  ).toEqual(["FORGE"]);
  // One composition: no development picker outside the preview.
  expect(buttons(view)).toEqual(["Get started", "I already have an account"]);
});

test("Stage A's type is one system: the wordmark, then three weights, each with one job", async () => {
  const view = await open();
  type Run = { text: string } & Record<string, unknown>;
  const style = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
  const all = view
    .getAllByText(/\S/, { includeHiddenElements: true })
    .map((t): Run => ({ ...style(t), text: String(t.props.children) }))
    // The arrow in Get started is an icon-font glyph, not type.
    .filter((t) => !/ionicons/i.test(String(t.fontFamily ?? "")));
  // Semibold for the brand line and the secondary action, Bold for the
  // statement and the primary action, Regular to read: nothing else.
  expect(new Set(all.map((t) => t.fontWeight ?? "400"))).toEqual(
    new Set(["400", "600", "700"]),
  );
  // The statement: the display face's Bold cut (its weight until the face
  // has loaded), a 4:3 step above the hero title, lightly tracked capitals.
  const size = Math.round(
    (forgeRoleFor("heroTitle", Dimensions.get("window").width).size * 4) / 3,
  );
  for (const line of LANDING.lines)
    expect(all.find((t) => t.text === line)).toMatchObject({
      fontWeight: "700",
      fontSize: size,
      lineHeight: Math.round((size * 31) / 30),
      letterSpacing: size * 0.02,
      textTransform: "uppercase",
    });
  // The sentence: the subtitle role as it is, in the secondary tone.
  expect(all.find((t) => t.text === LANDING.support)).toMatchObject({
    fontSize: forgeText.subtitle.size,
    lineHeight: forgeText.subtitle.lineHeight,
    fontWeight: "400",
  });
  // Only the brand line is tracked wide; everything else is near zero.
  const wide = all.filter((t) => Number(t.letterSpacing ?? 0) > 1);
  expect(wide.map((t) => t.text)).toEqual([BRAND_TAGLINE, BRAND_TAGLINE]);
});

test("Get started: Discover Forge's four pages of real Forge screens, then the account screen", async () => {
  const view = await open();
  await press(view, "Get started");
  for (const [i, page] of DISCOVER_PAGES.entries()) {
    expect(view.getByLabelText(`Page ${i + 1} of 4`)).toBeTruthy();
    expect(view.getByRole("header", { name: page.title })).toBeTruthy();
    expect(view.getByText(page.body)).toBeTruthy();
    // Only the current page is exposed (screen readers read one page), and
    // its product images are decoration: no image is announced.
    for (const other of DISCOVER_PAGES.filter((p) => p !== page))
      expect(view.queryByText(other.body)).toBeNull();
    expect(view.queryAllByRole("image")).toEqual([]);
    expect(buttons(view)).toEqual([
      "Back",
      "Skip to your account",
      i === DISCOVER_PAGES.length - 1 ? "Create your account" : "Next",
    ]);
    if (i < DISCOVER_PAGES.length - 1) await press(view, "Next");
  }
  await press(view, "Create your account");
  expect(view.getByText("welcome-account")).toBeTruthy();
  expect(seen()).toBe("seen");
});

test("Back steps through the pages and returns to the brand; nothing is lost", async () => {
  const view = await open();
  await press(view, "Get started");
  await press(view, "Next");
  expect(view.getByLabelText("Page 2 of 4")).toBeTruthy();
  await press(view, "Back");
  expect(view.getByLabelText("Page 1 of 4")).toBeTruthy();
  await press(view, "Back");
  expect(view.getByTestId("intro-welcome")).toBeTruthy();
  expect(seen()).toBeUndefined();
});

test("Android's back button pages back, then returns to the brand", async () => {
  let handler: Back | undefined;
  const spy = jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event, fn) => {
      handler = fn;
      return { remove: () => void (handler = undefined) };
    });
  try {
    const view = await open();
    expect(handler).toBeUndefined();
    await press(view, "Get started");
    await press(view, "Next");
    await act(async () => expect(handler!(PRESS)).toBe(true));
    expect(view.getByLabelText("Page 1 of 4")).toBeTruthy();
    await act(async () => expect(handler!(PRESS)).toBe(true));
    expect(view.getByTestId("intro-welcome")).toBeTruthy();
    expect(handler).toBeUndefined();
  } finally {
    spy.mockRestore();
  }
});

test("Skip and I already have an account lead straight to the account screen, remembered", async () => {
  let view = await open();
  await press(view, "Get started");
  await press(view, "Skip to your account");
  expect(view.getByText("welcome-account")).toBeTruthy();
  expect(seen()).toBe("seen");
  // After a restart, straight to the account screen.
  await view.unmount();
  view = await open();
  expect(view.getByText("welcome-account")).toBeTruthy();
  expect(view.queryByTestId("intro-welcome")).toBeNull();

  mockRepo.db.close();
  mockRepo = pathRepository();
  view = await open();
  await press(view, "I already have an account");
  expect(view.getByText("welcome-account")).toBeTruthy();
  expect(seen()).toBe("seen");
});

test("the intro never writes training data or claims the phone", async () => {
  const view = await open();
  await press(view, "Get started");
  for (let i = 1; i < DISCOVER_PAGES.length; i++) await press(view, "Next");
  await press(view, "Create your account");
  expect(hasLocalData(mockRepo.r)).toBe(false);
  expect(mockRepo.r.setting("cloudOwner")).toBeUndefined();
  expect(mockRepo.r.outbox()).toEqual([]);
});

test("an established phone signing out goes straight to its sign-in, as before", async () => {
  for (const established of [
    () => mockRepo.r.setSetting("cloudOwner", "user-a"),
    () => mockRepo.r.saveProfile({ onboarded: true }),
    () => mockRepo.r.startWorkout("Push"),
  ]) {
    mockRepo.db.close();
    mockRepo = pathRepository();
    established();
    const view = await open();
    expect(view.getByText("welcome-account")).toBeTruthy();
    expect(view.queryByTestId("intro-welcome")).toBeNull();
    await view.unmount();
  }
});

test("a message that arrives during the intro shows Welcome, and the intro stays away", async () => {
  const provide = (context: Context) => (
    <EntryContext.Provider
      value={{
        entry: { kind: "signedOut" },
        client: null,
        finishRecovery: () => {},
        ...context,
      }}
    >
      <WelcomeRoute />
    </EntryContext.Provider>
  );
  const view = await render(provide({}));
  expect(view.getByTestId("intro-welcome")).toBeTruthy();
  // An email link opens Forge: Welcome says what it did.
  await view.rerender(
    provide({ link: "forge://sign-in#error_code=otp_expired" }),
  );
  expect(view.getByText("welcome-account")).toBeTruthy();
  // A later link with nothing to say doesn't bring the intro back.
  await view.rerender(provide({ link: "forge://welcome" }));
  expect(view.getByText("welcome-account")).toBeTruthy();
  expect(view.queryByTestId("intro-welcome")).toBeNull();
  // Not left by the athlete: a later visit may still show it.
  expect(seen()).toBeUndefined();
});

test("Stage A keeps the wordmark and its line exactly where the launch intro leaves them", async () => {
  const view = await open();
  const mark = introMark(Dimensions.get("window"), { top: 0, bottom: 0 });
  const wordmark = StyleSheet.flatten(view.getByLabelText("FORGE").props.style);
  expect(wordmark).toMatchObject({ width: mark.width, height: mark.height });
  // The intro's own line: the same size, weight, tracking and white.
  const line = StyleSheet.flatten(
    view.getByTestId("intro-welcome-line-intro").props.style,
  );
  expect(line).toMatchObject({
    fontSize: mark.tagline,
    fontWeight: "600",
    letterSpacing: mark.tagline * 0.42,
    textTransform: "uppercase",
    color: dark.text,
    opacity: 1,
  });
  expect(
    StyleSheet.flatten(view.getByTestId("intro-welcome-line").props.style),
  ).toMatchObject({ marginTop: mark.tagline * 1.6 });
  const scroll = view.getByTestId("intro-welcome-scroll");
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
    flexGrow: 1,
  });
  // In the flow, the brand rests after this space; under the intro it is
  // drawn exactly that far down, plus however far it will rise.
  const rest = StyleSheet.flatten(
    view.getByTestId("intro-welcome-rest").props.style,
  ).height;
  const drop =
    StyleSheet.flatten(view.getByTestId("intro-welcome-brand").props.style)
      .transform?.[0]?.translateY ?? 0;
  expect(rest + drop).toBe(mark.top);
});

test("whatever Welcome must say is never hidden behind the intro", async () => {
  const { WORKOUT_CONTINUES_TEXT, DELETED_HERE_TEXT } = jest.requireActual(
    "../../src/domain/presentation/account",
  );
  for (const context of [
    { notice: "You're signed out on this phone." },
    { deletion: DELETED_HERE_TEXT },
    { continuation: { text: WORKOUT_CONTINUES_TEXT, canReturn: true } },
    { link: "forge://sign-in#error_code=otp_expired" },
  ] as Context[]) {
    const view = await open(context);
    expect(view.getByText("welcome-account")).toBeTruthy();
    expect(view.queryByTestId("intro-welcome")).toBeNull();
    await view.unmount();
  }
  // Signed out mid-workout (Stage 4): Welcome, with the way back to it.
  const view = await open(
    { continuation: { text: WORKOUT_CONTINUES_TEXT, canReturn: true } },
    { kind: "continuing", user: { id: "user-a" } },
  );
  expect(view.getByText("welcome-account")).toBeTruthy();
  expect(seen()).toBeUndefined();
});

test("Stage A holds the launch intro's last frame until the intro has faded out, then settles without moving the brand", async () => {
  const { finishIntro, introPending, replayIntro } = jest.requireActual(
    "../../src/components/splash/session",
  );
  expect(introPending()).toBe(true);
  const mark = introMark(Dimensions.get("window"), { top: 0, bottom: 0 });
  const view = await render(<Intro onAccount={() => {}} />);
  const find = (testID: string) =>
    view.getByTestId(testID, { includeHiddenElements: true });
  const style = (testID: string) =>
    StyleSheet.flatten(find(testID).props.style);
  const shift = (testID: string) =>
    style(testID).transform?.[0]?.translateY ?? 0;
  const line = () => style("intro-welcome-line-intro");
  const layout = (testID: string, height: number) =>
    act(async () =>
      fireEvent(find(testID), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 393, height } },
      }),
    );
  try {
    await layout("intro-welcome-screen", 1334);
    await layout("intro-welcome", 150);
    await layout("intro-welcome-statement", 160);
    await layout("intro-welcome-actions", 200);
    // Under the intro: the intro's own frame. The wordmark and its white
    // line exactly where the intro leaves them; nothing else of Stage A but
    // the two ways on.
    expect(
      style("intro-welcome-rest").height + shift("intro-welcome-brand"),
    ).toBe(mark.top);
    expect(line().opacity).toBe(1);
    expect(style("intro-welcome-line-settled").opacity).toBe(0);
    expect(style("intro-welcome-statement").opacity).toBe(0);
    expect(style("landing-wall").opacity).toBe(0);
    await act(async () => finishIntro());
    // Once it has gone: the brand hasn't moved, its line has settled into
    // the secondary tone, and the statement and the wall have emerged.
    expect(shift("intro-welcome-brand")).toBe(0);
    expect(style("intro-welcome-rest").height).toBe(mark.top);
    expect(line().opacity).toBe(0);
    expect(style("intro-welcome-line-settled")).toMatchObject({
      opacity: 1,
      color: dark.text2,
    });
    expect(style("intro-welcome-statement").opacity).toBe(1);
    expect(style("landing-wall").opacity).toBeGreaterThan(0);
  } finally {
    replayIntro();
  }
});
