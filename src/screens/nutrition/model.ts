import { addDays } from "../../domain/paths/model";
import { mondayOf } from "../../domain/progress/range";
import { dayTitle } from "../../domain/calendar-dates";
import {
  amount,
  foodChoices,
  gramsText,
  kcalText,
  type FoodChoice,
  type MealGroup,
  type Totals,
} from "../../domain/nutrition";
import type { Journal } from "../../domain/types";
import type { IconName } from "../../components/ui";

// Nutrition dashboard (Phase 7.3B): read-only presentation of the existing
// nutrition data. Every number comes from the protected calculations in
// domain/nutrition.ts; rounding happens here for display only, and nothing
// is stored, estimated or invented.

const whole = (n: number) => Math.round(n).toLocaleString();

/** The day's energy against the lifter's own target (never a default). */
export function intake(totals: Totals, target: number, personalized: boolean) {
  const kcal = Math.round(totals.calories);
  const goal = Math.round(target);
  const showGoal = personalized && target > 0;
  // From the shown total, so "eaten + left" always adds up to the target.
  const remaining = goal - kcal;
  return {
    kcal,
    goal,
    showGoal,
    remaining,
    /** Of the target, from the shown numbers; may exceed 100. */
    percent: showGoal ? Math.round((kcal / goal) * 100) : undefined,
    /** "460 kcal left" or "120 kcal over". */
    left:
      remaining >= 0
        ? { value: whole(remaining), unit: "kcal left" }
        : { value: whole(-remaining), unit: "kcal over" },
    spoken: showGoal
      ? `${whole(kcal)} of ${whole(goal)} calories, ${remaining >= 0 ? `${whole(remaining)} left` : `${whole(-remaining)} over`}`
      : `${whole(kcal)} calories eaten`,
  };
}
export type Intake = ReturnType<typeof intake>;

/** "Today's nutrition", "Yesterday's meals", "Meals · Mon, Oct 20". */
export function dayHeading(day: string, today: string, what: string) {
  const title = dayTitle(day, today);
  return title === "Today" || title === "Yesterday"
    ? `${title}'s ${what}`
    : `${what.charAt(0).toUpperCase()}${what.slice(1)} · ${title}`;
}

/** "35P 45C 12F", and the same spoken in full. */
export function macroLine(t: Pick<Totals, "protein" | "carbs" | "fat">) {
  const r = (n: number) => Math.round(n);
  return {
    text: `${r(t.protein)}P ${r(t.carbs)}C ${r(t.fat)}F`,
    spoken: `protein ${gramsText(t.protein)}, carbs ${gramsText(t.carbs)}, fat ${gramsText(t.fat)}`,
  };
}

const MEAL_ICONS: Record<string, IconName> = {
  Breakfast: "sunny-outline",
  Lunch: "partly-sunny-outline",
  Dinner: "moon-outline",
  Snacks: "cafe-outline",
};

/** One meal row: icon, foods, energy and macros, and what is spoken. */
export function mealSummary(group: MealGroup) {
  const names = group.entries.map((e) => String(e.data.name ?? "").trim());
  const count = names.length;
  const macros = macroLine(group.totals);
  const kcal = kcalText(group.totals.calories);
  return {
    icon: (group.meal && MEAL_ICONS[group.meal]) || "restaurant-outline",
    count,
    foods: count ? names.join(", ") : "Nothing logged",
    kcal,
    macros: macros.text,
    spoken: count
      ? `${group.label}, ${kcal}, ${macros.spoken}, ${count} ${count === 1 ? "food" : "foods"}: ${names.join(", ")}`
      : `${group.label}, nothing logged`,
  };
}

/**
 * Days with food logged, from the entries themselves: the run of consecutive
 * days up to today (still alive until today ends) and this week's days.
 * Nothing is scored against targets; a day counts when anything is logged.
 */
export function loggingStreak(entries: Pick<Journal, "date">[], today: string) {
  const logged = new Set(
    entries.filter((e) => e.date <= today).map((e) => e.date),
  );
  let days = 0;
  for (
    let d = logged.has(today) ? today : addDays(today, -1);
    logged.has(d);
    d = addDays(d, -1)
  )
    days++;
  const monday = mondayOf(today);
  const week = ["M", "T", "W", "T", "F", "S", "S"].map((letter, i) => {
    const date = addDays(monday, i);
    const state: "logged" | "open" | "none" | "future" =
      date > today
        ? "future"
        : logged.has(date)
          ? "logged"
          : date === today
            ? "open"
            : "none";
    return { date, letter, state, today: date === today };
  });
  const elapsed = week.filter((d) => d.date <= today).length;
  const thisWeek = week.filter((d) => d.state === "logged").length;
  return {
    days,
    week,
    spoken: `${days} ${days === 1 ? "day" : "days"} logged in a row. This week, ${thisWeek} of ${elapsed} ${elapsed === 1 ? "day" : "days"} logged.`,
  };
}
export type LoggingStreak = ReturnType<typeof loggingStreak>;

/** What one quick-add tap logs: "1 medium", "2 × 40 g", "1 serving". */
export function quickPortion(f: Pick<FoodChoice, "quantity" | "serving">) {
  if (!f.serving)
    return `${amount(f.quantity)} ${f.quantity === 1 ? "serving" : "servings"}`;
  return f.quantity === 1 ? f.serving : `${amount(f.quantity)} × ${f.serving}`;
}

/**
 * Up to `limit` of the lifter's own foods for one-tap logging: recent foods
 * at the servings last eaten, then saved foods (the Add food sheet's order).
 */
export function quickAddFoods(entries: Journal[], foods: Journal[], limit = 4) {
  const { recent, saved } = foodChoices(entries, foods);
  return [...recent, ...saved].slice(0, limit).map((food) => ({
    food,
    portion: quickPortion(food),
    kcal: kcalText(food.calories * food.quantity),
  }));
}
export type QuickFood = ReturnType<typeof quickAddFoods>[number];
