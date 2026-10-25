import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { IconButton, dark, useColors } from "../../components/ui";
import {
  BadgePill,
  BRAND_TAGLINE,
  FText,
  ForgeCard,
  ForgeProgress,
  Gradient,
  OutlineButton,
  SquareIconButton,
  Wordmark,
  type ForgeTone,
} from "../../components/reforge";
import { elapsedSeconds } from "../../domain/metrics";
import { timer } from "../../domain/workout-display";
import type { Workout } from "../../domain/types";
import { forge } from "../../theme";
import { startedAt } from "./model";

// Active workout (Phase 7.2A): the frame around the exercise cards, after the
// approved Train reference. Logging itself stays in WorkoutExerciseCard and
// SetGrid.

/** The current time, once a second. Only timers use it, never the list. */
export function useNow() {
  const [now, set] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => set(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
}

/**
 * The ember glow behind the top of the logger, where the reference shows its
 * plate photograph (no approved artwork: graphical fallback, as on Home).
 */
export function WorkoutBackdrop() {
  const c = useColors();
  const isDark = c.bg === dark.bg;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }}
    >
      <Gradient
        kind="radial"
        center={{ x: 0.9, y: 0.12 }}
        radius={{ x: 0.75, y: 0.62 }}
        stops={[
          { offset: 0, color: c.emberHot, opacity: isDark ? 0.17 : 0.08 },
          { offset: 1, color: c.emberHot, opacity: 0 },
        ]}
      />
    </View>
  );
}

/** Back, the FORGE wordmark and the screen's controls (`children`). */
export function WorkoutTopBar({
  onBack,
  children,
}: {
  onBack: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.tight,
        minHeight: 56,
        paddingLeft: 4,
        paddingRight: forge.spacing.margin,
        paddingVertical: 4,
      }}
    >
      <IconButton
        icon="chevron-back"
        label="Back to training"
        onPress={onBack}
      />
      <View style={{ flex: 1, gap: 5 }}>
        <Wordmark width={92} />
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <FText variant="tagline" tone="secondary" numberOfLines={1}>
            {BRAND_TAGLINE}
          </FText>
        </View>
      </View>
      {children}
    </View>
  );
}

/** The workout menu's trigger: the reference's bordered square. */
export function MenuSquare({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <SquareIconButton
      icon="ellipsis-horizontal"
      label={label}
      onPress={onPress}
    />
  );
}

/** Overline, condensed title, plan week and phase, and the status line. */
export function WorkoutHero({
  overline,
  overlineTone,
  title,
  plan,
  status,
  statusTone,
}: {
  overline: string;
  overlineTone: ForgeTone;
  title: string;
  plan?: { week: number; phase?: string };
  status: string;
  statusTone: ForgeTone;
}) {
  return (
    <View style={{ gap: 6, paddingTop: 2, paddingBottom: 4 }}>
      <FText variant="overline" tone={overlineTone} numberOfLines={1}>
        {overline}
      </FText>
      <FText variant="heroTitle" header numberOfLines={2}>
        {title}
      </FText>
      {plan && (
        <FText variant="subtitle" tone="secondary" numberOfLines={1}>
          {plan.phase
            ? `Week ${plan.week} · ${plan.phase}`
            : `Week ${plan.week}`}
        </FText>
      )}
      {/* Wrap rather than cut the sets, volume or duration at large text
          sizes. */}
      <FText variant="label" tone={statusTone} numberOfLines={2}>
        {status}
      </FText>
    </View>
  );
}

function SessionTimer({ workout: w }: { workout: Workout }) {
  const now = useNow();
  const seconds = elapsedSeconds(
    w.startedAt,
    w.finishedAt ?? now,
    w.pausedMs,
    w.pausedAt,
  );
  return (
    <View
      accessible
      accessibilityLabel={`Elapsed time ${Math.floor(seconds / 60)} minutes`}
      style={{ gap: 2 }}
    >
      <FText variant="overline" tone="secondary" numberOfLines={1}>
        Session timer
      </FText>
      <FText
        variant="cardMetric"
        numberOfLines={1}
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {timer(seconds)}
      </FText>
    </View>
  );
}

/**
 * Session timer card: the live clock (its own 1 s render, isolated from the
 * list), when the session started and the prominent Pause. While paused the
 * badge says so; Resume sits in the dock where it is always reachable.
 */
export function SessionCard({
  workout: w,
  onPause,
}: {
  workout: Workout;
  onPause: () => void;
}) {
  const c = useColors();
  const paused = w.status === "paused";
  const started = startedAt(w.startedAt);
  return (
    <ForgeCard padding={14}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: forge.spacing.group,
          rowGap: forge.spacing.group,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.group,
            flexGrow: 1,
          }}
        >
          <Ionicons
            name="stopwatch-outline"
            size={30}
            color={paused ? c.text2 : c.emberHot}
          />
          <SessionTimer workout={w} />
          <View
            style={{
              width: 1,
              alignSelf: "stretch",
              marginVertical: 2,
              backgroundColor: c.cardDivider,
            }}
          />
          <View
            accessible
            accessibilityLabel={`Started at ${started}`}
            style={{ gap: 2, flexShrink: 1 }}
          >
            <FText variant="overline" tone="secondary" numberOfLines={1}>
              Started
            </FText>
            <FText variant="body" numberOfLines={1}>
              {started}
            </FText>
          </View>
        </View>
        {paused ? (
          <BadgePill
            icon="pause"
            value="Paused"
            accessibilityLabel="Workout paused"
          />
        ) : (
          <OutlineButton
            title="Pause"
            accessibilityLabel="Pause workout"
            icon="pause"
            tone="ember"
            onPress={onPause}
          />
        )}
      </View>
    </ForgeCard>
  );
}

/** Workout progress: finished exercises, as in the reference. */
export function ProgressCard({
  done,
  total,
  ratio,
}: {
  done: number;
  total: number;
  ratio: number;
}) {
  const c = useColors();
  return (
    <ForgeCard padding={14}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: forge.spacing.group,
          rowGap: forge.spacing.tight,
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: 150, gap: 10 }}>
          <FText variant="overline" tone="secondary" numberOfLines={1}>
            Workout progress
          </FText>
          <ForgeProgress
            value={ratio}
            height={8}
            label={`Workout progress, ${done} of ${total} ${total === 1 ? "exercise" : "exercises"} complete`}
          />
        </View>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <FText variant="cardTitle" weight="700">
              {done}
            </FText>
            <FText variant="label" tone="secondary">
              {` / ${total} ${total === 1 ? "exercise" : "exercises"}`}
            </FText>
          </View>
          <View
            style={{
              minHeight: forge.heights.chip,
              minWidth: 52,
              paddingHorizontal: 10,
              borderRadius: forge.radii.pill,
              borderWidth: forge.border.active,
              borderColor: c.cardBorder,
              backgroundColor: c.cardRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FText variant="label" weight="700">
              {`${Math.round(ratio * 100)}%`}
            </FText>
          </View>
        </View>
      </View>
    </ForgeCard>
  );
}

/** The rest ring: ember arc of the rest remaining over a neutral track. */
export function RestRing({
  ratio,
  size = 44,
  stroke = 4,
  children,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const value = Math.max(0, Math.min(1, ratio));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.cardBorder}
          strokeWidth={stroke}
          fill="none"
        />
        {value > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={c.emberHot}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * value} ${circumference}`}
            rotation={-90}
            origin={`${size / 2},${size / 2}`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
