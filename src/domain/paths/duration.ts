import type { Exercise, Prescription } from "../types";
import { exerciseStimulus } from "./stimulus";

// A defensible, catalogue-aware session-duration model. Every component has a
// purpose; nothing is invented to pad time. Rest is counted only *between*
// working sets, never after the final set. Warm-up and ramp-up are modelled
// once per session / per movement pattern so overlapping preparation is not
// double-counted. The estimate is returned as a range because real sessions
// vary with the lifter, transitions and rest adherence.

export type DurationEstimate = {
  low: number; // minutes, brisk execution
  expected: number; // minutes, typical
  high: number; // minutes, unhurried
};

// Seconds. Kept as named constants so the model stays auditable and testable.
const GENERAL_WARMUP = 300; // light general preparation before loaded work
const CORE_ONLY_WARMUP = 120; // a trunk-only session needs little general prep
const ISOLATION_SEC_PER_REP = 3;
const COMPOUND_SEC_PER_REP = 4;
const MIN_SET_EXECUTION = 15;
const RAMP_SET_EXECUTION = 25;
const RAMP_SET_REST = 45;
const SPREAD_LOW = 0.9;
const SPREAD_HIGH = 1.15;

function isIsolation(ex: Exercise | undefined): boolean {
  // Without a catalogue entry, assume a compound so time is not understated.
  return ex ? exerciseStimulus(ex.id).isolation : false;
}

// Barbell lifts are loaded in meaningful plate jumps and genuinely need ramp-up
// sets; dumbbell/machine/bodyweight compounds need far less staged loading.
function isBarbell(ex: Exercise | undefined): boolean {
  return !!ex && /barbell/i.test(ex.equipment);
}

// Arriving at a new station costs setup time that scales with equipment.
function transitionSeconds(ex: Exercise | undefined): number {
  if (!ex) return 40;
  if (/barbell/i.test(ex.equipment)) return 75; // load plates, set the rack
  if (/machine|leg press|cable|smith/i.test(ex.equipment)) return 45;
  if (/dumbbell|kettlebell/i.test(ex.equipment)) return 40;
  return 25; // bodyweight or bands
}

function secondsPerRep(ex: Exercise | undefined): number {
  return isIsolation(ex) ? ISOLATION_SEC_PER_REP : COMPOUND_SEC_PER_REP;
}

function isCoreOnly(items: Prescription[], catalog?: Exercise[]): boolean {
  return items.every((p) => {
    const ex = catalog?.find((e) => e.id === p.exerciseId);
    if (!ex) return false; // unknown movement: treat as loaded work
    const direct = exerciseStimulus(ex.id).direct;
    return direct.length > 0 && direct.every((m) => m === "Core");
  });
}

export function estimateSession(
  items: Prescription[],
  catalog?: Exercise[],
): DurationEstimate {
  if (!items.length) return { low: 0, expected: 0, high: 0 };
  const find = (id: string) => catalog?.find((e) => e.id === id);

  let seconds = isCoreOnly(items, catalog) ? CORE_ONLY_WARMUP : GENERAL_WARMUP;

  // After the general warm-up, the lifter ramps into the first main (compound)
  // lift. Later movements are already warm, so only subsequent heavy barbell
  // lifts need a single feeler set. This avoids double-counting preparation.
  let mainLiftRamped = false;

  items.forEach((prescription, index) => {
    const ex = find(prescription.exerciseId);
    const isolation = isIsolation(ex);
    const execPerSet = Math.max(
      MIN_SET_EXECUTION,
      prescription.reps * secondsPerRep(ex),
    );

    // Transition onto the station. The first exercise is covered by the
    // general warm-up, so it is not charged a separate transition.
    if (index > 0) seconds += transitionSeconds(ex);

    let ramps = 0;
    if (!isolation) {
      if (!mainLiftRamped) {
        ramps = isBarbell(ex) ? 3 : 2;
        mainLiftRamped = true;
      } else if (isBarbell(ex)) {
        ramps = 1;
      }
    }
    seconds += ramps * (RAMP_SET_EXECUTION + RAMP_SET_REST);

    seconds += prescription.sets * execPerSet;
    // Rest happens between working sets only, never after the last set.
    seconds += Math.max(0, prescription.sets - 1) * prescription.rest;
  });

  const expected = seconds / 60;
  return {
    low: Math.round(expected * SPREAD_LOW),
    expected: Math.round(expected),
    high: Math.round(expected * SPREAD_HIGH),
  };
}

// Backward-compatible scalar used across the generators and UI. Returns the
// typical (expected) estimate so existing call sites keep working.
export function estimatedMinutes(
  items: Prescription[],
  catalog?: Exercise[],
): number {
  return estimateSession(items, catalog).expected;
}

// Human-readable range for the UI, e.g. "50–65 min". Collapses to a single
// value when the spread rounds to the same number (very short sessions).
export function durationRangeLabel(
  items: Prescription[],
  catalog?: Exercise[],
): string {
  const { low, high } = estimateSession(items, catalog);
  return low === high ? `${high} min` : `${low}–${high} min`;
}
