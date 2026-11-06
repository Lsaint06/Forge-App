import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TextButton, useColors, type IconName } from "../../components/ui";
import {
  CardHeader,
  FText,
  ForgeCard,
  ForgeProgress,
  HeroCard,
  OutlineButton,
  artwork,
} from "../../components/reforge";
import { gramsText, type MealGroup, type Totals } from "../../domain/nutrition";
import { forge } from "../../theme";
import {
  mealSummary,
  type Intake,
  type LoggingStreak,
  type QuickFood,
} from "./model";

// Nutrition dashboard sections (Phase 7.3B), after the approved Nutrition
// reference. Presentation only: every value is passed in from the screen.

// ---- Hero: the day's energy and macros -----------------------------------------

/**
 * The flagship card: what was eaten, how it compares with the lifter's own
 * target, and the three macros. Full width (no decorative tagline), so the
 * numbers never compete for room.
 */
export function NutritionHero({
  overline,
  intake: k,
  totals,
  targets,
  personalized,
  stacked,
}: {
  overline: string;
  intake: Intake;
  totals: Totals;
  targets: { protein: number; carbs: number; fat: number };
  personalized: boolean;
  /** One macro per row (large text). */
  stacked: boolean;
}) {
  const c = useColors();
  const macros = [
    ["Protein", totals.protein, targets.protein, "accent"],
    ["Carbs", totals.carbs, targets.carbs, "neutral"],
    ["Fat", totals.fat, targets.fat, "neutral"],
  ] as const;
  return (
    <HeroCard artwork={artwork.nutritionHero} minHeight={0}>
      <View style={{ gap: 14 }}>
        <FText variant="overline" tone="accent" header>
          {overline}
        </FText>
        <View
          accessible
          accessibilityLabel={k.spoken}
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            flexWrap: "wrap",
            columnGap: 10,
          }}
        >
          <FText variant="heroMetric" numberOfLines={1}>
            {k.kcal.toLocaleString()}
          </FText>
          <FText variant="cardTitle" tone="secondary">
            {k.showGoal ? `of ${k.goal.toLocaleString()} kcal` : "kcal eaten"}
          </FText>
        </View>
        {k.showGoal && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ flex: 1 }}>
              <ForgeProgress
                value={k.kcal / k.goal}
                label="Calories"
                height={8}
              />
            </View>
            <FText variant="cardTitle" weight="700" tone="accent">
              {`${k.percent}%`}
            </FText>
          </View>
        )}
        <View
          style={{
            flexDirection: stacked ? "column" : "row",
            gap: stacked ? 14 : 0,
            paddingTop: 14,
            borderTopWidth: forge.border.card,
            borderTopColor: c.cardDivider,
          }}
        >
          {macros.map(([label, value, target, tone], i) => {
            const against = personalized && target > 0;
            return (
              <View
                key={label}
                accessible
                accessibilityLabel={
                  against
                    ? `${label} ${gramsText(value)} of ${gramsText(target)}`
                    : `${label} ${gramsText(value)}`
                }
                style={
                  stacked
                    ? { gap: 4 }
                    : {
                        flex: 1,
                        gap: 4,
                        paddingLeft: i ? 12 : 0,
                        paddingRight: i < 2 ? 12 : 0,
                        borderLeftWidth: i ? forge.border.card : 0,
                        borderLeftColor: c.cardDivider,
                      }
                }
              >
                <FText variant="statMetric" numberOfLines={1} fit>
                  {gramsText(value)}
                </FText>
                <FText variant="label" tone="secondary" numberOfLines={1}>
                  {label}
                </FText>
                {against && (
                  <>
                    <View style={{ marginTop: 2 }}>
                      <ForgeProgress
                        value={value / target}
                        label={label}
                        tone={tone}
                        height={4}
                      />
                    </View>
                    <FText
                      variant="label"
                      tone="secondary"
                      numberOfLines={1}
                      fit
                      style={{ fontSize: 11, lineHeight: 14 }}
                    >
                      {`of ${gramsText(target)}`}
                    </FText>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </HeroCard>
  );
}

// ---- Calorie goal ----------------------------------------------------------------

/**
 * What is left of (or over) the lifter's own daily target: the one number
 * the hero does not show. The whole card opens the target editor.
 */
export function CalorieGoalCard({
  intake: k,
  onEdit,
  style,
}: {
  intake: Intake;
  onEdit: () => void;
  style?: object;
}) {
  const c = useColors();
  if (!k.showGoal)
    return (
      <ForgeCard style={style}>
        <CardHeader title="Calorie goal" />
        <FText variant="body" tone="secondary">
          No daily targets yet.
        </FText>
        <View style={{ marginTop: "auto" }}>
          <OutlineButton
            title="Set targets"
            accessibilityLabel="Set your daily targets"
            icon="flag-outline"
            compact
            onPress={onEdit}
          />
        </View>
      </ForgeCard>
    );
  return (
    <ForgeCard
      style={style}
      onPress={onEdit}
      accessibilityLabel={`Calorie goal: ${k.left.value} ${k.left.unit}. Edit your daily targets`}
    >
      <CardHeader title="Calorie goal" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Ionicons name="locate-outline" size={28} color={c.emberHot} />
        <View style={{ flex: 1 }}>
          <FText variant="statMetric" numberOfLines={1} fit>
            {k.left.value}
          </FText>
          <FText variant="label" tone="secondary">
            {k.left.unit}
          </FText>
        </View>
      </View>
      <View
        style={{
          marginTop: "auto",
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        <FText variant="label" weight="600" tone="accent">
          Edit targets
        </FText>
        <Ionicons name="chevron-forward" size={14} color={c.emberHot} />
      </View>
    </ForgeCard>
  );
}

// ---- Nutrition streak ---------------------------------------------------------------

/** Days logged in a row and this week's days, from the entries alone. */
export function StreakCard({
  streak,
  style,
}: {
  streak: LoggingStreak;
  style?: object;
}) {
  const c = useColors();
  return (
    <ForgeCard style={style}>
      <CardHeader title="Nutrition streak" />
      <View
        accessible
        accessibilityLabel={`Nutrition streak: ${streak.spoken}`}
        style={{ gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="flame" size={28} color={c.emberHot} />
          <View style={{ flex: 1 }}>
            <FText variant="statMetric" numberOfLines={1} fit>
              {`${streak.days} ${streak.days === 1 ? "day" : "days"}`}
            </FText>
            <FText variant="label" tone="secondary">
              Logged in a row
            </FText>
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {streak.week.map((d) => (
            <View
              key={d.date}
              testID={`streak-${d.state}`}
              style={{ alignItems: "center", gap: 4 }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: d.state === "logged" ? 0 : 1.5,
                  borderColor:
                    d.state === "open"
                      ? c.emberHot
                      : d.state === "none"
                        ? c.text3
                        : c.cardBorder,
                  backgroundColor:
                    d.state === "logged" ? c.emberHot : "transparent",
                }}
              />
              <FText
                variant="label"
                tone={d.today ? "accent" : "secondary"}
                weight={d.today ? "700" : undefined}
                style={{ fontSize: 11, lineHeight: 14 }}
              >
                {d.letter}
              </FText>
            </View>
          ))}
        </View>
      </View>
    </ForgeCard>
  );
}

// ---- Two cards in a row ---------------------------------------------------------------

/** Two cards side by side when both fit, otherwise stacked. */
export function CardPair({
  side,
  left,
  right,
  ratio = 1,
}: {
  side: boolean;
  left: (style: object) => React.ReactNode;
  right?: (style: object) => React.ReactNode;
  /** Left width relative to the right one when side by side. */
  ratio?: number;
}) {
  if (!right) return <>{left({})}</>;
  if (!side)
    return (
      <>
        {left({})}
        {right({})}
      </>
    );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        gap: forge.spacing.cardGap,
      }}
    >
      {left({ flex: ratio })}
      {right({ flex: 1 })}
    </View>
  );
}

// ---- Meals ------------------------------------------------------------------------------

const ICON = 36;
// Entries and Add to meal line up with the meal's name.
const INDENT = forge.spacing.group + ICON + forge.spacing.group;

function IconTile({ icon }: { icon: IconName }) {
  const c = useColors();
  return (
    <View
      style={{
        width: ICON,
        height: ICON,
        borderRadius: forge.radii.tile,
        backgroundColor: c.emberTint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={18} color={c.emberHot} />
    </View>
  );
}

/**
 * One meal as its own panel: icon, name, foods, energy and macros. A meal
 * with food expands in place to its entries (each keeps tap-to-edit and its
 * options) and, set apart below them, Add to meal. An empty default meal
 * offers Add directly.
 */
export function MealRow({
  group,
  expanded,
  onToggle,
  onAdd,
  children,
}: {
  group: MealGroup;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const m = mealSummary(group);
  const filled = m.count > 0;
  const body = (
    <>
      <IconTile icon={m.icon} />
      <View style={{ flex: 1, gap: 2 }}>
        <FText variant="cardTitle" weight="700" numberOfLines={1}>
          {group.label}
        </FText>
        <FText variant="label" tone="secondary" numberOfLines={1}>
          {m.foods}
        </FText>
      </View>
      {filled && (
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <FText variant="cardTitle" weight="700" numberOfLines={1}>
            {m.kcal}
          </FText>
          <FText variant="label" tone="secondary" numberOfLines={1}>
            {m.macros}
          </FText>
        </View>
      )}
    </>
  );
  const row = {
    minHeight: 60,
    paddingHorizontal: forge.spacing.group,
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: forge.spacing.group,
  };
  return (
    <View
      style={{
        borderRadius: forge.radii.tile,
        borderWidth: forge.border.card,
        borderColor: expanded ? c.emberMuted : c.cardBorder,
        backgroundColor: c.cardRaised,
        overflow: "hidden",
      }}
    >
      {filled ? (
        <Pressable
          testID="meal-row"
          accessibilityRole="button"
          accessibilityLabel={m.spoken}
          accessibilityHint={expanded ? "Hides the foods" : "Shows the foods"}
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={({ pressed }) => ({
            ...row,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {body}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={expanded ? c.emberHot : c.text2}
          />
        </Pressable>
      ) : (
        <View testID="meal-row" style={row}>
          <View
            accessible
            accessibilityLabel={m.spoken}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: forge.spacing.group,
            }}
          >
            {body}
          </View>
          {onAdd && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add to ${group.label}`}
              onPress={onAdd}
              hitSlop={4}
              style={({ pressed }) => ({
                width: forge.heights.compact,
                height: forge.heights.compact,
                marginRight: -8,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons
                name="add-circle-outline"
                size={26}
                color={c.emberHot}
              />
            </Pressable>
          )}
        </View>
      )}
      {expanded && filled && (
        <View
          style={{
            borderTopWidth: forge.border.card,
            borderTopColor: c.cardDivider,
          }}
        >
          {children}
          {onAdd && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add to ${group.label}`}
              onPress={onAdd}
              style={({ pressed }) => ({
                minHeight: forge.heights.compact,
                paddingLeft: INDENT,
                paddingRight: forge.spacing.group,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderTopWidth: forge.border.card,
                borderTopColor: c.cardDivider,
                backgroundColor: pressed ? c.emberTint : c.cardBg,
              })}
            >
              <Ionicons name="add-circle" size={18} color={c.emberHot} />
              <FText variant="label" weight="700" tone="accent">
                {`Add to ${group.label}`}
              </FText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * A logged food inside an expanded meal (or the "Dated after today" list):
 * name and serving, energy aligned right, tap to edit, options last.
 */
export function EntryRow({
  title,
  subtitle,
  value,
  label,
  divider,
  indent = INDENT,
  onPress,
  trailing,
}: {
  title: string;
  subtitle: string;
  value: string;
  label: string;
  divider: boolean;
  indent?: number;
  onPress: () => void;
  trailing: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 52,
          paddingLeft: indent,
          paddingVertical: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="body" weight="600" numberOfLines={2}>
            {title}
          </FText>
          <FText variant="label" tone="secondary" numberOfLines={1}>
            {subtitle}
          </FText>
        </View>
        <FText variant="label" weight="700" numberOfLines={1}>
          {value}
        </FText>
      </Pressable>
      <View style={{ paddingRight: 2 }}>{trailing}</View>
    </View>
  );
}

// ---- Quick add ---------------------------------------------------------------------------

/**
 * The lifter's own recent and saved foods, one tap each, at the stated
 * portion, into the stated meal and day. Its own full-width card after the
 * meals: two columns, or one on narrow screens and at large text.
 * The header opens Add food.
 */
export function QuickAddCard({
  foods,
  target,
  destination,
  columns,
  onAdd,
  onOpen,
  style,
}: {
  foods: QuickFood[];
  /** Spoken destination: "Lunch" or "Lunch · Yesterday". */
  target: string;
  /** Shown destination: "Adds to Lunch · Today". */
  destination: string;
  columns: number;
  onAdd: (food: QuickFood) => void;
  onOpen: () => void;
  style?: object;
}) {
  const c = useColors();
  const basis = `${100 / columns}%` as const;
  return (
    <ForgeCard style={style}>
      <CardHeader
        title="Quick add"
        trailing="All foods"
        onPress={onOpen}
        divider={false}
        accessibilityLabel="Quick add. Open Add food"
      />
      {foods.length ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="return-down-forward" size={14} color={c.text2} />
            <FText variant="label" tone="secondary" style={{ flexShrink: 1 }}>
              {destination}
            </FText>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", margin: -4 }}>
            {foods.map((q) => (
              <View key={q.food.key} style={{ width: basis, padding: 4 }}>
                <Pressable
                  testID="quick-add"
                  accessibilityRole="button"
                  accessibilityLabel={`Quick add ${q.food.name}, ${q.portion}, ${q.kcal}, to ${target}`}
                  onPress={() => onAdd(q)}
                  style={({ pressed }) => ({
                    minHeight: 60,
                    paddingVertical: 10,
                    paddingLeft: 12,
                    paddingRight: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: forge.radii.tile,
                    borderWidth: forge.border.card,
                    borderColor: pressed ? c.emberMuted : c.cardBorder,
                    backgroundColor: pressed ? c.emberTint : c.cardRaised,
                  })}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <FText variant="label" weight="700" numberOfLines={2}>
                      {q.food.name}
                    </FText>
                    <FText variant="label" tone="secondary" numberOfLines={2}>
                      {`${q.portion} · ${q.kcal}`}
                    </FText>
                  </View>
                  <Ionicons name="add-circle" size={24} color={c.emberHot} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : (
        <FText variant="body" tone="secondary">
          Your recent and saved foods show here for one-tap adding.
        </FText>
      )}
    </ForgeCard>
  );
}

// ---- Hydration ------------------------------------------------------------------------

/**
 * The day's water (Phase 7.3C): a compact, full-width card right under the
 * calorie hero, sized to its content (never stretched to match another
 * card). One row: drop, label, amount drunk and, against the lifter's own
 * goal, the percentage; then a slim bar with what is left. Without a goal:
 * the amount and a small "Set goal" chip, no empty bar. The whole card opens
 * the hydration sheet; it never logs by itself (decision H4).
 */
export function HydrationCard({
  view,
  onOpen,
}: {
  view: {
    total: string;
    goal?: string;
    ratio?: number;
    percent?: number;
    left?: string;
    spoken: string;
  };
  onOpen: () => void;
}) {
  const c = useColors();
  const hasGoal = view.ratio !== undefined;
  return (
    <ForgeCard
      onPress={onOpen}
      testID="hydration-card"
      gap={10}
      accessibilityLabel={`Hydration: ${view.spoken}. Open hydration`}
      accessibilityHint={
        hasGoal ? undefined : "No daily goal yet. Opens hydration to set one"
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: forge.radii.tile,
            backgroundColor: c.hydrationTint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="water" size={20} color={c.hydration} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="overline" tone="secondary">
            Hydration
          </FText>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              flexWrap: "wrap",
              columnGap: 6,
            }}
          >
            <FText variant="statMetric" numberOfLines={1}>
              {view.total}
            </FText>
            <FText variant="label" tone="secondary" numberOfLines={1}>
              {view.goal ? `of ${view.goal}` : "logged"}
            </FText>
          </View>
        </View>
        {hasGoal ? (
          <FText
            variant="cardTitle"
            weight="700"
            style={{ color: c.hydration }}
          >
            {`${view.percent}%`}
          </FText>
        ) : (
          <View
            style={{
              minHeight: 28,
              paddingHorizontal: 10,
              justifyContent: "center",
              borderRadius: forge.radii.pill,
              borderWidth: forge.border.active,
              borderColor: c.hydration,
              backgroundColor: c.hydrationTint,
            }}
          >
            <FText variant="label" weight="700" style={{ color: c.hydration }}>
              Set goal
            </FText>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={c.text2} />
      </View>
      {hasGoal && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ForgeProgress
              value={view.ratio!}
              label="Water"
              tone="hydration"
              height={6}
            />
          </View>
          <FText variant="label" tone="secondary" numberOfLines={1}>
            {view.left}
          </FText>
        </View>
      )}
    </ForgeCard>
  );
}
// ---- Undo ----------------------------------------------------------------------------------

/** The last change, with Undo; pinned above Add food so it is always seen. */
export function UndoToast({
  text,
  onUndo,
}: {
  text: string;
  onUndo: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.tight,
        paddingLeft: forge.spacing.group,
        borderRadius: forge.radii.tile,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
      }}
    >
      <Ionicons name="checkmark-circle" size={18} color={c.emberHot} />
      <FText variant="label" style={{ flex: 1 }}>
        {text}
      </FText>
      <TextButton title="Undo" onPress={onUndo} />
    </View>
  );
}
