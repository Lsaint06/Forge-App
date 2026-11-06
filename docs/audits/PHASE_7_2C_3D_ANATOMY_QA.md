# Project REFORGE — Phase 7.2C-3D: Anatomy Accuracy and Exercise Library QA

**Status:** checkpoint report for founder review. Nothing here is committed.

- **Baseline:** `6ee447c` (Phase 7.2C-3C), identical to `origin/feat/forge-paths-foundation`, clean tree.
- **Catalogue:** 367 exercises, counted from `src/data/exercises.json`. The catalogue is **unchanged** in this phase.
- **Scope:** verification and targeted, presentation-only corrections. The approved library and detail designs are unchanged.

---

## 1. Catalogue and mapping audit

A full-catalogue audit runs the production mapping, library-row and heading code over every exercise. It is not a sample.

| Check | Result |
| --- | --- |
| Exercises mapped deterministically | 367 / 367 |
| Overrides that name a real exercise | 90 / 90 (63 from 3A + 27 new) |
| Highlighted regions that exist in the atlas | All |
| Region images whose size matches the manifest and that sit inside their figure | 44 / 44, plus 4 base/shade images at 496 × 900 and 442 × 900 |
| Library row primary = detail heading = legend | **27 mismatches before; 0 after** (§2, D-1) |
| Library row secondaries ⊆ legend secondaries | All |
| Screen-reader text names every legend group | All |
| Legend says "not highlighted" only for muscles that really aren't drawn | All |

| Coverage | Count |
| --- | --- |
| Highlighted | 347 |
| Full body, nothing highlighted | 18 |
| Primary named but not drawn | 2 (`cable-internal-rotation`: subscapularis; `scapular-push-up`: serratus anterior and pectoralis minor) |
| Shown without secondary muscles | 199 |

**Reference standard.** Joint actions follow *OpenStax Anatomy and Physiology 2e*, ch. 11 (CC BY 4.0), the same source as the drawing. Two exercise-specific claims cite EMG studies:

- Kleiber T, Kunz L, Disselhorst-Klug C. *Muscular coordination of biceps brachii and brachioradialis in elbow flexion with respect to hand position.* Front Physiol 2015;6:215. Brachioradialis contribution rises significantly with a pronated grip; biceps activity does not change significantly; neutral grip showed no significant shift.
- Signorile JF et al. *Selective recruitment of the triceps surae muscles with changes in knee angle.* J Strength Cond Res 2002;16(3):433–439. Soleus activity is greater with the knee at 90°; medial gastrocnemius activity is greater with the knee straight.

Stabilisers are not highlighted: glutes in wall sits, core in carries and grip everywhere.

### Families reviewed

| Family (catalogue group · pattern) | n | Finding |
| --- | --- | --- |
| Chest · horizontal push | 49 | Presses correct (chest; triceps and front deltoids). Flies corrected in 3A. **Scapular push-up** corrected (D-6) |
| Shoulders · vertical push | 17 | Presses correct. Upright row, high pull and scaption handled in 3A |
| Shoulders · shoulder isolation | 20 | All raises, reverse flies and rotations overridden in 3A; still correct |
| Shoulders · horizontal pull / push | 4 | Face pulls (rear deltoids + upper back) correct. Pike / Hindu push-ups show the pressing deltoids + chest + triceps: acceptable |
| Back · horizontal / vertical pull, elevation | 53 | Rows (lats, trapezius, rhomboids named) and pulldowns (lats) correct. Shrugs, pullovers and straight-arm pulls handled in 3A. Rows omit the posterior deltoid, a real contributor (proposal C-17) |
| Biceps · elbow flexion | 29 | Supinated curls correct. **Pronated curls** corrected (D-4). Hammer curls unchanged: the cited study found no significant shift at neutral grip |
| Triceps · elbow extension | 22 | Correct. Dips omit chest and front deltoids (proposal C-18) |
| Quadriceps · squat | 49 | Squats, lunges and presses correct (quadriceps; glutes). Knee-extension-only work handled in 3A. Lateral lunge and Cossack squat omit the adductors (C-16) |
| Hamstrings · hinge | 21 | **Floor deadlifts, swings and pull-throughs corrected** (D-2). Romanian, stiff-leg and good mornings keep the hamstring emphasis |
| Hamstrings · knee flexion | 10 | Glutes removed in 3A; correct |
| Glutes · hip extension / isolation | 24 | Thrusts and bridges correct. Abduction and adduction handled in 3A. Back extension and reverse hyper omit the erectors (C-5) |
| Core · trunk stability / carries | 41 | **Rotation and side-bending exercises narrowed to the obliques** (D-3). Flexion and anti-extension keep both. Bird-dog, Copenhagen plank, Turkish get-up and slams are under-described, not wrong (C-4, C-5, C-20) |
| Calves · plantarflexion | 9 | **Seated and bent-knee raises corrected** (D-5). Straight-knee raises keep both muscles |
| Tibialis · dorsiflexion | 1 | Correct |
| Full body · locomotion | 18 | No highlight, as approved. **Wording corrected** (D-7). Several are lower-body led (C-14) |

