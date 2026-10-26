# Project REFORGE — Phase 7.2C-3A: Anatomy Atlas Foundation

**Status:** checkpoint report for founder review.

- **Not done yet:** no screen uses the atlas. The exercise detail and library screens are unchanged. The exercise catalogue is unchanged.
- **Prototype:** approved, in section 9 of [PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md](PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md).
- **Baseline:** `5201715` (Phase 7.2C-2), identical to `origin`, clean tree.
- **Catalogue:** 367 exercises, counted from the repository.

---

## 1. Licensing findings (mandatory gate)

### 1.1 Source chain (verified on Wikimedia Commons file pages)

| Layer | Work | Author | Licence |
| --- | --- | --- | --- |
| Original | *1105 Anterior and Posterior Views of Muscles*, OpenStax Anatomy and Physiology (2016) | OpenStax (Rice University) | **CC BY 4.0** |
| Adaptation used by FORGE | *Muscles front and back.svg* (2020-09-13), "manually redrawn and modified (especially the back view)" | **OpenStax & Tomáš Kebert (Nefronus) & umimeto.org** | **CC BY-SA 4.0** |
| FORGE adaptation | Recoloured, relit, cropped, region-extracted atlas | FORGE, adapting the above | **must be CC BY-SA 4.0** |

**Correction to the 7.2C-0 proposal:** the credit is not "Nefronus" alone. The Commons page names three authors and records that the drawing derives from OpenStax. All must be credited.

### 1.2 Obligations and how FORGE meets them

| CC BY-SA 4.0 requirement | How it is met | Status |
| --- | --- | --- |
| Credit the creators (all three, plus the OpenStax original) | [assets/anatomy/LICENSE.md](../../assets/anatomy/LICENSE.md). In-app credits are added in 7.2C-3B (decision L1) | File done; in-app pending 3B |
| Licence notice and link | Same file, linked to the licence deed | Done |
| Link to the material | Commons URLs for both source files | Done |
| Indicate modifications | "Changes made by FORGE" list in LICENSE.md, plus the reproducible build script [scripts/anatomy/build.mjs](../../scripts/anatomy/build.mjs) | Done |
| **ShareAlike:** adapted material under CC BY-SA 4.0 | The atlas files (source SVG, build script, generated images) are declared CC BY-SA 4.0. FORGE's app code is a separate work and is not affected | Done |
| **No additional restrictions or technological measures** that stop recipients exercising the licence | App-store packaging (encryption, store terms) could restrict copying the images out of the app. **Mitigation:** the adapted atlas is published unrestricted in FORGE's **public** GitHub repository (verified public), so anyone can obtain and reuse it under CC BY-SA. Creative Commons' FAQ allows access limits that do not stop recipients exercising the licensed rights | Satisfied by repository publication (decision L2) |
| No implied endorsement | The credit text makes no endorsement claim | Done |
| Not represented as FORGE-owned | LICENSE.md says so explicitly; ASSETS.md records it | Done |

**Conclusion:** the licence can be satisfied with confidence provided the repository stays public (or the atlas folder is published elsewhere publicly) and the in-app credit ships with 7.2C-3B. This is not legal advice. If FORGE plans a closed-source future, confirm L2 with counsel before then, or commission a Forge-owned atlas (the swap needs no screen changes; see §3.4).

## 2. Production asset inventory

All files are bundled locally, so the atlas works offline. Total **1.21 MB**, 48 files plus the source.

| Path | Purpose | Size |
| --- | --- | --- |
| `assets/anatomy/source/muscles-front-and-back.svg` | Unmodified source (SHA-256 `56AAE1C8…24E5F3`) | 342 KB |
| `assets/anatomy/LICENSE.md` | Licence, credits, changes, distribution | — |
| `assets/anatomy/front/base.png`, `back/base.png` | Flat figure (496 × 900, 442 × 900 px; 3× a 300 pt figure) | 107 / 83 KB |
| `assets/anatomy/front/shade.png`, `back/shade.png` | Lighting, edge shading, contours and fibre lines as a white/black alpha overlay | 173 / 122 KB |
| `assets/anatomy/{front,back}/<region>.primary.png` | Ember region highlight, cropped, with a soft halo outside the body | 22 files |
| `assets/anatomy/{front,back}/<region>.secondary.png` | Copper region highlight with copper edge, cropped | 22 files |
| `src/anatomy/atlas.generated.ts` | Generated manifest: sizes, region crops and offsets, `require`s | — |
| `scripts/anatomy/build.mjs` | Reproducible build (`node scripts/anatomy/build.mjs`, local Edge headless, about 5 s). **Two runs produce byte-identical images** | — |

