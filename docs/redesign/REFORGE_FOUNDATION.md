# REFORGE foundation (Phase 7.1A)

This is the premium presentation layer for the five approved references. It is **additive and opt-in**: Design System 2.0 tokens and components ([DESIGN_SYSTEM_2.md](DESIGN_SYSTEM_2.md)) keep their values, so screens not yet transformed look as they did. Screens adopt REFORGE components as each phase transforms them (Home in 7.1B).

- **Plan and measurements:** [PHASE_7_0_REFORGE_ARCHITECTURE.md](../audits/PHASE_7_0_REFORGE_ARCHITECTURE.md)
- **Tokens:** [src/theme.ts](../../src/theme.ts), in the REFORGE palette keys, `forgeText`, `forge` and `DISPLAY_FONT`
- **Components:** [src/components/reforge/](../../src/components/reforge/index.ts)
- **Live reference (development builds):** You → Design system → *REFORGE foundation*
- **Assets and licences:** [reforge/ASSETS.md](reforge/ASSETS.md)

## Navigation

There are five tabs: **Home · Train · Nutrition · Progress · You**. Route names are unchanged (`index`, `train`, `progress`, `profile`); `nutrition` is new.

| Element | Treatment |
| --- | --- |
| Tab bar | A raised panel (`tabBar`) with 22 pt top corners and a hairline border. Line icons. The selected tab's icon and label are solid ember, and the label is bolder, so selection never relies on colour alone. A faint halo (`emberGlow`, 20% dark / 11% light) sits behind the selected icon only, confined to a 44 × 32 pt box. Each target is at least 56 pt tall; the bottom safe area is respected |
| Resume strip | While a workout is in progress, a strip with an ember outline appears above the tabs on every tab except Home |
| Nutrition tab | Renders the existing Nutrition screen (`<Nutrition tab />`) with no Back control. `/journal?kind=nutrition` still opens the same screen, with Back; when nothing is underneath it, Back lands on the tab. You → *Nutrition log* and Progress → *Nutrition* switch to the tab |

## Colour (dark / light)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `cardBg` | `#0C0D0F` | `#FFFFFF` | Card fill |
| `cardBorder` | `#26282B` | `#D5DAE1` | 0.5 pt card hairline |
| `cardRaised` | `#15171A` | `#F2F3F5` | Tiles, chips, inputs inside cards |
| `cardDivider` | `#1E2023` | `#E3E7EC` | Card header rule, strip dividers |
| `emberHot` | `#F47522` | `#C2410C` | REFORGE accent: overlines, icons, selected tab, progress |
| `emberTop` → `emberBottom` | `#F77620` → `#D8511F` | `#CC4A10` → `#B23A0A` | Call-to-action gradient; the label is `onEmber` |
| `emberMuted` | `#B2581D` | `#D0612A` | Active card outline |
| `emberTint` / `emberTintStrong` | `#2A1408` / `#4E1F0A` | `#FDF0E8` / `#F8D9C6` | Selected fills, ring track |
| `positive` | `#4ADE80` | `#19724F` | Changes that are unambiguously good |
| `tabBar` | `#0C0E0F` | `#FFFFFF` | Tab bar panel |
| `sheen` / `emberGlow` | rgba | rgba | Card top-light; selected-tab glow |

All pairs are AA-tested in [tests/reforge-tokens.test.ts](../../tests/reforge-tokens.test.ts):

- text and `emberHot` reach at least 4.5:1 on every surface;
- the CTA label reaches at least 4.5:1 at both gradient stops;
- outlines reach at least 3:1.

## Type

**Body text stays in the system face.** Condensed uppercase titles use **Barlow Condensed** (SIL OFL), via `FText`:

- the variants with a `display` cut;
- loaded in the background by [src/fonts.ts](../../src/fonts.ts), which never delays startup or the intro;
- shown in the system face at the same size and weight until the font has loaded.

| Role | Size / line | Notes |
| --- | --- | --- |
| `heroTitle` | 26 / 30 / 32 by size class | Barlow Condensed ExtraBold, uppercase; growth capped at 1.3× |
| `displayLabel` | 22 / 24 | Barlow Condensed Bold, uppercase |
| `screenTitle` / `greeting` | 30 / 36 · 26 / 32 | System 800 / 700 |
| `subtitle` · `cardTitle` · `body` · `label` | 16 · 17 · 15 · 13 | Scale fully with Dynamic Type |
| `overline` | 11 / 14, +2.2, uppercase | Card headers; spoken in natural case |
| `tagline` | 8 / 10, +3.2, uppercase | Decorative brand line, hidden from screen readers |
| `heroMetric` · `cardMetric` · `statMetric` | 44 · 24 · 20, tabular | |
| `button` · `tabLabel` | 17 · 11 | |

## Layout

