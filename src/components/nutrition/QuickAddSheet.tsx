import React, { useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  Switch,
  View,
} from "react-native";
import {
  Sheet,
  Field,
  Txt,
  Button,
  TextButton,
  IconButton,
  SegmentedControl,
  useColors,
  dark,
} from "../ui";
import { ListRow } from "../system";
import { NumberControl } from "../Stepper";
import {
  FoodFields,
  draftFrom,
  readDraft,
  sameDraft,
  type DraftErrors,
  type FoodDraft,
} from "./FoodForm";
import { useRepo, mutate } from "../../state";
import {
  MEALS,
  entryFromFood,
  foodChoices,
  foodFromEntry,
  foodKey,
  gramsText,
  isDuplicateFood,
  kcalText,
  amount,
  type FoodChoice,
  type NutritionData,
} from "../../domain/nutrition";
import { dayTitle } from "../../domain/calendar-dates";
import { theme } from "../../theme";

type Step =
  | { kind: "list" }
  | { kind: "detail"; food: FoodChoice; quantity: number; opened: number }
  | { kind: "create" };

const portion = (f: Pick<FoodChoice, "quantity" | "serving">) =>
  f.serving
    ? f.quantity === 1
      ? f.serving
      : `${amount(f.quantity)} × ${f.serving}`
    : `${amount(f.quantity)} ${f.quantity === 1 ? "serving" : "servings"}`;

/**
 * Adding food to a day: recent and saved foods with search. + logs a food at
 * its usual servings into the chosen meal (Undo takes it back); tapping a
 * food first lets the servings and meal be adjusted; Create food logs a new
 * one from its label. Everything happens inside this one sheet, so iOS never
 * has to stack another sheet on it. Mount it when needed.
 */
