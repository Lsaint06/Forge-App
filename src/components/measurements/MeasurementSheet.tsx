import React, { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Alert } from "../../platform/alert";
import { Sheet } from "../ui";
import {
  CtaButton,
  FText,
  ForgeChips,
  ForgeField,
  ForgeSegments,
  OutlineButton,
} from "../reforge";
import { DateSheet } from "../DateSheet";
import { useRepo, mutate } from "../../state";
import {
  TYPES,
  displayUnit,
  editText,
  editedRecord,
  familyOfUnit,
  nameKey,
  newRecord,
  plausibility,
  readValue,
  valueText,
  type Entry,
  type Family,
  type Series,
  type Units,
} from "../../domain/measurements";
import { isBodyweightName } from "../../domain/validation";
import { dayTitle } from "../../domain/calendar-dates";
import { localDate } from "../../domain/types";
import { theme } from "../../theme";

export type MeasurementTarget =
  | { kind: "new"; name?: string; family?: Family }
  | { kind: "edit"; entry: Entry };

const CUSTOM = "Custom…";
const FAMILY_OPTIONS = [
  { value: "length", label: "Length" },
  { value: "mass", label: "Weight" },
  { value: "percent", label: "Percent" },
];

/**
 * Logging or editing one measurement: what, how much (in the lifter's units),
 * which day and an optional note. Save sits in the footer above the
 * keyboard; a double tap saves once; an unusual value asks before saving but
 * never blocks. "Save & add another" keeps the sheet open on the same day.
 * Editing writes only what changed. Mount it when needed.
 */
