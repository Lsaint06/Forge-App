import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen,
  Card,
  Txt,
  Button,
  TextButton,
  Empty,
  ProgressBar,
  SegmentedControl,
  Sheet,
  useColors,
} from "../../components/ui";
import { ListRow, ListSection, useAfterSheet } from "../../components/system";
import { WorkoutRow } from "../../components/programs";
import { useRepo, mutate, confirm } from "../../state";
import { localDate } from "../../domain/types";
import { sessionAt } from "../../domain/programs/enrollment";
import { sessionSetReduction } from "../../domain/programs/progression";
import { programTitle, rangeText } from "../../domain/programs/presentation";
import { dayLabel, relativeDay } from "../../domain/training-display";
import {
  currentEnrollment,
  defaultLowerFatigue,
  endProgram,
  programProgress,
  restoreProgramSession,
  skipProgramSession,
  startProgramSession,
  type Enrollment,
  type LoggedSession,
} from "../../data/programs";
import { programNext } from "../../data/today";
import { goBack } from "../../navigation";
import { blockIfTraining, otherWorkout, resumeWorkout } from "../../startGuard";
import { workoutTitle } from "../../domain/workout-display";

// Your program: where you are, the next session and how to start it, what
// comes next, recent sessions and program management.

type Program = NonNullable<Enrollment["program"]>;

function NextSession({
  enrollment,
  program,
}: {
  enrollment: Enrollment;
  program: Program;
}) {
  const r = useRepo();
  const c = useColors();
  const progress = programProgress(r, enrollment);
  const next = progress.next!;
  const today = localDate();
  const suggested = programNext(r, today)?.date;
  const lowerFatigueAvailable =
    !!program.lowerFatigue && next.state === "ready";
  const planned = defaultLowerFatigue(next);
  const [choice, setChoice] = useState<boolean>();
  const lowerFatigue = lowerFatigueAvailable && (choice ?? planned);
  const lf = program.lowerFatigue;
  // Another workout in progress: this session can't start until it ends.
  const busy = otherWorkout(
    r,
    next.state === "in-progress" ? next.workoutId : undefined,
  );
  function start() {
    if (
      blockIfTraining(
        r,
        next.state === "in-progress" ? next.workoutId : undefined,
      )
    )
      return;
    const workout = mutate(() =>
      startProgramSession(r, enrollment.record.id, undefined, {
        lowerFatigue,
      }),
    );
    if (workout) {
      setChoice(undefined);
      router.push("/workout");
    }
  }
  return (
    <Card style={{ padding: 20, gap: 0 }}>
      <Txt
        variant="overline"
        tone={next.state === "in-progress" ? "accent" : "secondary"}
      >
        {next.state === "in-progress" ? "In progress" : "Next session"}
      </Txt>
      <Txt variant="title" header style={{ marginTop: 6 }}>
        {next.session.name}
      </Txt>
      {next.state === "ready" && suggested && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
          }}
        >
          <Ionicons name="calendar-outline" size={16} color={c.text2} />
          <Txt variant="caption" tone="secondary" style={{ flexShrink: 1 }}>
            {`Suggested for ${relativeDay(suggested, today)} · train whenever suits you`}
          </Txt>
        </View>
      )}
      {lowerFatigueAvailable && lf && (
        <View style={{ gap: 8, marginTop: 16 }}>
          <SegmentedControl
            label="Session type"
            options={[
              { value: "standard", label: "Standard" },
              { value: "lower", label: "Lower fatigue" },
            ]}
            value={lowerFatigue ? "lower" : "standard"}
            onChange={(v) => setChoice(v === "lower")}
          />
          <Txt variant="caption" tone="secondary">
            {lowerFatigue
              ? `About ${Math.round(lf.setReduction * 100)}% fewer working sets at ${rangeText(lf.rir)} RIR, with no load increase.${planned ? " Planned for this week." : ""} The program itself is unchanged.`
              : planned
                ? "This is a planned lower-fatigue week. Train normally only if your recovery is good."
                : "Choose a lower-fatigue session when fatigue or stalled performance builds up."}
          </Txt>
        </View>
      )}
      {!lowerFatigue && next.phase.setReduction !== undefined && (
        <Txt variant="caption" tone="secondary" style={{ marginTop: 10 }}>
          {`This week uses about ${Math.round(next.phase.setReduction * 100)}% fewer working sets. The program itself is unchanged.`}
        </Txt>
      )}
      <View
        style={{
          marginTop: 14,
          marginHorizontal: -20,
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: c.hairline,
        }}
      >
        <WorkoutRow
          session={next.session}
          countOnly
          setReduction={sessionSetReduction(program, next.phase, lowerFatigue)}
        />
      </View>
      <View style={{ marginTop: 16, gap: 4 }}>
        {busy ? (
          <>
            <Txt variant="caption" tone="secondary" style={{ marginBottom: 6 }}>
              {`${workoutTitle(busy.name)} is in progress. Finish it before starting this session.`}
            </Txt>
            <Button
              title="Resume current workout"
              icon="play"
              onPress={resumeWorkout}
            />
          </>
        ) : (
          <Button
            title={
              next.state === "in-progress" ? "Resume session" : "Start session"
            }
            icon="play"
            onPress={start}
          />
        )}
        {next.state === "ready" && (
          <TextButton
            title="Skip this session"
            neutral
            onPress={() =>
              confirm(
                "Skip this session?",
                "It moves to your history as skipped. The program itself is unchanged, and you can restore it later.",
                () => skipProgramSession(r, enrollment.record.id),
              )
            }
          />
        )}
      </View>
    </Card>
  );
}

