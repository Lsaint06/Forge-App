import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Row,
  Chips,
  Empty,
  ProgressBar,
} from "../components/ui";
import { SectionHeader } from "../components/design";
import { PathSummary } from "../components/PathSummary";
import { useRepo, mutate, confirm } from "../state";
import { localDate } from "../domain/types";
import { addDays } from "../domain/paths/model";
import { restDayName, restDayNames } from "../domain/profile";
import type { CuratedProgram } from "../domain/programs/model";
import { sessionAt } from "../domain/programs/enrollment";
import {
  reducedSets,
  sessionSetReduction,
} from "../domain/programs/progression";
import { restGuidanceLabel } from "../domain/prescriptions";
import { recommendProgram } from "../domain/programs/recommend";
import { trainingWeekdays } from "../domain/programs/schedule";
import { libraryPrograms, programLibrary } from "../programs";
import { draftPreviewEnabled } from "../programs/preview";
import {
  currentEnrollment,
  defaultLowerFatigue,
  endProgram,
  enrollProgram,
  programProgress,
  restoreProgramSession,
  skipProgramSession,
  startProgramSession,
  type Enrollment,
} from "../data/programs";
import { currentPath } from "../data/paths";
import type { Repository } from "../data/repository";

export const programMeta = (p: CuratedProgram) =>
  `${p.experience} · ${p.goal} · ${p.daysPerWeek} days / week · ${
    p.durationWeeks ? `${p.durationWeeks} weeks` : "Ongoing"
  }`;
const reps = (r: { min: number; max: number }) =>
  r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const shortDay = (i: number) => restDayNames[i]!.slice(0, 3);

const roleLabel = {
  primary: "Primary",
  secondary: "Secondary",
  accessory: "Accessory",
} as const;
const rirText = (r: { min: number; max: number }) =>
  r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;