| Token | Values |
| --- | --- |
| Margin | 16 |
| Card gap | 12 |
| Card padding | 16 |
| Radii | card 8, tile 8, CTA 10, tab bar 22 |
| Borders | card 0.5, active 1 |
| Heights | CTA 54, button 48, compact 44, tab 56 |

The minimum heights apply even where a reference draws a smaller control (Phase 7.0 §3.2).

## Components (`src/components/reforge`)

| Component | Purpose |
| --- | --- |
| `ForgeScreen` | Tab frame: background glow, `BrandHeader`, scrolling cards at the 16 pt margin, optional pinned footer |
| `BrandHeader`, `Wordmark` | Vector wordmark (2 KB, steel gradient) and brand line; header controls on the right |
| `ForgeCard` (`default` / `active` / `raised`), `CardHeader` | Hairline panels. The header is a heading, or a button with a chevron when it navigates |
| `HeroCard` | Right-hand artwork with scrims and a decorative tagline; without artwork, a graphical ember glow |
| `CtaButton`, `OutlineButton` (`ember` / `neutral`), `SquareIconButton` | Gradient primary action, outline actions, bordered icon control (44 pt minimum) |
| `Metric`, `StatStrip` | Value, unit, label and optional delta text, read as one element. Strips wrap to two columns, then one |
| `Tile`, `InfoChip`, `BadgePill`, `SectionLabel` | Small panels, facts, an ember pill, letter-spaced section labels |
| `ForgeProgress`, `ForgeRing` | Progress bar and ring with `progressbar` semantics |
| `Gradient` | Linear or radial SVG gradient layer (react-native-svg; works in Expo Go). react-native-svg ignores a stop colour's alpha, so `Gradient` moves it into `stopOpacity` (`stopPaint`) |
| `artwork` | Registry of licensed artwork slots (empty until 7.1B) |
| `stripColumns`, `pairFits` | Pure responsive rules |

Components never compute metrics: deltas and values are display text supplied by the screen.

**Worklets.** Code inside `useAnimatedStyle` and other worklets runs on the UI thread. It may only use inline maths or other worklets. Calling a plain module function there crashed the Design System screen on iPhone in 7.1A. [tests/worklets.test.ts](../../tests/worklets.test.ts) compiles every source file that contains worklets with the app's Babel preset and fails on such a call.

## Home (Phase 7.1B)

[Home.tsx](../../src/screens/Home.tsx) follows the approved Home reference. It is built from these primitives plus [home/sections.tsx](../../src/screens/home/sections.tsx) and a read-only model ([home/model.ts](../../src/screens/home/model.ts)). Every value comes from existing code; Home adds no metric.

| Reference | FORGE source |
| --- | --- |
| Wordmark and brand line | `BrandHeader` with "BUILT THROUGH DISCIPLINE" |
| Notification bell | Omitted: FORGE has no notification centre |
| Streak pill | `summary().streak` (consecutive days with a completed workout, as on Progress); opens Progress |
| Greeting | Time of day and the profile's first name |
| Subtitle | Static line from the reference |
| Date | Today |
| "Week 8 · Build Phase" | The current plan's week and phase (program phase name without its week range; Path Foundation/Evolution). Opens the plan |
| Readiness strip | Today's recovery check-in exactly as recorded: self-rated readiness word, sleep, soreness, energy. No score; **HRV is not shown** (no data). Without a check-in: "How are you today? · Check in". Opens Recovery |
| Today's session | `nextSession()`, unchanged, in all seven states. Exercise count and program level where known. The "…" menu lists existing destinations only. The "~60 min" chip and pager dots are omitted (no data) |
| Progress snapshot | Latest weigh-in (else profile weight) with its date; this week's volume (Monday–Sunday), in Progress's compact form above 10,000 ("12.5k", spoken in full); day streak; this week's sessions against the weekly target, with days trained. **No comparison percentages.** Opens Progress |
| Nutrition today | Today's totals; the ring and macro bars against targets only once they are the lifter's own. Opens the Nutrition tab |
| Next target | Goals' own evaluation (`evaluate`): name, state, current value, target, progress bar. Opens Goals |
| Below the reference | Last session (review) and Workout history |

**Next-target rule** (`nextTarget`):

1. Among active target goals (not weekly habits) with measured progress that are not yet reached, show the one closest to its target.
2. Otherwise, show the newest active goal with a recorded value.
3. Ties go to the most recently created goal.
4. With no such goal, show "No active target" and a *Set a goal* button.

**Responsive rules:**

- The snapshot and nutrition cards sit side by side only where both fit: `pairFits(content, fontScale, 170)`, which means standard and large iPhones at default text size. Otherwise they stack, with the ring beside the macros.
- The hero's decorative tagline appears only with at least 340 pt of content and text no larger than 1.2×.
- Strips wrap to two columns.

**Artwork:** `homeSession` and `homeTarget` have no approved artwork yet, so the hero and target cards show the graphical ember glow ([reforge/ASSETS.md](reforge/ASSETS.md)).
