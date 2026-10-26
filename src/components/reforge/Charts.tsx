import React, { useId, useState } from "react";
import {
  View,
  Pressable,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Stop,
} from "react-native-svg";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";
import type { Bar, Point } from "../charts";

// REFORGE charts (Phase 7.4C), drawn to the approved Progress reference and
// the Phase 7.0 chart conventions (§6.9): ember line with a fading area, ember
// bars, dashed gridlines with axis values, a few dates below, and a callout on
// the selected point. Same inputs, selection and screen-reader behaviour as
// the Design System 2.0 charts in ../charts.tsx, which Goals keeps until 7.5.

/** A point with an optional short axis date ("Apr 8"). */
export type ForgePoint = Point & { tick?: string };
/** A bar with an optional short axis date ("Apr 8", "Oct"). */
export type ForgeBar = Bar & { tick?: string };

function useSelection(count: number) {
  const [selected, setSelected] = useState(count - 1);
  const at = Math.max(0, Math.min(count - 1, selected));
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "increment")
      setSelected(Math.min(count - 1, at + 1));
    if (e.nativeEvent.actionName === "decrement")
      setSelected(Math.max(0, at - 1));
  };
  return { at, setSelected, onAction };
}
const adjustable = [
  { name: "increment" as const },
  { name: "decrement" as const },
];
const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants" as const,
};

/** Room above the plot for the callout. */
const CALLOUT_ROOM = 30;
const TICK_WIDTH = 64;
const CALLOUT_WIDTH = 120;

