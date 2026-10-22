# FORGE cinematic splash

The intro shows embers igniting, the FORGE letters forging in molten orange, the metal cooling to steel, and the tagline **BUILT THROUGH DISCIPLINE**. It runs for 2.6 seconds, then the app takes over.

## Architecture

**Layer A — native launch screen** (`app.json` → `expo-splash-screen` plugin)

- Uses charcoal `#101216` in light and dark modes. The image is a transparent placeholder, `assets/splash/launch-mark.png`, so Android 12+ shows no generic launcher icon.
- This deliberately matches Stage 01, which starts in near-darkness. Showing a logo here would make the wordmark appear, vanish, and then re-forge.
- `app/_layout.tsx` calls `preventAutoHideAsync()` at module load and `hideAsync()` after the root first renders. The intro's first frame is the same charcoal, so the handoff has no visible seam. Native splash failures are ignored and never block startup.

**Layer B — in-app intro** (`src/components/splash/`)

| File | Purpose |
| --- | --- |
| `wordmark.ts` | FORGE letter geometry as SVG paths. Swap in the master vector here; nothing else changes. |
| `timeline.ts` | Stage timings, colors, and deterministic layouts for embers, sparks, and bokeh. |
| `assets.ts` | Manifest of the runtime effect images. |
| `ForgeSplash.tsx` | The animated overlay. |
| `session.ts` | Cold-start tracking and development-only replay. |

All layers use one `Animated.Value` clock with `useNativeDriver: true`. Every effect is an interpolation of opacity or transform on that clock, so the sequence runs on the native UI thread with no JavaScript work per frame. It does not slow app startup. The intro uses only installed libraries: React Native `Animated`, `Image`, and `react-native-svg`. No new animation or image dependency was added.

| Stage | Time | What happens |
| --- | --- | --- |
| 01 Ember ignition | 0–0.5 s | 44 soft ember sprites fade in at varied size, brightness, and timing. They drift toward the center, out-of-focus embers add depth, and a dim forge-floor glow rises. |
| 02 Forging the letters | 0.5–1.2 s | Letters rise into place one by one, 90 ms apart, in a molten gradient with glowing edges. A heat bloom builds. |
| 03 Molten reveal | 1.2–1.6 s | Glow peaks, and the wordmark swells 3 percent and settles. Embers burst outward, and 12 real spark streaks fly off the metal. Brightness changes gradually with no flash. |
| 04 Cooling into steel | 1.6–2.2 s | Molten layers cross-fade to an off-white steel finish, real smoke rises, and sparks fade. |
| 05 Built through discipline | 2.2–2.6 s | The tagline settles under the finished logo. |

### Effect images

Runtime images are stored in `assets/splash/effects/`: 10 PNGs, **115.7 KB total**. The original downloads are **not** stored in the repo; they remain only on the computer used for preparation.

| File | Size | Format | Source | Use |
| --- | --- | --- | --- | --- |
| `ember.png` | 64×64, 1.4 KB | white + alpha, tinted at runtime | Kenney Particle Pack `circle_05`, CC0 | Ember glow and hot core |
| `spark-1…5.png` | 32×160, 3.7–6.2 KB each | full color with alpha | Mixkit clip 3463, “Sparks of fire on a black background,” Stock Video Free License | Spark streaks at the reveal, rotated to their flight direction |
| `bokeh-1…3.png` | 64×64, 5.1–5.3 KB each | full color with alpha | Same Mixkit clip | Out-of-focus depth embers |
| `smoke.png` | 540×960, 72.9 KB | white + alpha, tinted gray | Mixkit clip 1968, “Black background with smoke foreground,” Stock Video Free License | Cooling smoke |

**How they were prepared**

1. Frames were taken from the videos, and black was turned into transparency using a brightness threshold. The black point was raised so video compression grain stays invisible.
2. Individual sparks were found by shape analysis. Only long, solid, single-piece streaks were kept; chains of overlapping blobs were rejected.
3. Sparks were rotated upright and cropped.
4. The smoke frame's edges were feathered.
5. The Kenney sprite was downscaled and converted to white with alpha, so it can be tinted.
6. Every PNG was re-encoded with maximum compression: gray + alpha where tinted, RGBA otherwise. Smoke transparency was reduced to 6-bit precision with no visible banding.

**Excluded**

- Both Poly Haven metal-plate textures: wrong material.
- All video playback.
- Every other Kenney sprite.
- Kenney `star_05` as a reveal glint: tested in rendered frames, it read as a small lens-flare sparkle beside the letters and did not improve the molten peak.

