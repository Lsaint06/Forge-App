import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, fireEvent, act } from "@testing-library/react-native";
import {
  ForgeBarChart,
  ForgeLineChart,
  type ForgeBar,
  type ForgePoint,
} from "../../src/components/reforge";
import {
  axisDigits,
  axisText,
  niceStep,
  tickIndices,
} from "../../src/components/reforge/Charts";
import { loadIn } from "../../src/domain/workout-display";
import { theme } from "../../src/theme";

// Phase 7.4C: the REFORGE charts used by Progress and Exercise detail. Same
// data, selection and spoken values as the Design System 2.0 charts (which
// Goals keeps until 7.5); new axis values, dates, area, callout and colours.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useApp: (selector: (s: { profile: unknown; revision: number }) => unknown) =>
    selector({ profile: mockProfile, revision: 0 }),
}));
beforeEach(() => {
  mockProfile = undefined;
  mockDims.fontScale = 1;
});

const dark = theme.palettes.dark;
const light = theme.palettes.light;
const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 150 } },
});
const kg = (v: number) => `${v} kg`;
const points = (values: number[]): ForgePoint[] =>
  values.map((value, i) => ({
    key: `p${i}`,
    value,
    description: `Session ${i + 1}`,
    tick: `Apr ${i + 1}`,
  }));
async function measured(el: React.ReactElement, label: string, width = 300) {
  const view = await render(el);
  await act(async () => {
    fireEvent(view.getByLabelText(label), "layout", layout(width));
  });
  return view;
}
type View = Awaited<ReturnType<typeof render>>;
type Host = { type: unknown; props: Record<string, unknown> };
const hosts = (view: View, type: string) =>
  view.container.queryAll((n) => n.type === type) as unknown as Host[];
const texts = (view: View) =>
  hosts(view, "Text").map((n) => [n.props.children].flat().join(""));
/** react-native-svg hands colours to the host as ARGB integers. */
const argb = (hex: string) => parseInt(`FF${hex.slice(1)}`, 16);
const strokeOf = (n: Host) =>
  (n.props.stroke as { payload?: number } | undefined)?.payload;
/** The ember line(s): stroked paths with no fill. */
const lines = (view: View) =>
  hosts(view, "RNSVGPath").filter((n) => n.props.fill === null);
/** The fading areas: paths filled by the gradient. */
const areas = (view: View) =>
  hosts(view, "RNSVGPath").filter(
    (n) => (n.props.fill as { type?: number } | null)?.type === 1,
  );
const gridlines = (view: View) =>
  hosts(view, "RNSVGLine").filter((n) => n.props.x1 === 0);
const dots = (view: View) =>
  hosts(view, "RNSVGCircle").filter((n) => n.props.r === 2.5);

test("axis maths: round steps, distinct values, short numbers, four spread dates", () => {
  expect(niceStep(3, true)).toBe(1);
  expect(niceStep(14, true)).toBe(5);
  expect(niceStep(0, true)).toBe(1);
  expect(niceStep(17800, true)).toBe(10000);
  expect(axisDigits(3.3)).toBe(0);
  expect(axisDigits(0.33)).toBe(1);
  expect(axisDigits(0.033)).toBe(2);
  expect(axisText(82.44, 1)).toBe("82.4");
  expect(axisText(14200, 0)).toBe("14.2K");
  expect(tickIndices(3)).toEqual([0, 1, 2]);
  expect(tickIndices(28)).toEqual([0, 9, 18, 27]);
});

test("line: ember line and area, dashed grid with values, dates, callout and readout", async () => {
  const view = await measured(
    <ForgeLineChart
      label="Bench, heaviest set by session"
      format={kg}
      points={points([100, 102.5, 105, 107.5, 110, 112.5])}
    />,
    "Bench, heaviest set by session",
  );
  const chart = view.getByLabelText("Bench, heaviest set by session");
  // Spoken exactly as before: value and description of the selected point.
  expect(chart.props.accessibilityRole).toBe("adjustable");
  expect(chart.props.accessibilityValue.text).toBe("112.5 kg, Session 6");
  // Callout and readout show the latest point.
  expect(view.getByText("112.5 kg")).toBeTruthy();
  expect(view.getByText("Session 6")).toBeTruthy();
  expect(lines(view)).toHaveLength(1);
  expect(strokeOf(lines(view)[0]!)).toBe(argb(dark.emberHot));
  expect(areas(view)).toHaveLength(1);
  // Four gridlines, the floor solid and the rest dashed, each labelled.
  const grid = gridlines(view);
  expect(grid).toHaveLength(4);
  expect(grid.filter((l) => l.props.strokeDasharray)).toHaveLength(3);
  const shown = texts(view);
  const axis = shown.filter((t) => /^\d+(\.\d)?$/.test(t)).map(Number);
  expect(axis).toHaveLength(4);
  expect(Math.min(...axis)).toBeLessThanOrEqual(100);
  expect(Math.max(...axis)).toBeGreaterThanOrEqual(112);
  // At most four dates, first and last included.
  const dates = shown.filter((t) => /^Apr \d+$/.test(t));
  expect(dates[0]).toBe("Apr 1");
  expect(dates.at(-1)).toBe("Apr 6");
  expect(dates.length).toBeLessThanOrEqual(4);
  // Swipe down: the previous point is selected and spoken.
  await act(async () =>
    chart.props.onAccessibilityAction({
      nativeEvent: { actionName: "decrement" },
    }),
  );
  expect(view.getByText("110 kg")).toBeTruthy();
  expect(
    view.getByLabelText("Bench, heaviest set by session").props
      .accessibilityValue.text,
  ).toBe("110 kg, Session 5");
});

