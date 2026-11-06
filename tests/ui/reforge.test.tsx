import React from "react";
import { StyleSheet, Text } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import {
  BadgePill,
  BrandHeader,
  CardHeader,
  CtaButton,
  FText,
  ForgeCard,
  ForgeProgress,
  ForgeRing,
  ForgeScreen,
  HeroCard,
  InfoChip,
  Metric,
  OutlineButton,
  SquareIconButton,
  StatStrip,
  Tile,
} from "../../src/components/reforge";
import { loadBrandFonts } from "../../src/fonts";
import { theme, forge, DISPLAY_FONT } from "../../src/theme";

// Phase 7.1A: the opt-in REFORGE primitives. Each keeps the accessibility
// guarantees of the Design System 2.0 components it sits beside.

const mockProfile: { theme: "dark" | "light" } = { theme: "dark" };
const mockLoadAsync = jest.fn(async (_fonts: Record<string, unknown>) => {});
jest.mock("expo-font", () => ({
  loadAsync: (fonts: Record<string, unknown>) => mockLoadAsync(fonts),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  useApp: (selector: (s: { profile: unknown }) => unknown) =>
    selector({ profile: { ...mockProfile } }),
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  };
});

const dark = theme.palettes.dark;
const light = theme.palettes.light;
const flat = (style: unknown) => StyleSheet.flatten(style as never) ?? {};
const textStyle = (
  view: { getByText: (text: string) => { props: { style?: unknown } } },
  text: string,
) => flat(view.getByText(text).props.style) as Record<string, unknown>;

beforeEach(() => {
  mockProfile.theme = "dark";
});

test("REFORGE text keeps uppercase visual only and caps heading growth", async () => {
  const view = await render(
    <>
      <FText variant="overline">TODAY&apos;S NUTRITION</FText>
      <FText variant="heroTitle" header>
        Push — chest & back
      </FText>
      <FText variant="body">Body copy</FText>
    </>,
  );
  expect(view.getByLabelText("Today's nutrition")).toBeTruthy();
  const hero = view.getByRole("header");
  expect(hero.props.maxFontSizeMultiplier).toBe(1.3);
  expect(flat(hero.props.style).textTransform).toBe("uppercase");
  // Until the display face has loaded, the system face carries the weight.
  expect(flat(hero.props.style).fontWeight).toBe("800");
  expect(flat(hero.props.style).fontFamily).toBeUndefined();
  expect(
    view.getByText("Body copy").props.maxFontSizeMultiplier,
  ).toBeUndefined();
});

