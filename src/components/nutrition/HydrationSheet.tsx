import React, { useRef, useState } from "react";
import { AccessibilityInfo, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sheet, TextButton, useColors } from "../ui";
import { FText, ForgeProgress, ForgeSegments, OutlineButton } from "../reforge";
import { useRepo, mutate, confirm } from "../../state";
import { forge } from "../../theme";
import { dayTitle } from "../../domain/calendar-dates";
import type { Journal } from "../../domain/types";
import {
  PRESETS,
  amountError,
  entrySpoken,
  entryText,
  fluidUnitOf,
  fromMl,
  goalError,
  hydrationData,
  hydrationDay,
  hydrationOf,
  parseAmount,
  toMl,
  totalMl,
  unitLabel,
  volumeText,
  type FluidUnit,
} from "../../domain/hydration";

// Hydration (Phase 7.3C): the day's water, its goal and its entries in one
// REFORGE sheet. Opening the sheet never logs anything (decision H4): every
// add is a clearly labelled preset or a typed amount, with Undo. Water is a
// separate `hydration` record and never reaches food totals.

const UNITS: { value: FluidUnit; label: string; accessibilityLabel: string }[] =
  [
    { value: "ml", label: "mL", accessibilityLabel: "Millilitres" },
    { value: "oz", label: "fl oz", accessibilityLabel: "US fluid ounces" },
  ];

