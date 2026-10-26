import type { Series } from "../measurements";

// Bodyweight over a Progress range (Phase 7.4D, decision P1): the lifter's
// own weigh-ins, the change across the range and its share of the starting
// weight. Presentation only: measurements and their storage are unchanged.
// Values are kilograms, as stored; screens convert them for display.

export type WeighIn = { date: string; kg: number; count: number };

export type BodyweightOver = {
  /** The newest weigh-in, whether or not it falls in the range. */
  latest?: WeighIn;
  /** Weigh-ins inside the range, one per day, oldest first. */
  points: WeighIn[];
  /**
   * Where the range began: the newest weigh-in before it, otherwise the
   * first one inside it (all time: the first weigh-in).
   */
  start?: WeighIn;
  /** Newest weigh-in in the range against `start`; never across one day. */
  change?: { kg: number; percent: number };
};

/**
 * `from` is the range's first day (a local date); without it, all time.
 * Missing days are simply absent: nothing is interpolated or zeroed.
 */
export function bodyweightOver(
  series: Pick<Series, "days"> | undefined,
  from?: string,
): BodyweightOver {
  const days: WeighIn[] = (series?.days ?? []).map((d) => ({
    date: d.date,
    kg: d.value,
    count: d.count,
  }));
  const latest = days[days.length - 1];
  const points = from ? days.filter((d) => d.date >= from) : days;
  const before = from ? days.filter((d) => d.date < from) : [];
  const start = points.length
    ? (before[before.length - 1] ?? points[0])
    : undefined;
  const end = points[points.length - 1];
  const change =
    start && end && start.date !== end.date && start.kg > 0
      ? {
          kg: end.kg - start.kg,
          percent: ((end.kg - start.kg) / start.kg) * 100,
        }
      : undefined;
  return { latest, points, start, change };
}

/** "−1.4%", "+0.3%", "0%": one decimal, a true minus sign. */
export function percentText(percent: number) {
  const r = Math.round(percent * 10) / 10;
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}%`;
}
