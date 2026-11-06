# Phase 7.3H — Final Nutrition verification

**Status:** implemented and verified; awaiting founder approval (not committed).
**Branch:** `feat/forge-paths-foundation`, after G4 (`6a85e0c`).
**Date:** 26 October 2026 (a Monday, which matters for item A below).

This phase verifies the REFORGE Nutrition experience before Phase 7.3 closes. It adds no features. It does not change protected logic: catalogues, barcode precedence, nutrition and Smart Servings maths, personal food identity, saved foods and corrections, history snapshots, backup and sync. It does not touch Open Food Facts, which stays on legal hold.

## 1. Original roadmap scope

[PHASE_7_3A_REFORGE_NUTRITION_ARCHITECTURE.md](PHASE_7_3A_REFORGE_NUTRITION_ARCHITECTURE.md) §7 defines 7.3H as:

| Original 7.3H item | Where it is verified |
| --- | --- |
| Entry points: the tab, the Home card, Progress, You, `/journal?kind=nutrition`, Saved foods Back | G4 (`6a85e0c`) plus the existing UI tests (§6) |
| Totals: identical for a fixed fixture before and after | §3.F |
| Accuracy: branded and scanned values checked against labels | Automated identity and serving checks; values against printed labels need the products (§7) |
| Performance: library and branded catalogue load and search time | §3.G |
| Accessibility, light mode and the smallest iPhone | §3.H plus the device checklist |
| Founder visual review against the reference | Device checklist (§7) |

The Phase 7.0 plan ([PHASE_7_0_REFORGE_ARCHITECTURE.md](PHASE_7_0_REFORGE_ARCHITECTURE.md), items 7.3-1 to 7.3-6) is fully delivered by 7.3B–7.3G.

The brief's issues A–E were raised later. They are not in the original 7.3H scope but fit within it:

| Item | Origin |
| --- | --- |
| A. Monday-only Progress test failures | Seen during 7.3F–7.3G verification |
| B. Unused code | Found in the G4 audit (`MacroSummary.tsx`) |
| C. ALL-CAPS names | Decision G-D4 / E10, deferred to 7.3H |
| D. Offline | Pending since 7.3F.2 |
| E. Release builds | Pending since 7.3F |

**Discrepancies found before any changes:**

1. The 7.3A status table was stale. 7.3B still read "in founder review" and 7.3C–7.3H "after …" or "gated". It now records each checkpoint's commit, the Open Food Facts block and the declined G3.
2. The 7.3A, 7.0 and WP6 audits still mention `MacroSummary`. They are historical records and are left as written; this report records its removal.
3. 7.3G's original "history surfaces" were declined by the founder (G3). No history screen exists or was added.

## 2. Completed Nutrition milestones

| Checkpoint | Commit | Delivered |
| --- | --- | --- |
| 7.3A / 7.3B | `c77c2a0` | Architecture; REFORGE dashboard |
| 7.3C | `45bb509` | Hydration |
| 7.3D | `5bb9171` | Food discovery and logging |
| 7.3E | `e41bd41` | Bundled USDA branded catalogue (404,982 products, 395,354 barcodes) |
| 7.3F | `4b0e354` | Barcode scanner |
| 7.3F.1 | `7f5207b` | Smart Servings |
| 7.3F.2 M2 | `53229ee` | Personal barcode foods and corrections |
| 7.3F.2 M3.1 | `9367341` | Open Food Facts research only; M3.2 **blocked** pending licensing |
| 7.3G G1 | `e5f5f8b` | REFORGE Saved foods |
| 7.3G G2 | `339c009` | Targets edited inside Nutrition |
| 7.3G G3 | none | Declined by the founder |
| 7.3G G4 | `6a85e0c` | Links open today; Back to today |

## 3. Findings and fixes

| # | Finding | Severity | Action |
| --- | --- | --- | --- |
| A | Two Progress UI tests failed every Monday | Medium (test reliability; no user impact) | **Fixed** (test fixture) |
| B | `MacroSummary.tsx` unused since 7.3B | Low | **Removed** with its dead-code test |
| C | 95.7 % of branded names are ALL-CAPS | Design decision | **Later polish** (N-H1, §5) |
| D | No automated offline test for targets, logs or saved foods | Low (coverage gap) | **Test added** |
| E | No release build or Android device run | Process limitation | **Deferred to launch readiness** (N-H3, §5) |
| F | Totals before and after Phase 7.3 | None found | Verified |
| G | Performance | None found | Measured |
| H | Light mode had no dashboard test | Low (coverage gap) | **Test added** |
| I | 7.3A status table stale | Documentation | **Updated** |

No user-facing defect was found in the Nutrition experience during 7.3H.

### A. Monday-only Progress failures: root cause

