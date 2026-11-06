import { exercises } from "../data/catalog";
import {
  findProgramVersion,
  publishedPrograms,
  validateProgram,
  type CuratedProgram,
  type ProgramLock,
} from "../domain/programs/model";
import lock from "./published-lock.json";
import strengthBeginner3 from "./library/forge-strength-beginner-3-day.json";
import strengthBeginner4 from "./library/forge-strength-beginner-4-day.json";
import strengthBeginner5 from "./library/forge-strength-beginner-5-day.json";
import strengthIntermediate3 from "./library/forge-strength-intermediate-3-day.json";
import strengthIntermediate4 from "./library/forge-strength-intermediate-4-day.json";
import strengthIntermediate5 from "./library/forge-strength-intermediate-5-day.json";
import strengthAdvanced3 from "./library/forge-strength-advanced-3-day.json";
import strengthAdvanced4 from "./library/forge-strength-advanced-4-day.json";
import strengthAdvanced5 from "./library/forge-strength-advanced-5-day.json";
import muscleBeginner3 from "./library/forge-muscle-beginner-3-day.json";
import muscleBeginner4 from "./library/forge-muscle-beginner-4-day.json";
import muscleBeginner5 from "./library/forge-muscle-beginner-5-day.json";
import muscleIntermediate3 from "./library/forge-muscle-intermediate-3-day.json";
import muscleIntermediate4 from "./library/forge-muscle-intermediate-4-day.json";
import muscleIntermediate5 from "./library/forge-muscle-intermediate-5-day.json";
import muscleAdvanced3 from "./library/forge-muscle-advanced-3-day.json";
import muscleAdvanced4 from "./library/forge-muscle-advanced-4-day.json";
import muscleAdvanced5 from "./library/forge-muscle-advanced-5-day.json";

// The bundled, human-authored program library. Each program is a JSON file in
// src/programs/library/, imported here explicitly. Nothing is generated.
// Add a published program's fingerprint to published-lock.json; tests reject
// edits to a published version. See docs/CURATED_PROGRAMS.md.
// Forge Strength V2 (docs/STRENGTH_V2.md) and Forge Muscle Building V3
// (docs/MUSCLE_BUILDING_V3.md) are bundled as drafts: validated and tested,
// but never listed or recommended until they are published.
export const programSources: readonly unknown[] = [
  strengthBeginner3,
  strengthBeginner4,
  strengthBeginner5,
  strengthIntermediate3,
  strengthIntermediate4,
  strengthIntermediate5,
  strengthAdvanced3,
  strengthAdvanced4,
  strengthAdvanced5,
  muscleBeginner3,
  muscleBeginner4,
  muscleBeginner5,
  muscleIntermediate3,
  muscleIntermediate4,
  muscleIntermediate5,
  muscleAdvanced3,
  muscleAdvanced4,
  muscleAdvanced5,
];

export const programLock: ProgramLock = lock;

// CI validates every bundled program against the exercise catalog. At runtime
// an invalid entry is left out rather than shown with altered content.
export const programLibrary: readonly CuratedProgram[] = programSources.flatMap(
  (raw) => {
    try {
      return [validateProgram(raw, exercises)];
    } catch {
      return [];
    }
  },
);

export const libraryPrograms = () => publishedPrograms(programLibrary);
export const libraryProgram = (id: string, version: number) =>
  findProgramVersion(programLibrary, id, version);
