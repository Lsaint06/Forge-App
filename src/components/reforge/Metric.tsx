import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { FText, type ForgeTone } from "./Text";
import { stripColumns } from "./layout";

/**
 * A number with its unit and label ("82.4 kg / Bodyweight"), read by screen
 * readers as one element. `delta` is display text supplied by the caller;
 * this component never computes a comparison.
 */
export function Metric({
  value,
  unit,
  label,
  size = "card",
  delta,
  deltaTone = "secondary",
  align = "left",
}: {
  value: string;
  unit?: string;
  label?: string;
  size?: "hero" | "card" | "stat";
  delta?: string;
  deltaTone?: ForgeTone;
  align?: "left" | "center";
}) {
  const variant =
    size === "hero"
      ? "heroMetric"
      : size === "stat"
        ? "statMetric"
        : "cardMetric";
  const spoken = [
    label && `${label}:`,
    unit ? `${value} ${unit}` : value,
    delta && `, ${delta}`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" ,", ",");
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={{
        gap: 2,
        alignItems: align === "center" ? "center" : "flex-start",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <FText variant={variant} numberOfLines={1} fit>
          {value}
        </FText>
        {unit && (
          <FText
            variant={size === "hero" ? "subtitle" : "label"}
            tone="secondary"
            numberOfLines={1}
          >
            {unit}
          </FText>
        )}
      </View>
      {label && (
        <FText variant="label" tone="secondary" numberOfLines={2}>
          {label}
        </FText>
      )}
      {delta && (
        <FText variant="label" tone={deltaTone} numberOfLines={2}>
          {delta}
        </FText>
      )}
    </View>
  );
}

/**
 * Equal columns separated by hairlines (the references' readiness and stats
 * strips). Falls back to two per row, then one, when the columns would be
 * too narrow for the current width or text size.
 */
export function StatStrip({
  children,
  minColumn = 76,
}: {
  children: React.ReactNode;
  minColumn?: number;
}) {
  const c = useColors();
  const window = useWindowDimensions();
  const items = React.Children.toArray(children).filter(Boolean);
  const [width, setWidth] = useState<number>();
  const columns = stripColumns(
    width ??
      window.width - 2 * forge.spacing.margin - 2 * forge.spacing.cardPadding,
    window.fontScale || 1,
    items.length,
    minColumn,
  );
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns)
    rows.push(items.slice(i, i + columns));
  return (
    <View
      testID="stat-strip"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ gap: forge.spacing.group }}
    >
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {row.map((item, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                paddingLeft: i === 0 ? 0 : forge.spacing.group,
                paddingRight: forge.spacing.tight,
                borderLeftWidth: i === 0 ? 0 : forge.border.card,
                borderLeftColor: c.cardDivider,
              }}
            >
              {item}
            </View>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }, (_, k) => (
              <View key={`pad-${k}`} style={{ flex: 1 }} />
            ))}
        </View>
      ))}
    </View>
  );
}
