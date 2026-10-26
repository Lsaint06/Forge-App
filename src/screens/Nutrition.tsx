import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Alert } from "../platform/alert";
import {
  BadgePill,
  CardHeader,
  CtaButton,
  FText,
  ForgeCard,
  ForgeListRow,
  ForgeScreen,
  ForgeSubScreen,
  SectionLabel,
  pairFits,
  stripColumns,
} from "../components/reforge";
import { OverflowMenu, type MenuAction } from "../components/system";
import { planStatus } from "../components/PlanRow";
import { DaySwitcher } from "../components/DaySwitcher";
import { QuickAddSheet } from "../components/nutrition/QuickAddSheet";
import { HydrationSheet } from "../components/nutrition/HydrationSheet";
import {
  fluidUnitOf,
  hydrationDay,
  hydrationOf,
  totalMl,
} from "../domain/hydration";
import {
  FoodEditorSheet,
  type FoodEditorTarget,
} from "../components/nutrition/FoodEditorSheet";
import { useRepo, mutate, confirm } from "../state";
import { goBack } from "../navigation";
import { tryLoadFoodLibrary } from "../data/food-catalog";
import { localDate, type Journal } from "../domain/types";
import { dayLabel, longDayLabel } from "../domain/training-display";
import { dayTitle } from "../domain/calendar-dates";
import { summary } from "../domain/metrics";
import {
  TARGETS_SAVED,
  defaultMeal,
  entriesOn,
  entryCalories,
  entryFromFood,
  foodFromEntry,
  gramsText,
  groupByMeal,
  isDuplicateFood,
  kcalText,
  macrosOf,
  portionText,
  targetsPersonalized,
  totalsOf,
} from "../domain/nutrition";
import { forge } from "../theme";
import { TitleBlock } from "./home/sections";
import { homeClock, planContext } from "./home/model";
import {
  dayHeading,
  intake,
  loggingStreak,
  quickAddFoods,
  type QuickFood,
} from "./nutrition/model";
import {
  CalorieGoalCard,
  CardPair,
  EntryRow,
  HydrationCard,
  MealRow,
  NutritionHero,
  QuickAddCard,
  StreakCard,
  UndoToast,
} from "./nutrition/sections";

// Nutrition (Phase 7.3B, REFORGE): the approved Nutrition reference built from
// the lifter's own data. One day at a time: the day's intake against their own
// targets, the calorie goal, days logged, each meal (expanding in place to its
// foods and their actions), and one-tap quick add with Undo. Add food opens
// the existing sheet. Every value comes from domain/nutrition.ts unchanged.
//
// The Nutrition tab (`tab`) carries the brand header; `/journal?kind=nutrition`
// opens the same screen as a pushed page with Back, so older links keep
// working.

