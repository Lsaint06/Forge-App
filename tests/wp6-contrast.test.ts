import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { theme } from "../src/theme";

// Phase 7B WP6 Batch B: caption and selected-segment contrast, and where
// tertiary text may still be used.

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

for (const [name, p] of Object.entries(theme.palettes)) {
  test(`${name}: captions in secondary text meet 4.5:1 on every surface`, () => {
    for (const bg of [
      "bg",
      "surface",
      "surfaceRaised",
      "successSubtle",
      "selected",
    ] as const)
      assert.ok(
        contrast(p.text2, p[bg]) >= 4.5,
        `text2 on ${bg}: ${contrast(p.text2, p[bg]).toFixed(2)}`,
      );
  });
  test(`${name}: the chosen segment is outlined at 3:1 and its label reads at 4.5:1`, () => {
    // Outline (text3) against the control's track (surfaceRaised).
    assert.ok(contrast(p.text3, p.surfaceRaised) >= 3);
    assert.ok(contrast(p.text, p.selected) >= 4.5);
    assert.ok(contrast(p.text2, p.surfaceRaised) >= 4.5);
  });
}

// Tertiary text falls below 4.5:1 on some surfaces, so it is reserved for
// disabled controls, icons and other non-text marks (3:1), and large text.
// A new use must be reviewed and added here.
const allowed: Record<string, number> = {
  "app/design-system.tsx": 1, // palette sample
  "src/components/ui.tsx": 1, // the tone's type
  "src/components/DateSheet.tsx": 3, // disabled month arrows, unavailable days
  "src/components/DaySwitcher.tsx": 1, // disabled "next day"
  "src/components/system.tsx": 2, // disabled row title, disabled menu item
  "src/components/goals/GoalCard.tsx": 1, // the "–" no-data mark
  "src/components/checkins/CheckinSheet.tsx": 1, // large metric placeholder
  "src/screens/LegacyPath.tsx": 3, // rest-day icon colour
};
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.tsx?$/.test(f)
        ? [path]
        : [];
  });
}
test("tertiary text is used only where low emphasis is allowed", () => {
  const root = join(__dirname, "..");
  const found: Record<string, number> = {};
  for (const f of [...files(join(root, "src")), ...files(join(root, "app"))]) {
    const n = readFileSync(f, "utf8").split('"tertiary"').length - 1;
    if (n) found[relative(root, f).replaceAll("\\", "/")] = n;
  }
  assert.deepEqual(found, allowed);
});