/** A REFORGE number field (decimal pad, accepts "1,5"). */
function AmountInput({
  label,
  value,
  onChange,
  error,
  suffix,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  suffix: string;
  onSubmit?: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View
        style={{
          minHeight: forge.heights.button,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: forge.spacing.group,
          borderRadius: forge.radii.input,
          borderWidth: error ? forge.border.active : forge.border.card,
          borderColor: error ? c.error : c.cardBorder,
          backgroundColor: c.cardBg,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          placeholder="0"
          placeholderTextColor={c.text3}
          maxFontSizeMultiplier={1.6}
          style={{
            flex: 1,
            color: c.text,
            fontSize: 17,
            paddingVertical: 10,
          }}
        />
        <FText variant="label" tone="secondary">
          {suffix}
        </FText>
      </View>
      {error && (
        <FText variant="label" tone="error">
          {error}
        </FText>
      )}
    </View>
  );
}

/**
 * The daily water goal and fluid unit: the profile's two fields, edited in
 * the same way from the hydration sheet and from You (decision H8), so
 * there is only ever one value.
 */
export function HydrationSettings({ onSaved }: { onSaved?: () => void }) {
  const r = useRepo();
  const p = r.profile();
  const unit = fluidUnitOf(p);
  const goal = p.waterGoal;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [, refresh] = useState(0);
  const done = () => {
    refresh((n) => n + 1);
    onSaved?.();
  };
  function setUnit(next: FluidUnit) {
    if (next === unit) return;
    if (mutate(() => r.saveProfile({ fluidUnit: next }))) done();
  }
  function startEdit() {
    setText(
      goal === undefined
        ? ""
        : String(Math.round(fromMl(goal, unit) * 10) / 10),
    );
    setError(undefined);
    setEditing(true);
  }
  function save() {
    const amount = parseAmount(text);
    const problem = goalError(amount, unit);
    if (problem) {
      setError(problem);
      return;
    }
    if (mutate(() => r.saveProfile({ waterGoal: toMl(amount, unit) }))) {
      setEditing(false);
      done();
    }
  }
  function remove() {
    if (mutate(() => r.saveProfile({ waterGoal: undefined }))) {
      setEditing(false);
      done();
    }
  }
  return (
    <View style={{ gap: forge.spacing.group }}>
      <View style={{ gap: 6 }}>
        <FText variant="overline" tone="secondary">
          Units
        </FText>
        <ForgeSegments options={UNITS} value={unit} onChange={setUnit} />
      </View>
      <View style={{ gap: 6 }}>
        <FText variant="overline" tone="secondary">
          Daily goal
        </FText>
        {editing ? (
          <>
            <AmountInput
              label={`Daily water goal (${unitLabel(unit)})`}
              value={text}
              onChange={(t) => {
                setText(t);
                setError(undefined);
              }}
              error={error}
              suffix={unitLabel(unit)}
              onSubmit={save}
            />
            <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
              <View style={{ flex: 1 }}>
                <OutlineButton
                  title="Cancel"
                  compact
                  onPress={() => setEditing(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <OutlineButton
                  title="Save goal"
                  tone="ember"
                  compact
                  onPress={save}
                />
              </View>
            </View>
          </>
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: forge.spacing.tight,
            }}
          >
            <FText variant="cardTitle" weight="700" style={{ flex: 1 }}>
              {goal === undefined
                ? "Not set"
                : `${volumeText(goal, unit)} a day`}
            </FText>
            {goal !== undefined && (
              <TextButton title="Remove" onPress={remove} />
            )}
            <OutlineButton
              title={goal === undefined ? "Set daily goal" : "Edit goal"}
              compact
              onPress={startEdit}
            />
          </View>
        )}
      </View>
    </View>
  );
}

/** One logged drink: as typed, with Edit and Delete. */
function EntryRow({
  entry,
  unit,
  divider,
  onChanged,
}: {
  entry: Journal;
  unit: FluidUnit;
  divider: boolean;
  onChanged: () => void;
}) {
  const r = useRepo();
  const c = useColors();
  const d = hydrationOf(entry.data)!;
  const own = d.unit ?? unit;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const shown = entryText(d);
  function save() {
    const amount = parseAmount(text);
    const problem = amountError(amount, own);
    if (problem) {
      setError(problem);
      return;
    }
    if (
      mutate(() => {
        r.updateJournal(entry.id, hydrationData(amount, own));
        return true;
      })
    ) {
      setEditing(false);
      onChanged();
    }
  }
  return (
    <View
      style={{
        paddingVertical: 6,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
        gap: 6,
      }}
    >
      {editing ? (
        <>
          <AmountInput
            label={`Amount (${unitLabel(own)})`}
            value={text}
            onChange={(t) => {
              setText(t);
              setError(undefined);
            }}
            error={error}
            suffix={unitLabel(own)}
            onSubmit={save}
          />
          <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
            <View style={{ flex: 1 }}>
              <OutlineButton
                title="Cancel"
                compact
                onPress={() => setEditing(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <OutlineButton
                title="Save"
                accessibilityLabel="Save amount"
                tone="ember"
                compact
                onPress={save}
              />
            </View>
          </View>
        </>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.tight,
          }}
        >
          <Ionicons name="water" size={18} color={c.hydration} />
          <View
            accessible
            accessibilityLabel={`Water, ${entrySpoken(d)}`}
            style={{ flex: 1 }}
          >
            <FText variant="body" weight="600">
              {shown}
            </FText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${shown}`}
            onPress={() => {
              setText(
                String(Math.round((d.amount ?? fromMl(d.ml, own)) * 100) / 100),
              );
              setError(undefined);
              setEditing(true);
            }}
            style={iconButton}
          >
            <Ionicons name="create-outline" size={20} color={c.text2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${shown}`}
            onPress={() =>
              confirm(
                "Delete water entry?",
                `${shown} will be removed from ${dayTitle(entry.date) === "Today" ? "today" : dayTitle(entry.date)}.`,
                () => {
                  r.deleteJournal(entry.id);
                  onChanged();
                },
                { action: "Delete entry" },
              )
            }
            style={iconButton}
          >
            <Ionicons name="trash-outline" size={20} color={c.text2} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const iconButton = ({ pressed }: { pressed: boolean }) => ({
  width: forge.heights.compact,
  height: forge.heights.compact,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  opacity: pressed ? 0.6 : 1,
});

/**
 * The hydration sheet for one day: total against the lifter's own goal,
 * presets and a typed amount (each with Undo), the day's entries with Edit
 * and Delete, and the goal and unit. Mount it when needed.
 */
export function HydrationSheet({
  day,
  today,
  onClose,
}: {
  day: string;
  today: string;
  onClose: () => void;
}) {
  const r = useRepo();
  const c = useColors();
  const p = r.profile();
  const unit = fluidUnitOf(p);
  const [, refresh] = useState(0);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<{ id: string; text: string }>();
  // Goal and units start open until the lifter has a goal.
  const [settings, setSettings] = useState(p.waterGoal === undefined);
  // Guards a preset against a double tap logging twice.
  const busy = useRef(new Set<string>());
  const entries = r
    .journal("hydration")
    .filter((e) => e.date === day && hydrationOf(e.data))
    .sort((a, b) => b.createdAt - a.createdAt);
  const total = totalMl(entries);
  const view = hydrationDay(total, p.waterGoal, unit);
  const when = dayTitle(day, today);
  const changed = () => refresh((n) => n + 1);

  function log(amount: number, guard: string) {
    if (busy.current.has(guard)) return false;
    busy.current.add(guard);
    setTimeout(() => busy.current.delete(guard), 400);
    const data = hydrationData(amount, unit);
    const entry = mutate(() => r.addJournal("hydration", data, day));
    if (!entry) return false;
    const text = entryText(data);
    setAdded({ id: entry.id, text });
    AccessibilityInfo.announceForAccessibility(
      `Added ${entrySpoken(data)} of water. Undo available.`,
    );
    changed();
    return true;
  }
  function addCustom() {
    const amount = parseAmount(custom);
    const problem = amountError(amount, unit);
    if (problem) {
      setError(problem);
      return;
    }
    if (log(amount, `custom:${amount}`)) setCustom("");
  }
  function undo() {
    if (!added) return;
    if (
      mutate(() => {
        r.deleteJournal(added.id);
        return true;
      })
    ) {
      AccessibilityInfo.announceForAccessibility(`Removed ${added.text}`);
      setAdded(undefined);
      changed();
    }
  }

  return (
    <Sheet visible onClose={onClose} title="Hydration">
      <View style={{ gap: forge.spacing.cardGap }}>
        {/* The day's total, against the lifter's own goal only. */}
        <View
          style={{
            gap: 10,
            padding: forge.spacing.cardPadding,
            borderRadius: forge.radii.card,
            borderWidth: forge.border.card,
            borderColor: c.cardBorder,
            backgroundColor: c.cardBg,
          }}
        >
          <FText variant="overline" tone="secondary">
            {when === "Today" ? "Today's water" : `Water · ${when}`}
          </FText>
          <View
            accessible
            accessibilityLabel={view.spoken}
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              flexWrap: "wrap",
              columnGap: 8,
            }}
          >
            <Ionicons name="water" size={22} color={c.hydration} />
            <FText variant="cardMetric">{view.total}</FText>
            {view.goal && (
              <FText variant="body" tone="secondary">
                {`of ${view.goal}`}
              </FText>
            )}
          </View>
          {view.ratio !== undefined ? (
            <>
              <ForgeProgress
                value={view.ratio}
                label="Water"
                tone="hydration"
                height={8}
              />
              <FText variant="label" tone="secondary">
                {`${view.percent}% · ${view.left}`}
              </FText>
            </>
          ) : (
            <FText variant="label" tone="secondary">
              No daily goal yet. Set your own under Daily goal.
            </FText>
          )}
        </View>

        {/* Adding: presets and a typed amount. */}
        <View style={{ gap: 8 }}>
          <FText variant="overline" tone="secondary">
            {when === "Today" ? "Add water" : `Add water · ${when}`}
          </FText>
          <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
            {PRESETS[unit].map((amount) => {
              const label = `${amount} ${unitLabel(unit)}`;
              return (
                <Pressable
                  key={label}
                  testID="water-preset"
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${label}`}
                  onPress={() => log(amount, `preset:${label}`)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: forge.heights.button,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 4,
                    borderRadius: forge.radii.tile,
                    borderWidth: forge.border.card,
                    borderColor: pressed ? c.hydration : c.cardBorder,
                    backgroundColor: c.hydrationTint,
                  })}
                >
                  <Ionicons name="add" size={16} color={c.hydration} />
                  <FText variant="label" weight="700" numberOfLines={1} fit>
                    {label}
                  </FText>
                </Pressable>
              );
            })}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: forge.spacing.tight,
            }}
          >
            <AmountInput
              label={`Custom amount (${unitLabel(unit)})`}
              value={custom}
              onChange={(t) => {
                setCustom(t);
                setError(undefined);
              }}
              error={error}
              suffix={unitLabel(unit)}
              onSubmit={addCustom}
            />
            <OutlineButton
              title="Add"
              accessibilityLabel="Add custom amount"
              icon="add"
              onPress={addCustom}
            />
          </View>
          {added && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: forge.spacing.tight,
                paddingLeft: forge.spacing.group,
                borderRadius: forge.radii.tile,
                borderWidth: forge.border.card,
                borderColor: c.cardBorder,
                backgroundColor: c.cardRaised,
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={c.hydration} />
              <FText variant="label" style={{ flex: 1 }}>
                {`Added ${added.text}`}
              </FText>
              <TextButton
                title="Undo"
                accessibilityLabel={`Undo adding ${added.text}`}
                onPress={undo}
              />
            </View>
          )}
        </View>

        {/* The day's entries. */}
        <View style={{ gap: 4 }}>
          <FText variant="overline" tone="secondary">
            {entries.length
              ? `${entries.length} ${entries.length === 1 ? "drink" : "drinks"}`
              : "Nothing logged"}
          </FText>
          {entries.map((e, i) => (
            <EntryRow
              key={e.id}
              entry={e}
              unit={unit}
              divider={i > 0}
              onChanged={changed}
            />
          ))}
        </View>

        {/* Goal and unit (the same fields as You → Hydration). */}
        <View
          style={{
            gap: forge.spacing.group,
            paddingTop: forge.spacing.group,
            borderTopWidth: forge.border.card,
            borderTopColor: c.cardDivider,
          }}
        >
          {settings ? (
            <HydrationSettings onSaved={changed} />
          ) : (
            <TextButton
              title="Goal and units"
              icon="options-outline"
              onPress={() => setSettings(true)}
            />
          )}
        </View>
      </View>
    </Sheet>
  );
}
