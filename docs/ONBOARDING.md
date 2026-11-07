# First-time onboarding and the Forge Path reveal (Phase 9.2)

**Status (2026-11-04): redesigned (the premium pass), founder-approved after review on his iPhone, and committed.**

- **No subscription restriction exists anywhere.** Setup ends in Forge, with nothing started. Phase 9.3 adds a membership step after the reveal only in development builds that opt in ([`docs/SUBSCRIPTIONS.md`](SUBSCRIPTIONS.md#phase-93-forge-premium-in-development-builds)); everywhere else setup ends exactly as described here.
- **Design decisions:**
  - F2: account before personalization.
  - F13: no equipment question.
  - F14: offer "Start your Forge Path" only after a future verified purchase.
  - F15: cinematic introduction in Forge's existing design language.
- **Visual validation:** real screenshots from the Android emulator (`docs/execution/PHASE_9_VISUAL_TESTING.md`).

## The journey

| # | Screen | Entry state | What happens | Saved |
| --- | --- | --- | --- | --- |
| — | Launch intro (unchanged) | any | Embers, the forged FORGE wordmark, BUILT THROUGH DISCIPLINE | nothing |
| A | **Welcome to Forge** (fresh phone only) | signed out | See [Stage A](#stage-a) | nothing |
| B | **Discover Forge** (4 pages) | signed out | Forge Paths, Train, Progress, Nutrition. Each page is a composition of real Forge screens under a headline and one or two sentences. Swipe or **Next**, **Back**, **Skip** at any point; the last page's **Create your account** | leaving the intro is remembered (`onboardingIntro`) |
| — | Account (existing Welcome, unchanged) | signed out | Continue with Apple, Google or Email | the session (existing) |
| — | Restore offer (existing, unchanged) | setup | A returning athlete's saved training first | existing |
| C | **About you** (step 1 of 3) | setup | Name (optional), units, height and starting weight (required), body fat (optional) | each valid value, to the profile, as typed |
| D | **Your training** (step 2 of 3) | setup | Four numbered questions: experience, goal, **days a week** (3, 4 or 5), preferred rest day | each answer, to the profile, as chosen |
| E | **Your Forge Path** (step 3 of 3) | setup | The real recommendation, in layers, read-only; **Enter Forge** (**Continue** where the membership step follows) | the revealed program's key |
| E′ | **Forge Premium** (opted-in development builds only, Phase 9.3) | setup | The reveal continues into it: **ALL 8 WEEKS / ALL OF FORGE**, the athlete's Forge Path as a pass (each training day's focus and size), what the membership includes, then **Your membership**: the plan card (the price, the free week when eligible), the action, **Not now** · **Restore** · **Terms** · **Privacy**. A floating copy of the action waits until the decision is in view. Forge opens once the server confirms the membership, or without one. Back returns to the reveal | the stage (`membership`) |
| F | Home | ready | A **Your Forge Path** card at the top: the program, its days and length, **View your Forge Path**. Nothing is started | `onboarded: true`, `onboardingArrival` |

<a id="stage-a"></a>**Stage A in detail:**

1. The FORGE wordmark and BUILT THROUGH DISCIPLINE start exactly where the launch intro leaves them (same size, place and line: `handoff.ts`).
2. Stage A holds that frame until the intro has faded out (`onIntroFinished`), so the intro dissolves into an identical picture: there is never a second wordmark.
3. Then the composition settles: Forge's own screens emerge and the statement settles in (see [Stage A: Emergence](#stage-a-concepts)). It says what Forge stands for; Discover then shows what it holds. Stage A shows no statistics.
4. **Get started** or **I already have an account** work from the first frame. Nothing waits.

**Rules:**

- **Intro rule (`introDue`):** the intro shows only when all of these hold:
  - the phone is fresh (no account's training, nothing synchronized);
  - it hasn't left the intro yet;
  - Welcome has nothing to say: a sign-out notice, an account deletion, a workout to return to, an email link.

  Once Welcome has had something to say, the intro stays away for that visit. Established athletes who sign out go straight to their sign-in, as before. Every exit from the intro leads to the account screen: there is no way into Forge without an account.
- **Setup is one route** (`/onboarding`, the `setup` entry state). Nothing behind it is reachable until it is done. Back moves one step, on screen or with Android's back button, and keeps every answer.
- **Who is being set up** is always on screen as a compact account chip beside Back. Its email is shortened in the middle when long. Tapping it opens a sheet that names the account in full and offers **Sign out** (Setup's own way out: it asks first when something was entered). Signing out is never one stray tap away.

<a id="stage-a-concepts"></a>
## Stage A: Emergence (founder-approved 2026-11-04)

The founder asked Stage A to establish what Forge represents before what it contains: no statistics, the brand first, then one message, then real Forge imagery supporting it, then the way in. Three compositions were built and checked on the emulator. The founder chose **Emergence** after testing all three on an iPhone; the other two and the preview's concept picker were then removed.

- **Composition.**
  - The brand never moves: the launch intro's last frame becomes the screen.
  - A tilted wall of real Forge screens rises out of the dark above the brand, once, and dissolves before reaching it.
  - The statement settles in beneath: **THE WORK SHOWS**, without closing punctuation. Its sentence: "Train with intention. Forge keeps the record and makes your progress visible."
  - Get started and I already have an account sit at the bottom.
- **Words:** `LANDING` in `src/domain/onboarding/discover.ts`. Screen readers say the statement as one heading, "The work shows".
- **Room and text size** (`landing-layout.ts`, tested across five phones, four text sizes and the preview's banner):
  - The wall shows only with at least 120 pt of dark above the brand.
  - At very large text the screen scrolls; nothing ever covers anything.
  - The brand starts at the launch intro's place and only ever rises, only as far as its statement needs. On a phone at ordinary text sizes it doesn't move at all.

**Typography.** The wordmark, then three weights in two faces, each with one job. Everything comes from the REFORGE tokens and the two bundled Barlow Condensed cuts; nothing new is loaded.

| Text | Face and weight | Size and spacing | Why |
| --- | --- | --- | --- |
| FORGE | The wordmark artwork | The launch intro's own size and place | A protected brand asset, unchanged |
| BUILT THROUGH DISCIPLINE | System face, Semibold (600) | The intro's own size; the brand's wide tracking (0.42 em), capitals | Drawn exactly as the intro draws it, in its white, so the hand-off has no seam. It then settles into the secondary tone every brand line has inside Forge (`BrandHeader`), so the lockup reads as one unit and the statement comes next |
| THE WORK SHOWS | Barlow Condensed **Bold** (700, the `displayLabel` cut), capitals | 4:3 of the hero title for the width (35, 40 or 43 pt); leading as the hero title; tracking 0.02 em | It was ExtraBold at 1.34× with 0.2 pt tracking: as heavy as the wordmark, packed tight under the tracked brand line. The Bold cut lets the wordmark lead and shares its weight with the primary action. The light tracking lets the capitals breathe without imitating the brand line |
| The sentence | System face, Regular (400) | The `subtitle` role as it is (16/21), secondary tone; as wide as the wordmark; 16 pt below the statement (`spacing.margin`) | It was 16/22 with a fixed 330 pt measure and a 14 pt gap. Back on the tokens, and in the wordmark's column |
| Get started | System face, Bold (700) | The app's `CtaButton` (`button` role) | Forge's primary action everywhere |
| I already have an account | System face, Semibold (600) | The app's `OutlineButton` (`cardTitle` role) | Forge's secondary action everywhere; a step quieter than the primary by design |

- **Before:** four weights (800, 700, 600, 400), three tracking treatments and two off-token sizes.
- **After:** three weights (700, 600, 400). Only the brand line is tracked wide. The statement and the sentence follow the REFORGE type roles.
- **Screen readers:** the brand line is one heading, said once, whichever of its two layers is showing.

## Design

The direction is luxurious, lucid and next-generation: Forge introduces itself as a premium performance system, not a questionnaire. It uses the REFORGE tokens and components only.

- **The product persuades:** Discover shows Forge itself instead of icons and bullet lists (see [Product visuals](#product-visuals)).
- **Type and hierarchy:** condensed display titles, letter-spaced overlines, numbered questions on Your training ("01 · Experience"), and one primary action per screen, pinned at the bottom.
- **Depth, not decoration:** cards cast soft shadows, and the reveal's hero and Home's card carry a single ember glow. Content fades under the top bar and above the pinned actions instead of being cut.
- **Choices:** experience and goal are full-width option cards, each with its sentence and a check. Days a week are three number tiles. The rest day is a Monday-to-Sunday week of short names.
- **States you can read:**
  - Your training's action stays a legible outline until it is complete, never a dimmed ember, with the line under it saying what is missing.
  - About you's problems show on each field and, above **Continue**, in a line that is always on screen.

## Product visuals

Discover's four pages and Stage A's wall use **nine crops of real Forge screens** (`assets/onboarding/*.png`, lossless, 810 KB in total). They are registered in `docs/redesign/reforge/ASSETS.md`. Stage A adds no images: its wall reuses the same nine.

| Page | Cards (from the real screen) |
| --- | --- |
| Forge Paths | The Forge Paths recommendation card; a program's week |
| Train | The logger's exercise card mid-session (two sets done at the load Forge suggested), the session timer, the rest timer at 3:10 of 4:00 |
| Progress | Conventional Deadlift's estimated-1RM trend; a bench press personal record |
| Nutrition | Today's calories and macros; hydration |

- **Composition:** `src/screens/onboarding/showcase.tsx`.
  - Each page lays its cards on a 360 × 400 pt stage, at most at their real size.
  - Each card has its own corner radius and shadow, and an outline where the crop sits inside the card's border.
  - While a page is swiped, the cards drift at different rates (parallax) and fade.
  - Reduce Motion: nothing moves.
- **Accessibility:** the images are decorative, hidden from screen readers; each page's headline and sentence carry the meaning.
- **The data is a demo athlete.** "Alex" was built with Forge's own data layer on the FORGE DEV throwaway account: five weeks of the real Intermediate Strength · 4 Days program, real catalogue foods. No real person, account or personal data appears.
- **Remaking them** (after a redesign of those screens). Everything below is session tooling, not part of the app:
  1. Seed the demo athlete with Forge's own `Repository` and program functions (`seed-demo.ts`, run with the worktree's `tsx`).
  2. Load it into Expo Go on the `forge` emulator at the standard size (1179 × 2556 px, 480 dpi).
  3. Capture Forge Paths, the logger, Progress and Nutrition.
  4. Find each card's exact border from a brightness profile, then crop it to the border.
  5. Export at 840 px wide as lossless PNG (`crop.ps1`). Forge bundles no JPEG (`tests/ui/splash.test.tsx`), and PNG keeps the cards' text sharp.

## What was asked, and why

- **About you** keeps setup's long-standing profile fields and rules (`profileSchema`).
  - **Name:** an empty name keeps "Athlete".
  - **Units:** kilograms with centimetres, or pounds with feet and inches. The profile always stores kg and cm.
  - **Height and starting weight:** required, as before.
  - **Body fat:** optional.
  - **Placeholders never look like answers:** "First name" and "Optional" only; numbers start empty, with their unit inside the field (cm, kg, %, ft, in).
- **Your training** asks exactly what `recommendProgram` reads: experience, goal and days a week (`Profile.frequency`), plus the rest day its week is arranged around (`trainingWeekdays`).
  - **Days a week are new to setup.** Only the day counts the published programs are written for are offered for the chosen experience and goal (`supportedDays`; today 3, 4 or 5 for every combination). A new profile's default (3) never counts as a choice.
  - **Rest day:** "Mon" … "Sun" in seven equal columns while they fit at the reader's text size, otherwise four and three. A name is never broken; each is read in full ("Wednesday").
  - **No equipment question** (F13): equipment isn't an input to the recommendation. The reveal shows the program's own equipment list.
- **Not asked any more during setup.** These stay unchanged in the profile and editable in You and Preferences:
  - appearance;
  - training preferences (target muscles, default rest, increment, rep range);
  - nutrition targets (the previous setup already let athletes skip these);
  - the notifications switch.

  `ProfileForm`'s onboarding mode is no longer used by setup. It is left unchanged, with its tests, for the Main Engineer to retire or keep.

## The reveal

**The real engine, no second one.** `revealFor` calls `recommendProgram` with the athlete's answers and keeps its match only when it is written for exactly the chosen days. Tests check every experience × goal × days combination and every rest day: all **18 published programs** are reached, each for its own answers.

**In three layers:**

1. **Recognition and recommendation.** "Built for Sam" over the program's family as the title ("Intermediate Strength"), then:
   - **Matched to your answers:** experience, goal, schedule and rest day, each checked.
   - **Its shape in three numbers:** weeks, sessions and phases for a fixed program; or length, workouts and exercises each for an ongoing one.

   The engine's own reasons are what screen readers hear for the match.
2. **Structure:**
   - **The week:** Monday to Sunday, each training day numbered in the order its sessions run, the rest day marked with a moon. Under it, each training day by its session, focus and number of exercises ("Mon · Lower A · Squat Strength · 6 exercises").
   - **The phases** (multi-phase programs) by name, on a bar sized by their weeks.
3. **What you'll need:** the program's equipment.

**Rules:**

- **A preview, not the program** (founder rule, Phase 9.3): the reveal shows each training day's focus and number of exercises, never an exercise, a set, a rep, an effort or the progression. The program itself comes with Forge Premium. This holds in every build, including those without membership, where the program is in Forge Paths after setup.
- **No internal codes:** session names are shown as authored, split at their emphasis ("Upper A (Chest & Back)" → "Upper A", "Chest & Back"). The day count isn't repeated in the title: it is in the answers.
- **Read-only:** no Start, no logging, no link into Forge Paths, no tabs. Nothing is enrolled ("Nothing starts until you choose. Your Forge Path waits on Home.").
- **Stable:** the revealed program's key (`id@version`) is kept, so an app update can't change what the athlete saw; a key that no longer fits the answers is ignored.

## After Enter Forge

- **What Home shows:** the **Your Forge Path** card, with the program's family, its days a week and length, "Matched to your answers during setup. Nothing starts until you choose.", and **View your Forge Path**.
- **What the card does:** it opens that program's page in Forge Paths, where starting it stays the athlete's choice through the existing Start sheet.
- **When it goes:**
  - it goes when the athlete closes it;
  - it stays hidden while any plan is running;
  - it never shows a program this Forge doesn't have.
- **Changes to Home:** one line in `Home.tsx` (`<ForgePathArrival />` under the greeting); the card is `src/screens/onboarding/Arrival.tsx`.

## Persistence

- **Profile:** each About you and Your training answer is saved the moment it is valid (as setup always has), so it survives a restart, a crash or a lost connection. Setup itself is local: only the existing restore check needs a connection, and its existing offline path ("Set up this phone now") leads into setup.
- **Onboarding record** (setting `onboarding`, JSON `{ v, stage, days, revealed }`):
  - It holds where setup is, whether days a week were chosen, and the program shown.
  - It is local only: never synchronized, never in a backup.
  - It is cleared when setup finishes or this phone's data is deleted.
  - `resumeStage` never resumes past a step whose answers are missing.
  - A `membership` stage (Phase 9.3) resumes at the membership step; a build without one resumes it at the reveal, which then ends with **Enter Forge**.
- **Arrival record** (setting `onboardingArrival`, JSON `{ v, program }`): written as setup finishes, in the same transaction. Local only; cleared when Home's card is closed.
- **Intro record** (setting `onboardingIntro`): the intro was left; a restart goes straight to the account screen.
- **No schema change:** all three records use the existing `settings` table. Established athletes never reach setup: entry is decided by `profile.onboarded`, unchanged.

## Motion and accessibility

- **Short, one-shot and non-blocking:**
  - Stage A settles only once the launch intro has faded out (checked frame by frame on the emulator): in 1.3 s the wall rises out of the dark, the brand line settles into its secondary tone and the statement fades in. The brand itself doesn't move.
  - Steps settle in within about half a second (`ENTRANCE_MS` 320 ms).
  - The reveal's layers are staggered up to 340 ms.
  - Forge Premium's hand-off (E′):
    - the reveal fades out in 150 ms;
    - setup's step bar forges into one line in about 0.4 s;
    - a glint runs along the line once (about 1.1 s in all);
    - the confirmation's letters cool from molten to steel once, in 1.3 s.
  - Nothing waits for motion, and nothing loops: an endless animation was tried for Stage A and removed. It kept the screen from ever going idle, which blocks UI automation (UIAutomator, Detox) and wastes power.
- **Reduce Motion:** no movement at all. Stage A's statement and imagery simply appear once the intro has gone (checked on the emulator with Remove animations). Paging between Discover pages also stops animating, and Forge Premium simply appears.
- **Screen readers:**
  - Stage A reads brand, line, statement (a heading), sentence, then the two actions, in that order: everything is in the normal flow. Its imagery is decorative.
  - One Discover page at a time is exposed, and product images are decorative.
  - The step bar is decorative; the overline says "Step 2 of 3".
  - Choices are radio groups.
  - Errors are announced.
  - Every control is at least 44 pt.
- **Small phones and large text** (checked on the emulator at the SE size, SE with 1.3× text, standard and large):
  - every screen scrolls, and actions stay pinned;
  - Discover's headline sits at the same height on every page and is never cut;
  - Stage A drops its imagery before anything crowds, and scrolls only at very large text;
  - no name or value breaks mid-word.

## Development preview (safe testing)

**You → Preferences → Development → Preview onboarding (development only)** runs the whole journey (A → E) for a new athlete, kept in memory.

- **Nothing is touched:** the profile, training, settings, onboarding record and arrival record stay as they were. Tests prove it writes nothing.
- A banner says so; **Exit** (or Enter Forge) closes it.
- **With Forge Premium:** **Preview onboarding with Forge Premium (development only)** (`/onboarding-preview?premium=1`) continues past the reveal into Forge Premium, simulated, and ends on Home, as setup does. It too saves nothing.
- **Development builds only** (Expo Go, FORGE Dev); production bundles show "Not in this build".

## Code

| File | Role |
| --- | --- |
| [`src/domain/onboarding/journey.ts`](../src/domain/onboarding/journey.ts) | Stages, the onboarding record, About you's rules, supported days, resume, the reveal, the intro rule, `afterReveal`, the arrival record |
| [`src/domain/onboarding/reveal.ts`](../src/domain/onboarding/reveal.ts) | How the reveal presents a program: its title, the answers it matches, its three numbers, its week, and each training day's session, focus and number of exercises (`revealSessions`) |
| [`src/domain/onboarding/about.ts`](../src/domain/onboarding/about.ts) | Units: typed values ↔ the stored kg and cm |
| [`src/domain/onboarding/discover.ts`](../src/domain/onboarding/discover.ts) | Discover Forge's words (tests hold their numbers to the libraries); Stage A's statement and sentence (`LANDING`) |
| [`src/domain/onboarding/premium.ts`](../src/domain/onboarding/premium.ts) | What Forge Premium (E′) says: the revealed Forge Path as the reveal showed it, the headline, and what the membership includes (a title and one sentence each) |
| [`src/screens/onboarding/`](../src/screens/onboarding/) | See below |
| `assets/onboarding/*.png` | The product visuals |
| `app/welcome.tsx`, `app/onboarding-preview.tsx` | Routes |

**Files in `src/screens/onboarding/`:**

- **Screens and routes:** `Intro` (Stage B, Discover), `Landing` (Stage A), `WelcomeRoute`, `Flow` (`SetupOnboarding`), `About`, `Training`, `Reveal`, `Arrival` (Home's card), `Preview`.
- **Building blocks:**
  - `frame` (the step frame and numbered questions);
  - `week` (the training days by focus and size, and the phases: shared by the reveal and Forge Premium's pass);
  - `choices` (option cards, day tiles, the rest-day week, the units switch);
  - `account` (the account chip);
  - `showcase` (product visuals: Discover's pages and Stage A's wall);
  - `parts` (progress, the step action, issues, fades, the preview banner).
- **Other:** `store`, `motion`, `handoff` (the launch intro's last-frame geometry), `landing-layout` (Stage A's arithmetic).

**Shared files changed (Main Engineer review):**

- `app/welcome.tsx`: the route now opens `WelcomeRoute`; `Welcome.tsx` itself is unchanged.
- `src/screens/entry/Setup.tsx`: its last screen is `SetupOnboarding`, given who is being set up and Setup's own sign-out, instead of `ProfileForm`. The restore offer and its states are unchanged.
- `src/screens/Home.tsx`: one line, the arrival card.
- `src/components/splash/session.ts`: an additive `onIntroFinished(listener)`, notified by `finishIntro()`, so Stage A starts moving only once the intro is gone. The intro itself is unchanged.
- `src/auth/AppStack.tsx`: one line, `onboarding-preview` in the ready group.
- `src/screens/Preferences.tsx`: development-only rows (the onboarding preview, with and without Forge Premium, and Forge Premium's states).
- `docs/redesign/reforge/ASSETS.md`: the product visuals registered.
- `tests/ui/setup-restore.test.tsx`: its mock follows the new seam; every assertion is kept, including Not you.

## Tests

| File | Proves |
| --- | --- |
| `tests/onboarding-journey.test.ts` | See below |
| `tests/route-inventory.test.ts` | Every `app/` route registered once, inside a protected group; setup can't enroll, start, log, sync or reach membership code; only finishing setup navigates |
| `tests/ui/onboarding-flow.test.tsx` | See below |
| `tests/ui/onboarding-intro.test.tsx` | See below |
| `tests/ui/onboarding-arrival.test.tsx` | See below |
| `tests/ui/route-protection.test.tsx` | Every route in every entry state (real routing): each state opens exactly its routes; nothing in training before setup |

**`tests/onboarding-journey.test.ts` proves:**

- **Setup:** the record; About you's rules; units; only offered days; resume.
- **The recommendation:** all 18 programs from their answers and every rest day; each training day's focus and size only, never an exercise, set or rep (every program and rest day); a stable reveal; no step after the reveal but entering Forge.
- **The intro:** the intro rule; Stage A's geometry held to the launch intro's own formulas.
- **Stage A's composition:** on five phones, at four text sizes, with and without the preview's banner. The brand starts at the intro's place and only rises; nothing reaches the actions; the wall shows only where it has room; the brand doesn't move on a phone at ordinary sizes.
- **Words and visuals:** Discover's numbers (18 programs, 3–5 days, 3,730 foods); Stage A's statements carry no numbers; no unbacked claims anywhere; the product visuals bundled, small and registered.
- **The reveal:** its first layer for all 18 programs; the week for every program and rest day; session names split at their emphasis, with no internal codes.
- **Forge Premium's words:** the pass retells the reveal (its family, shape and days) for every Forge Path, with or without a name; the headline and its accent; what the membership includes, with no claim Forge can't back; Emergence's statement style.
- **The arrival record.**

**`tests/ui/onboarding-flow.test.tsx` proves:**

- **The whole setup on real SQLite:** the account chip and its sheet; resume after a restart at every step; Back; days a week.
- **About you:** its errors, honest placeholders and the pinned issue; pounds, feet and inches.
- **Your training:** the rest-day week; its action never dimmed.
- **The reveal:** read-only; all 18 reveals rendered by their shape and each training day's focus and size, with none of the program's exercises, sets, reps or efforts on screen.
- **Afterwards:** the preview saves nothing, also with Forge Premium, which ends on Home; Home's record is written; training works.

**`tests/ui/onboarding-intro.test.tsx` proves:**

- Stage A sits at the launch intro's exact place.
- Stage A holds that place until the intro has finished, then settles without moving the brand: its line settles into the secondary tone, and the statement and the wall show only once the intro has gone.
- Stage A's type: three weights, each with one job; the statement in the display face's Bold cut at a 4:3 step above the hero title; the sentence on the subtitle role; only the brand line tracked wide.
- Stage A's statement and sentence, with no statistics and no image announced but the wordmark.
- The four pages, with no image announced.
- Back (on screen and Android), Skip and I already have an account, remembered after a restart.
- Never on an established phone or over a message (nor back after one).
- It writes no training data.

**`tests/ui/onboarding-arrival.test.tsx` proves** that Home's Forge Path card:

- shows the revealed program and opens only its page;
- closing forgets it;
- it shows nothing for an unknown program or while a plan runs.

## Next (not started)

- **9.3 (implemented, opted-in development builds only):** Forge Premium after the reveal (`afterReveal(true)` → `membership`), redesigned to the founder's "Reference 3" direction (2026-11-06), with Apple's purchase flow through RevenueCat and the server-verified entitlement ([`docs/SUBSCRIPTIONS.md`](SUBSCRIPTIONS.md#phase-93-forge-premium-in-development-builds)). **Not started:** after a verified purchase, the offer to start the revealed Forge Path through the existing Start sheet (F14).
- **Design references:** none of the approved REFORGE mockups covers onboarding. This redesign uses the implemented REFORGE components and Forge's own screens. A founder-approved onboarding and paywall reference (F15) would let them be matched exactly.
