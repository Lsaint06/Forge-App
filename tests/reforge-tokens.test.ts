import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  theme,
  forge,
  forgeText,
  forgeRoleFor,
  forgeMaxFontScale,
  DISPLAY_FONT,
  type ForgeVariant,
} from "../src/theme";
import { stripColumns, pairFits } from "../src/components/reforge/layout";
import { stopPaint } from "../src/components/reforge/color";
import { artwork } from "../src/components/reforge/artwork";

// Phase 7.1A: REFORGE tokens keep the accessibility guarantees of Design
// System 2.0 in both palettes.

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

for (const [name, p] of Object.entries(theme.palettes))
  test(`${name}: REFORGE surfaces, accents and labels meet WCAG contrast`, () => {
    const at = (fg: string, bg: string, min: number, what: string) =>
      assert.ok(
        contrast(fg, bg) >= min,
        `${what}: ${contrast(fg, bg).toFixed(2)} < ${min}`,
      );
    for (const [key, bg] of Object.entries({
      bg: p.bg,
      cardBg: p.cardBg,
      cardRaised: p.cardRaised,
      tabBar: p.tabBar,
    })) {
      at(p.text, bg, 4.5, `text on ${key}`);
      at(p.text2, bg, 4.5, `text2 on ${key}`);
      // Ember is used as small text (overlines, the selected tab label).
      at(p.emberHot, bg, 4.5, `emberHot on ${key}`);
      at(p.positive, bg, 4.5, `positive on ${key}`);
      // Active outlines are non-text indicators.
      at(p.emberMuted, bg, 3, `emberMuted on ${key}`);
    }
    // The gradient CTA label reads at both ends of the gradient.
    at(p.onEmber, p.emberTop, 4.5, "CTA label on emberTop");
    at(p.onEmber, p.emberBottom, 4.5, "CTA label on emberBottom");
    // Selected tiles and segments.
    for (const tint of [p.emberTint, p.emberTintStrong]) {
      at(p.text, tint, 4.5, `text on ${tint}`);
      at(p.text2, tint, 4.5, `text2 on ${tint}`);
    }
  });

test("existing Design System 2.0 values are unchanged by REFORGE", () => {
  // REFORGE is additive: screens not yet transformed keep their look.
  assert.equal(theme.palettes.dark.ember, "#F46B35");
  assert.equal(theme.palettes.dark.surface, "#141619");
  assert.equal(theme.spacing.screen, 20);
  assert.equal(theme.radii.card, 16);
});

test("REFORGE type roles never clip and cap only headings and hero numbers", () => {
  for (const v of Object.keys(forgeText) as ForgeVariant[])
    for (const w of [320, 375, 393, 440]) {
      const r = forgeRoleFor(v, w);
      assert.ok(r.lineHeight >= r.size, `${v} at ${w}`);
    }
  assert.deepEqual(
    [375, 393, 440].map((w) => forgeRoleFor("heroTitle", w).size),
    [26, 30, 32],
  );
  for (const v of [
    "body",
    "label",
    "overline",
    "cardTitle",
    "subtitle",
  ] as const)
    assert.equal(forgeMaxFontScale[v], undefined, `${v} scales fully`);
  for (const v of ["heroTitle", "screenTitle", "heroMetric"] as const)
    assert.ok(
      (forgeMaxFontScale[v] ?? 0) >= 1.2,
      `${v} grows to at least 1.2×`,
    );
  assert.equal(forgeText.overline.uppercase, true);
  assert.equal(forgeText.heroMetric.tabular, true);
});

test("REFORGE sizes keep 44 pt targets and the 4 pt grid", () => {
  for (const [k, h] of Object.entries(forge.heights))
    if (k !== "chip") assert.ok(h >= 44, k);
  for (const s of Object.values(forge.spacing)) assert.equal(s % 4, 0);
  assert.equal(forge.spacing.margin, 16);
});

test("the display face is bundled with its licence", () => {
  const root = join(__dirname, "..");
  for (const name of Object.values(DISPLAY_FONT))
    assert.ok(existsSync(join(root, "assets", "fonts", `${name}.ttf`)), name);
  const licence = readFileSync(
    join(root, "assets", "fonts", "OFL.txt"),
    "utf8",
  );
  assert.match(licence, /SIL Open Font License, Version 1\.1/);
  assert.match(licence, /Barlow Project Authors/);
});

test("artwork entries always carry a credit and a licence", () => {
  for (const [slot, a] of Object.entries(artwork)) {
    assert.ok(a?.credit.trim(), `${slot} credit`);
    assert.ok(a?.license.trim(), `${slot} licence`);
  }
});

test("gradient stops carry colour alpha as opacity (react-native-svg drops it)", () => {
  assert.deepEqual(stopPaint("rgba(244,117,34,0.14)"), {
    color: "rgb(244, 117, 34)",
    opacity: 0.14,
  });
  assert.deepEqual(stopPaint("rgba(255, 255, 255, 0.035)", 0), {
    color: "rgb(255, 255, 255)",
    opacity: 0,
  });
  assert.deepEqual(stopPaint("#F47522"), { color: "#F47522", opacity: 1 });
  assert.deepEqual(stopPaint("#F4752280", 1), {
    color: "#F47522",
    opacity: 128 / 255,
  });
  assert.deepEqual(stopPaint("rgb(1, 2, 3)", 0.5), {
    color: "rgb(1, 2, 3)",
    opacity: 0.5,
  });
  // Every translucent palette token resolves to a faint stop, never full
  // strength.
  for (const p of Object.values(theme.palettes)) {
    assert.ok(stopPaint(p.emberGlow).opacity <= 0.22, "emberGlow is subtle");
    assert.ok(stopPaint(p.sheen).opacity <= 0.05, "sheen is subtle");
  }
});

test("stat strips keep one row while columns fit, then two, then one", () => {
  assert.equal(stripColumns(330, 1, 4), 4);
  assert.equal(stripColumns(280, 1, 4), 2);
  assert.equal(stripColumns(330, 1.6, 4), 2);
  assert.equal(stripColumns(140, 2, 4), 1);
  assert.equal(stripColumns(330, 3, 3), 2); // text scale is capped at 2×
  assert.equal(stripColumns(100, 1, 1), 1);
  assert.equal(pairFits(361, 1), true);
  assert.equal(pairFits(361, 1.3), false);
  assert.equal(pairFits(300, 1), false);
});