### Custom exercises and missing metadata

- A known group uses the same rules as the catalogue.
- An unknown group (e.g. "Forearms & grip") is named and not drawn.
- An empty group shows "No muscle group recorded".
- The library row hides empty text.

Covered by existing tests and unchanged.

## 2. Defects found and corrections made

All corrections are presentation-only:

- `src/data/exercises.json`, programs, Paths and progression are untouched.
- No override adds a muscle group the catalogue doesn't list for that exercise. A new, stricter test enforces this, with the one documented exception: hip adduction, which the catalogue files under Glutes (C-4).

| # | Defect | Correction |
| --- | --- | --- |
| D-1 | **Library row contradicted the detail.** Rows showed the catalogue group while the legend showed the override: hip adduction read "Glutes" in the list and heading but "Adductors" in the legend; 25 others were less specific ("Shoulders" vs "Side deltoids") | One shared `primaryLabel` is used by the row, the detail heading and the legend. The Muscle filter and sort still use the catalogue group, so filtering is unchanged |
| D-2 | Floor deadlifts, kettlebell swings and cable pull-throughs showed the gluteus maximus as **secondary**. It is a prime mover of hip extension | 12 overrides: primary Hamstrings + Glutes (swings and pull-through: Glutes + Hamstrings) |
| D-3 | Rotation and side-bending exercises lit the whole abdominal wall | 9 overrides narrow to the obliques (Russian twist, heel touch, woodchops ×2, rotational throw, side bends ×2, side plank ×2) |
| D-4 | Pronated (reverse) curls named only the biceps brachii | 3 overrides add the brachioradialis, named as "Forearm" and noted "Brachioradialis not highlighted" (the drawing has no forearm region) |
| D-5 | Seated and bent-knee calf raises lit both calf muscles equally | 2 overrides: soleus primary, gastrocnemius secondary |
| D-6 | Scapular push-up claimed chest + triceps + front deltoids, though the elbows and shoulders do not move | Primary: scapular protractors (serratus anterior, pectoralis minor), named and not highlighted; no secondaries |
| D-7 | Full-body wording "No single muscle group leads this movement" is false for cycling, stair climbing and sled pushes | "Muscle use depends on the machine and technique, so no single group is highlighted." The screen-reader text now says the same |
| D-8 | Legend note "Not visible on the figures" was inaccurate for muscles that are visible but not separate regions, and implied a whole row was hidden when only one muscle was | "Not highlighted on the figures", or "*name* not highlighted" for a partly drawn row |
| D-9 | Legend swatches below 3:1 non-text contrast: copper on dark 2.27, ember on light 2.83 | 1 pt edge in each highlight's darker tone (`#D24A14`, `#C0662C`): 4.06–4.79 in both themes |
| D-10 | Base and shade layers were sized to a **rounded** figure width while the region layers used the exact scale: up to 0.5 pt drift at the far edge | The figure keeps its exact width; one scale for every layer (tested) |
| D-11 | In-app credit did not link the original OpenStax figure or its CC BY 4.0 licence | Two links added |

