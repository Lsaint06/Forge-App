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
  NumberField,
  Sheet,
  ProgressBar,
  useColors,
} from "../components/ui";
import { SectionHeader } from "../components/design";
import { useRepo, mutate, confirm } from "../state";
import { Alert } from "../platform/alert";
import { forgePaths } from "../domain/paths/catalog";
import {
  generatePath,
  compatibleMovements,
  estimatedMinutes,
  roleReasons,
  structure,
  type PathDraft,
  type PathDay,
} from "../domain/paths/generator";
import {
  equipmentOptions,
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
  type PathSession,
} from "../data/paths";
import { localDate, type Exercise, type Prescription } from "../domain/types";
import {
  calendarWeek,
  weekDates,
  weekIntention,
} from "../domain/paths/calendar";
import { workloadReview, trainingGuidance } from "../domain/paths/review";
import { kgToLb, lbToKg } from "../domain/metrics";

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((x) => x !== value)
    : [...values, value];
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

export function PathDayEditor({
  day,
  preferences,
  catalog,
  onChange,
}: {
  day: PathDay;
  preferences: PathPreferences;
  catalog: Exercise[];
  onChange: (day: PathDay) => void;
}) {
  const units = useRepo().profile().units;
  const [choosing, setChoosing] = useState<number>();
  function update(index: number, patch: Partial<Prescription>) {
    onChange({
      ...day,
      exercises: day.exercises.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    });
  }
  return (
    <View style={{ gap: 16 }}>
      <Label bold size={22}>
        {day.name}
      </Label>
      <Label muted>
        {estimatedMinutes(day.exercises)} min estimated · including rests and a
        short warmup
      </Label>
      {day.exercises.map((item, index) => (
        <Card key={`${day.key}-${index}`}>
          <Label bold size={18}>
            {catalog.find((e) => e.id === item.exerciseId)?.name ??
              "Movement unavailable"}
          </Label>
          <Label muted size={13}>
            {roleReasons[day.roles[index]!]}
          </Label>
          <Button
            title={
              choosing === index
                ? "Close movement choices"
                : `Change movement ${index + 1}`
            }
            secondary
            onPress={() => setChoosing(choosing === index ? undefined : index)}
          />
          {choosing === index &&
            compatibleMovements(preferences, day.roles[index]!, catalog)
              .filter(
                (move) =>
                  !day.exercises.some(
                    (e, i) => i !== index && e.exerciseId === move.id,
                  ),
              )
              .map((move) => (
                <Button
                  key={move.id}
                  title={`Choose ${catalog.find((e) => e.id === move.id)!.name}`}
                  secondary
                  onPress={() => {
                    update(index, { exerciseId: move.id });
                    setChoosing(undefined);
                  }}
                />
              ))}
          <Row>
            <NumberField
              label={`${day.name} exercise ${index + 1} sets`}
              value={item.sets}
              integer
              min={1}
              max={5}
              onSave={(sets) => update(index, { sets: sets! })}
            />
            <NumberField
              label={`${day.name} exercise ${index + 1} reps`}
              value={item.reps}
              integer
              min={1}
              max={20}
              onSave={(reps) => update(index, { reps: reps! })}
            />
            <NumberField
              label={`${day.name} exercise ${index + 1} load (${units})`}
              value={units === "lb" ? kgToLb(item.weight) : item.weight}
              min={0}
              max={units === "lb" ? kgToLb(2000) : 2000}
              onSave={(weight) =>
                update(index, {
                  weight: units === "lb" ? lbToKg(weight!) : weight!,
                })
              }
            />
            <NumberField
              label={`${day.name} exercise ${index + 1} rest (seconds)`}
              value={item.rest}
              integer
              min={45}
              max={3600}
              onSave={(rest) => update(index, { rest: rest! })}
            />
          </Row>
        </Card>
      ))}
    </View>
  );
}