## 3. Muscle-region architecture

### 3.1 Regions

There are 22 regions, each built from source `<path>` indices. Mirrored halves are `<use>` copies and light up with their original.

| Front | Source paths | Back | Source paths |
| --- | --- | --- | --- |
| `pectoralis-major` | 80 | `trapezius` | 163 |
| `deltoid` (anterior + lateral) | 77 | `deltoid` (posterior + lateral) | 152 |
| `biceps` | 84 | `infraspinatus` | 135 |
| `trapezius` (upper) | 70 | `teres-major` | 133 |
| `rectus-abdominis` | 89–92 | `latissimus-dorsi` | 136 |
| `obliques` | 69 | `triceps` | 149, 150 |
| `quadriceps` | 26, 23, 21 | `erector-spinae` (thoracolumbar area) | 137 |
| `adductors` | 24 | `obliques` | 129 |
| `tibialis-anterior` | 15 | `gluteus-medius` | 130 |
| | | `gluteus-maximus` (clipped at the gluteal fold; the source shape runs down the outer thigh) | 128 |
| | | `hamstrings` | 114, 115, 119–122 |
| | | `gastrocnemius` / `soleus` | 167, 168 / 112, 113 |

**Verified by:**

- hit-testing anatomical landmarks;
- a colour-coded check render of every region.

**Deliberately excluded:**

- 71 (clavicle);
- 99 (fibre lines only);
- 22 (small knee strip; not clearly quadriceps);
- 164 (central tendon);
- 117 (gracilis);
- forearms, neck and face.

`teres-major`, `erector-spinae` and `infraspinatus` exist for approved overrides and future corrections.

### 3.2 Rendering technique (no runtime SVG effects)

react-native-svg cannot draw the prototype's lighting filters, so the look is baked into images. On the device a figure is a stack of plain `Image`s:

1. **base** (flat figure);
2. the **lit regions** (primary or secondary crop at its offset);
3. **shade** (lighting and line overlay).

The shade layer is computed as the per-pixel difference between a lit render and the flat render (white or black with alpha). The same sculpting therefore falls on charcoal, ember and copper alike, and the stack reproduces the prototype. Region highlights are masked by what lies above them in the drawing, so overlapping muscles stay correct.

**Glow:** primary regions keep their glow only outside the body silhouette. A glow inside the body tinted neighbouring muscles, which the prototype did not.

### 3.3 Code (presentation only; never read by programs or progression)

| File | Role |
| --- | --- |
| [src/anatomy/types.ts](../../src/anatomy/types.ts) | `RegionId`, `MuscleEntry`, `MuscleMap`, atlas types |
| [src/anatomy/groups.ts](../../src/anatomy/groups.ts) | Catalogue group → regions and legend text, narrowed by movement pattern only where the joint action is unambiguous |
| [src/anatomy/overrides.ts](../../src/anatomy/overrides.ts) | 63 exercise-specific overrides, each with its reason |
| [src/anatomy/mapping.ts](../../src/anatomy/mapping.ts) | `muscleMap(exercise)`, `litRegions(map)`, `spokenMuscles(map)` (screen-reader text) |
| `src/anatomy/atlas.generated.ts` | Generated asset manifest |

### 3.4 Replaceability

The screens will depend on `RegionId`s and the generated manifest, never on the drawing. To replace the atlas with a commissioned or licensed one:

1. Supply the new source.
2. Update `REGIONS` in the build script.
3. Rebuild.

No screen changes are needed.

## 4. Representative renders

These are browser compositions of the **production layers**, stacked exactly as React Native will stack them, with offsets from the generated manifest. They are not screenshots of the app; the app integration is 7.2C-3B.

