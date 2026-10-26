import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Txt, Button, Sheet, useColors, type IconName } from "../components/ui";
import { ListRow } from "../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeListRow,
  ForgeProgress,
  ForgeSubScreen,
  HeroCard,
  OutlineButton,
  RowDivider,
  SectionLabel,
  SquareIconButton,
} from "../components/reforge";
import { forge } from "../theme";
import { DateSheet } from "../components/DateSheet";
import { useRepo, mutate, confirm } from "../state";
import { weekdayNames } from "../domain/paths/model";
import { calendarWeek, weekDates, weekFocus } from "../domain/paths/calendar";
import {
  currentPath,
  pathPrograms,
  pathSummary,
  pausePath,
  resumePath,
  startPathSession,
  reschedulePathSession,
  skipPathSession,
  type PathSession,
} from "../data/paths";
import { pathFocus } from "../data/today";
import { repRangeLabel } from "../domain/prescriptions";
import { localDate, type Prescription } from "../domain/types";
import { dayLabel, relativeDay } from "../domain/training-display";
import { goBack } from "../navigation";
import { blockIfTraining, otherWorkout } from "../startGuard";

// Existing Paths (Phase 6 compatibility; REFORGE presentation, Phase 7.2C).
// Lifters who started a Path before Forge moved to curated programs can keep
// training it, review its calendar and history, and move to a Forge program
// whenever they choose. Nothing here creates, rebuilds or regenerates a plan.

const workingSets = (items: Prescription[]) =>
  items.reduce((n, e) => n + e.sets, 0);

// One marker per calendar day, in the same priority as before: all done, in
// progress, missed, all skipped, planned, rest.
function dayMarker(sessions: PathSession[]): {
  icon: IconName;
  label: string;
  tone: "success" | "warning" | "primary" | "tertiary";
} {
  if (sessions.length && sessions.every((s) => s.state === "completed"))
    return { icon: "checkmark-circle", label: "completed", tone: "success" };
  if (sessions.some((s) => s.state === "in-progress"))
    return { icon: "time-outline", label: "in progress", tone: "primary" };
  if (sessions.some((s) => s.state === "missed"))
    return { icon: "alert-circle-outline", label: "missed", tone: "warning" };
  if (sessions.length && sessions.every((s) => s.state === "skipped"))
    return {
      icon: "play-skip-forward-outline",
      label: "skipped",
      tone: "tertiary",
    };
  if (sessions.length)
    return { icon: "ellipse", label: "workout planned", tone: "primary" };
  return { icon: "remove-outline", label: "rest day", tone: "tertiary" };
}

