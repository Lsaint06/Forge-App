import { test } from "node:test";
import assert from "node:assert/strict";
import {
  theme,
  textRoles,
  textRoleFor,
  sizeClass,
  maxFontScale,
  legacySizeRole,
  withLegacyAliases,
} from "../src/theme";

// FORGE Design System 2.0 token guarantees.

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
  test(`${name} palette meets WCAG contrast for text and controls`, () => {
    const surfaces = [p.bg, p.surface, p.surfaceRaised];
    for (const bg of surfaces) {
      // Body and secondary text: AA (4.5:1).
      assert.ok(contrast(p.text, bg) >= 4.5, `text on ${bg}`);
      assert.ok(contrast(p.text2, bg) >= 4.5, `text2 on ${bg}`);
      assert.ok(contrast(p.error, bg) >= 4.5, `error on ${bg}`);
      // Tertiary text and non-text indicators (chevrons, ghosts): 3:1.
      assert.ok(contrast(p.text3, bg) >= 3, `text3 on ${bg}`);
      assert.ok(contrast(p.ember, bg) >= 3, `ember on ${bg}`);
    }
    assert.ok(contrast(p.onEmber, p.ember) >= 4.5, "primary button label");
    assert.ok(contrast(p.text, p.selected) >= 4.5, "selected segment");
    assert.ok(contrast(p.text2, p.selected) >= 3, "unselected segment");
    // Inverted chips: background-coloured label on a text-coloured pill.
    assert.ok(contrast(p.bg, p.text) >= 4.5, "selected chip");
  });

test("earlier colour names map onto the 2.0 tokens", () => {
  const c = withLegacyAliases(theme.palettes.dark);
  assert.equal(c.background, c.bg);
  assert.equal(c.elevated, c.surfaceRaised);
  assert.equal(c.muted, c.text2);
  assert.equal(c.accent, c.ember);
  assert.equal(c.border, c.hairline);
  assert.deepEqual(theme.colors, c);
});

test("the type scale has six text roles and two tabular numeric roles", () => {
  assert.deepEqual(Object.keys(textRoles), [
    "display",
    "title",
    "headline",
    "body",
    "caption",
    "overline",
    "metricXL",
    "metric",
  ]);
  for (const role of Object.values(textRoles))
    assert.ok(role.lineHeight >= role.size, "line height never clips");
  assert.equal(textRoles.metric.tabular, true);
  assert.equal(textRoles.metricXL.tabular, true);
  assert.equal(textRoles.overline.uppercase, true);
  // Every ad-hoc size used before 2.0 snaps to one of the roles.
  const used = new Set(
    [
      11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 28, 30, 32, 38,
    ].map(legacySizeRole),
  );
  assert.deepEqual([...used].sort(), [
    "body",
    "caption",
    "display",
    "headline",
    "overline",
    "title",
  ]);
});

test("interactive sizes meet the 44 pt minimum and spacing follows the 4 pt grid", () => {
  for (const h of Object.values(theme.heights)) assert.ok(h >= 44);
  for (const s of Object.values(theme.spacing)) assert.equal(s % 4, 0);
  assert.equal(theme.spacing.screen, 20);
});

test("screen titles and hero numbers scale with the iPhone size class", () => {
  // iPhone SE / 13 mini, iPhone 16, iPhone 16 Pro Max logical widths.
  assert.equal(sizeClass(320), "compact");
  assert.equal(sizeClass(375), "compact");
  assert.equal(sizeClass(393), "standard");
  assert.equal(sizeClass(402), "standard");
  assert.equal(sizeClass(430), "large");
  const display = [375, 393, 440].map((w) => textRoleFor("display", w).size);
  assert.deepEqual(display, [28, 32, 34]);
  assert.equal(textRoleFor("display", 393).size, textRoles.display.size);
  assert.equal(textRoleFor("metricXL", 375).size, 40);
  for (const w of [320, 375, 393, 440]) {
    const r = textRoleFor("display", w);
    assert.ok(r.lineHeight > r.size, "line height leaves room for descenders");
    // Weight, tracking and other roles are unchanged across devices.
    assert.equal(r.weight, textRoles.display.weight);
    assert.deepEqual(textRoleFor("body", w), textRoles.body);
  }
});

test("Dynamic Type caps apply to headings and hero numbers only", () => {
  assert.ok((maxFontScale.display ?? 0) >= 1.2);
  assert.ok((maxFontScale.metricXL ?? 0) >= 1.2);
  for (const role of ["body", "caption", "headline", "overline"] as const)
    assert.equal(maxFontScale[role], undefined, `${role} scales fully`);
});
