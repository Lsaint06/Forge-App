import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "react-native-reanimated";
import { useColors } from "../../components/ui";
import { CtaButton, FText, ForgeTopGlow } from "../../components/reforge";
import {
  DISCOVER_PAGES,
  type DiscoverPage,
} from "../../domain/onboarding/discover";
import { forge } from "../../theme";
import { Landing, NO_MEASURES, type LandingMeasures } from "./Landing";
import { Entrance } from "./motion";
import { PageProgress } from "./parts";
import { Showcase } from "./showcase";

// Before the account (Phase 9.2), on a fresh phone: the brand, then what
// Forge does. Stage A (Landing.tsx) continues from the launch intro's last
// frame and says what Forge stands for. Stage B is four pages of real Forge
// screens, swiped or stepped through, and can be skipped at any point.
// Every way out leads to the account screen: there is no way into Forge
// without an account.
/** Discover's words: every page's block is as tall as the tallest one. */
const TEXT_PAD = { top: forge.spacing.group, bottom: forge.spacing.tight };

function PageView({
  page,
  index,
  scroll,
  width,
  still,
  textMin,
  onText,
}: {
  page: DiscoverPage;
  index: number;
  scroll: Animated.Value;
  width: number;
  still: boolean;
  /** The tallest page's words: every headline starts at the same height. */
  textMin: number;
  onText: (height: number) => void;
}) {
  const [stage, setStage] = useState({ w: 0, h: 0 });
  return (
    <ScrollView
      bounces={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View
        onLayout={(e) =>
          setStage({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
        style={{ flex: 1, minHeight: 180 }}
      >
        {stage.h > 0 && (
          // Laid over the stage, never sizing it: the words below keep their
          // room and the cards scale to whatever is left.
          <Entrance distance={20} style={StyleSheet.absoluteFill}>
            <Showcase
              page={page.key}
              index={index}
              scroll={scroll}
              width={stage.w || width}
              height={stage.h}
              still={still}
            />
          </Entrance>
        )}
      </View>
      <View
        style={{
          minHeight: textMin,
          paddingHorizontal: forge.spacing.margin + 8,
          paddingTop: TEXT_PAD.top,
          paddingBottom: TEXT_PAD.bottom,
        }}
      >
        <View
          onLayout={(e) => onText(e.nativeEvent.layout.height)}
          style={{ gap: 10 }}
        >
          <FText variant="overline" tone="accent">
            {page.overline}
          </FText>
          <FText variant="heroTitle" header>
            {page.title}
          </FText>
          <FText variant="subtitle" tone="secondary">
            {page.body}
          </FText>
        </View>
      </View>
    </ScrollView>
  );
}

function Discover({
  banner,
  onBack,
  onAccount,
}: {
  banner?: React.ReactNode;
  onBack: () => void;
  onAccount: () => void;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const reduced = !!useReducedMotion();
  const [page, setPage] = useState(0);
  const [texts, setTexts] = useState<number[]>([]);
  const pager = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [scroll] = useState(() => new Animated.Value(0));
  const last = page === DISCOVER_PAGES.length - 1;
  // minHeight includes the padding, so it is added in.
  const textMin = Math.max(
    0,
    ...texts.map((h) => h + TEXT_PAD.top + TEXT_PAD.bottom),
  );
  const show = (next: number) => {
    setPage(next);
    pager.current?.scrollTo?.({ x: next * width, animated: !reduced });
  };
  const settled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next >= 0 && next < DISCOVER_PAGES.length) setPage(next);
  };
  const back = () => (page > 0 ? show(page - 1) : onBack());
  // Android's back button: the previous page, then the brand screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => sub.remove();
  });
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <ForgeTopGlow />
      {banner && (
        <View style={{ paddingHorizontal: forge.spacing.margin }}>
          {banner}
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 6,
          minHeight: forge.heights.compact,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          hitSlop={4}
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
        <PageProgress page={page} count={DISCOVER_PAGES.length} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip to your account"
          onPress={onAccount}
          hitSlop={4}
          style={({ pressed }) => ({
            minWidth: forge.heights.compact,
            minHeight: forge.heights.compact,
            paddingHorizontal: 12,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <FText variant="cardTitle" tone="secondary">
            Skip
          </FText>
        </Pressable>
      </View>
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scroll } } }],
          { useNativeDriver: true },
        )}
        onMomentumScrollEnd={settled}
        style={{ flex: 1 }}
        testID="intro-pages"
      >
        {DISCOVER_PAGES.map((p, i) => (
          <View
            key={p.key}
            testID={`intro-page-${p.key}`}
            accessibilityElementsHidden={i !== page}
            importantForAccessibility={
              i === page ? "auto" : "no-hide-descendants"
            }
            style={{ width }}
          >
            <PageView
              page={p}
              index={i}
              scroll={scroll}
              width={width}
              still={reduced}
              textMin={textMin}
              onText={(h) =>
                setTexts((all) => {
                  if (all[i] === h) return all;
                  const next = [...all];
                  next[i] = h;
                  return next;
                })
              }
            />
          </View>
        ))}
      </Animated.ScrollView>
      <View
        style={{
          paddingHorizontal: forge.spacing.margin,
          paddingTop: forge.spacing.tight,
          paddingBottom: forge.spacing.group,
        }}
      >
        <CtaButton
          title={last ? "Create your account" : "Next"}
          icon={last ? "person-add-outline" : "arrow-forward"}
          onPress={() => (last ? onAccount() : show(page + 1))}
        />
      </View>
    </SafeAreaView>
  );
}

export function Intro({
  banner,
  onAccount,
}: {
  /** The development preview's banner. */
  banner?: React.ReactNode;
  /** Leaves the intro for the account screen (sign in or create one). */
  onAccount: () => void;
}) {
  const [discovering, setDiscovering] = useState(false);
  const [settled, setSettled] = useState(false);
  const [measures, setMeasures] = useState<LandingMeasures>(NO_MEASURES);
  const onSettled = React.useCallback(() => setSettled(true), []);
  const onMeasure = React.useCallback(
    (part: keyof LandingMeasures, height: number) =>
      setMeasures((m) => (m[part] === height ? m : { ...m, [part]: height })),
    [],
  );
  return discovering ? (
    <Discover
      banner={banner}
      onBack={() => setDiscovering(false)}
      onAccount={onAccount}
    />
  ) : (
    <Landing
      banner={banner}
      measures={measures}
      onMeasure={onMeasure}
      settled={settled}
      onSettled={onSettled}
      onStart={() => setDiscovering(true)}
      onAccount={onAccount}
    />
  );
}