function ExerciseList({ items }: { items: Prescription[] }) {
  const r = useRepo();
  const colors = useColors();
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={`${index}-${item.exerciseId}`}
          style={{
            paddingVertical: 12,
            borderBottomWidth:
              index === items.length - 1 ? 0 : forge.border.card,
            borderColor: colors.cardDivider,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <FText
            variant="label"
            tone="accent"
            weight="700"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {String(index + 1).padStart(2, "0")}
          </FText>
          <View style={{ flex: 1 }}>
            <FText variant="body" weight="600">
              {r.exercise(item.exerciseId)?.name ?? "Unavailable movement"}
            </FText>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <FText variant="body" weight="700">
              {item.sets} × {repRangeLabel(item)}
            </FText>
            <FText variant="label" tone="secondary">
              {`${item.rest}s rest`}
            </FText>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function LegacyPath() {
  const r = useRepo();
  const colors = useColors();
  const params = useLocalSearchParams<{ programId?: string; week?: string }>();
  const active = currentPath(r);
  const [selectedId, setSelectedId] = useState(params.programId);
  const selected =
    pathPrograms(r).find((p) => p.record.id === selectedId) ?? active;
  const stats = selected ? pathSummary(r, selected) : undefined;
  // The session Today offers, so both screens open on the same workout.
  const focus = stats ? pathFocus(stats.sessions) : undefined;
  const [manage, setManage] = useState(false);
  const [sessionActions, setSessionActions] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string>();
  const [selectedDate, setSelectedDate] = useState<string>();
  const [moving, setMoving] = useState<PathSession>();
  const [moveFrom, setMoveFrom] = useState(localDate());
  const [week, setWeek] = useState(
    Math.max(
      1,
      Number(params.week) ||
        (selected
          ? calendarWeek(
              selected.data.started,
              focus?.record.date ??
                stats?.next?.record.date ??
                stats?.sessions[stats.sessions.length - 1]?.record.date ??
                selected.data.started,
            )
          : 1),
    ),
  );
  const dates = selected ? weekDates(selected.data.started, week) : [];
  const lastCalendarWeek =
    selected && stats
      ? Math.max(
          8,
          ...stats.sessions.map((s) =>
            calendarWeek(selected.data.started, s.record.date),
          ),
        )
      : 8;
  const visibleSessions =
    stats?.sessions.filter(
      (s) =>
        dates.includes(s.record.date) &&
        (!selectedDate || s.record.date === selectedDate),
    ) ?? [];
  const trainingWeeks = [
    ...new Set(
      stats?.sessions
        .filter((s) => dates.includes(s.record.date))
        .map((s) => s.data.week) ?? [],
    ),
  ].sort((a, b) => a - b);
  const session =
    visibleSessions.find((s) => s.record.id === focusedSessionId) ??
    (selectedDate
      ? undefined
      : visibleSessions.find((s) => s.record.id === focus?.record.id)) ??
    visibleSessions.find((s) => !["completed", "skipped"].includes(s.state)) ??
    visibleSessions[0];
  const calendarDate = selectedDate ?? session?.record.date ?? dates[0];
  const template = session
    ? r.templates().find((t) => t.id === session.data.templateId)
    : undefined;
  const archived = pathPrograms(r).filter(
    (p) => p.data.status === "archived" && p.record.id !== selected?.record.id,
  );
  function start(s: PathSession) {
    if (blockIfTraining(r, String(s.data.workoutId ?? ""))) return;
    const workout = mutate(() => startPathSession(r, s.record.id));
    if (workout) router.push("/workout");
  }
  function review(id: string) {
    setSelectedId(id);
    setWeek(1);
    setSelectedDate(undefined);
    setFocusedSessionId(undefined);
  }
  return (
    <ForgeSubScreen
      title={selected?.data.name ?? "Your Path"}
      eyebrow="Your Path"
      eyebrowTone="accent"
      onBack={() => goBack("/forge-paths")}
    >
      {!selected || !stats ? (
        <ForgeEmpty
          title="No current Path"
          detail="Your training plans now come from Forge programs, written and reviewed by hand. Your earlier workouts stay in your history."
          action={
            <CtaButton
              title="Choose a Forge program"
              icon="trail-sign-outline"
              onPress={() => router.replace("/forge-paths")}
            />
          }
        />
      ) : (
        <>
          <ForgeCard gap={10}>
            <FText variant="cardTitle" weight="700">
              {selected.data.status === "paused"
                ? "Paused · your progress is safe"
                : selected.data.status === "archived"
                  ? "Archived · read only"
                  : stats.complete
                    ? "Cycle complete"
                    : `Week ${stats.week} · ${stats.phase.name}`}
            </FText>
            <ForgeProgress value={stats.ratio} label="Path completion" />
            <FText variant="label" tone="secondary">
              {`${stats.completed} / ${stats.expected} workouts completed`}
            </FText>
          </ForgeCard>
          {selectedDate && !session ? (
            <ForgeCard gap={4}>
              <FText variant="cardTitle" weight="700">
                Rest day
              </FText>
              <FText variant="body" tone="secondary">
                {dayLabel(selectedDate)}
              </FText>
            </ForgeCard>
          ) : session ? (
            <HeroCard minHeight={0}>
              <View style={{ gap: 6 }}>
                <FText
                  variant="overline"
                  tone={
                    session.state === "in-progress" ||
                    (session.state !== "completed" &&
                      !session.data.skipped &&
                      session.record.date <= localDate())
                      ? "accent"
                      : "secondary"
                  }
                >
                  {session.state === "completed"
                    ? "Completed"
                    : session.state === "in-progress"
                      ? "In progress"
                      : session.data.skipped
                        ? "Skipped"
                        : session.record.date === localDate()
                          ? "Scheduled today"
                          : session.record.date > localDate()
                            ? "Next session"
                            : "Missed session"}
                </FText>
                <FText variant="heroTitle" header numberOfLines={3}>
                  {session.data.name}
                </FText>
                <FText variant="body" tone="secondary">
                  {`Week ${session.data.week} · ${template?.exercises.length ?? 0} exercises · ${workingSets(template?.exercises ?? [])} working sets`}
                </FText>
                <FText variant="label" tone="secondary">
                  {session.state === "completed" ||
                  session.record.date === localDate()
                    ? dayLabel(session.record.date)
                    : session.state === "missed"
                      ? `Originally scheduled for ${dayLabel(session.record.date)}`
                      : `Scheduled for ${relativeDay(session.record.date)}`}
                </FText>
              </View>
              {session.state === "completed" ? (
                <OutlineButton
                  title={`Review ${session.data.name}`}
                  onPress={() =>
                    router.push({
                      pathname: "/workout",
                      params: { id: session.data.workoutId },
                    })
                  }
                />
              ) : (
                <>
                  {selected.data.status === "active" &&
                    !session.data.skipped && (
                      <CtaButton
                        title={
                          session.state === "in-progress"
                            ? "Resume Path workout"
                            : "Start workout"
                        }
                        icon="play"
                        disabled={
                          !!otherWorkout(
                            r,
                            String(session.data.workoutId ?? ""),
                          )
                        }
                        onPress={() => start(session)}
                      />
                    )}
                  {selected.data.status === "active" &&
                    !session.data.skipped &&
                    !!otherWorkout(r, String(session.data.workoutId ?? "")) && (
                      <FText variant="label" tone="secondary">
                        Finish your current workout before starting this one.
                      </FText>
                    )}
                  {session.state === "unlinked" && (
                    <FText variant="label" tone="secondary">
                      The previous workout link is unavailable. Starting creates
                      a new workout.
                    </FText>
                  )}
                </>
              )}
              {!["completed", "in-progress"].includes(session.state) && (
                <View
                  style={{
                    borderRadius: forge.radii.tile,
                    backgroundColor: colors.cardRaised,
                    paddingHorizontal: 12,
                    paddingTop: 10,
                  }}
                >
                  <FText variant="overline" tone="secondary">
                    Your exercises
                  </FText>
                  <ExerciseList items={template?.exercises ?? []} />
                </View>
              )}
              {selected.data.status !== "archived" && (
                <OutlineButton
                  title="Workout options"
                  icon="ellipsis-horizontal"
                  onPress={() => setSessionActions(true)}
                />
              )}
            </HeroCard>
          ) : (
            <ForgeCard>
              <FText variant="body" tone="secondary">
                No sessions this week.
              </FText>
            </ForgeCard>
          )}
          <ForgeCard gap={10}>
            <FText variant="overline" tone="secondary">
              YOUR TRAINING CALENDAR
            </FText>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              {(
                [
                  ["← Previous week", "←", week <= 1, -1],
                  ["Next week →", "→", week >= lastCalendarWeek, 1],
                ] as const
              ).map(([label, glyph, disabled, step], i) => (
                <React.Fragment key={label}>
                  {i === 1 && (
                    <FText variant="displayLabel">Calendar week {week}</FText>
                  )}
                  <SquareIconButton
                    icon={glyph === "←" ? "chevron-back" : "chevron-forward"}
                    label={label}
                    disabled={disabled}
                    onPress={() => {
                      setWeek(week + step);
                      setSelectedDate(undefined);
                    }}
                  />
                </React.Fragment>
              ))}
            </View>
            <FText variant="body" tone="secondary">
              {`${dayLabel(dates[0]!)} – ${dayLabel(dates[6]!)}`}
            </FText>
            {trainingWeeks.map((w) => (
              <FText key={w} variant="label" tone="secondary">
                Training week {w} · {w <= 4 ? "Foundation" : "Evolution"}
              </FText>
            ))}
            <FText variant="label">{weekFocus(trainingWeeks[0] ?? 9)}</FText>
            {/* Seven 44 pt days fit a 375 pt phone: the row uses half the card's inset. */}
            <View
              style={{ flexDirection: "row", gap: 1, marginHorizontal: -8 }}
            >
              {dates.map((date, i) => {
                const sessions = stats.sessions.filter(
                  (s) => s.record.date === date,
                );
                const marker = dayMarker(sessions);
                const selectedDay = date === calendarDate;
                const today = date === localDate();
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`${dayLabel(date)}${today ? ", today" : ""}: ${marker.label}`}
                    accessibilityState={{ selected: selectedDay }}
                    onPress={() => {
                      setSelectedDate(date);
                      setFocusedSessionId(undefined);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 44,
                      minHeight: 80,
                      paddingVertical: 10,
                      alignItems: "center",
                      gap: 6,
                      borderRadius: forge.radii.tile,
                      borderWidth: selectedDay ? forge.border.active : 0,
                      borderColor: colors.emberHot,
                      backgroundColor: selectedDay
                        ? colors.emberTint
                        : "transparent",
                    }}
                  >
                    <Txt
                      variant="caption"
                      tone={today ? "accent" : "secondary"}
                      weight={today ? "700" : "500"}
                    >
                      {weekdayNames[i]!.charAt(0)}
                    </Txt>
                    <Txt
                      variant="headline"
                      tabular
                      weight={today ? "800" : "600"}
                    >
                      {String(Number(date.slice(-2)))}
                    </Txt>
                    <Ionicons
                      name={marker.icon}
                      size={14}
                      color={
                        // Completion reads ember, as in the logger (D7).
                        marker.tone === "success"
                          ? colors.emberHot
                          : marker.tone === "warning"
                            ? colors.warning
                            : marker.tone === "primary"
                              ? colors.text
                              : colors.text3
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
          </ForgeCard>
          {r.active() && session?.state !== "in-progress" && (
            <OutlineButton
              title="Resume current workout"
              icon="play"
              tone="ember"
              onPress={() => router.push("/workout")}
            />
          )}
          <ForgeCard padding={0} gap={0}>
            <ForgeListRow
              icon="options-outline"
              title="Manage Path"
              description="Pause, resume and schedule status"
              onPress={() => setManage(true)}
            />
            {selected.data.status !== "archived" && (
              <ForgeListRow
                divider
                icon="trail-sign-outline"
                title="Ready for a Forge program?"
                description="Keep this Path or switch any time. Every workout stays in your history."
                accessibilityLabel="Browse Forge programs"
                onPress={() => router.push("/forge-paths")}
              />
            )}
          </ForgeCard>
        </>
      )}
      {archived.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Earlier Paths" />
          <ForgeCard padding={0} gap={0}>
            {archived.map((p, i) => (
              <React.Fragment key={p.record.id}>
                {i > 0 && <RowDivider />}
                <ListRow
                  title={p.data.name}
                  subtitle={`Started ${dayLabel(p.data.started)} · read only`}
                  accessibilityLabel={`Review ${p.data.name} · ${p.data.started}`}
                  onPress={() => review(p.record.id)}
                />
              </React.Fragment>
            ))}
          </ForgeCard>
        </View>
      )}
      <Sheet
        visible={manage && !!selected}
        onClose={() => setManage(false)}
        title="Manage your Path"
        dismissOnBackdrop
      >
        {selected && stats && (
          <>
            <Txt>{`${stats.missed} missed · ${stats.skipped} skipped`}</Txt>
            {stats.missing > 0 && (
              <Txt>
                {`${stats.missing} calendar entries are missing. Restore a backup to recover the original schedule.`}
              </Txt>
            )}
            <Txt variant="caption" tone="secondary">
              Completed workouts retain their links. Missed and skipped sessions
              never count as completed.
            </Txt>
            {selected.data.status !== "archived" && (
              <Button
                title={
                  selected.data.status === "paused"
                    ? "Resume Path"
                    : "Pause Path"
                }
                secondary
                onPress={() =>
                  confirm(
                    selected.data.status === "paused"
                      ? "Resume and shift upcoming sessions?"
                      : "Pause upcoming training?",
                    selected.data.status === "paused"
                      ? "Pending sessions on or after your pause date move forward by the number of paused days. Earlier missed sessions and completed workouts keep their dates."
                      : "Your progress is kept. Resuming shifts upcoming dates; an already active workout can still be finished.",
                    () =>
                      selected.data.status === "paused"
                        ? resumePath(r, selected.record.id)
                        : pausePath(r, selected.record.id),
                    {
                      action:
                        selected.data.status === "paused"
                          ? "Resume Path"
                          : "Pause Path",
                      destructive: false,
                    },
                  )
                }
              />
            )}
          </>
        )}
      </Sheet>
      <Sheet
        visible={sessionActions && !!session}
        onClose={() => setSessionActions(false)}
        title="Workout options"
        dismissOnBackdrop
      >
        {session && selected && (
          <>
            <Txt variant="headline">{session.data.name}</Txt>
            <Txt tone="secondary">
              {`Training week ${session.data.week} · ${session.data.phase}`}
            </Txt>
            {visibleSessions
              .filter(
                (s) =>
                  s.record.date === session.record.date &&
                  s.record.id !== session.record.id,
              )
              .map((other) => (
                <Button
                  key={other.record.id}
                  title={`View ${other.data.name} · ${other.state}`}
                  secondary
                  onPress={() => {
                    setFocusedSessionId(other.record.id);
                    setSessionActions(false);
                  }}
                />
              ))}
            {!["completed", "in-progress"].includes(session.state) && (
              <>
                <Button
                  title={`Move ${session.data.name}`}
                  secondary
                  onPress={() => {
                    setSessionActions(false);
                    setMoving(session);
                    const from =
                      session.record.date < localDate()
                        ? localDate()
                        : session.record.date;
                    setMoveFrom(from);
                  }}
                />
                <Button
                  title={`${session.data.skipped ? "Restore" : "Skip"} ${session.data.name}`}
                  secondary
                  onPress={() =>
                    confirm(
                      session.data.skipped
                        ? "Restore this session?"
                        : "Skip this session?",
                      "Skipping never counts as completed. Your history is preserved.",
                      () => {
                        skipPathSession(
                          r,
                          session.record.id,
                          !session.data.skipped,
                        );
                        setSessionActions(false);
                      },
                      {
                        action: session.data.skipped
                          ? "Restore session"
                          : "Skip session",
                        destructive: !session.data.skipped,
                      },
                    )
                  }
                />
              </>
            )}
          </>
        )}
      </Sheet>
      <DateSheet
        visible={!!moving}
        title="Reschedule session"
        detail={
          moving &&
          `${moving.data.name} keeps its original week and workout relationship. Avoid overlapping demanding sessions on adjacent days.`
        }
        confirmLabel="Move"
        initial={moveFrom}
        range="future"
        onClose={() => setMoving(undefined)}
        onConfirm={(date) => {
          const saved = mutate(() => {
            reschedulePathSession(r, moving!.record.id, date);
            return true;
          });
          if (saved) {
            setWeek(calendarWeek(selected!.data.started, date));
            setSelectedDate(date);
          }
          // On a refusal the alert explains why; Move reopens the calendar.
          setMoving(undefined);
        }}
      />
    </ForgeSubScreen>
  );
}