test("the display face is used once loaded, without a synthetic weight", async () => {
  const view = await render(<FText variant="heroTitle">Push</FText>);
  await act(async () => {
    loadBrandFonts();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockLoadAsync).toHaveBeenCalledTimes(1);
  expect(Object.keys(mockLoadAsync.mock.calls[0]![0])).toEqual([
    DISPLAY_FONT.bold,
    DISPLAY_FONT.heavy,
  ]);
  const style = flat(view.getByText("Push").props.style);
  expect(style.fontFamily).toBe(DISPLAY_FONT.heavy);
  expect(style.fontWeight).toBeUndefined();
  // Loading again is a no-op.
  loadBrandFonts();
  expect(mockLoadAsync).toHaveBeenCalledTimes(1);
});

test("the gradient CTA is a labelled button that never drops below 54 pt", async () => {
  const press = jest.fn();
  const view = await render(
    <>
      <CtaButton title="Start workout" icon="play" onPress={press} />
      <CtaButton
        title="Finish"
        accessibilityLabel="Finish workout"
        disabled
        onPress={press}
      />
    </>,
  );
  const start = view.getByRole("button", { name: "Start workout" });
  expect(flat(start.props.style).minHeight).toBe(forge.heights.cta);
  expect(textStyle(view, "Start workout").color).toBe(dark.onEmber);
  await fireEvent.press(start);
  expect(press).toHaveBeenCalledTimes(1);
  const finish = view.getByRole("button", { name: "Finish workout" });
  expect(finish.props.accessibilityState).toEqual({ disabled: true });
  await fireEvent.press(finish);
  expect(press).toHaveBeenCalledTimes(1);
});

test("outline and square icon buttons keep 44 pt targets and spoken labels", async () => {
  const press = jest.fn();
  const view = await render(
    <>
      <OutlineButton title="Pause" tone="ember" onPress={press} />
      <OutlineButton title="View goals" compact onPress={press} />
      <SquareIconButton
        icon="ellipsis-horizontal"
        label="More options"
        onPress={press}
      />
    </>,
  );
  const pause = flat(view.getByRole("button", { name: "Pause" }).props.style);
  expect(pause.borderColor).toBe(dark.emberHot);
  expect(pause.minHeight).toBeGreaterThanOrEqual(44);
  expect(
    flat(view.getByRole("button", { name: "View goals" }).props.style)
      .minHeight,
  ).toBeGreaterThanOrEqual(44);
  const more = flat(
    view.getByRole("button", { name: "More options" }).props.style,
  );
  expect(more.width).toBeGreaterThanOrEqual(44);
  expect(more.height).toBeGreaterThanOrEqual(44);
  await fireEvent.press(view.getByLabelText("More options"));
  expect(press).toHaveBeenCalledTimes(1);
});

test("cards are hairline-bordered panels; active cards are outlined in ember", async () => {
  const open = jest.fn();
  const view = await render(
    <>
      <ForgeCard testID="plain">
        <CardHeader title="Calorie goal" trailing="2,400 kcal" />
      </ForgeCard>
      <ForgeCard testID="active" variant="active">
        <Text>Bench press</Text>
      </ForgeCard>
      <ForgeCard onPress={open} accessibilityLabel="Open progress">
        <CardHeader title="Progress snapshot" onPress={open} />
      </ForgeCard>
    </>,
  );
  const plain = flat(view.getByTestId("plain").props.style);
  expect(plain.backgroundColor).toBe(dark.cardBg);
  expect(plain.borderColor).toBe(dark.cardBorder);
  expect(plain.borderWidth).toBe(forge.border.card);
  expect(plain.borderRadius).toBe(forge.radii.card);
  const active = flat(view.getByTestId("active").props.style);
  expect(active.borderColor).toBe(dark.emberMuted);
  // A static header is announced as a heading; a navigating one is a button.
  expect(view.getByRole("header", { name: "Calorie goal" })).toBeTruthy();
  await fireEvent.press(
    view.getByRole("button", { name: "Progress snapshot" }),
  );
  expect(open).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByRole("button", { name: "Open progress" }));
  expect(open).toHaveBeenCalledTimes(2);
});

test("metrics are read as one element; strips and chips stay readable", async () => {
  const view = await render(
    <StatStrip>
      <Metric value="82.4" unit="kg" label="Bodyweight" size="stat" />
      <Metric value="12" label="Day streak" delta="Keep it going" />
    </StatStrip>,
  );
  expect(view.getByLabelText("Bodyweight: 82.4 kg")).toBeTruthy();
  expect(view.getByLabelText("Day streak: 12, Keep it going")).toBeTruthy();
  // A narrow strip wraps rather than squeezing its columns.
  await fireEvent(view.getByTestId("stat-strip"), "layout", {
    nativeEvent: { layout: { width: 120 } },
  });
  expect(view.getByLabelText("Bodyweight: 82.4 kg")).toBeTruthy();
  const chips = await render(
    <>
      <InfoChip icon="barbell-outline" label="6 exercises" />
      <BadgePill icon="flame" value="3" accessibilityLabel="3 week streak" />
      <Tile accessibilityLabel="Log banana" onPress={() => {}}>
        <Text>Banana</Text>
      </Tile>
    </>,
  );
  expect(chips.getByLabelText("6 exercises")).toBeTruthy();
  expect(chips.getByLabelText("3 week streak")).toBeTruthy();
  expect(
    flat(chips.getByRole("button", { name: "Log banana" }).props.style)
      .minHeight,
  ).toBeGreaterThanOrEqual(44);
});

