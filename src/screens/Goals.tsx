import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../platform/alert";
import { useColors } from "../components/ui";
import { InfoButton, OverflowMenu } from "../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeLineChart,
  ForgeListRow,
  ForgeSubScreen,
  OutlineButton,
  SectionLabel,
} from "../components/reforge";
import { GoalCard } from "../components/goals/GoalCard";
import { GoalSheet, type GoalTarget } from "../components/goals/GoalSheet";
import { useRepo, useApp, mutate } from "../state";
import {
  UNDO_MS,
  cancelPending,
  commitPending,
  markPending,
  readPending,
  remainingMs,
} from "../data/pending-deletes";
import { goBack } from "../navigation";
import { localDate, type Journal } from "../domain/types";
import { goalSources } from "../data/goal-sources";
import {
  achievedData,
  canAchieve,
  evaluate,
  isV2,
  num,
  repsOf,
  typeOf,
  type Goal,
  type GoalView,
  type Sources,
} from "../domain/goals";
import { isBodyweightName } from "../domain/validation";
import {
  GAP_DAYS,
  dayNumber,
  newestFirst,
  toDisplay,
} from "../domain/measurements";
import { loadIn } from "../domain/workout-display";
import { dayLabel } from "../domain/training-display";
import { forge } from "../theme";

// Goals (Phase 7B WP4D; REFORGE since Phase 7.5F): what the lifter is
// working toward, measured only from recorded data with the definitions in
// the WP4D audit (section 16A). Records keep their journal shape; legacy
// goals keep their meaning; an untouched edit writes nothing; confirmed
// achievements never change. Phase 7.5F changed the presentation only.

const ABOUT = [
  "Targets (bodyweight, a lift, training volume) are reached once. When your records meet the target, you can mark it as achieved; its date and value are then kept even if records change later.",
  "Habits (workouts per week, session length, daily calories) are measured period by period: this week, the last 4 weeks, or each day you log food.",
  "A lift counts the heaviest weight you actually lifted on a completed working set, never an estimated 1RM. Calorie goals use the food you log; days with nothing logged aren't counted.",
  "Progress bars appear only where there is a real starting point. Nothing is estimated or predicted.",
];

type Pending =
  | { kind: "delete"; id: string }
  | { kind: "achieve"; id: string; data: Journal["data"] };

