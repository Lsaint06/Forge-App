import React, { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { Txt, Button, IconButton, Sheet, useColors } from "./ui";
import {
  monthName,
  monthOf,
  monthWeeks,
  shiftMonth,
  weekdayHeaders,
} from "../domain/calendar-dates";
import { localDate } from "../domain/types";
import { dayLabel } from "../domain/training-display";
import { theme } from "../theme";

/**
 * Choosing a day: a month grid from today onward (`range="future"`, for
 * planning) or up to today (`range="past"`, for logging). Nothing happens
 * until the lifter confirms; closing the sheet changes nothing, and
 * confirming runs once even if tapped twice.
 */
export function DateSheet({
  visible,
  title,
  detail,
  confirmLabel,
  initial,
  onConfirm,
  onClose,
  range = "future",
}: {
  visible: boolean;
  title: string;
  /** One line about what is being scheduled. */
  detail?: string;
  /** e.g. "Schedule" (the chosen day is added). */
  confirmLabel: string;
  initial?: string;
  onConfirm: (date: string) => void;
  onClose: () => void;
  /** Which side of today can be chosen; today always can. */
  range?: "future" | "past";
}) {
  const c = useColors();
  const today = localDate();
  const [selected, setSelected] = useState(initial ?? today);
  const [month, setMonth] = useState(monthOf(initial ?? today));
  const done = useRef(false);
  // Each opening starts fresh on the initial (or today's) date.
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setSelected(initial ?? today);
      setMonth(monthOf(initial ?? today));
    }
  }
  useEffect(() => {
    if (visible) done.current = false;
  }, [visible]);
  const current = monthOf(today);
  // Months can't be browsed past the side of today that is unavailable.
  const canGoBack = range === "past" || month > current;
  const canGoForward = range === "future" || month < current;
  const headers = weekdayHeaders();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      dismissOnBackdrop
      footer={
        <Button
          title={`${confirmLabel} · ${dayLabel(selected)}`}
          accessibilityLabel={`${confirmLabel} for ${dayLabel(selected)}`}
          icon="calendar-outline"
          onPress={() => {
            if (done.current) return;
            done.current = true;
            onConfirm(selected);
          }}
        />
      }
    >
      {!!detail && <Txt tone="secondary">{detail}</Txt>}
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconButton
            icon="chevron-back"
            label="Previous month"
            onPress={() => canGoBack && setMonth(shiftMonth(month, -1))}
            tone={canGoBack ? undefined : "tertiary"}
          />
          <Txt variant="headline" header align="center" style={{ flex: 1 }}>
            {monthName(month)}
          </Txt>
          <IconButton
            icon="chevron-forward"
            label="Next month"
            onPress={() => canGoForward && setMonth(shiftMonth(month, 1))}
            tone={canGoForward ? undefined : "tertiary"}
          />
        </View>
        <View
          style={{ flexDirection: "row" }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {headers.map((h) => (
            <Txt
              key={h}
              variant="overline"
              tone="secondary"
              align="center"
              style={{ flex: 1 }}
            >
              {h.slice(0, 2)}
            </Txt>
          ))}
        </View>
        {monthWeeks(month).map((week, w) => (
          <View key={w} style={{ flexDirection: "row" }}>
            {week.map((day, i) => {
              if (!day) return <View key={i} style={{ flex: 1 }} />;
              const unavailable =
                range === "future" ? day < today : day > today;
              const isSelected = day === selected;
              const isToday = day === today;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(day)}${isToday ? ", today" : ""}`}
                  accessibilityState={{
                    selected: isSelected,
                    disabled: unavailable,
                  }}
                  disabled={unavailable}
                  onPress={() => setSelected(day)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? c.ember : "transparent",
                      borderWidth: isToday && !isSelected ? 1 : 0,
                      borderColor: c.text3,
                    }}
                  >
                    <Txt
                      tabular
                      weight={isSelected || isToday ? "700" : "400"}
                      tone={
                        isSelected
                          ? "onAccent"
                          : unavailable
                            ? "tertiary"
                            : "primary"
                      }
                    >
                      {Number(day.slice(8))}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Sheet>
  );
}
