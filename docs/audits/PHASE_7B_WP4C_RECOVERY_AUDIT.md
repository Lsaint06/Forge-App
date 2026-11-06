# FORGE — Phase 7B WP4C: Recovery Audit and Plan

**Status: approved (2026-10-24, D1–D12 as recommended); implemented and verified on the Android emulator; awaiting founder iPhone review. Not committed.**

Audit date: 2026-10-24 (Pacific).

Evidence labels:
- **[Code]** read at the baseline.
- **[Device]** reproduced on the Android emulator (Expo Go 58).
- **[Calc]** run against the app's own repository and validation code in Node.
- **Proposed** describes a design, not existing behaviour.

---

## 1. Verified baseline

| Check | Result |
| --- | --- |
| Branch | `feat/forge-paths-foundation` |
| HEAD | `c9b3f61ddc545bfc1b2e84d24b4890984caf790c`: "WP4B: Measurements rebuild and Progress Body chart fix" |
| Remote | `origin/feat/forge-paths-foundation` at the same commit after `git fetch`. WP4B is pushed. |
| Previous commits | `3de4f2e` splash fallback removal · `5f45b84` WP4A.1 · `35972ed` WP4A · `4cf4348` WP3 |
| Working tree before the audit | Clean |
| Unexpected changes | None |

Documentation read:
- [Phase 7A product audit](PHASE_7A_PRODUCT_AUDIT.md): the Journal: Recovery row and C-05, C-09 and C-15, plus the WP4 plan, which says: "1–5 segmented controls, sleep stepper, rest-day switch, methodology in an InfoSheet… recovery check-in in ≤ 8 taps with no keyboard".
- [WP4A](PHASE_7B_WP4A_NUTRITION_AUDIT.md), [WP4A.1](PHASE_7B_WP4A1_FOOD_LIBRARY_PLAN.md) and [WP4B](PHASE_7B_WP4B_MEASUREMENTS_AUDIT.md).

Two doc housekeeping notes, left unedited because this package may only add this file:
1. The 7A audit's closing line still describes WP4B as "uncommitted".
2. The WP4A.1 plan still lists the 3,730-food count as awaiting review.

> **Naming warning.** "Recovery" already names two unrelated things:
> - [components/Recovery.tsx](../../src/components/Recovery.tsx): the startup error and data-rescue screen.
> - [cloud/recovery.ts](../../src/cloud/recovery.ts): password-reset tokens.
>
> [tests/recovery.test.ts](../../tests/recovery.test.ts) tests the password-reset tokens, **not** check-ins. New WP4C files must use a distinct name, for example `checkin`, to avoid confusion (section 13).

---

## 2. Existing Recovery data contract

Recovery check-ins are journal rows with `kind = "recovery"`, stored in the shared `journal` table. **[Code]**

The row columns are:
- `id`
- `kind`
- `date`, a local `YYYY-MM-DD`
- `data`, a JSON object
- `created_at` and `updated_at`, in epoch milliseconds

There is no recovery-specific table, migration or schema version.

### 2.1 Fields in `data`

| Key | Form label (today) | Storage rule enforced by `validateJournal` | Required? | Shown on the card? |
| --- | --- | --- | --- | --- |
| `sleep` | "Sleep hours" | number, 0–24, decimals allowed | **Yes** | Yes ("Sleep 7.25 h") |
| `quality` | "Sleep quality (1–5)" | number, 1–5, **decimals allowed** | **Yes** | **No**, only inside the score |
| `soreness` | "Soreness (1–5)" | number, 1–5, decimals allowed | **Yes** | Yes ("soreness 2/5") |
| `energy` | "Energy (1–5)" | number, 1–5, decimals allowed | **Yes** | Yes ("energy 4/5") |
| `stress` | "Stress (1–5)" | number, 1–5, decimals allowed | **Yes** | **No**, only inside the score |
| `readiness` | "Subjective readiness (1–5)" | **Not validated** beyond the generic journal value type | No | **No**, and **not used** by the score |
| `restDay` | "Rest day: yes / no" (typed text) | **Not validated**: any string or boolean | No | Yes ("rest day no") |
| `notes` | "Notes" | string, at most 5,000 characters (generic) | No | Yes |
| any other key | — | Accepted (string, number or boolean) | No | No |

Sources: [validation.ts](../../src/domain/validation.ts) `validateJournal` (recovery branch) and `journalSchema`, and [Journal.tsx](../../src/screens/Journal.tsx) `config.recovery`.

### 2.2 Accepted and rejected values

Each value was run through the app's own `validateJournal` and `Repository`. **[Calc]**

| Input | Result |
| --- | --- |
| Only the five required numbers (no `readiness`, `restDay` or `notes`) | Accepted: the oldest shape, used in `repository.test.ts` |
| `readiness: 42`, `readiness: -3`, `readiness: "high"` | **Accepted** |
| `soreness: 2.5` | **Accepted** |
| `soreness: 0` | Rejected |
| `sleep: 0`, `sleep: 24`, `sleep: 7.33` | Accepted |
| `sleep: 24.5` | Rejected |
| `stress` missing | Rejected |
| `sleep: "7"` (a string) | Rejected |
| `restDay: "maybe"`, `restDay: true` | **Accepted** |
| Extra key `mood: 4` | Accepted |
| Date `2030-01-01` | **Accepted**: future dates are allowed |

### 2.3 What the UI exposes versus what the contract holds

- **Stored but never displayed:** `quality`, `stress` and `readiness`. You only see them by opening Edit.
- **Two different "readiness" ideas:**
  - The lifter's own 1–5 `readiness` rating is stored and then ignored.
  - The app displays a computed **"Readiness N/100"** instead (section 8).
- **Fields the form can produce:** the legacy form can create every field, including out-of-range `readiness` and free-text `restDay`.
- **Fields with no control at all:** none. All fields come from the typed form.

