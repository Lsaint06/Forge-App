import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { Alert } from "../platform/alert";
import { Screen, Button, TextButton, Txt, Card, Empty } from "../components/ui";
import {
  ListRow,
  ListSection,
  OverflowMenu,
  InfoButton,
} from "../components/system";
import {
  CheckinSheet,
  type CheckinTarget,
} from "../components/checkins/CheckinSheet";
import { TrendCard } from "../components/checkins/TrendCard";
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
import { localDate } from "../domain/types";
import { dayTitle, monthName, monthOf } from "../domain/calendar-dates";
import {
  chartable,
  daysCheckedIn,
  details,
  latestOfDay,
  newestFirst,
  onDay,
  spokenSummary,
  summaryLine,
  type Checkin,
} from "../domain/checkins";
import { theme } from "../theme";

// Recovery (Phase 7B WP4C): how the lifter slept and feels, as recorded.
// Today's check-in leads, then trends of real answers over real dates, then
// every check-in by month. No score is computed and nothing here changes
// training. Records keep their journal shape; nothing renames or rewrites
// them, and an untouched edit writes nothing.

const PAGE = 60;
const ABOUT = [
  "A check-in records last night's sleep and how you feel today, on 1–5 scales you choose. Higher soreness and stress mean more of that feeling; higher sleep quality and energy mean better.",
  "Forge shows what you recorded and simple counts and averages. It does not score your recovery, and nothing here changes your training.",
  "This is a personal log, not a medical assessment.",
];

const timeOf = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

export default function Checkins() {
  const r = useRepo();
  const today = localDate();
  const [sheet, setSheet] = useState<CheckinTarget>();
  const [shown, setShown] = useState(PAGE);
  // A deletion waits until its Undo has expired before it is written; leaving
  // the screen writes it at once. Its intent is also a durable marker (D15),
  // so it completes even if FORGE is closed by the system meanwhile. One
  // interrupted that way comes back with only the Undo time it had left.
  const [restored] = useState(() => restoredDelete(r));
  const pending = useRef<string>(restored?.id);
  const [hidden, setHidden] = useState<string | undefined>(restored?.id);
  function commitDelete() {
    if (writePending(r, pending)) setHidden(undefined);
  }
  function undoDelete(id: string) {
    // The marker goes first, so a restored entry can never be deleted later.
    if (!mutate(() => (cancelPending(r, "recovery", id), true))) return;
    pending.current = undefined;
    setHidden(undefined);
  }
  const [banner, setBanner] = useState<
    | {
        text: string;
        undo: () => void;
        /** Undo time left (under 6 s only when restored after a restart). */
        ms?: number;
      }
    | undefined
  >(() =>
    restored
      ? {
          text: restored.text,
          undo: () => undoDelete(restored.id),
          ms: restored.ms,
        }
      : undefined,
  );
  useEffect(() => () => void writePending(r, pending), [r]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => {
      setBanner(undefined);
      if (writePending(r, pending)) setHidden(undefined);
    }, banner.ms ?? UNDO_MS);
    return () => clearTimeout(t);
  }, [banner, r]);

  const entries = r
    .journal("recovery")
    .filter((e) => e.id !== hidden) as Checkin[];
  const history = [...entries].sort(newestFirst);
  const todays = onDay(entries, today);
  const latestToday = todays[0];
  const last = history[0];
  const days = latestOfDay(entries);
  const metrics = chartable(entries);
  const counted = daysCheckedIn(entries, today);

  function show(text: string, undo: () => void) {
    commitDelete();
    setBanner({ text, undo });
    AccessibilityInfo.announceForAccessibility(`${text}. Undo available.`);
  }
  function remove(e: Checkin) {
    Alert.alert(
      "Delete check-in?",
      `${dayTitle(e.date, today)}'s check-in (sleep and how you felt) will be removed from Recovery. Your workouts aren't affected. You can undo for a few seconds.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete check-in",
          style: "destructive",
          onPress: () => {
            commitDelete();
            // Recorded durably before the entry disappears.
            if (!mutate(() => !!markPending(r, "recovery", e))) return;
            pending.current = e.id;
            setHidden(e.id);
            const text = `Deleted ${dayTitle(e.date, today)}'s check-in`;
            setBanner({ text, undo: () => undoDelete(e.id) });
            AccessibilityInfo.announceForAccessibility(
              `${text}. Undo available.`,
            );
          },
        },
      ],
    );
  }
  const edit = (entry: Checkin) => setSheet({ kind: "edit", entry });

  return (
    <Screen
      title="Recovery"
      onBack={() => goBack("/(tabs)")}
      footer={
        <Button
          title={latestToday ? "Update today's check-in" : "Log check-in"}
          icon={latestToday ? "create-outline" : "add"}
          onPress={() =>
            setSheet(
              latestToday
                ? { kind: "edit", entry: latestToday }
                : { kind: "new" },
            )
          }
        />
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
      {!entries.length ? (
        <Empty
          title="Track how you sleep and feel"
          detail="A check-in takes about ten seconds: last night's sleep and four quick 1–5 answers. Nothing is filled in for you."
        />
      ) : (
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Txt variant="overline" tone="secondary" header>
              {todays.length > 1
                ? `Today · ${todays.length} check-ins`
                : "Today"}
            </Txt>
            <InfoButton
              title="About check-ins"
              label="About recovery check-ins"
              paragraphs={ABOUT}
            />
          </View>
          {latestToday ? (
            <TodayDetails entry={latestToday} />
          ) : (
            <View style={{ gap: 2 }}>
              <Txt variant="headline">No check-in today</Txt>
              {last && (
                <Txt tone="secondary">{`Last check-in: ${dayTitle(last.date, today)}`}</Txt>
              )}
            </View>
          )}
          {todays.length > 1 && (
            <Txt variant="caption" tone="secondary">
              Showing the latest. Earlier ones are in History.
            </Txt>
          )}
          {latestToday && (
            <TextButton
              title="Add another check-in for today"
              icon="add"
              neutral
              onPress={() => setSheet({ kind: "new" })}
            />
          )}
          <Txt variant="caption" tone="secondary">
            {`Checked in on ${counted} of the last 30 days`}
          </Txt>
        </Card>
      )}
      {days.size > 1 && metrics.length > 0 && (
        <TrendCard entries={entries} metrics={metrics} today={today} />
      )}
      {history.length > 0 && (
        <View style={{ gap: theme.spacing.md }}>
          <Txt variant="overline" tone="secondary" header>
            History
          </Txt>
          {byMonth(history.slice(0, shown)).map(([month, list]) => (
            <ListSection key={month} title={monthName(month)}>
              {list.map((e) => {
                const day = dayTitle(e.date, today);
                const several = (days.get(e.date)?.count ?? 1) > 1;
                const title = several ? `${day} · ${timeOf(e.createdAt)}` : day;
                const note = String(e.data.notes ?? "").trim();
                return (
                  <ListRow
                    key={e.id}
                    title={title}
                    subtitle={
                      note ? `${summaryLine(e)}\n“${note}”` : summaryLine(e)
                    }
                    chevron={false}
                    accessibilityLabel={`${title}. ${spokenSummary(e)}. Edit`}
                    onPress={() => edit(e)}
                    trailing={
                      <OverflowMenu
                        label={`Options for ${title}`}
                        title={`${title} check-in`}
                        actions={[
                          {
                            label: "Edit",
                            icon: "create-outline",
                            onPress: () => edit(e),
                          },
                          {
                            label: "Delete",
                            icon: "trash-outline",
                            destructive: true,
                            onPress: () => remove(e),
                          },
                        ]}
                      />
                    }
                  />
                );
              })}
            </ListSection>
          ))}
          {history.length > shown && (
            <TextButton
              title={`Show earlier (${history.length - shown})`}
              neutral
              onPress={() => setShown((n) => n + PAGE)}
            />
          )}
        </View>
      )}
      {sheet && (
        <CheckinSheet
          key={sheet.kind === "edit" ? sheet.entry.id : "new"}
          target={sheet}
          entries={entries}
          onClose={() => setSheet(undefined)}
          onSaved={show}
          onEditInstead={edit}
        />
      )}
    </Screen>
  );
}

