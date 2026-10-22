import React from "react";
import Paths from "../src/screens/Paths";
import LegacyPath from "../src/screens/LegacyPath";
import { curatedOnly } from "../src/programs/activation";

// Once the curated library is published and active, /paths only continues or
// reviews existing Paths; the Path builder is unreachable. See docs/PHASE_6.md.
export default function PathsRoute() {
  return curatedOnly() ? <LegacyPath /> : <Paths />;
}
