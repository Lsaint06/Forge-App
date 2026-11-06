import { cmToIn, inToCm, kgToLb, lbToKg } from "../metrics";
import { readFormNumber } from "../numbers";
import type { Profile } from "../types";

// About you's numbers (Phase 9.2), with setup's long-standing conventions:
// the profile stores kilograms and centimetres; pounds also mean feet and
// inches; "2,5" and "2.5" both read as 2.5; an empty field reads as 0 ("not
// given"), anything else unreadable as NaN, which the profile's rules refuse.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A stored weight (kg) as typed in the athlete's units; empty when unset. */
export const weightText = (kg: number, units: Profile["units"]) =>
  kg > 0 ? String(round2(units === "lb" ? kgToLb(kg) : kg)) : "";

/** Typed weight → kg. */
export function readWeight(text: string, units: Profile["units"]) {
  const n = readFormNumber(text);
  return units === "lb" && Number.isFinite(n) ? lbToKg(n) : n;
}

/** A stored height (cm) as typed in centimetres; empty when unset. */
export const heightCmText = (cm: number) => (cm > 0 ? String(round2(cm)) : "");

/** A stored height (cm) as feet and inches; empty when unset. */
export function feetInches(cm: number) {
  if (!(cm > 0)) return { feet: "", inches: "" };
  const total = Math.round(cmToIn(cm));
  return { feet: String(Math.floor(total / 12)), inches: String(total % 12) };
}

/** Typed feet and inches → cm: whole numbers, 0–11 inches; both empty → 0. */
export function readFeetInches(feet: string, inches: string) {
  const f = feet.trim();
  const i = inches.trim();
  if (f === "" && i === "") return 0;
  if (!/^\d+$/.test(f) || !/^\d*$/.test(i) || Number(i || 0) > 11) return NaN;
  return inToCm(Number(f) * 12 + Number(i || 0));
}

/** Body fat: 0 means "not given" and is shown empty. */
export const bodyFatText = (v: number) => (v > 0 ? String(v) : "");

/** Plain help for About you's fields, in setup's own words. */
export const ABOUT_HELP = {
  name: "Enter a name of up to 80 characters.",
  height: "Enter your height.",
  heightCm: "Enter a valid height in centimetres (up to 300).",
  heightFtIn: "Enter a valid height in feet and inches (0–11 inches).",
  weight: "Enter your starting weight.",
  weightRange: "Enter a weight up to 700 kg (1,543 lb).",
  bodyFat: "Enter a percentage from 0 to 100, or leave it empty.",
} as const;
