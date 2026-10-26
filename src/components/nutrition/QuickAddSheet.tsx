import React, {
  memo,
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
import { Ionicons } from "@expo/vector-icons";
import { Sheet, TextButton, useColors, dark } from "../ui";
import {
  CtaButton,
  FText,
  ForgeChips,
  ForgeSearchField,
  ForgeSegments,
  ForgeStepper,
  OutlineButton,
} from "../reforge";
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
import { forge, theme } from "../../theme";
import {
  choicePortion,
  choiceResult,
  libraryResult,
  type FoodResult,
} from "./results";

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
    <ForgeSegments
      options={MEALS.map((m) => ({ value: m, label: m }))}
      value={meal as (typeof MEALS)[number]}
      onChange={setMeal}
    />
  );
  const context = `${dayTitle(day, today)} · ${meal}`;
  const backFooter = (add: React.ReactNode) => (
    <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
      <View style={{ flex: 1 }}>
        <OutlineButton
          title="Back"
          icon="chevron-back"
          accessibilityLabel="Back to foods"
          onPress={() => setStep({ kind: "list" })}
        />
      </View>
      <View style={{ flex: 2 }}>{add}</View>
    </View>
  );
  // Where the food will go, always in view before adding.
  const destination = (
    <Destination text={`Logs to ${meal} · ${dayTitle(day, today)}`} />
  );

  if (step.kind === "detail") {
    const { food, quantity } = step;
    const totals = (n: number) => n * quantity;
    const r0 = choiceResult(food);
    return (
      <Sheet
        visible
        onClose={onClose}
        title={food.name}
        footer={backFooter(
          <CtaButton
            title={`Add to ${meal}`}
            accessibilityLabel={`Add ${food.name} to ${meal}`}
            icon="add"
            compact
            onPress={() => {
              log(food, quantity, `detail:${step.opened}`);
              setStep({ kind: "list" });
            }}
          />,
        )}
      >
        <View style={{ gap: forge.spacing.cardGap }}>
          <View style={{ gap: 4 }}>
            {r0.provenance && (
              <FText variant="label" tone="secondary">
                {`Values: ${r0.provenance}`}
              </FText>
            )}
            <FText variant="label" tone="secondary">
              {food.serving
                ? `1 serving = ${food.serving} · ${kcalText(food.calories)} · P ${gramsText(food.protein)} · C ${gramsText(food.carbs)} · F ${gramsText(food.fat)}`
                : `Per serving: ${kcalText(food.calories)} · P ${gramsText(food.protein)} · C ${gramsText(food.carbs)} · F ${gramsText(food.fat)}`}
            </FText>
          </View>
          <Section title="Amount">
            <ForgeStepper
              label="Servings"
              value={quantity}
              step={0.25}
              min={0.01}
              floor={0.25}
              max={1000}
              unit={food.serving ? `× ${food.serving}` : "servings"}
              onChange={(q) => setStep({ ...step, quantity: q })}
            />
          </Section>
          <ValuesCard
            heading={`For ${choicePortion({ quantity, serving: food.serving })}`}
            calories={totals(food.calories)}
            protein={totals(food.protein)}
            carbs={totals(food.carbs)}
            fat={totals(food.fat)}
          />
          <Section title="Meal">
            {mealControl}
            {destination}
          </Section>
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
    const portionName =
      choice.kind === "portion"
        ? food.portions[choice.index]?.label
        : undefined;
    return (
      <Sheet
        visible
        onClose={onClose}
        title={food.name}
        footer={backFooter(
          <CtaButton
            title={`Add to ${meal}`}
            accessibilityLabel={`Add ${food.name} to ${meal}`}
            icon="add"
            compact
            disabled={!!error}
            onPress={() => {
              if (logLibrary(food, choice, `libdetail:${step.opened}`))
                setStep({ kind: "list" });
            }}
          />,
        )}
      >
        <View style={{ gap: forge.spacing.cardGap }}>
          <View style={{ gap: 4 }}>
            {(food.description !== food.name || food.name.length > 48) && (
              <FText variant="label" tone="secondary">
                {`USDA: ${food.description}`}
              </FText>
            )}
            <FText variant="label" tone="secondary">
              {`Per 100 g: ${kcalText(food.kcal)} · P ${amount(food.protein)} g · C ${amount(food.carbs)} g · F ${amount(food.fat)} g`}
            </FText>
          </View>
          <Section title="Portion">
            <ForgeChips
              values={units}
              value={unit}
              onChange={(u) => {
                const i = units.indexOf(u);
                setChoice(
                  i <= 0
                    ? {
                        kind: "grams",
                        grams:
                          choice.kind === "grams"
                            ? choice.grams
                            : DEFAULT_GRAMS,
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
              <ForgeStepper
                key="grams"
                label="Grams"
                value={choice.grams}
                step={10}
                min={MIN_GRAMS}
                floor={10}
                max={MAX_GRAMS}
                unit="grams"
                onChange={(g) => setChoice({ kind: "grams", grams: g })}
              />
            ) : (
              <ForgeStepper
                key={`portion-${choice.index}`}
                label="Portions"
                value={choice.count}
                step={0.25}
                min={MIN_COUNT}
                floor={0.25}
                max={MAX_COUNT}
                unit={portionName ? `× ${portionName}` : "portions"}
                onChange={(n) => setChoice({ ...choice, count: n })}
              />
            )}
          </Section>
          <ValuesCard
            heading={error ? "Check the amount" : `For ${amount(grams)} g`}
            calories={v.calories}
            protein={v.protein}
            carbs={v.carbs}
            fat={v.fat}
            detail={error ?? `${amount(grams)} g`}
            error={!!error}
          />
          <Section title="Meal">
            {mealControl}
            {destination}
          </Section>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={step.note ?? `Save ${food.name} to my foods`}
            accessibilityState={{ disabled: !!error || !!step.note }}
            disabled={!!error || !!step.note}
            onPress={() => saveCopy(food, choice, `copy:${step.opened}`)}
            style={({ pressed }) => ({
              minHeight: forge.heights.compact,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: forge.spacing.group,
              paddingVertical: 8,
              borderRadius: forge.radii.tile,
              borderWidth: forge.border.card,
              borderColor: c.cardBorder,
              backgroundColor: pressed ? c.cardRaised : c.cardBg,
            })}
          >
            <Ionicons
              name={step.note ? "checkmark-circle" : "bookmark-outline"}
              size={20}
              color={c.emberHot}
            />
            <View style={{ flex: 1 }}>
              <FText variant="label" weight="700">
                {step.note ?? "Save to my foods"}
              </FText>
              {!step.note && (
                <FText variant="label" tone="secondary">
                  Keep this portion as your own food
                </FText>
              )}
            </View>
          </Pressable>
          <View style={{ gap: 2 }}>
            <FText variant="label" tone="secondary">
              {`Source: USDA FoodData Central, ${library.releases[food.id.split(":")[0]!] ?? "FoodData Central"}, FDC ${fdcId}. Public-domain data; values per 100 g as published.`}
            </FText>
            <View style={{ alignItems: "flex-start", marginLeft: -8 }}>
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
          </View>
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
          <CtaButton
            title={`Add to ${meal}`}
            accessibilityLabel={`Add new food to ${meal}`}
            icon="add"
            compact
            onPress={create}
          />,
        )}
      >
        <View style={{ gap: forge.spacing.cardGap }}>
          <FText variant="body" tone="secondary">
            {`Enter the values from the label. ${context}.`}
          </FText>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save to my foods"
            accessibilityState={{ checked: saveFood }}
            onPress={() => setSaveFood((s) => !s)}
            style={({ pressed }) => ({
              minHeight: forge.heights.compact,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: forge.spacing.group,
              paddingVertical: 8,
              borderRadius: forge.radii.tile,
              borderWidth: forge.border.card,
              borderColor: c.cardBorder,
              backgroundColor: pressed ? c.cardRaised : c.cardBg,
            })}
          >
            <View style={{ flex: 1 }}>
              <FText variant="label" weight="700">
                Save to my foods
              </FText>
              <FText variant="label" tone="secondary">
                Log it again later in one tap
              </FText>
            </View>
            <Switch
              accessibilityLabel="Save to my foods switch"
              value={saveFood}
              onValueChange={setSaveFood}
              trackColor={{
                true: c.emberHot,
                false: c.bg === dark.bg ? c.selected : c.text3,
              }}
              thumbColor={c.bg === dark.bg ? c.text : c.surface}
            />
          </Pressable>
        </View>
      </Sheet>
    );

  type Item =
    | { type: "header"; title: string; count?: number }
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
            count: searched ? libraryFoods.length : undefined,
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
    <OutlineButton
      title={query.trim() ? `Create “${query.trim()}”` : "Create food"}
      accessibilityLabel="Create food"
      icon="create-outline"
      onPress={startCreate}
    />
  );

  // The day, meal and search. They keep their size above the list (only the
  // list gives way to the keyboard); at larger text they scroll with it.
  // Phase 7.3F adds the barcode scanner beside the search field (see
  // docs/audits/PHASE_7_3D_FOOD_DISCOVERY.md); nothing is shown until then.
  const controls = (
    <View style={{ flexShrink: 0, gap: forge.spacing.group }}>
      {typing ? (
        short ? null : (
          <Destination text={`Adding to ${context}`} />
        )
      ) : (
        <>
          <FText variant="label" tone="secondary">
            {`Adding to ${dayTitle(day, today)}`}
          </FText>
          {mealControl}
        </>
      )}
      <ForgeSearchField
        label="Search foods"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setShown(PAGE);
        }}
        placeholder="Food, e.g. chicken breast"
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
          // Results are paged (30 library foods at a time) and rendered a
          // screen at a time, so a large catalogue never mounts at once.
          initialNumToRender={14}
          maxToRenderPerBatch={14}
          windowSize={7}
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
            <View style={{ paddingVertical: forge.spacing.cardGap, gap: 6 }}>
              <FText variant="cardTitle" weight="700">
                No matches
              </FText>
              <FText variant="body" tone="secondary">
                {`No foods match “${query.trim()}”. Check the spelling, try fewer words, or create it from its label below.`}
              </FText>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === "header")
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingTop: forge.spacing.cardGap,
                    paddingBottom: 4,
                  }}
                >
                  <FText
                    variant="overline"
                    tone="secondary"
                    header
                    style={{ flex: 1 }}
                  >
                    {item.title}
                  </FText>
                  {item.count !== undefined && (
                    <FText variant="label" tone="secondary">
                      {`${item.count.toLocaleString()} ${item.count === 1 ? "food" : "foods"}`}
                    </FText>
                  )}
                </View>
              );
            if (item.type === "note")
              return (
                <View style={{ paddingVertical: theme.spacing.sm, gap: 4 }}>
                  <FText variant="body" tone="secondary">
                    {item.text}
                  </FText>
                  {item.retry && (
                    <View style={{ alignItems: "flex-start", marginLeft: -8 }}>
                      <TextButton
                        title="Try again"
                        accessibilityLabel="Try loading the food library again"
                        onPress={() => setCatalog(tryLoadFoodLibrary())}
                      />
                    </View>
                  )}
                </View>
              );
            if (item.type === "more")
              return (
                <View style={{ alignItems: "center", paddingVertical: 4 }}>
                  <TextButton
                    title={`Show ${Math.min(PAGE, item.remaining)} more`}
                    accessibilityLabel={`Show more library foods, ${item.remaining} not shown`}
                    onPress={() => setShown((n) => n + PAGE)}
                  />
                </View>
              );
            if (item.type === "library") {
              const food = item.food;
              const result = libraryResult(food);
              return (
                <ResultRow
                  result={result}
                  added={!!added[result.key]}
                  onAdd={() =>
                    logLibrary(
                      food,
                      { kind: "grams", grams: DEFAULT_GRAMS },
                      `quick:${result.key}`,
                    )
                  }
                  onUndo={() => undo(result.key, food.name)}
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
            return (
              <ResultRow
                result={choiceResult(food)}
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

/** A titled group inside the sheet ("Servings", "Meal"). */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <FText variant="overline" tone="secondary">
        {title}
      </FText>
      {children}
    </View>
  );
}

/** "Logs to Lunch · Yesterday": where an add goes. */
function Destination({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name="return-down-forward" size={14} color={c.text2} />
      <FText variant="label" tone="secondary" style={{ flexShrink: 1 }}>
        {text}
      </FText>
    </View>
  );
}

/**
 * The energy and macronutrients of what is about to be logged, for the
 * amount chosen (the heading says which).
 */
function ValuesCard({
  heading,
  calories,
  protein,
  carbs,
  fat,
  detail,
  error = false,
}: {
  heading: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  detail?: string;
  error?: boolean;
}) {
  const c = useColors();
  const macros = [
    ["Protein", protein],
    ["Carbs", carbs],
    ["Fat", fat],
  ] as const;
  return (
    <View
      accessible
      accessibilityLabel={`${kcalText(calories)}, protein ${gramsText(protein)}, carbs ${gramsText(carbs)}, fat ${gramsText(fat)}${detail ? `, ${detail}` : ""}`}
      style={{
        padding: forge.spacing.cardPadding,
        gap: 12,
        borderRadius: forge.radii.card,
        borderWidth: forge.border.card,
        borderColor: error ? c.error : c.cardBorder,
        backgroundColor: c.cardBg,
      }}
    >
      <View style={{ gap: 2 }}>
        <FText variant="overline" tone={error ? "error" : "accent"}>
          {heading}
        </FText>
        <FText variant="cardMetric">{kcalText(calories)}</FText>
      </View>
      <View
        style={{
          flexDirection: "row",
          paddingTop: 10,
          borderTopWidth: forge.border.card,
          borderTopColor: c.cardDivider,
        }}
      >
        {macros.map(([label, value], i) => (
          <View
            key={label}
            style={{
              flex: 1,
              gap: 2,
              paddingLeft: i ? 12 : 0,
              borderLeftWidth: i ? forge.border.card : 0,
              borderLeftColor: c.cardDivider,
            }}
          >
            <FText variant="cardTitle" weight="700" numberOfLines={1} fit>
              {gramsText(value)}
            </FText>
            <FText variant="label" tone="secondary" numberOfLines={1}>
              {label}
            </FText>
          </View>
        ))}
      </View>
      {error && detail && (
        <FText variant="label" tone="error">
          {detail}
        </FText>
      )}
    </View>
  );
}

/**
 * One search result: tap to choose the amount and meal; + logs it as shown
 * (with Undo). Brand and source lines appear only when the result has them,
 * so branded and scanned products (7.3E, 7.3F) use the same row.
 */
const ResultRow = memo(function ResultRow({
  result: f,
  added,
  onAdd,
  onUndo,
  onOpen,
}: {
  result: FoodResult;
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
        minHeight: 64,
        borderBottomWidth: forge.border.card,
        borderColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={f.label}
        accessibilityHint={f.hint}
        onPress={onOpen}
        style={({ pressed }) => ({
          flex: 1,
          paddingVertical: 10,
          gap: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <FText variant="body" weight="600" numberOfLines={2}>
          {f.title}
        </FText>
        {f.brand && (
          <FText
            variant="label"
            weight="600"
            tone="secondary"
            numberOfLines={1}
          >
            {f.brand}
          </FText>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <FText
            variant="label"
            tone="secondary"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {f.detail}
          </FText>
          {f.provenance && (
            <View
              style={{
                paddingHorizontal: 6,
                borderRadius: forge.radii.pill,
                borderWidth: forge.border.card,
                borderColor: c.cardBorder,
              }}
            >
              <FText
                variant="label"
                tone="secondary"
                style={{ fontSize: 11, lineHeight: 16 }}
              >
                {f.provenance}
              </FText>
            </View>
          )}
        </View>
      </Pressable>
      {added ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="checkmark-circle" size={18} color={c.emberHot} />
          <FText
            variant="label"
            weight="700"
            tone="accent"
            style={{ marginLeft: 4 }}
          >
            Added
          </FText>
          <TextButton
            title="Undo"
            accessibilityLabel={f.undoLabel}
            onPress={onUndo}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={f.addLabel}
          onPress={onAdd}
          hitSlop={4}
          style={({ pressed }) => ({
            width: forge.heights.compact,
            height: forge.heights.compact,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="add-circle" size={30} color={c.emberHot} />
        </Pressable>
      )}
    </View>
  );
});