function SessionRow({
  log,
  program,
  onOpen,
}: {
  log: LoggedSession;
  program: Program;
  /** Opens the workout: its review, or the session in progress. */
  onOpen: (workoutId?: string) => void;
}) {
  const r = useRepo();
  const slot = sessionAt(program, log.data.position);
  const title = `Week ${slot?.week ?? "?"} · ${slot?.session.name ?? "Session"}`;
  if (log.state === "skipped")
    return (
      <ListRow
        title={title}
        subtitle={`Skipped · ${dayLabel(log.record.date)}`}
        trailing={
          <Button
            title="Restore"
            variant="secondary"
            compact
            accessibilityLabel={`Restore ${title}`}
            onPress={() =>
              mutate(() => restoreProgramSession(r, log.record.id))
            }
          />
        }
      />
    );
  return (
    <ListRow
      title={title}
      subtitle={
        log.state === "completed"
          ? `Completed · ${dayLabel(log.record.date)}`
          : "In progress"
      }
      accessibilityLabel={
        log.state === "completed" ? `Review ${title}` : `Resume ${title}`
      }
      onPress={() =>
        onOpen(log.state === "completed" ? log.data.workoutId : undefined)
      }
    />
  );
}

export default function ProgramDashboard() {
  const r = useRepo();
  const sheet = useAfterSheet();
  const [allSessions, setAllSessions] = useState(false);
  const enrollment = currentEnrollment(r);
  const back = () => goBack("/(tabs)");
  if (!enrollment)
    return (
      <Screen title="Your program" onBack={back}>
        <Empty
          title="No current program"
          detail="Choose a Forge program to see your week, next session and progress here."
          action={
            <Button
              title="Browse programs"
              variant="secondary"
              onPress={() => router.replace("/forge-paths")}
            />
          }
        />
      </Screen>
    );
  const program = enrollment.program;
  const progress = programProgress(r, enrollment);
  const next = progress.next;
  const logs = progress.logs.slice().reverse();
  const open = (id?: string) =>
    id
      ? router.push({ pathname: "/workout", params: { id } })
      : router.push("/workout");
  return (
    <Screen
      title={programTitle(enrollment.data.name)}
      eyebrow={
        program?.status === "draft"
          ? "Draft preview · development build only"
          : "Your program"
      }
      onBack={back}
    >
      {program ? (
        <View style={{ gap: 8 }}>
          <Txt variant="headline">
            {progress.complete
              ? "Program complete"
              : next
                ? `Week ${next.week}${program.durationWeeks ? ` of ${program.durationWeeks}` : ""} · ${next.phase.name}`
                : ""}
          </Txt>
          {progress.total !== undefined && (
            <ProgressBar
              value={progress.completed / progress.total}
              label="Program completion"
            />
          )}
          <Txt variant="caption" tone="secondary" tabular>
            {progress.total !== undefined
              ? `${progress.completed} of ${progress.total} sessions completed`
              : `${progress.completed} ${progress.completed === 1 ? "session" : "sessions"} completed`}
          </Txt>
        </View>
      ) : (
        <Txt tone="secondary">
          {`Version ${enrollment.data.programVersion} is not available in this app version. Your history is preserved.`}
        </Txt>
      )}
      {next && program && (
        <NextSession enrollment={enrollment} program={program} />
      )}
      {progress.complete && (
        <Card>
          <Txt variant="headline">Program complete</Txt>
          <Txt tone="secondary">
            Every session is done. Your workouts and progress stay in your
            history.
          </Txt>
          <Button
            title="Choose your next program"
            onPress={() => {
              const ended = mutate(() => {
                endProgram(r, enrollment.record.id);
                return true;
              });
              if (ended) router.replace("/forge-paths");
            }}
          />
        </Card>
      )}
      {progress.upcoming.length > 1 && (
        <ListSection title="Coming up">
          {progress.upcoming.slice(1, 4).map((slot) => (
            <ListRow
              key={slot.position}
              title={slot.session.name}
              subtitle={`${dayLabel(slot.suggested)} · Week ${slot.week}`}
            />
          ))}
        </ListSection>
      )}
      {program && logs.length > 0 && (
        <ListSection title="Recent sessions">
          {logs.slice(0, 3).map((log) => (
            <SessionRow
              key={log.record.id}
              log={log}
              program={program}
              onOpen={open}
            />
          ))}
          <ListRow
            icon="list-outline"
            title="All program sessions"
            value={String(logs.length)}
            onPress={() => setAllSessions(true)}
          />
        </ListSection>
      )}
      <ListSection title="Program">
        {program && (
          <ListRow
            icon="document-text-outline"
            title="Program details"
            onPress={() =>
              router.push({
                pathname: "/forge-paths/[programId]",
                params: {
                  programId: program.id,
                  version: String(program.version),
                },
              })
            }
          />
        )}
        <ListRow
          icon="compass-outline"
          title="Browse programs"
          onPress={() => router.dismissTo("/forge-paths")}
        />
        {!progress.complete && (
          <ListRow
            icon="stop-circle-outline"
            title="End program"
            destructive
            onPress={() =>
              confirm(
                "End this program?",
                "It is archived. Every recorded workout stays in your history.",
                () => endProgram(r, enrollment.record.id),
              )
            }
          />
        )}
      </ListSection>
      {program && (
        <Sheet
          visible={allSessions}
          onClose={() => setAllSessions(false)}
          onDismiss={sheet.onDismiss}
          title="Program sessions"
          dismissOnBackdrop
        >
          <ListSection>
            {logs.map((log) => (
              <SessionRow
                key={log.record.id}
                log={log}
                program={program}
                onOpen={(id) =>
                  sheet.after(
                    () => setAllSessions(false),
                    () => open(id),
                  )
                }
              />
            ))}
          </ListSection>
        </Sheet>
      )}
    </Screen>
  );
}