/** Decimals that keep neighbouring axis values distinct. */
export function axisDigits(step: number) {
  const s = Math.abs(step);
  return s >= 1 || s === 0 ? 0 : s >= 0.1 ? 1 : 2;
}
/** "86", "82.5", "12K": an axis value, without its unit. */
export function axisText(n: number, digits: number) {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 100) / 10}K`;
  const f = 10 ** digits;
  return (Math.round(n * f) / f).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}
/** Up to four evenly spread indices (first and last always included). */
export function tickIndices(count: number, max = 4) {
  if (count <= max) return [...Array(count).keys()];
  return [
    ...new Set(
      Array.from({ length: max }, (_, k) =>
        Math.round((k * (count - 1)) / (max - 1)),
      ),
    ),
  ];
}
/** A round step (1, 2 or 5 × 10ⁿ) giving about three intervals. */
export function niceStep(max: number, whole: boolean) {
  const raw = Math.max(max / 3, whole ? 1 : 1e-9);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  return whole ? Math.max(1, Math.round(step)) : step;
}

/** Axis values in a column as wide as the longest one. */
function YAxis({
  labels,
  positions,
  height,
}: {
  labels: string[];
  positions: number[];
  height: number;
}) {
  const { fontScale } = useWindowDimensions();
  const longest = Math.max(1, ...labels.map((l) => l.length));
  const width = Math.ceil(longest * 7.4 * Math.min(fontScale || 1, 1.5)) + 6;
  return (
    <View {...hidden} style={{ width, height }}>
      {labels.map((l, i) => (
        <View
          key={`${l}-${i}`}
          style={{
            position: "absolute",
            right: 6,
            left: 0,
            top: positions[i]! - 8,
          }}
        >
          <FText
            variant="axis"
            tone="secondary"
            align="right"
            numberOfLines={1}
          >
            {l}
          </FText>
        </View>
      ))}
    </View>
  );
}

/** A few short dates under the plot, centred on their points. */
function Ticks({
  ticks,
  width,
}: {
  ticks: { x: number; text: string }[];
  width: number;
}) {
  const shown: {
    left: number;
    text: string;
    align: "left" | "center" | "right";
  }[] = [];
  for (const t of ticks) {
    const left = Math.max(
      0,
      Math.min(width - TICK_WIDTH, t.x - TICK_WIDTH / 2),
    );
    const prev = shown[shown.length - 1];
    if (prev && left < prev.left + TICK_WIDTH) continue;
    shown.push({
      left,
      text: t.text,
      align:
        left === 0 ? "left" : left === width - TICK_WIDTH ? "right" : "center",
    });
  }
  return (
    <View {...hidden} style={{ height: 18, marginTop: 4 }}>
      {width > 0 &&
        shown.map((t) => (
          <View
            key={`${t.text}-${t.left}`}
            style={{ position: "absolute", left: t.left, width: TICK_WIDTH }}
          >
            <FText
              variant="axis"
              tone="secondary"
              align={t.align}
              numberOfLines={1}
            >
              {t.text}
            </FText>
          </View>
        ))}
    </View>
  );
}

/** The selected value in a small raised bubble above its point. */
function Callout({
  x,
  y,
  width,
  text,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
}) {
  const c = useColors();
  const left = Math.max(
    0,
    Math.min(width - CALLOUT_WIDTH, x - CALLOUT_WIDTH / 2),
  );
  const align =
    left === 0 && x < CALLOUT_WIDTH / 2
      ? "flex-start"
      : left === width - CALLOUT_WIDTH && x > width - CALLOUT_WIDTH / 2
        ? "flex-end"
        : "center";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        width: CALLOUT_WIDTH,
        // Placed once the plot is measured; present from the first frame.
        opacity: width > 0 ? 1 : 0,
        top: Math.max(0, y - CALLOUT_ROOM),
        alignItems: align,
      }}
    >
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: forge.radii.tile - 4,
          borderWidth: forge.border.card,
          borderColor: c.cardBorder,
          backgroundColor: c.cardRaised,
        }}
      >
        <FText variant="label" weight="700" numberOfLines={1}>
          {text}
        </FText>
      </View>
    </View>
  );
}

/**
 * Sessions or days as an ember line over a fading ember area, with dashed
 * gridlines and their values, short dates below, and the selected point in a
 * ring with its value above. Tap or swipe (screen readers: swipe up or down)
 * to inspect a point.
 */
export function ForgeLineChart({
  points,
  label,
  format,
  axisValue = (v) => v,
  height = 150,
  x: positions,
  breakOver,
  resetKey,
}: {
  points: ForgePoint[];
  label: string;
  /** The value with its unit, as stored values are shown elsewhere. */
  format: (value: number) => string;
  /** The axis number for a stored value (e.g. kilograms shown as pounds). */
  axisValue?: (value: number) => number;
  height?: number;
  /** Horizontal positions (e.g. day numbers) so spacing follows real time. */
  x?: number[];
  /** With `x`: consecutive points further apart than this are not joined. */
  breakOver?: number;
  /** When this changes, the selection returns to the latest point. */
  resetKey?: string;
}) {
  const c = useColors();
  const gradient = `area-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [width, setWidth] = useState(0);
  const { at, setSelected, onAction } = useSelection(points.length);
  const [shownFor, setShownFor] = useState(resetKey);
  if (resetKey !== shownFor) {
    setShownFor(resetKey);
    setSelected(points.length - 1);
  }
  const values = points.map((p) => p.value);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  // As before: the axis spans at least 10% of the value, so a small change
  // never looks like a dramatic one.
  const span = Math.max((hi - lo) * 1.24, hi * 0.1, 1);
  const mid = (hi + lo) / 2;
  const bottom = Math.max(0, mid - span / 2);
  const top = bottom + span;
  const inset = 8;
  const plotTop = CALLOUT_ROOM;
  const plotBottom = height - 4;
  const timed = !!positions && positions.length === points.length;
  const first = timed ? positions[0]! : 0;
  const last = timed ? positions[positions.length - 1]! : points.length - 1;
  const x = (i: number) =>
    points.length === 1 || last === first
      ? width / 2
      : inset +
        (((timed ? positions[i]! : i) - first) * (width - inset * 2)) /
          (last - first);
  const y = (v: number) =>
    plotTop +
    (1 - (v - bottom) / Math.max(1e-9, top - bottom)) * (plotBottom - plotTop);
  const select = (e: GestureResponderEvent) => {
    if (!width || points.length < 2) return;
    const px = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setSelected(best);
  };
  const runs: number[][] = [];
  points.forEach((_, i) => {
    const gap =
      timed && breakOver !== undefined && i > 0
        ? positions[i]! - positions[i - 1]! > breakOver
        : false;
    if (!runs.length || gap) runs.push([i]);
    else runs[runs.length - 1]!.push(i);
  });
  // Four gridlines from the axis floor to its top, labelled in display units.
  const grid = [0, 1, 2, 3].map((k) => bottom + (k * (top - bottom)) / 3);
  const digits = axisDigits(axisValue(grid[1]!) - axisValue(grid[0]!));
  const hit = points[at];
  const ticks = tickIndices(points.length)
    .filter((i) => points[i]!.tick)
    .map((i) => ({ x: x(i), text: points[i]!.tick! }));
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <FText variant="label" tone="secondary" numberOfLines={2}>
        {hit?.description ?? ""}
      </FText>
      <View style={{ flexDirection: "row" }}>
        <YAxis
          labels={grid.map((v) => axisText(axisValue(v), digits))}
          positions={grid.map(y)}
          height={height}
        />
        <View style={{ flex: 1 }}>
          <Pressable
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityValue={{
              text: hit ? `${format(hit.value)}, ${hit.description}` : "",
            }}
            accessibilityActions={adjustable}
            onAccessibilityAction={onAction}
            onPress={select}
            onLayout={(e: LayoutChangeEvent) =>
              setWidth(e.nativeEvent.layout.width)
            }
            style={{ height }}
          >
            {width > 0 && (
              <Svg width={width} height={height}>
                <Defs>
                  <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <Stop
                      offset="0"
                      stopColor={c.emberHot}
                      stopOpacity={0.28}
                    />
                    <Stop offset="1" stopColor={c.emberHot} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                {grid.map((v, k) => (
                  <Line
                    key={`grid-${k}`}
                    x1={0}
                    x2={width}
                    y1={y(v)}
                    y2={y(v)}
                    stroke={c.cardBorder}
                    strokeWidth={1}
                    strokeDasharray={k === 0 ? undefined : "3,4"}
                  />
                ))}
                {runs.map(
                  (run) =>
                    run.length > 1 && (
                      <Path
                        key={`area-${run[0]}`}
                        d={`M${x(run[0]!)},${plotBottom} ${run
                          .map((i) => `L${x(i)},${y(points[i]!.value)}`)
                          .join(
                            " ",
                          )} L${x(run[run.length - 1]!)},${plotBottom} Z`}
                        fill={`url(#${gradient})`}
                      />
                    ),
                )}
                {runs.map(
                  (run) =>
                    run.length > 1 && (
                      <Polyline
                        key={`run-${run[0]}`}
                        points={run
                          .map((i) => `${x(i)},${y(points[i]!.value)}`)
                          .join(" ")}
                        fill="none"
                        stroke={c.emberHot}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ),
                )}
                {points.map(
                  (p, i) =>
                    (points.length <= 40 ||
                      runs.some((r) => r.length === 1 && r[0] === i)) && (
                      <Circle
                        key={`${p.key}-${i}`}
                        cx={x(i)}
                        cy={y(p.value)}
                        r={2.5}
                        fill={c.emberHot}
                      />
                    ),
                )}
                {hit && (
                  <>
                    {points.length > 1 && (
                      <Line
                        x1={x(at)}
                        x2={x(at)}
                        y1={y(hit.value)}
                        y2={plotBottom}
                        stroke={c.emberMuted}
                        strokeWidth={1}
                        strokeDasharray="2,3"
                      />
                    )}
                    <Circle
                      cx={x(at)}
                      cy={y(hit.value)}
                      r={9}
                      fill={c.emberHot}
                      opacity={0.22}
                    />
                    <Circle
                      cx={x(at)}
                      cy={y(hit.value)}
                      r={5}
                      fill={c.cardBg}
                      stroke={c.emberHot}
                      strokeWidth={2.5}
                    />
                  </>
                )}
              </Svg>
            )}
            {hit && (
              <Callout
                x={x(at)}
                y={y(hit.value)}
                width={width}
                text={format(hit.value)}
              />
            )}
          </Pressable>
          <Ticks ticks={ticks} width={width} />
        </View>
      </View>
    </View>
  );
}

