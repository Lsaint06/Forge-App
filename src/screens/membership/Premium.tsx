import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "../../components/ui";
import {
  BRAND_TAGLINE,
  FText,
  Gradient,
  Wordmark,
} from "../../components/reforge";
import { splashAssets } from "../../components/splash/assets";
import {
  LETTER_PAD,
  WORDMARK_HEIGHT,
  WORDMARK_WIDTH,
  wordmarkLetters,
} from "../../components/splash/wordmark";
import { forge } from "../../theme";
import type { MembershipOffer } from "../../billing/offer";
import type { Granted, MemberVia } from "../../billing/paywall";
import { memberLines } from "../../billing/paywall";
import {
  MEMBERSHIP_INTRO,
  PASS_NOTE,
  type PremiumPath,
  type Story,
} from "../../domain/onboarding/premium";
import { EntryMessage } from "../entry/EntryFrame";
import { AccountChip, type SetupAccount } from "../onboarding/account";
import { Entrance } from "../onboarding/motion";
import { EdgeFade, StepIssue } from "../onboarding/parts";
import { SessionDays } from "../onboarding/week";

// Forge Premium's composition (Phase 9.3, the founder's "Reference 3"
// direction): the last chapter of setup, presented like a product rather
// than a checkout, in two acts.
// - The invitation: the FORGE wordmark, a two-line headline with the
//   athlete's own number in Forge's accent, one sentence, and one
//   centerpiece: their Forge Path as a pass, showing its structure only
//   (each day's focus and size; the program itself is Forge Premium's).
//   Then what the membership includes, as four quiet tiles.
// - The membership: the plan as one selected steel card, where the store's
//   price is the most prominent price, the free week as a timeline when
//   Apple says the account may have it, the action, and the terms.
// A floating action waits at the bottom until the membership's own action
// scrolls into view, then steps aside: one action on screen at a time.
//
// Restraint is the rule: off-white type, silver surfaces, Forge's ember only
// for the accent, the action and the pass's edge; nothing loops; with Reduce
// Motion everything is simply in place.

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** How the step appears: from the reveal ("continue") or as it is ("settle"). */
export type Arrival = "continue" | "settle";

/** Delays for the arrival from the reveal; settling waits for nothing. */
const at = (arrival: Arrival, ms: number) => (arrival === "continue" ? ms : 0);

const HAIRLINE = StyleSheet.hairlineWidth;

// Brushed steel for the selected plan: Forge's silver, on which ink is dark.
const STEEL = {
  top: "#FBFAF8",
  mid: "#ECEDEE",
  low: "#CDD0D4",
  ink: "#0A0B0D",
  ink2: "#4E5864",
  pill: "#101214",
};

// ---- The room -----------------------------------------------------------------

function Beam({ left, opacity }: { left: `${number}%`; opacity: number }) {
  const c = useColors();
  return (
    <View
      style={{
        position: "absolute",
        top: "-15%",
        height: "130%",
        width: "55%",
        left,
        opacity,
        transform: [{ rotate: "18deg" }],
      }}
    >
      <Gradient
        from={{ x: 0, y: 0 }}
        to={{ x: 1, y: 0 }}
        stops={[
          { offset: 0, color: c.text, opacity: 0 },
          { offset: 0.5, color: c.text, opacity: 0.026 },
          { offset: 1, color: c.text, opacity: 0 },
        ]}
      />
    </View>
  );
}

/**
 * The light the membership is shown in: cool from above, the forge's warmth
 * behind the pass, two faint beams. Still and decorative.
 */
export function PremiumBackdrop() {
  const c = useColors();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Gradient
        kind="radial"
        center={{ x: 0.5, y: 0 }}
        radius={{ x: 0.7, y: 0.3 }}
        stops={[
          { offset: 0, color: c.text, opacity: 0.09 },
          { offset: 1, color: c.text, opacity: 0 },
        ]}
      />
      <Gradient
        kind="radial"
        center={{ x: 0.5, y: 0.45 }}
        radius={{ x: 0.75, y: 0.28 }}
        stops={[
          { offset: 0, color: c.emberHot, opacity: 0.16 },
          { offset: 1, color: c.emberHot, opacity: 0 },
        ]}
      />
      <Beam left="-38%" opacity={1} />
      <Beam left="28%" opacity={0.7} />
    </View>
  );
}

// ---- The frame and its floating action ----------------------------------------

/** The fade above the floating action, over the composition it floats on. */
const DOCK_FADE = 48;
/** How long the floating action takes to fade in. */
const DOCK_IN_MS = 260;

type Decision = {
  /** Where the membership's own action is, in the scroll content. */
  action: (y: number) => void;
  /** Where the floating copy of the action is, from the top of the dock. */
  floating: (y: number) => void;
  /** Scrolls the membership's action to where the floating one was. */
  reveal: () => void;
};
const DecisionContext = createContext<Decision>({
  action: () => {},
  floating: () => {},
  reveal: () => {},
});
export const useDecision = () => useContext(DecisionContext);

/**
 * Forge Premium's screen: setup's top bar (Back and the account being set
 * up), the scrolling composition in its own light, and `dock`, a floating
 * copy of the action. The floating copy waits at the bottom until the
 * membership's own action scrolls up to the same place, then steps aside
 * there, so one action is on screen at a time and the hand-over can't be
 * seen. Screen readers meet the actions once, in order: the floating copy is
 * hidden from them.
 */
