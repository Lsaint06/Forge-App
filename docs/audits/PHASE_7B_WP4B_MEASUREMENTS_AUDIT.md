# FORGE — Phase 7B WP4B: Measurements Audit and Plan

**Status: approved (2026-10-24); implemented and verified on the Android emulator; awaiting founder iPhone review. Not committed.**

Audit date: 2026-10-24 (Pacific). Baseline: `5f45b8479e02b429c66c261a71dff5fc5147cf2c` on
`feat/forge-paths-foundation`, identical to `origin`, working tree clean. WP4A (`35972ed`) and
WP4A.1 (`5f45b84`) are committed and pushed. Their iPhone reviews remain outstanding (see
[WP4A](PHASE_7B_WP4A_NUTRITION_AUDIT.md) and [WP4A.1](PHASE_7B_WP4A1_FOOD_LIBRARY_PLAN.md));
no open WP4A/WP4A.1 defects were found while auditing. The founder approved keeping all 3,730
library foods (the WP4A.1 plan still lists the count as awaiting review; record that approval
when WP4A.1 docs are next touched).

Evidence labels: **[Code]** read at the baseline · **[Device]** reproduced on the Android
emulator (Expo Go 58) · **[DB]** read from the device database · **[Calc]** computed with the
app's own functions · **Proposed** design, not existing behaviour.

---

## 1. Current architecture and data flow

Measurements have no screen of their own. `/journal?kind=measurement` renders `LegacyJournal`
in [Journal.tsx](../../src/screens/Journal.tsx), the same generic form-and-card screen that
still serves Recovery and Goals (Nutrition and Saved foods were delegated to their own screens
in WP4A). **[Code]**

```text
Entry points                        Storage                         Readers
You → Health & body ─┐                                              ┌─ Measurements list (Journal.tsx)
Progress → More ─────┼─► LegacyJournal ─► repository.addJournal ──► │  journal table, kind=measurement
                     │    (form → canonicalMeasurement)  /update/   ├─ Progress → Body chart (Progress.tsx)
                     │                                   delete     ├─ Goals: bodyweight metric (Journal.tsx)
                     │                                              │   latestBodyweight / bodyweightGoal
                     │                                              ├─ Goals: new-goal "start" prefill
                     │                                              ├─ Backup export/import (generic)
                     │                                              └─ Cloud sync outbox (generic)
Profile (onboarding, You → Edit profile): weight, height, bodyFat — separate; read by no calculation
```

| Layer | What it does | Source |
| --- | --- | --- |
| Write | `canonicalMeasurement(value, unit)`: lb → kg, in → cm; kg/cm/percent unchanged; rejects non-finite/negative and unknown units. | [metrics.ts](../../src/domain/metrics.ts) |
| Validate | `validateJournal("measurement")`: `name` non-empty; `value` 0.01–10,000; `unit` ∈ kg/cm/percent; percent ≤ 100; a bodyweight-named entry must be kg. | [validation.ts](../../src/domain/validation.ts) |
| Persist | `journal` row: `id`, `kind`, `date` (local `YYYY-MM-DD`), `data` JSON, `created_at`, `updated_at`; transaction + sync outbox. `updateJournal` replaces `data` wholesale. Read order: `date DESC, created_at DESC`. | [repository.ts](../../src/data/repository.ts) |
| Display | `displayMeasurement(value, unit, profile.units)`: when units = lb, kg → lb **and cm → in**. One preference drives mass and length. | [metrics.ts](../../src/domain/metrics.ts) |
| Trend | `measurementTrend(entries, name)`: exact name match, numeric values, sorted by date (same-day entries all kept). | [analytics.ts](../../src/domain/analytics.ts) |
| Bodyweight | `isBodyweightName` (`/^body\s*weight$/i`); `latestBodyweight` = first matching entry in read order (kg); `bodyweightGoal` never reports progress without a weight. | [validation.ts](../../src/domain/validation.ts), [analytics.ts](../../src/domain/analytics.ts) |

**Do measurements drive anything?** **[Code]**
- **Progress → Body**: a line chart per measurement name. Display only.
- **Goals (bodyweight metric)**: current value and progress ratio from `latestBodyweight`; a
  new goal's "Starting value" is prefilled from it.
- **No** workout programming, progression, prescriptions, recommendations, readiness, nutrition
  targets or Today content reads measurements or profile weight.

## 2. Existing measurement fields and types

| Field | Stored as | Rules | Written by current UI |
| --- | --- | --- | --- |
| `name` | free text | required, trimmed non-empty | Prefilled "Bodyweight"; any text |
| `value` | number, canonical unit | 0.01–10,000; ≤ 100 when percent | Typed |
| `unit` | `"kg"` \| `"cm"` \| `"percent"` | bodyweight names must be `kg` | Chips kg / lb / cm / in / percent (lb/in converted) |
| `notes` | text | optional | Typed (saved as `""` when empty) |
| any other key | string/number/boolean | allowed by schema | Re-saved **as a string** on edit (legacy coercion) |