function TodayDetails({ entry }: { entry: Checkin }) {
  const note = String(entry.data.notes ?? "").trim();
  return (
    <View
      accessible
      accessibilityLabel={`Today's check-in. ${spokenSummary(entry)}`}
      style={{ gap: theme.spacing.xs }}
    >
      {details(entry).map((d) => (
        <View
          key={d.label}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            columnGap: theme.spacing.md,
          }}
        >
          <Txt tone="secondary">{d.label}</Txt>
          <Txt weight="600" tabular>
            {d.value}
          </Txt>
        </View>
      ))}
      {note ? (
        <Txt tone="secondary" numberOfLines={3}>{`“${note}”`}</Txt>
      ) : null}
    </View>
  );
}

/** A deletion interrupted by FORGE closing, still inside its Undo window. */
function restoredDelete(r: ReturnType<typeof useRepo>) {
  const m = readPending(r, "recovery");
  if (!m) return undefined;
  const ms = remainingMs(m);
  if (!ms) {
    // Already expired: complete it (idempotent).
    mutate(() => commitPending(r, "recovery", m.id));
    return undefined;
  }
  const e = r.journal("recovery").find((x) => x.id === m.id);
  return {
    id: m.id,
    ms,
    text: e
      ? `Deleted ${dayTitle(e.date, localDate())}'s check-in`
      : "Deleted check-in",
  };
}

function writePending(
  r: ReturnType<typeof useRepo>,
  pending: React.RefObject<string | undefined>,
) {
  const id = pending.current;
  if (!id) return false;
  pending.current = undefined;
  mutate(() => commitPending(r, "recovery", id));
  return true;
}

function byMonth(list: Checkin[]) {
  const months: [string, Checkin[]][] = [];
  for (const e of list) {
    const month = monthOf(e.date);
    const last = months[months.length - 1];
    if (last && last[0] === month) last[1].push(e);
    else months.push([month, [e]]);
  }
  return months;
}
