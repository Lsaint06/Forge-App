# Progress metrics

How Forge's Progress tab, Records and the training calendar calculate what they show (Design System 2.0, Phase 5). Every number is **derived on demand** from stored workouts, sets, programs, Paths and schedules. Nothing is written back, and there is no stored analytics table. Editing or deleting history therefore always updates every metric, and records can never go stale.

Code: `src/domain/progress/` (pure calculations), `src/data/progress.ts` (read-only adapters), tests in `tests/progress-*.test.ts` and `tests/ui/progress.test.tsx`.

## What counts

- **Workouts:** finished workouts only (`status = completed`). Active and paused workouts are not history yet.
- **Working set:** a completed set that is not a warm-up and has at least one rep. Drop and failure sets count; incomplete sets never do.
- **Dates:** a workout belongs to the local calendar date it finished. Weeks run Monday to Sunday.
- **Units:** weights are stored in kilograms and converted for display (lb = kg × 2.2046226…). Values are never mixed: every comparison happens in kilograms.

## How an exercise's weight can be read

| Kind     | Exercises                                                                                                                                                                                                                          | Used for                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Load** | Barbell, dumbbell, cable, machine, kettlebell and other external load                                                                                                                                                              | Heaviest set, estimated 1RM, reps at a weight, load volume |
| **Reps** | Equipment "Bodyweight", "Pull-up bar", "Gymnastic rings", "Suspension trainer", "None", "Resistance band", "Stability ball", "Ab wheel", "Assisted pull-up machine", or any exercise whose id, name or equipment mentions "assist" | Most reps in a set only                                    |
| **None** | Timed and distance exercises, or an exercise that no longer exists                                                                                                                                                                 | Not used for strength progression                          |

Forge cannot tell assistance from added weight in a logged set (the program progression code says the same). So a bodyweight or assisted exercise's logged number is never treated as load, and a "heavier" assisted set (which is easier) can never become a record.

## Estimated 1RM

`e1RM = weight × (1 + reps ÷ 30)` (Epley), for working sets of 2–12 reps. A single rep counts as its weight. Sets over 12 reps, warm-ups, incomplete sets, zero-weight sets and non-load exercises are not used. It is labelled as an estimate everywhere and is not a tested maximum.

## Progression and comparisons

- **Session best:** for each exercise in each workout (rows of the same exercise merged):
  - the heaviest working set, and the most reps at that weight;
  - the highest e1RM, and the set it came from;
  - the most reps in a single working set;
  - the most reps at each exact weight.
- **Chart:** one point per session.
  - Load exercises show the e1RM, or the heaviest set if you choose (or if no set qualifies for an estimate).
  - Reps exercises show most reps.
  - The axis always spans at least 10% of the value, so small changes don't look dramatic.
- **Latest vs previous:** the latest session against the one before it.
  1. If both top sets have the **same reps**, the weight difference is shown ("+2.5 kg at 5 reps").
  2. Otherwise, if both have an estimate, the **e1RM difference** is shown and labelled as an estimate.
  3. Otherwise nothing is compared ("Different reps and no estimate").
  4. Reps exercises compare most reps.
- **Default exercise:**
  1. An exercise with two or more sessions in the range.
  2. Then external load before bodyweight work.
  3. Then barbell lifts before machines and accessories.
  4. Then the heaviest.
  5. Then the most trained and most recent.

## Personal records

Records are recalculated from history in order, per exercise:

- **Heaviest set:** a heavier working set than any before.
- **Estimated 1RM:** a higher estimate than any before.
- **Rep record:** more reps at a weight lifted before (to 0.001 kg).
- **Most reps** (reps exercises only): more reps in a set than any before.

Rules:

- The first session with an exercise **sets the baseline** and is not a record.
- **Matching** a best is not a record. The earliest session keeps a tied best.
- A first lift at a new weight is not a rep record.
- One workout produces at most one record entry per exercise, listing every category it beat (the most significant is shown).
- Because records are recalculated, editing a set or deleting a workout immediately moves or removes affected records.

The Progress "Records" count is the number of record entries set in the selected range.

## Consistency and adherence

**Planned sessions come only from the lifter's own plans:**

- **Curated program:** each week, planned = the program's suggested weekdays that fall between its start and end. Sessions count for the week they are done in, on any day. A 3-day program trained three times in a week is fully on plan, whatever the days.
  - A running program plans through the end of the current week.
  - An ended or completed program counts only until its last recorded session. No end date is stored, so later weeks are never counted as missed.
- **Existing generated Path:** its dated sessions, with states completed, skipped, missed (date passed, not done) or scheduled.
  - An archived Path counts until its last acted-on session.
  - A paused Path counts until its pause date; later sessions move when it resumes.
- **Scheduled workouts** (Templates → Schedule, earlier starter programs): a plan is completed by a finished workout of the same template on that day, each workout counting once. Otherwise it is missed once the day has passed.

**Counting:**

- **Finished week:** planned, on plan (done, capped at planned), skipped, missed (the rest).
- **Current week:** only sessions already done or skipped are due. The remaining days can still happen.
- **On plan %:** due sessions done ÷ due sessions over the range.
- **Without a plan:** Forge shows workouts completed and "active weeks" (weeks with at least one workout). Nothing is ever counted as missed.
- **Rest days are never failures.** Curated-program sessions are not tied to dates, so only a Path or a scheduled workout can mark a particular day as missed.
- **Chart buckets:** 4 and 12 weeks show one bar per week. Longer ranges show one bar per month, and a week counts in the month its Monday falls in, so nothing is counted twice.
- **Ranges:** 4 weeks and 12 weeks include the current week. 1 year is 52 weeks. All time starts at the first recorded workout or plan.

## Volume and muscles

- **Working sets:** every working set in the range.
- **Volume:** weight × reps of working sets, for **load** exercises only.
  - Bodyweight and assisted movements are excluded because their logged number may be assistance.
  - The workout header, History and Today still show each workout's recorded load × reps (`metrics.volume`). They can differ from Progress for workouts with bodyweight or assisted exercises.
- **Sets by primary muscle:** each working set counts once, for the exercise's primary muscle. Secondary muscles are not credited, so compound lifts are under-counted rather than over-counted. Timed and distance work is excluded.

## Other figures

- **Training time:** elapsed time between start and finish, minus paused time, for workouts in the range.
- **Day streak:** consecutive calendar days with a finished workout, ending today or yesterday (unchanged from earlier versions).
- **Milestones:** the existing achievements. "First PR" now means the first record entry under the rules above.
- **Body trend:** recorded measurements, converted to the lifter's units.

## Limitations

- Timed and distance exercises have no progression or records yet.
- Loads for bodyweight, assisted and band movements are not analysed, only reps.
- Program adherence is weekly. Individual program days are never marked missed.
- Archive dates are not stored. Ended plans are bounded by their last recorded session.
- Dates follow the device's current time zone. Travelling can regroup history at day boundaries.