export function MeasurementSheet({
  target,
  series,
  units,
  onClose,
  onSaved,
}: {
  target: MeasurementTarget;
  series: Series[];
  units: Units;
  onClose: () => void;
  /** A new entry was saved (for "Saved · Undo"). */
  onSaved?: (id: string, text: string) => void;
}) {
  const r = useRepo();
  const today = localDate();
  const editing = target.kind === "edit" ? target.entry : undefined;
  // Preset types, then the lifter's own measurements, then Custom.
  const own = series
    .filter(
      (s) =>
        !TYPES.some(
          (t) => nameKey(t.name) === nameKey(s.name) && t.family === s.family,
        ),
    )
    .map((s) => ({ name: s.name, family: s.family }));
  const choices = [...TYPES, ...own];
  const startName = editing
    ? String(editing.data.name ?? "")
    : target.kind === "new" && target.name
      ? target.name
      : "Bodyweight";
  const startFamily: Family = editing
    ? (familyOfUnit(editing.data.unit) ?? "length")
    : target.kind === "new" && target.name
      ? (target.family ?? "length")
      : "mass";
  const [choice, setChoice] = useState(
    choices.find(
      (c) => nameKey(c.name) === nameKey(startName) && c.family === startFamily,
    )?.name ?? CUSTOM,
  );
  const [customName, setCustomName] = useState(
    choice === CUSTOM ? startName : "",
  );
  const [customFamily, setCustomFamily] = useState<Family>(startFamily);
  const [editName, setEditName] = useState(startName);
  const [value, setValue] = useState(editing ? editText(editing, units) : "");
  const [date, setDate] = useState(editing?.date ?? today);
  const [notes, setNotes] = useState(String(editing?.data.notes ?? ""));
  const [showNotes, setShowNotes] = useState(!!editing?.data.notes);
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [savedNote, setSavedNote] = useState<string>();
  const busy = useRef(false);

  const isCustom = !editing && choice === CUSTOM;
  const preset = choices.find((c) => c.name === choice);
  const name = editing
    ? editName
    : isCustom
      ? customName
      : (preset?.name ?? "");
  const family: Family = editing
    ? startFamily
    : isCustom
      ? customFamily
      : (preset?.family ?? "length");
  const unit = displayUnit(family, units);
  const dirty = editing
    ? value !== editText(editing, units) ||
      date !== editing.date ||
      notes.trim() !== String(editing.data.notes ?? "").trim() ||
      editName.trim() !== startName.trim()
    : !!value.trim() || !!notes.trim() || (isCustom && !!customName.trim());
  const sameSeries = series.find(
    (s) => nameKey(s.name) === nameKey(name) && s.family === family,
  );

  function confirmUnusual(message: string | undefined, go: () => void) {
    if (!message) return go();
    busy.current = false;
    Alert.alert("Check this value", message, [
      { text: "Edit", style: "cancel" },
      {
        text: "Save anyway",
        onPress: () => {
          if (busy.current) return;
          busy.current = true;
          go();
        },
      },
    ]);
  }

  function save(another: boolean) {
    if (busy.current) return;
    setError(undefined);
    if (!name.trim()) {
      setError("Enter a name for this measurement");
      return;
    }
    busy.current = true;
    if (editing) {
      const result = editedRecord(
        editing,
        { name: editName, valueText: value, notes, date },
        units,
      );
      if (result === undefined) {
        // Nothing changed: nothing is written or queued for sync.
        onClose();
        return;
      }
      if ("error" in result) {
        busy.current = false;
        setError(result.error);
        return;
      }
      const previous = sameSeries?.entries.find((e) => e.id !== editing.id);
      const changedValue =
        Number(result.data.value) !== Number(editing.data.value);
      confirmUnusual(
        changedValue
          ? plausibility(
              Number(result.data.value),
              family,
              isBodyweightName(name),
              previous ? Number(previous.data.value) : undefined,
              units,
            )
          : undefined,
        () => {
          const ok = mutate(() => {
            r.updateJournal(editing.id, result.data, result.date);
            return true;
          });
          // Held after success: the sheet closes, so a second tap does nothing.
          if (ok) onClose();
          else busy.current = false;
        },
      );
      return;
    }
    const read = readValue(value, family, units);
    if ("error" in read) {
      busy.current = false;
      setError(read.error);
      return;
    }
    const previous = sameSeries?.latest;
    confirmUnusual(
      plausibility(
        read.value,
        family,
        isBodyweightName(name),
        previous ? Number(previous.data.value) : undefined,
        units,
      ),
      () => {
        let data;
        try {
          data = newRecord(name, read, notes);
        } catch {
          busy.current = false;
          setError("That value can't be recorded");
          return;
        }
        const entry = mutate(() => r.addJournal("measurement", data, date));
        // Held after success until the input changes, so a second tap in
        // the same frame saves nothing.
        if (!entry) {
          busy.current = false;
          return;
        }
        const text = `${name.trim()} ${valueText(read.value, family, units)}`;
        onSaved?.(entry.id, text);
        if (another) {
          setValue("");
          setNotes("");
          setShowNotes(false);
          setSavedNote(`Saved ${text}. Choose the next measurement.`);
        } else onClose();
      },
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={editing ? `Edit ${startName}` : "Log measurement"}
      unsaved={dirty}
      footer={
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            {editing ? (
              <OutlineButton title="Cancel" onPress={onClose} />
            ) : (
              <OutlineButton
                title="Save & add another"
                accessibilityLabel="Save and add another measurement"
                onPress={() => save(true)}
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <CtaButton
              title="Save"
              icon="checkmark"
              compact
              accessibilityLabel={editing ? "Save changes" : "Save measurement"}
              onPress={() => save(false)}
            />
          </View>
        </View>
      }
    >
      {savedNote && (
        <FText variant="body" weight="600" tone="positive">
          {savedNote}
        </FText>
      )}
      {editing ? (
        <ForgeField label="Name" value={editName} onChangeText={setEditName} />
      ) : (
        <View style={{ gap: 6 }}>
          <FText variant="label" tone="secondary">
            Measurement
          </FText>
          <ForgeChips
            values={[...choices.map((c) => c.name), CUSTOM]}
            value={choice}
            onChange={(c) => {
              busy.current = false;
              setChoice(c);
              setError(undefined);
              setSavedNote(undefined);
            }}
          />
        </View>
      )}
      {isCustom && (
        <>
          <ForgeField
            label="Measurement name"
            value={customName}
            placeholder="e.g. Upper arm, relaxed"
            onChangeText={setCustomName}
          />
          <View style={{ gap: 6 }}>
            <FText variant="label" tone="secondary">
              Measured as
            </FText>
            <ForgeSegments
              accessibilityLabel="Measured as"
              options={FAMILY_OPTIONS}
              value={customFamily}
              onChange={(f) => setCustomFamily(f as Family)}
            />
          </View>
        </>
      )}
      <ForgeField
        label={`${name.trim() || "Value"} (${unit})`}
        value={value}
        keyboardType="decimal-pad"
        error={error}
        onChangeText={(t) => {
          busy.current = false;
          setValue(t);
          setError(undefined);
          setSavedNote(undefined);
        }}
      />
      {sameSeries && !editing && (
        <FText variant="label" tone="secondary">
          {`Last: ${valueText(Number(sameSeries.latest.data.value), family, units)} · ${dayTitle(sameSeries.latest.date, today)}`}
        </FText>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day, ${dayTitle(date, today)}. Change day`}
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
          {`${dayTitle(date, today)} ›`}
        </FText>
      </Pressable>
      {showNotes ? (
        <ForgeField
          label="Note (optional)"
          value={notes}
          placeholder="e.g. Morning, before breakfast"
          onChangeText={setNotes}
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
        title="Measured on"
        confirmLabel="Choose"
        initial={date > today ? today : date}
        onClose={() => setPicking(false)}
        onConfirm={(day) => {
          setDate(day);
          setPicking(false);
        }}
      />
    </Sheet>
  );
}