## 3. Proposed catalogue corrections (need founder approval; not applied)

**What the engine reads** (verified in code for this report):

- Programs, Forge Paths and progression reference exercises **by id only**.
- `secondary` is display only.
- `pattern` affects display and search text only.
- `muscle` (the primary group) drives:
  - the library and picker **filters**, which is how manual substitution finds alternatives;
  - the **Progress muscle-volume** counts, which credit each set to the primary group at read time. Changing a group re-buckets past workouts.

The 3A warning about "engine impact" for pattern changes (C-10) is therefore lower than stated: patterns affect search and display only.

| # | Proposal | Exercises | Effect |
| --- | --- | --- | --- |
| C-1 – C-3 | Remove triceps / biceps / glutes listed by per-pattern default (3A §6) | 53 | Data matches the display; overrides can then be removed. Display only |
| C-4 | New group **Adductors**: hip adduction ×2 (primary), Copenhagen plank (primary), sumo deadlift, lateral lunge, Cossack squat (secondary) | 6 | New filter value; Progress volume moves for adduction and Copenhagen sets |
| C-5 | New group **Lower back** (erector spinae) as secondary: deadlifts, rack pull, good mornings, back extension, reverse hyper, bird-dog | ~13 | Display; region already exists |
| C-6 – C-9 | Additions from 3A §6 (quads on floor deadlifts; traps on upright row / high pull; upper back on reverse flies; chest on pullover) | about 10 | Display only |
| C-10 | Pattern fixes (upright row and high pull "vertical push"; pullovers "horizontal pull"; pike push-up "horizontal push"; scapular push-up "horizontal push") | about 8 | **Search and display only** (corrected impact) |
| C-12 | Scapular push-up: remove Triceps + Shoulders; consider a primary of Shoulders (serratus has no group) | 1 | Filter and volume move if the primary changes |
| C-13 | Kettlebell swings and cable pull-through: primary **Glutes** instead of Hamstrings | 3 | Filter and volume move |
| C-14 | Stationary bike, stair climber, sled push / pull, treadmill walk / run: consider Quadriceps / Glutes instead of Full body | up to 8 | Filter and volume move; conditioning stays conditioning |
| C-16 | Adductors secondary on lateral lunge and Cossack squat | 2 | With C-4 |
| C-17 | Rear deltoids (Shoulders) as secondary on rows | 31 | Display only |
| C-18 | Chest + Shoulders as secondary on dips | 2 | Display only |
| C-20 | Turkish get-up and medicine-ball slam: consider Full body | 2 | Filter and volume move |

**Founder decision (7.2C-3D review):** not applied. These proposals stay here for separate review; changes to primary groups, filters, substitution or Progress history need explicit approval. The display-only overrides remain.

**Recommendation:**

- Approve the display-only items (C-1 – C-3, C-5 – C-10, C-17, C-18) together, as one data correction with tests.
- Decide C-4, C-12 – C-14 and C-20 individually, because they change filters and Progress volume history.

## 4. Performance

**Measured** on the development machine (Node 24, `tsx`); device numbers still need the iPhone:

| Measure | Result |
| --- | --- |
| Row text for the full catalogue (367 rows) | 0.30 ms per pass (≈ 0.8 µs per row) |
| `muscleMap` + `litRegions` for the full catalogue | 0.12 ms |
| Anatomy PNGs bundled | 48 files, 0.91 MB on disk; the 342 KB source SVG is not bundled (`require`d nowhere) |
| iOS / Android export | 48 anatomy assets in each bundle; JS bundle 7.8 MB, unchanged |
| Library list | `FlatList`, 12 rows first render, window 11 screens, memoised rows. Test: far fewer rows mounted than the catalogue holds |
| Detail screen | 4 always-on images (base + shade × 2) + at most 3 region crops. No SVG, no filters, no animation |