export function QuickAddSheet({
  day,
  today,
  initialMeal,
  onClose,
}: {
  day: string;
  today: string;
  initialMeal: string;
  onClose: () => void;
}) {
  const r = useRepo();
  const c = useColors();
  const [meal, setMeal] = useState(initialMeal);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<Step>({ kind: "list" });
  // Foods added while this sheet is open: food key → entry id (for Undo).
  const [added, setAdded] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<FoodDraft>(() => draftFrom());
  const [blank, setBlank] = useState<FoodDraft>(() => draftFrom());
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveFood, setSaveFood] = useState(true);
  // Guards against a double tap logging twice before the screen updates.
  const busy = useRef(new Set<string>());
  // The list keeps its order while the sheet is open, so a tap never lands
  // on a food that just moved. Foods created here join the top.
  const [history, setHistory] = useState(() => r.journal("nutrition"));
  const { recent, saved } = foodChoices(history, r.journal("food"), query);
  const creating = step.kind === "create";
  // Choosing a meal alone is not work to lose.
  const dirty =
    creating && !sameDraft({ ...draft, meal: "" }, { ...blank, meal: "" });
  const opens = useRef(0);

  function log(food: FoodChoice, quantity: number, guard: string) {
    if (busy.current.has(guard)) return;
    busy.current.add(guard);
    const entry = mutate(() =>
      r.addJournal("nutrition", entryFromFood(food, meal, quantity), day),
    );
    if (!entry) {
      busy.current.delete(guard);
      return;
    }
    setAdded((a) => ({ ...a, [food.key]: entry.id }));
    AccessibilityInfo.announceForAccessibility(`Added ${food.name} to ${meal}`);
  }
  function undo(food: FoodChoice) {
    const id = added[food.key];
    if (!id) return;
    const ok = mutate(() => {
      r.deleteJournal(id);
      return true;
    });
    if (!ok) return;
    busy.current.delete(`quick:${food.key}`);
    setAdded((a) => {
      const next = { ...a };
      delete next[food.key];
      return next;
    });
    AccessibilityInfo.announceForAccessibility(`Removed ${food.name}`);
  }
  function startCreate() {
    busy.current.delete("create");
    const fresh = { ...draftFrom(), name: query.trim() };
    setBlank(fresh);
    setDraft(fresh);
    setErrors({});
    setSaveFood(true);
    setStep({ kind: "create" });
  }
  function create() {
    if (busy.current.has("create")) return;
    const result = readDraft({ ...draft, meal }, { withMeal: true });
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    busy.current.add("create");
    const data: NutritionData = result.data;
    const entry = mutate(() => {
      const e = r.addJournal("nutrition", data, day);
      const food = foodFromEntry(data);
      if (saveFood && !isDuplicateFood(r.journal("food"), food))
        r.addJournal("food", food);
      return e;
    });
    // Released when Create opens again, so a second tap now does nothing.
    if (!entry) {
      busy.current.delete("create");
      return;
    }
    setHistory((h) => [entry, ...h]);
    setAdded((a) => ({ ...a, [foodKey(data)]: entry.id }));
    setQuery("");
    setStep({ kind: "list" });
    AccessibilityInfo.announceForAccessibility(
      `Added ${String(data.name)} to ${meal}`,
    );
  }

  const mealControl = (
    <SegmentedControl
      label="Meal"
      options={[...MEALS]}
      value={meal}
      onChange={setMeal}
    />
  );
  const context = `${dayTitle(day, today)} · ${meal}`;

  if (step.kind === "detail") {
    const { food, quantity } = step;
    const totals = (n: number) => n * quantity;
    return (
      <Sheet
        visible
        onClose={onClose}
        title={food.name}
        footer={
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Back"
                variant="secondary"
                accessibilityLabel="Back to foods"
                onPress={() => setStep({ kind: "list" })}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                title={`Add to ${meal}`}
                accessibilityLabel={`Add ${food.name} to ${meal}`}
                icon="add"
                onPress={() => {
                  log(food, quantity, `detail:${step.opened}`);
                  setStep({ kind: "list" });
                }}
              />
            </View>
          </View>
        }
      >
        <Txt tone="secondary">
          {food.serving ? `Serving: ${food.serving}` : "Per serving values"}
        </Txt>
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="secondary">
            Servings
          </Txt>
          <NumberControl
            label="Servings"
            value={quantity}
            step={0.25}
            min={0.01}
            floor={0.25}
            max={1000}
            onChange={(q) => setStep({ ...step, quantity: q })}
          />
        </View>
        <View
          accessible
          accessibilityLabel={`${kcalText(totals(food.calories))}, protein ${gramsText(totals(food.protein))}, carbs ${gramsText(totals(food.carbs))}, fat ${gramsText(totals(food.fat))}`}
          style={{
            backgroundColor: c.surfaceRaised,
            borderRadius: theme.radii.card,
            padding: theme.spacing.md,
            gap: 4,
          }}
        >
          <Txt variant="metric">{kcalText(totals(food.calories))}</Txt>
          <Txt tone="secondary" tabular>
            {`Protein ${gramsText(totals(food.protein))} · Carbs ${gramsText(totals(food.carbs))} · Fat ${gramsText(totals(food.fat))}`}
          </Txt>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="secondary">
            Meal
          </Txt>
          {mealControl}
        </View>
      </Sheet>
    );
  }

  if (creating)
    return (
      <Sheet
        visible
        onClose={onClose}
        title="New food"
        unsaved={dirty}
        footer={
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Back"
                variant="secondary"
                accessibilityLabel="Back to foods"
                onPress={() => setStep({ kind: "list" })}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                title={`Add to ${meal}`}
                accessibilityLabel={`Add new food to ${meal}`}
                icon="add"
                onPress={create}
              />
            </View>
          </View>
        }
      >
        <Txt tone="secondary">{`Enter the values from the label. ${context}.`}</Txt>
        <FoodFields
          draft={{ ...draft, meal }}
          onChange={(patch) => {
            if (patch.meal !== undefined) setMeal(patch.meal);
            setDraft((d) => ({ ...d, ...patch }));
            setErrors((e) => {
              const next = { ...e };
              for (const key of Object.keys(patch))
                delete next[key as keyof FoodDraft];
              return next;
            });
          }}
          errors={errors}
          kind="new-entry"
        />
        <ListRow
          title="Save to my foods"
          subtitle="Log it again later in one tap"
          accessibilityLabel="Save to my foods"
          chevron={false}
          onPress={() => setSaveFood((s) => !s)}
          trailing={
            <Switch
              accessibilityLabel="Save to my foods switch"
              value={saveFood}
              onValueChange={setSaveFood}
              trackColor={{
                true: c.ember,
                false: c.bg === dark.bg ? c.selected : c.text3,
              }}
              thumbColor={c.bg === dark.bg ? c.text : c.surface}
            />
          }
        />
      </Sheet>
    );

  type Item =
    { type: "header"; title: string } | { type: "food"; food: FoodChoice };
  const items: Item[] = [
    ...(recent.length
      ? [{ type: "header" as const, title: query ? "Eaten before" : "Recent" }]
      : []),
    ...recent.map((food) => ({ type: "food" as const, food })),
    ...(saved.length
      ? [{ type: "header" as const, title: "Saved foods" }]
      : []),
    ...saved.map((food) => ({ type: "food" as const, food })),
  ];

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add food"
      scroll={false}
      footer={
        <Button
          title={query.trim() ? `Create “${query.trim()}”` : "Create food"}
          accessibilityLabel="Create food"
          icon="create-outline"
          variant="secondary"
          onPress={startCreate}
        />
      }
    >
      {/* The controls keep their size; only the list gives way to the keyboard. */}
      <View style={{ flexShrink: 0, gap: theme.spacing.md }}>
        <Txt tone="secondary">{`Adding to ${dayTitle(day, today)}`}</Txt>
        {mealControl}
        <Field
          label="Search foods"
          value={query}
          onChangeText={setQuery}
          placeholder="Name or serving"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View style={{ height: 420, flexShrink: 1, minHeight: 0 }}>
        <FlatList
          data={items}
          keyExtractor={(item) =>
            item.type === "header"
              ? `h:${item.title}`
              : `${item.food.source}:${item.food.key}`
          }
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Txt tone="secondary" style={{ paddingVertical: theme.spacing.md }}>
              {query.trim()
                ? `No foods match “${query.trim()}”. Create it from its label below.`
                : "Foods you log appear here, ready to add again in one tap. Create your first from its nutrition label."}
            </Txt>
          }
          renderItem={({ item }) =>
            item.type === "header" ? (
              <Txt
                variant="overline"
                tone="secondary"
                header
                style={{ paddingTop: theme.spacing.md, paddingBottom: 4 }}
              >
                {item.title}
              </Txt>
            ) : (
              <FoodRow
                food={item.food}
                added={!!added[item.food.key]}
                onAdd={() =>
                  log(item.food, item.food.quantity, `quick:${item.food.key}`)
                }
                onUndo={() => undo(item.food)}
                onOpen={() =>
                  setStep({
                    kind: "detail",
                    food: item.food,
                    quantity: item.food.quantity,
                    opened: ++opens.current,
                  })
                }
              />
            )
          }
        />
      </View>
    </Sheet>
  );
}

function FoodRow({
  food,
  added,
  onAdd,
  onUndo,
  onOpen,
}: {
  food: FoodChoice;
  added: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const c = useColors();
  const kcal = kcalText(food.calories * food.quantity);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: theme.heights.rowTall,
        borderBottomWidth: 1,
        borderColor: c.hairline,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${food.name}, ${portion(food)}, ${kcal}`}
        accessibilityHint="Choose servings and meal before adding"
        onPress={onOpen}
        style={({ pressed }) => ({
          flex: 1,
          paddingVertical: 10,
          gap: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt weight="600" numberOfLines={2}>
          {food.name}
        </Txt>
        <Txt variant="caption" tone="secondary" numberOfLines={1}>
          {`${portion(food)} · ${kcal}`}
        </Txt>
      </Pressable>
      {added ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt variant="caption" tone="success">
            Added
          </Txt>
          <TextButton
            title="Undo"
            accessibilityLabel={`Undo adding ${food.name}`}
            onPress={onUndo}
          />
        </View>
      ) : (
        <IconButton
          icon="add-circle"
          size={30}
          tone="accent"
          label={`Add ${food.name}`}
          onPress={onAdd}
        />
      )}
    </View>
  );
}
