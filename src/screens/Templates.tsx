import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Alert } from "../platform/alert";
import { useColors } from "../components/ui";
import { ListRow, OverflowMenu, type MenuAction } from "../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeListRow,
  ForgeSearchField,
  ForgeSubScreen,
  OutlineButton,
  RowDivider,
  SectionLabel,
} from "../components/reforge";
import { TemplateEditor } from "../components/TemplateEditor";
import { DateSheet } from "../components/DateSheet";
import { useRepo, mutate, confirm } from "../state";
import { localDate, type Journal, type Template } from "../domain/types";
import {
  visibleSchedules,
  startScheduledSession,
  standaloneTemplates,
} from "../data/paths";
import { notifyAt } from "../notifications";
import { workoutTitle } from "../domain/workout-display";
import {
  dayLabel,
  relativeDay,
  templateLine,
} from "../domain/training-display";
import { exerciseNames } from "../domain/templates";
import { blockIfTraining, otherWorkout, resumeWorkout } from "../startGuard";
import { goBack } from "../navigation";
import { forge } from "../theme";
import { filterTemplates, showsSearch } from "./templates/model";

// Workout templates (REFORGE, Phase 7.2C-2): the lifter's own workouts in
// one compact list, ready to start, edit or schedule, and the sessions
// already planned. Start is the one action on each row; everything else
// lives in its ••• menu. Search appears once there are more than eight.

