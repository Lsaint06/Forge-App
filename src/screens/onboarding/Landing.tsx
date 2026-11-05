import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { useColors } from "../../components/ui";
import {
  BRAND_TAGLINE,
  CtaButton,
  FText,
  ForgeTopGlow,
  Gradient,
  OutlineButton,
  Wordmark,
} from "../../components/reforge";
import { LANDING, LANDING_SPOKEN } from "../../domain/onboarding/discover";
import { forge, forgeRoleFor } from "../../theme";
import { introPending, onIntroFinished } from "../../components/splash/session";
import { introMark } from "./handoff";
import { landingPlan, type LandingPlan } from "./landing-layout";
import { Entrance } from "./motion";
import { ProductWall } from "./showcase";

// Stage A, Emergence (Phase 9.2, founder-approved): the first screen of a
// fresh phone. It says what Forge stands for before Discover shows what it
// holds. It continues from the launch intro's last frame: the FORGE wordmark
// and BUILT THROUGH DISCIPLINE start exactly where the intro leaves them
// (handoff.ts) and hold that frame until the intro has faded out, so there
// is never a second wordmark. Then a wall of Forge's own screens rises out
// of the dark above the brand and the statement settles in beneath it.
// Both actions work from the first frame; nothing waits for the motion.
//
// Typography (docs/ONBOARDING.md, "Stage A"): the wordmark, then three
// weights in two faces, each with one job.
// - Brand line: the system face, semibold, the brand's wide tracking. It
//   matches the intro exactly, then settles into the secondary tone every
//   brand line has inside Forge.
// - Statement: the REFORGE display face's Bold cut, a 4:3 step above the
//   hero title, uppercase, without closing punctuation.
// - Sentence and actions: the system face; Regular to read, the app's own
//   buttons to act.

/** The launch intro has finished (or never played in this runtime). */
const introOver = () => !introPending();

export type LandingMeasures = {
  /** The screen itself, as laid out (Android's window height differs). */
  screen: number;
  brand: number;
  statement: number;
  actions: number;
  banner: number;
};
export const NO_MEASURES: LandingMeasures = {
  screen: 0,
  brand: 0,
  statement: 0,
  actions: 0,
  banner: 0,
};

/** The settle once the intro has gone: the wall rises out of the dark. */
const SETTLE_MS = 1300;
/** The statement's tracking, in ems: a touch of air for display capitals. */
const STATEMENT_TRACKING = 0.02;

/** The ember glow rising from the bottom of the screen, as in the intro. */
function FloorGlow() {
  const c = useColors();
  return (
    <Gradient
      kind="radial"
      center={{ x: 0.5, y: 1.05 }}
      radius={{ x: 0.95, y: 0.45 }}
      stops={[
        { offset: 0, color: c.emberHot, opacity: 0.16 },
        { offset: 1, color: c.emberHot, opacity: 0 },
      ]}
    />
  );
}

/**
 * BUILT THROUGH DISCIPLINE, exactly as the launch intro draws it, settling
 * into the secondary tone (`settle` 0 → 1). Colour can't be animated on the
 * native driver, so the intro's white fades out over the same line drawn in
 * the secondary tone.
 */
function BrandLine({
  size,
  width,
  settle,
}: {
  size: number;
  width: number;
  settle: Animated.Value;
}) {
  const c = useColors();
  const line: TextStyle = {
    maxWidth: width,
    fontSize: size,
    fontWeight: "600",
    letterSpacing: size * 0.42,
    textTransform: "uppercase",
  };
  return (
    // One heading for screen readers, whichever layer is showing: a fully
    // transparent view drops out of the accessibility tree.
    <View
      testID="intro-welcome-line"
      accessible
      accessibilityRole="header"
      accessibilityLabel={BRAND_TAGLINE}
      style={{ marginTop: size * 1.6 }}
    >
      <Animated.Text
        testID="intro-welcome-line-intro"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          line,
          {
            color: c.text,
            opacity: settle.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          },
        ]}
      >
        {BRAND_TAGLINE}
      </Animated.Text>
      <Animated.Text
        testID="intro-welcome-line-settled"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          line,
          StyleSheet.absoluteFill,
          { color: c.text2, opacity: settle },
        ]}
      >
        {BRAND_TAGLINE}
      </Animated.Text>
    </View>
  );
}

/** The statement in the display face, then one plain sentence. */
function Statement({ width }: { width: number }) {
  const { width: screen } = useWindowDimensions();
  // A 4:3 step above the hero title, so the scale stays the system's own.
  const size = Math.round((forgeRoleFor("heroTitle", screen).size * 4) / 3);
  return (
    <View style={{ alignItems: "center", gap: forge.spacing.margin }}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={LANDING_SPOKEN}
      >
        {LANDING.lines.map((line) => (
          <FText
            key={line}
            variant="displayLabel"
            align="center"
            numberOfLines={1}
            fit
            style={{
              fontSize: size,
              lineHeight: Math.round((size * 31) / 30),
              letterSpacing: size * STATEMENT_TRACKING,
            }}
          >
            {line}
          </FText>
        ))}
      </View>
      <FText
        variant="subtitle"
        tone="secondary"
        align="center"
        style={{ maxWidth: width }}
      >
        {LANDING.support}
      </FText>
    </View>
  );
}