**Load gate and fallbacks**

- Effect images preload invisibly during Stage 01's darkness. The clock starts when every image has loaded or failed, or after at most **450 ms** (`ASSET_WAIT_MS`), so nothing pops in mid-sequence.
- Any layer whose image did not load keeps its procedural look:
  - Embers fall back to drawn dots.
  - Smoke falls back to the gradient haze.
  - Sparks and depth embers are simply omitted; the procedural ember burst remains.
- Images that arrive after the cutoff are ignored for that playback.
- Reduce Motion loads no effect images.
- The intro always plays through; there is no skip control.

**Readiness**

- The database initializes while the intro plays; the app mounts underneath when ready.
- The intro always plays its full 2.6 seconds; there is no tap-to-continue or skip. If the app is ready when the intro ends, the intro fades out over 380 ms.
- If startup is slower, the finished logo stays with a small loading indicator. The sequence never loops.
- If startup fails, the existing **FORGE needs attention** recovery screen appears, and the intro will not replay over it.

**Accessibility**

- With the system reduce-motion setting enabled, the intro skips embers, heat effects, and letter motion. It shows the static logo and tagline, then fades out in 200 ms once the app is ready.
- Screen readers announce “FORGE. Built through discipline.” The overlay is modal while visible.
- Off-white on charcoal provides high contrast. Nothing strobes.

**Layout:** the wordmark is `min(screen width − 64, 440, 0.9 × screen height)` wide with locked proportions. It is centered in the safe area, and the tagline shrinks to fit on one line.

## Cold-start rules

`session.ts` stores whether the intro has finished in memory. Memory lasts exactly as long as the JavaScript runtime.

| Event | Plays the intro? |
| --- | --- |
| App launched after being force-closed, or after the OS ended it (production) | **Yes**: new process, new runtime |
| Returning from the background, from another app, or after unlocking | No: same runtime |
| Tab changes, navigation, onboarding redirect, re-renders | No: the intro is outside navigation, and Home never triggers it |
| Root layout remount in the same runtime, such as Android activity recreation | No |
| Startup error, followed by **Retry** | No |

There is intentionally no saved “seen it” flag. Every genuine new process may play the intro.

## Testing in Expo Go

Expo Go plays the in-app intro (Layer B) with the same libraries used in production. It does **not** use this app's native launch screen (Layer A); Expo Go shows its own loading screen first.

Development-specific behavior:

- **Reload** (shake → Reload, or `r` in the terminal): creates a new runtime, so the intro plays again.
- **Fast Refresh** on save: usually keeps the runtime, so the intro does not replay. Editing `session.ts` itself can reset it.
- **Opening the project from the Expo Go home screen, or closing and reopening Expo Go:** starts a new runtime, so the intro plays.
- **Background and foreground:** does not replay, the same as production.
- **Development-only replay:** **You → Replay intro (development only)** plays the intro again instantly. It appears only in development builds (`__DEV__`) and is removed from production builds.

**Phone procedure**

1. Run `npm.cmd start` and scan the QR code with Expo Go.
2. Watch the intro: embers, forging, molten glow, cooling, tagline, then the app.
3. Tap during the intro after it becomes tappable; the app should appear immediately.
4. Switch to another app and return; the intro should not replay.
5. Change tabs and screens; the intro should not replay.
6. Use **You → Replay intro (development only)** to replay it.
7. Turn on **Reduce Motion**:
   - iPhone: Settings → Accessibility → Motion
   - Android: Remove animations
   
   Reload; the static logo should appear and fade out quickly.
8. Rotate the phone or use a small phone. The app is portrait-locked, but the wordmark should stay centered and unclipped.

The native launch screen and real production cold-start behavior require a development or production build, such as `eas build`. Expo Go cannot show them.

## Verification performed

- **Automated (Jest, `tests/ui/splash.test.tsx`):**
  - wordmark proportions
  - timeline length and deterministic ember layout
  - holding the logo during slow startup without looping
  - finishing on time, with no skip control
  - reduced-motion behavior
  - development-only replay
  - root cold start, background/resume, and remount without replay
  - native splash failures that do not block startup
  - startup-error recovery without replay
  - effect images:
    - waiting for loads, then replacing the procedural layers
    - a failed image keeping its layer's fallback
    - the 450 ms timeout starting procedurally without late pop-in
    - playing through while images load
    - no images under Reduce Motion
    - deterministic spark and bokeh layouts
    - the file set, dimensions, color types, and the 150 KB budget, with no source media in `assets/`
