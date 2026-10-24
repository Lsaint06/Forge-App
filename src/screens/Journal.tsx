import React from "react";
import { useLocalSearchParams } from "expo-router";
import Nutrition from "./Nutrition";
import SavedFoods from "./SavedFoods";
import Measurements from "./Measurements";
import Checkins from "./Checkins";
import Goals from "./Goals";

/**
 * `/journal?kind=…`. Nutrition and saved foods (Phase 7B WP4A), measurements
 * (WP4B), recovery (WP4C) and goals (WP4D) each have their own screen. An
 * unknown kind opens Measurements, as before.
 */
export default function JournalScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  if (params.kind === "nutrition") return <Nutrition />;
  if (params.kind === "food") return <SavedFoods />;
  if (params.kind === "recovery") return <Checkins />;
  if (params.kind === "goal") return <Goals />;
  return <Measurements />;
}