test("line: axis values follow the lifter's units; stored values stay kilograms", async () => {
  const toLb = (v: number) => loadIn(v, "lb");
  const view = await measured(
    <ForgeLineChart
      label="Squat"
      format={(v) => `${toLb(v)} lb`}
      axisValue={toLb}
      points={points([100, 140])}
    />,
    "Squat",
  );
  const axis = texts(view)
    .filter((t) => /^\d+$/.test(t))
    .map(Number);
  expect(Math.max(...axis)).toBeGreaterThanOrEqual(300);
  expect(view.getByText(`${toLb(140)} lb`)).toBeTruthy();
});

test("line: one point (no line or area), long gaps split the line, dense data drops dots", async () => {
  const one = await measured(
    <ForgeLineChart label="One" format={kg} points={points([80])} />,
    "One",
  );
  expect(lines(one)).toHaveLength(0);
  expect(areas(one)).toHaveLength(0);
  expect(one.getByText("80 kg")).toBeTruthy();
  await one.unmount();

  const gappy = await measured(
    <ForgeLineChart
      label="Gaps"
      format={kg}
      points={points([80, 81, 79, 78])}
      x={[0, 7, 100, 107]}
      breakOver={30}
    />,
    "Gaps",
  );
  expect(lines(gappy)).toHaveLength(2);
  expect(areas(gappy)).toHaveLength(2);
  await gappy.unmount();

  const dense = await measured(
    <ForgeLineChart
      label="Dense"
      format={kg}
      points={points(Array.from({ length: 120 }, (_, i) => 80 + (i % 7)))}
    />,
    "Dense",
  );
  // No per-point dots above 40 points: the selected ring only.
  expect(dots(dense)).toHaveLength(0);
  expect(
    texts(dense).filter((t) => /^Apr \d+$/.test(t)).length,
  ).toBeLessThanOrEqual(4);
});

test("bars: ember bars, planned outlines, whole-number axis, dates, callout and tap selection", async () => {
  const bars: ForgeBar[] = [0, 2, 3, 1].map((value, i) => ({
    key: `w${i}`,
    value,
    target: 3,
    description: `Week ${i + 1} · ${value} workouts`,
    tick: `Oct ${i * 7 + 1}`,
  }));
  const view = await measured(
    <ForgeBarChart
      label="Workouts by week"
      format={(n) => `${n} workouts`}
      bars={bars}
      startLabel="Oct 1"
      endLabel="This week"
    />,
    "Workouts by week",
    280,
  );
  const chart = view.getByLabelText("Workouts by week");
  expect(chart.props.accessibilityValue.text).toBe("Week 4 · 1 workouts");
  expect(view.getByText("1 workouts")).toBeTruthy();
  // Axis 0–3 in whole workouts; dates replace the start/end labels.
  const shown = texts(view);
  expect(shown.filter((t) => /^\d$/.test(t))).toEqual(["0", "1", "2", "3"]);
  expect(shown).toEqual(expect.arrayContaining(["Oct 1", "Oct 22"]));
  expect(shown).not.toContain("This week");
  // Tap the second bar.
  await fireEvent.press(chart, { nativeEvent: { locationX: 100 } });
  expect(view.getByText("2 workouts")).toBeTruthy();
  expect(
    view.getByLabelText("Workouts by week").props.accessibilityValue.text,
  ).toBe("Week 2 · 2 workouts");
});

test("bars without dates keep their start and end labels", async () => {
  const view = await measured(
    <ForgeBarChart
      label="Working sets by month"
      format={(n) => `${n} sets`}
      bars={[
        { key: "a", value: 12, description: "Sep" },
        { key: "b", value: 18, description: "Oct" },
      ]}
      startLabel="September 2026"
      endLabel="This month"
    />,
    "Working sets by month",
  );
  expect(view.getByText("September 2026")).toBeTruthy();
  expect(view.getByText("This month")).toBeTruthy();
});

test("light mode uses the light ember; large text widens the axis, capped", async () => {
  mockProfile = { theme: "light" };
  const view = await measured(
    <ForgeLineChart label="Light" format={kg} points={points([90, 95])} />,
    "Light",
  );
  expect(strokeOf(lines(view)[0]!)).toBe(argb(light.emberHot));
  const axisWidth = (v: View) =>
    (
      v.container.queryAll(
        (n) =>
          n.props.importantForAccessibility === "no-hide-descendants" &&
          typeof (n.props.style as { width?: unknown } | undefined)?.width ===
            "number",
      )[0]!.props.style as { width: number }
    ).width;
  const normal = axisWidth(view);
  await view.unmount();
  mockDims.fontScale = 2;
  const big = await measured(
    <ForgeLineChart label="Big" format={kg} points={points([90, 95])} />,
    "Big",
  );
  const wide = axisWidth(big);
  expect(wide).toBeGreaterThan(normal);
  // Capped at 1.5× so the plot keeps its room on a small phone.
  mockDims.fontScale = 3;
  await big.unmount();
  const huge = await measured(
    <ForgeLineChart label="Huge" format={kg} points={points([90, 95])} />,
    "Huge",
  );
  expect(axisWidth(huge)).toBe(wide);
});

test("Goals keeps the Design System 2.0 chart until Phase 7.5", () => {
  const goals = readFileSync(
    join(__dirname, "../../src/screens/Goals.tsx"),
    "utf8",
  );
  expect(goals).toMatch(
    /import \{[^}]*LineChart[^}]*\} from "\.\.\/components\/charts"/,
  );
  expect(goals).not.toMatch(/ForgeLineChart|ForgeBarChart/);
});