The files are in `Desktop\Forge anatomy prototypes\7.2C-3A production renders\`:

| File | Contents |
| --- | --- |
| 1 | Barbell bench press: approved prototype beside the production assets |
| 2 | Lat pulldown: prototype beside production |
| 3 | Back squat: prototype beside production |
| 4 | Override examples: dumbbell fly (triceps removed), lateral raise (side deltoids, both views), Romanian deadlift, treadmill run (full body, no highlight) |

**Refinements applied (A5):**

- Neutral muscles are lifter (`#353940` → `#3B4047`).
- Primary emphasis is unchanged.
- Secondary stays muted copper with a copper edge.
- **Vertical space:** figures are cropped tight to the body, so the anatomy card is about 70 pt shorter with larger figures.
- The developer text is removed.

## 5. Mapping accuracy findings

**Reference:** joint actions per *OpenStax Anatomy and Physiology 2e*, ch. 11 (CC BY 4.0), the same source as the drawing. Prime movers and meaningful secondary contributors are shown; stabilisers are not.

### 5.1 Coverage

| Category | Exercises |
| --- | --- |
| Total exercises | 367 |
| Shown with highlights | 349 |
| Full body (no highlight; "Full body · conditioning") | 18 |
| Shaped by an override | 63 |
| Showing no secondary muscles | 170 |
| Primary named but not drawn (subscapularis is not visible) | 1 (`cable-internal-rotation`) |

### 5.2 The catalogue's secondary muscles are per-pattern defaults

Every exercise sharing a group and movement pattern has identical secondaries. Examples:

- all 49 chest pushes list Triceps + Shoulders;
- all 19 shoulder-isolation exercises list Triceps;
- all 10 knee-flexion exercises list Glutes.

The defaults are right for most presses and wrong for several movement families.

### 5.3 Overrides applied (presentation only, never adding a muscle)

| Reason | Exercises | Display |
| --- | --- | --- |
| Chest fly: fixed elbow | 9 | Triceps removed; front deltoids kept. Squeeze presses keep the triceps (they press) |
| Front raise | 4 | Front deltoids only; triceps removed |
| Lateral raise / upright row | 7 | Side deltoids (both views); triceps removed |
| Reverse fly / pull-apart / reverse pec deck | 5 | Rear deltoids; triceps removed |
| External rotation | 3 | Rotator cuff (infraspinatus, teres minor); triceps removed |
| Internal rotation | 1 | Rotator cuff (subscapularis), named, not drawn |
| Y raise, scaption | 2 | Triceps removed |
| High pull | 1 | Deltoids (not "press"); triceps removed |
| Shrugs | 3 | Biceps removed |
| Straight-arm pulldown, cable pullover, scapular pull-up | 3 | Biceps removed |
| Dumbbell / machine pullover | 2 | Lats (not a row); biceps removed |
| Leg curls (incl. Nordic, GHR) | 10 | Glutes removed (stabilisers) |
| Leg extension, sissy squat, reverse Nordic | 4 | Glutes removed |
| Hip adduction | 2 | **Adductors** instead of glutes |
| Hip abduction (incl. walks, clamshell, fire hydrant) | 7 | Gluteus medius |

Face pulls need no override: the pattern rule already gives rear deltoids plus upper back. Every override is covered by tests, and none adds a muscle the catalogue does not list (also tested).

### 5.4 Ambiguities shown conservatively

| Case | Display |
| --- | --- |
| Core (41) | Rectus abdominis and obliques together; the data does not separate them |
| Shoulder presses (17) | "Shoulders: anterior and lateral deltoid", front view |
| Rows (31) | Lats and trapezius; rhomboids named, not drawn (they lie under the trapezius) |
| Biceps group, incl. hammer and reverse curls | Biceps brachii. Brachialis and brachioradialis are not separated in the data |

## 6. Proposed catalogue corrections (A2: for review, not applied)

These change the authoritative catalogue, so each needs approval. **Movement-pattern changes may affect program substitution and must be checked against the training engine before any change.**