The two affected tests were "several weeks of history…" and "Records lists…". Their shared `history()` fixture anchored eight weeks of sessions on *this week's* Monday and skipped any session after today. On a Monday, this week's Tuesday session had not happened, so the fixture silently dropped its newest session: bench at 117.5 kg and a squat.

The app was right and the fixture was wrong:

- Progress opens on 12 weeks; the test then switches to **4 weeks**. In that range, without the missing session, Back Squat has one session and no trend, so Bench is correctly listed first.
- Records correctly shows 115 kg, not 117.5 kg.

**Fix** ([progress.test.tsx](../../tests/ui/progress.test.tsx)): the fixture anchors on `mondayOf(today − 2 days)`. The newest Tuesday is then always 1–7 days ago, at any hour on any weekday. No assertion was weakened or skipped.

**Verified:** 11/11 for every weekday (26 Oct – 1 Nov 2026) at 00:30 and 23:30, including the 1 November daylight-saving change. The full UI suite run today (a Monday) passes 461/461.

### B. Unused code

A search of every export in the Nutrition components, screens and domain modules against all app, test and script files found one orphaned component.

`src/components/nutrition/MacroSummary.tsx` has had no callers since the 7.3B dashboard replaced it (`c77c2a0`). It is removed, together with the WP6 test that rendered only that component. The REFORGE hero keeps its own large-text and 320 pt tests in `nutrition-dashboard.test.tsx`.

Two constants in `food-library.ts`, `FAMILY_LABELS` and `SOURCE_KEYS`, are also unreferenced elsewhere. They are **left in place** because that is the protected catalogue module; they are listed for a later clean-up. Other unreferenced exports are helpers used inside their own module.

### C. ALL-CAPS product names (measured, not changed)

| | Count |
| --- | --- |
| Branded product names entirely in capitals | 387,690 of 404,982 (95.7 %) |
| Products whose brand is in capitals | 94.4 % |
| Brands in capitals | 34,179 of 35,999 |

Example names: "ELITE HIGH COMPLETE PROTEIN 42 G MILK SHAKE, CHOCOLATE", "ORIGINAL BEEF STICKS, ORIGINAL".

Stored names and logged snapshots must stay exactly as sourced. Any change is therefore a display-time decision; options are in §5.

### D. Offline

| Behaviour | Automated evidence |
| --- | --- |
| Generic food search and logging | `food-library.test.ts`, `ui/food-library.test.tsx` (`fetch` cut, 0 calls) |
| Branded search and barcode lookup | `branded-catalog.test.ts` (no network code), `ui/food-branded.test.tsx`, `ui/barcode-scanner.test.tsx` (0 calls) |
| Personal barcode foods and corrections | `ui/personal-foods.test.tsx` (0 calls), `personal-foods.test.ts` (restart, backup, sync) |
| Hydration | `hydration.test.ts` (sync queued) |
| **Targets, food logs, saved foods** | **New:** [nutrition-offline.test.ts](../../tests/nutrition-offline.test.ts). With the network cut, it saves targets (with the saved flag), logs two foods and saves a food. It then closes and reopens the database file and checks the targets, the saved flag, the unchanged entries, the totals (465 kcal, 41 g protein), the saved food and the queued sync. `fetch` is called 0 times |

**Still needs real Airplane Mode** (§7): the bundled branded database installing and opening on a fresh install, the camera scanner, and an app restart from a cold state.

### E. Cross-platform

- iOS and Android `expo export` pass.
- **Not done:** an EAS release build, a TestFlight or App Store build (needs a paid Apple Developer account and signing), and any Android physical-device run. Expo Go on the founder's iPhone is the only device path today.

### F. Totals

`metrics.ts`, which holds `nutritionTotals`, is byte-identical to the pre-7.3 baseline `31d43a9`. None of the `nutrition.ts` changes since then touches `totalsOf`, `macrosOf` or entry calories. The same fixture therefore gives the same totals, and the existing totals tests are unchanged.

### G. Performance (desktop, Node, real catalogues)

| Operation | Result |
| --- | --- |
| Generic library decode | 19 ms (3,730 foods) |
| Generic library search | p50 0.5 ms, p95 1.3 ms |
| Branded catalogue open and categories | 1.4 ms |
| Branded search (16 queries × 3) | p50 4 ms; brand queries 0.5–8 ms; "chicken" 20 ms; two-letter "ch" / "pr" about 60 ms |
| Barcode lookup (200 random barcodes) | p50 0.05 ms, max 0.34 ms, 200/200 found |

These are desktop figures. A phone can be several times slower; the two-letter case is the one to watch on device.

### H. Accessibility and light mode

- Every `Pressable` in the Nutrition components and screens has an accessibility role and label.
- The only fixed colours are the camera viewfinder, which is dark on purpose over the camera.
- **New test:** in light mode the dashboard, the Daily targets sheet and the Hydration sheet use the light palette.
- Large text and 320 pt layouts remain covered by the dashboard, hydration, discovery and branded tests.