- **Visual:**
  - The wordmark and five stage frames were rendered in a desktop browser at a 390×844 phone size, using the same paths, timings, ember generator, and keyframe values.
  - Those renders were used to tune ember density, molten intensity, floor glow, and cooling haze.
  - The effect upgrade was previewed the same way with the real optimized images. That led to dropping the glint and lowering the smoke so it no longer lifts the blacks.
  - This verified composition and colors only. React Native rendering, frame pacing, and on-device performance were not observed.
- **Bundling:** the iOS and Android export includes all 10 effect images.
- **Native configuration:** `expo prebuild` in a throwaway copy generated Android splash resources with `#101216` in light and dark modes and the transparent splash icon. iOS project generation is unavailable on Windows, so the iOS launch storyboard was not inspected.

## Wordmark artwork

The letters use the approved brand artwork: separate molten, cooled-steel, and final panels at 2172×724 with real transparency.

**Processing**

1. **Mask comparison:** the steel and molten masks overlap 91% (intersection over union). The panels share the same letter positions; the only differences are the molten panel's outer glow, flames, and small differences in edge softness.
2. **Master shape tracing:** the steel letter shapes were traced into the master vector `assets/splash/brand/forge-wordmark.svg`.
   - Method: an alpha threshold of 128, then 5 connected shapes and their simplified outlines.
   - Each letter is a separate path, with 9–33 points.
   - The vector does not include the tagline.
3. **`wordmark.ts` regeneration:** the file was rebuilt from those paths. The new proportions are 6.4 : 1, versus 5.4 : 1 before.
   - The F's top bar overhangs the O, and the G's overhangs the E. Each letter is therefore drawn in its own padded box; no strips are cut from a shared canvas.
4. **Rendering through one geometry:** the molten and steel textures were rendered through those **same vector shapes**.
   - Color comes from each panel. Transparency comes from the vector shape's anti-aliased coverage.
   - The two treatments therefore have pixel-identical outlines, and crossfading cannot make letters jump or show double edges.
   - At outline edges where a panel's own alpha was weak, color is extended inward from neighboring pixels, preventing dark or white fringes.
5. **Glow:** the molten panel's outer glow and flames were extracted outside the letter shapes into a separate glow image.

| File | Size | Purpose |
| --- | --- | --- |
| `brand/forge-wordmark.svg` | 639.8 × 100 units, 2.0 KB | Master vector; 5 paths with IDs F, O, R, G, E |
| `brand/wordmark-molten@3x.png` | 1440×432 RGBA, 482 KB | Master plate, wordmark at 88% width |
| `brand/wordmark-steel@3x.png` | 1440×432 RGBA, 383 KB | Master plate, same canvas |
| `brand/wordmark-glow.png` | 720×216 RGBA, 71 KB | Master glow, same canvas at half scale |
| `wordmark/molten-{F,O,R,G,E}.png` | 245–257 × 199 RGBA, 48–64 KB each | App letter images: padded letter boxes at a 1,100 px wordmark width |
| `wordmark/steel-{F,O,R,G,E}.png` | Same sizes as molten, 38–45 KB each | App letter images |
| `wordmark/glow.png` | 625×187 RGBA, 47 KB | App heat glow |

The `brand/` files are master sources; the app does not bundle them. The 11 app images total about 557 KB. Their color uses 6 bits per channel, with no visible difference in a side-by-side comparison.

**In the animation**

- Each letter keeps the existing rise, scale, and timing.
- The molten image fades in, then stays fully opaque until the steel image has fully faded in on top, so letters never become see-through mid-transition.
- The artwork's glow peaks at the molten reveal and fades as the metal cools.
- The tagline remains live React Native text in off-white `#F5F3EF`, at full opacity, and only from Stage 05.

**Fallbacks**

- Letter images are used only if **all five** letters load. Otherwise all five fall back to the vector letters, never a mix.
- Reduce Motion preloads only the five steel letters, then shows the finished logo.

## Brand assets still needed

- **Hand-drawn master vector:** `forge-wordmark.svg` is traced from a bitmap. Corners are accurate to about 1 source pixel, roughly 0.3 units, but a designer's hand-drawn master would be cleaner for large print use.
- **F app icon:** the storyboard's F icon is a promising direction, but the storyboard copy is about 100 px, so a production icon cannot be cropped from it. A separate 1024×1024 master is needed, with no transparency for iOS plus an Android adaptive foreground and background. The current app icon is unchanged.