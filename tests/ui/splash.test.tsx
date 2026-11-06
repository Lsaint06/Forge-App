import React from "react";
import { Animated, AppState, StyleSheet } from "react-native";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ForgeSplash, INTRO } from "../../src/components/splash/ForgeSplash";
import {
  finishIntro,
  introPending,
  onIntroReplay,
  replayIntro,
} from "../../src/components/splash/session";
import {
  ASSET_GIVE_UP_MS,
  BOKEH_COUNT,
  makeBokeh,
  makeParticles,
  makeSparks,
  PARTICLE_COUNT,
  SPARK_COUNT,
} from "../../src/components/splash/timeline";
import {
  WORDMARK_WIDTH,
  wordmarkLetters,
} from "../../src/components/splash/wordmark";

// The full-intro tests step the whole ~2.5 s animation frame by frame on the
// JS driver (fake timers): about 4 s of real CPU time each on an idle
// machine, so the 5 s default timeout failed them whenever the CPU was busy
// (e.g. alongside an export; Phase 7.4G). The animation clock itself is fake
// and every assertion is unchanged; only the wall-clock budget is wider.
jest.setTimeout(20000);

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  return { GestureHandlerRootView: View };
});
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
}));
jest.mock("expo-router", () => {
  const { View } = jest.requireActual("react-native");
  const Stack = ({ children }: { children: React.ReactNode }) => (
    <View testID="app-navigation">{children}</View>
  );
  Stack.Screen = function Screen() {
    return null;
  };
  Stack.Protected = function Protected({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return <>{children}</>;
  };
  return { Stack };
});
const mockInitialize = jest.fn(async () => {});
jest.mock("../../src/data/native", () => ({
  initializeRepository: () => mockInitialize(),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { profile: undefined }) => unknown) =>
      selector({ profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));

const LABEL = "FORGE. Built through discipline.";
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const phone = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
);
// Jest has no native animation driver, so run the same timelines on the JS
// driver, which honors fake timers.
const timing = Animated.timing;
const spies: jest.SpyInstance[] = [];
let appStateHandler: ((state: string) => void) | undefined;
beforeEach(() => {
  jest.useFakeTimers();
  mockInitialize.mockImplementation(async () => {});
  const native = jest.requireMock("expo-splash-screen");
  native.preventAutoHideAsync.mockImplementation(async () => true);
  native.hideAsync.mockImplementation(async () => {});
  spies.push(
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, h) => {
      appStateHandler = h as (state: string) => void;
      return { remove: jest.fn() } as never;
    }),
  );
  spies.push(
    jest
      .spyOn(Animated, "timing")
      .mockImplementation((value, config) =>
        timing(value, { ...config, useNativeDriver: false }),
      ),
  );
});
afterEach(() => {
  jest.useRealTimers();
  spies.splice(0).forEach((spy) => spy.mockRestore());
});
const advance = async (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const hiddenToo = { includeHiddenElements: true };
// Every image the intro draws, mounted (invisibly) from the first frame.
const images = (view: Awaited<ReturnType<typeof render>>) =>
  view.queryAllByTestId(/^splash-image-/, hiddenToo);
// Every drawn image finishing loading is what starts the intro.
const loadAll = async (view: Awaited<ReturnType<typeof render>>) => {
  for (const image of images(view)) await fireEvent(image, "load");
};
const sceneOpacity = (view: Awaited<ReturnType<typeof render>>) =>
  StyleSheet.flatten(view.getByTestId("splash-scene", hiddenToo).props.style)
    .opacity;
const taglineOpacity = (view: Awaited<ReturnType<typeof render>>) =>
  StyleSheet.flatten(
    view.getByText("BUILT THROUGH DISCIPLINE", hiddenToo).props.style,
  ).opacity;
// One image per drawn layer: smoke, bokeh, a halo and a core per ember,
// sparks, the wordmark's heat glow, and each letter's molten and steel art.
const DRAWN_IMAGES =
  1 +
  BOKEH_COUNT +
  PARTICLE_COUNT * 2 +
  SPARK_COUNT +
  1 +
  wordmarkLetters.length * 2;

test("the wordmark and timeline stay within the intended proportions", () => {
  expect(wordmarkLetters.map((l) => l.key).join("")).toBe("FORGE");
  // Proportions of the approved brand artwork: about 6.4 : 1.
  expect(WORDMARK_WIDTH / 100).toBeCloseTo(6.4, 1);
  expect(INTRO.total).toBeGreaterThanOrEqual(2000);
  expect(INTRO.total).toBeLessThanOrEqual(3000);
  const particles = makeParticles(390, 844, 326, 60);
  expect(particles).toHaveLength(PARTICLE_COUNT);
  // Deterministic: the same device produces the same composition.
  expect(makeParticles(390, 844, 326, 60)).toEqual(particles);
});

test("the full sequence holds the finished logo until the app is ready", async () => {
  const onFinish = jest.fn();
  const view = await render(
    phone(
      <ForgeSplash ready={false} onFinish={onFinish} reduceMotion={false} />,
    ),
  );
  await loadAll(view);
  expect(view.getByLabelText(LABEL)).toBeTruthy();
  expect(view.getByText("BUILT THROUGH DISCIPLINE")).toBeTruthy();
  expect(view.queryByLabelText("Continue to FORGE")).toBeNull();
  await advance(INTRO.total + 500);
  // Slow startup: the logo holds with a loading state; nothing loops.
  expect(onFinish).not.toHaveBeenCalled();
  expect(view.getByLabelText("Preparing FORGE")).toBeTruthy();
  await view.rerender(
    phone(<ForgeSplash ready onFinish={onFinish} reduceMotion={false} />),
  );
  await advance(INTRO.exit + 100);
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test("a ready app finishes after the sequence without waiting further", async () => {
  const onFinish = jest.fn();
  await loadAll(
    await render(
      phone(<ForgeSplash ready onFinish={onFinish} reduceMotion={false} />),
    ),
  );
  await advance(INTRO.total - 200);
  expect(onFinish).not.toHaveBeenCalled();
  await advance(200);
  await advance(INTRO.exit + 100);
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test("there is no tap-to-continue prompt or skip control", async () => {
  const onFinish = jest.fn();
  const view = await render(
    phone(<ForgeSplash ready onFinish={onFinish} reduceMotion={false} />),
  );
  await loadAll(view);
  await advance(300);
  const hidden = { includeHiddenElements: true };
  expect(view.queryByText(/tap to continue/i, hidden)).toBeNull();
  expect(view.queryByLabelText("Continue to FORGE", hidden)).toBeNull();
  expect(view.queryAllByRole("button", hidden)).toHaveLength(0);
  expect(onFinish).not.toHaveBeenCalled();
});

test("reduced motion shows the static logo and leaves with minimal movement", async () => {
  const onFinish = jest.fn();
  const view = await render(
    phone(<ForgeSplash ready={false} onFinish={onFinish} reduceMotion />),
  );
  await loadAll(view);
  expect(view.getByLabelText(LABEL)).toBeTruthy();
  expect(view.getByLabelText("Preparing FORGE")).toBeTruthy();
  await view.rerender(
    phone(<ForgeSplash ready onFinish={onFinish} reduceMotion />),
  );
  await advance(250);
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test("the intro is pending once per runtime; replay is development-only", () => {
  const listener = jest.fn();
  const stop = onIntroReplay(listener);
  finishIntro();
  expect(introPending()).toBe(false);
  replayIntro();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(introPending()).toBe(true);
  stop();
});

test("cold start plays once; resume and remount do not replay", async () => {
  replayIntro();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Root = require("../../app/_layout").default;
  const SplashScreen = jest.requireMock("expo-splash-screen");
  const view = await render(<Root />);
  await loadAll(view);
  expect(view.getByLabelText(LABEL)).toBeTruthy();
  await advance(0);
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
  expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalled();
  // The app mounts beneath the intro; the modal intro hides it from
  // assistive technology until it leaves.
  expect(
    view.getByTestId("app-navigation", { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(view.queryByTestId("app-navigation")).toBeNull();
  // The test setup reports reduced motion, so the intro exits quickly.
  await advance(300);
  expect(view.queryByLabelText(LABEL)).toBeNull();
  await act(async () => appStateHandler?.("background"));
  await act(async () => appStateHandler?.("active"));
  await advance(100);
  expect(view.queryByLabelText(LABEL)).toBeNull();
  await view.unmount();
  const again = await render(<Root />);
  await waitFor(() => expect(again.getByTestId("app-navigation")).toBeTruthy());
  expect(again.queryByLabelText(LABEL)).toBeNull();
  await again.unmount();
});

test("a failing native splash module never blocks startup", async () => {
  replayIntro();
  const native = jest.requireMock("expo-splash-screen");
  native.hideAsync.mockImplementation(() => {
    throw new Error("native module unavailable");
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Root = require("../../app/_layout").default;
  const view = await render(<Root />);
  await waitFor(() =>
    expect(
      view.getByTestId("app-navigation", { includeHiddenElements: true }),
    ).toBeTruthy(),
  );
  await view.unmount();
});

test("startup errors show recovery instead of the intro", async () => {
  replayIntro();
  mockInitialize.mockRejectedValueOnce(new Error("disk unavailable"));
  spies.push(jest.spyOn(console, "error").mockImplementation(() => {}));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Root = require("../../app/_layout").default;
  const view = await render(<Root />);
  await advance(10);
  await waitFor(() =>
    expect(view.getByText("FORGE couldn't open")).toBeTruthy(),
  );
  expect(view.getByText("disk unavailable")).toBeTruthy();
  expect(view.queryByLabelText(LABEL)).toBeNull();
  expect(introPending()).toBe(false);
});

test("nothing but the charcoal background shows until every image loads", async () => {
  const onFinish = jest.fn();
  const view = await render(
    phone(
      <ForgeSplash ready={false} onFinish={onFinish} reduceMotion={false} />,
    ),
  );
  const hidden = { includeHiddenElements: true };
  expect(images(view)).toHaveLength(DRAWN_IMAGES);
  // No drawn stand-in for the artwork: the scene waits invisible and silent,
  // with no letters, effects or tagline showing yet.
  expect(sceneOpacity(view)).toBe(0);
  expect(view.queryByLabelText(LABEL)).toBeNull();
  expect(view.queryByText("BUILT THROUGH DISCIPLINE")).toBeNull();
  const [last, ...rest] = images(view).reverse();
  for (const image of rest) await fireEvent(image, "load");
  await advance(ASSET_GIVE_UP_MS - 100);
  expect(sceneOpacity(view)).toBe(0);
  expect(view.queryByLabelText(LABEL)).toBeNull();
  await fireEvent(last!, "load");
  expect(sceneOpacity(view)).toBe(1);
  expect(view.getByLabelText(LABEL)).toBeTruthy();
  expect(view.getByTestId("splash-smoke", hidden)).toBeTruthy();
  expect(view.getAllByTestId("splash-spark", hidden)).toHaveLength(SPARK_COUNT);
  expect(view.getAllByTestId("splash-bokeh", hidden)).toHaveLength(3);
  expect(view.getAllByTestId("splash-letter-textured", hidden)).toHaveLength(5);
  expect(view.getByTestId("splash-wordmark-glow", hidden)).toBeTruthy();
  // The clock starts once images load; the sequence completes normally.
  await advance(INTRO.total + 100);
  expect(view.getByLabelText("Preparing FORGE")).toBeTruthy();
  expect(onFinish).not.toHaveBeenCalled();
});

// Regression (Mac / Expo Go tunnel, Nov 2026): small preloads finished, the
// clock started, and the full-size letters arrived ~0.8 s late, so the
// letters formed as bare glow outlines, vanished, then popped in. iOS decodes
// and caches each image per display size, so the intro must wait for the
// very images it draws.
test("every image the intro draws has loaded before the sequence starts", async () => {
  const view = await render(
    phone(
      <ForgeSplash ready={false} onFinish={jest.fn()} reduceMotion={false} />,
    ),
  );
  // Every host Image in the tree, visible or not, whatever its test ID.
  type Node = ReturnType<typeof view.toJSON>;
  const drawn = () => {
    const found: string[] = [];
    const walk = (node: Node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.type === "Image") found.push(String(node.props.testID));
      node.children?.forEach((child) => {
        if (typeof child !== "string") walk(child);
      });
    };
    walk(view.toJSON());
    return found;
  };
  const before = drawn();
  expect(before).toHaveLength(DRAWN_IMAGES);
  expect(new Set(before).size).toBe(DRAWN_IMAGES);
  const [last, ...rest] = images(view).reverse();
  for (const image of rest) await fireEvent(image, "load");
  // One image is still loading: the clock hasn't moved.
  await advance(ASSET_GIVE_UP_MS - 100);
  expect(taglineOpacity(view)).toBe(0);
  await fireEvent(last!, "load");
  // The intro draws exactly the images that loaded; none is first requested
  // once it plays.
  expect(drawn()).toEqual(before);
  await advance(INTRO.total + 100);
  expect(taglineOpacity(view)).toBe(1);
});

test("a letter's heat glow is drawn only over its loaded molten image", async () => {
  const view = await render(
    phone(
      <ForgeSplash ready={false} onFinish={jest.fn()} reduceMotion={false} />,
    ),
  );
  const glows = () =>
    view
      .queryAllByTestId(/^splash-letter-glow-/, hiddenToo)
      .map((glow) => glow.props.testID);
  expect(glows()).toEqual([]);
  await fireEvent(view.getByTestId("splash-image-molten-2", hiddenToo), "load");
  expect(glows()).toEqual(["splash-letter-glow-2"]);
  await loadAll(view);
  expect(glows()).toEqual(
    wordmarkLetters.map((_, i) => `splash-letter-glow-${i}`),
  );
});

test.each(["splash-image-smoke", "splash-image-molten-2"])(
  "a failed image (%s) skips the intro instead of drawing a stand-in",
  async (failing) => {
    const onFinish = jest.fn();
    const view = await render(
      phone(
        <ForgeSplash ready={false} onFinish={onFinish} reduceMotion={false} />,
      ),
    );
    const hidden = { includeHiddenElements: true };
    for (const image of images(view))
      await fireEvent(image, image.props.testID === failing ? "error" : "load");
    expect(images(view)).toHaveLength(0);
    expect(view.queryByLabelText(LABEL, hidden)).toBeNull();
    expect(view.queryByTestId("splash-letter-textured", hidden)).toBeNull();
    expect(view.getByLabelText("Preparing FORGE")).toBeTruthy();
    await view.rerender(
      phone(<ForgeSplash ready onFinish={onFinish} reduceMotion={false} />),
    );
    await advance(INTRO.exit + 50);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText(LABEL, hidden)).toBeNull();
  },
);

test("images that never arrive skip the intro after the wait", async () => {
  const onFinish = jest.fn();
  const view = await render(
    phone(<ForgeSplash ready onFinish={onFinish} reduceMotion={false} />),
  );
  const hidden = { includeHiddenElements: true };
  await advance(ASSET_GIVE_UP_MS - 50);
  expect(onFinish).not.toHaveBeenCalled();
  await advance(50);
  expect(images(view)).toHaveLength(0);
  await advance(INTRO.exit + 50);
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(view.queryByLabelText(LABEL, hidden)).toBeNull();
});

test("images that load within the wait play the full intro", async () => {
  const onFinish = jest.fn();
  const view = await render(
    phone(<ForgeSplash ready onFinish={onFinish} reduceMotion={false} />),
  );
  await advance(ASSET_GIVE_UP_MS - 200);
  await loadAll(view);
  await advance(200);
  expect(view.getByLabelText(LABEL)).toBeTruthy();
  await advance(INTRO.total - 200);
  expect(onFinish).not.toHaveBeenCalled();
  await advance(200);
  await advance(INTRO.exit + 50);
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test("reduced motion loads only the finished steel letters", async () => {
  const view = await render(
    phone(<ForgeSplash ready={false} onFinish={jest.fn()} reduceMotion />),
  );
  const hidden = { includeHiddenElements: true };
  expect(images(view).map((p) => p.props.testID)).toEqual(
    [0, 1, 2, 3, 4].map((i) => `splash-image-steel-${i}`),
  );
  // The static logo appears whole, never letter by letter as images arrive.
  expect(sceneOpacity(view)).toBe(0);
  for (const image of images(view)) await fireEvent(image, "load");
  expect(sceneOpacity(view)).toBe(1);
  expect(view.getAllByTestId("splash-letter-textured", hidden)).toHaveLength(5);
  expect(view.queryByTestId("splash-wordmark-glow", hidden)).toBeNull();
  expect(view.queryByTestId("splash-smoke", hidden)).toBeNull();
});

test("the tagline is live off-white text that appears only in the final stage", async () => {
  const view = await render(
    phone(
      <ForgeSplash ready={false} onFinish={jest.fn()} reduceMotion={false} />,
    ),
  );
  await loadAll(view);
  const tagline = () =>
    view.getByText("BUILT THROUGH DISCIPLINE", { includeHiddenElements: true });
  const style = () => Object.assign({}, ...[tagline().props.style].flat());
  expect(style().color).toBe("#F5F3EF");
  await advance(INTRO.settle - 50);
  expect(style().opacity).toBe(0);
  await advance(INTRO.total - INTRO.settle + 150);
  expect(style().opacity).toBe(1);
});

test("letter images and the master vector share one geometry", () => {
  const fs = jest.requireActual("fs") as typeof import("fs");
  const path = jest.requireActual("path") as typeof import("path");
  const root = path.join(__dirname, "../../assets/splash");
  const svg = fs.readFileSync(
    path.join(root, "brand/forge-wordmark.svg"),
    "utf8",
  );
  expect([...svg.matchAll(/<path id="(\w)"/g)].map((m) => m[1]).join("")).toBe(
    "FORGE",
  );
  expect(svg).not.toMatch(/BUILT|<text|<image/i);
  const dims = (f: string) => {
    const b = fs.readFileSync(path.join(root, f));
    return [b.readUInt32BE(16), b.readUInt32BE(20), b[25]] as const;
  };
  // Master plates: shared 1440 x 432 canvas with genuine alpha (RGBA).
  expect(dims("brand/wordmark-molten@3x.png")).toEqual([1440, 432, 6]);
  expect(dims("brand/wordmark-steel@3x.png")).toEqual([1440, 432, 6]);
  expect(dims("brand/wordmark-glow.png")).toEqual([720, 216, 6]);
  // Runtime letters: molten and steel identical in size, each matching its
  // padded letter box in the wordmark geometry.
  const px = 1100 / WORDMARK_WIDTH;
  for (const l of wordmarkLetters) {
    const molten = dims(`wordmark/molten-${l.key}.png`);
    expect(dims(`wordmark/steel-${l.key}.png`)).toEqual(molten);
    expect(molten[2]).toBe(6);
    expect(molten[0]).toBeCloseTo((l.width + 16) * px, -1);
    expect(molten[1]).toBeCloseTo(116 * px, -1);
  }
  const runtime = fs
    .readdirSync(path.join(root, "wordmark"))
    .reduce((n, f) => n + fs.statSync(path.join(root, "wordmark", f)).size, 0);
  expect(runtime).toBeLessThan(600 * 1024);
});

test("effect layouts are deterministic and stay near the wordmark", () => {
  const sparks = makeSparks(326, 60, 5);
  expect(sparks).toHaveLength(SPARK_COUNT);
  expect(makeSparks(326, 60, 5)).toEqual(sparks);
  expect(new Set(sparks.map((s) => s.sprite)).size).toBe(5);
  expect(makeBokeh(390, 844, 3)).toHaveLength(3);
});

test("runtime effect images are present, sized and within budget", () => {
  const fs = jest.requireActual("fs") as typeof import("fs");
  const path = jest.requireActual("path") as typeof import("path");
  const dir = path.join(__dirname, "../../assets/splash/effects");
  const files = fs.readdirSync(dir).sort();
  expect(files).toEqual([
    "bokeh-1.png",
    "bokeh-2.png",
    "bokeh-3.png",
    "ember.png",
    "smoke.png",
    "spark-1.png",
    "spark-2.png",
    "spark-3.png",
    "spark-4.png",
    "spark-5.png",
  ]);
  const size = (f: string) => {
    const b = fs.readFileSync(path.join(dir, f));
    expect(b.subarray(1, 4).toString()).toBe("PNG");
    return [b.readUInt32BE(16), b.readUInt32BE(20), b[25]] as const;
  };
  expect(size("ember.png")).toEqual([64, 64, 4]);
  expect(size("smoke.png")).toEqual([540, 960, 4]);
  for (const f of files.filter((f) => f.startsWith("spark")))
    expect(size(f)).toEqual([32, 160, 6]);
  for (const f of files.filter((f) => f.startsWith("bokeh")))
    expect(size(f)).toEqual([64, 64, 6]);
  const total = files.reduce(
    (n, f) => n + fs.statSync(path.join(dir, f)).size,
    0,
  );
  expect(total).toBeLessThan(150 * 1024);
  // Source downloads stay outside the app bundle.
  const all = fs.readdirSync(path.join(__dirname, "../../assets"), {
    recursive: true,
  }) as string[];
  expect(all.filter((f) => /\.(mp4|zip|blend|exr|jpg)$/i.test(f))).toEqual([]);
});
