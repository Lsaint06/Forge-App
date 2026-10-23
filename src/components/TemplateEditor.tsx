import React, { useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../platform/alert";
import { useRepo, mutate } from "../state";
import {
  Txt,
  Button,
  TextButton,
  Field,
  Sheet,
  useColors,
  confirmDiscard,
} from "./ui";
import { ExercisePicker } from "./ExercisePicker";
import { ReorderList } from "./ReorderSheet";
import { Stepper, LoadControl } from "./Stepper";
import {
  prescriptionLine,
  restText,
  loadForDisplay,
  loadForStorage,
  loadStep,
  moveItem,
} from "../domain/templates";
import type { Prescription, Template } from "../domain/types";
import { theme } from "../theme";

// Creating and editing a workout template. Every change stays in this sheet
// until Save, which writes the whole template in one transaction; Cancel and
// every other way out ask before discarding changes.

type Item = { key: string; p: Prescription };
let nextKey = 0;
const keyed = (p: Prescription): Item => ({ key: `item-${nextKey++}`, p });
/** A fixed rep target (no range). */
function withoutRange(p: Prescription): Prescription {
  const copy = { ...p };
  delete copy.repMax;
  return copy;
}
const snapshot = (name: string, notes: string, items: Item[]) =>
  JSON.stringify({ name: name.trim(), notes, items: items.map((i) => i.p) });

function ExerciseEditor({
  item,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  item: Item;
  expanded: boolean;
  onToggle: () => void;
  onChange: (p: Prescription) => void;
  onRemove: () => void;
}) {
  const r = useRepo();
  const c = useColors();
  const p = r.profile();
  const { p: rx } = item;
  const name = r.exercise(rx.exerciseId)?.name ?? "Unavailable exercise";
  const top = rx.repMax ?? rx.reps;
  return (
    <View
      style={{
        backgroundColor: c.surfaceRaised,
        borderRadius: theme.radii.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityHint={
          expanded ? "Hides the controls" : "Edit sets, reps, load and rest"
        }
        accessibilityState={{ expanded }}
        accessibilityValue={{ text: prescriptionLine(rx, p.units) }}
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.group,
          minHeight: 60,
          paddingHorizontal: theme.spacing.row,
          paddingVertical: 10,
          backgroundColor: pressed ? c.selected : "transparent",
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="600" numberOfLines={2}>
            {name}
          </Txt>
          <Txt variant="caption" tone="secondary">
            {prescriptionLine(rx, p.units)}
          </Txt>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.text3}
        />
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: theme.spacing.row,
            paddingBottom: theme.spacing.sm,
            borderTopWidth: 0.5,
            borderColor: c.hairline,
          }}
        >
          <Stepper
            label="Sets"
            value={rx.sets}
            min={1}
            max={20}
            onChange={(sets) => onChange({ ...rx, sets })}
          />
          <Stepper
            label="Reps"
            value={rx.reps}
            min={1}
            max={100}
            onChange={(reps) =>
              onChange({
                ...rx,
                reps,
                // The range top never falls below the bottom.
                ...(rx.repMax !== undefined
                  ? { repMax: Math.max(reps, rx.repMax) }
                  : {}),
              })
            }
          />
          <Stepper
            label="Up to reps"
            value={top}
            min={rx.reps}
            max={100}
            format={(n) => (n === rx.reps ? "–" : String(n))}
            onChange={(repMax) =>
              onChange(
                repMax === rx.reps ? withoutRange(rx) : { ...rx, repMax },
              )
            }
          />
          <Stepper
            label="Rest"
            value={rx.rest}
            min={0}
            max={600}
            step={15}
            format={restText}
            onChange={(rest) => onChange({ ...rx, rest })}
          />
          <View style={{ gap: 4, paddingVertical: 6 }}>
            <Txt>{`Load (${p.units})`}</Txt>
            <LoadControl
              label={`${name} load (${p.units})`}
              value={loadForDisplay(rx.weight, p.units)}
              step={loadStep(p.increment, p.units)}
              onChange={(value) =>
                onChange({ ...rx, weight: loadForStorage(value, p.units) })
              }
            />
          </View>
          <View style={{ alignItems: "flex-start" }}>
            <TextButton
              title="Remove exercise"
              accessibilityLabel={`Remove ${name}`}
              icon="trash-outline"
              neutral
              onPress={onRemove}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  /** The template to edit; undefined creates a new one. */
  template?: Template;
  onClose: () => void;
  onSaved?: (t: Template) => void;
}) {
  const r = useRepo();
  const [name, setName] = useState(template?.name ?? "");
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [items, setItems] = useState<Item[]>(() =>
    (template?.exercises ?? []).map(keyed),
  );
  const [baseline] = useState(() => snapshot(name, notes, items));
  const [expanded, setExpanded] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [reorder, setReorder] = useState(false);
  const saving = useRef(false);
  const dirty = snapshot(name, notes, items) !== baseline;
  const canSave = !!name.trim() && items.length > 0;
  const title = template ? "Edit template" : "New template";

  function cancel() {
    if (dirty) confirmDiscard(onClose);
    else onClose();
  }
  function save() {
    if (saving.current || !canSave) return;
    saving.current = true;
    const t = mutate(() =>
      r.saveTemplate(
        name.trim(),
        items.map((i) => i.p),
        template?.id,
        notes,
      ),
    );
    if (!t) {
      saving.current = false;
      return;
    }
    onSaved?.(t);
    onClose();
  }
  function remove(item: Item) {
    const exercise = r.exercise(item.p.exerciseId)?.name ?? "this exercise";
    Alert.alert(
      `Remove ${exercise}?`,
      "It's removed from this template when you save.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => setItems((a) => a.filter((x) => x.key !== item.key)),
        },
      ],
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={title}
      unsaved={dirty}
      footer={
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="secondary" onPress={cancel} />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              title="Save template"
              icon="checkmark"
              disabled={!canSave}
              onPress={save}
            />
          </View>
        </View>
      }
    >
      <Field label="Template name" value={name} onChangeText={setName} />
      <Field
        label="Training notes"
        value={notes}
        multiline
        placeholder="Optional"
        onChangeText={setNotes}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Txt variant="overline" tone="secondary" header>
          {items.length ? `Exercises · ${items.length}` : "Exercises"}
        </Txt>
        {items.length > 1 && (
          <TextButton
            title="Reorder"
            accessibilityLabel="Reorder exercises"
            icon="reorder-four-outline"
            onPress={() => setReorder(true)}
          />
        )}
      </View>
      {!items.length && (
        <Txt tone="secondary">
          Add the exercises for this workout. You can set sets, reps, load and
          rest for each one.
        </Txt>
      )}
      {items.map((item) => (
        <ExerciseEditor
          key={item.key}
          item={item}
          expanded={expanded === item.key}
          onToggle={() =>
            setExpanded(expanded === item.key ? undefined : item.key)
          }
          onChange={(p) =>
            setItems((a) =>
              a.map((x) => (x.key === item.key ? { ...x, p } : x)),
            )
          }
          onRemove={() => remove(item)}
        />
      ))}
      <Button
        title="Add exercise"
        icon="add"
        variant="secondary"
        onPress={() => setPicker(true)}
      />
      {/* iOS only presents a modal from inside the one already showing, so
            the picker and reorder sheets must render within the editor. */}
      <ExercisePicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(e) => {
          const item = keyed({
            exerciseId: e.id,
            sets: 3,
            reps: 10,
            weight: 0,
            rest: r.profile().rest,
          });
          setItems((a) => [...a, item]);
          setExpanded(item.key);
        }}
      />
      {reorder && (
        <ReorderList
          items={items.map((i) => ({
            key: i.key,
            title: r.exercise(i.p.exerciseId)?.name ?? "Unavailable exercise",
            subtitle: prescriptionLine(i.p, r.profile().units),
          }))}
          initial={expanded}
          onMove={(key, to) =>
            setItems((a) =>
              moveItem(
                a,
                a.findIndex((x) => x.key === key),
                to,
              ),
            )
          }
          onClose={() => setReorder(false)}
        />
      )}
    </Sheet>
  );
}