export function PremiumFrame({
  onBack,
  account,
  banner,
  error,
  dock,
  arrival = "settle",
  children,
}: {
  onBack?: () => void;
  account?: SetupAccount;
  /** The development preview's banner. */
  banner?: React.ReactNode;
  /** Something setup itself must say (a failed sign-out). */
  error?: string;
  dock?: React.ReactNode;
  /** "continue": the floating action arrives after the composition. */
  arrival?: Arrival;
  children: React.ReactNode;
}) {
  const c = useColors();
  const reduced = !!useReducedMotion();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Measured, never assumed: the viewport, the dock and both actions.
  const geo = useRef({ viewport: 0, dock: 0, floating: -1, action: -1, y: 0 });
  const [docked, setDocked] = useState<boolean>();
  const measure = useCallback(() => {
    const g = geo.current;
    if (g.viewport <= 0 || g.dock <= 0 || g.floating < 0 || g.action < 0)
      return;
    // The floating action's place, in the scroll content's terms.
    const floating = g.y + g.viewport - g.dock + g.floating;
    // It steps aside once the membership's action reaches its place, and
    // returns only once that is well below again: never trading on a pixel.
    setDocked((was) => (was ? g.action < floating + 40 : g.action <= floating));
  }, []);
  const decision = useMemo<Decision>(
    () => ({
      action: (y) => {
        geo.current.action = y;
        measure();
      },
      floating: (y) => {
        // The action is measured in the dock's body, under its fade.
        geo.current.floating = DOCK_FADE + y;
        measure();
      },
      reveal: () => {
        const g = geo.current;
        if (g.viewport <= 0 || g.floating < 0 || g.action < 0) return;
        scroll.current?.scrollTo({
          y: Math.max(0, g.action - (g.viewport - g.dock + g.floating) + 24),
          animated: !reduced,
        });
      },
    }),
    [measure, reduced],
  );
  // Hidden until measured, so a screen tall enough to show the decision
  // never flashes the floating copy.
  const shown = useSharedValue(0);
  const first = useRef(true);
  // Pressable only once it has appeared: never while it waits or fades in
  // (a second tap on the reveal's Continue lands in the same place), and
  // never once it starts to step aside. Each change starts over as it
  // renders; with Reduce Motion it appears at once.
  const [pressable, setPressable] = useState(false);
  const [seen, setSeen] = useState({ docked, reduced });
  if (seen.docked !== docked || seen.reduced !== reduced) {
    setSeen({ docked, reduced });
    setPressable(reduced && docked === false);
  }
  useEffect(() => {
    if (docked === undefined) return;
    const target = docked ? 0 : 1;
    const wait = first.current && arrival === "continue" ? 640 : 0;
    first.current = false;
    if (reduced) {
      shown.value = target;
      return;
    }
    shown.value = withDelay(
      wait,
      withTiming(target, { duration: target ? DOCK_IN_MS : 160 }),
    );
    if (docked) return;
    const appeared = setTimeout(() => setPressable(true), wait + DOCK_IN_MS);
    return () => clearTimeout(appeared);
  }, [docked, reduced, arrival, shown]);
  const dockStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <PremiumBackdrop />
      {(onBack || account) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: forge.heights.compact,
            paddingHorizontal: 6,
          }}
        >
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={4}
              onPress={onBack}
              style={({ pressed }) => ({
                minWidth: forge.heights.compact,
                minHeight: forge.heights.compact,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={26} color={c.text} />
            </Pressable>
          ) : (
            <View style={{ width: forge.heights.compact }} />
          )}
          {account && <AccountChip account={account} />}
        </View>
      )}
      {banner && (
        <View
          style={{
            paddingHorizontal: forge.spacing.margin,
            paddingTop: onBack || account ? 0 : forge.spacing.tight,
            paddingBottom: forge.spacing.tight,
          }}
        >
          {banner}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <DecisionContext.Provider value={decision}>
          <ScrollView
            ref={scroll}
            testID="premium-scroll"
            onLayout={(e) => {
              geo.current.viewport = e.nativeEvent.layout.height;
              measure();
            }}
            onScroll={(e) => {
              geo.current.y = e.nativeEvent.contentOffset.y;
              measure();
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 20,
              paddingTop: forge.spacing.tight,
              paddingBottom: 36,
            }}
          >
            <EntryMessage text={error} tone="error" />
            {children}
          </ScrollView>
          <EdgeFade edge="top" height={14} />
          <EdgeFade edge="bottom" height={18} />
          {dock && (
            <Animated.View
              testID="premium-dock"
              pointerEvents={
                docked === false && pressable ? "box-none" : "none"
              }
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onLayout={(e) => {
                geo.current.dock = e.nativeEvent.layout.height;
                measure();
              }}
              style={[
                { position: "absolute", left: 0, right: 0, bottom: 0 },
                dockStyle,
              ]}
            >
              <View style={{ height: DOCK_FADE }}>
                <Gradient
                  stops={[
                    { offset: 0, color: c.bg, opacity: 0 },
                    { offset: 0.55, color: c.bg, opacity: 0.8 },
                    { offset: 1, color: c.bg, opacity: 1 },
                  ]}
                />
              </View>
              <View
                pointerEvents="box-none"
                style={{
                  backgroundColor: c.bg,
                  paddingHorizontal: 20,
                  paddingBottom: 6,
                  gap: 10,
                }}
              >
                {dock}
              </View>
            </Animated.View>
          )}
        </DecisionContext.Provider>
      </View>
    </SafeAreaView>
  );
}