- **Types**: there is no type list. A "type" is whatever name was typed. Units are not tied to
  names, so "Waist" may legally hold cm on one day and percent on another. **[Code]**
- **Profile** (not journal): `weight` (kg), `height` (cm), `bodyFat` (%) are set in onboarding
  and You → Edit profile. Nothing reads them except those forms. **[Code]**
- **Real data shapes**: the legacy fixture holds `{name:"Bodyweight", value:82.4, unit:"kg"}`;
  user data can contain "Body weight", lower-case or custom names, notes, and multiple entries
  per day. All must stay readable and unchanged.

**Existing tests touching measurements**: conversions ([domain.test.ts](../../tests/domain.test.ts));
bodyweight spellings, latest weight and goal progress ([data-safety.test.ts](../../tests/data-safety.test.ts));
`measurementTrend` ordering ([analytics.test.ts](../../tests/analytics.test.ts)); percent and
bodyweight-unit rejection ([repository.test.ts](../../tests/repository.test.ts)); sync round
trips and conflicts ([sync.test.ts](../../tests/sync.test.ts)); unsaved-changes prompt
([unsaved-input.test.tsx](../../tests/ui/unsaved-input.test.tsx)); bodyweight goal UI
([data-safety.test.tsx](../../tests/ui/data-safety.test.tsx)); navigation rows
([you.test.tsx](../../tests/ui/you.test.tsx), [progress.test.tsx](../../tests/ui/progress.test.tsx)).

**Gaps**: no UI test of the Measurements list, add, edit, delete, pound display, edit
round-trip precision, the Progress Body chart, same-day entries or mixed-unit names.

## 3. Usability and correctness problems

| # | Problem | Evidence | Severity |
| --- | --- | --- | --- |
| M-01 | **Pound users get kg by default.** New entries start with the `kg` chip whatever the profile says; typing "180" for a pound user saves 180 kg. | [Code] `config.measurement` initial unit `"kg"`; [Device] `standard-add-0.png` | **P1** (silent wrong data) |
| M-02 | **Raw developer errors.** Over-100 % and a typed non-ISO date show Zod JSON; a bodyweight in cm shows "must be stored in kilograms; imperial entries are converted…"; an empty value says "use zero when appropriate" though zero is invalid. | [Device] `sheet-invalid.png`, `standard-invalid-empty.png` | P1 |
| M-03 | **Comma decimals rejected.** "81,5" → "Invalid measurement: Error: Measurement must be finite…". WP4A fixed this for numbers elsewhere; the journal form uses `Number()`. | [Device] `standard-invalid-comma.png` | P1 for comma regions |
| M-04 | **Untouched edits change stored values for pound users.** Edit shows 4 decimals, saving converts back: 82.4 kg → 181.6609 lb → **82.399998 kg**; 84 cm → 84.000086 cm; `updatedAt` bumps and the record is queued for sync. Not cumulative after the first save. | [Calc] `displayMeasurement`/`canonicalMeasurement`; [Device] `light-lb-edit.png` ("32.874 in") | P2 (data integrity) |
| M-05 | **Free-text names split series.** "Body weight" (83.1) is a separate chip and is missing from the "Bodyweight" chart, though Goals count it. | [Device] `standard-several-*.png`, `standard-progress-several-bw.png` | P1 |
| M-06 | **No overview.** No latest value, no change, no trend on the screen; one card per record (≈ 145 dp) with two buttons and an ISO date. ~4 records per standard screen, **1** at 130 % text on SE; a year of weigh-ins is ~200 cards. | [Device] `standard-long-*.png`, `se130-several-0.png` | P1 |
| M-07 | **Save hidden by the keyboard** and partly cut off at 130 % on SE before typing; the date is typed as `YYYY-MM-DD`. | [Device] `standard-add-keyboard.png`, `se130-add-*.png` | P1 |
| M-08 | **Progress Body chart shows a stale value after switching series.** The selected index carries over: switching Waist → Bodyweight shows "88.3 kg · Wed, Nov 19" instead of the latest (long history), "82.4 kg · Oct 10" instead of 81.7 kg (several). | [Device] `sheet-progress2.png`; [Code] `useSelection(points.length)` keeps `at` | P1 (misleading) |
| M-09 | **Chart spacing ignores time.** Points are evenly spaced, so a 40-day gap looks like one interval and two same-day entries look like a sudden jump; duplicate same-day dates also give duplicate React keys. No time range: all history. | [Code] `LineChart` x = index; [Device] `standard-progress-long-bw.png` | P2 |
| M-10 | **Body chart defaults to the newest name**, not bodyweight (opens on Waist). | [Device] `standard-progress-long-chips.png` | P3 |
| M-11 | **Mixed units under one name** would be charted with the newest entry's unit label. | [Code] `Body()` unit lookup | P3 (no evidence in data) |
| M-12 | Legacy pattern: "PROGRESS / MEASUREMENT" eyebrow even from You, full-width Back button, "Measure your change." headline, "17.9 percent", unit-conversion paragraph shown permanently. | [Device] all `p15` list shots | P2 |
| M-13 | Delete copy "This removes this recorded entry." gives no name, value or date. | [Device] `light-lb-delete.png` | P3 |
| M-14 | Legacy edit coerces unknown keys to strings and rewrites `notes: ""`. | [Code] `open()`/`payload()` | P3 |
| M-15 | Goals show bodyweight in kg for pound users ("81.8 kg now · target 80 kg"). **WP4D scope**, noted for consistency. | [Code] `goalStatus` | P2 (WP4D) |