**Calculated (upper bound, full-resolution RGBA decode)**:

- Base + shade for both figures: 6.44 MB.
- Region crops: 0.20 MB on average, 0.46 MB at worst (`barbell-bent-over-row`).
- Released when the screen unmounts. iOS may decode smaller at the displayed size.

**Offline:**

- Every anatomy image is a bundled `require`.
- The only network use is the four credit links, opened in the browser on tap.
- Library and detail have no other network calls (code search).

**Not measured here:** scroll frame rate, image decode time and resident memory on a device. These need the founder's iPhone (§9).

## 5. Accessibility and themes

WCAG contrast, computed from the theme values:

| Element | Dark | Light |
| --- | --- | --- |
| Exercise name / body text on card | 17.39 | 18.47 |
| Secondary text | 8.22 | 7.23 |
| Star outline (non-text, 3:1) | 4.12 | 4.74 |
| Ember dot / star / pill label | 6.86 / 6.17 | 5.18 / 4.64 |
| Legend swatch edges (D-9) | 4.38 / 4.79 | 4.44 / 4.06 |
| Neutral figure vs card | 1.86 (dark figure on a near-black card, as approved) | 10.45 |
| Primary highlight vs neutral muscle | 3.69 | same artwork |
| Secondary highlight vs neutral muscle | 1.22 fill, 2.58 edge | same artwork |

- **Secondary highlight:** deliberately subordinate and approved, but it is mostly a hue difference. Colour is not the only cue: the legend and the screen-reader label name every muscle and its role.
- **Screen readers:**
  - Each figure pair is one image labelled with the full legend text.
  - Each legend row has its own label.
  - Each library row's hint reads "primary · also secondary · equipment · pattern".
  - All are tested.
- **Touch targets** (tested at 320 pt width and 150 % text):
  - rows ≥ 72 pt;
  - star 52 × 72 pt;
  - segments, Filters, pills, Back, Add to workout and the credits link ≥ 44 pt.
- **Large text:** `FText` caps scaling per variant. Names wrap to two lines and the muscle line truncates to one.
- **Scaling:** the figures fit side by side at every iPhone width from 320 to 440 pt (tested), between 160 and 300 pt tall.
- **Light theme:** the figures keep their dark artwork on a white card, the same aesthetic as approved.

## 6. Asset licensing status

| Item | Status |
| --- | --- |
| Source, authors and licence | Re-verified via the Wikimedia Commons API: artist "OpenStax & Tomáš Kebert & umimeto.org", CC BY-SA 4.0, attribution required, no other restrictions, upload 13 September 2020, unchanged |
| `assets/anatomy/LICENSE.md` | Credits, licence, changes and source hash present. Distribution note **corrected** (below) |
| In-app credit | On every exercise detail, 44 pt button, opens a sheet with authors, licence, changes and four links (D-11). Tested |
| ShareAlike | The adapted atlas, build script and images are in the public repository under CC BY-SA 4.0 |
| Not represented as FORGE-owned | LICENSE.md, ASSETS.md and the in-app text say so |

**Correction to the 3A conclusion (L2).** 3A said the "no technological measures" condition was satisfied by publishing in the public repository. Creative Commons' FAQ is stricter:

> "if you remix a CC-licensed song, and you wish to share it on a music site that places digital copy-restriction on all uploaded files, you may not do this without express permission from the licensor. However, if you upload that same file to your own site … and a listener chooses to stream it through an app that applies DRM, you have not violated the license."
> — creativecommons.org/faq, "Can I use effective technological measures (such as DRM) when I share CC-licensed material?"

The FAQ also notes that converting material to a format that is hard to access, or available only on some platforms, is not a violation.

### Questions to settle before app-store release (not legal advice)

**Status: release blocker.** Recorded in [PHASE_6.md](../PHASE_6.md) §6. Founder decision (7.2C-3D review): keep the credited atlas for development, keep its licence and attribution, and keep the option to replace the geometry with commissioned or licensed artwork.

