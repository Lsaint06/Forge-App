import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { NUTRITION_TODAY } from "../../navigation";
import { Ionicons } from "@expo/vector-icons";
import { useColors, type IconName } from "../../components/ui";
import {
  ListRow,
  OverflowMenu,
  type MenuAction,
} from "../../components/system";
import {
  CardHeader,
  CtaButton,
  FText,
  ForgeCard,
  ForgeProgress,
  ForgeRing,
  HeroCard,
  InfoChip,
  OutlineButton,
  SquareIconButton,
  StatStrip,
  artwork,
} from "../../components/reforge";
import { forge } from "../../theme";
import {
  isAnswer,
  scaleOf,
  sleepText,
  spokenSummary,
  type Checkin,
  type ScaleKey,
} from "../../domain/checkins";
import type { GoalView } from "../../domain/goals";
import { gramsText, type Totals } from "../../domain/nutrition";
import { compactNumber } from "../../domain/progress/format";

const chevron = (color: string) => (
  <Ionicons name="chevron-forward" size={16} color={color} />
);
const journal = (kind: string) =>
  router.push({ pathname: "/journal", params: { kind } });

// ---- Greeting and date ---------------------------------------------------------

export function TitleBlock({
  greeting,
  subtitle = "Consistent effort compounds. Keep building.",
  date,
  spokenDate,
  plan,
}: {
  greeting: string;
  /** Home's line by default; other tabs pass their own (Nutrition, 7.3B). */
  subtitle?: string;
  date: string;
  spokenDate: string;
  plan?: { text: string; label: string; open: () => void };
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: forge.spacing.group,
        // 20 pt below the brand header, as in the reference.
        marginTop: 8,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <FText variant="greeting" header>
          {greeting}
        </FText>
        <FText variant="subtitle" tone="secondary">
          {subtitle}
        </FText>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: "44%", paddingTop: 6 }}>
        <View accessible accessibilityLabel={spokenDate}>
          <FText
            variant="label"
            weight="600"
            align="right"
            style={{ textTransform: "uppercase", letterSpacing: 1 }}
          >
            {date}
          </FText>
        </View>
        {plan && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={plan.label}
            accessibilityHint={plan.text}
            onPress={plan.open}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: forge.heights.compact,
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <FText variant="label" tone="secondary" align="right">
              {plan.text}
            </FText>
            {chevron(c.text2)}
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---- Recovery strip ------------------------------------------------------------

function StripItem({
  icon,
  accent,
  value,
  label,
}: {
  icon: IconName;
  accent?: boolean;
  value: string;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Ionicons name={icon} size={20} color={accent ? c.emberHot : c.text} />
      <FText variant="cardTitle" weight="700" numberOfLines={1} fit>
        {value}
      </FText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
        <FText
          variant="label"
          tone="secondary"
          numberOfLines={1}
          fit
          style={{ flexShrink: 1 }}
        >
          {label}
        </FText>
        <Ionicons name="chevron-forward" size={12} color={c.text2} />
      </View>
    </View>
  );
}

const word = (key: ScaleKey, v: unknown) =>
  isAnswer(v) ? scaleOf(key).words[v - 1]! : "—";

/**
 * Today's recovery check-in as recorded (self-rated readiness, sleep,
 * soreness, energy). No score is computed; without a check-in it invites one.
 * Each column stacks icon, value and label: real answers are words
 * ("Energised", "Somewhat"), which need the column's full width.
 */
export function RecoveryStrip({ checkin }: { checkin?: Checkin }) {
  const c = useColors();
  return (
    <ForgeCard
      onPress={() => journal("recovery")}
      accessibilityLabel="Recovery check-in"
      accessibilityHint={
        checkin ? `Logged today. ${spokenSummary(checkin)}` : "Not logged today"
      }
    >
      {checkin ? (
        <StatStrip minColumn={64} gutter={10}>
          <StripItem
            icon="speedometer-outline"
            accent
            value={word("readiness", checkin.data.readiness)}
            label="Ready"
          />
          <StripItem
            icon="bed-outline"
            value={
              sleepText(checkin.data.sleep)?.replace(/ (h|m)\b/g, "$1") ?? "—"
            }
            label="Sleep"
          />
          <StripItem
            icon="body-outline"
            value={word("soreness", checkin.data.soreness)}
            label="Soreness"
          />
          <StripItem
            icon="flash"
            accent
            value={word("energy", checkin.data.energy)}
            label="Energy"
          />
        </StatStrip>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="pulse-outline" size={24} color={c.emberHot} />
          <View style={{ flex: 1 }}>
            <FText variant="cardTitle" weight="700">
              How are you today?
            </FText>
            <FText variant="label" tone="secondary">
              Not logged today
            </FText>
          </View>
          <FText variant="cardTitle" tone="accent">
            Check in
          </FText>
          {chevron(c.emberHot)}
        </View>
      )}
    </ForgeCard>
  );
}

// ---- Today's session -------------------------------------------------------------

/** The hero's bordered "…" square (the reference), as tall as the CTA. */
function MenuSquare({
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
      size={forge.heights.cta}
    />
  );
}

export type HeroContent = {
  overline: string;
  accent: boolean;
  title: string;
  detail?: string;
  when?: string;
  action: string;
  actionLabel?: string;
  actionIcon?: IconName;
};

export function SessionHero({
  hero: h,
  facts,
  roomy,
  menu,
  onStart,
  choosePath,
}: {
  hero: HeroContent;
  facts: { exercises?: number; level?: string };
  /** Room for the decorative tagline beside the content. */
  roomy: boolean;
  menu: MenuAction[];
  onStart: () => void;
  choosePath?: () => void;
}) {
  const c = useColors();
  const column = roomy ? "70%" : "100%";
  return (
    <HeroCard
      artwork={artwork.homeSession}
      tagline={roomy ? ["Stronger", "Disciplined", "Further"] : undefined}
      minHeight={roomy ? 220 : 0}
    >
      <View style={{ width: column, gap: 10 }}>
        <FText variant="overline" tone={h.accent ? "accent" : "secondary"}>
          {h.overline}
        </FText>
        <FText variant="heroTitle" header numberOfLines={3}>
          {h.title}
        </FText>
        {h.detail && (
          <FText variant="body" tone="secondary" numberOfLines={2}>
            {h.detail}
          </FText>
        )}
        {h.when && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="calendar-outline" size={16} color={c.text2} />
            <FText variant="label" tone="secondary" style={{ flexShrink: 1 }}>
              {h.when}
            </FText>
          </View>
        )}
        {(facts.exercises !== undefined || facts.level) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {facts.exercises !== undefined && (
              <InfoChip
                icon="barbell-outline"
                label={`${facts.exercises} ${facts.exercises === 1 ? "exercise" : "exercises"}`}
              />
            )}
            {facts.level && (
              <InfoChip icon="stats-chart-outline" label={facts.level} />
            )}
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
          }}
        >
          <View style={{ flex: 1 }}>
            <CtaButton
              title={h.action}
              icon={h.actionIcon}
              accessibilityLabel={h.actionLabel}
              onPress={onStart}
            />
          </View>
          {menu.length > 0 && (
            <OverflowMenu
              label="Session options"
              title={h.title}
              actions={menu}
              renderTrigger={MenuSquare}
            />
          )}
        </View>
        {choosePath && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a Forge Path"
            onPress={choosePath}
            style={({ pressed }) => ({
              minHeight: forge.heights.compact,
              justifyContent: "center",
              alignSelf: "flex-start",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <FText variant="cardTitle" tone="accent">
              Choose a Forge Path
            </FText>
          </Pressable>
        )}
      </View>
    </HeroCard>
  );
}

// ---- Progress snapshot -----------------------------------------------------------

function SnapStat({
  icon,
  accent,
  value,
  unit,
  label,
  sub,
  children,
}: {
  icon: IconName;
  accent?: boolean;
  value: string;
  unit?: string;
  label: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 3 }}>
      <Ionicons name={icon} size={20} color={accent ? c.emberHot : c.text} />
      {/* Value and unit are one line of text, so they shrink together
          rather than truncating in a narrow column. */}
      <FText
        variant="statMetric"
        numberOfLines={1}
        fit
        style={{ marginTop: 2 }}
      >
        {value}
        {unit && (
          <Text
            style={{
              fontSize: 12,
              fontWeight: "500",
              letterSpacing: 0,
              color: c.text2,
            }}
          >
            {` ${unit}`}
          </Text>
        )}
      </FText>
      <FText variant="label" weight="600" numberOfLines={1} fit>
        {label}
      </FText>
      {sub && (
        <FText
          variant="label"
          tone="secondary"
          numberOfLines={2}
          fit
          style={{ fontSize: 12, lineHeight: 15 }}
        >
          {sub}
        </FText>
      )}
      {children}
    </View>
  );
}

