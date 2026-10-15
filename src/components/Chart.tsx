import React, { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import Svg, { Line, Polyline, Circle, Text as SvgText } from "react-native-svg";
import { Label, useColors } from "./ui";
export function Chart({
  points,
  unit,
}: {
  points: { label: string; value: number }[];
  unit: string;
}) {
  const c = useColors();
  const [selected, setSelected] = useState(0);
  const data = points.slice(-60);
  if (!data.length)
    return (
      <Label muted>
        No data for this range. Complete a workout or add a measurement.
      </Label>
    );
  const at = Math.min(selected, data.length - 1);
  const hit = data[at]!;
  const max = Math.max(1, ...data.map((p) => p.value));
  const min = Math.min(0, ...data.map((p) => p.value));
  const xy = data.map((p, i) => ({
    x: 48 + (i * 256) / Math.max(1, data.length - 1),
    y: 144 - ((p.value - min) / (max - min)) * 120,
  }));
  return (
    <View style={{ gap: 12 }}>
      <Label bold>
        {hit.label} · {Math.round(hit.value * 10) / 10} {unit}
      </Label>
      <Svg
        width="100%"
        height={160}
        viewBox="0 0 320 160"
        accessible
        accessibilityLabel={`Chart with ${data.length} points; values can be selected below`}
      >
        <Line x1={48} y1={144} x2={304} y2={144} stroke={c.border} />
        <Line x1={48} y1={84} x2={304} y2={84} stroke={c.border} />
        <SvgText x={4} y={28} fontSize={11} fill={c.muted}>
          {Math.round(max).toLocaleString()}
        </SvgText>
        <SvgText x={4} y={148} fontSize={11} fill={c.muted}>
          {Math.round(min)}
        </SvgText>
        <Polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={c.success}
          strokeWidth={3}
        />
        {xy.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === at ? 6 : 3}
            fill={i === at ? c.text : c.success}
            onPress={() => setSelected(i)}
          />
        ))}
      </Svg>
      <Label muted size={12}>
        {data[0]!.label} → {data[data.length - 1]!.label} · {unit}
      </Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {data.map((p, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}: ${p.value} ${unit}`}
              accessibilityState={{ selected: i === at }}
              onPress={() => setSelected(i)}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: 10,
                borderRadius: 12,
                backgroundColor: i === at ? c.elevated : c.surface,
              }}
            >
              <Label size={11}>{p.label.slice(5)}</Label>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {points.length > 60 && (
        <Label size={11} muted>
          Showing the last 60 recorded dates in this range. Totals above include
          every session.
        </Label>
      )}
    </View>
  );
}
