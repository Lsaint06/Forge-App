import { exercises } from "../data/catalog";
import {
  findProgramVersion,
  publishedPrograms,
  validateProgram,
  type CuratedProgram,
  type ProgramLock,
} from "../domain/programs/model";
import lock from "./published-lock.json";

// The bundled, human-authored program library. Each program is a JSON file in
// src/programs/library/, imported here explicitly. Nothing is generated.
// Add a published program's fingerprint to published-lock.json; tests reject
// edits to a published version. See docs/CURATED_PROGRAMS.md.
export const programSources: readonly unknown[] = [];

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