## 4. Files changed (uncommitted)

| File | Change |
| --- | --- |
| `tests/ui/progress.test.tsx` | Deterministic `history()` fixture |
| `src/components/nutrition/MacroSummary.tsx` | Deleted |
| `tests/ui/wp6.test.tsx` | Removed the dead `MacroSummary` test |
| `tests/nutrition-offline.test.ts` | New offline and restart test |
| `tests/ui/nutrition-dashboard.test.tsx` | Light-mode test; mock profile carries the theme |
| `docs/audits/PHASE_7_3A_REFORGE_NUTRITION_ARCHITECTURE.md` | Status table updated |
| `docs/audits/PHASE_7_3H_NUTRITION_VERIFICATION.md` | This report |

No app behaviour changed. The only production source change is the deletion of the unused component.

## 5. Founder decisions (26 October 2026)

| # | Item | Decision |
| --- | --- | --- |
| N-H1 | ALL-CAPS branded names (95.7 % of products) | **Later polish.** Smart display-only casing for USDA branded names that keeps acronyms and units (BBQ, MCT, BCAA, g, mg, fl oz) and brand stylings. Stored names, logged snapshots, backups and search never change. Needs its own design pass and tests; not part of 7.3H |
| N-H2 | Unused `FAMILY_LABELS` and `SOURCE_KEYS` in `food-library.ts` | **Removal allowed in a separate clean-up**, not now. They stay in place in 7.3H |
| N-H3 | EAS release build and Android device testing | **Deferred** to the dedicated device-testing and launch-readiness phase. Not a condition for leaving Nutrition |

**Unchanged:** Open Food Facts M3.2 stays blocked pending licensing and legal review.

## 6. Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| ESLint | 0 errors; 1 existing warning (`templates-wp3.test.tsx`, unused `Repo`) |
| Prettier | Pass |
| Logic tests | **487 / 487** (one new) |
| UI tests | **47 suites, 461 / 461**, run on a Monday. The two Monday-only failures are fixed; one dead test was removed and one light-mode test added |
| Progress suite, every weekday at 00:30 and 23:30 | 11 / 11 each |
| Food library | Reproducible: 3,730 foods, `2d95151e…6d6001` |
| Branded catalogue | Reproduced byte-identical: 404,982 products, 395,354 barcodes, content `5c8a5788…a727` |
| iOS / Android export | Pass; Hermes bundles 8,011,079 B / 8,001,192 B |

## 7. Physical-device checklist (iPhone with Expo Go)

1. **Entry points.**
   1. Choose a past day in Nutrition.
   2. Tap Home's "Nutrition today". Today is shown.
   3. Repeat from the Progress and You Nutrition links.
   4. Go to a past day again, then use the tab bar. Your day is kept.
   5. On a past day, tap "Back to today".
2. **Saved foods.** Search, use the filters, edit and delete a food, and remove a correction. Back returns to Nutrition on the same day.
3. **Targets.**
   1. Edit targets from the calorie goal card.
   2. Cancel, and confirm nothing is saved.
   3. Save, and check the dashboard updates.
   4. Open You → Nutrition targets and see the same values.
4. **Label accuracy.** Scan each product and compare with its printed label. Values per serving from the bundled catalogue:

   | Product | kcal | Protein |
   | --- | --- | --- |
   | Fairlife Elite 42 g chocolate (1 bottle, 414 ml) | 232 | 42 g |
   | Barebells caramel cashew (1 bar, 55 g) | 200 | 20 g |
   | Chomps original beef stick (1 stick, 32 g) | 90 | 9 g |
   | Celsius sparkling (355 ml) | ≈ 11 | — |

   Report any product whose label differs.
5. **Airplane Mode.**
   1. Turn it on and force-quit FORGE.
   2. Reopen. Search "chicken" and a brand ("quest"), scan a barcode, log a food, edit targets and add water.
   3. Force-quit and reopen. Everything is still there.
   4. Turn Airplane Mode off. Sync resumes.
6. **Smallest phone and large text.** Set the largest Dynamic Type size (and, if available, use an iPhone SE-sized display). Check the dashboard, the targets sheet, Saved foods rows, food search and the hydration sheet: nothing cut off, and buttons reachable above the keyboard.
7. **Light mode.** Repeat items 1–3 with Theme set to Light.
8. **Visual review** against the approved Nutrition reference.
9. **Deferred to launch readiness (N-H3):** an EAS or TestFlight release build, and an Android physical device.

## 8. Recommendation

Nutrition is **ready to exit REFORGE**, conditional on:

- the device checklist (§7) passing, especially Airplane Mode and label accuracy;
- the founder's visual sign-off.

No automated check fails, no defect is open, the founder decisions are recorded (§5), and the remaining items are device-only checks. Release builds and Android testing belong to the launch-readiness phase (N-H3). Open Food Facts stays out of scope until licensing is cleared.