/**
 * Reports where its child (an action) is, from the top of its parent: for
 * the floating copy, the dock; for the membership's own, see PaywallActions.
 */
export function Measured({
  report,
  testID,
  children,
}: {
  report: (y: number) => void;
  testID?: string;
  children?: React.ReactNode;
}) {
  return (
    <View testID={testID} onLayout={(e) => report(e.nativeEvent.layout.y)}>
      {children}
    </View>
  );
}

// ---- Act one: the invitation ---------------------------------------------------

/**
 * The wordmark, the headline (Stage A's rule: no closing punctuation; the
 * athlete's own number in Forge's accent) and one sentence.
 */
export function PremiumHero({
  story,
  arrival,
}: {
  story: Story;
  arrival: Arrival;
}) {
  const { width } = useWindowDimensions();
  const size = width < 390 ? 42 : 48;
  const [first, second] = story.statement;
  const i = first.indexOf(story.accent);
  const line = {
    fontSize: size,
    lineHeight: Math.round(size * 0.94),
    letterSpacing: 0.4,
  };
  return (
    <View style={{ alignItems: "center", paddingTop: 10 }}>
      <Entrance delay={at(arrival, 0)} distance={6}>
        <View style={{ alignItems: "center", gap: 11 }}>
          <Wordmark width={100} />
          <FText
            variant="overline"
            tone="accent"
            style={{ fontSize: 10.5, letterSpacing: 6 }}
          >
            Premium
          </FText>
        </View>
      </Entrance>
      <Entrance
        delay={at(arrival, 140)}
        distance={14}
        style={{ marginTop: 22, alignSelf: "stretch" }}
      >
        <View
          testID="premium-headline"
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${first}. ${second}`}
        >
          <FText
            variant="heroTitle"
            align="center"
            numberOfLines={1}
            fit
            style={line}
          >
            {i >= 0 ? first.slice(0, i) : first}
            {i >= 0 && (
              <FText variant="heroTitle" tone="accent" style={line}>
                {story.accent}
              </FText>
            )}
            {i >= 0 ? first.slice(i + story.accent.length) : ""}
          </FText>
          <FText
            variant="heroTitle"
            align="center"
            numberOfLines={1}
            fit
            style={line}
          >
            {second}
          </FText>
        </View>
      </Entrance>
      <Entrance
        delay={at(arrival, 240)}
        distance={10}
        style={{ marginTop: 14 }}
      >
        <FText
          variant="subtitle"
          tone="secondary"
          align="center"
          style={{ maxWidth: 310, fontSize: 16.5, lineHeight: 24 }}
        >
          {story.support}
        </FText>
      </Entrance>
    </View>
  );
}

/** One slow sweep of light across the pass as it arrives from the reveal. */
function PassGlint({ play }: { play: boolean }) {
  const reduced = !!useReducedMotion();
  const run = play && !reduced;
  const t = useSharedValue(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!run || width === 0) return;
    t.value = withDelay(
      820,
      withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }),
    );
  }, [run, width, t]);
  const sweep = useAnimatedStyle(
    () => ({
      // Inline maths only: this runs on the UI thread.
      opacity:
        t.value <= 0 || t.value >= 1
          ? 0
          : Math.min(1, t.value * 4, (1 - t.value) * 4),
      transform: [
        { translateX: -140 + t.value * (width + 200) },
        { rotate: "18deg" },
      ],
    }),
    [width],
  );
  if (!run) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          { position: "absolute", top: "-30%", height: "160%", width: 90 },
          sweep,
        ]}
      >
        <Gradient
          from={{ x: 0, y: 0 }}
          to={{ x: 1, y: 0 }}
          stops={[
            { offset: 0, color: "#FFFFFF", opacity: 0 },
            { offset: 0.5, color: "#FFFFFF", opacity: 0.1 },
            { offset: 1, color: "#FFFFFF", opacity: 0 },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The centerpiece: the athlete's Forge Path as a pass. Who it is built for,
 * what it is and its shape, then each training day by its focus and size.
 * The program itself (exercises, sets, reps) is never shown before a
 * membership; the last line says where it is.
 */
export function PathPass({
  path,
  arrival,
}: {
  path: PremiumPath;
  arrival: Arrival;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const title = width < 390 ? 30 : 34;
  return (
    <Entrance
      delay={at(arrival, 340)}
      distance={arrival === "continue" ? 26 : 10}
      style={{ marginTop: 30 }}
    >
      <View
        style={{
          borderRadius: 24,
          shadowColor: "#000000",
          shadowOpacity: 0.6,
          shadowRadius: 34,
          shadowOffset: { width: 0, height: 22 },
        }}
      >
        <View
          testID="premium-pass"
          style={{ borderRadius: 24, padding: 1, overflow: "hidden" }}
        >
          {/* The edge: steel at the top, ember at the far corner. */}
          <Gradient
            from={{ x: 0, y: 0 }}
            to={{ x: 1, y: 1 }}
            stops={[
              { offset: 0, color: c.text, opacity: 0.34 },
              { offset: 0.34, color: c.text, opacity: 0.08 },
              { offset: 0.58, color: c.text, opacity: 0.04 },
              { offset: 1, color: c.emberHot, opacity: 0.7 },
            ]}
          />
          <View
            style={{
              borderRadius: 23,
              overflow: "hidden",
              backgroundColor: c.cardBg,
            }}
          >
            <Gradient
              from={{ x: 0.3, y: 0 }}
              to={{ x: 0.7, y: 1 }}
              stops={[
                { offset: 0, color: c.surface },
                { offset: 0.55, color: c.cardBg },
                { offset: 1, color: c.cardBg },
              ]}
            />
            <Gradient
              kind="radial"
              center={{ x: 1, y: 0 }}
              radius={{ x: 0.8, y: 0.5 }}
              stops={[
                { offset: 0, color: c.emberHot, opacity: 0.22 },
                { offset: 1, color: c.emberHot, opacity: 0 },
              ]}
            />
            {/* Light catching the pass's top edge. */}
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 1,
              }}
            >
              <Gradient
                from={{ x: 0, y: 0 }}
                to={{ x: 1, y: 0 }}
                stops={[
                  { offset: 0, color: c.text, opacity: 0 },
                  { offset: 0.5, color: c.text, opacity: 0.35 },
                  { offset: 1, color: c.text, opacity: 0 },
                ]}
              />
            </View>
            <View
              pointerEvents="none"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: "absolute",
                right: -70,
                bottom: -18,
                opacity: 0.045,
              }}
            >
              <Wordmark width={340} />
            </View>
            <PassGlint play={arrival === "continue"} />
            <View style={{ padding: 22, paddingBottom: 18 }}>
              <View
                accessible
                accessibilityRole="header"
                accessibilityLabel={`${path.builtFor}: ${path.title}. ${path.meta}.`}
              >
                <FText
                  variant="overline"
                  tone="accent"
                  style={{ letterSpacing: 2.8 }}
                >
                  {path.builtFor}
                </FText>
                <FText
                  variant="heroTitle"
                  style={{
                    fontSize: title,
                    lineHeight: title - 2,
                    marginTop: 10,
                  }}
                >
                  {path.title}
                </FText>
                <FText
                  variant="body"
                  tone="secondary"
                  style={{ marginTop: 9, fontSize: 14, lineHeight: 19 }}
                >
                  {path.meta}
                </FText>
              </View>
              <View
                style={{
                  marginTop: 14,
                  borderTopWidth: HAIRLINE,
                  borderTopColor: c.cardDivider,
                }}
              >
                <SessionDays days={path.days} testID="premium-days" />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  paddingTop: 13,
                  borderTopWidth: HAIRLINE,
                  borderTopColor: c.cardDivider,
                }}
              >
                <Ionicons name="lock-closed" size={13} color={c.emberHot} />
                <FText variant="label" tone="secondary" style={{ flex: 1 }}>
                  {PASS_NOTE}
                </FText>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Entrance>
  );
}

const INCLUDED_ICONS: IconName[] = [
  "compass-outline",
  "barbell-outline",
  "trending-up-outline",
  "nutrition-outline",
];

function IncludedTile({
  node,
  icon,
  titleHeight,
  onTitle,
}: {
  node: Story["nodes"][number];
  icon: IconName;
  /** The row's tallest title, so the row's sentences start level. */
  titleHeight?: number;
  onTitle: (height: number) => void;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${node.title}. ${node.detail}`}
      style={{
        flex: 1,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: HAIRLINE,
        borderColor: c.cardBorder,
        backgroundColor: c.cardBg,
        padding: 16,
        paddingBottom: 17,
      }}
    >
      <Gradient
        stops={[
          { offset: 0, color: c.text, opacity: 0.05 },
          { offset: 1, color: c.text, opacity: 0.015 },
        ]}
      />
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.emberTint,
          borderWidth: HAIRLINE,
          borderColor: c.emberMuted,
        }}
      >
        <Ionicons name={icon} size={19} color={c.emberHot} />
      </View>
      <View style={{ marginTop: 14, minHeight: titleHeight }}>
        {/* Measured at its own height, never the row's. */}
        <View onLayout={(e) => onTitle(e.nativeEvent.layout.height)}>
          <FText variant="cardTitle" style={{ fontSize: 15.5, lineHeight: 20 }}>
            {node.title}
          </FText>
        </View>
      </View>
      <FText
        variant="label"
        tone="secondary"
        style={{ marginTop: 5, lineHeight: 18 }}
      >
        {node.detail}
      </FText>
    </View>
  );
}