export function ProgressSnapshot({
  weight,
  volume,
  units,
  streak,
  week,
  days,
  style,
}: {
  weight?: { value: number; unit: string; when: string };
  volume: number;
  units: string;
  streak: number;
  week: string;
  days: boolean[];
  style?: object;
}) {
  const c = useColors();
  const trained = days.filter(Boolean).length;
  // Large weekly totals use the compact form Progress already shows
  // ("12.5k"), so one long number never dominates the card.
  const volumeText = compactNumber(volume);
  return (
    <ForgeCard
      onPress={() => router.navigate("/(tabs)/progress")}
      accessibilityLabel="Progress snapshot"
      accessibilityHint={[
        weight
          ? `Bodyweight ${weight.value} ${weight.unit}`
          : "No bodyweight logged",
        `Volume this week ${Math.round(volume).toLocaleString()} ${units}`,
        `Day streak ${streak}`,
        week,
      ].join(". ")}
      style={style}
    >
      <CardHeader title="Progress snapshot" trailing={chevron(c.text2)} />
      <StatStrip minColumn={52} gutter={8} weights={[1.05, 1.05, 0.9]}>
        <SnapStat
          icon="scale-outline"
          value={weight ? weight.value.toLocaleString() : "—"}
          unit={weight?.unit}
          label="Bodyweight"
          sub={weight?.when ?? "Not logged"}
        />
        <SnapStat
          icon="stats-chart"
          value={volumeText}
          unit={units}
          label="Volume"
          sub="This week"
        />
        <SnapStat
          icon="flame"
          accent
          value={String(streak)}
          label="Day streak"
          sub={week}
        >
          {/* Seven days spread across the column (never wider than it). */}
          <View
            accessible
            accessibilityLabel={`This week: ${trained} of 7 days trained`}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              maxWidth: 60,
              marginTop: 4,
            }}
          >
            {days.map((done, i) => (
              <View
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: done ? c.emberHot : c.cardBorder,
                }}
              />
            ))}
          </View>
        </SnapStat>
      </StatStrip>
    </ForgeCard>
  );
}

