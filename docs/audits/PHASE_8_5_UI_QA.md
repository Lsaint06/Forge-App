# Phase 8.5 M3: App-wide UI/UX and accessibility quality review

Branch `feat/phase8-5-forge-hardening`. A quality review, not a redesign: one defect fixed, nothing else changed. Out of scope here: Engineer #2's onboarding, paywall, membership and subscription flows.

**Verification level.** Automated UI tests (Jest, React test renderer) and code inspection. No screenshots or device rendering: layout isn't computed in these tests, so clipping, overlap, keyboard cover and safe areas can't be seen here (section 4). Nothing below was judged from imagined screenshots.

## 1. What was checked, and how

| Area                       | Method                                                                                                                                                                                                                                                                                                                         | Result                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Screen-reader names, roles | New sweep (`tests/ui/accessibility-sweep.test.tsx`) of every control VoiceOver and TalkBack can reach, with a lifter's data: Home, Train, Nutrition, Progress, You, History, the logger; Home's session menu, Add food, the workout and exercise menus, Progression and Finish. About 250 controls and fields in 13 views. | All have a role and a name; every text field has a label.                                                                                                    |
| Touch targets              | The same sweep: a control drawn smaller than 44 pt must reach 44 with its hit slop (sizes from styles).                                                                                                                                                                                                                         | **One defect: the set number (Set Details) was 42 pt wide.** Fixed (P2-1).                                                                                   |
| Small screen, large text   | The sweep at 320 × 568 pt (iPhone SE) with text at 200%: Home, Nutrition, Progress and the logger.                                                                                                                                                                                                                              | No missing names or small targets.                                                                                                                           |
| Text size                  | Code: `maxFontSizeMultiplier` caps.                                                                                                                                                                                                                                                                                             | Body, captions and labels scale freely. Caps apply only to display, metric and title styles (1.2–1.5×) and set-grid numbers (1.4×, so the columns fit).    |
| Reduced motion             | Code: every animation outside onboarding.                                                                                                                                                                                                                                                                                       | All honour the system setting: sheets, menus, progress bars and buttons.                                                                                     |
| Contrast                   | Already tested at token level (`design-tokens`, `reforge-tokens`, `wp6-contrast`). Measured here: tertiary text used directly in code.                                                                                                                                                                                          | Direct uses are icons, borders, chart markers and **input placeholders** (P3-1).                                                                             |
| Announcements and errors   | Code: `announceForAccessibility`, live regions.                                                                                                                                                                                                                                                                                 | Saves, removals with Undo, rest start and end, scanner misses, search results and sign-in states are announced; save errors are plain language (`state.ts`). |

## 2. Defects

| ID    | Priority | Where                     | Finding                                                                                                                                       | Status                                                                                                                                                                                                                       |
| ----- | -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | P0       | —                         | None found (crash, data loss or blocked essential workflow).                                                                                  | Data integrity was stress-tested separately (M4, `d057730`).                                                                                                                                                                 |
| —     | P1       | —                         | None found by automated tests or inspection.                                                                                                  | Device checks below.                                                                                                                                                                                                         |
| P2-1  | P2       | Logger, every set row     | The set number, which opens Set Details, was a 32 pt column with 6 + 4 pt of slop: a 42 × 44 pt target, below Apple's 44 × 44 minimum.         | **Fixed.** The left slop is now 8 pt: 44 pt, within the card's 16 pt padding and the 4 pt gap before the next column, with no visual change. Tests: `workout-reforge.test.tsx` and the sweep both fail with the old value. |
| P3-1  | P3       | Every text field          | Placeholders use tertiary text: 3.8:1 (dark) and 4.3:1 (light) on the input background, under the 4.5:1 WCAG AA asks for text.                  | **Founder design decision.** Placeholders are hints, not labels: every field has its own spoken label. Secondary text (7.6:1 and 6.5:1) would read clearly but makes hints look like entered values.                      |

## 3. Already sound (no change)

- **Logger:**
  - every control is 44 pt or more (`workout-reforge.test.tsx`);
  - focus moves through the set grid in order, with Next and Done on the keyboard bar;
  - inputs announce errors (`useAnnouncedError`);
  - the set grid adapts (wide, compact, stacked) instead of clipping.
- **Tabs:**
  - background tabs don't redraw (`TabFreeze`, 7.6);
  - the same records read the same on every tab (`cross-tab.test.tsx`);
  - empty states point to the next step (for example History's Go to Train).
- **Performance:** each tab and the logger now redraw without reading the whole history (M2, `b892b5f`).

## 4. Needs a device (not verifiable here)

Run these on the iPhone with FORGE Dev, and on Android once a build exists (M1). Use the smallest supported screen and the largest text size.

1. **Clipping at large text sizes:** Home cards, Progress charts and axis labels, Nutrition meal rows, the set grid (all three layouts).
2. **The keyboard over inputs:** the set grid near the bottom of a long workout, Add food search, Goals and Measurements sheets (Android uses `behavior="padding"` since 8.4).
3. **Safe areas and the status bar:** the logger header, sheets on devices with a home indicator, the iOS 27 status bar (8.4C-1). Android edge-to-edge needs a build.
4. **Scrolling and sheet content cut off** on short screens: Finish, Quick add, Progression.
5. **Contrast in context:** charts over cards, ember on dark, light mode outdoors.
6. **VoiceOver and TalkBack pass:** reading order on Home and the logger, the custom tab bar, swipe actions.
7. **Reduce Motion on:** sheets appear without animation, progress bars jump to their value.