export default function Paths() {
  const r = useRepo();
  const colors = useColors();
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
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<PathPreferences>();
  const [draft, setDraft] = useState<PathDraft>();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const [editing, setEditing] = useState<{ index: number; day: PathDay }>();
  const [moving, setMoving] = useState<PathSession>();
  const [moveDate, setMoveDate] = useState(localDate());
  const catalog = r.exercises();
  const definition = forgePaths.find((p) => p.key === preferences?.pathKey);
  function choose(path: PathDefinition) {
    const p = r.profile();
    const experience = ["Beginner", "Intermediate", "Advanced"].includes(
      p.experience,
    )
      ? (p.experience as PathPreferences["experience"])
      : "Beginner";
    const frequency =
      experience === "Beginner" ? Math.min(3, path.frequency) : path.frequency;
    setPreferences({
      pathKey: path.key,
      experience,
      frequency,
      duration: path.duration,
      equipment: equipmentOptions.filter((e) =>
        p.equipment.toLowerCase().includes(e.toLowerCase()),
      ),
      gymAccess: /gym|machine|cable/i.test(p.equipment),
      excluded: [],
      avoidPatterns: [],
      limitations: "",
      priorities: [],
      style: "Balanced",
      startDate: localDate(),
      weekdays: defaultWeekdays(frequency),
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
      setExpanded(result.days[0]?.key);
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
                around {path.duration} min · 8 weeks
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
                values={["1", "2", "3", "4", "5", "6"]}
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
              <Label muted>Preferred minutes per workout</Label>
              <Chips
                values={["30", "45", "60", "75", "90"]}
                value={String(preferences.duration)}
                onChange={(v) => patch({ duration: Number(v) })}
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
                onChange={(v) => patch({ gymAccess: v === "Gym access" })}
              />
              <ChoiceList
                label="Available equipment"
                values={equipmentOptions}
                selected={preferences.equipment}
                onChange={(equipment) => patch({ equipment })}
              />
              <Label muted size={13}>
                Bodyweight and floor space are assumed. Full gym machines means
                chest press, leg press and leg curl stations. Bands need a
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
        <>
          <SectionHeader
            title="Your plan, before you commit."
            detail={definition!.name}
          />
          <Card>
            <Label bold>Eight weeks. Two phases. Your choices.</Label>
            <Label>Weeks 1–4 · Foundation</Label>
            <Label>Weeks 5–8 · Evolution</Label>
            <Label muted>
              The exercises you accept stay consistent through both phases in
              this cycle. Nothing swaps automatically.
            </Label>
            <Label muted>
              {draft.preferences.frequency} sessions / week ·{" "}
              {draft.preferences.frequency * 8} scheduled sessions · starts{" "}
              {draft.preferences.startDate}
            </Label>
            <Label>{trainingGuidance(draft.preferences.pathKey)}</Label>
            <Label bold>
              Weekly working sets · {workloadReview(draft, catalog).total} total
            </Label>
            <Label muted>
              {Object.entries(workloadReview(draft, catalog).sets)
                .map(([muscle, sets]) => `${muscle}: ${sets}`)
                .join(" · ")}
            </Label>
            <Label muted size={13}>
              Primary targets only; assistance from compound lifts is not
              counted again. These are starting prescriptions, not a promise of
              an optimal dose.
            </Label>
            {workloadReview(draft, catalog).warnings.map((warning) => (
              <Label key={warning} muted>
                {warning}
              </Label>
            ))}
            <Label muted size={13}>
              For single-leg, single-arm and alternating core movements, the
              target is per side. Complete both sides with control.
            </Label>
            <Label muted size={13}>
              Time estimates include rests and a short warmup. Choose
              comfortable starting loads. Load fields begin at zero and are
              editable.
            </Label>
          </Card>
          {draft.days.map((day, index) => (
            <Card key={day.key}>
              <Label bold size={21}>
                {day.name}
              </Label>
              <Label muted>
                {addDays(draft.preferences.startDate, day.offset)} · repeats
                weekly · {estimatedMinutes(day.exercises)} min ·{" "}
                {day.exercises.reduce((sum, e) => sum + e.sets, 0)} working sets
              </Label>
              <Label muted>
                {day.exercises
                  .map((e) => catalog.find((x) => x.id === e.exerciseId)?.name)
                  .join(" · ")}
              </Label>
              <Button
                title={`${expanded === day.key ? "Close" : "Edit"} ${day.name}`}
                secondary
                onPress={() =>
                  setExpanded(expanded === day.key ? undefined : day.key)
                }
              />
              {expanded === day.key && (
                <PathDayEditor
                  day={day}
                  preferences={draft.preferences}
                  catalog={catalog}
                  onChange={(updated) =>
                    setDraft({
                      ...draft,
                      days: draft.days.map((d, i) =>
                        i === index ? updated : d,
                      ),
                    })
                  }
                />
              )}
            </Card>
          ))}
          <Button
            title="Back to personalization"
            secondary
            onPress={() => {
              setStep(0);
              setView("setup");
            }}
          />
          <Button
            title="Start this Path"
            icon="trail-sign-outline"
            onPress={() =>
              confirm(
                active
                  ? "Replace your current Path?"
                  : "Start this eight-week Path?",
                active
                  ? "Your previous Path will be archived. Its calendar and every recorded workout are preserved. This adds the previewed plan to your calendar."
                  : "This saves the previewed workouts and all eight weeks to your calendar. Your existing workouts are preserved.",
                () => {
                  const record = acceptPath(r, draft, !!active);
                  setSelectedId(record.id);
                  setSelectedDate(undefined);
                  setWeek(1);
                  setView("dashboard");
                },
              )
            }
          />
        </>
      )}

      {view === "dashboard" &&
        (!selected || !stats ? (
          <Card>
            <Label bold>No saved Path found.</Label>
            <Button
              title="Browse Forge Paths"
              onPress={() => setView("discover")}
            />
          </Card>
        ) : (
          <>
            <Card>
              <Label muted size={11}>
                YOUR CURRENT PATH
              </Label>
              <Label bold size={28}>
                {selected.data.name}
              </Label>
              <Label>
                {selected.data.status === "archived"
                  ? "Archived · history preserved"
                  : selected.data.status === "paused"
                    ? "Paused · your progress is safe"
                    : stats.complete
                      ? "Eight-week cycle completed"
                      : `Week ${stats.week} · ${stats.phase.name}`}
              </Label>
              <ProgressBar
                value={stats.ratio}
                label="Eight-week Path completion"
              />
              <Label bold>
                {stats.completed} / {stats.expected} workouts completed
              </Label>
              <Label muted>
                {stats.weeklyCompleted} / {selected.data.preferences.frequency}{" "}
                sessions completed for week {stats.week} · {stats.missed} missed
                · {stats.skipped} skipped
              </Label>
              <Label muted size={13}>
                Only completed, linked workouts count. Missed and skipped
                sessions never count as completed.
              </Label>
              {stats.missing > 0 && (
                <Label>
                  {stats.missing} calendar entries are missing. Restore a backup
                  to recover the original schedule; workout history remains
                  available in Train.
                </Label>
              )}
            </Card>
            {selected.data.engineVersion === 1 &&
              selected.data.status !== "archived" && (
                <Card>
                  <Label bold>
                    Your saved plan uses the earlier programming.
                  </Label>
                  <Label muted>
                    Keep training it, or preview a rebuilt plan. Accepting a
                    replacement archives this schedule and preserves every
                    logged workout.
                  </Label>
                  <Button
                    title="Rebuild this Path"
                    onPress={() => {
                      const definition = forgePaths.find(
                        (p) => p.key === selected.data.pathKey,
                      )!;
                      setPreferences({
                        ...selected.data.preferences,
                        startDate: localDate(),
                        duration: Math.max(
                          selected.data.preferences.duration,
                          definition.duration,
                        ),
                      });
                      setStep(0);
                      setView("setup");
                      setDraft(undefined);
                    }}
                  />
                </Card>
              )}
            {stats.complete && (
              <Card>
                <Label bold size={23}>
                  You showed up. You built your foundation.
                </Label>
                <Label muted>
                  All {stats.expected} sessions are completed. Review your
                  training below or choose another Path when you are ready.
                  Nothing changes automatically.
                </Label>
              </Card>
            )}
            {stats.next && selected.data.status === "active" && (
              <Card>
                <SectionHeader
                  title="Up next"
                  detail={`${stats.next.record.date} · ${stats.next.state}`}
                />
                <Label bold size={22}>
                  {sessionName(stats.next.data.dayIndex, stats.next.data.name)}
                </Label>
                <Label muted>
                  {selected.data.days[stats.next.data.dayIndex]!.roles.join(
                    " · ",
                  )}{" "}
                  ·{" "}
                  {estimatedMinutes(
                    r
                      .templates()
                      .find((t) => t.id === stats.next!.data.templateId)
                      ?.exercises ?? [],
                  )}{" "}
                  min estimated
                </Label>
                {stats.next.state === "missed" && (
                  <Label muted>
                    You can complete a missed session late or move it to a
                    suitable future date below.
                  </Label>
                )}
                <Button
                  title={
                    stats.next.state === "in-progress"
                      ? "Resume Path workout"
                      : "Start next Path workout"
                  }
                  onPress={() => start(stats.next!)}
                />
              </Card>
            )}
            {r.active() && (
              <Button
                title="Resume current workout"
                secondary
                onPress={() => router.push("/workout")}
              />
            )}
            <Card>
              <SectionHeader title="Your training approach" />
              <Label muted>{trainingGuidance(selected.data.pathKey)}</Label>
              <Label>1–4 · Foundation</Label>
              <Label>5–8 · Evolution</Label>
              <Label muted size={13}>
                Your accepted exercises stay consistent across both phases so
                you can compare progress. Nothing changes automatically.
              </Label>
              <Row>
                {Array.from({ length: 8 }, (_, i) => {
                  const count = stats.sessions.filter(
                    (s) => s.data.week === i + 1 && s.state === "completed",
                  ).length;
                  return (
                    <Label
                      key={i}
                      bold={count === selected.data.preferences.frequency}
                    >
                      W{i + 1}: {count}/{selected.data.preferences.frequency}
                    </Label>
                  );
                })}
              </Row>
            </Card>
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
              {trainingWeeks.length ? (
                trainingWeeks.map((w) => (
                  <View key={w} style={{ gap: 6 }}>
                    <Label bold>
                      Training week {w} · {w <= 4 ? "Foundation" : "Evolution"}
                    </Label>
                    <Label muted>{weekIntention(w)}</Label>
                  </View>
                ))
              ) : (
                <Label muted>{weekIntention(9)}</Label>
              )}
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
                      accessibilityState={{ selected: date === selectedDate }}
                      onPress={() =>
                        setSelectedDate(
                          date === selectedDate ? undefined : date,
                        )
                      }
                      style={{
                        flex: 1,
                        minHeight: 88,
                        paddingVertical: 10,
                        alignItems: "center",
                        gap: 6,
                        borderRadius: 12,
                        borderWidth: date === localDate() ? 2 : 1,
                        borderColor:
                          date === selectedDate || date === localDate()
                            ? colors.accent
                            : colors.border,
                        backgroundColor:
                          date === selectedDate
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
              <Label muted size={12}>
                ● Training · ✓ Completed · ! Missed · ↷ Skipped · ◐ Active · –
                Rest. Tap a day for details; tap again to see the week.
              </Label>
              {selectedDate && !visibleSessions.length && (
                <Label>
                  Rest day · {selectedDate}. Recover, or take an easy walk if it
                  suits you.
                </Label>
              )}
              <Label muted size={12}>
                Moved sessions appear on their actual dates and keep their
                original training week. Missed and skipped sessions stay
                visible.
              </Label>
            </Card>
            {visibleSessions.map((session) => (
              <Card key={session.record.id}>
                <Label bold size={20}>
                  {sessionName(session.data.dayIndex, session.data.name)}
                </Label>
                <Label muted>
                  {session.record.date} · {session.state}
                </Label>
                <Label muted size={13}>
                  Training week {session.data.week} · {session.data.phase} ·{" "}
                  {estimatedMinutes(
                    r.templates().find((t) => t.id === session.data.templateId)
                      ?.exercises ?? [],
                  )}{" "}
                  min
                </Label>
                {!["completed", "in-progress"].includes(session.state) && (
                  <Label muted size={13}>
                    {r
                      .templates()
                      .find((t) => t.id === session.data.templateId)
                      ?.exercises.map(
                        (e) =>
                          `${catalog.find((x) => x.id === e.exerciseId)?.name ?? "Unavailable movement"}: ${e.sets} × ${e.reps} · rest ${e.rest}s`,
                      )
                      .join("\n")}
                  </Label>
                )}
                {session.state === "unlinked" && (
                  <Label muted>
                    The linked workout is unavailable. No completion is counted.
                    Starting again creates a new workout.
                  </Label>
                )}
                {session.state === "completed" ? (
                  <Button
                    title={`Review ${sessionName(session.data.dayIndex, session.data.name)}`}
                    secondary
                    onPress={() =>
                      router.push({
                        pathname: "/workout",
                        params: { id: session.data.workoutId },
                      })
                    }
                  />
                ) : (
                  selected.data.status !== "archived" && (
                    <>
                      {!session.data.skipped &&
                        selected.data.status === "active" && (
                          <Button
                            title={`Start ${sessionName(session.data.dayIndex, session.data.name)}`}
                            onPress={() => start(session)}
                          />
                        )}
                      {!["in-progress", "completed"].includes(
                        session.state,
                      ) && (
                        <Row>
                          <Button
                            title={`Move ${sessionName(session.data.dayIndex, session.data.name)}`}
                            secondary
                            onPress={() => {
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
                                "Skipping is recorded separately and never counts as a completed workout. History is preserved.",
                                () =>
                                  skipPathSession(
                                    r,
                                    session.record.id,
                                    !session.data.skipped,
                                  ),
                              )
                            }
                          />
                        </Row>
                      )}
                    </>
                  )
                )}
              </Card>
            ))}
            {selected.data.status !== "archived" && (
              <>
                <SectionHeader
                  title="Edit your training days"
                  detail="Updates both phases for future starts. Recorded sets and active workouts stay unchanged."
                />
                {selected.data.days.map((day, index) => (
                  <Button
                    key={day.key}
                    title={`Edit plan: ${sessionName(index, day.name)}`}
                    secondary
                    onPress={() =>
                      setEditing({
                        index,
                        day: {
                          ...savedDraft(r, selected).days[index]!,
                          name: sessionName(index, day.name),
                        },
                      })
                    }
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
              </>
            )}
            <Button
              title="Browse or change Path"
              secondary
              onPress={() => setView("discover")}
            />
          </>
        ))}

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
              onChange={(day) => setEditing({ ...editing, day })}
            />
            <Button
              title="Save Path workout"
              onPress={() =>
                confirm(
                  "Save this workout for future starts?",
                  "Both phases use this prescription. Existing recorded sets and any active workout are preserved.",
                  () => {
                    editPathDay(
                      r,
                      selected.record.id,
                      editing.index,
                      editing.day.exercises,
                    );
                    setEditing(undefined);
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
