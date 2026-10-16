# Forge Paths programming specification (Planner 8)

Status: implemented in `src/domain/paths/policy.ts` (prescriptions and volume), `src/domain/paths/generator.ts` (weekly blueprints and generation) and `src/domain/paths/programQuality.ts` (validation). Written 2026-10-16.

This is Forge's own programming system. Its primary philosophical influence is Jeff Nippard's **publicly documented**, science-based approach to training. Forge is not affiliated with or endorsed by Jeff Nippard. No proprietary program content (exercise tables or set/rep tables from paid programs) was accessed or reproduced. Numeric rules are anchored to the peer-reviewed sources listed below. Where the evidence does not settle a value, the rule is labelled **provisional**, and the chosen value is a conservative coaching default.

## 1. Sources actually reviewed

| Source | Access | Used for |
|---|---|---|
| jeffnippard.com (home, Pure Bodybuilding Program, Bodybuilding Transformation System and The Muscle Ladder product pages) | Public pages read | General philosophy only: science-based hypertrophy, machine/cable emphasis for stability and tension, substitution options, flexible 2–6 day splits |
| YouTube `71op1DQ2gyo` "How To Train For Pure Muscle Growth" (Jeff Nippard) | Title and channel verified; transcript **not** accessible | Not used for any rule |
| Nippard videos on volume (`qwv3JqOUqWs`) and lengthened partials (`ftpH4-xFGQI`) | Title verified; transcripts **not** accessible | Not used for any numeric rule |
| Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci* 35(11):1073-82, doi:10.1080/02640414.2016.1210197 | Abstract | Weekly volume dose-response |
| Schoenfeld, Grgic & Krieger 2019, *J Sports Sci* 37(11):1286-95, doi:10.1080/02640414.2018.1555906 | Abstract | Frequency with volume equated |
| Baz-Valle et al. 2021, *J Strength Cond Res* 35(3):870-878, doi:10.1519/JSC.0000000000002776 | Abstract | Counting hard sets as the volume unit |
| Refalo et al. 2023, *Sports Med* 53(3):649-665, doi:10.1007/s40279-022-01784-y (PMC9935748) | Abstract (open access) | Failure vs non-failure |
| Robinson, Pelland et al. 2024, *Sports Med* 54(9):2209-2231, doi:10.1007/s40279-024-02069-2 | Abstract | Proximity to failure, hypertrophy and strength |
| Schoenfeld, Grgic, Ogborn & Krieger 2017, *J Strength Cond Res* 31(12):3508-3523, doi:10.1519/JSC.0000000000002200 | Abstract | Low vs high load |
| Lopez et al. 2021, *Med Sci Sports Exerc* 53(6):1206-1216, doi:10.1249/MSS.0000000000002585 (PMC8126497) | Abstract (open access) | Load ranges to failure |
| Schoenfeld et al. 2016, *J Strength Cond Res* 30(7):1805-1812, doi:10.1519/JSC.0000000000001272 | Abstract | Rest intervals |
| ACSM Position Stand 2009, *Med Sci Sports Exerc* 41(3):687-708, doi:10.1249/MSS.0b013e3181915670 | Abstract | Novice loading and frequency, strength loading, rest, exercise order, load increments |
| Coleman et al. 2024, *PeerJ* 12:e16777, doi:10.7717/peerj.16777 (PMC10809978) | Design and rationale; **outcome not confirmed** | Deloads (provisional only) |
| Pedrosa, Pereira & Kassiano 2026, *Sports Med Int Open*, doi:10.1055/a-2733-7605 (PMC12951042) | Abstract (open access) | Long muscle lengths and exercise selection |
| Larsen, Wolf, Schoenfeld et al. 2025, *J Sports Sci*, doi:10.1080/02640414.2025.2481534 | Abstract | Counter-example: stretch/ROM effects are not universal |

