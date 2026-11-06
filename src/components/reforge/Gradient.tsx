import React, { useId } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { stopPaint } from "./color";

export type GradientStop = {
  /** 0 … 1 along the gradient. */
  offset: number;
  color: string;
  opacity?: number;
};

/**
 * A decorative gradient layer filling its parent (absolutely positioned,
 * ignores touches, hidden from screen readers). Drawn with react-native-svg,
 * which runs in Expo Go on both platforms without another dependency.
 *
 * `linear` runs between two points in the box (0 … 1); `radial` is an
 * ellipse centred at `center` with radii `radius` (fractions of the box).
 */
export function Gradient({
  stops,
  kind = "linear",
  from = { x: 0, y: 0 },
  to = { x: 0, y: 1 },
  center = { x: 0.5, y: 0.5 },
  radius = { x: 0.5, y: 0.5 },
  style,
}: {
  stops: GradientStop[];
  kind?: "linear" | "radial";
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  center?: { x: number; y: number };
  radius?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
}) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const children = stops.map((s, i) => {
    const paint = stopPaint(s.color, s.opacity ?? 1);
    return (
      <Stop
        key={i}
        offset={s.offset}
        stopColor={paint.color}
        stopOpacity={paint.opacity}
      />
    );
  });
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {kind === "radial" ? (
            <RadialGradient
              id={id}
              cx={center.x}
              cy={center.y}
              rx={radius.x}
              ry={radius.y}
              fx={center.x}
              fy={center.y}
            >
              {children}
            </RadialGradient>
          ) : (
            <LinearGradient id={id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
              {children}
            </LinearGradient>
          )}
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
