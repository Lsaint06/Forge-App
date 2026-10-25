import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { Alert } from "../platform/alert";
import { Screen, Button, TextButton, Txt, Card, Empty } from "../components/ui";
import {
  ListRow,
  ListSection,
  OverflowMenu,
  InfoButton,
} from "../components/system";
import { LineChart } from "../components/charts";
import { GoalCard } from "../components/goals/GoalCard";
import { GoalSheet, type GoalTarget } from "../components/goals/GoalSheet";
import { useRepo, mutate } from "../state";
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
import { theme } from "../theme";

// Goals (Phase 7B WP4D): what the lifter is working toward, measured only
// from recorded data with the definitions in the WP4D audit (section 16A).
// Records keep their journal shape; legacy goals keep their meaning; an
// untouched edit writes nothing; confirmed achievements never change.

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
  const sources = goalSources(r, today, p.units);
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
    <Screen
      title={detail ? "Goal" : "Goals"}
      onBack={() => (detail ? setOpen(undefined) : goBack("/(tabs)/profile"))}
      footer={
        detail ? undefined : (
          <Button
            title="New goal"
            icon="add"
            onPress={() => setSheet({ kind: "new" })}
          />
        )
      }
    >
      {banner && (
        <Card compact raised>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
            }}
          >
            <Txt style={{ flex: 1 }}>{banner.text}</Txt>
            <TextButton
              title="Undo"
              onPress={() => {
                banner.undo();
                setBanner(undefined);
              }}
            />
          </View>
        </Card>
      )}
      {detail ? (
        <>
          <GoalCard view={detail} today={today} full />
          {canAchieve(detail) && (
            <Button
              title="Mark as achieved"
              icon="checkmark"
              accessibilityLabel={`Mark ${detail.name} as achieved`}
              onPress={() => achieve(detail)}
            />
          )}
          <SourceChart view={detail} sources={sources} />
          <ListSection title="Details">
            <ListRow
              title={isV2(detail.goal) ? "Counts from" : "Set on"}
              value={dayLabel(detail.goal.date)}
              chevron={false}
            />
            {detail.targetDate && (
              <ListRow
                title="Target date"
                value={dayLabel(detail.targetDate)}
                chevron={false}
              />
            )}
          </ListSection>
          <ListSection title="Actions">
            {actions(detail).map((a) => (
              <ListRow
                key={a.label}
                title={a.label}
                icon={a.icon}
                destructive={"destructive" in a && !!a.destructive}
                onPress={a.onPress}
              />
            ))}
          </ListSection>
        </>
      ) : (
        <>
          {!views.length ? (
            <Empty
              title="Set a goal you can measure"
              detail="A bodyweight, a lift, training volume, how often you train, session length or daily calories. Progress comes only from what you record."
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Txt variant="overline" tone="secondary" header>
                {active.length ? "Active" : "No active goals"}
              </Txt>
              <InfoButton
                title="How goals are measured"
                label="How goals are measured"
                paragraphs={ABOUT}
              />
            </View>
          )}
          {active.map((v) => (
            <View key={v.goal.id} style={{ gap: theme.spacing.xs }}>
              <GoalCard
                view={v}
                today={today}
                onPress={() => setOpen(v.goal.id)}
              />
              {canAchieve(v) && (
                <TextButton
                  title="Mark as achieved"
                  icon="checkmark"
                  accessibilityLabel={`Mark ${v.name} as achieved`}
                  onPress={() => achieve(v)}
                />
              )}
            </View>
          ))}
          {past.length > 0 && (
            <ListSection title={`Past goals (${past.length})`}>
              {!showPast ? (
                <ListRow
                  title="Show past goals"
                  subtitle="Achieved and archived goals"
                  onPress={() => setShowPast(true)}
                />
              ) : (
                past.map((v) => (
                  <ListRow
                    key={v.goal.id}
                    title={v.name}
                    subtitle={
                      v.status === "achieved"
                        ? v.state
                        : `Archived · ${v.measure}`
                    }
                    accessibilityLabel={`${v.spoken}. ${v.status === "archived" ? "Archived" : ""}`}
                    onPress={() => setOpen(v.goal.id)}
                    trailing={
                      <OverflowMenu
                        label={`Options for ${v.name}`}
                        title={v.name}
                        actions={actions(v)}
                      />
                    }
                  />
                ))
              )}
            </ListSection>
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
    </Screen>
  );
}

/** The recorded data behind a bodyweight or lift goal, on real dates. */
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
  points.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (points.length < 2) return null;
  return (
    <Card>
      <Txt variant="overline" tone="secondary" header>
        {label}
      </Txt>
      <LineChart
        label={label}
        points={points.map((p) => ({
          key: p.date,
          value: p.value,
          description: dayLabel(p.date),
        }))}
        x={points.map((p) => dayNumber(p.date))}
        breakOver={GAP_DAYS}
        resetKey={v.goal.id}
        format={(n) => `${Math.round(n * 10) / 10} ${units}`}
      />
    </Card>
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
