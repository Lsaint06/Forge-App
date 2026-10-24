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
  const [banner, setBanner] = useState<{ text: string; undo: () => void }>();
  // A deletion waits until its Undo has expired before it is written; leaving
  // the screen writes it at once.
  const pending = useRef<string>(undefined);
  const [hidden, setHidden] = useState<string>();
  function commitDelete() {
    if (writePending(r, pending)) setHidden(undefined);
  }
  useEffect(() => () => void writePending(r, pending), [r]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => {
      setBanner(undefined);
      if (writePending(r, pending)) setHidden(undefined);
    }, 6000);
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
      `${dayTitle(e.date, today)}'s check-in will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            commitDelete();
            pending.current = e.id;
            setHidden(e.id);
            const text = `Deleted ${dayTitle(e.date, today)}'s check-in`;
            setBanner({
              text,
              undo: () => {
                pending.current = undefined;
                setHidden(undefined);
              },
            });
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

function writePending(
  r: ReturnType<typeof useRepo>,
  pending: React.RefObject<string | undefined>,
) {
  const id = pending.current;
  if (!id) return false;
  pending.current = undefined;
  mutate(() => r.deleteJournal(id));
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