## 4. Emulator findings

Android emulator, Expo Go 58, harness `forge-visual-harness` (`seed15.ts`, `p15.ps1`).
Screenshots (53) in `forge-visual-harness\shots\android\p15\`; contact sheets
`sheet-states.png`, `sheet-flows.png`, `sheet-invalid.png`, `sheet-sizes.png`,
`sheet-progress.png`, `sheet-progress2.png`.

| State / interaction | Sizes and modes | Result |
| --- | --- | --- |
| Empty | standard, SE, large | "No entries yet" card under Back, Add and a units paragraph; nothing explains what to measure. |
| One / several / filter | standard, SE, large, SE 130 % | One card per record; chips overflow horizontally ("Bo…" cut at 130 %); "Body weight" separate. |
| Long history (≈ 200 entries, a 40-day gap, same-day pairs) | standard | Endless cards; no grouping, no summary. |
| Add | standard, SE 130 % | 5 stacked fields; Save hidden under the keyboard; date typed; unit defaults to kg. |
| Validation | standard | Raw JSON (percent, date); developer text (bodyweight unit); comma rejected; empty value message misleading. |
| Edit (light, pounds) | standard | Converted value shown with 4 decimals; unit chip switches to "in"/"lb". |
| Delete | standard light | Native confirm; generic copy. |
| Progress → Body | standard | Defaults to newest name; stale headline after switching chips; evenly spaced points. |
| Returning from another screen | standard | List re-reads the repository on render; no stale data observed. |

Database checks: seeded records read back unchanged; edit precision was reproduced with the
app's conversion functions [Calc] rather than by saving on the device, to keep fixtures clean.

## 5. Data contracts and preservation requirements

**Must not change** (no migration, no rewrite):

1. Journal row shape, IDs, `kind: "measurement"`, local `date`, `createdAt`, `updatedAt`.
2. Canonical storage: kg, cm, percent; `canonicalMeasurement`, `displayMeasurement`,
   `validateJournal` rules and bounds; backup format (v1) and sync protocol.
3. Existing names, including variants and custom names; existing notes and unknown keys,
   **with their types**.
4. `isBodyweightName`, `latestBodyweight` (read order = date, then creation time) and
   `bodyweightGoal` semantics, which Goals depend on.
5. Profile `weight`, `height`, `bodyFat` remain independent of journal entries.

**New rules (Proposed)**:

- **Write only what changed.** Edits merge changed fields into the original (the WP4A
  `mergeEntry` pattern). An unchanged value is never re-converted (fixes M-04); a changed
  value is converted once from what was typed.
- **Group for display, never rename.** Series are grouped by a normalized key (trim, case,
  whitespace; any bodyweight spelling → bodyweight). Stored names stay exactly as typed.
- **One unit family per series.** New entries for a known type always use that type's unit
  family; legacy series with mixed families are shown as separate series by unit, never
  combined.
- **Typed numbers** use the shared comma-tolerant `parseNumber` (WP4A D4).

Flagged: any proposal to rename stored names, merge series in storage, or sync profile weight
would change stored meaning and is **not** proposed.

## 6. Proposed premium screen layout

**Route**: keep `/journal?kind=measurement` (You, Progress and older builds link to it);
`JournalScreen` delegates to a new `Measurements` screen, as WP4A did for Nutrition. No tab.

```text
‹  Measurements                                          (header back, plain title)

┌ BODYWEIGHT ────────────────────────────────────────┐
│ 81.7 kg                              Today         │   latest entry (newest date/time)
│ −0.3 kg since Oct 23 · −2.5 kg in 8 weeks          │   only comparisons with real entries
│ [1M] [3M] [6M] [1Y] [All]                          │
│  ·──·─·────·──·───·      (time-scaled line)        │
│ Low 81.7 kg              High 84.2 kg              │
│                                     [+ Log weight] │   secondary, opens sheet on Bodyweight
└────────────────────────────────────────────────────┘

MEASUREMENTS                                          (one row per tracked series)
  Waist                     83.5 cm   −1.0 cm · 4 wk ›
  Chest                     104 cm    1 entry       ›
  Right arm (flexed)        38.2 cm   1 entry       ›
  Body fat                  17.9 %    −0.6 % · 5 wk ›

