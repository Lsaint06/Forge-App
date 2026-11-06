import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, type IconName } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";

/** The hairline between rows of a list card (inset from the left edge). */
export function RowDivider({ inset = forge.spacing.cardPadding }) {
  const c = useColors();
  return (
    <View
      style={{
        height: forge.border.card,
        marginLeft: inset,
        backgroundColor: c.cardDivider,
      }}
    />
  );
}

/**
 * A navigation row as in the You reference's "Tools & Settings": an ember
 * icon, a bold title with its description beside it (below it when space is
 * short), an optional value and a chevron. Rows sit in a `ForgeCard` with
 * no padding; every row after the first draws the hairline above it.
 */
export function ForgeListRow({
  icon,
  title,
  description,
  value,
  onPress,
  divider = false,
  destructive = false,
  accessibilityLabel,
}: {
  icon: IconName;
  title: string;
  description?: string;
  value?: string;
  onPress: () => void;
  /** Hairline above the row (every row but the first). */
  divider?: boolean;
  /** An irreversible action (e.g. End program): error colour, no chevron. */
  destructive?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={description}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingHorizontal: forge.spacing.cardPadding,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.group,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
        backgroundColor: pressed ? c.cardRaised : "transparent",
      })}
    >
      <Ionicons
        name={icon}
        size={22}
        color={destructive ? c.error : c.emberHot}
        style={{ width: 26 }}
      />
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: 10,
          rowGap: 2,
        }}
      >
        <FText
          variant="cardTitle"
          weight="700"
          tone={destructive ? "error" : "primary"}
        >
          {title}
        </FText>
        {description && (
          <FText variant="label" tone="secondary">
            {description}
          </FText>
        )}
      </View>
      {value !== undefined && (
        <FText variant="label" tone="secondary" numberOfLines={1}>
          {value}
        </FText>
      )}
      {!destructive && (
        <Ionicons name="chevron-forward" size={18} color={c.text2} />
      )}
    </Pressable>
  );
}