Not found: a "Bell et al. 2023 deload Delphi consensus" (no Europe PMC match). Some Nippard video IDs and quotes surfaced by web search did not exist, so nothing attributed to Nippard beyond his public product pages is encoded as a rule.

## 2. Rules

Strength labels: **strong** (consistent meta-analytic or consensus support), **context** (supported, but depends on population or exercise), **provisional** (reasonable inference or practice-based; revisit as evidence emerges).

| # | Rule (Forge implementation) | Evidence | Applies to | Modify when | Strength |
|---|---|---|---|---|---|
| 1 | Weekly direct sets per muscle (major / small muscles). Hypertrophy: Beginner 6–12 / 2–8, Intermediate 10–18 / 6–12, Advanced 12–22 / 8–16. Recomp/athletic and strength use lower ranges (§3). The floor is capped by how many sessions train the muscle: about 3 direct sets per full-body session (≤3 days) and 5 per split session, plus 1 for a priority muscle. Generated defaults stop at about 60% of the range ("default ceiling") so they favour the minimum effective workload; the full ceiling remains for Evolution and user choice | Volume dose-response trend (Schoenfeld 2017); hard sets as the unit (Baz-Valle 2021); frequency matters little when volume is equated, but per-session capacity is limited (Schoenfeld 2019) | Healthy adults | Deficit, poor recovery, soreness, injury history: stay low. Priorities: floor +2, ceiling +4 | Strong (direction); provisional (exact numbers, per-session dose, default ceiling) |
| 2 | Volume counting. **Direct sets**: exercises whose primary target is the muscle; only these count toward floors. **Secondary involvement**: compounds that also list the muscle (glutes in squats and hinges). It is shown separately and counted as an estimate at 0.5 per set, only for ceilings and fatigue warnings. That weight is a planning convention, not a validated conversion. **Supporting** work (for example triceps in a press) is reported for context only | No peer-reviewed fractional standard found | All | — | Provisional (heuristic) |
| 3 | Per-session load for one muscle above 8 / 10 / 12 (Beginner / Intermediate / Advanced) gives a warning. Generated split sessions stay within 18 / 22 / 26 sets and full-body sessions within 18 / 21 / 22 sets with at most 7 exercises; any session above 30 is an error | Inference from frequency/volume literature (Schoenfeld 2019); no direct ceiling study | All | Advanced specialization | Provisional |
| 4 | Sets per exercise: 2–3 by default; generated work never exceeds 3 (beginner) or 4 sets; 5 is allowed by user choice with a warning; 6+ is an error. Advanced lifters get the same or fewer sets per lift with closer proximity to failure | Volume is distributed across exercises and days rather than piled onto one lift (rules 1, 3) | All | — | Context |
| 5 | Rep ranges by purpose: session-anchor compound 6–8 (Intermediate/Advanced) or 8–10 (Beginner); other free-weight compounds 8–10 / 8–12; machines and cables 8–12 / 10–12; isolation 10–15 / 12–15; core 8–15 | Similar hypertrophy across loads when sets are hard (Schoenfeld 2017 load; Lopez 2021); novices 8–12RM (ACSM 2009) | All | Joint comfort, exercise skill | Strong (load equivalence); context (specific ranges) |
| 6 | Effort (reps in reserve): Beginner 2–3; Intermediate 1–2; Advanced 1–2 on compounds and 0–1 on isolation/machines. Failure is never required on heavy free-weight compounds | Trivial benefit of failure (Refalo 2023); closer to failure helps hypertrophy but not strength (Robinson 2024) | All | Technique breakdown, injury history | Context |
| 7 | Rest: heavy strength lifts 3:30–4 min; session-anchor compounds 2:30–3 min; other compounds 2–2:30 min; isolation 1:15–1:30 min; core 1 min. Heavy (≤6 rep) compounds with under 2:30 min rest get a warning | 3 min > 1 min for strength and hypertrophy (Schoenfeld 2016); 3–5 min for strength, 1–2 min for hypertrophy (ACSM 2009) | All | Time pressure is not a reason (Paths have no time limits) | Strong (strength); context (hypertrophy) |
| 8 | Frequency and splits: full body for 1–3 days, upper/lower for 4, upper/lower + push/pull for 5, push/pull/legs ×2 for 6; each major muscle trained at least twice a week where frequency allows | Frequency has little effect when volume is equated (Schoenfeld 2019); splits are a tool for distributing volume | All | Beginners: 2–4 days, with a warning above 4 (ACSM 2009) | Strong |
| 9 | Exercise order and selection: compounds before isolation; one heavy anchor per session; second-day variants (pull-up/dumbbell row, incline/flat) instead of repeating the same lift in one session; no more than 3 exercises for one primary muscle per session | Order (ACSM 2009); long-length benefits are exercise-dependent (Pedrosa 2026; Larsen 2025) | All | Equipment, exclusions | Strong (order); context (selection) |
| 10 | Progression: double progression. One load for all working sets; add reps within the range; when every set reaches the top at the target effort (logged RPE ≤ 9 or RIR ≥ 1) for two sessions, add the smallest increment. Strength main lifts use fixed or narrow ranges with load progression | ACSM 2009: 2–10% increase when 1–2 reps above target; double progression itself is practice-based | All | Bodyweight movements: add reps, then tempo or load | Strong (increment rule); provisional (double-progression method) |
| 11 | Stalls and deloads: if the bottom of the range is missed for two sessions in a row, reduce that load about 10% and rebuild; if several lifts stall or joints ache, take a lighter week (same exercises, about half the sets, 3–4 RIR). No automatic deload | Coleman 2024 RCT exists; its outcome was not verified | All | — | Provisional |
| 12 | Strength Path: two heavy main lifts per session (4×4–6 → 3×4–6 Intermediate; 4×3–5 → 3×3–5 Advanced); Beginners train dumbbell variants at 3×6–8 because barbell lifts unlock at Intermediate (see rule 17); assistance kept at 2 sets so main-lift sets stay ≥ assistance sets | Heavy loads superior for 1RM (Schoenfeld 2017 load; ACSM 2009); novices 8–12RM (ACSM 2009) | Strength goal | — | Strong |
| 13 | Beginners: fewer exercises (≤6 per session), 2–3 sets, 8–12/12–15 reps, 2–3 RIR, simple full-body structure; no failure training | ACSM 2009 novice guidance | Beginners | — | Strong |
| 14 | Balanced weeks: no day may have ≥2× the exercises or ≥2× the effective working-set load (heavy compound sets ×1.5) of another; exercise counts within 2 | Forge product requirement, not an evidence claim | All | — | Product rule |
| 15 | Movement balance: the generator tops up existing pulls (within all caps) until pulling sets reach at least 2/3 of pressing sets, and the quality engine warns below that; 6-day pull days carry three pulling movements; trunk work sits on lower-body days in 4-day athletic and recomp splits rather than repeating in every session; hip hinges on consecutive days give a lower-back warning | Practice-based | All | — | Provisional |
| 16 | No session-time limits: workouts are never built, padded or cut to fit a duration | Product requirement | All | — | Product rule |
| 17 | Heavy targets (5 reps or fewer) only on barbell and machine/cable lifts. Dumbbell, kettlebell and bodyweight lifts are limited by grip, stability and setup rather than the target muscles, so session-anchor and main-lift versions keep 6+ reps; hip hinges keep 5+ reps | Practice-based; consistent with load equivalence for hypertrophy (rule 5) | All | — | Provisional |
| 18 | Phases. **Foundation (weeks 1–4)**: settle loads at the easier end of each effort range. **Evolution (weeks 5–8)**: same exercises, order and rest, so progress stays comparable. Intermediate/advanced hypertrophy, recomp and athletic plans add one set to accessory (isolation or machine) work, at most one per muscle per session and about 15% of weekly sets, within every ceiling; strength main lifts move one rep heavier (hinges excepted); effort targets move to the harder end of the range. Beginners and Start Strong repeat Foundation and progress through reps and load | Volume dose-response (rule 1); novices progress at low volume (ACSM 2009); progressive volume within a block is practice-based | All | If the derived week would break any integrity rule, Evolution repeats Foundation | Provisional |

