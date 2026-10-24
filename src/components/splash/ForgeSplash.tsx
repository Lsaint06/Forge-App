import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import Svg, {
  Defs,
  Ellipse,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import {
  GLOW_REGION,
  LETTER_PAD,
  WORDMARK_HEIGHT,
  WORDMARK_WIDTH,
  wordmarkLetters,
} from "./wordmark";

import {
  ASSET_GIVE_UP_MS,
  INTRO,
  SPLASH_COLORS,
  makeBokeh,
  makeParticles,
  makeSparks,
} from "./timeline";
import { assetEntries, splashAssets, type SplashAssets } from "./assets";

export { INTRO, SPLASH_COLORS };

// The heat halo that rings each letter while the metal is molten.
function LetterGlow({
  path,
  width,
  scale,
}: {
  path: string;
  width: number;
  scale: number;
}) {
  return (
    <Svg
      width={(width + LETTER_PAD * 2) * scale}
      height={(WORDMARK_HEIGHT + LETTER_PAD * 2) * scale}
      viewBox={`${-LETTER_PAD} ${-LETTER_PAD} ${width + LETTER_PAD * 2} ${WORDMARK_HEIGHT + LETTER_PAD * 2}`}
      style={StyleSheet.absoluteFill}
    >
      <Path
        d={path}
        fillRule="evenodd"
        fill="none"
        stroke={SPLASH_COLORS.orange}
        strokeOpacity={0.35}
        strokeWidth={14}
        strokeLinejoin="round"
      />
      <Path
        d={path}
        fillRule="evenodd"
        fill="none"
        stroke="#FF9A55"
        strokeOpacity={0.6}
        strokeWidth={6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * The FORGE intro, built from its artwork images. It waits on the plain
 * charcoal launch background until every image has loaded, then plays. If an
 * image fails or doesn't arrive within ASSET_GIVE_UP_MS, the intro is skipped
 * and the app appears: there is no image-free version of the intro.
 */
export function ForgeSplash({
  ready,
  onFinish,
  reduceMotion,
  assets = splashAssets,
}: {
  // The app has finished initializing and can be shown.
  ready: boolean;
  onFinish: () => void;
  // Overrides the system reduced-motion preference (tests).
  reduceMotion?: boolean;
  // The intro's artwork (tests may substitute their own).
  assets?: SplashAssets;
}) {
  const systemReduced = useReducedMotion();
  const reduced = reduceMotion ?? systemReduced;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const markWidth = Math.min(width - 64, 440, height * 0.9);
  const scale = markWidth / WORDMARK_WIDTH;
  const markHeight = WORDMARK_HEIGHT * scale;
  const taglineSize = Math.max(10, Math.min(14, markWidth * 0.032));

  // Animated values are created once per mount and never read as refs.
  const [clock] = useState(() => new Animated.Value(reduced ? INTRO.total : 0));
  const [fade] = useState(() => new Animated.Value(1));
  const [sequenceDone, setSequenceDone] = useState(reduced);

  // Every artwork image preloads invisibly; the intro plays only once all of
  // them have loaded. Reduced motion needs only the finished steel letters.
  const entries = useMemo(
    () => assetEntries(assets, reduced),
    [reduced, assets],
  );
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const complete = loaded.size >= entries.length;
  // Never fall back to drawn artwork: without every image, skip the intro.
  const skipped = !complete && (failed || timedOut);
  // Read and written only in callbacks and effects, never during render.
  const settled = useRef(false);
  useEffect(() => {
    if (complete || skipped) {
      settled.current = true;
      return;
    }
    const timer = setTimeout(() => {
      settled.current = true;
      setTimedOut(true);
    }, ASSET_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [complete, skipped]);
  const markLoaded = (key: string) => {
    if (!settled.current) setLoaded((prev) => new Set(prev).add(key));
  };
  const markFailed = () => {
    if (!settled.current) setFailed(true);
  };
  const playing = complete;
  // Leave once the sequence is done and the app is ready (or at once when the
  // intro was skipped). The intro always plays through; slow initialization
  // holds the finished logo and the sequence never loops.
  const exiting = ready && (skipped || (playing && sequenceDone));

  const particles = useMemo(
    () => (reduced ? [] : makeParticles(width, height, markWidth, markHeight)),
    [reduced, width, height, markWidth, markHeight],
  );
  const sparks = useMemo(
    () => makeSparks(markWidth, markHeight, assets.sparks.length),
    [markWidth, markHeight, assets.sparks.length],
  );
  const bokeh = useMemo(
    () => makeBokeh(width, height, assets.bokeh.length),
    [width, height, assets.bokeh.length],
  );

  useEffect(() => {
    if (reduced || !playing) return;
    const run = Animated.timing(clock, {
      toValue: INTRO.total,
      duration: INTRO.total,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setSequenceDone(true);
    });
    return () => run.stop();
  }, [clock, reduced, playing]);

  useEffect(() => {
    if (!exiting) return;
    clock.stopAnimation();
    const out = Animated.timing(fade, {
      toValue: 0,
      duration: reduced ? 200 : INTRO.exit,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    out.start(({ finished }) => {
      if (finished) onFinish();
    });
    return () => out.stop();
    // onFinish identity may change per render; the exit runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting, clock, fade, reduced]);

  const at = (input: number[], output: number[]) =>
    clock.interpolate({
      inputRange: input,
      outputRange: output,
      extrapolate: "clamp",
    });
  const centerY = insets.top + (height - insets.top - insets.bottom) / 2;
  const markTop = centerY - markHeight / 2 - taglineSize;
  const smokeWidth = width * 1.2;
  const smokeHeight = (smokeWidth * 960) / 540;

  return (
    <Animated.View
      pointerEvents={exiting ? "none" : "auto"}
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: SPLASH_COLORS.charcoal, opacity: fade },
      ]}
    >
      <StatusBar style="light" />
      {playing && !reduced && (
        <>
          {/* Molten forge floor: a low, dim glow, not a flame effect. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: height * 0.42,
              opacity: at(
                [INTRO.ignite, INTRO.forge, INTRO.reveal + 200, INTRO.settle],
                [0, 0.45, 0.75, 0.3],
              ),
            }}
          >
            <Svg width={width} height={height * 0.42}>
              <Defs>
                <RadialGradient
                  id="floor"
                  cx="50%"
                  cy="100%"
                  rx="70%"
                  ry="100%"
                >
                  <Stop
                    offset="0"
                    stopColor={SPLASH_COLORS.orange}
                    stopOpacity={0.55}
                  />
                  <Stop offset="0.5" stopColor="#7A2A12" stopOpacity={0.25} />
                  <Stop
                    offset="1"
                    stopColor={SPLASH_COLORS.charcoal}
                    stopOpacity={0}
                  />
                </RadialGradient>
              </Defs>
              <Ellipse
                cx={width / 2}
                cy={height * 0.42}
                rx={width * 0.9}
                ry={height * 0.42}
                fill="url(#floor)"
              />
            </Svg>
          </Animated.View>
          {/* Heat bloom behind the letters. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: width / 2 - markWidth * 0.85,
              top: markTop + markHeight / 2 - markHeight * 2,
              opacity: at(
                [
                  INTRO.forge,
                  INTRO.reveal,
                  INTRO.reveal + 150,
                  INTRO.cool,
                  INTRO.settle,
                ],
                [0, 0.6, 1, 0.65, 0.08],
              ),
            }}
          >
            <Svg width={markWidth * 1.7} height={markHeight * 4}>
              <Defs>
                <RadialGradient id="heat" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor="#FF7A2E" stopOpacity={0.75} />
                  <Stop offset="0.6" stopColor="#A63A16" stopOpacity={0.2} />
                  <Stop
                    offset="1"
                    stopColor={SPLASH_COLORS.charcoal}
                    stopOpacity={0}
                  />
                </RadialGradient>
              </Defs>
              <Ellipse
                cx={markWidth * 0.85}
                cy={markHeight * 2}
                rx={markWidth * 0.85}
                ry={markHeight * 2}
                fill="url(#heat)"
              />
            </Svg>
          </Animated.View>
          {/* Cooling smoke rises off the metal. */}
          <Animated.View
            testID="splash-smoke"
            pointerEvents="none"
            style={{
              position: "absolute",
              left: width / 2 - smokeWidth / 2,
              top: markTop + markHeight / 2 - smokeHeight * 0.55,
              opacity: at(
                [INTRO.cool - 150, INTRO.cool + 400, INTRO.total],
                [0, 0.26, 0.12],
              ),
              transform: [
                {
                  translateY: at([INTRO.cool - 150, INTRO.total], [26, -30]),
                },
                { scale: at([INTRO.cool - 150, INTRO.total], [1.04, 1.12]) },
              ],
            }}
          >
            <Image
              source={assets.smoke}
              resizeMode="stretch"
              style={{
                width: smokeWidth,
                height: smokeHeight,
                tintColor: "#A3A9B1",
              }}
            />
          </Animated.View>
          {/* Out-of-focus embers for depth. */}
          {bokeh.map((b, i) => (
            <Animated.View
              key={`bokeh-${i}`}
              testID="splash-bokeh"
              pointerEvents="none"
              style={{
                position: "absolute",
                left: width / 2 + b.at[0] - b.size / 2,
                top: centerY + b.at[1] - b.size / 2,
                opacity: at(
                  [
                    INTRO.ignite + 150,
                    INTRO.forge + 250,
                    INTRO.reveal + 150,
                    INTRO.cool + 250,
                    INTRO.settle,
                  ],
                  [0, b.opacity * 0.7, b.opacity, b.opacity * 0.5, 0],
                ),
                transform: [
                  { translateY: at([0, INTRO.settle], [b.rise, -b.rise]) },
                ],
              }}
            >
              <Image
                source={assets.bokeh[b.sprite]!}
                resizeMode="stretch"
                style={{ width: b.size, height: b.size }}
              />
            </Animated.View>
          ))}
          {particles.map((p, i) => {
            const enter = INTRO.ignite + p.appear;
            const path = [
              enter,
              INTRO.reveal - 100,
              INTRO.reveal + 50,
              INTRO.cool + 100,
              INTRO.settle,
            ];
            return (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: width / 2,
                  top: centerY - taglineSize,
                  opacity: at(
                    [
                      enter,
                      enter + 160,
                      INTRO.reveal - 100,
                      INTRO.reveal + 50,
                      INTRO.cool + 200,
                      INTRO.settle,
                    ],
                    [0, p.brightness, p.brightness * 0.75, 1, 0.45, 0],
                  ),
                  transform: [
                    {
                      translateX: at(path, [
                        p.start[0],
                        p.gather[0],
                        p.gather[0],
                        p.burst[0],
                        p.drift[0],
                      ]),
                    },
                    {
                      translateY: at(path, [
                        p.start[1],
                        p.gather[1],
                        p.gather[1],
                        p.burst[1],
                        p.drift[1],
                      ]),
                    },
                  ],
                }}
              >
                <Image
                  source={assets.ember}
                  resizeMode="stretch"
                  style={{
                    position: "absolute",
                    width: p.size * 3.6,
                    height: p.size * 3.6,
                    left: -p.size * 1.8,
                    top: -p.size * 1.8,
                    opacity: 0.55,
                    tintColor: SPLASH_COLORS.orange,
                  }}
                />
                <Image
                  source={assets.ember}
                  resizeMode="stretch"
                  style={{
                    position: "absolute",
                    width: p.size * 1.3,
                    height: p.size * 1.3,
                    left: -p.size * 0.65,
                    top: -p.size * 0.65,
                    tintColor: p.hot ? "#FFE2A8" : "#FFB066",
                  }}
                />
              </Animated.View>
            );
          })}
          {/* Real spark streaks thrown off at the molten reveal. */}
          {sparks.map((s, i) => {
            const start = INTRO.reveal + s.delay;
            const end = start + s.duration;
            return (
              <Animated.View
                key={`spark-${i}`}
                testID="splash-spark"
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: width / 2 - s.width / 2,
                  top: centerY - taglineSize - s.length / 2,
                  width: s.width,
                  height: s.length,
                  opacity: at(
                    [start, start + 40, start + s.duration * 0.55, end],
                    [0, 1, 0.85, 0],
                  ),
                  transform: [
                    { translateX: at([start, end], [s.from[0], s.to[0]]) },
                    { translateY: at([start, end], [s.from[1], s.to[1]]) },
                    { rotate: s.rotate },
                    { scaleY: at([start, end], [0.6, 1.15]) },
                  ],
                }}
              >
                <Image
                  source={assets.sparks[s.sprite]!}
                  resizeMode="stretch"
                  style={{ width: s.width, height: s.length }}
                />
              </Animated.View>
            );
          })}
        </>
      )}
      {playing && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: markTop,
            alignItems: "center",
          }}
        >
          <Animated.View
            accessible
            accessibilityRole="image"
            accessibilityLabel="FORGE. Built through discipline."
            style={{
              width: markWidth,
              height: markHeight,
              transform: [
                {
                  scale: at(
                    [INTRO.reveal, INTRO.reveal + 150, INTRO.cool],
                    [1, 1.03, 1],
                  ),
                },
              ],
            }}
          >
            {/* The artwork's own heat glow, once every letter has formed. */}
            {!reduced && (
              <Animated.View
                testID="splash-wordmark-glow"
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: GLOW_REGION.x * scale,
                  top: GLOW_REGION.y * scale,
                  width: GLOW_REGION.width * scale,
                  height: GLOW_REGION.height * scale,
                  opacity: at(
                    [
                      INTRO.reveal - 150,
                      INTRO.reveal + 120,
                      INTRO.cool,
                      INTRO.cool + 420,
                    ],
                    [0, 1, 0.7, 0],
                  ),
                }}
              >
                <Image
                  source={assets.wordmarkGlow}
                  resizeMode="stretch"
                  style={{
                    width: GLOW_REGION.width * scale,
                    height: GLOW_REGION.height * scale,
                  }}
                />
              </Animated.View>
            )}
            {wordmarkLetters.map((letter, i) => {
              const start = INTRO.forge + i * 90;
              const box = {
                position: "absolute" as const,
                left: (letter.x - LETTER_PAD) * scale,
                top: -LETTER_PAD * scale,
                width: (letter.width + LETTER_PAD * 2) * scale,
                height: (WORDMARK_HEIGHT + LETTER_PAD * 2) * scale,
              };
              const fill = {
                width: box.width,
                height: box.height,
              };
              return (
                <Animated.View
                  key={letter.key}
                  testID="splash-letter-textured"
                  style={[
                    box,
                    {
                      transform: [
                        {
                          translateY: at(
                            [start, start + 380],
                            [markHeight * 0.14, 0],
                          ),
                        },
                        { scale: at([start, start + 380], [0.9, 1]) },
                      ],
                    },
                  ]}
                >
                  {!reduced && (
                    <>
                      <Animated.View
                        style={[
                          StyleSheet.absoluteFill,
                          {
                            // The image glow takes over at the reveal.
                            opacity: at(
                              [
                                start,
                                start + 250,
                                INTRO.reveal,
                                INTRO.reveal + 120,
                              ],
                              [0, 0.45, 0.45, 0],
                            ),
                          },
                        ]}
                      >
                        <LetterGlow
                          path={letter.path}
                          width={letter.width}
                          scale={scale}
                        />
                      </Animated.View>
                      {/* Molten stays opaque beneath the fading-in steel, so
                          the letters never turn see-through mid-transition. */}
                      <Animated.View
                        style={[
                          StyleSheet.absoluteFill,
                          {
                            opacity: at(
                              [
                                start,
                                start + 220,
                                INTRO.cool + 560,
                                INTRO.cool + 600,
                              ],
                              [0, 1, 1, 0],
                            ),
                          },
                        ]}
                      >
                        <Image
                          source={assets.molten[i]!}
                          resizeMode="stretch"
                          style={fill}
                        />
                      </Animated.View>
                    </>
                  )}
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        opacity: at(
                          [INTRO.cool + 50, INTRO.cool + 550],
                          [0, 1],
                        ),
                      },
                    ]}
                  >
                    <Image
                      source={assets.steel[i]!}
                      resizeMode="stretch"
                      style={fill}
                    />
                  </Animated.View>
                </Animated.View>
              );
            })}
          </Animated.View>
          <Animated.Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              marginTop: taglineSize * 1.6,
              maxWidth: markWidth,
              color: SPLASH_COLORS.offWhite,
              fontSize: taglineSize,
              fontWeight: "600",
              letterSpacing: taglineSize * 0.42,
              opacity: at([INTRO.settle, INTRO.settle + 350], [0, 1]),
              transform: [
                {
                  translateY: at([INTRO.settle, INTRO.settle + 350], [6, 0]),
                },
              ],
            }}
          >
            BUILT THROUGH DISCIPLINE
          </Animated.Text>
          {sequenceDone && !ready && (
            <View style={{ marginTop: 28 }}>
              <ActivityIndicator
                color={SPLASH_COLORS.orange}
                accessibilityLabel="Preparing FORGE"
              />
            </View>
          )}
        </View>
      )}
      {skipped && !ready && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { alignItems: "center", justifyContent: "center" },
          ]}
        >
          <ActivityIndicator
            color={SPLASH_COLORS.orange}
            accessibilityLabel="Preparing FORGE"
          />
        </View>
      )}
      {/* Invisible preloads; the intro plays only once all of them load. */}
      {!complete &&
        !skipped &&
        entries.map(([key, source]) => (
          <Image
            key={key}
            testID={`splash-preload-${key}`}
            source={source}
            onLoad={() => markLoaded(key)}
            onError={markFailed}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          />
        ))}
    </Animated.View>
  );
}