// ---- Nutrition today -------------------------------------------------------------

export function NutritionToday({
  totals,
  targets,
  personalized,
  ring,
  row,
  style,
}: {
  totals: Totals;
  targets: { calories: number; protein: number; carbs: number; fat: number };
  personalized: boolean;
  ring: number;
  /** Ring beside the macros (full-width card) rather than above them. */
  row: boolean;
  style?: object;
}) {
  const c = useColors();
  const kcal = Math.round(totals.calories);
  const goal = personalized && targets.calories > 0 ? targets.calories : 0;
  const macros = [
    ["Protein", totals.protein, targets.protein, "accent"],
    ["Carbs", totals.carbs, targets.carbs, "neutral"],
    ["Fat", totals.fat, targets.fat, "neutral"],
  ] as const;
  const spoken = [
    goal
      ? `${kcal.toLocaleString()} of ${goal.toLocaleString()} calories`
      : `${kcal.toLocaleString()} calories eaten`,
    ...macros.map(([l, v]) => `${l} ${gramsText(v)}`),
  ].join(", ");
  return (
    <ForgeCard
      onPress={() => router.navigate(NUTRITION_TODAY)}
      accessibilityLabel="Nutrition today"
      accessibilityHint={spoken}
      style={style}
    >
      <CardHeader title="Nutrition today" trailing={chevron(c.text2)} />
      <View
        style={{
          flexDirection: row ? "row" : "column",
          alignItems: "center",
          gap: forge.spacing.group,
        }}
      >
        <ForgeRing
          value={goal ? totals.calories / goal : 0}
          label="Calories"
          size={ring}
          stroke={Math.max(7, Math.round(ring / 12))}
        >
          <View style={{ alignItems: "center", paddingHorizontal: 8 }}>
            <FText variant="statMetric" numberOfLines={1} fit>
              {kcal.toLocaleString()}
            </FText>
            <FText variant="label" tone="secondary" numberOfLines={1} fit>
              {goal ? `of ${goal.toLocaleString()}` : "kcal eaten"}
            </FText>
            {goal > 0 && (
              <FText variant="label" tone="secondary">
                kcal
              </FText>
            )}
          </View>
        </ForgeRing>
        <View
          style={{
            flexDirection: "row",
            alignSelf: "stretch",
            flex: row ? 1 : undefined,
            gap: 10,
          }}
        >
          {macros.map(([label, value, target, tone]) => (
            <View key={label} style={{ flex: 1, gap: 3 }}>
              {/* Beside the snapshot the card is narrow: smaller macro text,
                  allowed to shrink slightly, never truncated. */}
              <FText
                variant={row ? "cardTitle" : "label"}
                weight="700"
                numberOfLines={1}
                fit
              >
                {gramsText(value)}
              </FText>
              <FText
                variant="label"
                tone="secondary"
                numberOfLines={1}
                fit
                style={row ? undefined : { fontSize: 11, lineHeight: 14 }}
              >
                {label}
              </FText>
              {personalized && target > 0 && (
                <ForgeProgress
                  value={value / target}
                  label={label}
                  tone={tone}
                  height={4}
                />
              )}
            </View>
          ))}
        </View>
      </View>
    </ForgeCard>
  );
}