## 3. Prescription table (starting values)

Format: sets × reps · rest seconds · RIR, for Beginner / Intermediate / Advanced. "Anchor" is the session's first loaded compound (or the first main lift on strength days).

| Goal | Anchor | Compound | Machine/cable | Isolation | Core |
|---|---|---|---|---|---|
| Foundation (Start Strong) | 2×8–12 · 90 · 2–3 (all levels) | 2×8–12 · 90 | 2×10–12 · 90 | 2×12–15 · 75 | 2×8–12 · 60 |
| Hypertrophy (Build Muscle, Advanced Physique) | 3×8–10 · 150 · 2–3 / 3×6–8 · 180 · 1–2 / 3×6–8 · 180 · 1–2 | 2×8–12 · 120 / 3×8–10 · 150 / 3×8–10 · 150 | 2×10–12 / 3×8–12 / 3×8–12 (RIR 0–2) · 120 | 2×12–15 · 75 / 3×10–15 · 90 / 3×10–15 · 90 (RIR 0–1) | 2×10–15 · 60 |
| Strength (Get Strong) | 3×6–8 · 180 (dumbbell variants) / 4×4–6 · 210 / 4×3–5 · 240; second main lift 3 sets | 2×8–10 / 2×6–8 · 150 | 2×8–10 · 120 | 2×10–12 · 90 | 2×8–12 · 60 |
| Recomposition (Lean & Strong) | 3×8–10 · 120 / 3×6–8 · 150 | 2×8–12 / 3×8–10 · 120 | 2–3×10–12 · 90 | 2–3×12–15 · 75 | 2×8–12 · 60 |
| Athletic (Athlete Mode) | 3×6–8 · 150 / 3×5–6 · 180 / 3×4–6 · 180 | 2×8–10 / 3×6–8 · 150 | 2–3×8–10 · 120 | 2×10–12 · 75 | 2–3×8–10 · 60 |

