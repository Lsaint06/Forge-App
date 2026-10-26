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
  DEFAULT_ML,
  MAX_COUNT,
  MAX_GRAMS,
  MAX_ML,
  MIN_COUNT,
  MIN_GRAMS,
  MIN_ML,
  amountText,
  basisOf,
  portionLabel,
  choiceError,
  entryFromLibrary,
  portionAmount,
  searchLibrary,
  totalAmount,
  valuesForAmount,
  type LibraryFood,
  type PortionChoice,
} from "../../domain/food-library";
import { tryLoadFoodLibrary } from "../../data/food-catalog";
import { BRANDED_CATALOG, BRANDED_RELEASE } from "../../data/branded-catalog";
import { isBrandedId, servingNote } from "../../domain/branded";
import { useBrandedSearch } from "./useBrandedSearch";
import { BarcodeScanner } from "./BarcodeScanner";
import { dayTitle } from "../../domain/calendar-dates";
import { forge, theme } from "../../theme";
import {
  brandedResult,
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
      /** Opened from the barcode scanner: Back returns to it. */
      from?: "scan";
    }
  | { kind: "scan" }
  | { kind: "create" };

/** Library results are shown this many at a time. */
const PAGE = 30;

/** A label serving, then the food's own unit: what a branded food opens with. */
const LABEL_SERVING: PortionChoice = { kind: "portion", index: 0, count: 1 };

