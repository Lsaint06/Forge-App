import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Txt, IconButton } from "./ui";
import { DateSheet } from "./DateSheet";
import { addDays } from "../domain/paths/model";
import { dayTitle } from "../domain/calendar-dates";
import { dayLabel } from "../domain/training-display";
import { localDate } from "../domain/types";
import { theme } from "../theme";

/**
 * ‹ Today › for screens that look back over days. The arrows move a day at a
 * time and stop at today; tapping the day opens a calendar of past days.
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
  const [picking, setPicking] = useState(false);
  const title = dayTitle(date, today);
  const atToday = date >= today;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <IconButton
        icon="chevron-back"
        label="Previous day"
        size={24}
        onPress={() => onChange(addDays(date, -1))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title === dayLabel(date) ? title : `${title}, ${dayLabel(date)}`}. Choose a day`}
        onPress={() => setPicking(true)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radii.control,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt variant="headline" align="center" numberOfLines={1}>
          {title}
        </Txt>
        {title !== dayLabel(date) && (
          <Txt variant="caption" tone="secondary" align="center">
            {dayLabel(date)}
          </Txt>
        )}
      </Pressable>
      <IconButton
        icon="chevron-forward"
        label="Next day"
        size={24}
        disabled={atToday}
        tone={atToday ? "tertiary" : undefined}
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
  );
}