### 2.4 Missing values

- **The five required numbers:** a stored record can never lack them, because every write path checks them (local save, backup import, sync pull).
- **Partial records:** cannot exist today.
- **Optional keys:** `readiness`, `restDay` and `notes` may be absent. The card shows "rest day not logged" when `restDay` is absent.
- **NaN risk:** `readiness()` would return `NaN` if a required field were ever missing. It cannot happen today, but any future partial-entry design must handle it. **[Calc]**

### 2.5 Add, edit and delete

[Journal.tsx](../../src/screens/Journal.tsx), `LegacyJournal`. **[Code]**

- **Add:** a sheet with 9 typed fields:
  - date, typed as `YYYY-MM-DD`
  - 8 data fields, **prefilled** with 8 h, every scale at 3, and `"no"`
  - Save calls `addJournal`.
- **Edit:**
  - Every stored value is converted to a **string** in the form.
  - On save, only keys in a fixed numeric list are converted back to numbers. Everything is then written with `updateJournal`, **even if nothing changed**.
  - A boolean `restDay` (possible via sync or backup) becomes the string `"true"`.
  - A text `readiness` becomes `NaN` and the save fails.
- **Delete:** a confirmation ("Delete entry? This removes this recorded entry.") then `deleteJournal`. There is no Undo.
- **Missing numeric field:** an alert reads "Enter each numeric field; use zero when appropriate". Zero is invalid for the 1–5 scales, so this advice is wrong for four of the fields.
- **Order:** `ORDER BY date DESC, created_at DESC`, with no `updated_at` or `id` tie-breakers.

### 2.6 Preferences, units and analytics

- **Units:** sleep is always hours. The kg/lb profile setting does not affect Recovery.
- **Analytics:** there are no trends, charts, averages or streaks. The only calculation is `readiness()` in [metrics.ts](../../src/domain/metrics.ts).

### 2.7 Existing automated tests that touch check-ins

| Test | What it covers |
| --- | --- |
| [domain.test.ts](../../tests/domain.test.ts) "readiness has transparent bounded score" | `readiness()` returns 100 and 0 at the extremes |
| [repository.test.ts](../../tests/repository.test.ts) "local journal changes queue idempotent sync operations" | A recovery add and update queue a single outbox row |
| [today-train.test.tsx](../../tests/ui/today-train.test.tsx) | Today's "Recovery check-in" row opens `/journal?kind=recovery` |
| [you.test.tsx](../../tests/ui/you.test.tsx) | You → Health & body → "Recovery" opens the same route |

No test covers the recovery form, validation messages, card content or the Home score text.

---

## 3. Recovery across Forge

| Area | Dependency | Source |
| --- | --- | --- |
| **Today / Home** | Takes the **first** of today's recovery rows (newest created). It computes `readiness()` and shows "Readiness N/100 today", or "Not logged today". Tapping opens the journal. | [Home.tsx](../../src/screens/Home.tsx) |
| **Progress** | "More → Recovery" link only. No chart or summary. | [Progress.tsx](../../src/screens/Progress.tsx) |
| **You** | "Health & body → Recovery" link only. The disclaimer copy says "Subjective recovery and progression suggestions are transparent heuristics. They are not medical guidance." | [You.tsx](../../src/screens/You.tsx) |
| **Workout history** | None | — |
| **Forge Paths, curated programs, progression, deloads** | **None.** No code reads recovery records. Coaching copy mentions recovery in general terms ("if recovery allows"), but nothing is computed from check-ins. | grep of `journal("recovery")` and `readiness(` |
| **Goals** | None (goal metrics are workouts, volume, bodyweight, strength, duration and nutrition) | [Journal.tsx](../../src/screens/Journal.tsx) `goalValue` |
| **Profile `restDay`** | **Unrelated.** This is the profile's planned weekday off (0–6), not the check-in's `restDay` answer. The shared name invites confusion. | [profile.ts](../../src/domain/profile.ts) |
| **Backup and restore** | Generic. Recovery rows are exported in `journals` and validated with `validateJournal` on import. | [repository.ts](../../src/data/repository.ts) `exportBackup` / `importBackup` |
| **Cloud sync** | Generic `journal` outbox entries. Remote rows pass through `putJournal`, which validates them. | Same file, `applyRemote` |

**Conclusion:** check-ins influence **no** training suggestion, prescription, progression or analytics outside the Home subtitle and the Recovery list. WP4C can rebuild the screen without touching programming.

---

## 4. Data-preservation requirements

Each of these must hold after WP4C ships:

1. **Records:** every existing recovery row keeps its `id`, `date`, `createdAt` and every `data` key with its exact value **and type**. Unknown keys must also survive edits.
2. **Scales:** 1–5 values keep their meaning and direction:
   - higher `quality` and `energy` mean better;
   - higher `soreness` and `stress` mean more of that feeling.
   No scale is reversed or rescaled.
3. **Decimals:** existing decimal scale values (for example 2.5) are displayed as recorded and never rounded on save unless the lifter changes that field.
4. **Legacy optional values:** out-of-range `readiness` and free-text or boolean `restDay` are preserved and shown as recorded.
5. **Storage validation stays as it is:** `validateJournal` is **not tightened**. Tightening it would make existing backups, and sync rows from older app versions, fail to import. New limits apply in the UI only.
6. **Untouched edits:** saving without changes writes nothing and queues nothing, the same protection WP4B added. This needs a recovery equivalent of `editedRecord`.
7. **No migration:** no new table, column or required key. Backup format version 1 is unchanged.
8. **Recognised by older app versions:** any new optional key must still pass the current `validateJournal`. It does, because extra keys are accepted. Optional additions are still a founder decision (D11).

---

## 5. Android emulator observations