/**
 * A row of tiles. However each title wraps, the row's sentences start on
 * one line: every title keeps the height of the row's tallest.
 */
function IncludedRow({
  nodes,
  icons,
}: {
  nodes: Story["nodes"];
  icons: IconName[];
}) {
  const [titles, setTitles] = useState(() => nodes.map(() => 0));
  const level = nodes.length > 1 ? Math.max(...titles) : undefined;
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {nodes.map((n, i) => (
        <IncludedTile
          key={n.title}
          node={n}
          icon={icons[i] ?? "checkmark-circle-outline"}
          titleHeight={level}
          onTitle={(h) =>
            setTitles((was) =>
              was[i] === h ? was : was.map((v, k) => (k === i ? h : v)),
            )
          }
        />
      ))}
    </View>
  );
}

/**
 * What the membership includes: four quiet tiles, two by two; one by one on
 * a narrow phone with large text, so nothing is squeezed.
 */
export function IncludedGrid({
  nodes,
  arrival,
}: {
  nodes: Story["nodes"];
  arrival: Arrival;
}) {
  const { width, fontScale } = useWindowDimensions();
  // Two by two while each tile keeps a comfortable measure of text; one by
  // one on a narrow phone with large text.
  const across = ((width - 52) / 2 - 32) / fontScale >= 104 ? 2 : 1;
  const rows: Story["nodes"][] = [];
  for (let i = 0; i < nodes.length; i += across)
    rows.push(nodes.slice(i, i + across));
  return (
    <Entrance delay={at(arrival, 420)} distance={10} style={{ marginTop: 52 }}>
      <View testID="premium-included">
        <FText
          variant="overline"
          tone="secondary"
          align="center"
          style={{ letterSpacing: 3.4 }}
        >
          Included in Forge Premium
        </FText>
        <View style={{ marginTop: 18, gap: 12 }}>
          {rows.map((row, r) => (
            // Keyed by the layout too: a new arrangement measures afresh.
            <IncludedRow
              key={`${across}-${r}`}
              nodes={row}
              icons={row.map(
                (_, i) =>
                  INCLUDED_ICONS[r * across + i] ?? "checkmark-circle-outline",
              )}
            />
          ))}
        </View>
      </View>
    </Entrance>
  );
}

