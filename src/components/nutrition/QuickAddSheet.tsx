import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Sheet,
  Field,
  Txt,
  Button,
  TextButton,
  IconButton,
  SegmentedControl,
  Chips,
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
import {
  DEFAULT_GRAMS,
  MAX_COUNT,
  MAX_GRAMS,
  MIN_COUNT,
  MIN_GRAMS,
  choiceError,
  entryFromLibrary,
  searchLibrary,
  totalGrams,
  valuesForGrams,
  type LibraryFood,
  type PortionChoice,
} from "../../domain/food-library";
import { tryLoadFoodLibrary } from "../../data/food-catalog";
import { dayTitle } from "../../domain/calendar-dates";
import { theme } from "../../theme";

type Step =
  | { kind: "list" }
  | { kind: "detail"; food: FoodChoice; quantity: number; opened: number }
  | {
      kind: "library";
      food: LibraryFood;
      choice: PortionChoice;
      opened: number;
      note?: string;
    }
  | { kind: "create" };

/** Library results are shown this many at a time. */
const PAGE = 30;

const portion = (f: Pick<FoodChoice, "quantity" | "serving">) =>
  f.serving
    ? f.quantity === 1
      ? f.serving
      : `${amount(f.quantity)} × ${f.serving}`
    : `${amount(f.quantity)} ${f.quantity === 1 ? "serving" : "servings"}`;

