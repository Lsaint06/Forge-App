import React, { useId } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Polygon,
  RadialGradient,
  Stop,
} from "react-native-svg";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeListRow,
  ForgeProgress,
  Gradient,
  HeroCard,
  SectionLabel,
  StatStrip,
} from "../../components/reforge";
import { useColors, type IconName } from "../../components/ui";
import { forge } from "../../theme";
import type { GoalView } from "../../domain/goals";
import { nextWhen, progressText, type PlanOverview } from "../train/model";
import { monogram } from "./model";

// The You tab's identity (REFORGE, Phases 7.5B–B.1): who the athlete is and
// what they are building, from the saved profile and the current plan only.

const idOf = (prefix: string, raw: string) =>
  `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;

// ---- Athlete identity ----------------------------------------------------------

/**
 * The monogram on a charcoal disc inside a forged ember ring (top-lit, like
 * the CTA gradient), with a faint halo for depth; the edit action is a
 * pencil badge cut out of the ring, as in the reference. The ring and
 * letters are decorative: the name beside them is the header.
 */
function Monogram({
  name,
  size,
  onEdit,
}: {
  name: string;
  size: number;
  onEdit: () => void;
}) {
  const c = useColors();
  const uid = useId();
  const ring = idOf("ring", uid);
  const disc = idOf("disc", uid);
  const r = size / 2;
  const stroke = 3;
  const badge = Math.round(size * 0.36);
  return (
    <View style={{ width: size, height: size }}>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        testID="you-monogram"
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg
          width={size}
          height={size}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          <Defs>
            <LinearGradient id={ring} x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={c.emberTop} />
              <Stop offset="1" stopColor={c.emberBottom} />
            </LinearGradient>
            <RadialGradient id={disc} cx="0.5" cy="0.32" r="0.75">
              <Stop offset="0" stopColor={c.cardRaised} />
              <Stop offset="1" stopColor={c.cardBg} />
            </RadialGradient>
          </Defs>
          {/* A faint halo just outside the ring. */}
          <Circle
            cx={r}
            cy={r}
            r={r - 1}
            stroke={c.emberHot}
            strokeOpacity={0.18}
            strokeWidth={2}
            fill="none"
          />
          <Circle cx={r} cy={r} r={r - 6} fill={`url(#${disc})`} />
          <Circle
            testID="you-monogram-ring"
            cx={r}
            cy={r}
            r={r - 6}
            stroke={`url(#${ring})`}
            strokeWidth={stroke}
            fill="none"
          />
        </Svg>
        <FText
          variant="heroTitle"
          style={{
            fontSize: Math.round(size * 0.34),
            lineHeight: Math.round(size * 0.42),
            letterSpacing: 1,
          }}
        >
          {monogram(name)}
        </FText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        onPress={onEdit}
        hitSlop={Math.max(4, Math.ceil((44 - badge) / 2))}
        style={({ pressed }) => ({
          position: "absolute",
          right: 0,
          bottom: 0,
          width: badge,
          height: badge,
          borderRadius: badge / 2,
          alignItems: "center",
          justifyContent: "center",
          // The screen colour as an outline cuts the badge out of the ring.
          borderWidth: 3,
          borderColor: c.bg,
          backgroundColor: pressed ? c.cardBg : c.cardRaised,
        })}
      >
        <Ionicons
          name="pencil"
          size={Math.round(badge * 0.42)}
          color={c.text}
        />
      </Pressable>
    </View>
  );
}

function IdentityLine({
  icon,
  text,
  onPress,
}: {
  icon: IconName;
  text: string;
  /** An invitation (e.g. "Set your training focus"): ember, with a chevron. */
  onPress?: () => void;
}) {
  const c = useColors();
  const row = (
    <>
      <Ionicons
        name={icon}
        size={18}
        color={onPress ? c.emberHot : c.text2}
        style={{ width: 22 }}
      />
      <FText
        variant="body"
        weight={onPress ? "700" : "500"}
        tone={onPress ? "accent" : "secondary"}
        style={{ flexShrink: 1 }}
      >
        {text}
      </FText>
      {onPress && (
        <Ionicons name="chevron-forward" size={15} color={c.emberHot} />
      )}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    minHeight: 24,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {row}
    </Pressable>
  ) : (
    <View style={style}>{row}</View>
  );
}

