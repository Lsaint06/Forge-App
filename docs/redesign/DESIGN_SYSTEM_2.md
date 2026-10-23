# FORGE Design System 2.0

The app's interior should match the splash: black steel, white type, a single ember. **One action. One number. One line.**

Status: **Phase 1 (foundations) implemented.** Screens adopt the system progressively; see [Roadmap](#roadmap).

- Tokens: [`src/theme.ts`](../../src/theme.ts)
- Primitives: [`src/components/ui.tsx`](../../src/components/ui.tsx)
- Composites: [`src/components/system.tsx`](../../src/components/system.tsx)
- Live reference (development builds): **You → Design system (development only)** (`app/design-system.tsx`)

## Tokens

### Color (dark first; light keeps parity)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `bg` | `#0A0B0D` | `#F2F3F5` | App background |
| `surface` | `#141619` | `#FFFFFF` | Cards, grouped sections (tonal, no border) |
| `surfaceRaised` | `#1E2125` | `#E9ECF0` | Inputs, secondary buttons, pressed rows |
| `selected` | `#33373E` | `#FFFFFF` | Selected segment |
| `hairline` | `#2A2E34` | `#D5DAE1` | Row separators, sheet grabber |
| `text` / `text2` / `text3` | `#F4F2EE` / `#A4A9B0` / `#6E747C` | `#111418` / `#4E5864` / `#6B7480` | Primary / secondary / tertiary text |
| `ember` | `#F46B35` | `#B83215` | **Only** the screen's primary action, selection indicators, live progress |
| `success` / `error` / `warning` | `#43B88C` / `#EE7A75` / `#E5AE58` | `#19724F` / `#A52C32` / `#8A5A00` | Completed sets / destructive / caution |

Contrast is enforced by `tests/design-tokens.test.ts` for both palettes:

- Text, secondary text and error text reach at least 4.5:1 on every surface.
- Tertiary text and ember reach at least 3:1. Tertiary text is for non-essential content only; placeholders use `text2`.
- The primary button label and the selected segment and chip reach at least 4.5:1.

Earlier color names (`background`, `elevated`, `muted`, `accent`, `border`, …) are aliases of these tokens. Existing screens therefore use the new palette without code changes.

### Typography (system font)

| Role | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 28 / 32 compact · 32 / 36 standard · 34 / 40 large | 800 | −0.5 | The screen title (one per screen) |
| `title` | 22 / 27 | 700 | −0.2 | Section and sheet titles, card heroes |
| `headline` | 17 / 22 | 600 | 0 | Row titles, exercise names |
| `body` | 15 / 21 | 400 | 0 | Supporting text (one line where possible) |
| `caption` | 13 / 17 | 500 | 0 | Meta lines, units, field labels |
| `overline` | 11 / 14 | 700 | +1.6, uppercase | Section labels and screen context, echoing the splash |
| `metricXL` | 40 / 44 compact · 44 / 48 otherwise | 700, tabular | −1 | Timers, hero numbers |
| `metric` | 22 / 26 | 600, tabular | −0.3 | Weights, reps, stats |

`Txt` renders a role (`<Txt variant="metric">`). The earlier `Label` snaps arbitrary sizes onto these roles (≤11 overline, ≤13 caption, ≤16 body, ≤19 headline, ≤24 title, larger display). This replaces the 17 sizes in use before. Numeric inputs use tabular figures.

#### Responsive and accessible text

- **Size classes** (`sizeClass` in `src/theme.ts`) follow iPhone logical widths:
  - **compact:** under 390 pt (iPhone SE, 12/13 mini);
  - **standard:** 390–427 pt (iPhone 13–17, Pro);
  - **large:** 428 pt and wider (Plus, Pro Max).
- **Only `display` and `metricXL` respond to the size class.** Every other role is the same on all devices.
- **Screen titles** fit within two lines. On tight widths they shrink slightly (to 80% at most) instead of clipping.
- **Dynamic Type** scales all text. Growth is capped only for `display` (1.3×), `metricXL` (1.2×), `title` and `metric` (1.5×), so headings and hero numbers stay on screen. Body, caption, headline and overline text scale without a cap.
- **Uppercase is visual only.** Overline text keeps its source spelling for screen readers. All-caps source strings ("NEXT SESSION") are spoken in sentence case ("Next session"). A `Stat` is read as one element, for example "12 Working sets".

### Space, shape, size, elevation

- **Spacing:** a 4 pt grid. Screen margin `20`, section gap `32`, group gap `12`, row padding `16`.
- **Radii:** control `12`, card `16`, sheet `24`, pill.
- **Minimum heights:** primary `54`, control `48`, compact and text `44`, row `56` (`64` with a subtitle). Every tap target is at least 44 pt.
- **Elevation is tonal.** Only sheets and menus float (`elevation.floating`) above a scrim. No borders on surfaces.

## Components

| Component | Where | Notes |
| --- | --- | --- |
| `Screen` | ui | 20 pt margins, safe areas, keyboard avoidance and interactive dismissal. Overline context plus a `display` title (announced as a header) |
| `Txt`, `Label` | ui | Role-based text; `Label` is legacy-compatible |
| `Button` | ui | `variant`: `primary` (flat ember, one per screen), `secondary` (tonal), `text`, `destructive`. Legacy `secondary` and `danger` props still work |
| `TextButton`, `IconButton` | ui | Low-emphasis inline actions; icon actions always carry a spoken label and a 44 pt target. `filled` gives a circular tonal background |
| `Card` | ui | Tonal surface; `compact` for dense content, `raised` inside other surfaces |
| `Field`, `NumberField` | ui | Tonal input, ember focus ring, error text; tabular numerals for numbers |
| `Chips` / `FilterChips` | ui | Pills with inverted selection (text-coloured pill). `FilterChips` bleeds to the screen edge; pass `bleed` inside cards |
| `SegmentedControl` | ui | 2–5 exclusive options, exposed as tabs with selection state |
| `Choices` | ui | Descriptive radio options (onboarding, profile) |
| `Stat`, `ProgressBar`, `Empty` | ui | Tabular stat; 6 pt ember bar; quiet empty state |
| `Sheet`, `SheetHeader` | ui | Grabber, `title` heading, circular × labelled "Close", scrollable body, optional pinned `footer` for the sheet's single action. The ×, Android back and the VoiceOver escape gesture close it. **Tapping the backdrop closes only sheets that pass `dismissOnBackdrop`.** Use it for information and action lists. Never use it for sheets holding form input or confirmations, so a stray tap cannot discard work. **Pass `unsaved` while a form holds changes.** Every close path then asks "Discard changes?" ("Keep editing" / "Discard"). Saving hides the sheet directly, so it never prompts. Sheets have no swipe-to-dismiss gesture |
| `ListRow`, `ListSection` | system | Grouped rows (title, subtitle, value, icon, chevron, destructive) on one surface with hairlines. They replace navigation buttons |
| `OverflowMenu` | system | "•••" opens an action list: non-destructive first, destructive last in red, disabled states, and Cancel. The chosen action runs **once, after the menu has closed**, so it can open a sheet, a confirmation or a screen. On iOS it waits for the menu's dismissal event (with a 700 ms fallback) because iOS cannot present a new modal while one is still closing. Repeat taps and re-opening while an action is pending are ignored |
| `InfoButton`, `InfoSheet` | system | Educational and methodology text one tap away instead of inline paragraphs. Information sheets close on a backdrop tap |

## Usage rules

1. **One ember fill per screen:** the dominant action. Everything else is tonal or text.
2. **Navigation is a `ListRow`, not a button.** Infrequent actions go in an `OverflowMenu`. Critical logging actions stay visible.
3. **At most one supporting line per block.** Explanations go behind `InfoButton`, and nothing is deleted.
4. **Headings are factual labels** ("Progress", "This week"), not slogans. FORGE branding comes from type, color and the overline rhythm.
5. **Numbers use `metric`/`metricXL`** (tabular).
6. **Swipes and long-presses may supplement visible actions,** never replace them.
7. **Every control has a spoken label** and a target of at least 44 pt. Dynamic Type scales text within the limits above.
8. **Ember is for primary actions, selected progress and meaningful emphasis.** Selected filter chips are white pills with dark text.

## Phase 1 changes to existing screens

Foundations only; no screen was restructured.

- **All screens:** the new palette, type scale, tonal surfaces without borders, button variants, field focus states and the v2 sheet header come through the shared components. Screen titles are responsive.
- **Progress, Forge Paths and Explore:** the chip rows that sat directly on the screen became `FilterChips`, so they run edge to edge instead of clipping at the margin. The chip rows inside Progress cards bleed to the card edge, and Explore uses the standard 20 pt margin.
- **Existing Path (LegacyPath):** "Manage your Path" and "Workout options" are action lists, so they close on a backdrop tap. Their pause, resume and skip actions still ask for confirmation. "Reschedule session" holds input, so it does not close on a backdrop tap.
- **Forms never lose input silently.** Only × or back closes the template editor, journal entry, preferences and Reschedule sheets, and once they hold changes, closing asks "Discard changes?" first.
  - Template editor: compares against its opening state, so reverting an edit leaves nothing to discard.
  - Journal entry: asks after any edit.
  - Preferences: uses the form's own change tracking.
  - Reschedule: asks when the date has changed.
  - Exercise picker: no prompt; its search box is navigation, not work.
  - Workout screen: no prompt needed. The name, notes and sets save as you type, and the full-screen workout can't be swiped away. Android back leaves the workout active and resumable.
- **You:** a development-only "Design system" entry opens the live reference.

## Device QA plan

Automated tests cover tokens, contrast, responsive roles, sheet dismissal and the menu's ordering and single-run behavior. The following needs physical devices (Expo Go). The **Device QA** section of the design-system reference shows the viewport, size class and text-size multiplier, plus a "Menu chaining" test menu with a run counter.

| Device class | Example | Check |
| --- | --- | --- |
| Compact | iPhone SE (3rd gen), 13 mini | Screen titles fit on two lines or fewer; chip rows scroll; sheets fit with the keyboard open; tab bar labels |
| Standard | iPhone 15/16/17 | Baseline review of every screen in dark and light |
| Large | iPhone 16/17 Pro Max | Title scale (34 pt) and line lengths look intentional |

On each device:

1. **Menu chaining.** Each action opens its sheet, confirmation or screen exactly once, and the run counter increases by one per action. Fast double taps run nothing extra.
2. **Sheets.** Information sheets close on a backdrop tap. The input sheets ("Open sheet", Reschedule) do not, and their text survives a backdrop tap. After typing, ×, Android back and the VoiceOver escape gesture each ask "Discard changes?". "Keep editing" keeps the text.
   - Also check Workout options → Move: the actions sheet closes and Reschedule opens immediately. This flow predates Phase 1; if Reschedule fails to appear on iOS, it moves to `OverflowMenu` chaining in Phase 4.
3. **Keyboard.** Fields stay visible above the keyboard in screens and sheets, and dragging the content dismisses the keyboard.
4. **Safe areas.** Content clears the notch or Dynamic Island and the home indicator. Sheet footers sit above the home indicator.
5. **Text size.** At Settings → Accessibility → Larger Text, check the default size, the largest standard size and AX3. Body text grows, titles stay on screen, and nothing clips.
6. **VoiceOver.** Overlines and stats read naturally ("Next session", "12 Working sets"); headers are announced; the escape gesture (two-finger Z) closes sheets.
7. **Light mode.** Set You → Edit profile & preferences → Appearance to Light. Contrast is verified automatically, but review surfaces, chips and sheets visually.
8. **Landscape.** The app is portrait-only (`app.json`), so landscape needs no check.

## Phase 2 — Workout logging (prepared, not started)

Goals: set rows reachable without scrolling past guidance; compact targets; inline RIR for curated programs; simple weight/rep entry; clear completion; persistent, unobtrusive rest timing; one clear finish control.

```
Header (sticky):  ‹  Upper A               32:14     •••    Finish
Exercise block:   Barbell Bench Press                        •••
                  3 × 6–8 · RIR 2–3 · 3–5 min        (program note: 1 line, tap to expand)
                  [ Next 62.5 kg · Apply ]  (i)       (only when advice exists; reason in info sheet)
                  SET  PREV     KG      REPS   RIR   ✓
                  1    60×8   [62.5]   [ 8 ]  [ 2 ]  ◯
                  + Add set                 Set details ›   (RPE, type, side, tempo, notes, rest)
Footer:           + Add exercise (end of list)
Rest pill:        ⏱ 2:14   +30   ✕   (floating above the safe area while resting)
```

| Area | Plan | Reuses |
| --- | --- | --- |
| **Header** | Back, truncated name, tabular session clock, `OverflowMenu` and a Finish text button that keeps the current confirmation | `IconButton`, `OverflowMenu`, `Txt metric` |
| **Overflows** | **Workout:** rename, notes, pause/resume, save as template, discard. **Exercise:** move, substitute, superset group, exercise rest, notes, progression info, remove | `OverflowMenu`, `Sheet`, `InfoButton` |
| **Set rows** | Previous values as ghost text; weight and reps inputs; an **inline RIR cell** for program workouts (program progression requires logged effort); completion check with haptic. **Set details** stays an explicit visible control for RPE, set type, side, tempo, notes and rest | `NumberField` (compact), `IconButton`, `Sheet` |
| **Rest timer** | A floating pill (start, +30, skip). Default rest goes in the workout overflow | `Txt metricXL` |

Constraints: progression calculations, prescriptions, scheduling, history and backups are unchanged. Every existing workout feature stays reachable, and accessibility labels used by tests are preserved or updated alongside the tests.

## Roadmap

| Phase | Scope |
| --- | --- |
| 1 · Foundations | **Done:** tokens, primitives, composites, reference screen, tests |
| 2 · Workout logging | See above |
| 3 · Today, Train, navigation | Four tabs (Today, Train, Progress, You); Explore inside Train; Today prioritizes the next scheduled workout; History screen |
| 4 · Forge Paths | Library, program details (unique sessions, phase timeline, persistent enrollment action), dashboard, existing Path |
| 5 · Progress, You, secondary screens | Grouped settings, info sheets for methodology and privacy, Templates, Journal, Account, Exercise |
| 6 · Onboarding visuals and polish | Motion, haptics, light-theme parity, Dynamic Type and VoiceOver, device QA (compact, standard and large iPhones, keyboard, safe areas, landscape where supported) |