Setup:
- **Seeds:** `forge-visual-harness\seed17.ts`. They cover empty, one, today, several (with a same-day morning/evening pair, a partial legacy record, decimals and "maybe"), the same in light theme with pounds, and a 203-entry year with a 30-day gap.
- **Captures:** `p17.ps1`.
- **Screenshots:** `C:\Users\LStAm\forge-visual-harness\shots\android\p17\`, 50 frames plus 6 contact sheets (`_sheet-*.png`).

| # | Observation | Screenshot(s) |
| --- | --- | --- |
| E1 | **The screen leads with a computed score.** Every card's headline is "NN / 100", followed by the same 4-line methodology paragraph. | `standard-several-0..2`, `standard-one` |
| E2 | **Dates are raw `2026-10-24`.** There is no "Today" and no weekday. | all list frames |
| E3 | **Each card's details line shows only sleep, soreness, energy and rest day.** Quality, stress and the lifter's own readiness are invisible. "rest day maybe" is shown verbatim. | `standard-several-0` |
| E4 | **The same-day morning/evening pair** shows as two equal cards: evening first (newest created), then morning. Nothing marks it as a second check-in. | `standard-several-1` |
| E5 | **The add form** is 9 stacked text fields. On an SE-size phone it takes about 3 screens to reach Save. The decimal keyboard covers the lower fields and Save. | `se-add-0..2`, `standard-add-0..2`, `standard-keyboard` |
| E6 | **Tapping Save on the untouched prefilled form records a check-in the lifter never answered:** 8 h with every scale at 3, shown as "60 / 100". | `standard-invalid-blank`, `_sheet-editor` |
| E7 | **Errors appear as raw schema JSON.** An out-of-range soreness and a malformed date each produce a "Could not save" dialog full of JSON. The date error includes a regular-expression dump. | `standard-invalid-range`, `standard-invalid-date`, `standard-accepted-odd`, `standard-accepted-future` (the last two show the same JSON alerts; the harness typed into non-empty fields) |
| E8 | **Edit opens the same 9-field form.** A 4.5 quality and a 1.5 soreness show as plain text. | `standard-edit` |
| E9 | **Delete** shows a system confirmation with generic copy. There is no Undo. | `standard-delete` |
| E10 | **Today shows "Readiness 45/100 today"**, a medical-sounding claim with no explanation on that screen. With no check-in it shows "Not logged today", which is neutral and good. | `standard-home-today(-1)`, `standard-home-empty` |
| E11 | **Long history:** 203 cards at roughly 2.4 per screen, so about 85 screen-heights of scrolling. There is no grouping, range or chart. | `standard-long-0`, `standard-long-end` |
| E12 | **Navigation chrome:** a slogan title ("Listen to your body."), a "PROGRESS / RECOVERY" eyebrow even when opened from You or Today, and a full-width **Back** button. This is 7A C-09. | all |
| E13 | **Light theme:** legible. The same problems apply. | `standard-light-0`, `standard-light-add` |
| E14 | **130% text (SE):** the list stays legible, but a single card fills most of the screen. The add sheet at 130% did not open in the scripted run, so it was **not observed**. Today's row at 130% is fine. | `se-text130-0`, `se-text130-home` |
| E15 | **Large phone:** no layout defects; the same density problems. | `large-*` |
| E16 | **Return from another screen:** the list re-reads from the repository on focus. No stale data was seen. | (navigation runs) |

Comparison with WP4A and WP4B:

| Aspect | Nutrition and Measurements | Recovery |
| --- | --- | --- |
| Dates | Day picker | Typed date |
| Values | Controls and readable values | Free text |
| Errors | Friendly validation | Raw JSON |
| After saving or deleting | Undo | None |
| Untouched edit | Writes nothing | Rewrites the record |
| History | Compact grouped rows, real-date charts | Neither |

---

## 6. UX defects and severity

P1 means wrong data or a misleading claim. P2 means a significant usability or correctness gap. P3 means polish.

| ID | Sev | Defect | Evidence |
| --- | --- | --- | --- |
| R-01 | **P1** | **A computed "Readiness N/100" is the headline on Today and every card.** It is an equal-weight average that is not validated, ignores the lifter's own readiness rating, caps sleep at 8 h, and is called "Readiness" on Today without any qualifier. | E1, E10; `metrics.ts` |
| R-02 | **P1** | **Prefilled answers turn an untouched Save into made-up data** (8 h, all 3s). | E6 |
| R-03 | **P1** | **Raw Zod JSON** is shown for out-of-range or malformed input. | E7 |
| R-04 | **P1** | **An untouched edit rewrites the record**, bumps `updatedAt` and queues a sync upload. Booleans become strings on any edit. | [Calc]; 2.5 |
| R-05 | P2 | Quality, stress and the lifter's own readiness rating are stored but never shown. | E3 |
| R-06 | P2 | **The scales' direction is not explained.** "Soreness (1–5)" has no endpoint labels, and the fields mix "higher is better" with "higher is worse". | E5 |
| R-07 | P2 | 9 typed fields, 3 screens on a small phone, the keyboard covering Save, and "yes / no" typed as text. 7A target: ≤ 8 taps, no keyboard. | E5 |
| R-08 | P2 | `readiness` and `restDay` are unvalidated, scales accept decimals, and future dates are accepted. | 2.2 |
| R-09 | P2 | No trends: no sleep chart, no soreness pattern, no consistency count. | E11 |
| R-10 | P2 | Long history is unusable: about 85 screens with no grouping or range. | E11 |
| R-11 | P2 | Same-day entries have no rule. Today silently uses the newest created, and the order lacks `updated_at`/`id` tie-breakers. | E4; `repository.journal` |
| R-12 | P2 | The "use zero when appropriate" advice is wrong, because zero is invalid on 1–5 scales. | 2.5 |
| R-13 | P3 | The methodology paragraph repeats on every card (7A C-15). | E1 |
| R-14 | P3 | Raw ISO dates, a repeated "Recovery check-in" title, the slogan title, the eyebrow and the full-width Back (7A C-09). | E2, E12 |
| R-15 | P3 | Delete has no Undo, and its copy is generic. | E9 |
| R-16 | P3 | "Rest day" collides with the profile's planned rest weekday, and "Recovery" collides with the rescue screen and password reset. | 1, 3 |
| R-17 | P3 | The shared `SegmentedControl` is 38 pt high with a `tablist` role. It is unsuitable as-is for 1–5 scale answers (44 pt minimum, radio semantics). | `ui.tsx` |

---

## 7. Proposed Recovery overview

**Proposed.** Same route (`/journal?kind=recovery`), a new dedicated screen built from Design 2.0 parts.

1. **Header:**
   - title "Recovery" with a back chevron (`Screen onBack`);
   - an ⓘ `InfoButton`, whose `InfoSheet` explains what is recorded and that it is not medical advice.
2. **Today card:**
   - **Logged:** "Today", then a compact grid of what was recorded, in words and numbers:
     - Sleep 7 h 30 m
     - Sleep quality 4 · Good
     - Soreness 2 · Mild
     - Energy 4 · High
     - Stress 2 · Low
     - Rest day, if answered
     - the note, if any, in one line
     
     Action: **Update today's check-in**.
   - **Not logged:** "No check-in today" with **Log check-in** (primary).
   - Below it, muted: "Last check-in: Thu, Oct 22", or nothing when there is none.
   - There is **no score**, and missing data is never described as poor recovery.
3. **Trends card** (shown when there are at least 2 check-in days):
   - a metric segmented control (Sleep · Quality · Soreness · Energy · Stress);
   - the WP4B range control (1M · 3M · 6M · 1Y · All);
   - a `LineChart` using the real-date `x` and `breakOver` (30-day gaps).
   One line of descriptive summary underneath (section 9).
4. **Consistency line** (descriptive): "12 check-ins on 12 of the last 30 days."
5. **History:**
   - grouped by month;
   - compact `ListRow`s such as "Thu, Oct 22 · Sleep 7 h 15 m · Soreness 3 · Energy 4", with a note icon when notes exist;
   - tap to edit, with Delete in the overflow menu;
   - "Show more" after 60 rows, so long histories don't render hundreds of rows at once.
6. **Empty state:**
   - "Track how you sleep and feel. A check-in takes about 10 seconds."
   - **Log your first check-in**
   - It shows no zeros, charts or scores.

---

## 8. Recovery score assessment

**Exact calculation** ([metrics.ts](../../src/domain/metrics.ts) `readiness`):

```text
score = round( clamp(0, 100,
          ( min(8, sleep)/8 + (quality−1)/4 + (5−soreness)/4 + (energy−1)/4 + (5−stress)/4 ) / 5 × 100 ))
