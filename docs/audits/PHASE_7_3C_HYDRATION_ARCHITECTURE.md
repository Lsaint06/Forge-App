# Project REFORGE — Phase 7.3C: Hydration Architecture (proposal)

**Status:** approved in principle (§10); implementation not yet authorized. **No hydration code, data or UI has been written.** The current 7.3B dashboard keeps the Hydration card's place beside Quick add and draws nothing there (no placeholder values).

**Founder requirement (7.3 amendment).** Hydration appears in the approved Nutrition mockup and is a **mandatory** Phase 7.3 feature:

- daily water totals;
- a configurable daily goal;
- mL and fl oz preferences;
- quick-add and custom amounts;
- edit and delete;
- day-by-day history;
- offline persistence with backup and sync;
- correct dates and conversions;
- an accessible REFORGE UI;
- a real Hydration card on the Nutrition dashboard.

Hydration must stay **separate from food calories and macros** and must not overload food records.

---

## 1. Verified current architecture (what hydration plugs into)

| Area | Fact (verified in code) | Consequence |
| --- | --- | --- |
| Records | Nutrition entries and saved foods are rows in the SQLite `journal` table (`id, kind, date, data JSON, created_at, updated_at`). **`kind` is free text with no CHECK constraint**; an index on `(kind, date)` exists | A new kind needs **no SQLite migration** and gets fast per-day reads |
| Food totals | Every nutrition read filters by kind: `r.journal("nutrition")` (dashboard, goals' calorie map, Home, Quick add), `r.journal("food")` (saved foods). Nothing sums across kinds | Water records of another kind **cannot** reach calorie or macro totals |
| Validation | `journalSchema.kind` is a strict enum; `validateJournal(kind, data)` checks per-kind fields on every write, restore and sync download | Hydration needs its own enum value and rule |
| Writes | `addJournal / updateJournal / deleteJournal` validate, write and queue the record for sync in one transaction | Reused unchanged |
| Sync | Cloud rows are `forge_records(kind in ('profile','exercise','workout','template','journal'))`; every journal kind travels as `journal` | **No Supabase migration** |
| Backup | `exportBackup` includes all journals; `importBackup` validates every journal with the same schema | Hydration is backed up and restored with no format change (`version: 1`) |
| Profile | One JSON profile (`profileSchema`, non-strict `z.object`), synced as `profile` and included in backups. Optional fields already exist (`restDay`) | Goal and unit preference can be **optional** profile fields: no migration, and older profiles still parse |
| Settings | Device key/value table; **not** synced and **not** in backups | Not suitable for the goal or unit preference |

## 2. Data model

### 2.1 Water entries: a new journal kind `hydration`

| Field | Type | Rule |
| --- | --- | --- |
| `kind` | `"hydration"` | New `JournalKind` and `journalSchema` value |
| `date` | `YYYY-MM-DD` | The local day it counts towards: the day shown when it was added, editable like food entries |
| `data.ml` | number | **Canonical amount in millilitres**, 1 – 5,000 per entry. Stored unrounded, as converted (e.g. 12 fl oz = 354.88235475 mL), so the user's own figure survives the round trip |
| `data.entered` | `"ml"` \| `"oz"` (optional) | The unit it was typed in; used to show an edited entry in its original unit |
| `createdAt` / `updatedAt` | ms | Existing; order within the day |

**No calories, macros, `name` or `meal` keys.** A water entry can never be read as food, and food helpers never see it.

**Alternatives considered:**

- **Logging water as a nutrition entry ("Water, 0 kcal")** — rejected. It overloads food records, appears in meals, Quick add and saved foods, and depends on every food helper ignoring it.
- **A new `hydration` SQLite table** — rejected for now. It needs a local migration (v3), a new cloud record kind (a **Supabase migration** to the `kind` CHECK), a new backup section, and new sync code, for no functional gain over a typed journal kind.

### 2.2 Preferences: optional profile fields

| Field | Type | Rule | When absent |
| --- | --- | --- | --- |
| `waterGoal` | number (mL) | 500 – 10,000 mL. Stored unrounded when entered in fl oz | **No goal is shown as a target** (same rule as calorie targets): the card shows the total and "Set a daily water goal" |
| `fluidUnit` | `"ml"` \| `"oz"` | Display and entry unit | Follows the weight unit: kg → mL, lb → fl oz |

The fields are optional in `profileSchema`, so every existing profile, backup and synced record still parses. Nothing is rewritten.

## 3. Validation (`validateJournal` and `profileSchema`)

- **Journal entries:** `kind === "hydration"` requires `ml` to be finite and between 1 and 5,000. `entered`, when present, must be `"ml"` or `"oz"`. No other keys are required, and food keys are not accepted as meaning anything.
- **Profile:** `waterGoal` is optional, finite, 500 – 10,000. `fluidUnit` is optional, `"ml"` or `"oz"`.
- **Form input:** accepts comma decimals (as the food form does), rejects 0 and out-of-range values with a kind message, and runs once even on a double tap.

## 4. Units and conversion

- **Unit:** US fluid ounce, **1 fl oz = 29.5735295625 mL** (exact by definition). The imperial fl oz (28.41 mL) is not offered (decision H3).
- **Stored in mL. Converted only at the edges:**
  - typing in fl oz stores `oz × 29.5735295625`;
  - display divides back.
  - Only binary float noise is removed (as `valuesForGrams` does); nothing meaningful is rounded in storage.
- **Display rounding:**

  | Unit | Format |
  | --- | --- |
  | mL, below 1 L | Whole mL ("750 mL") |
  | mL, 1 L and above | Litres to one decimal ("2.1 L") |
  | fl oz | Whole ounces ("71 fl oz") |

  The percentage is from the shown numbers, so "of" and "%" agree.
- **Round-trip guarantee (tested):** an amount typed in either unit shows the same figure back; switching units never changes stored amounts.

## 5. Dates

- Entries belong to the **local day** (`localDate`), like food. The dashboard's day switcher selects the day, so hydration history is day-by-day with the same navigation (past days only; never future).
- Midnight and app-wake behaviour follow the dashboard: "Today" moves with the clock. An entry keeps the day it was logged to.
- Times are not displayed as drinking times; only the order within the day is used.

## 6. Persistence, backup, sync and migration

| Concern | Effect |
| --- | --- |
| Existing data | **Untouched.** No table, column or record is rewritten; no data migration |
| SQLite | No schema migration (journal kind is free text) |
| Supabase | No migration (journals travel as `journal`) |
| Backup format | Unchanged (`version: 1`); hydration rides in `journals` |
| Food totals and goals | Unaffected: all food reads filter `nutrition` / `food` |
| **Older app versions** | An older build receiving a `hydration` journal (restoring a newer backup, or syncing with a newer device) rejects it: the kind is not in its enum. A restore of such a backup fails as a whole; a sync download reports an error for that record and continues. Older builds also drop the new optional profile fields when they save the profile |

**Older-version mitigation (decision H7):**

- **Recommended:** accept it for now, since devices run one current version. Add a forward-compatibility guard in this release: unknown journal kinds received by sync or restore are kept as opaque records, not rejected. Future kinds then never block a restore.
- **Alternative:** do nothing.

## 7. UI and dashboard integration

### 7.1 Hydration card (the mockup's right-hand card beside Quick add)

| Mockup element | Plan |
| --- | --- |
| "HYDRATION" overline | `CardHeader`; opens the hydration sheet |
| Drop icon, "2.1 L of 3.0 L" | The day's total and the goal **only when set**; otherwise the total and "Set a daily water goal" |
| Bar and "70%" | `ForgeProgress` in the hydration accent (H5), only against a set goal |
| Bottle photograph and "HYDRATE PERFORM RECOVER" | **No photograph** (no approved artwork); a subtle glow at most. The tagline is decorative copy (H6) |
| (not in the mockup) logging | **Tapping the card opens the hydration sheet; it never logs by itself** (H4, as modified) |

**Layout:** beside Quick add when both fit (`CardPair`, as today); stacked on compact widths and large text.

### 7.2 Hydration sheet (from the card)

- Shows the day and its total against the goal.
- **Quick-add chips** for the presets (H2).
- **Custom amount** in the preferred unit, with a unit toggle.
- The day's **entries** (amount, newest first) with **Edit** and **Delete** (confirm), plus Undo for adds.
- **Goal and unit** editing inline, or via You → Nutrition targets (H8).

Every control is at least 44 pt and every amount has a spoken label ("Water, 500 millilitres"). The sheet uses the shared `Sheet` and `Field`, which is consistent with 7.3D.

### 7.3 Colour (H5)

The mockup uses blue for hydration, outside the REFORGE ember palette. The proposal is **one hydration accent token**, dark and light, AA-checked, used only on the Hydration card and sheet.

## 8. Files and tests (when approved)

| Area | Files |
| --- | --- |
| Domain | New `src/domain/hydration.ts`: conversion, formatting, totals, validation helpers; `types.ts` (`JournalKind`, optional profile fields); `validation.ts` (enum, rule, profile fields) |
| Data | Repository unchanged (generic journal API); optional forward-compatibility guard (H7) |
| UI | `src/screens/nutrition/sections.tsx` (Hydration card); new `src/components/nutrition/HydrationSheet.tsx`; `Nutrition.tsx` (card in the reserved slot); theme accent token |
| Tests | `tests/hydration.test.ts`: conversions and round trips, display rounding, totals per day, validation limits, food totals unchanged with water present, backup export/import, sync apply. `tests/ui/hydration.test.tsx`: card states with and without a goal, quick add and Undo, custom amount in both units, edit, delete with confirm, past day, large text and 44 pt targets, no placeholder values |
| Docs | REFORGE foundation section; ASSETS (no artwork) |

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Water reaching food totals | Separate kind; a test asserts nutrition totals are identical with water logged |
| Conversion drift | Canonical mL, unrounded storage, round-trip tests |
| Older-version restore or sync | H7 guard; release note |
| Off-palette blue | A single token, used only for hydration |
| Dashboard length | `CardPair` keeps Quick add and Hydration side by side where they fit |

## 10. Founder decisions (7.3B refinement review)

**Status:** architecture **approved in principle**. **Implementation is not yet authorized**; it starts only when the founder authorizes Phase 7.3C.

| # | Decision | Outcome |
| --- | --- | --- |
| H1 | Storage | **Approved:** a separate `hydration` record type. Water never counts as food: no effect on calories, protein, carbohydrates, fat, nutrition goals or food history |
| H2 | Presets | **Approved:** 250 / 500 / 750 mL and 8 / 16 / 24 US fl oz, plus custom amounts |
| H3 | Fluid ounce | **Approved:** US fl oz, converted to canonical mL with enough precision to recover the amount entered (unrounded storage, plus `entered` unit) |
| H4 | Card interaction | **Modified:** tapping the Hydration card **opens the hydration sheet** and never logs water by itself. Presets (clearly labelled) and custom amounts are in the sheet, with immediate visible feedback and Undo |
| H5 | Colour | **Approved:** restrained hydration-blue accents within the dark REFORGE system |
| H6 | Tagline | **Conditional:** "HYDRATE PERFORM RECOVER" only where it improves the composition; removed when it competes with hydration information |
| H7 | Compatibility | **Approved with additional requirements** (§10.1) |
| H8 | Settings | **Approved:** goal and unit are editable in the hydration sheet and in You. Both edit the same profile fields, so there is one value and no conflict |
| H9 | No goal | **Approved:** show the amount drunk and a clear way to set a goal; no suggested goal shown as personal, and no percentage |

### 10.1 H7: compatibility analysis (required before implementation)

| Concern | Finding | Plan in 7.3C |
| --- | --- | --- |
| Existing on-device records | Untouched: no table, column or record changes | Test: a database created before 7.3C opens unchanged, with identical nutrition totals |
| Backup export | All journals are exported, including `hydration` | Test: export, then import, round-trips hydration exactly |
| Backup restore | The current build validates every journal against a strict kind list | Add `hydration` to the list. **Unknown future kinds are kept, not discarded:** stored as opaque records and re-exported unchanged |
| Cloud sync | Journals travel as `journal`; a download that fails validation is reported, not applied | Same guard: an unknown kind is stored opaquely (never silently dropped) and its revision is recorded, so it is not re-downloaded or lost |
| Validation | Per-kind rules in `validateJournal` | Hydration rule (§3); unknown kinds get structural checks only (id, date, JSON object, size) |
| Deletion and sync consistency | Deletes queue a `journal` tombstone and `applyRemote` deletes by id, for any kind | Test: delete locally, sync, and the remote deletion removes the row on another device |
| Offline | All reads and writes are local | Test: logging, editing and deleting with no network; the outbox drains on the next sync |
| **Older app versions** | **Cannot be guaranteed retroactively.** A build without the guard rejects a backup containing `hydration` (the whole restore fails) and reports a sync error for that record. **FORGE has not been released to any store** (release blocker, [PHASE_6.md](../PHASE_6.md) §6), so no such build is in users' hands | **Ship the guard in the same release as hydration.** All store builds then tolerate future kinds. For development builds, record the limitation in the release notes: update every device before restoring a newer backup |
| Versioning | The backup format stays `version: 1` (a journal is still a journal) | If a later change alters journal structure itself, bump the backup version so older builds refuse with a clear "newer backup" message instead of failing validation |

**Tests to add in 7.3C:**

- hydration validation and limits;
- conversions and round trips;
- nutrition totals identical with water logged;
- backup round trip;
- unknown-kind backup and sync preserved, not discarded;
- delete-sync consistency;
- offline logging;
- UI card states with and without a goal;
- the card opens the sheet (no log on tap);
- preset and custom adds with Undo;
- edit and delete with confirm;
- large text and 44 pt targets.