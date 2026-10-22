import { libraryPrograms } from "./index";
import { libraryCoverage } from "../domain/programs/publication";
import type { CuratedProgram } from "../domain/programs/model";

// Curated-only Forge Paths (Phase 6). Activation follows publication: once
// published curated programs cover every goal × experience × frequency
// combination, Forge no longer offers generated plans. Until then the
// existing Path builder stays available so Forge always has a working way to
// start a training plan. Existing generated Paths stay readable and can be
// continued either way.
export function curatedOnly(
  programs: readonly CuratedProgram[] = libraryPrograms(),
) {
  return libraryCoverage(programs).complete;
}