| # | Proposal | Exercises | Effect |
| --- | --- | --- | --- |
| C-1 | Remove **Triceps** from secondaries | 9 chest flies, 19 shoulder-isolation exercises, wide-grip upright row, snatch-grip high pull, dumbbell scaption (31) | Data matches the overrides; overrides can then be deleted |
| C-2 | Remove **Biceps** | 3 shrugs, straight-arm pulldown, cable / dumbbell / machine pullover, scapular pull-up (8) | Same |
| C-3 | Remove **Glutes** | 10 knee-flexion exercises, leg extension ×2, sissy squat, reverse Nordic (14) | Same |
| C-4 | Primary **Adductors** (new group value) | Cable / machine hip adduction (2); also Copenhagen plank (currently Core) | Adds a filter value in the Exercise Library |
| C-5 | Add **Lower back** (erector spinae) as secondary | Conventional, deficit, paused, snatch-grip, sumo, trap-bar deadlift, rack pull, good morning ×2, back extension, reverse hyperextension | New group value; the atlas region exists |
| C-6 | Add **Quadriceps** as secondary | Conventional, trap-bar and deficit deadlift | Knee extension off the floor |
| C-7 | Add **Trapezius** as secondary | Wide-grip upright row, snatch-grip high pull | Scapular elevation and upward rotation |
| C-8 | Add **Back (upper back)** as secondary | Reverse flies, band pull-apart | Scapular retraction |
| C-9 | Add **Chest** as secondary | Dumbbell pullover | Shoulder extension from flexion |
| C-10 | Pattern review (**engine impact**) | Upright row and high pull filed as "vertical push"; pullovers as "horizontal pull"; scaption as "vertical push"; pike / Hindu push-up as "horizontal push" | Only after checking substitution logic |
| C-11 | Leave unchanged (stabilisers) | Glutes in wall sits; core in carries; forearms everywhere | No change |

Deltoid heads are recommended to stay a **presentation** distinction (overrides), not new catalogue groups, so filters stay simple.

## 7. Performance

| Measure | Value |
| --- | --- |
| Assets | 1.21 MB on disk, outside the JS bundle. Loaded only on exercise detail (3B); the list draws no artwork (3C) |
| Decoded memory (detail screen) | About 6.8 MB for both figures' base and shade, plus 0.1–0.5 MB per lit region crop; released on leaving the screen |
| Views per figure | 2 + lit regions (typically 4–6 `Image`s per figure); no SVG, no filters, no animation |
| JS cost | `muscleMap` is a few lookups; mapping all 367 exercises twice with every check takes about 3 ms in tests |
| Exports | iOS and Android export unchanged at 7.8 MB (the atlas is not yet imported) |

**Not yet measured on device:** decode time and scrolling on the detail screen. Those are 7.2C-3B iPhone checks.

## 8. Verification

| Check | Result |
| --- | --- |
| Typecheck, format | Clean |
| Lint | 0 errors; 1 existing warning |
| Logic tests | 389/389, 8 new in [tests/anatomy.test.ts](../../tests/anatomy.test.ts) |
| UI tests | 35 suites, 367/367, unchanged |
| Food library | 3,730 foods |
| iOS / Android export | OK |
| Atlas build | Reproducible, byte-identical |

The new tests cover:

- the three prototypes;
- every catalogue exercise mapping deterministically to drawn regions only;
- no region being both primary and secondary;
- overrides naming real exercises and never adding a muscle;
- flies versus squeeze presses;
- deltoid heads;
- hip, knee and back cases;
- no-secondary, full-body and custom exercises (unknown groups are named, not drawn);
- the spoken legend.

## 9. Decisions for the founder

| # | Decision | Recommendation |
| --- | --- | --- |
| L1 | Where the in-app credit appears | **You → About → "Anatomy illustration" credit row with the licence link**, plus the `LICENSE.md` file · alternative: a small "Anatomy credits" link under the figures |
| L2 | ShareAlike distribution | **Keep the atlas published in the public repository** (as now) · or publish the atlas folder separately before the repository ever goes private |
| A1 | Production source | **Approve the CC BY-SA atlas as built**; a commissioned Forge-owned atlas can replace it later without screen changes |
| A2 | Catalogue corrections §6 | **Approve C-1 to C-3 (removals) now; review C-4 to C-9 (additions) individually; defer C-10 until the engine check** |
| A5 | Production renders §4 | Founder review of the comparison images |
| 3B | Start 7.2C-3B (exercise detail) | After the above |