/**
 * Who the athlete is: the monogram, the name as the screen's header, their
 * experience, training focus and how long they have trained with Forge.
 * Missing details invite the lifter to add them; nothing is filled in.
 */
export function AthleteHeader({
  name,
  experience,
  focus,
  since,
  onEdit,
  onSetFocus,
}: {
  name: string;
  experience?: string;
  focus?: string;
  since?: string;
  onEdit: () => void;
  onSetFocus: () => void;
}) {
  const c = useColors();
  const { width, fontScale } = useWindowDimensions();
  // Side by side while the name keeps about 200 pt; stacked on small
  // screens or with large text.
  const stacked = width < 360 || fontScale > 1.4;
  const size = stacked ? 92 : 108;
  return (
    <View
      testID="you-identity"
      style={{
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "flex-start" : "center",
        gap: stacked ? 14 : 20,
        paddingTop: 12,
        paddingBottom: 8,
      }}
    >
      {/* A soft ember light behind the monogram: depth, not decoration. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -forge.spacing.margin,
          top: -24,
          width: size + 120,
          height: size + 96,
        }}
      >
        <Gradient
          kind="radial"
          center={{
            x: (forge.spacing.margin + size / 2) / (size + 120),
            y: 0.5,
          }}
          radius={{ x: 0.5, y: 0.5 }}
          stops={[
            { offset: 0, color: c.emberHot, opacity: 0.14 },
            { offset: 1, color: c.emberHot, opacity: 0 },
          ]}
        />
      </View>
      <Monogram name={name} size={size} onEdit={onEdit} />
      <View
        style={{
          flex: stacked ? undefined : 1,
          alignSelf: "stretch",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <View style={{ gap: 6 }}>
          <FText variant="screenTitle" header numberOfLines={2}>
            {name}
          </FText>
          {experience && (
            <FText variant="overline" tone="accent">
              {experience}
            </FText>
          )}
        </View>
        <View style={{ gap: 8 }}>
          {focus ? (
            <IdentityLine icon="barbell-outline" text={focus} />
          ) : (
            <IdentityLine
              icon="barbell-outline"
              text="Set your training focus"
              onPress={onSetFocus}
            />
          )}
          <IdentityLine
            icon="calendar-clear-outline"
            text={since ?? "No workouts yet"}
          />
        </View>
      </View>
    </View>
  );
}

// ---- Current plan ------------------------------------------------------------------

/** The reference's level emblem as the plan's: a forged hexagon. */
function Emblem({ icon, active }: { icon: IconName; active: boolean }) {
  const c = useColors();
  const uid = useId();
  const fill = idOf("hex", uid);
  const s = 60;
  const pts = [0, 60, 120, 180, 240, 300]
    .map((a) => {
      const rad = ((a - 90) * Math.PI) / 180;
      return `${s / 2 + (s / 2 - 2) * Math.cos(rad)},${s / 2 + (s / 2 - 2) * Math.sin(rad)}`;
    })
    .join(" ");
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: s,
        height: s,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={s}
        height={s}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <Defs>
          <RadialGradient id={fill} cx="0.5" cy="0.35" r="0.7">
            <Stop
              offset="0"
              stopColor={active ? c.emberTintStrong : c.cardRaised}
            />
            <Stop offset="1" stopColor={active ? c.emberTint : c.cardBg} />
          </RadialGradient>
        </Defs>
        <Polygon
          points={pts}
          fill={`url(#${fill})`}
          stroke={active ? c.emberHot : c.cardBorder}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
      <Ionicons name={icon} size={24} color={active ? c.emberHot : c.text2} />
    </View>
  );
}

const status = {
  complete: { program: "Program complete", path: "Cycle complete" },
  paused: { program: "Paused", path: "Paused" },
  unavailable: {
    program: "Not available in this app version",
    path: "Not available in this app version",
  },
} as const;

/**
 * The reference's Level region as the athlete's current plan (the founder
 * rejected levels and XP): what they are training on, where they stand and
 * what comes next, from the same overview as Train. A library program shows
 * its Forge Paths source; an older generated Path is named as a Path. The
 * whole card opens the plan.
 */
export function PlanCard({
  plan,
  today,
  programs,
  onOpen,
}: {
  plan?: PlanOverview;
  today: string;
  /** Curated Forge Paths programs, for the empty state. */
  programs: number;
  onOpen: () => void;
}) {
  const c = useColors();
  const top = (
    overline: string,
    title: string,
    emblem: React.ReactNode,
    tone: "accent" | "secondary",
  ) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <FText variant="overline" tone={tone}>
          {overline}
        </FText>
        <FText variant="heroTitle" header numberOfLines={2}>
          {title}
        </FText>
      </View>
      {emblem}
    </View>
  );
  if (!plan)
    return (
      <HeroCard minHeight={0} padding={18}>
        <View testID="you-plan" style={{ gap: 14 }}>
          {top(
            "Your training",
            "No active plan",
            <Emblem icon="compass-outline" active={false} />,
            "secondary",
          )}
          <FText variant="body" tone="secondary">
            {`Choose one of ${programs} curated Forge Paths programs and it becomes part of your profile here.`}
          </FText>
          <CtaButton
            compact
            title="Browse Forge Paths"
            icon="compass-outline"
            onPress={() => router.push("/forge-paths")}
          />
        </View>
      </HeroCard>
    );
  const kind = plan.kind === "program" ? "Your program" : "Your Path";
  const state =
    plan.state === "active" ? undefined : status[plan.state][plan.kind];
  const progress = progressText(plan);
  const fromLibrary = plan.kind === "program" && plan.state !== "unavailable";
  const meta = [fromLibrary ? "Forge Paths" : undefined, plan.level].filter(
    (m): m is string => !!m,
  );
  const share =
    plan.total !== undefined && plan.total > 0
      ? plan.done / plan.total
      : undefined;
  return (
    <HeroCard minHeight={0} padding={0}>
      <Pressable
        testID="you-plan"
        accessibilityRole="button"
        accessibilityLabel={`${kind}: ${plan.name}`}
        accessibilityHint={[state ?? plan.context, progress]
          .filter(Boolean)
          .join(", ")}
        onPress={onOpen}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ padding: 18, gap: 14 }}>
          {top(
            kind,
            plan.name,
            <Emblem
              icon={plan.kind === "program" ? "trail-sign" : "flag"}
              active={plan.state === "active"}
            />,
            "accent",
          )}
          {(state || plan.context || meta.length > 0) && (
            <View style={{ gap: 4, marginTop: -4 }}>
              {(state || plan.context) && (
                <FText
                  variant="cardTitle"
                  weight="700"
                  tone={state ? "secondary" : "primary"}
                >
                  {state ?? plan.context}
                </FText>
              )}
              {meta.length > 0 && (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {fromLibrary && (
                    <Ionicons
                      name="compass-outline"
                      size={14}
                      color={c.text2}
                    />
                  )}
                  <FText
                    variant="label"
                    tone="secondary"
                    style={{ flexShrink: 1 }}
                  >
                    {meta.join(" · ")}
                  </FText>
                </View>
              )}
            </View>
          )}
          <View style={{ gap: 8 }}>
            {share !== undefined && (
              <ForgeProgress
                value={share}
                label={`${plan.name}: ${progress}`}
                height={8}
              />
            )}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <FText variant="label" weight="600">
                {progress}
              </FText>
              {share !== undefined && (
                <FText variant="label" tone="secondary">
                  {`${Math.round(share * 100)}%`}
                </FText>
              )}
            </View>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 56,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderTopWidth: forge.border.card,
            borderTopColor: c.cardDivider,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            {plan.next ? (
              <>
                <FText variant="overline" tone="secondary">
                  Up next
                </FText>
                <FText variant="body" weight="700" numberOfLines={1}>
                  {`${plan.next.name} · ${nextWhen(plan.next, today)}`}
                </FText>
              </>
            ) : (
              <FText variant="body" tone="secondary">
                Open your plan
              </FText>
            )}
          </View>
          <FText
            variant="label"
            weight="700"
            tone="accent"
            style={{ fontSize: 15 }}
          >
            View plan
          </FText>
          <Ionicons name="chevron-forward" size={16} color={c.emberHot} />
        </View>
      </Pressable>
    </HeroCard>
  );
}

