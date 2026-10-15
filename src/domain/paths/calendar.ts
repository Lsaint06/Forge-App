import { addDays, daysBetween } from "./model";

export function mondayOf(date: string) {
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  return addDays(date, -weekday);
}
export function calendarWeek(started: string, date: string) {
  return Math.floor(daysBetween(mondayOf(started), mondayOf(date)) / 7) + 1;
}
export function weekDates(started: string, week: number) {
  const monday = addDays(mondayOf(started), (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export const weekIntentions = [
  "Foundation · Learn your movements and find repeatable starting loads. Finish with about three good repetitions left; warm up before working sets.",
  "Foundation · Repeat clean technique. Add a repetition where you can without shortening your range or rushing your rest.",
  "Foundation · Build consistency. When every working set reaches its target with control and around two repetitions left, consider the smallest available load increase.",
  "Foundation · Review your log and recovery. Repeat successful loads; reduce effort if fatigue is accumulating. A personal record is not required.",
  "Evolution · Keep the same exercises and compare with your Foundation records. Use small load or repetition improvements when earned; nothing rotates automatically.",
  "Evolution · Aim for quality working sets. For muscle-building work, about one to three repetitions left is a practical guide; stop earlier if technique deteriorates.",
  "Evolution · Consolidate progress. Keep strength lifts controlled, with about two repetitions left, and take the full rest. Avoid grinding or chasing failure.",
  "Evolution · Finish and review. Compare your own loads, repetitions and consistency. Recover missed sessions at a suitable time; unfinished sessions never become completed automatically.",
];
export function weekIntention(week: number) {
  return (
    weekIntentions[week - 1] ??
    "Recovery & rescheduled sessions · Your original training week and workout links are preserved. Resume at a manageable pace without cramming missed work together."
  );
}