// ---- Act two: the membership ----------------------------------------------------

/** The decision's heading and its one sentence. */
export function MembershipIntro() {
  return (
    <View style={{ alignItems: "center", marginTop: 60 }}>
      <View accessible accessibilityRole="header">
        <FText
          variant="heroTitle"
          align="center"
          numberOfLines={1}
          fit
          style={{ fontSize: 36, lineHeight: 36 }}
        >
          {MEMBERSHIP_INTRO.title}
        </FText>
      </View>
      <FText
        variant="body"
        tone="secondary"
        align="center"
        style={{ marginTop: 12, maxWidth: 305, fontSize: 15.5, lineHeight: 23 }}
      >
        {MEMBERSHIP_INTRO.support}
      </FText>
    </View>
  );
}

/**
 * The plan, selected: one brushed-steel card. The store's own price is the
 * most prominent price on the screen; the free week is a small mark, only
 * when Apple says this account may have it. Without an offer yet, a
 * placeholder of the same size.
 */
export function PlanCard({ offer }: { offer?: MembershipOffer }) {
  const c = useColors();
  const { width, fontScale } = useWindowDimensions();
  const price = width < 390 ? 32 : 36;
  // Beside the price on a compact phone or with large text, the renewal
  // reads as two short lines rather than wrapping mid-phrase.
  const stacked = width < 390 || fontScale >= 1.15;
  if (!offer)
    return (
      <View
        testID="paywall-price-loading"
        accessible
        accessibilityLabel="Loading the App Store's price"
        style={{
          marginTop: 34,
          minHeight: 118,
          borderRadius: 22,
          borderWidth: HAIRLINE,
          borderColor: c.cardBorder,
          backgroundColor: c.cardRaised,
          padding: 22,
          gap: 14,
          justifyContent: "center",
        }}
      >
        {[96, 150, 210].map((w) => (
          <View
            key={w}
            style={{
              width: w,
              height: 12,
              borderRadius: 6,
              backgroundColor: c.surfaceRaised,
            }}
          />
        ))}
      </View>
    );
  const free = offer.trialDays !== undefined;
  // The approved plan is monthly (plan.ts refuses any other).
  const monthly = offer.period === "month";
  return (
    <View testID="premium-plan" style={{ marginTop: free ? 46 : 34 }}>
      <View
        style={{
          borderRadius: 22,
          shadowColor: "#000000",
          shadowOpacity: 0.55,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 18 },
        }}
      >
        <View
          accessible
          accessibilityLabel={`Your plan, selected: ${offer.spoken}. ${offer.renewal}`}
          style={{ borderRadius: 22, overflow: "hidden" }}
        >
          <Gradient
            stops={[
              { offset: 0, color: STEEL.top },
              { offset: 0.45, color: STEEL.mid },
              { offset: 1, color: STEEL.low },
            ]}
          />
          <View style={{ padding: 22, paddingTop: 24, paddingBottom: 20 }}>
            <FText
              variant="overline"
              style={{ color: STEEL.ink2, letterSpacing: 2.4 }}
            >
              {offer.title}
            </FText>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 10,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <FText
                  variant="cardTitle"
                  weight="700"
                  style={{ color: STEEL.ink, fontSize: 20, lineHeight: 24 }}
                >
                  {monthly ? "Monthly" : `Every ${offer.period}`}
                </FText>
                <FText
                  variant="label"
                  style={{ color: STEEL.ink2, fontSize: 13.5, lineHeight: 18 }}
                >
                  {`Renews ${monthly ? "monthly" : `every ${offer.period}`}${stacked ? "\n" : " · "}${stacked ? "Cancel" : "cancel"} anytime`}
                </FText>
              </View>
              <View testID="paywall-price" style={{ alignItems: "flex-end" }}>
                <FText
                  variant="heroMetric"
                  numberOfLines={1}
                  style={{
                    color: STEEL.ink,
                    fontSize: price,
                    lineHeight: price + 2,
                    letterSpacing: -1,
                  }}
                >
                  {offer.price}
                </FText>
                <FText variant="label" style={{ color: STEEL.ink2 }}>
                  {`per ${offer.period}`}
                </FText>
              </View>
            </View>
          </View>
          <View
            style={{
              position: "absolute",
              top: 18,
              right: 18,
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: STEEL.ink,
            }}
          >
            <Ionicons name="checkmark" size={17} color={c.emberHot} />
          </View>
        </View>
      </View>
      {free && (
        <View
          style={{
            position: "absolute",
            top: -12,
            left: 20,
            height: 24,
            paddingHorizontal: 11,
            borderRadius: 12,
            justifyContent: "center",
            backgroundColor: STEEL.pill,
            borderWidth: HAIRLINE,
            borderColor: c.emberMuted,
          }}
        >
          <FText
            variant="overline"
            tone="accent"
            style={{ fontSize: 10, lineHeight: 12, letterSpacing: 1.9 }}
          >
            {`${offer.trialDays} days free`}
          </FText>
        </View>
      )}
    </View>
  );
}