HISTORY                                               (grouped by day, newest first)
  Today
    Bodyweight              81.7 kg              ⋯
    Waist                   83.5 cm              ⋯
  Fri, Oct 23
    Bodyweight              82.0 kg              ⋯
  Show earlier (n)                                    (paged, 30 rows)

                [ + Log measurement ]                 (single primary footer action)
```

- **Empty state**: "Track how your body changes. Start with your weight; add other
  measurements whenever you take them." with the footer action. No placeholder values.
- **First entry**: the Bodyweight card shows the value and date with "Log another weigh-in to
  see change"; no chart until two days have entries.
- **No bodyweight but other series**: the overview leads with the most recently updated
  series; bodyweight appears as a row with "Not logged".
- **Series detail** (tap a row): same card for that series (range, chart) plus that series'
  history with edit/delete. Uses the screen route with a `series` param (no new tab).
- Values: 1 decimal for kg/lb/cm/in/% (stored precision kept); signed change with "since"
  wording; neutral colour for every change (never green for lower, red for higher).

## 7. Logging and editing workflows

**Log sheet (Proposed)** — one sheet, Save in the footer above the keyboard:

1. **What**: a segmented/list picker with the type preset (Bodyweight first and default from
   the footer action; the tapped series from a row). Types: Bodyweight, Body fat %, Waist,
   Hips, Chest, Shoulders, Neck, Arm (left/right), Forearm, Thigh (left/right), Calf, and
   **Custom** (name + unit family: length, mass or percent). Existing custom names appear as
   choices. *(Whether this list is approved for WP4B: decision D2.)*
2. **Value**: number field with the type's unit in the label (kg/lb or cm/in from the
   profile; % for body fat), focused on open, comma or point, steppers (0.1).
3. **Day**: "Today ›" opening the WP4A `DateSheet` with `range="past"`. Time of day is not
   stored (unchanged contract).
4. **Notes** (optional, collapsed behind "Add note").
5. **Save** → returns to the screen with "Saved · Undo" (WP4A banner pattern); a double tap
   saves once. **Save & add another** keeps the sheet open on the same day for a quick
   multi-measurement session.

Tap count: log today's weight = 3 taps + typing (Log weight, type, Save). Log five tape
measurements in one session ≈ 2 taps per measurement with "Save & add another".

**Edit**: tap a history row → same sheet prefilled in display units at 1–2 decimals; changing
the type is allowed only within the same unit family; only changed fields are written;
unknown keys and types preserved. **Delete**: ⋯ → Delete → confirm naming the value and day
("Delete Bodyweight 81.7 kg from Today?"), consistent with WP4A D8.

**Validation copy (Proposed)**: inline under the field — "Enter a number, e.g. 81.5";
"Body fat must be between 0.1 and 100 %"; plausibility hints (decision D6), e.g. bodyweight
outside 25–350 kg or a value differing from the previous entry by > 15 %: "That's 12 kg less
than your last weigh-in. Save anyway?" — never blocking a valid value.

## 8. Weight and unit handling

| Question | Finding | Recommendation |
| --- | --- | --- |
| Profile weight vs journal | Separate. Profile `weight` set in onboarding/You; journal bodyweight logged in Measurements. Neither updates the other; nothing reads profile weight. | **Keep separate in WP4B (D4 option A).** Optional B: when no bodyweight entry exists, offer a one-time "Add your starting weight (82 kg) as your first weigh-in?" that creates an entry dated today only on confirmation. Not recommended: two-way sync. |
| Goals | Read journal bodyweight only (`latestBodyweight`). | Overview uses the same function, so Measurements and Goals always agree. |
| Multiple weigh-ins per day | Allowed; all listed; latest = last created. | Keep. History lists all; overview and change use the **latest entry of each day**; chart plots one point per day (latest; D5). |
| Corrections | Edit replaces fields; date can change. | Only changed fields written; editing the date re-sorts history. |
| Comparisons | None today. | "Since <previous day with an entry>"; period change = latest vs the newest entry **on or before** the period start, only if one exists within the range; otherwise not shown. |
| Units | One `units` preference: lb also switches cm → in. | Keep for WP4B (no new profile field). A separate length preference is optional (D7) and would add a profile key. |
| Display precision | List 2 decimals, edit 4 decimals. | Display 1 decimal; edit shows up to 2; stored values never rounded. |
| Drift | Untouched edit re-converts (M-04). | Fixed by write-only-changed; tests assert byte-identical records after open-and-save. |
| Missing unit metadata | Validation requires a unit, so every stored entry has one; backups are validated on import. | Defensive display: an entry without a valid unit is listed as-is ("82.4") and excluded from charts and comparisons, never guessed. |
| Pound default | Wrong (M-01). | Unit comes from the type and profile; no unit chips for preset types. |

## 9. Trend and chart specification

- **Component**: reuse `LineChart` ([charts.tsx](../../src/components/charts.tsx)) with
  **additive** props: optional `x` (day number) for time-scaled spacing, `initial` selection,
  and a `resetKey` that resets selection when the series changes. Defaults keep current
  behaviour for Exercise and Progress callers.
- **Ranges**: 1M, 3M, 6M, 1Y, All; default 3M when it holds ≥ 2 days, else All. Points outside
  the range are not drawn; the change line uses the same range.
- **Scale**: keep the existing ≥ 10 %-of-value vertical span (small changes never look
  dramatic); x proportional to date; labels "Low … · High …" and first/last dates.
- **States**: 0 entries → no chart; 1 day → value and date, "Log another to see change";
  ≥ 2 days → line. Gaps longer than 30 days break the line (two segments) — no interpolation.
- **Same day**: one point per day (latest, D5); the selected point's caption says "2 entries"
  when more than one exists.
- **Selection**: starts on the latest point; resets on range or series change (fixes M-08 on
  this screen). Accessibility: adjustable control, value "81.7 kg, Today", swipe to move;
  a text summary for screen readers ("Bodyweight: 81.7 kg today, down 2.5 kg over 8 weeks").
- **Performance**: ≤ 400 points drawn (one per day per range); dots hidden above 40 points
  (existing rule); series computed with `useMemo` on repository revision.
- **No judgment**: no goal colouring, no "good/bad", no projections.

## 10. Integration points

| Area | WP4B change | Notes |
| --- | --- | --- |
| You → Health & body | None (same route) | Row could show "81.7 kg · Today" subtitle (optional, low risk). |
| Progress → More | None (same route) | — |
| Progress → Body card | **Decision D8**: fix M-08/M-09/M-10 by passing the new `LineChart` props and defaulting to bodyweight, plus "See all ›" to Measurements. WP4 originally listed "Progress body section" as must-not-change, so this needs approval. | Otherwise leave Progress untouched and fix later. |
| Goals | None | WP4D owns M-15 and goal entry; Measurements must keep `latestBodyweight` semantics. |
| Backup / sync | None | Records unchanged; tests confirm round trips. |
| Preferences | Reads `units` only | Optional D7. |
| Design System 2.0 | `Screen` with back, `ListSection`/`ListRow`, `OverflowMenu`, `Sheet` footer, `DateSheet range="past"`, `NumberControl`/`parseNumber`, WP4A Undo banner | `DaySwitcher` is not used: Measurements is a timeline, not a day view. |

## 11. Implementation file scope (Proposed)

**New**: `src/screens/Measurements.tsx`; `src/components/measurements/MeasurementSheet.tsx`,
`SeriesCard.tsx`; `src/domain/measurements.ts` (type catalog, normalized series grouping, daily
series, ranges, change comparisons, display formatting, changed-field merge);
`tests/measurements.test.ts`; `tests/ui/measurements.test.tsx`.

**Modified (additive)**: `src/screens/Journal.tsx` (delegate `kind=measurement`; nothing else);
`src/components/charts.tsx` (optional `x`, `initial`, `resetKey`); docs (README,
IMPLEMENTATION_STATUS, IPHONE_TESTING, this audit, 7A progress). **If D8 approved**:
`src/screens/Progress.tsx` Body card only.

**Not touched**: repository, schema, validation, `metrics.ts` conversions, `analytics.ts`
bodyweight functions, backup, sync, Goals/Recovery (legacy journal stays for them), Nutrition,
food library, workouts, templates, programs and locks, onboarding, splash, navigation.

## 12. Test and regression plan

**Automated — logic (`tests/measurements.test.ts`)**

- Series grouping: "Bodyweight", "Body weight", " BODYWEIGHT " → one series; "Waist" and
  "waist " → one; stored names unchanged; mixed unit families → separate series.
- Daily series: latest per day; same-day ordering by `createdAt`; ranges; gap > 30 days
  splits segments; no interpolation; never zero-filled.
- Comparisons: since previous day; period change only with an entry on/before the period
  start; none with one entry; signs and rounding.
- Units: kg↔lb, cm↔in display at 1 decimal; typed value converts once; comma "81,5" → 81.5;
  invalid ("1,2,3", empty, 0, negative, > 100 %) rejected with friendly messages.
- Edit merge: unchanged value → byte-identical `data`; changed value → one conversion;
  unknown keys keep types; notes untouched when not edited.
- Overview latest equals `latestBodyweight`; Goals unaffected.

**Automated — UI (`tests/ui/measurements.test.tsx`)**: empty state; first entry; log weight
in kg and in lb (stored kg); Save & add another; past-day logging via calendar; keyboard
footer Save reachable; double tap saves once; Undo; edit without change writes nothing; edit
change; delete confirm with value/day; series detail; range switching resets selection;
legacy names and custom names displayed; nested-sheet structure (WP3 iOS rule).

**Automated — regression**: backup export/import and sync round trips of legacy and new
records; unsaved-changes prompt (existing test updated to the new screen's labels); You and
Progress navigation; full existing suites — WP4A Nutrition, WP4A.1 library and
`food-library:check`, WP2 logging, WP3 Templates, comma decimals, data safety, curated-program
locks; typecheck, lint, format, `expo export`, Expo Doctor.

**Android emulator**: compact/standard/large; dark/light; 130 % text; keyboard; empty, one,
several, long (≈ 200), mixed names, pounds; add/edit/delete; validation; series switching;
read records from the device database after each write.

**Founder iPhone**: keyboard with sheet footer; comma keypad; Dynamic Type; VoiceOver on the
chart and rows; date picker over the sheet; logging in pounds; returning from background.

## 13. Risks and unresolved questions

| Risk | Mitigation |
| --- | --- |
| Grouping changes what users see (variants merged on screen) | Display-only, reversible; names never rewritten; tests for every variant. |
| Shared `LineChart` change affects Exercise/Progress | Additive optional props with unchanged defaults; existing UI tests. |
| Same-day aggregation choice hides an entry | History always lists every entry; caption notes "2 entries". |
| Plausibility hints feel judgmental | Neutral copy, never blocking, only on large deviations (D6). |
| Profile weight confusion (two "weights") | Keep separate; optional one-time import (D4-B) with explicit confirmation. |
| Legacy journal still serves Recovery/Goals | Delegation is per kind; WP4C/WP4D replace the rest. |

## 14. Founder decisions requested

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Dedicated Measurements screen at the same route, overview + series rows + grouped history (section 6). | Approve. |
| D2 | Preset type list with Custom (section 7) — new names are **choices**, not new data types. | Approve; existing custom names offered too. |
| D3 | Group series by normalized name for display only (any bodyweight spelling together). | Approve. |
| D4 | Profile weight: A keep separate · B one-time offer to log profile weight as first weigh-in · C two-way sync. | **A** (B optional). |
| D5 | Same-day entries in charts/comparisons: latest of the day · daily average. | Latest of the day. |
| D6 | Non-blocking plausibility hints (large change vs previous, outside human range). | Approve with neutral copy. |
| D7 | Separate length unit preference (cm/in) independent of kg/lb. | Defer (adds a profile key). |
| D8 | Fix Progress → Body chart (stale selection, time spacing, default to bodyweight, "See all"). | Approve as a narrow change; otherwise defer to WP7. |
| D9 | Undo after logging (banner) in addition to delete confirmation. | Approve (WP4A pattern). |
| D10 | "Save & add another" in the log sheet. | Approve. |
| D11 | Defer: reminders, smoothing, comparison tools, export, photos, HealthKit/Health Connect, body-fat estimation, medical interpretation. | Defer. |

### Founder decisions (2026-10-24)

| Topic | Decision | Effect on WP4B |
| --- | --- | --- |
| Profile weight vs weigh-ins (D4) | **Keep separate; offer a one-time option** to log the existing profile weight. Never synchronize silently. | D4 **B**: when no bodyweight entry exists, offer "Log your profile weight (82 kg) as your first weigh-in?". It creates one entry dated today only on explicit confirmation, and is not offered again once dismissed or used. Profile weight is never written from Measurements. |
| Multiple entries on one day (D5) | **Preserve every entry**; charts use the latest entry of the day, with **deterministic tie-breaking**. | History lists every entry. Per-day value = greatest `createdAt`; equal `createdAt` → greatest `updatedAt`; then greatest `id` (string order). The same ordering defines "latest" in the overview. |
| Weight and length units | **Default to the user's preference; keep canonical storage.** | Values display and are entered in kg/cm or lb/in from the existing `units` preference; stored as kg/cm/percent. D7 (separate length preference) is not adopted. |
| Measurement names (D3) | **Group known spelling variations** for display and charts; **never rewrite history**. | Display-only normalized grouping (bodyweight spellings, case and whitespace). Stored names unchanged. |
| Editing records | **Save only changed fields; an untouched Save must not alter the record or trigger sync.** | No-change Save closes the sheet without calling `updateJournal` (no `updatedAt` bump, no outbox entry). Changed fields merge into the original with types preserved. |
| Trend calculations | **Actual measurement dates; no invented intermediate values.** | Time-scaled x axis; no interpolation; gaps over 30 days break the line; comparisons only against real entries. |
| Progress chart bug (D8) | **Approved as a tightly scoped exception.** | Only the Progress → Body card: reset selection to the latest point when the series changes, time-scaled spacing, unique per-day points (D5 rule) and series grouping (D3). Nothing else in Progress changes. Defaulting to bodyweight and a "See all" link are **not** included unless separately approved. |
| Bodyweight goal unit display (M-15) | **Track for WP4D** unless a shared fix is required. | Not changed in WP4B. The audit found no shared fix required: Measurements uses `latestBodyweight` unchanged, and Goals stay as they are. |

**Still awaiting confirmation** (recommendations stand): D1 dedicated screen layout, D2 preset
type list with Custom, D6 non-blocking plausibility hints, D9 Undo after logging, D10 "Save &
add another", D11 deferrals.

### Founder clarifications and approval (2026-10-24, second message)

All recommendations above were **approved** (D1, D2, D6, D9, D10, D11 included), with these
binding rules:

1. **One-time profile weight offer.** Shown only when **no bodyweight measurement exists**
   and the profile holds a **valid weight** (passes the measurement bounds). It creates a
   single entry dated today only after explicit confirmation. Once accepted or dismissed it
   is not offered again automatically (device setting `measurementProfileWeightOffer`).
   Dismissal never blocks manual weight logging.
2. **Same-day tie-breaking.** One comparator everywhere (Measurements overview, charts,
   comparisons and the Progress Body chart): date descending, then `createdAt` descending,
   then `updatedAt` descending, then record `id` descending (string order). All underlying
   records are preserved and listed.
3. **Progress exception, exactly as proposed.** The Body card changes only for: resetting the
   stale selection when the series changes, actual-date spacing, one point per day (latest by
   the comparator), and grouping recognized spelling variants. The default selected series
   and the absence of a "See all" link are unchanged.

Storage, backup and sync compatibility are maintained: no schema, validation, backup or sync
changes; records are written in the existing shape.

### Implementation specification (WP4B)

| Area | Rule |
| --- | --- |
| Route | `/journal?kind=measurement` delegates to `Measurements`; recovery and goals keep the legacy journal. |
| Types | Bodyweight (mass), Body fat (percent), Waist, Hips, Chest, Shoulders, Neck, Left/Right arm, Left/Right forearm, Left/Right thigh, Left/Right calf (length), and Custom (name + family). Existing names are offered as choices. Stored names are written exactly as chosen; presets write their display name. |
| Grouping | Key = trimmed, lower-case, single-spaced name; any `isBodyweightName` spelling → bodyweight. A series also splits by unit family when legacy entries mix families. Display name = the name of the newest entry. |
| Units | Mass kg ↔ lb, length cm ↔ in from `profile.units`; percent unchanged. Typed values convert once to canonical storage. Display 1 decimal; edit fields show up to 2. |
| Parsing | Shared comma-tolerant `parseNumber`; bounds = existing validation (0.01–10,000; percent ≤ 100). Friendly inline errors. |
| Plausibility (D6) | Non-blocking confirmation when bodyweight is outside 25–350 kg, a length outside 5–300 cm, or a value differs from the series' latest by more than 15 %. |
| Edit | Only changed fields are merged into the original (types and unknown keys preserved). No change → no write, no `updatedAt`, no sync. Unit family cannot change on edit. |
| Daily series | One point per day: the latest entry of that day by the comparator. |
| Ranges | 1M, 3M, 6M, 1Y, All; default 3M when it holds ≥ 2 days, otherwise All. |
| Charts | x by actual date; no interpolation; gaps > 30 days are not joined; selection starts on the latest point and resets on series or range change. |
| Comparisons | "Since <previous day>" = latest vs previous day's latest. Range change = latest vs the latest entry on or before the range start, else the earliest entry inside the range when the range is All. Never against invented values. Neutral wording and colour. |
| History | Grouped by day, newest first, every entry listed; ⋯ menu: Edit, Delete (confirmation names value and day). Paged 30 rows. |
| Logging | Sheet: type, value, day (`DateSheet range="past"`), optional note; Save and "Save & add another" in the footer; double-tap safe; "Saved · Undo" banner. |

## 15. Proposed implementation phases

1. **Domain**: `measurements.ts` (catalog, grouping, daily series, comparisons, formatting,
   merge) with logic tests. No UI.
2. **Screen and sheet**: delegate route; overview, series rows, history, log/edit sheet,
   delete, Undo; UI tests.
3. **Charts**: additive `LineChart` props; series card ranges; (D8) Progress Body fix.
4. **Verification**: full suites, emulator review across sizes/modes, device-database checks,
   docs, iPhone checklist; present for founder review.

**Stop point (audit stage)**: the audit only. Implementation followed the founder's approval
below.

## Implementation results (WP4B)

Baseline `5f45b84`; uncommitted for founder review. WP4C not started.

### What changed

| Area | Result |
| --- | --- |
| Route | `/journal?kind=measurement` (and an unknown kind, as before) opens [Measurements.tsx](../../src/screens/Measurements.tsx); recovery and goals keep the legacy journal. |
| Overview | [SeriesCard.tsx](../../src/components/measurements/SeriesCard.tsx): latest bodyweight (or the most recently updated series), day and "2 entries" when several, change since the previous day and over the range, 1M/3M/6M/1Y/All, date-spaced chart. |
| Other measurements | One row per series with latest value and change; opens a detail view (same card + that series' history). |
| History | Grouped by day, every entry, ⋯ Edit/Delete; delete confirmation names value and day; paged 30. |
| Log / edit | [MeasurementSheet.tsx](../../src/components/measurements/MeasurementSheet.tsx): presets + own names + Custom (name and Length/Weight/Percent), value in the lifter's units with comma or point, last value caption, past-day calendar, optional note, Save and Save & add another, double-tap guard, non-blocking "Check this value", Undo banner. |
| Profile weight offer | Shown only without any bodyweight entry and with a valid profile weight; "Log it" creates one entry today; "Not now" or accepting settles it (device setting); manual logging always available; profile untouched. |
| Domain | [measurements.ts](../../src/domain/measurements.ts): type catalog, display grouping, the single comparator, per-day series, ranges, comparisons, formatting, parsing, plausibility, change-only edits, offer rule. |
| Charts | [charts.tsx](../../src/components/charts.tsx) `LineChart`: optional `x` (date spacing), `breakOver` (break gaps > 30 days) and `resetKey` (selection returns to latest); defaults unchanged. |
| Progress → Body | Grouped series, one point per day by the comparator, date spacing, gap breaks, selection reset on series change. Default series (most recently logged) and no "See all": unchanged. |

No change to repository, schema, validation, `metrics.ts` conversions, `latestBodyweight` /
`bodyweightGoal`, backup, sync, Goals, Recovery, Nutrition, the food library, workouts,
templates, programs, onboarding, splash or navigation.

### Problems resolved

M-01 (unit default), M-02 (friendly inline errors), M-03 (comma decimals), M-04 (untouched
edit writes nothing — verified on the device database: records and outbox identical),
M-05 (spelling grouping), M-06 (overview), M-07 (Save above the keyboard; calendar),
M-08 (stale Progress selection), M-09 (date spacing, gaps, unique per-day points),
M-11 (mixed families split), M-12 (Design System 2.0 screen), M-13 (delete copy),
M-14 (types preserved). Still open: M-10 by decision (default series unchanged) and M-15
(WP4D).

### Tests

| Suite | Result |
| --- | --- |
| Logic (`npm test`) | 306 passed (292 before + 14 in [measurements.test.ts](../../tests/measurements.test.ts)) |
| UI (`npm run test:ui`) | 234 passed in 24 suites (223 before + 11 in [measurements.test.tsx](../../tests/ui/measurements.test.tsx)); the unsaved-changes test now targets the new sheet's labels |
| TypeScript, Prettier, `food-library:check` | Pass |
| ESLint | 0 errors; 1 pre-existing warning (`tests/ui/templates-wp3.test.tsx`) |
| `expo export` (iOS, Android) | Pass |
| Expo Doctor | 19/20, unchanged: SDK 58 patch releases newer than installed (expo 58.0.19, expo-file-system 58.0.11, expo-font 58.0.10, expo-router 58.0.26, expo-sqlite 58.0.14); no dependency changed |

New tests cover grouping without renaming, mixed families, the comparator in every input
order, per-day latest, agreement with `latestBodyweight`, unreadable entries, ranges and
comparisons against real entries only, unit display, parsing and errors, plausibility,
record shape, untouched edits writing nothing (kg and lb), change-only merges with types
preserved, the offer rule, backup round trips; UI: first weigh-in with comma, double tap,
Undo; pounds and inches; past day; errors; unusual value; untouched and changed edits
(outbox unchanged); delete copy; overview, rows and detail; offer accept, dismiss and
absence; Progress Body grouping, same-day point and selection reset.

### Android emulator

Harness `seed15.ts` / `p16.ps1`, 55 screenshots in
`forge-visual-harness\shots\android\p16\` (contact sheets `sheet-states`, `sheet-log`,
`sheet-more`, `sheet-sizes`). Covered: empty with offer, one, several, long history
(≈ 200 entries, a 40-day gap, same-day pairs), ranges, detail, log with keyboard, Save &
add another, unusual value, validation, past day, light + pounds edit and delete, Progress
Body before/after switching, SE, large, SE at 130 % text. Device database: untouched edit
left records and outbox identical.

Fixed during review: a same-frame double tap saved twice (guard now held until the input
changes or the sheet closes); the last value moved from the placeholder to a caption;
duplicate "Log" actions and headings in the detail view; "1 day" row wording.

### Known limitations

- Time of day is not stored (unchanged contract), so same-day order relies on creation time.
- Goals still show bodyweight in kg (WP4D).
- The overview card's chart headline repeats the latest value until another point is chosen.
- At 130 % text on SE the overview card fills the first screen.

### iPhone acceptance checks (outstanding)

1. Fresh profile: the profile-weight card appears; "Log it" adds one weigh-in today; it never
   returns; "Not now" on another profile still allows logging.
2. Comma region: "81,5" saves 81.5 kg.
3. Keyboard: Save and Save & add another stay visible on SE/mini and Dynamic Island phones.
4. Past day via the calendar presented over the sheet.
5. Edit without changes: nothing changes (no "updated" ordering shift); edit with a change.
6. Delete confirmation names the value and day.
7. Pounds: entries display lb/in; typing 180 lb stores ≈ 81.65 kg.
8. Ranges and gaps read correctly; "2 entries" on a day with two weigh-ins.
9. Progress → Body: switching series shows the latest value.
10. VoiceOver on rows, ⋯, the chart (adjustable) and the offer buttons; largest Dynamic Type.
