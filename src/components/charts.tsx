import React, { useState } from "react";
import {
  View,
  Pressable,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { Txt, useColors } from "./ui";
import { theme } from "../theme";

// Progress charts (Design System 2.0, Phase 5). Both are adjustable for
// screen readers: swipe up or down to move through the points.

function useSelection(count: number, initial = count - 1) {
  const [selected, setSelected] = useState(initial);
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

export type Bar = {
  key: string;
  value: number;
  /** Planned amount, drawn as an outline behind the bar. */
  target?: number;
  /** Shown above the chart when selected and read by screen readers. */
  description: string;
};

/** Bars with optional planned targets; tap or swipe to inspect one. */
export function BarChart({
  bars,
  label,
  startLabel,
  endLabel,
  height = 112,
}: {
  bars: Bar[];
  label: string;
  startLabel: string;
  endLabel: string;
  height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const { at, setSelected, onAction } = useSelection(bars.length);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.target ?? 0)));
  const gap = bars.length > 26 ? 2 : bars.length > 12 ? 3 : 6;
  const select = (e: GestureResponderEvent) => {
    if (!width) return;
    const i = Math.floor((e.nativeEvent.locationX / width) * bars.length);
    setSelected(Math.max(0, Math.min(bars.length - 1, i)));
  };
  const hit = bars[at];
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Txt variant="caption" tone="secondary" numberOfLines={2}>
        {hit?.description ?? ""}
      </Txt>
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
        style={{ height, flexDirection: "row", alignItems: "flex-end", gap }}
      >
        {bars.map((b, i) => {
          const h = (b.value / max) * height;
          const t = b.target ? (b.target / max) * height : 0;
          return (
            <View
              key={b.key}
              style={{ flex: 1, height, justifyContent: "flex-end" }}
            >
              {t > 0 && (
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: t,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: c.text3,
                  }}
                />
              )}
              <View
                style={{
                  height: Math.max(b.value > 0 ? 3 : 0, h),
                  borderRadius: 4,
                  backgroundColor: c.success,
                  opacity: i === at ? 1 : 0.7,
                }}
              />
              {i === at && (
                <View
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: -8,
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    borderRadius: 2,
                    backgroundColor: c.text,
                  }}
                />
              )}
            </View>
          );
        })}
      </Pressable>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <Txt variant="caption" tone="tertiary">
          {startLabel}
        </Txt>
        <Txt variant="caption" tone="tertiary">
          {endLabel}
        </Txt>
      </View>
    </View>
  );
}

export type Point = { key: string; value: number; description: string };

/** A line through recorded sessions; tap or swipe to inspect a point. */
export function LineChart({
  points,
  label,
  format,
  height = 150,
}: {
  points: Point[];
  label: string;
  format: (value: number) => string;
  height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const { at, setSelected, onAction } = useSelection(points.length);
  const values = points.map((p) => p.value);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  // The axis spans at least 10% of the value, so a small change never looks
  // like a dramatic one.
  const span = Math.max((hi - lo) * 1.24, hi * 0.1, 1);
  const mid = (hi + lo) / 2;
  const bottom = Math.max(0, mid - span / 2);
  const top = bottom + span;
  const inset = 8;
  const x = (i: number) =>
    points.length === 1
      ? width / 2
      : inset + (i * (width - inset * 2)) / (points.length - 1);
  const y = (v: number) =>
    inset +
    (1 - (v - bottom) / Math.max(1e-9, top - bottom)) * (height - inset * 2);
  const select = (e: GestureResponderEvent) => {
    if (!width || points.length < 2) return;
    const ratio = (e.nativeEvent.locationX - inset) / (width - inset * 2);
    setSelected(Math.round(ratio * (points.length - 1)));
  };
  const hit = points[at];
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <Txt variant="metric">{hit ? format(hit.value) : ""}</Txt>
        <Txt
          variant="caption"
          tone="secondary"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {hit?.description ?? ""}
        </Txt>
      </View>
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
            <Line
              x1={0}
              x2={width}
              y1={height - 1}
              y2={height - 1}
              stroke={c.hairline}
            />
            {points.length > 1 && (
              <Polyline
                points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={c.text2}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}
            {points.length <= 40 &&
              points.map((p, i) => (
                <Circle
                  key={p.key}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={3}
                  fill={c.text2}
                />
              ))}
            {hit && (
              <>
                {points.length > 1 && (
                  <Line
                    x1={x(at)}
                    x2={x(at)}
                    y1={0}
                    y2={height}
                    stroke={c.hairline}
                  />
                )}
                <Circle
                  cx={x(at)}
                  cy={y(hit.value)}
                  r={6}
                  fill={c.ember}
                  stroke={c.surface}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>
        )}
      </Pressable>
      {points.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt variant="caption" tone="tertiary">
            {`Low ${format(lo)}`}
          </Txt>
          <Txt variant="caption" tone="tertiary">
            {`High ${format(hi)}`}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** A small colour key: "■ Completed  □ Planned". */
export function Legend({
  items,
}: {
  items: { label: string; color: string; outline?: boolean }[];
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {items.map((i) => (
        <View
          key={i.label}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: i.outline ? "transparent" : i.color,
              borderWidth: i.outline ? 1 : 0,
              borderColor: i.color,
            }}
          />
          <Txt variant="caption" tone="secondary">
            {i.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}
