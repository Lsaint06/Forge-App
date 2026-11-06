import React, { useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Switch, View } from "react-native";
import { Sheet, useColors } from "../ui";
import {
  CtaButton,
  FText,
  ForgeField,
  OutlineButton,
  SquareIconButton,
} from "../reforge";
import { DateSheet } from "../DateSheet";
import { ScaleRow } from "./ScaleRow";
import { useRepo, mutate } from "../../state";
import {
  SCALES,
  SLEEP_MAX,
  SLEEP_STEP,
  draftChanged,
  draftOf,
  editedCheckin,
  emptyDraft,
  isAnswer,
  newCheckin,
  newestFirst,
  onDay,
  restDayAnswer,
  restDayText,
  sleepHint,
  sleepSpoken,
  sleepText,
  type Checkin,
  type Draft,
} from "../../domain/checkins";
import { dayTitle } from "../../domain/calendar-dates";
import { localDate } from "../../domain/types";
import { forge, theme } from "../../theme";

export type CheckinTarget =
  { kind: "new"; date?: string } | { kind: "edit"; entry: Checkin };

/**
 * Logging or editing a recovery check-in with no keyboard: last night's sleep
 * on a stepper, four required 1–5 answers, an optional self-rating, rest day
 * and an optional note. Nothing is prefilled for a new check-in. Save sits in
 * the footer above the keyboard; a double tap saves once; editing writes only
 * what changed. Mount it when needed.
 */
