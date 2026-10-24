import React, { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, View } from "react-native";
import { router } from "expo-router";
import { Alert } from "../platform/alert";
import { Screen, Button, TextButton, Txt, Card } from "../components/ui";
import {
  ListRow,
  ListSection,
  OverflowMenu,
  type MenuAction,
} from "../components/system";
import { DaySwitcher } from "../components/DaySwitcher";
import { MacroSummary } from "../components/nutrition/MacroSummary";
import { QuickAddSheet } from "../components/nutrition/QuickAddSheet";
import {
  FoodEditorSheet,
  type FoodEditorTarget,
} from "../components/nutrition/FoodEditorSheet";
import { useRepo, mutate, confirm } from "../state";
import { goBack } from "../navigation";
import { tryLoadFoodLibrary } from "../data/food-catalog";
import { localDate, type Journal } from "../domain/types";
import { dayLabel } from "../domain/training-display";
import {
  TARGETS_SAVED,
  defaultMeal,
  entriesOn,
  entryCalories,
  foodFromEntry,
  gramsText,
  groupByMeal,
  isDuplicateFood,
  kcalText,
  macrosOf,
  portionText,
  targetsPersonalized,
  totalsOf,
  type MealGroup,
} from "../domain/nutrition";
import { theme } from "../theme";

// Nutrition: one day at a time. The day's intake (against the lifter's own
// targets, once set), then each meal with its foods. Adding is one sheet:
// recent and saved foods log in one tap, with Undo.

export default function Nutrition() {
  const r = useRepo();
  // Coming back to FORGE on a new day moves "Today" along with it.
  const [, setWake] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setWake((n) => n + 1);
    });
    return () => sub.remove();
  }, []);
  const today = localDate();
  // An unset day follows today; a chosen past day stays put.
  const [picked, setPicked] = useState<string>();
  const day = picked && picked < today ? picked : today;
  const [adding, setAdding] = useState<string>();
  const [editing, setEditing] = useState<FoodEditorTarget>();
  const [banner, setBanner] = useState<{ text: string; undo: () => void }>();
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
  // Entries typed with a future date (possible before) stay reachable.
  const later =
    day === today
      ? all
          .filter((e) => e.date > today)
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
  const savedCount = r.journal("food").length;
  const when = day === today ? "today" : `on ${dayLabel(day)}`;

  function show(text: string, undo: () => void) {
    setBanner({ text, undo });
    AccessibilityInfo.announceForAccessibility(`${text}. Undo available.`);
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
  function row(e: Journal, subtitle = portionText(e.data)) {
    const name = String(e.data.name);
    const m = macrosOf(e.data);
    const kcal = kcalText(entryCalories(e.data));
    return (
      <ListRow
        key={e.id}
        title={name}
        subtitle={subtitle}
        value={kcal}
        chevron={false}
        accessibilityLabel={`${name}, ${subtitle}, ${kcal}, protein ${gramsText(m.protein * m.quantity)}, carbs ${gramsText(m.carbs * m.quantity)}, fat ${gramsText(m.fat * m.quantity)}`}
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

  return (
    <Screen
      title="Nutrition"
      onBack={() => goBack("/(tabs)/profile")}
      footer={
        <Button
          title="Add food"
          icon="add"
          onPress={() => setAdding(defaultMeal())}
        />
      }
    >
      <DaySwitcher
        date={day}
        today={today}
        onChange={(d) => setPicked(d < today ? d : undefined)}
      />
      {banner && (
        <Card compact raised>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
            }}
          >
            <Txt style={{ flex: 1 }}>{banner.text}</Txt>
            <TextButton
              title="Undo"
              onPress={() => {
                banner.undo();
                setBanner(undefined);
              }}
            />
          </View>
        </Card>
      )}
      <MacroSummary
        totals={totals}
        targets={p}
        personalized={personalized}
        onSetTargets={() =>
          router.navigate({
            pathname: "/(tabs)/profile",
            params: { edit: "nutrition" },
          })
        }
      />
      {!entries.length && (
        <Txt tone="secondary">
          {`Nothing logged ${when}. Add foods to a meal with the values from their label; foods you log are ready to add again in one tap.`}
        </Txt>
      )}
      {groups.map((g) => (
        <MealSection
          key={g.key}
          group={g}
          onAdd={g.meal ? () => setAdding(g.meal) : undefined}
        >
          {g.entries.map((e) => row(e))}
        </MealSection>
      ))}
      {later.length > 0 && (
        <ListSection
          title="Dated after today"
          footer="Logged with a future date. Edit an entry to move it to the right day."
        >
          {later.map((e) =>
            row(e, `${dayLabel(e.date)} · ${portionText(e.data)}`),
          )}
        </ListSection>
      )}
      <ListSection>
        <ListRow
          icon="bookmark-outline"
          title="Saved foods"
          value={savedCount ? String(savedCount) : undefined}
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "food" } })
          }
        />
      </ListSection>
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
    </Screen>
  );
}

function MealSection({
  group,
  onAdd,
  children,
}: {
  group: MealGroup;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const count = group.entries.length;
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          paddingLeft: theme.spacing.xs,
          minHeight: 44,
        }}
      >
        <Txt variant="overline" tone="secondary" header style={{ flex: 1 }}>
          {group.label}
        </Txt>
        {count > 0 && (
          <Txt variant="caption" tone="secondary" tabular>
            {kcalText(group.totals.calories)}
          </Txt>
        )}
        {onAdd && (
          <TextButton
            title="Add"
            icon="add"
            accessibilityLabel={`Add to ${group.label}`}
            onPress={onAdd}
          />
        )}
      </View>
      {count > 0 && <ListSection>{children}</ListSection>}
    </View>
  );
}