/** "Today", "Tomorrow", "Thu, Oct 24", or "Past · Mon, Oct 20". */
function whenText(date: string, today: string) {
  if (date < today) return `Past · ${dayLabel(date)}`;
  const day = relativeDay(date, today);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * One template: name and what it holds (tap to edit), Start and its menu.
 * The actions move under the text when the row is too narrow for both.
 */
function TemplateRow({
  name,
  summary,
  training,
  divider,
  onEdit,
  onStart,
  actions,
}: {
  name: string;
  summary: string;
  training: boolean;
  divider: boolean;
  onEdit: () => void;
  onStart: () => void;
  actions: MenuAction[];
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingRight: 4,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${name}`}
        accessibilityHint={summary}
        onPress={onEdit}
        style={({ pressed }) => ({
          flexGrow: 1,
          flexBasis: 170,
          minHeight: 72,
          paddingLeft: forge.spacing.cardPadding,
          paddingRight: 8,
          paddingVertical: 12,
          justifyContent: "center",
          gap: 4,
          backgroundColor: pressed ? c.cardRaised : "transparent",
        })}
      >
        <FText variant="cardTitle" weight="700" numberOfLines={2}>
          {name}
        </FText>
        <FText variant="label" tone="secondary" numberOfLines={2}>
          {summary}
        </FText>
      </Pressable>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 4,
        }}
      >
        <OutlineButton
          title="Start"
          icon="play"
          compact
          // One workout at a time: the banner above resumes it.
          disabled={training}
          accessibilityLabel={`Start ${name}`}
          onPress={onStart}
        />
        <OverflowMenu
          label={`Options for ${name}`}
          title={name}
          actions={actions}
        />
      </View>
    </View>
  );
}

export default function Templates() {
  const r = useRepo();
  const params = useLocalSearchParams<{ edit?: string }>();
  const [editing, setEditing] = useState<{ template?: Template }>();
  const [scheduling, setScheduling] = useState<Template>();
  const [query, setQuery] = useState("");
  const today = localDate();
  const active = r.active();
  const templates = standaloneTemplates(r);
  const searchable = showsSearch(templates.length);
  const shown = searchable
    ? filterTemplates(templates, query, (id) => r.exercise(id)?.name)
    : templates;
  const planned = visibleSchedules(r)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);

  // Train's template sheet links straight to its editor, once per link.
  const [handled, setHandled] = useState<string>();
  if (params.edit && params.edit !== handled) {
    setHandled(params.edit);
    const t = r.templates().find((x) => x.id === params.edit);
    if (t) setEditing({ template: t });
  }

  function start(t: Template) {
    if (blockIfTraining(r)) return;
    const w = mutate(() => r.startWorkout(t.name, t.id));
    if (w) router.push("/workout");
  }
  function schedule(t: Template, date: string) {
    // The same planned-session record as before: name, template and day.
    const entry = mutate(() =>
      r.addJournal("schedule", { name: t.name, templateId: t.id }, date),
    );
    setScheduling(undefined);
    if (!entry) return;
    Alert.alert("Scheduled", `${t.name} · ${dayLabel(date)}`);
    void notifyAt(
      "Planned workout",
      t.name,
      new Date(`${date}T09:00:00`).getTime(),
    ).catch((e) => Alert.alert("Reminder unavailable", String(e)));
  }
  function startPlanned(j: Journal) {
    if (blockIfTraining(r, String(j.data.workoutId ?? ""))) return;
    const w = mutate(() => startScheduledSession(r, j));
    if (w) router.push("/workout");
  }
  const templateActions = (t: Template): MenuAction[] => [
    {
      label: "Edit",
      icon: "create-outline",
      onPress: () => setEditing({ template: t }),
    },
    {
      label: "Schedule…",
      icon: "calendar-outline",
      onPress: () => setScheduling(t),
    },
    {
      label: "Duplicate",
      icon: "copy-outline",
      onPress: () =>
        mutate(() =>
          r.saveTemplate(`${t.name} copy`, t.exercises, undefined, t.notes),
        ),
    },
    {
      label: "Delete",
      icon: "trash-outline",
      destructive: true,
      onPress: () =>
        confirm(
          "Delete template?",
          `"${t.name}" will be deleted. Completed workouts are preserved; planned sessions will need a new template.`,
          () => r.deleteTemplate(t.id),
          { action: "Delete template" },
        ),
    },
  ];

  return (
    <ForgeSubScreen
      title="Workout templates"
      eyebrow={
        templates.length
          ? `${templates.length} ${templates.length === 1 ? "template" : "templates"}`
          : undefined
      }
      onBack={() => goBack("/(tabs)/train")}
      footer={
        <CtaButton
          title="Create template"
          icon="add"
          onPress={() => setEditing({})}
        />
      }
    >
      {active && (
        <ForgeCard padding={0} gap={0}>
          <ForgeListRow
            icon="play-circle-outline"
            title="Workout in progress"
            description={`Finish ${workoutTitle(active.name)} before starting another`}
            value="Resume"
            accessibilityLabel={`Resume ${workoutTitle(active.name)}`}
            onPress={resumeWorkout}
          />
        </ForgeCard>
      )}
      {!templates.length && (
        <ForgeEmpty
          title="No templates yet"
          detail="Save a workout you repeat, with its exercises, sets, reps, load and rest, then start it in one tap. Any workout can also be saved as a template from its ••• menu."
        />
      )}
      {searchable && (
        <ForgeSearchField
          label="Search templates"
          placeholder="Search by name or exercise"
          value={query}
          onChangeText={setQuery}
        />
      )}
      {templates.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionLabel
            title="Your templates"
            trailing={
              searchable && query.trim() ? (
                <FText variant="label" tone="secondary">
                  {`${shown.length} of ${templates.length}`}
                </FText>
              ) : undefined
            }
          />
          {shown.length ? (
            <ForgeCard padding={0} gap={0}>
              {shown.map((t, i) => {
                const names = t.exercises.map(
                  (e) =>
                    r.exercise(e.exerciseId)?.name ?? "Unavailable exercise",
                );
                return (
                  <TemplateRow
                    key={t.id}
                    name={t.name}
                    summary={[templateLine(t.exercises), exerciseNames(names)]
                      .filter(Boolean)
                      .join("\n")}
                    training={!!active}
                    divider={i > 0}
                    onEdit={() => setEditing({ template: t })}
                    onStart={() => start(t)}
                    actions={templateActions(t)}
                  />
                );
              })}
            </ForgeCard>
          ) : (
            <ForgeEmpty
              title="No matching templates"
              detail="Try another name or exercise."
              action={
                <OutlineButton
                  title="Show all templates"
                  onPress={() => setQuery("")}
                />
              }
            />
          )}
        </View>
      )}
      {planned.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Scheduled" />
          <ForgeCard padding={0} gap={0}>
            {planned.map((j, i) => {
              const name = String(j.data.name);
              const day = dayLabel(j.date);
              const path = j.data.forgePath === 1;
              const blocked = !!otherWorkout(r, String(j.data.workoutId ?? ""));
              return (
                <React.Fragment key={j.id}>
                  {i > 0 && <RowDivider />}
                  <ListRow
                    icon={path ? "trail-sign-outline" : "calendar-outline"}
                    title={name}
                    subtitle={[
                      whenText(j.date, today),
                      j.data.deload === true
                        ? "Deload: one fewer set per exercise"
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                    accessibilityLabel={`${name}, ${day}`}
                    trailing={
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <OutlineButton
                          title="Start"
                          compact
                          disabled={blocked}
                          accessibilityLabel="Start planned session"
                          onPress={() => startPlanned(j)}
                        />
                        <OverflowMenu
                          label={`Options for ${name}, ${day}`}
                          title={`${name} · ${day}`}
                          actions={
                            path
                              ? [
                                  {
                                    label: "Manage Path session",
                                    icon: "trail-sign-outline",
                                    onPress: () =>
                                      router.push({
                                        pathname: "/paths",
                                        params: {
                                          programId: String(j.data.programId),
                                          week: String(j.data.week),
                                        },
                                      }),
                                  },
                                ]
                              : [
                                  {
                                    label: "Remove from schedule",
                                    icon: "trash-outline",
                                    destructive: true,
                                    onPress: () =>
                                      confirm(
                                        "Remove planned session?",
                                        "It's removed from your schedule. Your recorded workouts will remain.",
                                        () => r.deleteJournal(j.id),
                                        { action: "Remove session" },
                                      ),
                                  },
                                ]
                          }
                        />
                      </View>
                    }
                  />
                </React.Fragment>
              );
            })}
          </ForgeCard>
        </View>
      )}
      {templates.length > 0 && !planned.length && (
        <FText
          variant="label"
          tone="secondary"
          style={{ paddingHorizontal: 2 }}
        >
          Plan a session from a template&apos;s ••• menu → Schedule.
        </FText>
      )}
      {editing && (
        <TemplateEditor
          template={editing.template}
          onClose={() => setEditing(undefined)}
        />
      )}
      <DateSheet
        visible={!!scheduling}
        title="Schedule workout"
        detail={scheduling ? `Choose a day for ${scheduling.name}.` : undefined}
        confirmLabel="Schedule"
        onConfirm={(date) => scheduling && schedule(scheduling, date)}
        onClose={() => setScheduling(undefined)}
      />
    </ForgeSubScreen>
  );
}