Weekly ranges (major / small muscles): strength 4–12 / 0–6, 6–16 / 0–8, 6–16 / 0–10; recomp 6–12 / 0–8, 8–16 / 2–10, 8–18 / 4–12; athletic 6–12 / 0–8, 8–16 / 2–10, 8–18 / 2–12; foundation 4–10 / 0–6. Front and rear delts, glutes and core have a ceiling but no floor: pressing, rowing, squats, hinges and loaded compounds already train them substantially. "Below range" warnings appear only on plans with three or more days a week, and floors are frequency-capped (rule 1).

Advanced three-day plans are designed for three days rather than held to five-day totals: seven exercises and about 21 sets per full-body session, roughly 9 direct sets per major muscle across three exposures, with advanced effort targets (isolation at 0–1 RIR). Build Muscle and Advanced Physique differ at three days in their optional slots: Advanced Physique adds arm and delt detail, while Build Muscle adds calves and trunk.

## 3a. Audit of the 16 warnings reported for Planner 8 (2026-10-16)

The earlier report's "16 warnings" came from a check run before a final calibration and was not re-run at the time. These are the 16 warnings from that check (59 full-gym plans):

| # | Plan | Warning | Cause | Program or threshold? | Resolution |
|---|---|---|---|---|---|
| 1–2 | Build Muscle · Beginner · 5 and 6 days | Beginners usually progress on 2–4 sessions | User-selectable frequency above novice guidance | Honest | Kept; Forge already defaults beginners to 3 days |
| 3 | Build Muscle · Intermediate · 3 days | Hamstrings 9 < 10 | Every full-body session at its 22-set limit; floor ignored frequency | Threshold | Floor capped by exposures (3 × 3 = 9) |
| 4–6 | Build Muscle · Advanced · 3 days | Triceps 6 < 8, Calves 7 < 8, Biceps 6 < 8 | Sessions at 26 sets; 2 exposures each | Both | Floors frequency-capped; full-body sessions limited to 7 exercises / 22 sets |
| 7–8 | Lean & Strong · Advanced · 4 days | Chest 8 < 10, Quads 8 < 10 | Floor set for hypertrophy-level volume on a moderate-volume Path | Threshold | Advanced recomp floor 8 |
| 9–10 | Athlete Mode · Advanced · 4 days | Chest 8 < 10, Quads 8 < 10 | As above | Threshold | Advanced athletic floor 8 |
| 11 | Advanced Physique · Intermediate · 3 days | Hamstrings 9 < 10 | As #3 | Threshold | Frequency cap |
| 12–16 | Advanced Physique · Advanced · 3 days | Back 10 < 12, Hamstrings 9 < 12, Triceps 6 < 8, Core 2 < 8, Biceps 6 < 8 | Sessions at 26 sets (8 exercises); five-day expectations on a three-day week; a core floor despite heavy trunk involvement in compounds | Both | Deliberate three-day design (7 exercises, ~21 sets); frequency-capped floors; core has no floor |

