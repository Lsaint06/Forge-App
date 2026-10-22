import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Row,
  Field,
  Sheet,
  ProgressBar,
  useColors,
} from "../components/ui";
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
import { repRangeLabel } from "../domain/prescriptions";
import { localDate, type Prescription } from "../domain/types";

// Existing Paths (Phase 6 compatibility). Lifters who started a Path before
// Forge moved to curated programs can keep training it, review its calendar
// and history, and move to a Forge program whenever they choose. Nothing here
// creates, rebuilds or regenerates a plan.

const workingSets = (items: Prescription[]) =>
  items.reduce((n, e) => n + e.sets, 0);

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
            <Label muted size={11}>
              {item.rest}s rest
            </Label>
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
  const [manage, setManage] = useState(false);
  const [sessionActions, setSessionActions] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string>();
  const [selectedDate, setSelectedDate] = useState<string>();
  const [moving, setMoving] = useState<PathSession>();
  const [moveDate, setMoveDate] = useState(localDate());
  const [week, setWeek] = useState(
    Math.max(
      1,
      Number(params.week) ||
        (selected
          ? calendarWeek(
              selected.data.started,
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
    <Screen title="FORGE PATHS" eyebrow="YOUR PATH · PROGRESS SAVED">
      <Button
        title="Back to Forge Paths"
        secondary
        onPress={() => router.replace("/forge-paths")}
      />
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
          <View style={{ gap: 6 }}>
            <Label bold size={22}>
              {selected.data.name}
            </Label>
            <Label muted size={13}>
              {selected.data.status === "paused"
                ? "Paused · your progress is safe"
                : selected.data.status === "archived"
                  ? "Archived · read only"
                  : stats.complete
                    ? "Cycle complete"
                    : `Week ${stats.week} · ${stats.phase.name}`}
            </Label>
            <ProgressBar value={stats.ratio} label="Path completion" />
            <Label muted size={12}>
              {stats.completed} / {stats.expected} workouts completed
            </Label>
          </View>
          {selected.data.status !== "archived" && (
            <Card>
              <Label bold>Ready for a Forge program?</Label>
              <Label muted size={13}>
                You can keep training this Path or switch to a Forge program
                whenever you choose. Nothing changes until you review and start
                a program, and every recorded workout stays in your history.
              </Label>
              <Button
                title="Browse Forge programs"
                secondary
                icon="trail-sign-outline"
                onPress={() => router.push("/forge-paths")}
              />
            </Card>
          )}
          {selectedDate && !session ? (
            <Card>
              <Label bold size={23}>
                Rest day
              </Label>
              <Label muted>Rest day · {selectedDate}</Label>
            </Card>
          ) : session ? (
            <Card>
              <Label muted size={11}>
                {session.state === "completed"
                  ? "COMPLETED"
                  : session.state === "in-progress"
                    ? "WORKOUT IN PROGRESS"
                    : session.record.date === localDate()
                      ? "TODAY'S WORKOUT"
                      : session.record.date > localDate()
                        ? "NEXT WORKOUT"
                        : "MISSED SESSION"}
              </Label>
              <Label bold size={23}>
                {session.data.name}
              </Label>
              <Label muted size={13}>
                {session.record.date} · {session.state}
              </Label>
              <Label muted size={13}>
                {template?.exercises.length ?? 0} exercises ·{" "}
                {workingSets(template?.exercises ?? [])} working sets
              </Label>
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
                        onPress={() => start(session)}
                      />
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
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.elevated,
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <Label size={26}>{glyph}</Label>
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
            <Label muted>
              {dates[0]} – {dates[6]}
            </Label>
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
                const complete =
                  sessions.length > 0 &&
                  sessions.every((s) => s.state === "completed");
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`${weekdayNames[i]} ${date}, ${sessions.length ? sessions.map((s) => s.state).join(", ") : "Rest day"}`}
                    accessibilityState={{ selected: date === calendarDate }}
                    onPress={() => {
                      setSelectedDate(date);
                      setFocusedSessionId(undefined);
                    }}
                    style={{
                      flex: 1,
                      minHeight: 88,
                      paddingVertical: 10,
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 12,
                      borderWidth: date === localDate() ? 2 : 1,
                      borderColor:
                        date === calendarDate || date === localDate()
                          ? colors.accent
                          : colors.border,
                      backgroundColor:
                        date === calendarDate
                          ? colors.elevated
                          : colors.surface,
                    }}
                  >
                    <Label size={11} muted>
                      {weekdayNames[i]}
                    </Label>
                    <Label bold size={17}>
                      {Number(date.slice(-2))}
                    </Label>
                    <Label size={11}>
                      {complete
                        ? "✓"
                        : sessions.some((s) => s.state === "in-progress")
                          ? "◐"
                          : sessions.some((s) => s.state === "missed")
                            ? "!"
                            : sessions.length &&
                                sessions.every((s) => s.state === "skipped")
                              ? "↷"
                              : sessions.length
                                ? "●"
                                : "–"}
                    </Label>
                  </Pressable>
                );
              })}
            </View>
          </Card>
          {r.active() && session?.state !== "in-progress" && (
            <Button
              title="Resume current workout"
              secondary
              onPress={() => router.push("/workout")}
            />
          )}
          <Row>
            <Button
              title="Manage Path"
              secondary
              onPress={() => setManage(true)}
            />
          </Row>
        </>
      )}
      {archived.length > 0 && (
        <Card>
          <Label bold>Earlier Paths</Label>
          {archived.map((p) => (
            <Button
              key={p.record.id}
              title={`Review ${p.data.name} · ${p.data.started}`}
              secondary
              onPress={() => review(p.record.id)}
            />
          ))}
        </Card>
      )}
      <Sheet
        visible={manage && !!selected}
        onClose={() => setManage(false)}
        title="Manage your Path"
      >
        {selected && stats && (
          <>
            <Label>
              {stats.missed} missed · {stats.skipped} skipped
            </Label>
            {stats.missing > 0 && (
              <Label>
                {stats.missing} calendar entries are missing. Restore a backup
                to recover the original schedule.
              </Label>
            )}
            <Label muted size={13}>
              Completed workouts retain their links. Missed and skipped sessions
              never count as completed.
            </Label>
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
      >
        {session && selected && (
          <>
            <Label bold>{session.data.name}</Label>
            <Label muted>
              Training week {session.data.week} · {session.data.phase}
            </Label>
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
                    setMoveDate(
                      session.record.date < localDate()
                        ? localDate()
                        : session.record.date,
                    );
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
                    )
                  }
                />
              </>
            )}
          </>
        )}
      </Sheet>
      <Sheet
        visible={!!moving}
        onClose={() => setMoving(undefined)}
        title="Reschedule session"
      >
        <Field
          label="New session date (YYYY-MM-DD)"
          value={moveDate}
          onChangeText={setMoveDate}
        />
        <Label muted>
          The session keeps its original week and workout relationship. Avoid
          overlapping demanding sessions on adjacent days.
        </Label>
        <Button
          title="Save new session date"
          onPress={() => {
            const saved = mutate(() => {
              reschedulePathSession(r, moving!.record.id, moveDate);
              return true;
            });
            if (saved) {
              setWeek(calendarWeek(selected!.data.started, moveDate));
              setSelectedDate(moveDate);
              setMoving(undefined);
            }
          }}
        />
      </Sheet>
    </Screen>
  );
}