export function Landing({
  banner,
  measures,
  onMeasure,
  settled,
  onSettled,
  onStart,
  onAccount,
}: {
  /** The development preview's banner. */
  banner?: React.ReactNode;
  /** Measured once and kept, so a return from Discover never jumps. */
  measures: LandingMeasures;
  onMeasure: (part: keyof LandingMeasures, height: number) => void;
  /** The settle has played once already (back from Discover). */
  settled: boolean;
  onSettled: () => void;
  onStart: () => void;
  onAccount: () => void;
}) {
  const c = useColors();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = !!useReducedMotion();
  const mark = introMark(window, insets);
  const measured =
    measures.screen > 0 &&
    measures.brand > 0 &&
    measures.statement > 0 &&
    measures.actions > 0 &&
    (!banner || measures.banner > 0);
  // Until everything is measured, the brand simply holds the intro's place.
  const plan: LandingPlan = measured
    ? landingPlan({
        height: measures.screen,
        insets,
        markTop: mark.top,
        banner: banner ? measures.banner : 0,
        brand: measures.brand,
        statement: measures.statement,
        actions: measures.actions,
      })
    : { rest: mark.top, drop: 0, gap: 28, wall: 0 };
  // Under the launch intro the brand holds the intro's last frame, so the
  // intro fades into an identical picture; the settle begins once it's gone.
  const introDone = useSyncExternalStore(onIntroFinished, introOver);
  const [rise] = useState(
    () => new Animated.Value(settled || (reduced && introOver()) ? 1 : 0),
  );
  /** Carried with the brand from the intro's place, plus `extra` below. */
  const travel = (extra = 0) =>
    rise.interpolate({
      inputRange: [0, 1],
      outputRange: [plan.drop + extra, 0],
    });
  useEffect(() => {
    if (!measured || settled || !introDone) return;
    if (reduced) {
      rise.setValue(1);
      onSettled();
      return;
    }
    Animated.timing(rise, {
      toValue: 1,
      duration: SETTLE_MS,
      delay: 140,
      easing: Easing.bezier(0.22, 0, 0, 1),
      useNativeDriver: true,
    }).start(({ finished }) => finished && onSettled());
  }, [measured, settled, introDone, reduced, rise, onSettled]);
  const margin = forge.spacing.margin;
  return (
    <View
      testID="intro-welcome-screen"
      onLayout={(e) => onMeasure("screen", e.nativeEvent.layout.height)}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <ForgeTopGlow />
      <FloorGlow />
      {plan.wall > 0 && (
        <ProductWall
          width={window.width}
          band={plan.wall}
          progress={rise}
          still={reduced}
        />
      )}
      <ScrollView
        testID="intro-welcome-scroll"
        contentInsetAdjustmentBehavior="never"
        bounces={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View testID="intro-welcome-rest" style={{ height: plan.rest }} />
        <Animated.View
          testID="intro-welcome-brand"
          style={{ transform: [{ translateY: travel() }] }}
        >
          <View
            testID="intro-welcome"
            onLayout={(e) => onMeasure("brand", e.nativeEvent.layout.height)}
            style={{ alignItems: "center", paddingHorizontal: 32 }}
          >
            <Wordmark width={mark.width} />
            <BrandLine size={mark.tagline} width={mark.width} settle={rise} />
          </View>
        </Animated.View>
        <Animated.View
          testID="intro-welcome-statement"
          onLayout={(e) => onMeasure("statement", e.nativeEvent.layout.height)}
          style={{
            marginTop: plan.gap,
            paddingHorizontal: margin,
            opacity: rise.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0, 0, 1],
            }),
            transform: [{ translateY: travel(16) }],
          }}
        >
          <Statement width={mark.width} />
        </Animated.View>
        <View style={{ flexGrow: 1 }} />
        <View
          testID="intro-welcome-actions"
          onLayout={(e) => onMeasure("actions", e.nativeEvent.layout.height)}
          style={{
            paddingHorizontal: margin,
            paddingTop: forge.spacing.group,
            paddingBottom: insets.bottom + forge.spacing.group,
          }}
        >
          <Entrance delay={120} style={{ gap: forge.spacing.group }}>
            <CtaButton
              title="Get started"
              icon="arrow-forward"
              accessibilityHint="See what Forge does, then create your account"
              onPress={onStart}
            />
            <OutlineButton
              title="I already have an account"
              onPress={onAccount}
            />
          </Entrance>
        </View>
      </ScrollView>
      {banner && (
        <View
          onLayout={(e) => onMeasure("banner", e.nativeEvent.layout.height)}
          style={{
            position: "absolute",
            top: insets.top + forge.spacing.tight,
            left: margin,
            right: margin,
          }}
        >
          {banner}
        </View>
      )}
    </View>
  );
}
