import { localDate, type Workout, type WorkoutSet } from "./types";
import { volume, estimatedMax, elapsedSeconds } from "./metrics";
export function analyze(
  workouts: Workout[],
  getRows: (
    id: string,
  ) => { exerciseId: string; muscle: string; sets: WorkoutSet[] }[],
) {
  const done = workouts.filter((w) => w.status === "completed");
  const muscles: Record<string, { volume: number; sets: number }> = {};
  const exercises: Record<
    string,
    {
      volume: number;
      sets: number;
      frequency: number;
      estimatedMax: number;
      load: number;
      reps: number;
    }
  > = {};
  const days: Record<
    string,
    { volume: number; sets: number; workouts: number; minutes: number }
  > = {};
  let totalVolume = 0,
    totalSets = 0,
    totalMinutes = 0;
  for (const w of done) {
    const date = localDate(w.finishedAt ?? w.startedAt);
    const day = days[date] ?? { volume: 0, sets: 0, workouts: 0, minutes: 0 };
    const minutes =
      elapsedSeconds(w.startedAt, w.finishedAt ?? w.startedAt, w.pausedMs) / 60;
    day.workouts++;
    day.minutes += minutes;
    totalMinutes += minutes;
    const seen = new Set<string>();
    for (const row of getRows(w.id)) {
      const sets = row.sets.filter((s) => s.completed && s.kind !== "warmup");
      const v = volume(sets);
      const m = muscles[row.muscle] ?? { volume: 0, sets: 0 };
      m.volume += v;
      m.sets += sets.length;
      muscles[row.muscle] = m;
      const e = exercises[row.exerciseId] ?? {
        volume: 0,
        sets: 0,
        frequency: 0,
        estimatedMax: 0,
        load: 0,
        reps: 0,
      };
      e.volume += v;
      e.sets += sets.length;
      if (sets.length && !seen.has(row.exerciseId)) e.frequency++;
      seen.add(row.exerciseId);
      for (const s of sets) {
        e.estimatedMax = Math.max(
          e.estimatedMax,
          estimatedMax(s.weight, s.reps),
        );
        e.load = Math.max(e.load, s.weight);
        e.reps = Math.max(e.reps, s.reps);
      }
      exercises[row.exerciseId] = e;
      day.volume += v;
      day.sets += sets.length;
      totalVolume += v;
      totalSets += sets.length;
    }
    days[date] = day;
  }
  return {
    totalVolume,
    totalSets,
    totalMinutes,
    averageMinutes: done.length ? totalMinutes / done.length : 0,
    frequency: done.length,
    muscles,
    exercises,
    days,
  };
}
export function measurementTrend(
  entries: { date: string; data: Record<string, string | number | boolean> }[],
  name: string,
) {
  return entries
    .filter(
      (e) => e.data.name === name && Number.isFinite(Number(e.data.value)),
    )
    .map((e) => ({ label: e.date, value: Number(e.data.value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
export function goalProgress(current: number, target: number, start?: number) {
  const ratio =
    start == null ? current / target : (current - start) / (target - start);
  return {
    current,
    target,
    ratio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0,
  };
}
export function programAdherence(
  schedule: { date: string; templateId: string }[],
  workouts: Workout[],
  now = Date.now(),
) {
  const due = schedule.filter((s) => s.date <= localDate(now));
  const available = workouts
    .filter((w) => w.status === "completed" && (w.finishedAt ?? 0) <= now)
    .map((w) => ({
      date: localDate(w.finishedAt ?? w.startedAt),
      templateId: w.templateId,
      used: false,
    }));
  let completed = 0;
  for (const s of due) {
    const hit = available.find(
      (w) => !w.used && w.date === s.date && w.templateId === s.templateId,
    );
    if (hit) {
      hit.used = true;
      completed++;
    }
  }
  return {
    completed,
    due: due.length,
    ratio: due.length ? completed / due.length : 0,
  };
}