export default function Goals() {
  const r = useRepo();
  const revision = useApp((s) => s.revision);
  const today = localDate();
  const p = r.profile();
  const [sheet, setSheet] = useState<GoalTarget>();
  const [open, setOpen] = useState<string>();
  const [showPast, setShowPast] = useState(false);
  // Deletions and confirmations wait until their Undo expires before they
  // are written; leaving the screen writes them at once. A deletion
  // interrupted by FORGE closing comes back with only the time it had left.
  const deferred = useDeferred(r);
  const [banner, setBanner] = useState<
    | {
        text: string;
        undo: () => void;
        /** Undo time left (under 6 s only when restored after a restart). */
        ms?: number;
      }
    | undefined
  >(() => {
    const restored = deferred.restored;
    if (!restored) return undefined;
    const g = r.journal("goal").find((x) => x.id === restored.id) as
      Goal | undefined;
    const name = g ? evaluate(g, goalSources(r, today, p.units)).name : "goal";
    return { text: `Deleted ${name}`, undo: deferred.cancel, ms: restored.ms };
  });
  const held = deferred.held;
  const commit = deferred.commit;
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => {
      setBanner(undefined);
      commit();
    }, banner.ms ?? UNDO_MS);
    return () => clearTimeout(t);
  }, [banner, commit]);
  // What goals read, once per data change: its lazy lift and volume caches
  // then serve every card and the chart instead of being rebuilt each render.
  const sources = useMemo(
    () => goalSources(r, today, p.units),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, revision, today, p.units],
  );
  const goals = (r.journal("goal") as Goal[])
    .filter((g) => !(held?.kind === "delete" && held.id === g.id))
    .map((g) =>
      held?.kind === "achieve" && held.id === g.id
        ? { ...g, data: held.data }
        : g,
    );
  const views = goals.map((g) => evaluate(g, sources));
  const active = views.filter((v) => v.status === "active");
  const past = views.filter((v) => v.status !== "active");
  const detail = open ? views.find((v) => v.goal.id === open) : undefined;

  function show(text: string, undo: () => void) {
    commit();
    setBanner({ text, undo });
    AccessibilityInfo.announceForAccessibility(`${text}. Undo available.`);
  }
  function hold(next: Pending, text: string) {
    if (!deferred.hold(next)) return;
    setBanner({ text, undo: deferred.cancel });
    AccessibilityInfo.announceForAccessibility(`${text}. Undo available.`);
  }
  function remove(v: GoalView) {
    Alert.alert(
      "Delete goal?",
      `"${v.name}" will be removed from Goals, including any achievement recorded for it. Your workouts, measurements and food logs aren't affected. You can undo for a few seconds.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete goal",
          style: "destructive",
          onPress: () => {
            setOpen(undefined);
            hold({ kind: "delete", id: v.goal.id }, `Deleted ${v.name}`);
          },
        },
      ],
    );
  }
  function achieve(v: GoalView) {
    hold(
      {
        kind: "achieve",
        id: v.goal.id,
        data: achievedData(v, Date.now()),
      },
      `Marked ${v.name} as achieved`,
    );
  }
  function setStatus(v: GoalView, status: "archived" | undefined) {
    const before = { ...v.goal.data };
    const data = { ...v.goal.data };
    if (status) data.status = status;
    else delete data.status;
    const ok = mutate(() => {
      r.updateJournal(v.goal.id, data);
      return true;
    });
    if (ok)
      show(status ? `Archived ${v.name}` : `Restored ${v.name}`, () =>
        mutate(() => r.updateJournal(v.goal.id, before)),
      );
  }
  const actions = (v: GoalView) => [
    ...(v.status !== "achieved"
      ? [
          {
            label: "Edit",
            icon: "create-outline" as const,
            onPress: () => setSheet({ kind: "edit", goal: v.goal }),
          },
        ]
      : []),
    ...(v.status === "active"
      ? [
          {
            label: "Archive",
            icon: "archive-outline" as const,
            onPress: () => setStatus(v, "archived"),
          },
        ]
      : v.status === "archived"
        ? [
            {
              label: "Restore",
              icon: "arrow-undo-outline" as const,
              onPress: () => setStatus(v, undefined),
            },
          ]
        : [
            {
              label: "Set a new target",
              icon: "add" as const,
              onPress: () => setSheet({ kind: "new", like: v.goal }),
            },
          ]),
    {
      label: "Delete",
      icon: "trash-outline" as const,
      destructive: true,
      onPress: () => remove(v),
    },
  ];

  return (
    <ForgeSubScreen
      title={detail ? detail.name : "Goals"}
      eyebrow={
        detail
          ? detail.status === "achieved"
            ? "Achieved goal"
            : detail.status === "archived"
              ? "Archived goal"
              : "Active goal"
          : views.length
            ? `${active.length} active`
            : undefined
      }
      onBack={() => (detail ? setOpen(undefined) : goBack("/(tabs)/profile"))}
      footer={
        detail ? undefined : (
          <CtaButton
            title="New goal"
            icon="add"
            compact
            onPress={() => setSheet({ kind: "new" })}
          />
        )
      }
    >
      {banner && (
        <UndoBanner
          text={banner.text}
          onUndo={() => {
            banner.undo();
            setBanner(undefined);
          }}
        />
      )}
      {detail ? (
        <>
          <GoalCard view={detail} today={today} full />
          {canAchieve(detail) && (
            <CtaButton
              title="Mark as achieved"
              icon="checkmark"
              compact
              accessibilityLabel={`Mark ${detail.name} as achieved`}
              onPress={() => achieve(detail)}
            />
          )}
          <SourceChart view={detail} sources={sources} />
          <View style={{ gap: forge.spacing.tight }}>
            <SectionLabel title="Details" />
            <ForgeCard padding={0} gap={0}>
              <DetailRow
                title={isV2(detail.goal) ? "Counts from" : "Set on"}
                value={dayLabel(detail.goal.date)}
              />
              {detail.targetDate && (
                <DetailRow
                  title="Target date"
                  value={dayLabel(detail.targetDate)}
                  divider
                />
              )}
            </ForgeCard>
          </View>
          <View style={{ gap: forge.spacing.tight }}>
            <SectionLabel title="Actions" />
            <ForgeCard padding={0} gap={0}>
              {actions(detail).map((a, i) => (
                <ForgeListRow
                  key={a.label}
                  title={a.label}
                  icon={a.icon}
                  divider={i > 0}
                  destructive={"destructive" in a && !!a.destructive}
                  onPress={a.onPress}
                />
              ))}
            </ForgeCard>
          </View>
        </>
      ) : (
        <>
          {!views.length ? (
            <ForgeEmpty
              title="Set a goal you can measure"
              detail="A bodyweight, a lift, training volume, how often you train, session length or daily calories. Progress comes only from what you record."
            />
          ) : (
            <SectionLabel
              title={active.length ? "Active" : "No active goals"}
              trailing={
                <InfoButton
                  title="How goals are measured"
                  label="How goals are measured"
                  paragraphs={ABOUT}
                />
              }
            />
          )}
          {views.length > 0 && !active.length && (
            <FText variant="body" tone="secondary">
              Set a new goal, or open past goals to restore an archived one.
            </FText>
          )}
          {active.map((v) => (
            <View key={v.goal.id} style={{ gap: forge.spacing.tight }}>
              <GoalCard
                view={v}
                today={today}
                onPress={() => setOpen(v.goal.id)}
              />
              {canAchieve(v) && (
                <OutlineButton
                  title="Mark as achieved"
                  icon="checkmark"
                  tone="ember"
                  compact
                  accessibilityLabel={`Mark ${v.name} as achieved`}
                  onPress={() => achieve(v)}
                />
              )}
            </View>
          ))}
          {past.length > 0 && (
            <View style={{ gap: forge.spacing.tight, marginTop: 6 }}>
              <SectionLabel title={`Past goals (${past.length})`} />
              <ForgeCard padding={0} gap={0}>
                {!showPast ? (
                  <ForgeListRow
                    icon="time-outline"
                    title="Show past goals"
                    description="Achieved and archived goals"
                    onPress={() => setShowPast(true)}
                  />
                ) : (
                  past.map((v, i) => (
                    <PastRow
                      key={v.goal.id}
                      view={v}
                      divider={i > 0}
                      onPress={() => setOpen(v.goal.id)}
                      menu={
                        <OverflowMenu
                          label={`Options for ${v.name}`}
                          title={v.name}
                          actions={actions(v)}
                        />
                      }
                    />
                  ))
                )}
              </ForgeCard>
            </View>
          )}
        </>
      )}
      {sheet && (
        <GoalSheet
          key={sheet.kind === "edit" ? sheet.goal.id : "new"}
          target={sheet}
          sources={sources}
          frequency={p.frequency}
          onClose={() => setSheet(undefined)}
          onSaved={show}
        />
      )}
    </ForgeSubScreen>
  );
}

/** The Undo offer after a save, archive, achievement or delete. */
function UndoBanner({ text, onUndo }: { text: string; onUndo: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingLeft: forge.spacing.cardPadding,
        paddingRight: 6,
        minHeight: 52,
        borderRadius: forge.radii.card,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
      }}
    >
      <FText variant="body" weight="600" style={{ flex: 1 }}>
        {text}
      </FText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        onPress={onUndo}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 64,
          paddingHorizontal: 12,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <FText variant="cardTitle" weight="700" tone="accent">
          Undo
        </FText>
      </Pressable>
    </View>
  );
}

/** A fact in the detail's Details card: a label and its value. */
function DetailRow({
  title,
  value,
  divider = false,
}: {
  title: string;
  value: string;
  divider?: boolean;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${value}`}
      style={{
        minHeight: 48,
        paddingHorizontal: forge.spacing.cardPadding,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <FText variant="body" tone="secondary">
        {title}
      </FText>
      <FText
        variant="body"
        weight="600"
        align="right"
        style={{ flexShrink: 1 }}
      >
        {value}
      </FText>
    </View>
  );
}

/** An achieved or archived goal: its name, how it ended, and its menu. */
function PastRow({
  view: v,
  divider,
  onPress,
  menu,
}: {
  view: GoalView;
  divider: boolean;
  onPress: () => void;
  menu: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingRight: 6,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${v.spoken}. ${v.status === "archived" ? "Archived" : ""}`}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 56,
          paddingVertical: 10,
          paddingLeft: forge.spacing.cardPadding,
          flexDirection: "row",
          alignItems: "center",
          gap: forge.spacing.group,
          backgroundColor: pressed ? c.cardRaised : "transparent",
        })}
      >
        <Ionicons
          name={v.status === "achieved" ? "trophy-outline" : "archive-outline"}
          size={20}
          color={v.status === "achieved" ? c.emberHot : c.text2}
          style={{ width: 24 }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="cardTitle" weight="700" numberOfLines={2}>
            {v.name}
          </FText>
          <FText variant="label" tone="secondary">
            {v.status === "achieved" ? v.state : `Archived · ${v.measure}`}
          </FText>
        </View>
      </Pressable>
      {menu}
    </View>
  );
}

/**
 * The recorded data behind a bodyweight or lift goal, on real dates: weigh-ins
 * since the goal was set, or the heaviest qualifying set each day. Days far
 * apart are not joined; nothing is interpolated. Other goal types have no
 * chart (their history is the detail's Recent list, or none).
 */
function SourceChart({
  view: v,
  sources,
}: {
  view: GoalView;
  sources: Sources;
}) {
  const type = typeOf(v.goal);
  const units = sources.units;
  let points: { date: string; value: number }[] = [];
  let label = "";
  if (type === "bodyweight") {
    const seen = new Set<string>();
    for (const m of [...sources.measurements]
      .filter(
        (m) => isBodyweightName(m.data.name) && (num(m.data.value) ?? 0) > 0,
      )
      .sort(newestFirst)) {
      if (seen.has(m.date) || m.date < v.goal.date) continue;
      seen.add(m.date);
      points.push({
        date: m.date,
        value: toDisplay(num(m.data.value)!, "kg", units),
      });
    }
    label = "Weigh-ins since this goal was set";
  } else if (
    type === "strength" &&
    sources.exercise(String(v.goal.data.exerciseId))?.load
  ) {
    const reps = repsOf(v.goal);
    const byDay = new Map<string, number>();
    for (const s of sources.lifts(String(v.goal.data.exerciseId)))
      if (s.reps >= reps)
        byDay.set(s.date, Math.max(byDay.get(s.date) ?? 0, s.weight));
    points = [...byDay].map(([date, kg]) => ({
      date,
      value: loadIn(kg, units),
    }));
    label =
      reps > 1
        ? `Heaviest set of ${reps}+ reps each day`
        : "Heaviest set each day";
  }
  if (!label) return null;
  points.sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <ForgeCard testID="goal-chart" gap={10}>
      <FText variant="overline" tone="secondary" header>
        {label}
      </FText>
      {points.length < 2 ? (
        <FText variant="body" tone="secondary">
          {points.length
            ? "One day recorded so far. The chart appears from the second."
            : "Nothing recorded yet. The chart appears from the second day of records."}
        </FText>
      ) : (
        <>
          <ForgeLineChart
            label={label}
            points={points.map((p) => ({
              key: p.date,
              value: p.value,
              description: dayLabel(p.date),
              tick: new Date(`${p.date}T12:00:00`).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric" },
              ),
            }))}
            x={points.map((p) => dayNumber(p.date))}
            breakOver={GAP_DAYS}
            resetKey={v.goal.id}
            format={(n) => `${Math.round(n * 10) / 10} ${units}`}
          />
          <FText variant="label" tone="secondary">
            {v.target}
          </FText>
        </>
      )}
    </ForgeCard>
  );
}

/**
 * One write held back for Undo; written on commit or when the screen closes.
 * A deletion is also recorded as a durable marker (D15), written before the
 * goal disappears and removed before Undo shows it again, so it completes
 * even if FORGE is closed by the system during the six seconds.
 */
function useDeferred(r: ReturnType<typeof useRepo>) {
  const [restored] = useState(() => {
    const m = readPending(r, "goal");
    if (!m) return undefined;
    const ms = remainingMs(m);
    if (ms > 0) return { id: m.id, ms };
    // Already expired: complete it (idempotent).
    mutate(() => commitPending(r, "goal", m.id));
    return undefined;
  });
  const box = useRef<Pending>(
    restored ? { kind: "delete", id: restored.id } : undefined,
  );
  const [held, setHeld] = useState<Pending | undefined>(() =>
    restored ? { kind: "delete", id: restored.id } : undefined,
  );
  const write = useCallback(() => {
    const p = box.current;
    if (!p) return false;
    box.current = undefined;
    mutate(() => {
      if (p.kind === "delete") commitPending(r, "goal", p.id);
      else r.updateJournal(p.id, p.data);
    });
    return true;
  }, [r]);
  useEffect(() => () => void write(), [write]);
  const commit = useCallback(() => {
    if (write()) setHeld(undefined);
  }, [write]);
  const hold = useCallback(
    (next: Pending) => {
      commit();
      if (next.kind === "delete") {
        const record = r.journal("goal").find((g) => g.id === next.id);
        const marked = record
          ? mutate(() => !!markPending(r, "goal", record))
          : undefined;
        if (!marked) return false;
      }
      box.current = next;
      setHeld(next);
      return true;
    },
    [commit, r],
  );
  const cancel = useCallback(() => {
    const p = box.current;
    if (
      p?.kind === "delete" &&
      !mutate(() => (cancelPending(r, "goal", p.id), true))
    )
      return;
    box.current = undefined;
    setHeld(undefined);
  }, [r]);
  return { held, commit, hold, cancel, restored };
}