// ---- Training profile prompt --------------------------------------------------------

/** The existing nudge for program recommendations, as a REFORGE row. */
export function ProfilePrompt({
  missing,
  onPress,
}: {
  missing: string;
  onPress: () => void;
}) {
  return (
    <ForgeCard padding={0} gap={0} testID="you-profile-prompt">
      <ForgeListRow
        icon="alert-circle-outline"
        title="Complete your training profile"
        description={`Add your ${missing} for program recommendations`}
        onPress={onPress}
      />
    </ForgeCard>
  );
}

/**
 * A gentle nudge to synchronize (Phase 7.8C), in the same quiet card as the
 * profile prompt: the row opens Account & privacy, "Not now" quiets it for
 * a few days. Nothing is synchronized from here.
 */
export function SyncReminder({
  text,
  onOpen,
  onDismiss,
}: {
  text: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  return (
    <ForgeCard padding={0} gap={0} testID="you-sync-reminder">
      <ForgeListRow
        icon="cloud-upload-outline"
        title="Sync your latest training"
        description={text}
        onPress={onOpen}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: forge.spacing.cardPadding,
          borderTopWidth: forge.border.card,
          borderTopColor: c.cardDivider,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          accessibilityHint="Hides this reminder for a few days"
          onPress={onDismiss}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <FText variant="label" weight="600" tone="secondary">
            Not now
          </FText>
        </Pressable>
      </View>
    </ForgeCard>
  );
}

// ---- Name preview (Edit profile) ------------------------------------------------------

/** The monogram and name as they will appear, while the name is typed. */
export function IdentityPreview({ name }: { name: string }) {
  const c = useColors();
  const shown = name.trim().replace(/\s+/g, " ") || "Athlete";
  return (
    <View
      testID="you-identity-preview"
      accessible
      accessibilityLabel={`Preview: ${shown}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: forge.radii.card,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardBg,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          borderWidth: 2,
          borderColor: c.emberHot,
          backgroundColor: c.cardRaised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FText variant="heroTitle" style={{ fontSize: 18, lineHeight: 22 }}>
          {monogram(shown)}
        </FText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <FText variant="overline" tone="secondary">
          Preview
        </FText>
        <FText variant="cardTitle" weight="700" numberOfLines={2}>
          {shown}
        </FText>
      </View>
    </View>
  );
}

// ---- Settings groups (cohesion until 7.5C–D) -------------------------------------------

/**
 * The You tab's existing rows grouped on REFORGE surfaces: a section label,
 * one hairline card and inset dividers. The rows themselves are unchanged
 * until their own stage (7.5C–D).
 */
export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: forge.spacing.tight, marginTop: 6 }}>
      <SectionLabel title={title} />
      <ForgeCard padding={0} gap={0}>
        {rows.map((row, i) => (
          <View
            key={i}
            style={
              i
                ? {
                    borderTopWidth: forge.border.card,
                    borderTopColor: c.cardDivider,
                    marginLeft: 16,
                  }
                : undefined
            }
          >
            <View style={i ? { marginLeft: -16 } : undefined}>{row}</View>
          </View>
        ))}
      </ForgeCard>
      {footer && (
        <FText
          variant="label"
          tone="secondary"
          style={{ paddingHorizontal: 2 }}
        >
          {footer}
        </FText>
      )}
    </View>
  );
}

// ---- Performance strip (7.5C) ----------------------------------------------------------

/**
 * Three lifetime facts in one strip: completed workouts, the shared day
 * streak and weeks consistent. The streak keeps the same size as its
 * neighbours: the brand pill already shows it, so it is not repeated
 * larger. Training history is the card's one action.
 */
export function PerformanceStrip({
  workouts,
  streak,
  weeks,
  onHistory,
}: {
  workouts: number;
  streak: number;
  weeks: number;
  onHistory: () => void;
}) {
  const c = useColors();
  const stats: [IconName, number, string][] = [
    [
      "barbell-outline",
      workouts,
      workouts === 1 ? "Workout completed" : "Workouts completed",
    ],
    ["flame-outline", streak, "Day streak"],
    [
      "calendar-outline",
      weeks,
      weeks === 1 ? "Week consistent" : "Weeks consistent",
    ],
  ];
  return (
    <ForgeCard padding={0} gap={0} testID="you-performance">
      <View style={{ padding: forge.spacing.cardPadding }}>
        {workouts > 0 ? (
          <StatStrip minColumn={84}>
            {stats.map(([icon, value, label]) => (
              <View
                key={label}
                accessible
                accessibilityLabel={`${label}: ${value.toLocaleString()}`}
                style={{ gap: 8 }}
              >
                <Ionicons name={icon} size={18} color={c.emberHot} />
                <View style={{ gap: 2 }}>
                  <FText variant="statMetric" numberOfLines={1} fit>
                    {value.toLocaleString()}
                  </FText>
                  <FText variant="label" tone="secondary" numberOfLines={2}>
                    {label}
                  </FText>
                </View>
              </View>
            ))}
          </StatStrip>
        ) : (
          <View
            accessible
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Ionicons name="barbell-outline" size={22} color={c.text2} />
            <View style={{ flex: 1, gap: 2 }}>
              <FText variant="body" weight="700">
                Your record starts with your first workout
              </FText>
              <FText variant="label" tone="secondary">
                Completed workouts, your day streak and consistent weeks appear
                here.
              </FText>
            </View>
          </View>
        )}
      </View>
      <ForgeListRow
        icon="time-outline"
        title="Training history"
        description={
          workouts > 0
            ? "Review, edit or repeat"
            : "Finished workouts appear here"
        }
        divider
        onPress={onHistory}
      />
    </ForgeCard>
  );
}

// ---- Primary goal (7.5C) ---------------------------------------------------------------

/**
 * Home's next target (`nextTarget`, the same goal and wording), compact:
 * name, where it stands, the recorded value against the target and a bar
 * only when the goal engine gives a real ratio. It opens Goals.
 */
export function PrimaryGoal({
  goal: v,
  active,
  onOpen,
}: {
  goal?: GoalView;
  /** Active goals, to word the empty state honestly. */
  active: number;
  onOpen: () => void;
}) {
  const c = useColors();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.4;
  const overline = (
    <FText variant="overline" tone="accent">
      Primary goal
    </FText>
  );
  if (!v)
    return (
      <ForgeCard padding={0} gap={0} testID="you-goal">
        <View
          style={{
            paddingHorizontal: forge.spacing.cardPadding,
            paddingTop: 14,
          }}
        >
          {overline}
        </View>
        <ForgeListRow
          icon="flag-outline"
          title={active ? "View goals" : "Set a goal"}
          description={
            active
              ? "Your next target appears here once a goal has a recorded value."
              : "Choose something you can measure and track it here."
          }
          onPress={onOpen}
        />
      </ForgeCard>
    );
  const percent = v.ratio !== undefined ? Math.round(v.ratio * 100) : undefined;
  const current = v.current?.split(" · ")[0];
  return (
    <ForgeCard padding={0} gap={0}>
      <Pressable
        testID="you-goal"
        accessibilityRole="button"
        accessibilityLabel={`Primary goal: ${v.name}`}
        accessibilityHint={`${v.spoken}. Opens goals`}
        onPress={onOpen}
        style={({ pressed }) => ({
          padding: forge.spacing.cardPadding,
          gap: 12,
          backgroundColor: pressed ? c.cardRaised : "transparent",
          borderRadius: forge.radii.card,
        })}
      >
        {overline}
        <View
          testID="you-goal-row"
          style={{
            flexDirection: stacked ? "column" : "row",
            alignItems: "flex-start",
            gap: stacked ? 8 : 12,
          }}
        >
          <View style={{ flex: stacked ? undefined : 1, gap: 2 }}>
            <FText variant="cardTitle" weight="700" numberOfLines={2}>
              {v.name}
            </FText>
            <FText variant="label" tone="secondary" numberOfLines={2}>
              {v.state}
            </FText>
          </View>
          <View
            style={{
              maxWidth: stacked ? undefined : "42%",
              alignItems: stacked ? "flex-start" : "flex-end",
              gap: 2,
            }}
          >
            {current && (
              <FText
                variant="statMetric"
                numberOfLines={2}
                fit
                align={stacked ? "left" : "right"}
              >
                {current}
              </FText>
            )}
            <FText
              variant="label"
              tone="secondary"
              numberOfLines={2}
              align={stacked ? "left" : "right"}
            >
              {v.target}
            </FText>
          </View>
        </View>
        {percent !== undefined && (
          <ForgeProgress
            value={v.ratio!}
            label={`${v.name}: ${percent}% complete`}
          />
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {percent !== undefined ? (
            <FText variant="label" weight="600">
              {`${percent}% complete`}
            </FText>
          ) : (
            <View />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <FText variant="label" weight="700" tone="accent">
              View goals
            </FText>
            <Ionicons name="chevron-forward" size={14} color={c.emberHot} />
          </View>
        </View>
      </Pressable>
    </ForgeCard>
  );
}

// ---- My stats (7.5C) -------------------------------------------------------------------

type Stat = { value: string; unit?: string; source: string };

/**
 * Personal information, not analytics: the latest bodyweight (with where it
 * comes from) and the saved height, in the lifter's units, with the way to
 * Measurements. Body fat is not shown (founder direction, 7.5B.1), and no
 * change is computed here: Progress owns bodyweight trends.
 */
export function MyStats({
  bodyweight,
  height,
  onMeasurements,
}: {
  bodyweight?: Stat;
  height?: Stat;
  onMeasurements: () => void;
}) {
  const c = useColors();
  const cell = (
    icon: IconName,
    label: string,
    stat: Stat | undefined,
    empty: { value: string; source: string },
  ) => (
    <View
      key={label}
      accessible
      accessibilityLabel={`${label}: ${
        stat ? [stat.value, stat.unit].filter(Boolean).join(" ") : empty.value
      }. ${stat?.source ?? empty.source}`}
      style={{ gap: 8 }}
    >
      <Ionicons name={icon} size={18} color={c.emberHot} />
      <View style={{ gap: 2 }}>
        {stat ? (
          <View
            style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}
          >
            <FText variant="statMetric" numberOfLines={1} fit>
              {stat.value}
            </FText>
            {stat.unit && (
              <FText variant="label" tone="secondary">
                {stat.unit}
              </FText>
            )}
          </View>
        ) : (
          <FText variant="cardTitle" weight="700" tone="secondary">
            {empty.value}
          </FText>
        )}
        <FText variant="label" weight="600">
          {label}
        </FText>
        <FText variant="label" tone="secondary">
          {stat?.source ?? empty.source}
        </FText>
      </View>
    </View>
  );
  return (
    <View style={{ gap: forge.spacing.tight, marginTop: 6 }}>
      <SectionLabel
        title="My stats"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open measurements"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            onPress={onMeasurements}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              minHeight: 24,
            }}
          >
            <FText variant="label" weight="700" tone="accent">
              Measurements
            </FText>
            <Ionicons name="chevron-forward" size={14} color={c.emberHot} />
          </Pressable>
        }
      />
      <ForgeCard testID="you-stats">
        <StatStrip minColumn={120}>
          {cell("scale-outline", "Bodyweight", bodyweight, {
            value: "Not logged",
            source: "Log a weigh-in in Measurements",
          })}
          {cell("resize-outline", "Height", height, {
            value: "Not set",
            source: "Add it in Edit profile",
          })}
        </StatStrip>
      </ForgeCard>
    </View>
  );
}