/**
 * How the free week runs, when Apple says this account may have one: it
 * begins today, the first payment follows it, and it can be cancelled
 * anytime. Nothing promised beyond Apple's own terms.
 */
export function TrialTimeline({ offer }: { offer: MembershipOffer }) {
  const c = useColors();
  if (!offer.trialDays) return null;
  const days = offer.trialDays;
  const steps: { icon: IconName; title: string; text: string }[] = [
    {
      icon: "sparkles",
      title: "Today",
      text: days === 7 ? "Your free week begins" : `${days} free days begin`,
    },
    {
      icon: "calendar",
      title: `After ${days} days`,
      text: `${offer.price}, then monthly`,
    },
    {
      icon: "close-circle-outline",
      title: "Anytime",
      text: "Cancel in Settings",
    },
  ];
  return (
    <View
      testID="premium-timeline"
      accessible
      accessibilityLabel={steps.map((s) => `${s.title}: ${s.text}.`).join(" ")}
      style={{ flexDirection: "row", marginTop: 24 }}
    >
      <View
        style={{
          position: "absolute",
          left: "16.6%",
          right: "16.6%",
          top: 17,
          height: 1,
        }}
      >
        <Gradient
          from={{ x: 0, y: 0 }}
          to={{ x: 1, y: 0 }}
          stops={[
            { offset: 0, color: c.emberHot, opacity: 0.8 },
            { offset: 1, color: c.emberHot, opacity: 0.25 },
          ]}
        />
      </View>
      {steps.map((s, i) => (
        <View
          key={s.title}
          style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: i ? c.emberTint : c.emberHot,
              borderWidth: 1,
              borderColor: i ? c.emberMuted : c.emberHot,
            }}
          >
            <Ionicons
              name={s.icon}
              size={16}
              color={i ? c.emberHot : c.onEmber}
            />
          </View>
          <FText
            variant="label"
            weight="700"
            align="center"
            style={{ marginTop: 9 }}
          >
            {s.title}
          </FText>
          <FText
            variant="label"
            tone="secondary"
            align="center"
            style={{ fontSize: 12.5 }}
          >
            {s.text}
          </FText>
        </View>
      ))}
    </View>
  );
}

/** Renewal and cancellation in full: before anything is bought. */
export function PremiumTerms({
  offer,
  legalMissing,
}: {
  offer?: MembershipOffer;
  legalMissing: boolean;
}) {
  const c = useColors();
  if (!offer && !legalMissing) return null;
  return (
    <View
      style={{
        marginTop: 18,
        paddingTop: 20,
        borderTopWidth: HAIRLINE,
        borderTopColor: c.cardDivider,
        gap: 9,
      }}
    >
      {offer && (
        <View testID="paywall-terms" style={{ gap: 9 }}>
          {/* The subscription's name and length, as Apple asks, heading
              its terms. */}
          <FText
            variant="label"
            weight="600"
            style={{ fontSize: 13.5, lineHeight: 19 }}
          >
            {`${offer.title} · auto-renewing, every ${offer.period}`}
          </FText>
          {offer.terms.map((t) => (
            <FText
              key={t}
              variant="label"
              tone="secondary"
              style={{ fontSize: 13.5, lineHeight: 19.5 }}
            >
              {t}
            </FText>
          ))}
        </View>
      )}
      {legalMissing && (
        <View testID="paywall-legal-missing">
          <FText
            variant="label"
            tone="secondary"
            style={{ fontSize: 13.5, lineHeight: 19.5 }}
          >
            Terms of Use and Privacy Policy links are required before release
            (founder decision F15).
          </FText>
        </View>
      )}
    </View>
  );
}