/**
 * Ember bars over dashed gridlines, with planned amounts as outlines behind
 * them. The selected bar is solid with its value above; tap or swipe to
 * inspect one.
 */
export function ForgeBarChart({
  bars,
  label,
  format,
  startLabel,
  endLabel,
  height = 120,
}: {
  bars: ForgeBar[];
  label: string;
  /** The selected bar's value for the callout ("3 workouts"). */
  format: (value: number) => string;
  /** Shown under the first and last bars when the bars carry no dates. */
  startLabel: string;
  endLabel: string;
  height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const { at, setSelected, onAction } = useSelection(bars.length);
  const most = Math.max(
    0,
    ...bars.map((b) => Math.max(b.value, b.target ?? 0)),
  );
  const whole = bars.every(
    (b) => Number.isInteger(b.value) && Number.isInteger(b.target ?? 0),
  );
  const step = niceStep(most, whole);
  const top = Math.max(step, Math.ceil(most / step) * step);
  const plotTop = CALLOUT_ROOM;
  const plot = height - plotTop;
  const grid: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) grid.push(v);
  const y = (v: number) => plotTop + (1 - v / top) * plot;
  const gap = bars.length > 26 ? 2 : bars.length > 12 ? 3 : 6;
  const slot = bars.length ? (width + gap) / bars.length : 0;
  const center = (i: number) => i * slot + (slot - gap) / 2;
  const select = (e: GestureResponderEvent) => {
    if (!width) return;
    const i = Math.floor((e.nativeEvent.locationX / width) * bars.length);
    setSelected(Math.max(0, Math.min(bars.length - 1, i)));
  };
  const hit = bars[at];
  const dated = bars.length > 0 && bars.every((b) => b.tick);
  const ticks = dated
    ? tickIndices(bars.length).map((i) => ({
        x: center(i),
        text: bars[i]!.tick!,
      }))
    : [];
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <FText variant="label" tone="secondary" numberOfLines={2}>
        {hit?.description ?? ""}
      </FText>
      <View style={{ flexDirection: "row" }}>
        <YAxis
          labels={grid.map((v) => axisText(v, axisDigits(step)))}
          positions={grid.map(y)}
          height={height}
        />
        <View style={{ flex: 1 }}>
          <Pressable
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityValue={{ text: hit?.description ?? "" }}
            accessibilityActions={adjustable}
            onAccessibilityAction={onAction}
            onPress={select}
            onLayout={(e: LayoutChangeEvent) =>
              setWidth(e.nativeEvent.layout.width)
            }
            style={{ height }}
          >
            {width > 0 && (
              <Svg
                width={width}
                height={height}
                style={{ position: "absolute", left: 0, top: 0 }}
              >
                {grid.map((v, k) => (
                  <Line
                    key={`grid-${k}`}
                    x1={0}
                    x2={width}
                    y1={y(v)}
                    y2={y(v)}
                    stroke={c.cardBorder}
                    strokeWidth={1}
                    strokeDasharray={k === 0 ? undefined : "3,4"}
                  />
                ))}
              </Svg>
            )}
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: plotTop,
                bottom: 0,
                flexDirection: "row",
                alignItems: "flex-end",
                gap,
              }}
            >
              {bars.map((b, i) => {
                const h = (b.value / top) * plot;
                const t = b.target ? (b.target / top) * plot : 0;
                return (
                  <View
                    key={b.key}
                    style={{
                      flex: 1,
                      height: plot,
                      justifyContent: "flex-end",
                    }}
                  >
                    {t > 0 && (
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: t,
                          borderTopLeftRadius: 3,
                          borderTopRightRadius: 3,
                          borderWidth: 1,
                          borderColor: c.text3,
                        }}
                      />
                    )}
                    <View
                      style={{
                        height: Math.max(b.value > 0 ? 3 : 0, h),
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                        backgroundColor: c.emberHot,
                        opacity: i === at ? 1 : 0.7,
                      }}
                    />
                  </View>
                );
              })}
            </View>
            {hit && (
              <Callout
                x={center(at)}
                y={y(hit.value)}
                width={width}
                text={format(hit.value)}
              />
            )}
          </Pressable>
          {dated ? (
            <Ticks ticks={ticks} width={width} />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              <FText variant="axis" tone="secondary">
                {startLabel}
              </FText>
              <FText variant="axis" tone="secondary">
                {endLabel}
              </FText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
