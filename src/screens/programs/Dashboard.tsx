import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  TextButton,
  SegmentedControl,
  Sheet,
  useColors,
} from "../../components/ui";
import { ListRow, ListSection, useAfterSheet } from "../../components/system";
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
} from "../../components/reforge";
import { forge } from "../../theme";
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

// Your program (REFORGE, Phase 7.2C): where you are in the cycle, the next
// session as the hero and how to start it, what comes next, recent sessions
// and program management.

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
    <HeroCard minHeight={0}>
      <FText variant="overline" tone="accent">
        {next.state === "in-progress" ? "In progress" : "Next session"}
      </FText>
      <FText variant="heroTitle" header numberOfLines={3}>
        {next.session.name}
      </FText>
      {next.state === "ready" && suggested && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="calendar-outline" size={16} color={c.text2} />
          <FText variant="label" tone="secondary" style={{ flexShrink: 1 }}>
            {`Suggested for ${relativeDay(suggested, today)} · train whenever suits you`}
          </FText>
        </View>
      )}
      {lowerFatigueAvailable && lf && (
        <View style={{ gap: 8 }}>
          <SegmentedControl
            label="Session type"
            options={[
              { value: "standard", label: "Standard" },
              { value: "lower", label: "Lower fatigue" },
            ]}
            value={lowerFatigue ? "lower" : "standard"}
            onChange={(v) => setChoice(v === "lower")}
          />
          <FText variant="label" tone="secondary">
            {lowerFatigue
              ? `About ${Math.round(lf.setReduction * 100)}% fewer working sets at ${rangeText(lf.rir)} RIR, with no load increase.${planned ? " Planned for this week." : ""} The program itself is unchanged.`
              : planned
                ? "This is a planned lower-fatigue week. Train normally only if your recovery is good."
                : "Choose a lower-fatigue session when fatigue or stalled performance builds up."}
          </FText>
        </View>
      )}
      {!lowerFatigue && next.phase.setReduction !== undefined && (
        <FText variant="label" tone="secondary">
          {`This week uses about ${Math.round(next.phase.setReduction * 100)}% fewer working sets. The program itself is unchanged.`}
        </FText>
      )}
      {/* The session's exercises, one tap to expand: a raised panel, not a
          second bordered card. */}
      <View
        style={{
          borderRadius: forge.radii.tile,
          backgroundColor: c.cardRaised,
          overflow: "hidden",
        }}
      >
        <WorkoutRow
          session={next.session}
          countOnly
          setReduction={sessionSetReduction(program, next.phase, lowerFatigue)}
        />
      </View>
      <View style={{ marginTop: 4, gap: 4 }}>
        {busy ? (
          <>
            <FText variant="label" tone="secondary" style={{ marginBottom: 6 }}>
              {`${workoutTitle(busy.name)} is in progress. Finish it before starting this session.`}
            </FText>
            <CtaButton
              title="Resume current workout"
              icon="play"
              onPress={resumeWorkout}
            />
          </>
        ) : (
          <CtaButton
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
                { action: "Skip session" },
              )
            }
          />
        )}
      </View>
    </HeroCard>
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
          <OutlineButton
            title="Restore"
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
  // The plan lives on Train (Phase 7.2B): without history, Back goes there.
  const back = () => goBack("/(tabs)/train");
  if (!enrollment)
    return (
      <ForgeSubScreen title="Your program" onBack={back}>
        <ForgeEmpty
          title="No current program"
          detail="Choose a Forge program to see your week, next session and progress here."
          action={
            <OutlineButton
              title="Browse programs"
              onPress={() => router.replace("/forge-paths")}
            />
          }
        />
      </ForgeSubScreen>
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
    <ForgeSubScreen
      title={programTitle(enrollment.data.name)}
      eyebrow={
        program?.status === "draft"
          ? "Draft preview · development build only"
          : "Your program"
      }
      eyebrowTone={program?.status === "draft" ? "secondary" : "accent"}
      onBack={back}
    >
      {program ? (
        <ForgeCard gap={10}>
          <FText variant="cardTitle" weight="700">
            {progress.complete
              ? "Program complete"
              : next
                ? `Week ${next.week}${program.durationWeeks ? ` of ${program.durationWeeks}` : ""} · ${next.phase.name}`
                : ""}
          </FText>
          {progress.total !== undefined && (
            <ForgeProgress
              value={progress.completed / progress.total}
              label="Program completion"
            />
          )}
          <FText variant="label" tone="secondary">
            {progress.total !== undefined
              ? `${progress.completed} of ${progress.total} sessions completed`
              : `${progress.completed} ${progress.completed === 1 ? "session" : "sessions"} completed`}
          </FText>
        </ForgeCard>
      ) : (
        <ForgeEmpty
          title="Program unavailable"
          detail={`Version ${enrollment.data.programVersion} is not available in this app version. Your history is preserved.`}
        />
      )}
      {next && program && (
        <NextSession enrollment={enrollment} program={program} />
      )}
      {progress.complete && (
        <ForgeEmpty
          title="Program complete"
          detail="Every session is done. Your workouts and progress stay in your history."
          action={
            <CtaButton
              title="Choose your next program"
              onPress={() => {
                const ended = mutate(() => {
                  endProgram(r, enrollment.record.id);
                  return true;
                });
                if (ended) router.replace("/forge-paths");
              }}
            />
          }
        />
      )}
      {progress.upcoming.length > 1 && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Coming up" />
          <ForgeCard padding={0} gap={0}>
            {progress.upcoming.slice(1, 4).map((slot, i) => (
              <React.Fragment key={slot.position}>
                {i > 0 && <RowDivider />}
                <ListRow
                  title={slot.session.name}
                  subtitle={`${dayLabel(slot.suggested)} · Week ${slot.week}`}
                />
              </React.Fragment>
            ))}
          </ForgeCard>
        </View>
      )}
      {program && logs.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Recent sessions" />
          <ForgeCard padding={0} gap={0}>
            {logs.slice(0, 3).map((log, i) => (
              <React.Fragment key={log.record.id}>
                {i > 0 && <RowDivider />}
                <SessionRow log={log} program={program} onOpen={open} />
              </React.Fragment>
            ))}
            <RowDivider />
            <ListRow
              icon="list-outline"
              title="All program sessions"
              value={String(logs.length)}
              onPress={() => setAllSessions(true)}
            />
          </ForgeCard>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <SectionLabel title="Program" />
        <ForgeCard padding={0} gap={0}>
          {program && (
            <ForgeListRow
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
          <ForgeListRow
            divider={!!program}
            icon="compass-outline"
            title="Browse programs"
            onPress={() => router.dismissTo("/forge-paths")}
          />
          {!progress.complete && (
            <ForgeListRow
              divider
              destructive
              icon="stop-circle-outline"
              title="End program"
              onPress={() =>
                confirm(
                  "End this program?",
                  "It is archived and stops scheduling sessions. Every recorded workout stays in your history.",
                  () => endProgram(r, enrollment.record.id),
                  { action: "End program" },
                )
              }
            />
          )}
        </ForgeCard>
      </View>
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
    </ForgeSubScreen>
  );
}
