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
  Chips,
  Sheet,
  ProgressBar,
  useColors,
} from "../components/ui";
import { PathWorkoutList } from "../components/PathWorkoutList";
import { PathDayEditor, PlanPreview } from "../components/PathPlanEditor";
import { SectionHeader } from "../components/design";
import { useRepo, mutate, confirm } from "../state";
import { Alert } from "../platform/alert";
import { forgePaths } from "../domain/paths/catalog";
import {
  ENGINE_VERSION,
  generatePath,
  structure,
  type PathDraft,
  type PathDay,
} from "../domain/paths/generator";
import {
  equipmentOptions,
  expandEquipment,
  movementOptions,
  priorityOptions,
  defaultWeekdays,
  weekdayNames,
  addDays,
  type PathPreferences,
  type PathDefinition,
} from "../domain/paths/model";
import {
  acceptPath,
  currentPath,
  pathPrograms,
  pathSummary,
  savedDraft,
  editPathDay,
  pausePath,
  resumePath,
  startPathSession,
  reschedulePathSession,
  skipPathSession,
  workloadGuidance,
  type PathSession,
} from "../data/paths";
import { localDate, type Prescription } from "../domain/types";
import {
  calendarWeek,
  weekDates,
  weekIntention,
  weekFocus,
} from "../domain/paths/calendar";
import { workloadReview, trainingGuidance } from "../domain/paths/review";
import { auditWeek } from "../domain/paths/weekAudit";
import { assessProgram, programErrors } from "../domain/paths/programQuality";
import { stallGuidance } from "../domain/paths/policy";

const workingSets = (items: Prescription[]) =>
  items.reduce((n, e) => n + e.sets, 0);

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((x) => x !== value)
    : [...values, value];
}
function pathSchedule(
  path: PathDefinition,
  frequency: number,
  weekdays: number[],
  experience: PathPreferences["experience"],
) {
  if (frequency >= path.minDays && frequency <= path.maxDays)
    return { frequency, weekdays };
  const fallback =
    experience === "Beginner" ? Math.min(3, path.frequency) : path.frequency;
  const validFrequency = Math.max(
    path.minDays,
    Math.min(path.maxDays, fallback),
  );
  return {
    frequency: validFrequency,
    weekdays: defaultWeekdays(validFrequency),
  };
}
function ChoiceList<T extends string | number>({
  label,
  values,
  selected,
  onChange,
  names,
}: {
  label: string;
  values: readonly T[];
  selected: T[];
  onChange: (values: T[]) => void;
  names?: readonly string[];
}) {
  return (
    <View style={{ gap: 8 }}>
      <Label bold>{label}</Label>
      <Row>
        {values.map((value, i) => (
          <Button
            key={value}
            title={`${selected.includes(value) ? "✓ " : ""}${names?.[i] ?? value}`}
            secondary={!selected.includes(value)}
            onPress={() => onChange(toggle(selected, value))}
          />
        ))}
      </Row>
    </View>
  );
}

export { PathDayEditor };

