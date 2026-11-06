import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "./ui";
import { FText, SquareIconButton } from "./reforge";
import { DateSheet } from "./DateSheet";
import { addDays } from "../domain/paths/model";
import { dayTitle } from "../domain/calendar-dates";
import { dayLabel } from "../domain/training-display";
import { localDate } from "../domain/types";
import { forge } from "../theme";

/**
 * ‹ Today › for screens that look back over days (REFORGE, Phase 7.3B). The
 * arrows move a day at a time and stop at today; tapping the day opens a
 * calendar of past days. On a past day, "Back to today" returns in one tap
 * (Phase 7.3G G4).
 */
export function DaySwitcher({
  date,
  onChange,
  today = localDate(),
}: {
  date: string;
  onChange: (date: string) => void;
  today?: string;
}) {
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const title = dayTitle(date, today);
  const atToday = date >= today;
  return (
    <View style={{ gap: 2 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: forge.spacing.tight,
        }}
      >
        <SquareIconButton
          icon="chevron-back"
          label="Previous day"
          onPress={() => onChange(addDays(date, -1))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title === dayLabel(date) ? title : `${title}, ${dayLabel(date)}`}. Choose a day`}
          onPress={() => setPicking(true)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: forge.heights.compact,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: forge.radii.cta,
            borderWidth: forge.border.card,
            borderColor: c.cardBorder,
            backgroundColor: pressed ? c.cardRaised : c.cardBg,
          })}
        >
          <FText variant="cardTitle" weight="700" numberOfLines={1}>
            {title}
          </FText>
          {title !== dayLabel(date) && (
            <FText variant="label" tone="secondary" numberOfLines={1}>
              {dayLabel(date)}
            </FText>
          )}
        </Pressable>
        <SquareIconButton
          icon="chevron-forward"
          label="Next day"
          disabled={atToday}
          onPress={() => onChange(addDays(date, 1))}
        />
        <DateSheet
          visible={picking}
          range="past"
          title="Choose a day"
          confirmLabel="Show"
          initial={date > today ? today : date}
          onClose={() => setPicking(false)}
          onConfirm={(day) => {
            setPicking(false);
            onChange(day);
          }}
        />
      </View>
      {!atToday && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to today"
          onPress={() => onChange(today)}
          hitSlop={4}
          style={({ pressed }) => ({
            alignSelf: "flex-end",
            minHeight: forge.heights.compact,
            paddingHorizontal: 8,
            marginRight: -8,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <FText variant="label" weight="700" tone="accent">
            Back to today
          </FText>
          <Ionicons name="return-down-forward" size={14} color={c.emberHot} />
        </Pressable>
      )}
    </View>
  );
}