/**
 * Adding food to a day: recent and saved foods first, then the built-in
 * USDA food library, all searched together. + logs a food at its usual
 * servings (a library food at 100 g) into the chosen meal, and Undo takes it
 * back; tapping a food first lets the amount and meal be adjusted; Create
 * food logs a new one from its label. Everything happens inside this one
 * sheet, so iOS never has to stack another sheet on it. Mount it when needed.
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
  // Foods added while this sheet is open: row key → entry id (for Undo).
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
  // The library is read-only and offline; searching it is deferred so
  // typing stays responsive.
  const [catalog, setCatalog] = useState(tryLoadFoodLibrary);
  const library = "library" in catalog ? catalog.library : undefined;
  const searched = useDeferredValue(query.trim());
  const libraryFoods = useMemo(
    () =>
      !library
        ? []
        : searched
          ? searchLibrary(library, searched)
          : library.featured,
    [library, searched],
  );
  const [shown, setShown] = useState(PAGE);
  // While typing, the day and meal shrink to one line (none on short
  // screens) so more foods fit above the keyboard.
  const [typing, setTyping] = useState(false);
  const window = useWindowDimensions();
  const short = window.height < 740;
  // At larger text the day, meal and search scroll with the foods (as the
  // list's header), so results get the sheet's full height.
  const roomy = (window.fontScale || 1) >= 1.3;
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillShow" : "keyboardDidShow",
      () => setTyping(true),
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => setTyping(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const creating = step.kind === "create";
  // Choosing a meal alone is not work to lose.
  const dirty =
    creating && !sameDraft({ ...draft, meal: "" }, { ...blank, meal: "" });
  const opens = useRef(0);

  function logData(
    key: string,
    data: NutritionData,
    name: string,
    guard: string,
  ) {
    if (busy.current.has(guard)) return false;
    busy.current.add(guard);
    const entry = mutate(() => r.addJournal("nutrition", data, day));
    if (!entry) {
      busy.current.delete(guard);
      return false;
    }
    setAdded((a) => ({ ...a, [key]: entry.id }));
    AccessibilityInfo.announceForAccessibility(`Added ${name} to ${meal}`);
    return true;
  }
  function log(food: FoodChoice, quantity: number, guard: string) {
    return logData(
      food.key,
      entryFromFood(food, meal, quantity),
      food.name,
      guard,
    );
  }
  function logLibrary(food: LibraryFood, choice: PortionChoice, guard: string) {
    if (!library || choiceError(food, choice)) return false;
    return logData(
      `lib:${food.id}`,
      entryFromLibrary(food, choice, library.version, meal),
      food.name,
      guard,
    );
  }
  function undo(key: string, name: string) {
    const id = added[key];
    if (!id) return;
    const ok = mutate(() => {
      r.deleteJournal(id);
      return true;
    });
    if (!ok) return;
    busy.current.delete(`quick:${key}`);
    setAdded((a) => {
      const next = { ...a };
      delete next[key];
      return next;
    });
    AccessibilityInfo.announceForAccessibility(`Removed ${name}`);
  }
  /** Saves the chosen portion of a library food as the lifter's own food. */
  function saveCopy(food: LibraryFood, choice: PortionChoice, guard: string) {
    if (!library || step.kind !== "library" || busy.current.has(guard)) return;
    const data = foodFromEntry(entryFromLibrary(food, choice, library.version));
    if (isDuplicateFood(r.journal("food"), data)) {
      setStep({ ...step, note: "Already in your saved foods" });
      return;
    }
    busy.current.add(guard);
    const savedFood = mutate(() => r.addJournal("food", data));
    if (!savedFood) {
      busy.current.delete(guard);
      return;
    }
    setStep({ ...step, note: "Saved to your foods" });
    AccessibilityInfo.announceForAccessibility(
      `Saved ${food.name} to your foods`,
    );
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
  const backFooter = (add: React.ReactNode) => (
    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Button
          title="Back"
          variant="secondary"
          accessibilityLabel="Back to foods"
          onPress={() => setStep({ kind: "list" })}
        />
      </View>
      <View style={{ flex: 2 }}>{add}</View>
    </View>
  );

  if (step.kind === "detail") {
    const { food, quantity } = step;
    const totals = (n: number) => n * quantity;
    return (
      <Sheet
        visible
        onClose={onClose}
        title={food.name}
        footer={backFooter(
          <Button
            title={`Add to ${meal}`}
            accessibilityLabel={`Add ${food.name} to ${meal}`}
            icon="add"
            onPress={() => {
              log(food, quantity, `detail:${step.opened}`);
              setStep({ kind: "list" });
            }}
          />,
        )}
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
        <ValuesCard
          calories={totals(food.calories)}
          protein={totals(food.protein)}
          carbs={totals(food.carbs)}
          fat={totals(food.fat)}
        />
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="secondary">
            Meal
          </Txt>
          {mealControl}
        </View>
      </Sheet>
    );
  }

  if (step.kind === "library" && library) {
    const { food, choice } = step;
    const error = choiceError(food, choice);
    const grams = totalGrams(food, choice);
    const v = valuesForGrams(food, Number.isFinite(grams) ? grams : 0);
    const units = [
      "Grams",
      ...food.portions.map((p) => `${p.label} · ${amount(p.grams)} g`),
    ];
    const unit = choice.kind === "grams" ? "Grams" : units[choice.index + 1]!;
    const setChoice = (next: PortionChoice) =>
      setStep({ ...step, choice: next, note: undefined });
    const fdcId = food.id.split(":")[1];
    return (
      <Sheet
        visible
        onClose={onClose}
        title={food.name}
        footer={backFooter(
          <Button
            title={`Add to ${meal}`}
            accessibilityLabel={`Add ${food.name} to ${meal}`}
            icon="add"
            disabled={!!error}
            onPress={() => {
              if (logLibrary(food, choice, `libdetail:${step.opened}`))
                setStep({ kind: "list" });
            }}
          />,
        )}
      >
        <View style={{ gap: 2 }}>
          {(food.description !== food.name || food.name.length > 48) && (
            <Txt variant="caption" tone="secondary">
              {`USDA: ${food.description}`}
            </Txt>
          )}
          <Txt variant="caption" tone="secondary">
            {`Per 100 g: ${kcalText(food.kcal)} · P ${amount(food.protein)} g · C ${amount(food.carbs)} g · F ${amount(food.fat)} g`}
          </Txt>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="secondary">
            Portion
          </Txt>
          <Chips
            values={units}
            value={unit}
            onChange={(u) => {
              const i = units.indexOf(u);
              setChoice(
                i <= 0
                  ? {
                      kind: "grams",
                      grams:
                        choice.kind === "grams" ? choice.grams : DEFAULT_GRAMS,
                    }
                  : {
                      kind: "portion",
                      index: i - 1,
                      count: choice.kind === "portion" ? choice.count : 1,
                    },
              );
            }}
          />
          {choice.kind === "grams" ? (
            <NumberControl
              key="grams"
              label="Grams"
              value={choice.grams}
              step={10}
              min={MIN_GRAMS}
              floor={10}
              max={MAX_GRAMS}
              onChange={(g) => setChoice({ kind: "grams", grams: g })}
            />
          ) : (
            <NumberControl
              key={`portion-${choice.index}`}
              label="Portions"
              value={choice.count}
              step={0.25}
              min={MIN_COUNT}
              floor={0.25}
              max={MAX_COUNT}
              onChange={(n) => setChoice({ ...choice, count: n })}
            />
          )}
        </View>
        <ValuesCard
          calories={v.calories}
          protein={v.protein}
          carbs={v.carbs}
          fat={v.fat}
          detail={error ?? `${amount(grams)} g`}
          error={!!error}
        />
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="secondary">
            Meal
          </Txt>
          {mealControl}
        </View>
        <View style={{ gap: 2 }}>
          <ListRow
            icon="bookmark-outline"
            title={step.note ?? "Save to my foods"}
            subtitle={
              step.note ? undefined : "Keep this portion as your own food"
            }
            chevron={false}
            accessibilityLabel={step.note ?? `Save ${food.name} to my foods`}
            onPress={
              error || step.note
                ? undefined
                : () => saveCopy(food, choice, `copy:${step.opened}`)
            }
          />
          <Txt variant="caption" tone="secondary">
            {`Source: USDA FoodData Central, ${library.releases[food.id.split(":")[0]!] ?? "FoodData Central"}, FDC ${fdcId}. Public-domain data; values per 100 g as published.`}
          </Txt>
          <TextButton
            title="View on FoodData Central"
            accessibilityLabel={`View ${food.name} on FoodData Central`}
            onPress={() =>
              void Linking.openURL(
                `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
              ).catch(() => {})
            }
          />
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
        footer={backFooter(
          <Button
            title={`Add to ${meal}`}
            accessibilityLabel={`Add new food to ${meal}`}
            icon="add"
            onPress={create}
          />,
        )}
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
    | { type: "header"; title: string }
    | { type: "note"; text: string; retry?: boolean }
    | { type: "food"; food: FoodChoice }
    | { type: "library"; food: LibraryFood }
    | { type: "more"; remaining: number };
  const libraryItems: Item[] = !library
    ? [
        {
          type: "note",
          text: "error" in catalog ? catalog.error : "",
          retry: true,
        },
      ]
    : libraryFoods.length
      ? [
          {
            type: "header",
            title: searched ? "Food library · USDA" : "Common foods · USDA",
          },
          ...libraryFoods
            .slice(0, shown)
            .map((food) => ({ type: "library" as const, food })),
          ...(libraryFoods.length > shown
            ? [
                {
                  type: "more" as const,
                  remaining: libraryFoods.length - shown,
                },
              ]
            : []),
        ]
      : [];
  const items: Item[] = [
    ...(!query.trim() && !recent.length && !saved.length
      ? [
          {
            type: "note" as const,
            text: "Foods you log appear here, ready to add again in one tap. Pick a common food below, search the USDA library, or create one from its label.",
          },
        ]
      : []),
    ...(recent.length
      ? [{ type: "header" as const, title: query ? "Eaten before" : "Recent" }]
      : []),
    ...recent.map((food) => ({ type: "food" as const, food })),
    ...(saved.length
      ? [{ type: "header" as const, title: "Saved foods" }]
      : []),
    ...saved.map((food) => ({ type: "food" as const, food })),
    ...libraryItems,
  ];
  const nothingFound =
    !!query.trim() && !recent.length && !saved.length && !libraryItems.length;
  // Pinned below the list; while typing it moves to the end of the list so
  // results fit above the keyboard on small phones.
  const createButton = (
    <Button
      title={query.trim() ? `Create “${query.trim()}”` : "Create food"}
      accessibilityLabel="Create food"
      icon="create-outline"
      variant="secondary"
      onPress={startCreate}
    />
  );

  // The day, meal and search. They keep their size above the list (only the
  // list gives way to the keyboard); at larger text they scroll with it.
  const controls = (
    <View style={{ flexShrink: 0, gap: theme.spacing.md }}>
      {typing ? (
        short ? null : (
          <Txt tone="secondary">{`Adding to ${context}`}</Txt>
        )
      ) : (
        <>
          <Txt tone="secondary">{`Adding to ${dayTitle(day, today)}`}</Txt>
          {mealControl}
        </>
      )}
      <Field
        label="Search foods"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setShown(PAGE);
        }}
        placeholder="Food, e.g. chicken breast"
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add food"
      scroll={false}
      footer={typing ? undefined : createButton}
    >
      {!roomy && controls}
      <View
        style={
          roomy
            ? { height: 2000, flexShrink: 1, minHeight: 0 }
            : { height: 420, flexShrink: 1, minHeight: 0 }
        }
      >
        <FlatList
          ListHeaderComponent={
            roomy ? (
              <View style={{ paddingBottom: theme.spacing.sm }}>
                {controls}
              </View>
            ) : undefined
          }
          data={nothingFound ? [] : items}
          keyExtractor={(item, i) =>
            item.type === "header"
              ? `h:${item.title}`
              : item.type === "food"
                ? `${item.food.source}:${item.food.key}`
                : item.type === "library"
                  ? `lib:${item.food.id}`
                  : `${item.type}:${i}`
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListFooterComponent={
            typing ? (
              <View style={{ paddingVertical: theme.spacing.sm }}>
                {createButton}
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <Txt tone="secondary" style={{ paddingVertical: theme.spacing.md }}>
              {`No foods match “${query.trim()}”. Check the spelling, try fewer words, or create it from its label below.`}
            </Txt>
          }
          renderItem={({ item }) => {
            if (item.type === "header")
              return (
                <Txt
                  variant="overline"
                  tone="secondary"
                  header
                  style={{ paddingTop: theme.spacing.md, paddingBottom: 4 }}
                >
                  {item.title}
                </Txt>
              );
            if (item.type === "note")
              return (
                <View style={{ paddingVertical: theme.spacing.sm, gap: 4 }}>
                  <Txt tone="secondary">{item.text}</Txt>
                  {item.retry && (
                    <TextButton
                      title="Try again"
                      accessibilityLabel="Try loading the food library again"
                      onPress={() => setCatalog(tryLoadFoodLibrary())}
                    />
                  )}
                </View>
              );
            if (item.type === "more")
              return (
                <TextButton
                  title={`Show ${Math.min(PAGE, item.remaining)} more`}
                  accessibilityLabel={`Show more library foods, ${item.remaining} not shown`}
                  onPress={() => setShown((n) => n + PAGE)}
                />
              );
            if (item.type === "library") {
              const food = item.food;
              const key = `lib:${food.id}`;
              const kcal = kcalText(food.kcal);
              return (
                <FoodRow
                  title={food.name}
                  caption={`100 g · ${kcal} · ${gramsText(food.protein)} protein`}
                  label={`${food.name}, 100 g, ${kcal}, ${gramsText(food.protein)} protein`}
                  hint="Choose a portion and meal before adding"
                  addLabel={`Add 100 g of ${food.name}`}
                  undoLabel={`Undo adding ${food.name}`}
                  added={!!added[key]}
                  onAdd={() =>
                    logLibrary(
                      food,
                      { kind: "grams", grams: DEFAULT_GRAMS },
                      `quick:${key}`,
                    )
                  }
                  onUndo={() => undo(key, food.name)}
                  onOpen={() =>
                    setStep({
                      kind: "library",
                      food,
                      choice: { kind: "grams", grams: DEFAULT_GRAMS },
                      opened: ++opens.current,
                    })
                  }
                />
              );
            }
            const food = item.food;
            const kcal = kcalText(food.calories * food.quantity);
            return (
              <FoodRow
                title={food.name}
                caption={`${portion(food)} · ${kcal}`}
                label={`${food.name}, ${portion(food)}, ${kcal}`}
                hint="Choose servings and meal before adding"
                addLabel={`Add ${food.name}`}
                undoLabel={`Undo adding ${food.name}`}
                added={!!added[food.key]}
                onAdd={() => log(food, food.quantity, `quick:${food.key}`)}
                onUndo={() => undo(food.key, food.name)}
                onOpen={() =>
                  setStep({
                    kind: "detail",
                    food,
                    quantity: food.quantity,
                    opened: ++opens.current,
                  })
                }
              />
            );
          }}
        />
      </View>
    </Sheet>
  );
}

/** The energy and macronutrients of what is about to be logged. */
function ValuesCard({
  calories,
  protein,
  carbs,
  fat,
  detail,
  error = false,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  detail?: string;
  error?: boolean;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${kcalText(calories)}, protein ${gramsText(protein)}, carbs ${gramsText(carbs)}, fat ${gramsText(fat)}${detail ? `, ${detail}` : ""}`}
      style={{
        backgroundColor: c.surfaceRaised,
        borderRadius: theme.radii.card,
        padding: theme.spacing.md,
        gap: 4,
      }}
    >
      <Txt variant="metric">{kcalText(calories)}</Txt>
      <Txt tone="secondary" tabular>
        {`Protein ${gramsText(protein)} · Carbs ${gramsText(carbs)} · Fat ${gramsText(fat)}`}
      </Txt>
      {detail && (
        <Txt variant="caption" tone={error ? "error" : "secondary"} tabular>
          {detail}
        </Txt>
      )}
    </View>
  );
}

function FoodRow({
  title,
  caption,
  label,
  hint,
  addLabel,
  undoLabel,
  added,
  onAdd,
  onUndo,
  onOpen,
}: {
  title: string;
  caption: string;
  label: string;
  hint: string;
  addLabel: string;
  undoLabel: string;
  added: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const c = useColors();
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
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onOpen}
        style={({ pressed }) => ({
          flex: 1,
          paddingVertical: 10,
          gap: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt weight="600" numberOfLines={2}>
          {title}
        </Txt>
        <Txt variant="caption" tone="secondary" numberOfLines={1}>
          {caption}
        </Txt>
      </Pressable>
      {added ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt variant="caption" tone="success">
            Added
          </Txt>
          <TextButton
            title="Undo"
            accessibilityLabel={undoLabel}
            onPress={onUndo}
          />
        </View>
      ) : (
        <IconButton
          icon="add-circle"
          size={30}
          tone="accent"
          label={addLabel}
          onPress={onAdd}
        />
      )}
    </View>
  );
}