function SessionExercises({
  r,
  session,
  setReduction,
}: {
  r: Repository;
  session: CuratedProgram["phases"][number]["sessions"][number];
  setReduction?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      {session.exercises.map((item, i) => (
        <View key={`${item.exerciseId}-${i}`} style={{ gap: 2 }}>
          <Label>
            {i + 1}. {r.exercise(item.exerciseId)?.name ?? item.exerciseId}
          </Label>
          <Label muted size={13}>
            {[
              `${setReduction === undefined ? item.sets : reducedSets(item.sets, setReduction)} × ${reps(item.reps)} reps${item.perSide ? " per side" : ""}`,
              item.role && roleLabel[item.role],
              item.rest
                ? restGuidanceLabel(item.rest)
                : `${item.restSeconds}s rest`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Label>
          {item.notes && (
            <Label muted size={12}>
              {item.notes}
            </Label>
          )}
        </View>
      ))}
    </View>
  );
}

function PhaseEffort({ phase }: { phase: CuratedProgram["phases"][number] }) {
  if (!phase.rir) return null;
  return (
    <Label muted size={13}>
      Target effort (reps in reserve): primary {rirText(phase.rir.primary)} ·
      secondary {rirText(phase.rir.secondary)} · accessory{" "}
      {rirText(phase.rir.accessory)}
    </Label>
  );
}

function ProgramDetails({
  r,
  program,
  onBack,
  onStarted,
}: {
  r: Repository;
  program: CuratedProgram;
  onBack: () => void;
  onStarted: () => void;
}) {
  const today = localDate();
  const starts = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    {
      label: "Next Monday",
      date: addDays(
        today,
        7 - ((new Date(`${today}T12:00:00`).getDay() + 6) % 7),
      ),
    },
  ];
  const [start, setStart] = useState(starts[0]!.label);
  const enrolled = currentEnrollment(r);
  const isCurrent =
    enrolled?.data.programId === program.id &&
    enrolled.data.programVersion === program.version;
  const restDay = restDayName(r.profile());
  const days = trainingWeekdays(program.weeklyPattern, r.profile().restDay)
    .slice()
    .sort((a, b) => a - b);
  function begin() {
    const date = starts.find((s) => s.label === start)!.date;
    const run = () => {
      enrollProgram(r, program, date, true);
      onStarted();
    };
    if (enrolled || currentPath(r))
      confirm(
        "Replace your current plan?",
        "Your current plan will be archived. Its history and every recorded workout are preserved.",
        run,
      );
    else mutate(run);
  }
  return (
    <>
      <Button title="Back to programs" secondary onPress={onBack} />
      <Card>
        <Label muted size={11}>
          FORGE PROGRAM · VERSION {program.version}
          {program.status === "draft" ? " · DRAFT PREVIEW" : ""}
        </Label>
        <Label bold size={26}>
          {program.name}
        </Label>
        <Label bold>{program.summary}</Label>
        <Label muted size={13}>
          {programMeta(program)}
        </Label>
        <Label>{program.description}</Label>
        <Label muted size={13}>
          Equipment: {program.equipment.join(", ")}
        </Label>
      </Card>
      <Card>
        <Label bold size={20}>
          Your week
        </Label>
        <Label>{days.map(shortDay).join(" · ")}</Label>
        <Label muted size={13}>
          {restDay
            ? `Arranged so ${restDay} stays a rest day.`
            : "Choose a preferred rest day in your profile to arrange this around it."}{" "}
          These are suggestions — you can train whenever suits you.
        </Label>
      </Card>
      <Card>
        <Label bold size={20}>
          Progression
        </Label>
        <Label muted>{program.progression}</Label>
      </Card>
      {program.phases.map((phase, p) => (
        <View key={`${phase.name}-${p}`} style={{ gap: 12 }}>
          <SectionHeader
            title={phase.name}
            detail={
              phase.weeks
                ? `${phase.weeks} ${phase.weeks === 1 ? "week" : "weeks"}`
                : "Repeats each week"
            }
          />
          {phase.notes && <Label muted>{phase.notes}</Label>}
          <PhaseEffort phase={phase} />
          {phase.sessions.map((session) => (
            <Card key={session.id}>
              <Label bold size={18}>
                {session.name}
              </Label>
              {session.notes && (
                <Label muted size={13}>
                  {session.notes}
                </Label>
              )}
              <SessionExercises r={r} session={session} />
            </Card>
          ))}
        </View>
      ))}
      {isCurrent ? (
        <Card>
          <Label bold>This is your current program.</Label>
        </Card>
      ) : (
        <Card>
          <Label bold size={20}>
            Start this program
          </Label>
          <Chips
            values={starts.map((s) => s.label)}
            value={start}
            onChange={setStart}
          />
          <Button title="Start this program" icon="play" onPress={begin} />
          {(enrolled || currentPath(r)) && (
            <Label muted size={12}>
              Your current plan will be archived. Its history is preserved.
            </Label>
          )}
        </Card>
      )}
    </>
  );
}

function ProgramDashboard({
  r,
  enrollment,
  onDetails,
  onBrowse,
}: {
  r: Repository;
  enrollment: Enrollment;
  onDetails: () => void;
  onBrowse: () => void;
}) {
  const program = enrollment.program;
  const progress = programProgress(r, enrollment);
  const next = progress.next;
  const upcoming = progress.upcoming;
  const lowerFatigueAvailable =
    !!program?.lowerFatigue && next?.state === "ready";
  const plannedLowerFatigue = next ? defaultLowerFatigue(next) : false;
  const [lowerFatigue, setLowerFatigue] = useState<boolean>();
  const chosenLowerFatigue =
    lowerFatigueAvailable && (lowerFatigue ?? plannedLowerFatigue);
  function start() {
    const workout = mutate(() =>
      startProgramSession(r, enrollment.record.id, undefined, {
        lowerFatigue: chosenLowerFatigue,
      }),
    );
    if (workout) {
      setLowerFatigue(undefined);
      router.push("/workout");
    }
  }
  return (
    <>
      <Card>
        <Label muted size={11}>
          YOUR PROGRAM
        </Label>
        <Label bold size={26}>
          {enrollment.data.name}
        </Label>
        {program?.status === "draft" && (
          <Label muted size={11}>
            DRAFT PREVIEW · DEVELOPMENT BUILD ONLY
          </Label>
        )}
        {program ? (
          <Label muted size={13}>
            {progress.complete
              ? "Program complete"
              : next
                ? `Week ${next.week}${program.durationWeeks ? ` of ${program.durationWeeks}` : ""} · ${next.phase.name}`
                : ""}{" "}
            · {progress.completed}
            {progress.total ? ` / ${progress.total}` : ""} sessions completed
          </Label>
        ) : (
          <Label muted>
            Version {enrollment.data.programVersion} is not available in this
            app version. Your history is preserved.
          </Label>
        )}
        {progress.total !== undefined && (
          <ProgressBar
            value={progress.completed / progress.total}
            label="Program completion"
          />
        )}
      </Card>
      {next && program && (
        <Card>
          <Label muted size={11}>
            {next.state === "in-progress" ? "IN PROGRESS" : "NEXT SESSION"}
          </Label>
          <Label bold size={22}>
            {next.session.name}
          </Label>
          {next.state === "ready" && upcoming[0] && (
            <Label muted size={13}>
              Suggested {dayLabel(upcoming[0].suggested)} · train whenever suits
              you
            </Label>
          )}
          {next.session.notes && <Label muted>{next.session.notes}</Label>}
          {lowerFatigueAvailable && (
            <View style={{ gap: 6 }}>
              <Chips
                values={["Standard session", "Lower-fatigue session"]}
                value={
                  chosenLowerFatigue
                    ? "Lower-fatigue session"
                    : "Standard session"
                }
                onChange={(v) => setLowerFatigue(v === "Lower-fatigue session")}
              />
              <Label muted size={12}>
                {chosenLowerFatigue
                  ? `About ${Math.round(program!.lowerFatigue!.setReduction * 100)}% fewer working sets at ${rirText(program!.lowerFatigue!.rir)} RIR, with no load increase.${plannedLowerFatigue ? " Planned for this week." : ""} The program itself is unchanged.`
                  : plannedLowerFatigue
                    ? "This is a planned lower-fatigue week. Train normally only if your recovery is good."
                    : "Choose a lower-fatigue session when fatigue or stalled performance builds up."}
              </Label>
            </View>
          )}
          {!chosenLowerFatigue && next.phase.setReduction !== undefined && (
            <Label muted size={12}>
              {`This week uses about ${Math.round(next.phase.setReduction * 100)}% fewer working sets. The program itself is unchanged.`}
            </Label>
          )}
          <SessionExercises
            r={r}
            session={next.session}
            setReduction={
              program
                ? sessionSetReduction(program, next.phase, chosenLowerFatigue)
                : undefined
            }
          />
          <Button
            title={
              next.state === "in-progress" ? "Resume session" : "Start session"
            }
            icon="play"
            onPress={start}
          />
          {next.state === "ready" && (
            <Button
              title="Skip this session"
              secondary
              onPress={() =>
                confirm(
                  "Skip this session?",
                  "It moves to your history as skipped. The program itself is unchanged, and you can restore it later.",
                  () => skipProgramSession(r, enrollment.record.id),
                )
              }
            />
          )}
        </Card>
      )}
      {progress.complete && (
        <Card>
          <Label bold size={20}>
            Program complete
          </Label>
          <Label muted>
            Every session is done. Your workouts and progress stay in your
            history.
          </Label>
          <Button
            title="Choose your next program"
            onPress={() => mutate(() => endProgram(r, enrollment.record.id))}
          />
        </Card>
      )}
      {upcoming.length > 1 && (
        <Card>
          <Label bold size={18}>
            Coming up
          </Label>
          {upcoming.slice(1).map((slot) => (
            <Label key={slot.position} muted size={13}>
              {dayLabel(slot.suggested)} · Week {slot.week} ·{" "}
              {slot.session.name}
            </Label>
          ))}
        </Card>
      )}
      {progress.logs.length > 0 && program && (
        <>
          <SectionHeader title="Program history" />
          {progress.logs
            .slice()
            .reverse()
            .map((log) => {
              const slot = sessionAt(program, log.data.position);
              return (
                <Card key={log.record.id}>
                  <Label bold>
                    Week {slot?.week ?? "?"} · {slot?.session.name ?? "Session"}
                  </Label>
                  <Label muted size={13}>
                    {log.state === "completed"
                      ? `Completed · ${dayLabel(log.record.date)}`
                      : log.state === "in-progress"
                        ? "In progress"
                        : `Skipped · ${dayLabel(log.record.date)}`}
                  </Label>
                  {log.state === "skipped" ? (
                    <Button
                      title="Restore session"
                      secondary
                      onPress={() =>
                        mutate(() => restoreProgramSession(r, log.record.id))
                      }
                    />
                  ) : (
                    log.state === "completed" && (
                      <Button
                        title="Review workout"
                        secondary
                        onPress={() =>
                          router.push({
                            pathname: "/workout",
                            params: { id: log.data.workoutId },
                          })
                        }
                      />
                    )
                  )}
                </Card>
              );
            })}
        </>
      )}
      <Row>
        {program && (
          <Button title="Program details" secondary onPress={onDetails} />
        )}
        <Button title="Browse programs" secondary onPress={onBrowse} />
      </Row>
      {!progress.complete && (
        <Button
          title="End program"
          danger
          onPress={() =>
            confirm(
              "End this program?",
              "It is archived. Every recorded workout stays in your history.",
              () => endProgram(r, enrollment.record.id),
            )
          }
        />
      )}
    </>
  );
}
const ALL = "All";

// Development builds only: preview draft programs through the real details,
// enrollment and workout flow. Never rendered in production bundles.
function DraftPreview({
  onSelect,
}: {
  onSelect: (program: CuratedProgram) => void;
}) {
  const [open, setOpen] = useState(false);
  const drafts = programLibrary.filter((p) => p.status === "draft");
  if (!drafts.length) return null;
  return (
    <Card>
      <Label muted size={11}>
        DEVELOPMENT BUILD ONLY
      </Label>
      <Label muted size={13}>
        Draft programs are hidden from users. Preview them here to test
        enrollment and workouts on this device.
      </Label>
      <Button
        title={
          open
            ? "Hide draft programs"
            : `Preview draft programs (${drafts.length})`
        }
        secondary
        onPress={() => setOpen(!open)}
      />
      {open &&
        drafts.map((program) => (
          <View key={`${program.id}@${program.version}`} style={{ gap: 4 }}>
            <Label bold>{program.name}</Label>
            <Label muted size={13}>
              {programMeta(program)}
            </Label>
            <Button
              title={`Preview draft ${program.name}`}
              secondary
              onPress={() => onSelect(program)}
            />
          </View>
        ))}
    </Card>
  );
}
export default function ForgePaths() {
  const r = useRepo();
  const profile = r.profile();
  const enrollment = currentEnrollment(r);
  const [selected, setSelected] = useState<CuratedProgram>();
  const [browse, setBrowse] = useState(!enrollment);
  const [experience, setExperience] = useState(ALL);
  const [goal, setGoal] = useState(ALL);
  const published = libraryPrograms();
  const recommendation = recommendProgram(profile, programLibrary);
  const filtered = published.filter(
    (p) =>
      (experience === ALL || p.experience === experience) &&
      (goal === ALL || p.goal === goal),
  );
  return (
    <Screen
      key={selected ? `${selected.id}@${selected.version}` : "home"}
      title="FORGE PATHS"
      eyebrow="FORGE RECOMMENDS. YOU DECIDE."
    >
      <Button
        title="Back to Train"
        secondary
        onPress={() => router.replace("/(tabs)/train")}
      />
      {selected ? (
        <ProgramDetails
          r={r}
          program={selected}
          onBack={() => setSelected(undefined)}
          onStarted={() => {
            setSelected(undefined);
            setBrowse(false);
          }}
        />
      ) : (
        <>
          {enrollment && (
            <ProgramDashboard
              r={r}
              enrollment={enrollment}
              onDetails={() => setSelected(enrollment.program)}
              onBrowse={() => setBrowse(true)}
            />
          )}
          {(!enrollment || browse) && (
            <>
              <SectionHeader title="Recommended for you" />
              {recommendation.kind === "incomplete" ? (
                <Card>
                  <Label bold size={20}>
                    Tell Forge where you are
                  </Label>
                  <Label muted>
                    Choose your training experience and goal to get a program
                    recommendation. You can browse every program either way.
                  </Label>
                  <Button
                    title="Complete training profile"
                    secondary
                    icon="create-outline"
                    onPress={() => router.push("/(tabs)/profile")}
                  />
                </Card>
              ) : recommendation.kind === "none" ? (
                <Card>
                  <Label bold size={20}>
                    No match yet
                  </Label>
                  <Label muted>
                    No published program is written for{" "}
                    {recommendation.experience.toLowerCase()} lifters training
                    for {recommendation.goal.toLowerCase()} yet.
                    {published.length
                      ? " Explore the library below and choose any program."
                      : ""}
                  </Label>
                </Card>
              ) : (
                <Card>
                  <Label muted size={11}>
                    RECOMMENDED FOR YOU
                  </Label>
                  <Label bold size={24}>
                    {recommendation.program.name}
                  </Label>
                  <Label bold>{recommendation.program.summary}</Label>
                  <Label muted size={13}>
                    {programMeta(recommendation.program)}
                  </Label>
                  {recommendation.reasons.map((reason) => (
                    <Label key={reason} size={13}>
                      ✓ {reason}
                    </Label>
                  ))}
                  <Button
                    title="View program"
                    onPress={() => setSelected(recommendation.program)}
                  />
                </Card>
              )}
              <SectionHeader
                title="Program library"
                detail={`${published.length} published ${published.length === 1 ? "program" : "programs"} · every program is written and reviewed by hand`}
              />
              {published.length ? (
                <>
                  <Chips
                    values={[ALL, "Beginner", "Intermediate", "Advanced"]}
                    value={experience}
                    onChange={setExperience}
                  />
                  <Chips
                    values={[ALL, "Strength", "Muscle Building"]}
                    value={goal}
                    onChange={setGoal}
                  />
                  {filtered.map((program) => (
                    <Card key={program.id}>
                      <Label bold size={20}>
                        {program.name}
                      </Label>
                      <Label>{program.summary}</Label>
                      <Label muted size={13}>
                        {programMeta(program)}
                      </Label>
                      <Button
                        title={`View ${program.name}`}
                        secondary
                        onPress={() => setSelected(program)}
                      />
                    </Card>
                  ))}
                  {!filtered.length && (
                    <Label muted>No programs match these filters.</Label>
                  )}
                </>
              ) : (
                <Empty
                  title="Programs are on the way"
                  detail="Forge programs are written and reviewed by hand. None are published yet — your workouts, templates and generated Paths keep working in the meantime."
                />
              )}
              {draftPreviewEnabled && (
                <DraftPreview onSelect={(program) => setSelected(program)} />
              )}
            </>
          )}
          <SectionHeader
            title="Generated Paths"
            detail="The earlier automatic plan builder stays available during the transition."
          />
          <PathSummary />
          <Button
            title="Open the Path builder"
            secondary
            icon="construct-outline"
            onPress={() => router.push("/paths")}
          />
        </>
      )}
    </Screen>
  );
}