export default function Nutrition({ tab = false }: { tab?: boolean }) {
  const r = useRepo();
  const { width, fontScale } = useWindowDimensions();
  // Coming back to FORGE on a new day moves "Today" along with it.
  const [, setWake] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setWake((n) => n + 1);
    });
    return () => sub.remove();
  }, []);
  const { now, today } = homeClock();
  // An unset day follows today; a chosen past day stays put.
  const [picked, setPicked] = useState<string>();
  const day = picked && picked < today ? picked : today;
  const [adding, setAdding] = useState<string>();
  const [hydrating, setHydrating] = useState(false);
  const [editing, setEditing] = useState<FoodEditorTarget>();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [banner, setBanner] = useState<{ text: string; undo: () => void }>();
  // Guards a quick-add tile against a double tap logging twice.
  const busy = useRef(new Set<string>());
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(undefined), 6000);
    return () => clearTimeout(t);
  }, [banner]);
  // Warms the food library once the day has rendered, so Add food opens
  // without parsing it. Failures surface in Add food, with Try again.
  useEffect(() => {
    const t = setTimeout(() => tryLoadFoodLibrary(), 300);
    return () => clearTimeout(t);
  }, []);

  const p = r.profile();
  const personalized = targetsPersonalized(p, r.setting(TARGETS_SAVED) === "1");
  const all = r.journal("nutrition");
  const entries = entriesOn(all, day);
  const groups = groupByMeal(entries);
  const totals = totalsOf(entries);
  const k = intake(totals, p.calories, personalized);
  // Entries typed with a future date (possible before) stay reachable.
  const later =
    day === today
      ? all
          .filter((e) => e.date > today)
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
  const savedFoods = r.journal("food");
  const when = day === today ? "today" : `on ${dayLabel(day)}`;
  const streak = loggingStreak(all, today);
  // Water (Phase 7.3C): its own records, never part of the food totals.
  const water = hydrationDay(
    totalMl(
      r
        .journal("hydration")
        .filter((e) => e.date === day && hydrationOf(e.data)),
    ),
    p.waterGoal,
    fluidUnitOf(p),
  );
  const quickMeal = defaultMeal(now);
  const quickTarget =
    day === today ? quickMeal : `${quickMeal} · ${dayTitle(day, today)}`;

  const content = width - 2 * forge.spacing.margin;
  const side = pairFits(content, fontScale, 150);
  const quick = quickAddFoods(all, savedFoods);
  // Quick add: two roomy columns at full width; one when text is large or
  // the screen is narrow.
  const columns = stripColumns(
    content - 2 * forge.spacing.cardPadding,
    fontScale,
    2,
    150,
  );

  function show(text: string, undo: () => void) {
    setBanner({ text, undo });
    AccessibilityInfo.announceForAccessibility(`${text}. Undo available.`);
  }
  function editTargets() {
    router.navigate({
      pathname: "/(tabs)/profile",
      params: { edit: "nutrition" },
    });
  }
  function quickAdd(q: QuickFood) {
    const key = q.food.key;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    // Released after this frame, so a deliberate second tap adds again.
    setTimeout(() => busy.current.delete(key), 400);
    const entry = mutate(() =>
      r.addJournal(
        "nutrition",
        entryFromFood(q.food, quickMeal, q.food.quantity),
        day,
      ),
    );
    if (entry)
      show(`Added ${q.food.name} to ${quickMeal}`, () =>
        mutate(() => r.deleteJournal(entry.id)),
      );
  }
  function copyToToday(e: Journal) {
    const copy = mutate(() =>
      r.addJournal("nutrition", { ...e.data }, localDate()),
    );
    if (copy)
      show(`Copied ${String(e.data.name)} to today`, () =>
        mutate(() => r.deleteJournal(copy.id)),
      );
  }
  function saveAsFood(e: Journal) {
    const food = foodFromEntry(e.data);
    if (isDuplicateFood(r.journal("food"), food)) {
      Alert.alert(
        "Already saved",
        `${String(food.name)} with these values is already in your saved foods.`,
      );
      return;
    }
    const saved = mutate(() => r.addJournal("food", food));
    if (saved)
      show(`Saved ${String(food.name)} to your foods`, () =>
        mutate(() => r.deleteJournal(saved.id)),
      );
  }
  function remove(e: Journal) {
    confirm(
      "Delete entry?",
      `${String(e.data.name)} will be removed from ${e.date === today ? "today" : dayLabel(e.date)}.`,
      () => r.deleteJournal(e.id),
      { action: "Delete entry" },
    );
  }
  function actions(e: Journal): MenuAction[] {
    return [
      {
        label: "Edit",
        icon: "create-outline",
        onPress: () => setEditing({ kind: "entry", entry: e }),
      },
      ...(e.date !== today
        ? [
            {
              label: "Copy to today",
              icon: "copy-outline" as const,
              onPress: () => copyToToday(e),
            },
          ]
        : []),
      {
        label: "Save as food",
        icon: "bookmark-outline",
        onPress: () => saveAsFood(e),
      },
      {
        label: "Delete",
        icon: "trash-outline",
        destructive: true,
        onPress: () => remove(e),
      },
    ];
  }
  function row(
    e: Journal,
    index: number,
    subtitle = portionText(e.data),
    flush = false,
  ) {
    const name = String(e.data.name);
    const m = macrosOf(e.data);
    const kcal = kcalText(entryCalories(e.data));
    return (
      <EntryRow
        key={e.id}
        title={name}
        subtitle={subtitle}
        value={kcal}
        divider={index > 0}
        indent={flush ? forge.spacing.cardPadding : undefined}
        label={`${name}, ${subtitle}, ${kcal}, protein ${gramsText(m.protein * m.quantity)}, carbs ${gramsText(m.carbs * m.quantity)}, fat ${gramsText(m.fat * m.quantity)}`}
        onPress={() => setEditing({ kind: "entry", entry: e })}
        trailing={
          <OverflowMenu
            label={`Options for ${name}`}
            title={name}
            actions={actions(e)}
          />
        }
      />
    );
  }
  function toggle(key: string) {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const footer = (
    <>
      {banner && (
        <UndoToast
          text={banner.text}
          onUndo={() => {
            banner.undo();
            setBanner(undefined);
          }}
        />
      )}
      <CtaButton
        title="Add food"
        icon="add"
        onPress={() => setAdding(defaultMeal())}
      />
    </>
  );
  const body = (
    <>
      <DaySwitcher
        date={day}
        today={today}
        onChange={(d) => setPicked(d < today ? d : undefined)}
      />
      <NutritionHero
        overline={dayHeading(day, today, "nutrition")}
        intake={k}
        totals={totals}
        targets={p}
        personalized={personalized}
        stacked={fontScale >= 1.6}
      />
      {/* Hydration right after the day's food, before the goal cards and
          meals: its own compact card, sized to its content. */}
      <HydrationCard view={water} onOpen={() => setHydrating(true)} />
      <CardPair
        side={side}
        ratio={1.2}
        left={(style) => (
          <CalorieGoalCard intake={k} onEdit={editTargets} style={style} />
        )}
        right={(style) => <StreakCard streak={streak} style={style} />}
      />
      <ForgeCard gap={forge.spacing.tight}>
        <CardHeader
          title={dayHeading(day, today, "meals")}
          trailing={entries.length ? kcalText(totals.calories) : undefined}
          divider={false}
        />
        {!entries.length && (
          <FText variant="body" tone="secondary" style={{ marginBottom: 4 }}>
            {`Nothing logged ${when}. Add foods to a meal with the values from their label; foods you log are ready to add again in one tap.`}
          </FText>
        )}
        {groups.map((g) => (
          <MealRow
            key={g.key}
            group={g}
            expanded={open.has(g.key)}
            onToggle={() => toggle(g.key)}
            onAdd={g.meal ? () => setAdding(g.meal) : undefined}
          >
            {g.entries.map((e, j) => row(e, j))}
          </MealRow>
        ))}
      </ForgeCard>
      <QuickAddCard
        foods={quick}
        target={quickTarget}
        destination={`Adds to ${quickMeal} · ${dayTitle(day, today)}`}
        columns={columns}
        onAdd={quickAdd}
        onOpen={() => setAdding(quickMeal)}
      />
      {later.length > 0 && (
        <>
          <SectionLabel title="Dated after today" />
          <ForgeCard padding={0} gap={0}>
            {later.map((e, i) =>
              row(e, i, `${dayLabel(e.date)} · ${portionText(e.data)}`, true),
            )}
          </ForgeCard>
          <FText variant="label" tone="secondary">
            Logged with a future date. Edit an entry to move it to the right
            day.
          </FText>
        </>
      )}
      <ForgeCard padding={0} gap={0}>
        <ForgeListRow
          icon="bookmark-outline"
          title="Saved foods"
          value={savedFoods.length ? String(savedFoods.length) : undefined}
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "food" } })
          }
        />
      </ForgeCard>
      {adding && (
        <QuickAddSheet
          day={day}
          today={today}
          initialMeal={adding}
          onClose={() => setAdding(undefined)}
        />
      )}
      {editing && (
        <FoodEditorSheet
          target={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {hydrating && (
        <HydrationSheet
          day={day}
          today={today}
          onClose={() => setHydrating(false)}
        />
      )}
    </>
  );

  if (!tab)
    return (
      <ForgeSubScreen
        title="Nutrition"
        onBack={() => goBack("/(tabs)/nutrition")}
        footer={footer}
      >
        {body}
      </ForgeSubScreen>
    );
  const workouts = r.workouts();
  const training = summary(workouts, (id) => r.workoutSets(id), now).streak;
  const plan = planStatus(r);
  const context = plan ? planContext(r, today) : undefined;
  return (
    <ForgeScreen
      brand={
        <BadgePill
          icon="flame"
          value={String(training)}
          accessibilityLabel={`${training} day streak. Open progress`}
          onPress={() => router.navigate("/(tabs)/progress")}
        />
      }
      footer={footer}
    >
      <TitleBlock
        greeting="Nutrition"
        subtitle="Fuel your progress. Consistency compounds."
        date={dayLabel(today)}
        spokenDate={longDayLabel(now)}
        plan={
          plan
            ? {
                text: context
                  ? `Week ${context.week} · ${context.phase}`
                  : plan.title,
                label: `${plan.kind === "program" ? "Your program" : "Your Path"}: ${plan.title}`,
                open: plan.open,
              }
            : undefined
        }
      />
      {body}
    </ForgeScreen>
  );
}