export default function Paths() {
  const r = useRepo();
  const colors = useColors();
  const [details, setDetails] = useState(false);
  const [manage, setManage] = useState(false);
  const [sessionActions, setSessionActions] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string>();
  const [selectedDate, setSelectedDate] = useState<string>();
  const params = useLocalSearchParams<{ programId?: string; week?: string }>();
  const active = currentPath(r);
  const [view, setView] = useState<
    "discover" | "setup" | "preview" | "dashboard"
  >(active || params.programId ? "dashboard" : "discover");
  const [selectedId, setSelectedId] = useState<string | undefined>(
    params.programId,
  );
  const selected =
    pathPrograms(r).find((p) => p.record.id === selectedId) ?? active;
  const stats = selected ? pathSummary(r, selected) : undefined;
  // Earlier-engine plans remain usable; imbalance is surfaced, not enforced.
  const savedIssues =
    selected && selected.data.engineVersion < 7
      ? auditWeek(savedDraft(r, selected).days)
      : [];
  const guidance =
    selected && selected.data.status !== "archived"
      ? workloadGuidance(r, selected)
      : undefined;
  const sessionName = (index: number, fallback: string) =>
    selected?.data.engineVersion === 1
      ? (structure(selected.data.preferences)[index]?.name ?? fallback)
      : fallback;
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
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<PathPreferences>();
  const [draft, setDraft] = useState<PathDraft>();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ index: number; day: PathDay }>();
  const [moving, setMoving] = useState<PathSession>();
  const [moveDate, setMoveDate] = useState(localDate());
  const catalog = r.exercises();
  const template = session
    ? r.templates().find((t) => t.id === session.data.templateId)
    : undefined;
  const reviewDraft =
    view === "preview"
      ? draft
      : details && selected
        ? savedDraft(r, selected)
        : undefined;
  const review = reviewDraft ? workloadReview(reviewDraft, catalog) : undefined;
  const previewFindings =
    view === "preview" && draft ? assessProgram(draft, catalog) : [];
  // Live findings while editing a saved current-engine day; earlier engines
  // keep their own saved-plan rules.
  const editFindings =
    editing && selected && selected.data.engineVersion >= ENGINE_VERSION
      ? assessProgram(
          {
            preferences: selected.data.preferences,
            days: savedDraft(r, selected).days.map((d, i) =>
              i === editing.index ? editing.day : d,
            ),
          },
          catalog,
        )
      : [];
  const definition = forgePaths.find((p) => p.key === preferences?.pathKey);
  const today = localDate();
  const startChoices = [
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
  function choose(path: PathDefinition) {
    const p = r.profile();
    const experience = ["Beginner", "Intermediate", "Advanced"].includes(
      p.experience,
    )
      ? (p.experience as PathPreferences["experience"])
      : "Beginner";
    const previous = preferences ?? selected?.data.preferences;
    const schedule = pathSchedule(
      path,
      previous?.frequency ?? 0,
      previous?.weekdays ?? [],
      experience,
    );
    setPreferences({
      pathKey: path.key,
      experience,
      ...schedule,
      equipment: expandEquipment([
        ...equipmentOptions.filter((e) =>
          p.equipment.toLowerCase().includes(e.toLowerCase()),
        ),
        ...(p.equipment.toLowerCase().includes("full gym")
          ? (["Full gym machines"] as const)
          : []),
      ]),
      gymAccess: /gym|machine|cable/i.test(p.equipment),
      excluded: [],
      avoidPatterns: [],
      limitations: "",
      priorities: [],
      style: "Balanced",
      startDate: localDate(),
    });
    setQuery("");
    setStep(0);
    setView("setup");
    setDraft(undefined);
  }
  function patch(patch: Partial<PathPreferences>) {
    setPreferences((p) => (p ? { ...p, ...patch } : p));
  }
  function preview() {
    try {
      const result = generatePath(preferences!, catalog);
      setDraft(result);
      setView("preview");
    } catch (error) {
      Alert.alert(
        "Adjust your plan",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  function start(session: PathSession) {
    const workout = mutate(() => startPathSession(r, session.record.id));
    if (workout) router.push("/workout");
  }
  return (
    <Screen
      key={view}
      title="FORGE PATHS"
      eyebrow="CHOOSE YOUR GOAL. FORGE YOUR PATH."
    >
      <Button
        title="Back to Train"
        secondary
        onPress={() => router.replace("/(tabs)/train")}
      />
      {view !== "dashboard" && active && (
        <Button
          title="Return to current Path"
          secondary
          onPress={() => {
            setSelectedId(active.record.id);
            setWeek(
              calendarWeek(
                active.data.started,
                pathSummary(r, active).next?.record.date ?? active.data.started,
              ),
            );
            setSelectedDate(undefined);
            setView("dashboard");
          }}
        />
      )}

      {view === "discover" && (
        <>
          <Label size={24} bold>
            A clear next step.
          </Label>
          <Label muted>
            Choose a goal. Preview your eight-week plan before anything is added
            to your calendar.
          </Label>
          {forgePaths.map((path) => (
            <Card key={path.key}>
              <Label bold size={24}>
                {path.name}
              </Label>
              <Label bold>{path.subtitle}</Label>
              <Label muted>{path.description}</Label>
              <Label muted size={13}>
                {path.experience} · {path.minDays}–{path.maxDays} days / week ·
                8 weeks
              </Label>
              <Label size={13}>{path.muscles}</Label>
              <Label muted size={13}>
                {path.benefits}
              </Label>
              <Label muted size={12}>
                Equipment: {path.equipment}
              </Label>
              <Button
                title={`Choose ${path.name}`}
                onPress={() => choose(path)}
              />
            </Card>
          ))}
          {pathPrograms(r)
            .filter((p) => p.data.status === "archived")
            .map((p) => (
              <Button
                key={p.record.id}
                title={`Review ${p.data.name} · ${p.data.started}`}
                secondary
                onPress={() => {
                  setSelectedId(p.record.id);
                  setWeek(1);
                  setSelectedDate(undefined);
                  setView("dashboard");
                }}
              />
            ))}
        </>
      )}

      {view === "setup" && preferences && (
        <>
          <SectionHeader
            title={definition!.name}
            detail={`${definition!.objective} · Step ${step + 1} of 3`}
          />
          <ProgressBar
            value={(step + 1) / 3}
            label="Path personalization progress"
          />
          {step === 0 && (
            <Card>
              <Label bold>Your training rhythm</Label>
              <Label muted>Experience</Label>
              <Chips
                values={["Beginner", "Intermediate", "Advanced"]}
                value={preferences.experience}
                onChange={(experience) =>
                  patch({
                    experience: experience as PathPreferences["experience"],
                  })
                }
              />
              <Label muted>
                Training days per week · choose a recoverable schedule
              </Label>
              <Chips
                values={Array.from(
                  { length: definition!.maxDays - definition!.minDays + 1 },
                  (_, index) => String(definition!.minDays + index),
                )}
                value={String(preferences.frequency)}
                onChange={(v) =>
                  patch({
                    frequency: Number(v),
                    weekdays: defaultWeekdays(Number(v)),
                  })
                }
              />
              <ChoiceList
                label={`Available weekdays · ${preferences.weekdays.length} / ${preferences.frequency} selected`}
                values={[0, 1, 2, 3, 4, 5, 6]}
                selected={preferences.weekdays}
                names={weekdayNames}
                onChange={(weekdays) => patch({ weekdays })}
              />
              <Label muted>Start</Label>
              <Chips
                values={startChoices.map((c) => c.label)}
                value={
                  startChoices.find((c) => c.date === preferences.startDate)
                    ?.label ?? ""
                }
                onChange={(label) =>
                  patch({
                    startDate: startChoices.find((c) => c.label === label)!
                      .date,
                  })
                }
              />
              <Field
                label="Path start date (YYYY-MM-DD)"
                value={preferences.startDate}
                onChangeText={(startDate) => patch({ startDate })}
              />
            </Card>
          )}
          {step === 1 && (
            <Card>
              <Label bold>Your training space</Label>
              <Chips
                values={["Home / limited equipment", "Gym access"]}
                value={
                  preferences.gymAccess
                    ? "Gym access"
                    : "Home / limited equipment"
                }
                onChange={(v) =>
                  patch({
                    gymAccess: v === "Gym access",
                    equipment:
                      v === "Gym access"
                        ? [...equipmentOptions]
                        : preferences.equipment,
                  })
                }
              />
              <ChoiceList
                label="Available equipment"
                values={equipmentOptions}
                selected={expandEquipment(preferences.equipment)}
                names={equipmentOptions.map(
                  (e) =>
                    (
                      ({
                        Dumbbell: "Dumbbells",
                        Barbell: "Barbell & plates",
                        Kettlebell: "Kettlebells",
                        Cable: "Cable station",
                        "Resistance band": "Resistance bands",
                        "Band anchor": "Secure band anchor",
                      }) as Record<string, string>
                    )[e] ?? e,
                )}
                onChange={(equipment) => patch({ equipment })}
              />
              <Label muted size={13}>
                Gym access selects all equipment; deselect anything your gym
                lacks. Bodyweight and floor space are assumed. Bands need a
                secure anchor for face pulls and pushdowns. Select only
                equipment you can actually use.
              </Label>
              <Label bold>Exercises to exclude</Label>
              <Field
                label="Find an exercise to exclude"
                value={query}
                onChangeText={setQuery}
                placeholder="Search by exercise name"
              />
              {query.trim().length >= 2 &&
                catalog
                  .filter((e) =>
                    e.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .slice(0, 8)
                  .map((e) => (
                    <Button
                      key={e.id}
                      title={`${preferences.excluded.includes(e.id) ? "Restore" : "Exclude"} ${e.name}`}
                      secondary
                      onPress={() =>
                        patch({ excluded: toggle(preferences.excluded, e.id) })
                      }
                    />
                  ))}
              {preferences.excluded.map((id) => (
                <Button
                  key={id}
                  title={`Remove exclusion: ${catalog.find((e) => e.id === id)?.name ?? id}`}
                  secondary
                  onPress={() =>
                    patch({ excluded: toggle(preferences.excluded, id) })
                  }
                />
              ))}
            </Card>
          )}
          {step === 2 && (
            <Card>
              <ChoiceList
                label="Movements to avoid"
                values={movementOptions}
                selected={preferences.avoidPatterns}
                onChange={(avoidPatterns) => patch({ avoidPatterns })}
              />
              <Field
                label="Training limitations or comfort notes (optional)"
                value={preferences.limitations}
                onChangeText={(limitations) => patch({ limitations })}
                multiline
                maxLength={500}
              />
              <Label muted size={13}>
                Notes are stored, not medically interpreted. Use the exclusions
                above to change exercise selection. For significant injuries or
                restrictions, seek qualified professional guidance.
              </Label>
              <ChoiceList
                label="Muscle priorities · choose up to two"
                values={priorityOptions}
                selected={preferences.priorities}
                onChange={(priorities) =>
                  patch({ priorities: priorities.slice(-2) })
                }
              />
              <Label muted>Optional training style</Label>
              <Chips
                values={["Balanced", "Free weights", "Machines"]}
                value={preferences.style}
                onChange={(style) =>
                  patch({ style: style as PathPreferences["style"] })
                }
              />
              <Label muted size={13}>
                Preferences rank compatible movements; equipment and movement
                exclusions always take precedence.
              </Label>
            </Card>
          )}
          <Row>
            <Button
              title={step === 0 ? "Browse Paths" : "Previous step"}
              secondary
              onPress={() =>
                step === 0 ? setView("discover") : setStep(step - 1)
              }
            />
            <Button
              title={step === 2 ? "Preview my eight-week plan" : "Next step"}
              onPress={() => (step === 2 ? preview() : setStep(step + 1))}
            />
          </Row>
        </>
      )}

      {view === "preview" && draft && (
        <PlanPreview
          draft={draft}
          catalog={catalog}
          pathName={definition!.name}
          findings={previewFindings}
          detailsTitle={
            review?.warnings.length ||
            review?.balance.diagnostics.some(
              (item) => item.kind !== "intentional",
            )
              ? "Review coverage & adjustments"
              : "Why this plan?"
          }
          onChange={setDraft}
          onDetails={() => setDetails(true)}
          onBack={() => {
            setStep(0);
            setView("setup");
          }}
          onStart={() =>
            confirm(
              active
                ? "Replace your current Path?"
                : "Start this eight-week Path?",
              active
                ? "Your previous Path will be archived. Its calendar and every recorded workout are preserved. This adds the previewed plan to your calendar."
                : "This saves the previewed workouts and all eight weeks to your calendar. Your existing workouts are preserved.",
              () => {
                const record = mutate(() => acceptPath(r, draft, !!active));
                if (!record) return;
                setSelectedId(record.id);
                setSelectedDate(undefined);
                setWeek(1);
                setView("dashboard");
              },
            )
          }
        />
      )}

      {view === "dashboard" &&
        (!selected || !stats ? (
          <Card>
            <Label>No saved Path found.</Label>
            <Button
              title="Browse Forge Paths"
              onPress={() => setView("discover")}
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
                    ? "Archived"
                    : stats.complete
                      ? "Cycle complete"
                      : `Week ${stats.week} · ${stats.phase.name}`}
              </Label>
              <ProgressBar
                value={stats.ratio}
                label="Eight-week Path completion"
              />
              <Label muted size={12}>
                {stats.completed} / {stats.expected} workouts completed
              </Label>
            </View>
            {selected.data.status !== "archived" && savedIssues.length > 0 && (
              <Card>
                <Label bold>Unbalanced training days</Label>
                <Label muted size={13}>
                  {savedIssues[0]!.message} This plan was built before balanced
                  weeks were required. Rebuild it from Manage Path; recorded
                  workouts are kept.
                </Label>
              </Card>
            )}
            {guidance && (
              <Card>
                <Label bold>Workload check</Label>
                <Label muted size={13}>
                  {guidance.message}
                </Label>
              </Card>
            )}
            {selectedDate && !session ? (
              <Card>
                <Label bold size={23}>
                  Rest day
                </Label>
                <Label muted>Rest day · {selectedDate}</Label>
                <Label muted size={13}>
                  Recover. Your next session is on the calendar.
                </Label>
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
                  {sessionName(session.data.dayIndex, session.data.name)}
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
                    title={`Review ${sessionName(session.data.dayIndex, session.data.name)}`}
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
                        The previous workout link is unavailable. Starting
                        creates a new workout.
                      </Label>
                    )}
                  </>
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="← Previous week"
                  accessibilityState={{ disabled: week <= 1 }}
                  disabled={week <= 1}
                  onPress={() => {
                    setWeek(week - 1);
                    setSelectedDate(undefined);
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.elevated,
                    opacity: week <= 1 ? 0.35 : 1,
                  }}
                >
                  <Label size={26}>←</Label>
                </Pressable>
                <Label bold size={20}>
                  Calendar week {week}
                </Label>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next week →"
                  accessibilityState={{ disabled: week >= lastCalendarWeek }}
                  disabled={week >= lastCalendarWeek}
                  onPress={() => {
                    setWeek(week + 1);
                    setSelectedDate(undefined);
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.elevated,
                    opacity: week >= lastCalendarWeek ? 0.35 : 1,
                  }}
                >
                  <Label size={26}>→</Label>
                </Pressable>
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

            {session && (
              <Card>
                {!["completed", "in-progress"].includes(session.state) && (
                  <>
                    <Label bold>Your exercises</Label>
                    <Label muted size={12}>
                      {selected.data.pathKey === "get-strong" ||
                      selected.data.pathKey === "athlete-mode" ||
                      selected.data.pathKey === "start-strong"
                        ? "Warm up first · keep 2–3 clean reps in reserve"
                        : "Warm up first · keep 1–3 clean reps in reserve"}
                    </Label>
                    <PathWorkoutList
                      items={template?.exercises ?? []}
                      catalog={catalog}
                    />
                  </>
                )}
                <Button
                  title="Workout options"
                  secondary
                  onPress={() => setSessionActions(true)}
                />
              </Card>
            )}
            {r.active() && session?.state !== "in-progress" && (
              <Button
                title="Resume current workout"
                secondary
                onPress={() => router.push("/workout")}
              />
            )}
            <Row>
              <Button
                title="Plan details"
                secondary
                onPress={() => setDetails(true)}
              />
              <Button
                title="Manage Path"
                secondary
                onPress={() => setManage(true)}
              />
            </Row>
          </>
        ))}

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
              <>
                {selected.data.days.map((day, index) => (
                  <Button
                    key={day.key}
                    title={`Edit plan: ${sessionName(index, day.name)}`}
                    secondary
                    onPress={() => {
                      setManage(false);
                      setEditing({
                        index,
                        day: {
                          ...savedDraft(r, selected).days[index]!,
                          name: sessionName(index, day.name),
                        },
                      });
                    }}
                  />
                ))}
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

                <Button
                  title="Rebuild this Path"
                  secondary
                  onPress={() => {
                    const definition = forgePaths.find(
                      (p) => p.key === selected.data.pathKey,
                    )!;
                    setPreferences({
                      ...selected.data.preferences,
                      ...pathSchedule(
                        definition,
                        selected.data.preferences.frequency,
                        selected.data.preferences.weekdays,
                        selected.data.preferences.experience,
                      ),
                      startDate: localDate(),
                    });
                    setManage(false);
                    setStep(0);
                    setView("setup");
                    setDraft(undefined);
                  }}
                />
              </>
            )}
            <Button
              title="Browse or change Path"
              secondary
              onPress={() => {
                setManage(false);
                setView("discover");
              }}
            />
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
            <Label bold>
              {sessionName(session.data.dayIndex, session.data.name)}
            </Label>
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
            {selected.data.status !== "archived" &&
              !["completed", "in-progress"].includes(session.state) && (
                <>
                  <Button
                    title={`Move ${sessionName(session.data.dayIndex, session.data.name)}`}
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
                    title={`${session.data.skipped ? "Restore" : "Skip"} ${sessionName(session.data.dayIndex, session.data.name)}`}
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
                  <Button
                    title="Edit this workout"
                    secondary
                    onPress={() => {
                      setSessionActions(false);
                      setEditing({
                        index: session.data.dayIndex,
                        day: savedDraft(r, selected).days[
                          session.data.dayIndex
                        ]!,
                      });
                    }}
                  />
                </>
              )}
          </>
        )}
      </Sheet>
      <Sheet
        visible={details}
        onClose={() => setDetails(false)}
        title="Your training plan"
      >
        {reviewDraft && review && (
          <>
            {selected &&
              selected.data.engineVersion < ENGINE_VERSION &&
              view !== "preview" && (
                <Label muted>
                  This saved plan uses an earlier planner. Use Manage Path →
                  Rebuild this Path to preview the current evidence-based
                  programming. Logged workouts stay unchanged.
                </Label>
              )}
            <Label bold>Foundation · Weeks 1–4</Label>
            <Label bold>Evolution · Weeks 5–8</Label>
            <Label muted>
              Exercises stay consistent across both phases. No automatic
              rotation.
            </Label>
            <Label>{trainingGuidance(reviewDraft.preferences.pathKey)}</Label>
            <Label bold>How progression works</Label>
            <Label muted size={13}>
              Each exercise has a rep range and an effort target. Keep one load
              for all working sets and add reps across sessions. When every set
              reaches the top of the range at the target effort, add the
              smallest available load and build back up.
            </Label>
            <Label muted size={13}>
              {stallGuidance}
            </Label>
            <Label muted>{weekIntention(trainingWeeks[0] ?? 1)}</Label>
            <Label bold>Weekly session balance</Label>
            <Label muted size={12}>
              Every training day stays within two exercises of the others, and
              no day carries twice the exercises or working-set load of another.
              Heavy compound sets count for more than light ones.
            </Label>
            {review.balance.sessions.map((session) => (
              <Label key={session.key} size={13}>
                {session.name}: {session.exerciseCount} exercises ·{" "}
                {session.workingSets} sets
                {" · "}
                {session.purpose}
              </Label>
            ))}
            {review.balance.issues.map((item, index) => (
              <Label key={`issue-${index}`} bold size={12}>
                {item.message}
              </Label>
            ))}
            {review.balance.diagnostics
              .filter(
                (item) =>
                  item.kind !== "intentional" || item.dayKeys.length > 1,
              )
              .map((item, index) => (
                <Label key={index} muted size={12}>
                  {item.message}
                </Label>
              ))}
            <Label bold>Weekly muscle coverage</Label>
            <Label muted size={12}>
              Direct sets are exercises aimed at that muscle and are what the
              weekly targets count. Compound lifts that also train a muscle
              (such as glutes in a squat) are shown as secondary; Forge
              estimates them at half a set each for its fatigue ceilings. That
              is a planning convention, not a measured conversion. Supporting
              work (for example triceps in a press) is listed for context only.
              Weekly total counts each set once.
            </Label>
            {Array.from(
              new Set([
                ...Object.keys(review.sets),
                ...Object.keys(review.secondary),
                ...Object.keys(review.assistance),
              ]),
            ).map((muscle) => (
              <Label key={muscle}>
                {muscle}: {review.sets[muscle] ?? 0} direct
                {review.secondary[muscle]
                  ? ` · ${review.secondary[muscle]} secondary`
                  : ""}
                {review.assistance[muscle]
                  ? ` · ${review.assistance[muscle]} supporting`
                  : ""}
              </Label>
            ))}
            {review.warnings.map((w) => (
              <Label key={w} muted>
                {w}
              </Label>
            ))}
            <Label bold>Why these exercises?</Label>
            <PathWorkoutList
              items={
                view === "preview"
                  ? (reviewDraft.days
                      .flatMap((d) => d.exercises)
                      .filter(
                        (e, i, all) =>
                          all.findIndex(
                            (x) => x.exerciseId === e.exerciseId,
                          ) === i,
                      ) ?? [])
                  : (template?.exercises ?? [])
              }
              catalog={catalog}
              explain
            />
            <Label muted>
              Load fields start at zero. Choose your own working load.
              Repetitions are per side for single-arm, single-leg and
              alternating core movements. Warm-up sets are additional to the
              listed working sets; allow extra preparation for heavy lifts.
            </Label>
          </>
        )}
      </Sheet>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(undefined)}
        title="Edit your Path workout"
      >
        {editing && selected && (
          <>
            <PathDayEditor
              day={editing.day}
              preferences={selected.data.preferences}
              catalog={catalog}
              findings={editFindings}
              onChange={(day) => setEditing({ ...editing, day })}
            />
            <Button
              title="Save Path workout"
              disabled={programErrors(editFindings).length > 0}
              onPress={() =>
                confirm(
                  "Save this workout for future starts?",
                  "Both phases use this prescription. Existing recorded sets and any active workout are preserved.",
                  () => {
                    let saved = false;
                    mutate(() => {
                      editPathDay(
                        r,
                        selected.record.id,
                        editing.index,
                        editing.day.exercises,
                      );
                      saved = true;
                    });
                    if (saved) setEditing(undefined);
                  },
                )
              }
            />
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