/**
 * Adding food to a day: recent and saved foods first, then the built-in
 * USDA food library, then branded products from the bundled USDA Branded
 * Foods catalogue, all searched together. + logs a food at its usual
 * servings (a library food at 100 g, a branded product at its label serving)
 * into the chosen meal, and Undo takes it back; tapping a food first lets
 * the amount and meal be adjusted; Create food logs a new one from its
 * label. Everything happens inside this one sheet, so iOS never has to
 * stack another sheet on it. Mount it when needed.
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
  // The last product added from the scanner, for its Undo.
  const [scanAdded, setScanAdded] = useState<{
    key: string;
    name: string;
    meal: string;
  } | null>(null);
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
  // Branded products: searched on SQLite's thread once the query settles.
  const {
    results: branded,
    more: moreBranded,
    retry: retryBranded,
    pending: brandedPending,
  } = useBrandedSearch(searched);
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
  /** The catalogue version a library or branded food is logged from. */
  const catalogOf = (food: LibraryFood) =>
    isBrandedId(food.id) ? BRANDED_CATALOG : library?.version;
  function logLibrary(food: LibraryFood, choice: PortionChoice, guard: string) {
    const catalogVersion = catalogOf(food);
    if (!catalogVersion || choiceError(food, choice)) return false;
    return logData(
      `lib:${food.id}`,
      entryFromLibrary(food, choice, catalogVersion, meal),
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
    const catalogVersion = catalogOf(food);
    if (!catalogVersion || step.kind !== "library" || busy.current.has(guard))
      return;
    const data = foodFromEntry(entryFromLibrary(food, choice, catalogVersion));
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
        {step.kind === "library" && step.from === "scan" ? (
          <OutlineButton
            title="Back"
            icon="chevron-back"
            accessibilityLabel="Back to scanner"
            onPress={() => setStep({ kind: "scan" })}
          />
        ) : (
          <OutlineButton
            title="Back"
            icon="chevron-back"
            accessibilityLabel="Back to foods"
            onPress={() => setStep({ kind: "list" })}
          />
        )}
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

  if (step.kind === "library" && (library || isBrandedId(step.food.id))) {
    const { food, choice } = step;
    const brandedFood = isBrandedId(food.id);
    const unit = basisOf(food);
    const unitWord = unit === "ml" ? "Millilitres" : "Grams";
    const error = choiceError(food, choice);
    const total = totalAmount(food, choice);
    const v = valuesForAmount(food, Number.isFinite(total) ? total : 0);
    const portionChips = food.portions.map(
      (p) =>
        `${brandedFood ? capitalize(p.label) : p.label} · ${amountText(portionAmount(p), unit)}`,
    );
    // Branded products lead with their servings; grams or millilitres last.
    const units = brandedFood
      ? [...portionChips, unitWord]
      : [unitWord, ...portionChips];
    const chosen =
      choice.kind === "portion" ? portionChips[choice.index]! : unitWord;
    const serving = food.portions[0];
    const whole = brandedFood && choice.kind === "portion" && choice.index > 0;
    const note = brandedFood ? servingNote(food) : undefined;
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
              if (logLibrary(food, choice, `libdetail:${step.opened}`)) {
                // A scanned product is rarely among the results shown: its
                // Undo stays at the top of the list instead.
                if (step.from === "scan")
                  setScanAdded({
                    key: `lib:${food.id}`,
                    name: food.name,
                    meal,
                  });
                setStep({ kind: "list" });
              }
            }}
          />,
        )}
      >
        <View style={{ gap: forge.spacing.cardGap }}>
          <View style={{ gap: 4 }}>
            {food.brand && (
              <FText variant="label" weight="700" tone="secondary">
                {food.brand}
              </FText>
            )}
            {(food.description !== food.name || food.name.length > 48) && (
              <FText variant="label" tone="secondary">
                {`USDA: ${food.description}`}
              </FText>
            )}
            <FText variant="label" tone="secondary">
              {`Per 100 ${unit}: ${kcalText(food.kcal)} · P ${amount(food.protein)} g · C ${amount(food.carbs)} g · F ${amount(food.fat)} g`}
            </FText>
          </View>
          <Section title="Portion">
            <ForgeChips
              values={units}
              value={chosen}
              onChange={(u) => {
                const i = portionChips.indexOf(u);
                setChoice(
                  i >= 0
                    ? {
                        kind: "portion",
                        index: i,
                        count: choice.kind === "portion" ? choice.count : 1,
                      }
                    : unit === "ml"
                      ? {
                          kind: "ml",
                          ml: choice.kind === "ml" ? choice.ml : DEFAULT_ML,
                        }
                      : {
                          kind: "grams",
                          grams:
                            choice.kind === "grams"
                              ? choice.grams
                              : DEFAULT_GRAMS,
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
            ) : choice.kind === "ml" ? (
              <ForgeStepper
                key="ml"
                label="Millilitres"
                value={choice.ml}
                step={10}
                min={MIN_ML}
                floor={10}
                max={MAX_ML}
                unit="millilitres"
                onChange={(ml) => setChoice({ kind: "ml", ml })}
              />
            ) : (
              <>
                {brandedFood && (
                  <ForgeChips
                    values={QUICK.map((q) => q.text)}
                    value={
                      QUICK.find((q) => q.count === choice.count)?.text ?? ""
                    }
                    onChange={(t) => {
                      const q = QUICK.find((x) => x.text === t);
                      if (q) setChoice({ ...choice, count: q.count });
                    }}
                  />
                )}
                <ForgeStepper
                  key={`portion-${choice.index}`}
                  label={
                    brandedFood ? (whole ? "Packages" : "Servings") : "Portions"
                  }
                  value={choice.count}
                  step={0.25}
                  min={MIN_COUNT}
                  floor={0.25}
                  max={MAX_COUNT}
                  unit={portionName ? `× ${portionName}` : "portions"}
                  onChange={(n) => setChoice({ ...choice, count: n })}
                />
              </>
            )}
            {brandedFood && serving && (
              <View style={{ gap: 2 }}>
                <FText variant="label" tone="secondary">
                  {whole
                    ? `Whole package = ${amountText(portionAmount(food.portions[1]!), unit)}${food.servingInfo?.servingsPerPackage ? ` · about ${amount(food.servingInfo.servingsPerPackage)} servings` : ""}`
                    : `1 serving = ${portionLabel(serving)}`}
                </FText>
                {note && (
                  <FText variant="label" tone="secondary">
                    {note}
                  </FText>
                )}
              </View>
            )}
          </Section>
          <ValuesCard
            heading={
              error
                ? "Check the amount"
                : brandedFood && choice.kind === "portion" && portionName
                  ? `For ${choice.count === 1 ? "" : `${countText(choice.count)} × `}${portionName} · ${amountText(total, unit)}`
                  : `For ${amountText(total, unit)}`
            }
            calories={v.calories}
            protein={v.protein}
            carbs={v.carbs}
            fat={v.fat}
            detail={error ?? amountText(total, unit)}
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
              {brandedFood
                ? `Source: USDA FoodData Central, Branded Foods (${BRANDED_RELEASE}), FDC ${fdcId}${food.barcode ? `, barcode ${food.barcode}` : ""}. Manufacturer label data, values per 100 ${unit}; public domain. USDA does not endorse FORGE.`
                : `Source: USDA FoodData Central, ${library?.releases[food.id.split(":")[0]!] ?? "FoodData Central"}, FDC ${fdcId}. Public-domain data; values per 100 g as published.`}
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

  if (step.kind === "scan")
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Scan barcode"
        footer={
          <OutlineButton
            title="Back"
            icon="chevron-back"
            accessibilityLabel="Back to foods"
            onPress={() => setStep({ kind: "list" })}
          />
        }
      >
        <BarcodeScanner
          onFound={(food) =>
            setStep({
              kind: "library",
              food,
              choice: LABEL_SERVING,
              opened: ++opens.current,
              from: "scan",
            })
          }
          onSearch={() => setStep({ kind: "list" })}
          onCreate={startCreate}
        />
      </Sheet>
    );

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
    | { type: "header"; title: string; count?: number; countText?: string }
    | { type: "note"; text: string; retry?: boolean; retryBranded?: boolean }
    | { type: "food"; food: FoodChoice }
    | { type: "library"; food: LibraryFood }
    | { type: "branded"; food: LibraryFood }
    | { type: "more"; remaining: number }
    | { type: "more-branded" };
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
  // Branded products follow the lifter's own foods and the common foods.
  const brandedItems: Item[] =
    !searched || branded.query !== searched
      ? []
      : branded.status === "error"
        ? [
            {
              type: "note",
              text: branded.error ?? "",
              retryBranded: true,
            },
          ]
        : branded.foods.length
          ? [
              {
                type: "header",
                title: "Brands · USDA Branded",
                countText: `${branded.broad ? "1,000+" : branded.total.toLocaleString()} ${branded.total === 1 ? "product" : "products"}`,
              },
              ...branded.foods.map((food) => ({
                type: "branded" as const,
                food,
              })),
              ...(branded.more ? [{ type: "more-branded" as const }] : []),
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
    ...brandedItems,
  ];
  // "No matches" waits for the branded search, so it never flashes first.
  const nothingFound =
    !!query.trim() &&
    !recent.length &&
    !saved.length &&
    !libraryItems.length &&
    !brandedItems.length &&
    !brandedPending;
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
  // The barcode scanner (Phase 7.3F) sits beside the search field.
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
      <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
        <View style={{ flex: 1 }}>
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
        <ScanButton
          onPress={() => {
            Keyboard.dismiss();
            setStep({ kind: "scan" });
          }}
        />
      </View>
      {scanAdded && added[scanAdded.key] && (
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="checkmark-circle" size={18} color={c.emberHot} />
          <FText
            variant="label"
            weight="600"
            numberOfLines={2}
            style={{ flex: 1 }}
          >
            {`Added ${scanAdded.name} to ${scanAdded.meal}`}
          </FText>
          <TextButton
            title="Undo"
            accessibilityLabel={`Undo adding ${scanAdded.name}`}
            onPress={() => undo(scanAdded.key, scanAdded.name)}
          />
        </View>
      )}
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
          testID="food-results"
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
                : item.type === "library" || item.type === "branded"
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
            nothingFound ? (
              <View style={{ paddingVertical: forge.spacing.cardGap, gap: 6 }}>
                <FText variant="cardTitle" weight="700">
                  No matches
                </FText>
                <FText variant="body" tone="secondary">
                  {`No foods match “${query.trim()}”. Check the spelling, try fewer words, or create it from its label below.`}
                </FText>
              </View>
            ) : brandedPending && query.trim() ? (
              <View style={{ paddingVertical: forge.spacing.cardGap }}>
                <FText variant="label" tone="secondary">
                  Searching branded foods…
                </FText>
              </View>
            ) : undefined
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
                  {item.countText !== undefined && (
                    <FText variant="label" tone="secondary">
                      {item.countText}
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
                  {item.retryBranded && (
                    <View style={{ alignItems: "flex-start", marginLeft: -8 }}>
                      <TextButton
                        title="Try again"
                        accessibilityLabel="Try loading branded foods again"
                        onPress={retryBranded}
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
            if (item.type === "more-branded")
              return (
                <View style={{ alignItems: "center", paddingVertical: 4 }}>
                  <TextButton
                    title="Show more products"
                    accessibilityLabel="Show more branded products"
                    onPress={moreBranded}
                  />
                </View>
              );
            if (item.type === "branded") {
              const food = item.food;
              const result = brandedResult(food);
              return (
                <ResultRow
                  result={result}
                  added={!!added[result.key]}
                  onAdd={() =>
                    logLibrary(food, LABEL_SERVING, `quick:${result.key}`)
                  }
                  onUndo={() => undo(result.key, food.name)}
                  onOpen={() =>
                    setStep({
                      kind: "library",
                      food,
                      choice: LABEL_SERVING,
                      opened: ++opens.current,
                    })
                  }
                />
              );
            }
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

/** The barcode scanner's entry, beside the search field. */
function ScanButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scan barcode"
      accessibilityHint="Opens the camera to find a packaged food by its barcode"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 48,
        minHeight: 48,
        borderRadius: forge.radii.input,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: pressed ? c.cardBg : c.cardRaised,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Ionicons name="barcode-outline" size={24} color={c.emberHot} />
    </Pressable>
  );
}

/** Quick serving amounts for branded foods. */
const QUICK = [
  { text: "½", count: 0.5 },
  { text: "1", count: 1 },
  { text: "1½", count: 1.5 },
  { text: "2", count: 2 },
];
const FRACTIONS: Record<number, string> = {
  0.25: "¼",
  0.5: "½",
  0.75: "¾",
  1.5: "1½",
  2.5: "2½",
};
/** "½", "1½", "3": a serving count as people say it. */
const countText = (n: number) => FRACTIONS[n] ?? amount(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
