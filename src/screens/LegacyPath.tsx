import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen,
  Card,
  Label,
  Txt,
  Button,
  Sheet,
  ProgressBar,
  useColors,
  type IconName,
} from "../components/ui";
import { ListRow, ListSection } from "../components/system";
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

// Existing Paths (Phase 6 compatibility). Lifters who started a Path before
// Forge moved to curated programs can keep training it, review its calendar
// and history, and move to a Forge program whenever they choose. Nothing here
// creates, rebuilds or regenerates a plan.

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
            paddingVertical: 13,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Label muted size={12}>
            {String(index + 1).padStart(2, "0")}
          </Label>
          <View style={{ flex: 1 }}>
            <Label bold size={16}>
              {r.exercise(item.exerciseId)?.name ?? "Unavailable movement"}
            </Label>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Label bold>
              {item.sets} × {repRangeLabel(item)}
            </Label>
            <Txt variant="caption" tone="secondary">
              {`${item.rest}s rest`}
            </Txt>
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
    <Screen
      title={selected?.data.name ?? "Your Path"}
      eyebrow="Your Path"
      onBack={() => goBack("/forge-paths")}
    >
      {!selected || !stats ? (
        <Card>
          <Label bold size={22}>
            No current Path
          </Label>
          <Label muted>
            Your training plans now come from Forge programs, written and
            reviewed by hand. Your earlier workouts stay in your history.
          </Label>
          <Button
            title="Choose a Forge program"
            icon="trail-sign-outline"
            onPress={() => router.replace("/forge-paths")}
          />
        </Card>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Txt variant="headline">
              {selected.data.status === "paused"
                ? "Paused · your progress is safe"
                : selected.data.status === "archived"
                  ? "Archived · read only"
                  : stats.complete
                    ? "Cycle complete"
                    : `Week ${stats.week} · ${stats.phase.name}`}
            </Txt>
            <ProgressBar value={stats.ratio} label="Path completion" />
            <Txt variant="caption" tone="secondary" tabular>
              {`${stats.completed} / ${stats.expected} workouts completed`}
            </Txt>
          </View>
          {selected.data.status !== "archived" && (
            <Card>
              <Txt variant="headline">Ready for a Forge program?</Txt>
              <Txt variant="caption" tone="secondary">
                Keep training this Path or switch whenever you choose. Nothing
                changes until you start a program, and every recorded workout
                stays in your history.
              </Txt>
              <Button
                title="Browse Forge programs"
                variant="secondary"
                icon="trail-sign-outline"
                onPress={() => router.push("/forge-paths")}
              />
            </Card>
          )}
          {selectedDate && !session ? (
            <Card>
              <Txt variant="headline">Rest day</Txt>
              <Txt tone="secondary">{dayLabel(selectedDate)}</Txt>
            </Card>
          ) : session ? (
            <Card style={{ padding: 20 }}>
              <View style={{ gap: 4 }}>
                <Txt
                  variant="overline"
                  tone={
                    session.state === "in-progress" ? "accent" : "secondary"
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
                </Txt>
                <Txt variant="title" header>
                  {session.data.name}
                </Txt>
                <Txt tone="secondary">
                  {`Week ${session.data.week} · ${template?.exercises.length ?? 0} exercises · ${workingSets(template?.exercises ?? [])} working sets`}
                </Txt>
                <Txt variant="caption" tone="secondary">
                  {session.state === "completed" ||
                  session.record.date === localDate()
                    ? dayLabel(session.record.date)
                    : session.state === "missed"
                      ? `Originally scheduled for ${dayLabel(session.record.date)}`
                      : `Scheduled for ${relativeDay(session.record.date)}`}
                </Txt>
              </View>
              {session.state === "completed" ? (
                <Button
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
                      <Button
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
                      <Label muted>
                        Finish your current workout before starting this one.
                      </Label>
                    )}
                  {session.state === "unlinked" && (
                    <Label muted>
                      The previous workout link is unavailable. Starting creates
                      a new workout.
                    </Label>
                  )}
                </>
              )}
              {!["completed", "in-progress"].includes(session.state) && (
                <>
                  <Label bold>Your exercises</Label>
                  <ExerciseList items={template?.exercises ?? []} />
                </>
              )}
              {selected.data.status !== "archived" && (
                <Button
                  title="Workout options"
                  secondary
                  onPress={() => setSessionActions(true)}
                />
              )}
            </Card>
          ) : (
            <Card>
              <Label>No sessions this week.</Label>
            </Card>
          )}
          <Card>
            <Label muted size={11}>
              YOUR TRAINING CALENDAR
            </Label>
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
                    <Label bold size={20}>
                      Calendar week {week}
                    </Label>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => {
                      setWeek(week + step);
                      setSelectedDate(undefined);
                    }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.surfaceRaised,
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <Ionicons
                      name={glyph === "←" ? "chevron-back" : "chevron-forward"}
                      size={20}
                      color={colors.text}
                    />
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
            <Txt tone="secondary">
              {`${dayLabel(dates[0]!)} – ${dayLabel(dates[6]!)}`}
            </Txt>
            {trainingWeeks.map((w) => (
              <Label key={w} muted size={12}>
                Training week {w} · {w <= 4 ? "Foundation" : "Evolution"}
              </Label>
            ))}
            <Label size={13}>{weekFocus(trainingWeeks[0] ?? 9)}</Label>
            <View style={{ flexDirection: "row", gap: 3 }}>
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
                      minHeight: 80,
                      paddingVertical: 10,
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 12,
                      borderWidth: selectedDay ? 1.5 : 0,
                      borderColor: colors.text,
                      backgroundColor: selectedDay
                        ? colors.surfaceRaised
                        : "transparent",
                    }}
                  >
                    <Txt
                      variant="caption"
                      tone={today ? "primary" : "tertiary"}
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
                        marker.tone === "success"
                          ? colors.success
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
          </Card>
          {r.active() && session?.state !== "in-progress" && (
            <Button
              title="Resume current workout"
              variant="secondary"
              onPress={() => router.push("/workout")}
            />
          )}
          <ListSection>
            <ListRow
              icon="options-outline"
              title="Manage Path"
              onPress={() => setManage(true)}
            />
          </ListSection>
        </>
      )}
      {archived.length > 0 && (
        <ListSection title="Earlier Paths">
          {archived.map((p) => (
            <ListRow
              key={p.record.id}
              title={p.data.name}
              subtitle={`Started ${dayLabel(p.data.started)} · read only`}
              accessibilityLabel={`Review ${p.data.name} · ${p.data.started}`}
              onPress={() => review(p.record.id)}
            />
          ))}
        </ListSection>
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
    </Screen>
  );
}