export function CheckinSheet({
  target,
  entries,
  onClose,
  onSaved,
  onEditInstead,
}: {
  target: CheckinTarget;
  /** Every recovery check-in (for the last sleep and same-day notices). */
  entries: Checkin[];
  onClose: () => void;
  /** Saved: what to say, and how to undo it. */
  onSaved: (text: string, undo: () => void) => void;
  /** Switch to editing an existing check-in on the chosen day. */
  onEditInstead?: (entry: Checkin) => void;
}) {
  const r = useRepo();
  const c = useColors();
  const today = localDate();
  const editing = target.kind === "edit" ? target.entry : undefined;
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? draftOf(editing)
      : emptyDraft(target.kind === "new" ? (target.date ?? today) : today),
  );
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [showNotes, setShowNotes] = useState(
    !!String(editing?.data.notes ?? "").trim(),
  );
  const busy = useRef(false);

  const lastSleep = [...entries]
    .sort(newestFirst)
    .map((e) => e.data.sleep)
    .find((s): s is number => typeof s === "number" && s >= 0 && s <= 24);
  const sameDay = onDay(entries, draft.date).filter(
    (e) => e.id !== editing?.id,
  );
  const hint = sleepHint(draft.sleep);
  const oddRestDay =
    editing && restDayAnswer(editing.data.restDay) === undefined
      ? restDayText(editing.data.restDay)
      : undefined;

  function update(patch: Partial<Draft>) {
    busy.current = false;
    setError(undefined);
    setDraft((d) => ({ ...d, ...patch }));
  }
  function stepSleep(by: number) {
    if (draft.sleep === undefined) {
      update({ sleep: lastSleep ?? 8 });
      return;
    }
    const next = Math.max(0, Math.min(SLEEP_MAX, draft.sleep + by));
    if (next !== draft.sleep) update({ sleep: next });
  }
  function fail(message: string) {
    busy.current = false;
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }

  function save() {
    if (busy.current) return;
    busy.current = true;
    if (editing) {
      const result = editedCheckin(editing, draft);
      if (result === undefined) {
        // Nothing changed: nothing is written or queued for sync.
        onClose();
        return;
      }
      if ("error" in result) return fail(result.error);
      const before = { data: editing.data, date: editing.date };
      const ok = mutate(() => {
        r.updateJournal(editing.id, result.data, result.date);
        return true;
      });
      if (!ok) {
        busy.current = false;
        return;
      }
      onSaved(`Updated ${dayTitle(result.date, today)}'s check-in`, () =>
        mutate(() => r.updateJournal(editing.id, before.data, before.date)),
      );
      onClose();
      return;
    }
    const result = newCheckin(draft);
    if ("error" in result) return fail(result.error);
    const entry = mutate(() =>
      r.addJournal("recovery", result.data, result.date),
    );
    if (!entry) {
      busy.current = false;
      return;
    }
    onSaved(`Saved ${dayTitle(result.date, today)}'s check-in`, () =>
      mutate(() => r.deleteJournal(entry.id)),
    );
    onClose();
  }

  const sleepShown = sleepText(draft.sleep) ?? "Not set";
  return (
    <Sheet
      visible
      onClose={onClose}
      title={
        editing
          ? `Edit ${dayTitle(editing.date, today)}'s check-in`
          : "Check-in"
      }
      unsaved={draftChanged(draft, editing)}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error && (
            <FText variant="body" weight="600" tone="error" align="center">
              {error}
            </FText>
          )}
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {editing && (
              <View style={{ flex: 1 }}>
                <OutlineButton title="Cancel" onPress={onClose} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <CtaButton
                title={editing ? "Save changes" : "Save check-in"}
                icon="checkmark"
                compact
                onPress={save}
              />
            </View>
          </View>
        </View>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day, ${dayTitle(draft.date, today)}. Change day`}
        onPress={() => setPicking(true)}
        style={({ pressed }) => ({
          minHeight: theme.heights.control,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <FText variant="body" tone="secondary">
          Day
        </FText>
        <FText variant="body" weight="700">
          {`${dayTitle(draft.date, today)} ›`}
        </FText>
      </Pressable>
      {sameDay.length > 0 && (
        <View style={{ gap: 2 }}>
          <FText variant="label" tone="secondary">
            {`You already checked in ${draft.date === today ? "today" : `on ${dayTitle(draft.date, today)}`}. Saving adds another; the latest is used for trends.`}
          </FText>
          {onEditInstead && (
            <OutlineButton
              title="Edit that check-in instead"
              tone="ember"
              compact
              onPress={() => onEditInstead(sameDay[0]!)}
            />
          )}
        </View>
      )}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Last night's sleep"
        accessibilityValue={{ text: sleepSpoken(draft.sleep) ?? "Not set" }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) =>
          stepSleep(
            e.nativeEvent.actionName === "increment" ? SLEEP_STEP : -SLEEP_STEP,
          )
        }
        style={{ gap: 8 }}
      >
        <FText variant="cardTitle" weight="700">
          {"Last night's sleep"}
        </FText>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: 6,
            borderRadius: forge.radii.card,
            borderWidth: forge.border.card,
            borderColor: c.cardBorder,
            backgroundColor: c.cardBg,
          }}
        >
          <SquareIconButton
            icon="remove"
            label="Less sleep"
            onPress={() => stepSleep(-SLEEP_STEP)}
          />
          <FText
            variant="cardMetric"
            tone={draft.sleep === undefined ? "secondary" : "primary"}
            align="center"
            style={{ flex: 1 }}
          >
            {sleepShown}
          </FText>
          <SquareIconButton
            icon="add"
            label="More sleep"
            onPress={() => stepSleep(SLEEP_STEP)}
          />
        </View>
        <FText variant="label" tone={hint ? "accent" : "secondary"}>
          {hint ??
            (draft.sleep === undefined
              ? `Tap + or − to start from ${sleepText(lastSleep ?? 8)}. Steps of 15 minutes.`
              : "Steps of 15 minutes.")}
        </FText>
      </View>
      {SCALES.map((s) => (
        <ScaleRow
          key={s.key}
          scale={s}
          value={draft[s.key]}
          recorded={
            editing && !isAnswer(draft[s.key]) ? editing.data[s.key] : undefined
          }
          onChange={(v) => update({ [s.key]: v })}
        />
      ))}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          minHeight: theme.heights.control,
        }}
      >
        <View style={{ flex: 1 }}>
          <FText variant="cardTitle" weight="700">
            Rest day
          </FText>
          <FText variant="label" tone="secondary">
            {oddRestDay && draft.restDay === undefined
              ? `Recorded as "${String(editing!.data.restDay)}"`
              : "No training planned today"}
          </FText>
        </View>
        <Switch
          accessibilityLabel="Rest day"
          value={draft.restDay ?? false}
          onValueChange={(v) => update({ restDay: v })}
          trackColor={{ true: c.ember, false: c.surfaceRaised }}
          thumbColor={c.text}
        />
      </View>
      {showNotes ? (
        <ForgeField
          label="Note (optional)"
          value={draft.notes}
          placeholder="e.g. Legs heavy after Tuesday"
          onChangeText={(notes) => update({ notes })}
        />
      ) : (
        <OutlineButton
          title="Add note"
          icon="add"
          compact
          onPress={() => setShowNotes(true)}
        />
      )}
      {/* Rendered inside this sheet so iOS presents it on top. */}
      <DateSheet
        visible={picking}
        range="past"
        title="Check-in day"
        detail="The morning you're reporting on; sleep is the night before."
        confirmLabel="Choose"
        initial={draft.date > today ? today : draft.date}
        onClose={() => setPicking(false)}
        onConfirm={(day) => {
          update({ date: day });
          setPicking(false);
        }}
      />
    </Sheet>
  );
}