1. **App Store / FairPlay.**
   - Does Apple's encryption of the app (and its terms) count as an effective technological measure applied to the atlas images?
   - The images ship as separate asset files; FairPlay encrypts the executable.
   - Counsel should decide whether parallel publication in the repository is enough.
2. **Google Play.** Same question; normally no DRM applies to app assets.
3. **Express permission.** The cleanest route is written permission from umimeto.org / Tomáš Kebert to distribute the adapted atlas in store builds. OpenStax's CC BY 4.0 has the same DRM clause, so its permission may also be needed.
4. **Store screenshots and marketing.** Any image showing the atlas is a copy of CC BY-SA material and needs the credit (e.g. in the store description).
5. **Repository visibility.** If the repository ever goes private, publish the atlas folder publicly elsewhere first.
6. **Fallback.** A commissioned FORGE-owned atlas can replace the drawing without screen changes (3A §3.4).

Development builds through Expo Go are not app-store distribution. The question applies to store release.

## 7. Tests

| Check | Result |
| --- | --- |
| Typecheck, format, whitespace | Clean |
| Lint | 0 errors; 1 existing warning in `tests/ui/templates-wp3.test.tsx` (not touched) |
| Logic tests | 398 / 398 |
| UI tests | 37 suites, 387 / 387 |
| Food library | 3,730 foods, reproducible |
| iOS / Android export | OK; 48 anatomy assets in each; JS bundle 7.8 MB |
| Full-catalogue audit | 0 defects |
| New / changed logic tests | Stricter override rule (every override muscle comes from the exercise's listed groups); 3D corrections; `primaryLabel`; row = heading = legend for the whole catalogue; heading words |
| New / changed UI tests | Partly hidden primary; heading-legend-figure agreement and swatch edges; figure fit 320–440 pt and single layer scale; library row wording while the Glutes filter keeps hip adduction; four credit links |
| Updated expectations | Deadlift (glutes now primary), full-body wording, "Not highlighted" wording, row primary rule. Each replaced with the reviewed expectation, none removed |

## 8. Remaining risks

| Risk | Level | Mitigation |
| --- | --- | --- |
| App-store DRM clause (§6) | **Release blocker** (founder decision, 7.2C-3D review); recorded in [PHASE_6.md](../PHASE_6.md) §6 | Counsel and/or licensor permission; FORGE-owned atlas as fallback. The atlas stays credited and in use for development |
| Catalogue groups remain coarse (one primary group per exercise; per-pattern secondary defaults) | Medium | 90 reviewed overrides; §3 proposals |
| Filter vs label wording: hip adduction appears under the Glutes filter but reads "Adductors" | Low | C-4 |
| Device performance not measured | Low–medium | Founder iPhone checks; worst-case decoded memory is about 7 MB |
| Secondary highlight relies on hue | Low | Legend text and screen-reader labels |
| Muscles named but not drawn (subscapularis, serratus anterior, pectoralis minor, brachioradialis) | Low | Stated in the legend |

## 9. Founder iPhone verification

1. **Library scroll:** fling through all 367 exercises in All, then A – Z and By muscle. Look for dropped frames or blank rows.
2. **Rows:** hip adduction reads "Adductors", lateral raise "Side deltoids", conventional deadlift "Hamstrings · Glutes".
3. **Detail:**
   - Conventional deadlift: hamstrings and glutes both ember.
   - Russian twist: obliques only.
   - Seated calf raise: soleus ember, gastrocnemius copper.
   - Reverse barbell curl: "Brachioradialis not highlighted".
   - Scapular push-up: no highlight, protractors named.
4. **Full body:** treadmill run shows the new sentence.
5. **Swatches:** the legend squares' new 1 pt edge looks right in dark and light.
6. **Credits:** four links open in the browser.
7. **Offline:** airplane mode, open five exercises. Every figure and highlight loads.
8. **Sizes and text:** smallest and largest iPhone; Larger Text at its maximum on the library and the detail.
9. **Memory (optional):** open and close twenty exercise details in a row. The app stays responsive.