// ---- Next target -------------------------------------------------------------------

export function NextTargetCard({ goal: v }: { goal?: GoalView }) {
  const c = useColors();
  const open = () => journal("goal");
  // Fixed columns so the progress bar lines up exactly under the goal text.
  const ICON = 32;
  const VALUES = "36%";
  return (
    <HeroCard
      artwork={artwork.homeTarget}
      minHeight={0}
      padding={forge.spacing.cardPadding}
    >
      <CardHeader
        title="Next target"
        onPress={open}
        accessibilityLabel="Next target, open goals"
      />
      {v ? (
        <View accessible accessibilityLabel={v.spoken} style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: forge.spacing.group,
            }}
          >
            <View style={{ width: ICON, alignItems: "center" }}>
              <Ionicons name="trophy" size={26} color={c.emberHot} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <FText variant="cardTitle" weight="700" numberOfLines={2}>
                {v.name}
              </FText>
              <FText variant="label" tone="secondary" numberOfLines={2}>
                {v.state}
              </FText>
            </View>
            <View style={{ width: VALUES, alignItems: "flex-end", gap: 2 }}>
              {v.current && (
                <FText variant="statMetric" numberOfLines={2} fit align="right">
                  {v.current.split(" · ")[0]}
                </FText>
              )}
              <FText
                variant="label"
                tone="secondary"
                numberOfLines={2}
                align="right"
              >
                {v.target}
              </FText>
            </View>
          </View>
          {v.ratio !== undefined && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: forge.spacing.group,
              }}
            >
              <View style={{ width: ICON }} />
              <View style={{ flex: 1 }}>
                <ForgeProgress value={v.ratio} label={v.name} />
              </View>
              <View style={{ width: VALUES }} />
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: forge.spacing.group,
            }}
          >
            <View style={{ width: 32, alignItems: "center" }}>
              <Ionicons name="trophy-outline" size={26} color={c.text2} />
            </View>
            <View style={{ flex: 1 }}>
              <FText variant="cardTitle" weight="700">
                No active target
              </FText>
              <FText variant="label" tone="secondary">
                Set a goal you can measure and track it here.
              </FText>
            </View>
          </View>
          <OutlineButton
            title="Set a goal"
            icon="flag-outline"
            onPress={open}
          />
        </View>
      )}
    </HeroCard>
  );
}

// ---- Last session --------------------------------------------------------------------

export function LastSessionCard({
  last,
}: {
  last?: { name: string; title: string; line: string; open: () => void };
}) {
  return (
    <ForgeCard padding={0} gap={0}>
      <View style={{ padding: forge.spacing.cardPadding, paddingBottom: 6 }}>
        <CardHeader title="Last session" divider={false} />
      </View>
      {last ? (
        <ListRow
          title={last.title}
          subtitle={last.line}
          accessibilityLabel={`Review ${last.name}`}
          onPress={last.open}
        />
      ) : (
        <ListRow
          title="No workouts yet"
          subtitle="Finished workouts appear here."
        />
      )}
      <ListRow
        icon="time-outline"
        title="Workout history"
        onPress={() => router.push("/history")}
      />
    </ForgeCard>
  );
}