// ---- The confirmation -----------------------------------------------------------

/**
 * The FORGE wordmark and BUILT THROUGH DISCIPLINE, exactly as Stage A sets
 * them. When the membership has just been confirmed, the letters cool from
 * molten to steel once, as at the end of the launch intro: the intro's own
 * molten letters, laid over the vector through the same shapes.
 */
export function ForgedLockup({
  width,
  cooling,
}: {
  width: number;
  cooling: boolean;
}) {
  const c = useColors();
  const reduced = !!useReducedMotion();
  const play = cooling && !reduced;
  const heat = useSharedValue(play ? 1 : 0);
  useEffect(() => {
    if (!play) return;
    heat.value = withDelay(
      260,
      withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [play, heat]);
  const molten = useAnimatedStyle(() => ({ opacity: heat.value }));
  const scale = width / WORDMARK_WIDTH;
  const height = WORDMARK_HEIGHT * scale;
  // Stage A's line: wide tracking (0.42 em), sized so all 24 letters span
  // the mark at most, never truncated.
  const tagline = Math.min(14, width / 26.5);
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width, height }}>
        <Wordmark width={width} />
        {play && (
          <Animated.View
            testID="premium-lockup-molten"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, molten]}
          >
            {wordmarkLetters.map((letter, i) => (
              <Image
                key={letter.key}
                source={splashAssets.molten[i]!}
                fadeDuration={0}
                resizeMode="stretch"
                style={{
                  position: "absolute",
                  left: (letter.x - LETTER_PAD) * scale,
                  top: -LETTER_PAD * scale,
                  width: (letter.width + LETTER_PAD * 2) * scale,
                  height: (WORDMARK_HEIGHT + LETTER_PAD * 2) * scale,
                }}
              />
            ))}
          </Animated.View>
        )}
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ marginTop: tagline * 1.6 }}
      >
        <FText
          variant="tagline"
          tone="secondary"
          numberOfLines={1}
          fit
          style={{
            fontSize: tagline,
            lineHeight: Math.round(tagline * 1.3),
            letterSpacing: tagline * 0.42,
            maxWidth: width,
          }}
        >
          {BRAND_TAGLINE}
        </FText>
      </View>
      <View
        style={{
          width: 72,
          height: 2,
          marginTop: 34,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <Gradient
          from={{ x: 0, y: 0 }}
          to={{ x: 1, y: 0 }}
          stops={[
            { offset: 0, color: c.emberHot, opacity: 0 },
            { offset: 0.5, color: c.emberHot, opacity: 1 },
            { offset: 1, color: c.emberHot, opacity: 0 },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * The membership, confirmed by Forge's server: the forged lockup, then what
 * it means in plain dates. A purchase or a restore just made is marked with
 * one success haptic; a membership already held is simply shown.
 */
export function MemberHero({
  access,
  via,
  formatDate,
}: {
  access: Granted;
  via: MemberVia;
  formatDate: (ms: number) => string;
}) {
  const { width } = useWindowDimensions();
  const fresh = via !== "held";
  useEffect(() => {
    if (!fresh) return;
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }, [fresh]);
  const lines = memberLines(access, formatDate(access.until), via);
  const lockup = Math.min(width - 112, 252);
  return (
    <View
      testID="paywall-member"
      style={{
        // Centred in the space above the action, so the moment sits where
        // the eye rests rather than pinned to the top.
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 34,
        paddingTop: 12,
        paddingBottom: 28,
      }}
    >
      <ForgedLockup width={lockup} cooling={fresh} />
      <Entrance delay={fresh ? 420 : 0} distance={12}>
        <View style={{ alignItems: "center", gap: 14 }}>
          <View accessible accessibilityRole="header">
            <FText
              variant="displayLabel"
              align="center"
              style={{ fontSize: 34, lineHeight: 36 }}
            >
              {lines.title}
            </FText>
          </View>
          <FText variant="subtitle" tone="secondary" align="center">
            {lines.detail}
          </FText>
        </View>
      </Entrance>
    </View>
  );
}

// ---- The action and its links -----------------------------------------------------

/** The price as the floating action states it, with the free week when it applies. */
export function PriceLine({ offer }: { offer?: MembershipOffer }) {
  const c = useColors();
  if (!offer)
    return (
      <View
        style={{ height: 26, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 180,
            height: 12,
            borderRadius: 6,
            backgroundColor: c.surfaceRaised,
          }}
        />
      </View>
    );
  return (
    <FText
      variant="body"
      tone="secondary"
      align="center"
      style={{ fontSize: 15, lineHeight: 26 }}
    >
      <FText variant="cardMetric" style={{ fontSize: 22, lineHeight: 26 }}>
        {offer.price}
      </FText>
      {` /${offer.period}${
        offer.trialDays ? ` after ${offer.trialDays} days free` : ""
      }`}
    </FText>
  );
}

/** A state that replaces the offer for now: what happened and what's next. */
export function DockStatus({
  icon,
  title,
  text,
  quiet = false,
  testID,
}: {
  icon: IconName;
  title: string;
  text: string;
  /** Technical reasons (a build without a store) read at the smaller size. */
  quiet?: boolean;
  testID?: string;
}) {
  const c = useColors();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${text}`}
      style={{ gap: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name={icon} size={20} color={c.emberHot} />
        <FText variant="cardTitle" weight="700" style={{ flex: 1 }}>
          {title}
        </FText>
      </View>
      <FText variant={quiet ? "label" : "body"} tone="secondary">
        {text}
      </FText>
    </View>
  );
}

/** A quiet note above the action (a restore that found nothing). */
export function DockNote({
  text,
  tone,
}: {
  text: string;
  tone: "error" | "info";
}) {
  if (tone === "error") return <StepIssue text={text} />;
  return (
    <View testID="paywall-notice" accessibilityLiveRegion="polite">
      <FText variant="label" tone="secondary" align="center">
        {text}
      </FText>
    </View>
  );
}

/**
 * The decision's one ember fill, with the forge's warmth beneath it. Pressed
 * it deepens and gives a little; while Apple or the server answers it says
 * what is happening, with a spinner, and can't be pressed again.
 */
export function DockCta({
  title,
  onPress,
  icon = "arrow-forward",
  busy = false,
  disabled = false,
  hint,
  testID,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  hint?: string;
  testID?: string;
}) {
  const c = useColors();
  const reduced = !!useReducedMotion();
  const off = busy || disabled;
  return (
    <View
      style={{
        borderRadius: 14,
        shadowColor: c.emberHot,
        shadowOpacity: off ? 0 : 0.32,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={hint}
        accessibilityState={{ disabled: off, busy }}
        disabled={off}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 58,
          borderRadius: 14,
          overflow: "hidden",
          paddingHorizontal: 20,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: disabled && !busy ? 0.45 : 1,
          transform: pressed && !reduced ? [{ scale: 0.985 }] : [],
        })}
      >
        {({ pressed }) => (
          <>
            <Gradient
              stops={[
                { offset: 0, color: pressed ? c.emberBottom : c.emberTop },
                { offset: 1, color: c.emberBottom },
              ]}
            />
            {busy && <ActivityIndicator size="small" color={c.onEmber} />}
            <FText
              variant="button"
              tone="onAccent"
              numberOfLines={2}
              align="center"
              style={{ flexShrink: 1 }}
            >
              {title}
            </FText>
            {!busy && <Ionicons name={icon} size={19} color={c.onEmber} />}
          </>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Restore, the way on without a membership and the like: quiet, never
 * hidden. `outline` draws it as a full-width button, for when it is the way
 * on (Forge Premium isn't available here).
 */
export function DockLink({
  title,
  label = title,
  onPress,
  emphasis = false,
  outline = false,
  disabled = false,
  hint,
  testID,
}: {
  title: string;
  /** The spoken name, when it says more than the visible title. */
  label?: string;
  onPress: () => void;
  emphasis?: boolean;
  outline?: boolean;
  disabled?: boolean;
  hint?: string;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: outline ? 52 : forge.heights.compact,
        paddingHorizontal: outline ? 16 : 4,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        ...(outline
          ? {
              alignSelf: "stretch",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.hairline,
              backgroundColor: pressed ? c.cardRaised : "transparent",
            }
          : {}),
      })}
    >
      <FText
        variant="label"
        weight={emphasis || outline ? "600" : "500"}
        tone={emphasis || outline ? "primary" : "secondary"}
        align="center"
        style={{ fontSize: outline ? 15.5 : 14, lineHeight: outline ? 20 : 18 }}
      >
        {title}
      </FText>
    </Pressable>
  );
}

/** Terms of Use or the Privacy Policy, opened in the browser. */
export function LegalLink({
  title,
  label,
  url,
}: {
  title: string;
  label: string;
  url: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(url)}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: forge.heights.compact,
        paddingHorizontal: 4,
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <FText
        variant="label"
        tone="secondary"
        style={{ fontSize: 14, lineHeight: 18 }}
      >
        {title}
      </FText>
    </Pressable>
  );
}

function Dot({ hidden = false }: { hidden?: boolean }) {
  const c = useColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      <FText variant="label" style={{ color: c.text3 }}>
        ·
      </FText>
    </View>
  );
}

/**
 * Rows of quiet links, a dot between each. Each group (the way on and
 * Restore; the legal links) stays together on one line; when the next group
 * wraps onto a line of its own, the dot before it isn't left at a line's end.
 */
export function LinkRow({ groups }: { groups: React.ReactNode[][] }) {
  const filled = groups.filter((g) => g.length > 0);
  const [lines, setLines] = useState<number[]>([]);
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        columnGap: 8,
      }}
    >
      {filled.map((items, g) => (
        <View
          key={g}
          onLayout={(e) => {
            const y = e.nativeEvent.layout.y;
            setLines((was) => {
              if (was[g] === y) return was;
              const next = [...was];
              next[g] = y;
              return next;
            });
          }}
          style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}
        >
          {items.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Dot />}
              {item}
            </React.Fragment>
          ))}
          {g < filled.length - 1 && (
            // Kept in place (so the line's width never changes), seen only
            // while the next group shares this line.
            <Dot
              hidden={
                lines[g] !== undefined &&
                lines[g + 1] !== undefined &&
                lines[g] !== lines[g + 1]
              }
            />
          )}
        </View>
      ))}
    </View>
  );
}