Current state: 0 errors and 2 warnings across all 59 full-gym plans (#1–2, kept as honest).

## 3b. Final programming review corrections (2026-10-16)

- Get Strong · Beginner prescribed goblet squat and dumbbell RDL at 3×5 with 3 min rest. Load-limited lifts are now 3×6–8 (rule 17).
- Athlete Mode · Advanced prescribed split squat and incline dumbbell press at 4×4–6. Now 6–8.
- Athlete Mode and Lean & Strong · 4 days repeated bird dog in all four sessions (12 core sets a week). Now lower-body days only (6).
- Advanced Physique · Intermediate · 6 days gave chest and back 18 sets each, the top of the range. Defaults now stop at about 60% of the range (15), with the extra volume moved into Evolution.
- Advanced Get Strong main lifts were 3–6 reps, not the intended 3–5: a five-rep hinge floor was raising every main lift's upper bound. Fixed, with a regression test.

## 4. Audit of the previous planner (engine 7)

Concrete failures found in full-gym outputs:

- **Sets were filled to a session cap, not chosen.** Build Muscle (Intermediate, 4 days) gave 4 sets to every upper-body compound and 5×6–8 back squats, adding up to 96 sets a week.
- **Advanced meant "more".** Advanced Physique (Advanced, 5 days) gave 5×6–8 bench twice a week, 5 sets on every compound and 124 weekly sets. Intermediate and Advanced plans were identical.
- **Small muscles got the minimum.** Side delts, biceps and triceps got 4 sets a week, while chest/back got 16 and glutes 18–20.
- **Redundancy.** Both upper days repeated the same four compounds (flat bench, incline, cable row, pulldown) in a different order.
- **Recovery.** Get Strong placed a Romanian deadlift in all three weekly sessions (3×8, 5×5, 3×8), loading the lower back every session.
- **Uniform rest.** 120 s for every compound, including heavy back squats.
- **Beginners.** Build Muscle beginners got 8 exercises per session.
- **No progression or effort guidance.** Plans had no per-exercise effort guidance, and load increases required reported RIR ≥ 2, which conflicts with typical 1–2 RIR training.

## 5. Before and after (full gym)

Build Muscle · Intermediate · 4 days

| | Before (engine 7) | After (engine 8) |
|---|---|---|
| Upper A | Bench 4×6–8, Cable row 4×8–10, Pulldown 4×10–12, Incline DB 4×8–12, 4 isolations × 2 (8 exercises, 24 sets) | Bench 3×6–8, Cable row 3×8–12, Pulldown 3×8–12, Lateral raise 3×10–15, Overhead triceps 3×10–15, Curl 3×10–15, Pec deck 4×10–15 (7 exercises, 22 sets) |
| Lower A | Back squat 5×6–8, RDL 4×8–12, Leg ext 4×12, Leg curl 4×12, Calf 4×12, Dead bug 3×8 (24 sets) | Back squat 3×6–8, RDL 3×8–10, Leg ext, Leg curl, Calf 3×10–15, Dead bug 2×10–15 (17 sets) |
| Upper B | Same four compounds reordered + 4 isolations × 2 | Pull-up 3×6–8, Incline DB 3×8–10, DB row 3×8–10, Lateral, Rear fly, Curl, Triceps 3×10–15 |
| Week | 96 sets; side delts/arms 4 each | 77 sets; chest 10, back 12, quads/hamstrings 12, side delts/arms 6 |

Advanced Physique · Advanced · 5 days: **124 → 92** weekly sets. Bench 5×6–8 twice a week becomes 3×6–8 twice a week, plus incline 3×8–10 and a pec-deck fly. Every major muscle gets 12 sets and arms/side delts 8. Compounds stay at 3 sets, while isolation work uses 4 sets at 0–1 RIR.

Get Strong · Intermediate · 3 days: **57 → 40** weekly sets. Back squat 4×4–6 and bench 3×4–6 (3:30 rest) on day A; RDL 4×5–6 and overhead press 3×4–6 on day B; bench 4×4–6 and squat 3×4–6 on day C. The RDL appears once a week instead of three times, and assistance stays at 2–3 sets, with rows topped up so pulling keeps pace with pressing.

Build Muscle · Beginner · 3 days: 8 → 6 exercises per session, 48 → 39 weekly sets. Every exercise has a rep range and a 2–3 RIR target.

Evolution (weeks 5–8): Build Muscle · Intermediate · 4 days 77 → 84 weekly sets (one extra set on leg extension, leg curl, calf raise and lateral raise; the upper sessions are already at their set limit). Advanced Physique · Advanced · 5 days 92 → 99. Get Strong · Intermediate main lifts 4–6 → 3–5 with unchanged sets. Beginner plans repeat Foundation.

## 6. Known uncertainties

1. Exact weekly set numbers per experience level are extrapolations; Schoenfeld 2017's ≥10-set category was a trend (p = 0.074).
2. The shape of the proximity-to-failure dose-response is uncertain (Robinson 2024).
3. Stretch/long-length effects depend on the exercise; Forge does not prescribe lengthened partials.
4. Deload effects are unverified; Forge only offers guidance-based lighter weeks.
5. The 0.5 weight for secondary involvement, the per-session ceilings, the per-exposure floor cap (3/5 sets) and the 60% default ceiling are planning conventions, not measured values.
6. Nippard's own numeric recommendations could not be verified from primary transcripts and were not encoded.
7. Evolution's added volume (+1 accessory set, up to about 15%) and heavier strength ranges are practice-based progressive-overload choices; Forge does not yet adapt them to a user's logged response.
8. Evolution volume lands where there is room under the session limits, which in some splits concentrates it on lower-body accessories.
9. The heavy-target rule for load-limited implements (rule 17) is practice-based.

## 7. Visual review (2026-10-16)

The pre-commitment preview and editor were rendered in a browser using react-native-web, in a harness outside the repository. Only native modules were stubbed (icon glyphs, animation, safe-area, SVG); the components themselves were the real ones. Mobile (390 × 844) and desktop (1280 × 800) views were checked: week overview, expanded day, expanded exercise row, swap list, validation-error state, and the Evolution labels with the Start action. No horizontal overflow was found.

Fixed during the review:
- The rep-range steppers split across lines on mobile.
- Rest chips scrolled the selected value out of view.
- A fly was labelled "Same movement pattern" as a bench press substitute.
- Repeated volume warnings formed a wall of text; they are now grouped.
- Content stretched across wide screens; it now has a 760 px reading column.

Not verified: on-device rendering (iOS/Android fonts, Ionicons, safe areas, haptics, keyboard behaviour), because no device or simulator was available in this environment.