test("strip weights apply while items share one row; wrapped rows are equal", async () => {
  // Jest's window reports a 2× text scale, so columns need 2 × minColumn.
  const strip = (
    <StatStrip weights={[2, 1]} minColumn={60}>
      <Text>Wide</Text>
      <Text>Narrow</Text>
    </StatStrip>
  );
  const view = await render(strip);
  const column = (text: string) =>
    flat(view.getByText(text).parent!.props.style).flex;
  await fireEvent(view.getByTestId("stat-strip"), "layout", {
    nativeEvent: { layout: { width: 300 } },
  });
  expect(column("Wide")).toBe(2);
  expect(column("Narrow")).toBe(1);
  await fireEvent(view.getByTestId("stat-strip"), "layout", {
    nativeEvent: { layout: { width: 150 } },
  });
  expect(column("Wide")).toBe(1);
});

test("progress bars and rings expose their value", async () => {
  const view = await render(
    <>
      <ForgeProgress value={0.81} label="Calories" />
      <ForgeRing value={1.4} label="Kcal of target" />
    </>,
  );
  const [bar, ring] = view.getAllByRole("progressbar");
  expect(bar!.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 81 });
  // Over target is shown as full, never past 100%.
  expect(ring!.props.accessibilityValue).toEqual({
    min: 0,
    max: 100,
    now: 100,
  });
});

test("hero artwork is decorative; without artwork a graphic stands in", async () => {
  const plain = await render(
    <HeroCard tagline={["Stronger", "Further"]}>
      <Text>Session</Text>
    </HeroCard>,
  );
  expect(plain.queryByTestId("hero-artwork")).toBeNull();
  // Decorative words are hidden from screen readers.
  expect(plain.queryByText("Stronger")).toBeNull();
  expect(
    plain.getByText("Stronger", { includeHiddenElements: true }),
  ).toBeTruthy();
  const withArt = await render(
    <HeroCard
      artwork={{ source: { uri: "test.png" }, credit: "Test", license: "Test" }}
    >
      <Text>Session</Text>
    </HeroCard>,
  );
  expect(
    withArt.getByTestId("hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(withArt.queryByTestId("hero-artwork")).toBeNull();
});

test("the brand header names FORGE once and hides the decorative line", async () => {
  const view = await render(
    <BrandHeader>
      <SquareIconButton
        icon="notifications-outline"
        label="Header control"
        onPress={() => {}}
      />
    </BrandHeader>,
  );
  expect(view.getByRole("image", { name: "FORGE" })).toBeTruthy();
  expect(view.queryByText("Built through discipline")).toBeNull();
  expect(view.getByLabelText("Header control")).toBeTruthy();
});

test("the REFORGE screen frame shows the brand header and its content", async () => {
  const view = await render(
    <ForgeScreen footer={<Text>Footer action</Text>}>
      <Text>Card content</Text>
    </ForgeScreen>,
  );
  expect(view.getByRole("image", { name: "FORGE" })).toBeTruthy();
  expect(view.getByText("Card content")).toBeTruthy();
  expect(view.getByText("Footer action")).toBeTruthy();
  const bare = await render(
    <ForgeScreen brand={false}>
      <Text>Only content</Text>
    </ForgeScreen>,
  );
  expect(bare.queryByRole("image", { name: "FORGE" })).toBeNull();
});

test("light mode maps REFORGE components onto the light palette", async () => {
  mockProfile.theme = "light";
  const view = await render(
    <>
      <ForgeCard testID="card">
        <FText variant="overline" tone="accent">
          Light card
        </FText>
      </ForgeCard>
      <CtaButton title="Start" onPress={() => {}} />
    </>,
  );
  const card = flat(view.getByTestId("card").props.style);
  expect(card.backgroundColor).toBe(light.cardBg);
  expect(card.borderColor).toBe(light.cardBorder);
  expect(textStyle(view, "Light card").color).toBe(light.emberHot);
  expect(textStyle(view, "Start").color).toBe(light.onEmber);
});