```

- **Missing data:** none is possible today. If a field were missing, the result would be `NaN` and would display as "NaN / 100".
- **Notable behaviour:**
  - 12 h of sleep scores the same as 8 h.
  - The lifter's own `readiness` rating is ignored.
  - The default prefilled form (8, 3, 3, 3, 3) scores 60, a value the lifter never chose. **[Calc]**
- **Presentation:** on Today it reads "Readiness 45/100 today", with no qualifier and no link to the methodology. The list repeats the disclaimer, but the headline number remains the most prominent element.
- **Assessment:** the formula is transparent, but the **name and prominence** suggest a validated readiness assessment. That conflicts with this package's rule against presenting subjective data as validated readiness.

**Recommendation (D2):** stop displaying the score. Keep the `readiness()` function and its test untouched for compatibility, and show recorded answers instead. No new score.

---

## 9. Quick check-in, charts and history behaviour

### 9.1 Quick check-in sheet (Proposed)

One `Sheet`, in this order, with no keyboard needed except for notes:

1. **Day row:** "Today ▸", which opens `DateSheet range="past"`. Future dates can't be picked.
2. **Last night's sleep:** a stepper in 15-minute steps, displayed as "7 h 30 m".
   - Range 0–24 h; tap the value to type it.
   - Starts **unset** ("—"). The first + or − starts from the last recorded sleep, or 8 h if there is none.
   - A hint appears above 14 h. It never blocks saving.
3. **Five 1–5 scale rows.** Each shows the question, five 44 pt buttons and **endpoint labels**:
   - Sleep quality: 1 Poor ··· 5 Great
   - Soreness: 1 None ··· 5 Severe
   - Energy: 1 Drained ··· 5 Energised
   - Stress: 1 Calm ··· 5 Very stressed
   - Ready to train (your own rating, optional, D4): 1 Not at all ··· 5 Fully
   
   Each row starts **unselected**, and the selected button shows its word ("2 · Mild").
4. **Rest day:** a switch (D6).
5. **Note:** "Add note" expands a text field.
6. **Save check-in:** pinned at the bottom of the sheet, so it stays visible above the keyboard.
   - Until the required answers are chosen, tapping it shows a friendly line naming what's missing, e.g. "Choose soreness and stress".
   - It never shows schema text.

Typical new check-in: 1–3 taps for sleep, 4 for the required scales, then Save. That is **6–8 taps with no keyboard**, meeting the 7A target.

**Edit:**
- The same sheet opens with recorded values. A decimal value (2.5) shows "2.5 (recorded)" with no button selected.
- **Change-only save:** untouched fields keep their exact stored value and type. An untouched Save closes the sheet and writes nothing.

### 9.2 Dates and multiple entries (Proposed rules, D5 and D7)

| Situation | Rule |
| --- | --- |
| New daily check-in | Dated today (local). Sleep means the night before that morning. |
| Today already has a check-in | The primary action becomes **Update today's check-in** and edits the latest of today. "Add another check-in for today" stays available in the overflow menu. Nothing is merged. |
| A missed day | Pick a past day in the day row. If that day already has a check-in, the sheet says so and offers to edit it instead. |
| Several on one date | All are kept and listed. The **latest of the day** is used for Today, charts and summaries, and the list marks the others as "2 check-ins". |
| Ordering and tie-breaks | WP4B's comparator, `newestFirst` in [measurements.ts](../../src/domain/measurements.ts): date ↓, created ↓, updated ↓, id ↓. It is imported, not modified. |
| Daily trend point | One point per day (the latest), placed at its real date with `dayNumber`. Gaps longer than 30 days break the line, and missing days are never zero. |
| Time zones | Dates are stored as the local date at the time of entry and never re-interpreted. Travel can make "today" differ from a stored date, which is acceptable and matches every other journal. |

### 9.3 Descriptive summaries (Proposed, D8)

Shown under the chart for the selected metric and range, always with their basis:
- "Average sleep 6 h 50 m · 14 check-ins in the last 30 days"
- "Soreness: mostly 2–3 (Mild–Moderate) · 14 check-ins"
- "Logged on 14 of the last 30 days"

There is no causal language, no "good" or "bad" labels and no training advice.

---

## 10. Training context (optional research, D10)

- **Possible approach:** mark workout days as small ticks under the chart's date axis. The data is already available through `r.workouts()`.
- **Risk:** it invites cause-and-effect reading ("soreness after leg day").
- **Recommendation:** defer, or allow ticks only with no derived statistics. Under no circumstance compute correlations or adjust training.

---

## 11. Screen wireframes (Proposed)

```text
1. OVERVIEW (logged today)              2. QUICK CHECK-IN (sheet)
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ ‹  Recovery               ⓘ  │        │ Check-in                   ✕ │
│ ┌──────────────────────────┐ │        │ Day            Today ▸       │
│ │ TODAY                    │ │        │ Last night's sleep           │
│ │ Sleep        7 h 30 m    │ │        │   −     7 h 30 m     +       │
│ │ Quality      4 · Good    │ │        │ Sleep quality                │
│ │ Soreness     2 · Mild    │ │        │ [1][2][3][4][5]              │
│ │ Energy       4 · High    │ │        │ Poor              Great      │
│ │ Stress       2 · Low     │ │        │ Soreness                     │
│ │ Rest day                 │ │        │ [1][2][3][4][5]              │
│ │ "Legs heavy from Tue…"   │ │        │ None             Severe      │
│ │ [ Update today's check-in ]│        │ Energy  … Stress  … Ready …  │
│ └──────────────────────────┘ │        │ Rest day                 ◯   │
│ TRENDS                       │        │ + Add note                   │
│ [Sleep|Qual|Sore|Energy|Str] │        ├──────────────────────────────┤
│ [1M|3M|6M|1Y|All]            │        │ [      Save check-in       ] │
│  ╱╲__╱‾‾╲_  (real dates)     │        └──────────────────────────────┘
│ Avg sleep 6 h 50 m · 14 days │
│ HISTORY                      │        3. TRENDS: as in 1; the chart is
│ October                      │           accessible as "Sleep, last 30
│ Thu, Oct 22 · 7 h 15 · S3 E4 ›│          days: 14 check-ins, from 5 h to
│ Wed, Oct 21 · 6 h · S4 E2  ✎ ›│          9 h, latest 7 h 30 m"
└──────────────────────────────┘

4. EDIT: sheet 2 with recorded values;   5. EMPTY
   the title is "Edit check-in · Thu,    ┌──────────────────────────────┐
   Oct 22"; overflow → Delete            │ ‹  Recovery               ⓘ  │
   (confirm + Undo banner)               │  Track how you sleep and     │
                                         │  feel. A check-in takes      │
                                         │  about 10 seconds.           │
                                         │  [ Log your first check-in ] │
                                         └──────────────────────────────┘
```

**Interaction sequence:**
1. Today → Recovery row → overview.
2. **Log check-in** → sheet → sleep stepper → 4 required scales → Save.
3. The sheet closes, and a banner reads "Check-in saved · Undo".
4. The Today card updates, and the history gains a row.

**Today's Recovery row** subtitle changes from "Readiness 45/100 today" to "Logged today · Sleep 7 h 30 m", or stays "Not logged today" (D3). The row's label, "Recovery check-in", is kept, so the existing test and accessibility label stay stable.

**Reused components:**
- `Screen` with `onBack`, `InfoButton`/`InfoSheet`, `Card`, `ListSection`/`ListRow`, `OverflowMenu`, `Sheet` with `unsaved`, `confirm`;
- the WP4A/WP4B Undo banner pattern and `AccessibilityInfo` announcements;
- `DateSheet range="past"`, `Stepper`/`NumberControl` for sleep, `SegmentedControl` for metric and range;
- `LineChart` with `x`, `breakOver` and `resetKey`;
- `dayTitle`/`dayLabel`, and WP4B's `newestFirst`/`dayNumber`/`GAP_DAYS`.

**One new component is needed:** a `ScaleRow` (five radio buttons, 44 pt, with endpoint labels), because `SegmentedControl` is 38 pt and uses tab semantics (R-17). There is no new design system.

---

## 12. Accessibility and performance acceptance criteria

Each item is testable.

1. **Scale rows** are a `radiogroup` labelled with the question. Each option is a `radio` announced as "2, Mild, soreness" with its selected state.
   - Every target is at least 44×44 pt.
   - Endpoint words are visible text, not colour alone.
2. **Sleep stepper** is an `adjustable` control announcing "Last night's sleep, 7 hours 30 minutes". Increment and decrement change it by 15 minutes.
3. **No raw errors:** no `Alert` or inline message contains `{`, `"code"` or `pattern`. A UI test asserts this.
4. **130% text on a 375×667 viewport:**
   - All scale rows remain fully visible without horizontal scrolling or clipping.
   - Endpoint labels wrap rather than truncate.
   - Save is reachable.
5. **Keyboard:** with the note field focused, **Save check-in** remains visible above the keyboard on SE and standard sizes.
6. **Contrast:** text meets WCAG AA (4.5:1) in light and dark modes. Selected scale buttons are distinguishable without colour (weight or outline).
7. **Reduced motion:** charts and banners don't animate when reduced motion is on, matching existing components.
8. **Charts** have an accessibility label summarising range, count, minimum, maximum and latest. Missing days are not announced as values.
9. **Long history:** 400 check-ins render the overview in under 1 s in the UI test environment. Only the first 60 history rows mount until "Show more".
10. **States:** empty, one check-in, and a partial legacy record (no `readiness` or `restDay`) all render without "NaN", "undefined" or "not logged" noise.
11. **Undo:** saving or deleting is announced with "Undo available".

---

## 13. Implementation file scope (Proposed)

| File | Change |
| --- | --- |
| `src/domain/checkins.ts` (new) | Read and display helpers that never throw on legacy values (`scaleText`, `sleepText`, `restDayText`). `newCheckin` and change-only `editedCheckin` (undefined when untouched). Daily latest-of-day series, range summaries and consistency counts. UI-only validation messages. Imports `newestFirst`/`dayNumber`/`GAP_DAYS` from `measurements.ts` without modifying it. |
| `src/screens/Checkins.tsx` (new) | The overview, trends and history screen. |
| `src/components/checkins/CheckinSheet.tsx`, `ScaleRow.tsx`, `TrendCard.tsx` (new) | The sheet, the 1–5 control and the chart card. |
| [Journal.tsx](../../src/screens/Journal.tsx) | Route `kind=recovery` to the new screen. `LegacyJournal` remains for goals only (WP4D), and its recovery config becomes dead code to remove. |
| [Home.tsx](../../src/screens/Home.tsx) | The Recovery row subtitle only (D3). |
| `tests/checkins.test.ts`, `tests/ui/checkins.test.tsx` (new) | Section 14. |
| README, IMPLEMENTATION_STATUS, IPHONE_TESTING, the 7A audit's WP4 section, this file | Docs |

**Not touched:**
- `validation.ts` and the storage rules
- `repository.ts`, `schema.ts`, backup and sync
- `metrics.ts` (`readiness()` is kept)
- `charts.tsx`, unless a defect is found
- Progress and You (the links are unchanged)
- programs, Paths, progression, WP4A/WP4A.1/WP4B code, splash, onboarding and navigation

No new dependencies.

---

## 14. Regression and device test plan

**Domain tests (`tests/checkins.test.ts`):**
- **Legacy shapes:**
  - only the five numbers;
  - with `readiness` 42 or "high";
  - `restDay` `"maybe"` or `true`;
  - an extra key.
  
  All display without throwing.
- **Change-only edits:**
  - Untouched → `undefined`, with no write or outbox row (asserted against the repository).
  - Changing one field changes only that key.
  - Booleans, decimals and unknown keys keep their types.
- **New check-ins:** rejected (with friendly copy) when a required scale is unset or sleep is outside 0–24. No defaults are written.
- **Same-day handling:** latest-of-day selection uses the full comparator, including equal `createdAt`; earlier records are kept.
- **Series:** real-date spacing, 30-day gaps, no zero-filling, and range boundaries using WP4B's `dayNumber`.
- **Summaries:** averages and counts are correct, and averages are omitted for fewer than two check-ins.
- **Backup:** a backup containing legacy recovery rows round-trips byte-identically. Sync from a remote recovery row is unchanged.

**UI tests (`tests/ui/checkins.test.tsx`):**
- The empty, one, today, several and long states.
- A check-in with no keyboard.
- Save disabled or explained until answers are chosen.
- Edit with no change writes nothing.
- Delete confirmation, then Undo.
- A past day.
- Raw JSON is never shown.
- Accessibility roles and labels.
- The Today subtitle.
- The existing today-train and You route tests still pass.

**Full regression:**
- every existing logic and UI suite, including WP2 logger, WP3 templates, WP4A nutrition, WP4A.1 `food-library:check`, WP4B measurements, and the 18 curated program lock tests;
- typecheck, lint, format;
- iOS and Android export.

**Emulator:**
- SE, standard and large sizes; dark and light themes; 130% text;
- the empty, one, today, several and long seeds (reusing `seed17.ts`);
- keyboard with notes, past-date entry, the same-day pair, edit untouched (device database unchanged, outbox empty), delete with Undo;
- the Today row.

**Founder iPhone acceptance checklist (for after implementation):**
1. Log today's check-in in no more than 8 taps without the keyboard.
2. Every scale's direction is obvious without reading any help.
3. Today shows what you recorded, not a score.
4. Edit a check-in, change nothing, and Save: nothing changes.
5. Log yesterday from the day row. You can't pick a future day.
6. Delete a check-in, then Undo it.
7. The sleep and soreness charts space irregular days correctly and show gaps.
8. VoiceOver reads each scale button with its meaning.
9. Larger Text: the sheet remains usable and Save is reachable.
10. Older check-ins (including any with half-values) still appear correctly.

---

## 15. Risks and unresolved issues

1. **Tightening validation** would break imports and sync of existing data. This plan keeps storage rules and validates in the UI only.
2. **Removing the score from Today** changes a visible Today element (D2 and D3). The row and its label stay.
3. **Required answers versus partial check-ins:** allowing partial check-ins (skipping stress, for example) would need `validateJournal` to accept missing keys. Older app versions on another device or a restored backup would then **reject** those records. This plan keeps all five required (D9).
4. **Same-day model:** "Update today's" is a UX change from today's unrestricted adding. Existing duplicates are kept either way (D5).
5. **Naming collisions** (section 1). The new code uses "check-in".
6. **Not observed on the emulator:**
   - the legacy add sheet at 130% text;
   - the "Missing value" alert (adb could not reliably clear the fields; the behaviour is confirmed from code).
7. **Expo Go only:** no installed build. iPhone review remains necessary.

---

## 16. Founder decisions

Each decision can be approved as recommended or adjusted.

**D1: Dedicated Recovery screen.**
- **Question:** replace the generic journal with a dedicated screen (Today card, Trends, History) at the same route?
- **Recommended:** Yes (section 7).
- **Alternatives:** polish the generic journal in place.
- **Trade-offs:** in-place polish is smaller but can't fix trends, history or scale clarity.
- **Data:** none; storage is unchanged.

**D2: The "Readiness N/100" score.**
- **Question:** what happens to the computed score?
- **Recommended:** **A**, stop displaying it anywhere. Show recorded answers instead, and keep the function unchanged and unused.
- **Alternatives:**
  - B: keep it, renamed "Check-in summary" with a visible "not a medical assessment" note and an InfoSheet.
  - C: keep it as is.
- **Trade-offs:**
  - A is the clearest and avoids implied validity, but loses a single glanceable number.
  - B keeps the number with more context.
  - C keeps R-01.
- **Data:** none; the score was never stored.

**D3: Today's Recovery row.**
- **Question:** what should the subtitle show?
- **Recommended:** "Logged today · Sleep 7 h 30 m" or "Not logged today".
- **Alternatives:** show soreness and energy too, or keep the score (only if D2 is B or C).
- **Trade-offs:** more values crowd a one-line row.
- **Data:** none.

**D4: The lifter's own `readiness` rating (stored, never shown).**
- **Question:** what should happen to this field?
- **Recommended:** keep it as an **optional** 5th scale row, "Ready to train (your rating)", 1 Not at all … 5 Fully. Display existing values as recorded, including out-of-range ones marked "outside 1–5".
- **Alternatives:**
  - B: remove it from the form but keep stored values visible in history.
  - C: hide it entirely (still preserved).
- **Trade-offs:** A adds a sixth answer. B or C shortens the form but stops collecting it.
- **Data:** all options preserve stored values.

**D5: Same-day check-ins.**
- **Question:** how should a second check-in on the same day work?
- **Recommended:** the primary action edits today's latest, with "Add another for today" in the overflow menu. All are kept, and charts use the latest of the day.
- **Alternatives:**
  - B: always add new (as today).
  - C: strictly one per day (blocks adding).
- **Trade-offs:** B keeps clutter and ambiguity. C could block legitimate morning and evening logs.
- **Data:** nothing is ever merged or deleted under any option.

**D6: Rest day answer.**
- **Question:** how is the rest-day answer captured?
- **Recommended:** a switch that saves `"yes"`/`"no"` strings, as stored today. Existing `true`/`false` and other text are displayed as recorded and saved only if changed.
- **Alternatives:** remove the question (values preserved).
- **Trade-offs:** it is cheap to keep and useful context.
- **Data:** existing types are preserved.

**D7: The check-in date and sleep.**
- **Question:** which night does "sleep" refer to?
- **Recommended:** the check-in day is the morning you report. Label sleep "Last night's sleep", and allow past days only.
- **Alternatives:** keep the ambiguous "Sleep hours" label.
- **Trade-offs:** none significant.
- **Data:** none; existing dates keep their meaning.

**D8: Descriptive summaries.**
- **Question:** which summaries appear under the chart?
- **Recommended:** average sleep with its check-in count, the most common soreness band, and check-in consistency. Each states its data basis; no advice.
- **Alternatives:** chart only, no text.
- **Trade-offs:** the text helps screen-reader users and quick reading.
- **Data:** read-only.

**D9: Required answers.**
- **Question:** which answers does a new check-in require?
- **Recommended:** keep all five current numbers required (sleep, quality, soreness, energy, stress), with no prefilled defaults.
- **Alternatives:** allow partial check-ins.
- **Trade-offs:** partial is quicker but needs a validation change that older versions, restored backups and synced devices would reject (risk 3).
- **Data:** the recommendation is migration-free.

**D10: Training context on charts.**
- **Question:** show workout days alongside recovery trends?
- **Recommended:** **defer**.
- **Alternatives:** workout-day ticks only, with no statistics.
- **Trade-offs:** ticks invite causal reading.
- **Data:** read-only.

**D11: Optional features. Each needs approval; none is assumed.**
- body-part soreness (new optional key);
- extra metrics (mood, motivation);
- check-in reminders;
- new summary indicators;
- profile integrations;
- any new score.

**Recommended:** none in WP4C. Body-part soreness is the strongest candidate for later.

**D12: Deferred**, as listed in the brief:
- wearables, Apple Health and Health Connect;
- automated workout changes;
- AI coaching;
- medical interpretation;
- injury-risk prediction;
- sleep stages.

**Recommended:** confirm deferral.

---

## Founder approval (2026-10-24)

D1–D12 were approved as recommended, with these requirements:
- Keep the existing route, schemas, repository validation, backup and sync, and add no migrations.
- Remove the score from the user-facing experience but keep its compatibility logic.
- Prefill nothing, and keep the optional self-rating.
- Support same-day updates while preserving multiple entries.
- Make unchanged edits write nothing, and keep delete confirmation with Undo.
- Preserve unusual legacy data without silent correction.
- Touch no programming, progression or Paths.
- Start no visual redesign.

## Implementation results (WP4C)

### What changed

| File | Change |
| --- | --- |
| [domain/checkins.ts](../../src/domain/checkins.ts) (new) | Scale definitions with endpoint words. Display helpers that show legacy values as recorded. `newCheckin`, which requires every required answer and fills in nothing. `editedCheckin`, which is change-only and returns undefined when untouched. Latest-of-day selection (WP4B `newestFirst`), real-date points with gaps, ranges, descriptive summaries and a 30-day consistency count. |
| [screens/Checkins.tsx](../../src/screens/Checkins.tsx) (new) | The Recovery screen: the Today card (recorded answers in words, an ⓘ explanation, "N check-ins" when there are several), trends, month-grouped history (rows show the time when a day has several), a pinned **Log check-in** / **Update today's check-in** button, and Undo banners. |
| [components/checkins/](../../src/components/checkins/) (new) | `CheckinSheet` (past-only day picker, same-day notice with "Edit that check-in instead", sleep stepper that starts unset, scale rows, rest-day switch, note, error message pinned above Save). `ScaleRow` (five 48 pt radio buttons named at both ends). `TrendCard` (metric chips, ranges, date-spaced `LineChart`, summary). |
| [Journal.tsx](../../src/screens/Journal.tsx) | `kind=recovery` opens the new screen. The legacy recovery form, its prefilled defaults and the score cards are removed; `LegacyJournal` now serves goals only. |
| [Home.tsx](../../src/screens/Home.tsx) | The Recovery row reads "Logged today · Sleep 7 h 30 m" or "Not logged today", using the latest of today. |

**Unchanged:**
- `validation.ts`, `repository.ts`, the schema, backup and sync
- `metrics.ts` (`readiness()` and its test are kept, no longer displayed)
- charts and Progress/You links
- programs, progression, Paths, WP4A/WP4A.1/WP4B code, splash, onboarding and navigation

No dependencies were added.

### Implementation details worth knowing

- **Delete with Undo preserves identity.** A confirmed delete hides the row and is written only when its 6-second Undo expires, another action starts, or the screen closes. Undo therefore restores the original record (ID, timestamps and every value) instead of re-creating it. If the app is killed inside those 6 seconds, the record survives, which errs on the side of keeping data.
- **Undo after saving:**
  - for a new check-in, it deletes the new record;
  - for an edit, it writes back the previous values and day, which bumps `updatedAt`.
- **Rest day:** a new check-in writes `restDay: "yes"` only when the switch is on. An edit writes `"yes"`/`"no"` only if the switch was changed. Recorded `true`, `"no"` and other text are kept, and odd text is shown as "Recorded as …".
- **Clearing the optional self-rating** in an edit removes that key. Required answers can't be cleared.
- **Unusual stored values** (2.5, 42, "high") are shown "(recorded)" with no button selected, and are never charted. They change only if an answer is tapped.

### Tests

- `tests/checkins.test.ts` (10 tests):
  - sleep and scale display;
  - legacy values shown as recorded;
  - nothing assumed and missing answers named;
  - untouched edits with unusual values;
  - change-only edits that keep types and unknown keys;
  - same-day tie-breaks;
  - real-date points with gaps;
  - ranges and summaries;
  - consistency;
  - a repository save with an untouched edit queuing nothing, and a byte-identical backup round trip;
  - `readiness()` unchanged.
- `tests/ui/checkins.test.tsx` (9 tests):
  - first check-in: empty start, missing answers named, a double tap saves once, Undo;
  - Today in words with no score;
  - an untouched edit writes nothing (record and outbox identical), an edit changes one key, and Undo restores it;
  - a past day from the calendar, plus the same-day notice;
  - two check-ins on one day;
  - delete confirmation, Undo, and the write on close;
  - 400-day history paged at 60, trends and summaries, no "NaN" or "undefined";
  - plain error text;
  - radio roles and labels, and clearing the optional rating.
- **Full suite:**
  - 316 logic tests, including the 18 curated program locks;
  - 243 UI tests, including the existing Today and You route tests;
  - typecheck, format, and lint (only the existing WP3 warning);
  - `food-library:check` (reproducible, 3,730 foods);
  - iOS and Android export.

### Android emulator

Captures: `forge-visual-harness\p18.ps1` with the `seed17.ts` states. Screenshots: `shots\android\p18\`, 46 frames plus contact sheets `_sheet-a…d.png`.

Verified:
- **States:** empty, one, today, several (with a same-day pair, a partial legacy record, decimals and "maybe"), and the 203-entry year with "Show earlier (143)".
- **New check-in:**
  - It opens with nothing selected and sleep "Not set".
  - An immediate Save shows "Choose last night's sleep, sleep quality, soreness, energy and stress to save this check-in."
  - A filled check-in saves with the "Saved Today's check-in · Undo" banner.
  - **Device database:** the saved record is exactly `{"sleep":7.5,"quality":4,"soreness":2,"energy":4,"stress":2}`.
- **Untouched edit** of today's legacy check-in: 4.5 and 1.5 show "(recorded)". After Save changes, the **device database** has 8 records byte-identical before and after, and the outbox is unchanged (9 → 9).
- **Delete:** the confirmation, then the row hidden with Undo.
- **Same day and past days:** the same-day notice with "Edit that check-in instead", and a calendar with future days disabled.
- **Today:** the row reads "Logged today · Sleep 6 h".
- **Keyboard:** typing a note keeps Save visible above the keyboard.
- **Sizes and themes:** SE, standard and large; light and dark.
- **130% text on SE:** every scale row fits, endpoint labels wrap, and the sheet scrolls with Save pinned.

### Known limitations

- **TalkBack group label:** Android does not expose the scale group's own label ("Soreness, 1 None to 5 Severe"). Each button still reads "2, Mild" after the visible question. iOS VoiceOver behaviour needs the iPhone check.
- **Sleep entry:** sleep can't be typed, by design (stepper only, 15-minute steps, 0–24 h). The first tap starts from the last recorded sleep, or 8 h.
- **History rows** show at most two lines (summary and note), so a long note is truncated; the full note is in the edit sheet.
- **Undo after an edit** bumps `updatedAt`.
- **Not run:** a release build, or a Hermes-profiled run with very long histories.

### iPhone acceptance checks (outstanding)

Use the checklist in section 14 and [IPHONE_TESTING.md](../../IPHONE_TESTING.md).

---

*End of WP4C. Not committed. WP4D has not begun.*
