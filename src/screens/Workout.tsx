import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Platform,
  Keyboard,
  InputAccessoryView,
  KeyboardAvoidingView,
  StyleSheet,
  BackHandler,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../platform/alert";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useRepo, mutate, confirm, useApp } from "../state";
import {
  Screen,
  Txt,
  Button,
  TextButton,
  IconButton,
  Field,
  NumberField,
  Empty,
  Sheet,
  useColors,
  confirmDiscard,
} from "../components/ui";
import { OverflowMenu, type MenuAction } from "../components/system";
import { ExercisePicker } from "../components/ExercisePicker";
import { elapsedSeconds, volume, kgToLb } from "../domain/metrics";
import { timer, workoutTitle } from "../domain/workout-display";
import { durationMinutes } from "../domain/training-display";
import { programWorkoutContext } from "../data/programs";
import {
  beginWorkoutEdit,
  cancelWorkoutEdit,
  editInProgress,
  saveWorkoutEdit,
  workoutEdited,
} from "../data/workout-session";
import WorkoutExerciseCard from "../components/WorkoutExerciseCard";
import {
  SetFocusProvider,
  WeightFillProvider,
  useSetFocus,
  SET_KEYBOARD_ID,
} from "../components/SetGrid";
import { restNotification, cancelRestNotification } from "../notifications";
import { FinishSheet } from "../components/FinishSheet";
import { ReorderSheet } from "../components/ReorderSheet";
import { hasValues } from "../domain/finish";
import { goBack } from "../navigation";
import { theme } from "../theme";
import type { Workout } from "../domain/types";

function useNow() {
  const [now, set] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => set(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
}
/** "1 minute 29 seconds": how the countdown is read aloud. */
export function spokenRest(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [m && part(m, "minute"), (s || !m) && part(s, "second")]
    .filter(Boolean)
    .join(" ");
}
function useRestLeft() {
  const r = useRepo();
  const now = useNow();
  const deadline = Number(r.setting("restDeadline") ?? 0);
  return { deadline, left: Math.max(0, Math.ceil((deadline - now) / 1000)) };
}
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

// Starts (or restarts) the rest countdown and its reminder.
function restFor(r: ReturnType<typeof useRepo>, seconds: number) {
  mutate(() =>
    r.setSetting("restDeadline", String(Date.now() + seconds * 1000)),
  );
  void restNotification(Date.now() + seconds * 1000).catch((e) =>
    Alert.alert("Reminder unavailable", String(e)),
  );
}

/**
 * Rest timer in the workout dock. Completing a set starts it automatically
 * (with that set's rest); tapping it starts the default rest. While resting
 * it shows the countdown with +30 s and Skip. Reminders are scheduled as
 * before and cancelled on skip.
 */
export function RestTimer() {
  const r = useRepo();
  const c = useColors();
  const { deadline, left } = useRestLeft();
  // Screen readers hear when rest starts and when it ends, never every
  // second; the countdown is the timer's value, read when it is focused.
  const lastDeadline = useRef(deadline);
  useEffect(() => {
    const was = lastDeadline.current;
    lastDeadline.current = deadline;
    if (deadline > 0 && !(was > 0))
      AccessibilityInfo.announceForAccessibility(
        `Rest started, ${spokenRest(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))}`,
      );
  }, [deadline]);
  useEffect(() => {
    if (deadline > 0 && left === 0) {
      AccessibilityInfo.announceForAccessibility("Rest over");
      r.setSetting("restDeadline", "0");
      useApp.getState().touch();
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
  }, [deadline, left, r]);
  const change = (seconds: number) => restFor(r, seconds);
  const rest = r.profile().rest;
  const pill = {
    minHeight: 48,
    borderRadius: theme.radii.pill,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  };
  if (!left)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start rest"
        accessibilityHint={`Starts a ${timer(rest)} rest timer`}
        onPress={() => change(rest)}
        style={({ pressed }) => ({
          ...pill,
          gap: 6,
          paddingHorizontal: 14,
          backgroundColor: pressed ? c.selected : c.surfaceRaised,
        })}
      >
        <Ionicons name="timer-outline" size={18} color={c.text2} />
        <Txt variant="headline" tone="secondary" tabular>
          {timer(rest)}
        </Txt>
      </Pressable>
    );
  return (
    <View
      style={{ ...pill, paddingLeft: 14, backgroundColor: c.surfaceRaised }}
    >
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel="Rest timer"
        accessibilityValue={{ text: `${spokenRest(left)} remaining` }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Ionicons name="timer" size={18} color={c.ember} />
        <Txt variant="headline" tabular style={{ minWidth: 48 }}>
          {timer(left)}
        </Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+30 sec"
        onPress={() => change(left + 30)}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 8,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt variant="body" weight="600">
          +30
        </Txt>
      </Pressable>
      <IconButton
        icon="close"
        label="Skip"
        size={20}
        onPress={() => {
          mutate(() => r.setSetting("restDeadline", "0"));
          void cancelRestNotification().catch(() => {});
        }}
      />
    </View>
  );
}

/** iOS keyboard toolbar for set inputs: rest countdown, Next and Done. */
function KeyboardBar() {
  const c = useColors();
  const focus = useSetFocus();
  const { left } = useRestLeft();
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView
      nativeID={SET_KEYBOARD_ID}
      backgroundColor={c.surfaceRaised}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 44,
          paddingHorizontal: 12,
          gap: 4,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.hairline,
        }}
      >
        {left > 0 && (
          <View
            accessible
            accessibilityLabel="Rest timer"
            accessibilityValue={{ text: `${spokenRest(left)} remaining` }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Ionicons name="timer" size={16} color={c.ember} />
            <Txt variant="headline" tabular>
              {timer(left)}
            </Txt>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TextButton
          title="Next"
          compact
          onPress={() => {
            if (!focus?.next()) Keyboard.dismiss();
          }}
        />
        <TextButton title="Done" compact onPress={() => Keyboard.dismiss()} />
      </View>
    </InputAccessoryView>
  );
}

function SessionClock({ workout: w }: { workout: Workout }) {
  const now = useNow();
  const seconds = elapsedSeconds(
    w.startedAt,
    w.finishedAt ?? now,
    w.pausedMs,
    w.pausedAt,
  );
  return (
    <View
      accessible
      accessibilityLabel={`Elapsed time ${Math.floor(seconds / 60)} minutes`}
    >
      <Txt variant="metric">{timer(seconds)}</Txt>
    </View>
  );
}

/**
 * The workout logger: a compact header (back, name, clock, menu), the
 * exercises, and a dock with the rest timer and Finish. Every edit saves
 * immediately, so leaving and resuming never loses logged sets.
 */
export default function WorkoutScreen() {
  const r = useRepo();
  const c = useColors();
  const { id: workoutId } = useLocalSearchParams<{ id?: string }>();
  // Once finished, the workout is no longer "active": keep showing it while
  // the finish sheet shows the summary.
  const [finishedId, setFinishedId] = useState<string>();
  const w = workoutId
    ? r.workout(workoutId)
    : finishedId
      ? r.workout(finishedId)
      : r.active();
  const [picker, setPicker] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [reorder, setReorder] = useState<{ initial?: string }>();
  const [sheet, setSheet] = useState<"name" | "notes" | "rest" | "template">();
  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("");
  // Finished workouts open read-only. An edit interrupted by FORGE closing
  // reopens in edit mode, so it can still be saved or cancelled.
  const [editing, setEditing] = useState(
    () => !!w && w.status === "completed" && editInProgress(r, w.id),
  );
  const keyboard = useKeyboardVisible();
  function returnToTraining() {
    goBack("/(tabs)");
  }
  const completed = w?.status === "completed";
  const reviewing = completed && !editing;
  function startEdit() {
    if (!w) return;
    mutate(() => beginWorkoutEdit(r, w.id));
    setEditing(true);
  }
  function saveEdit() {
    if (!w) return;
    mutate(() => saveWorkoutEdit(r, w.id));
    setEditing(false);
  }
  /** Leaves edit mode, undoing the edits (asks first when there are any). */
  function cancelEdit(then?: () => void) {
    if (!w) return;
    const discard = () => {
      mutate(() => cancelWorkoutEdit(r, w.id));
      setEditing(false);
      then?.();
    };
    if (workoutEdited(r, w.id)) confirmDiscard(discard);
    else discard();
  }
  // Android back while editing behaves like Cancel instead of leaving with
  // half-made edits. Re-registered each render so it sees the latest state.
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      cancelEdit(returnToTraining);
      return true;
    });
    return () => sub.remove();
  });
  if (!w)
    return (
      <Screen title="No active workout">
        <Empty
          title="Ready when you are"
          detail="Start a workout from Train."
          action={<Button title="Back to Train" onPress={returnToTraining} />}
        />
      </Screen>
    );
  const rows = r.workoutExercises(w.id);
  const sets = r.workoutSets(w.id);
  const completedSets = sets.filter((s) => s.completed).length;
  const firstUnfinished = rows.find((row) => {
    const rowSets = r.sets(row.id);
    return !rowSets.length || rowSets.some((set) => !set.completed);
  });
  const units = r.profile().units;
  const moved = volume(sets);
  const volumeText =
    moved > 0
      ? `${Math.round(units === "lb" ? kgToLb(moved) : moved).toLocaleString()} ${units}`
      : undefined;
  const lowerFatigue = !!programWorkoutContext(r, w.id)?.log.lowerFatigue;
  const minutes = durationMinutes(w);
  const day = new Date(w.finishedAt ?? w.startedAt).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );
  // One short line under the title; the most useful facts first so it fits.
  const status = (
    editing
      ? ["Editing", `Completed ${day}`]
      : completed
        ? [
            `Completed ${day}`,
            minutes >= 1 ? `${minutes} min` : undefined,
            volumeText,
          ]
        : [
            w.status === "paused"
              ? "Paused"
              : lowerFatigue
                ? "Lower-fatigue session"
                : undefined,
            sets.length
              ? `${completedSets} of ${sets.length} sets`
              : "No sets yet",
            w.status === "paused" || lowerFatigue ? undefined : volumeText,
          ]
  )
    .filter(Boolean)
    .join(" · ");
  const close = () => setSheet(undefined);
  function finish() {
    const all = r.workoutSets(w!.id);
    if (!all.some((s) => s.completed || hasValues(s))) {
      Alert.alert(
        "No completed sets",
        "Mark at least one set complete before finishing.",
      );
      return;
    }
    setFinishing(true);
  }
  const reorderItem: MenuAction[] =
    rows.length > 1
      ? [
          {
            label: "Reorder exercises",
            icon: "reorder-four-outline",
            onPress: () => setReorder({}),
          },
        ]
      : [];
  // Review mode: nothing that changes the workout except deliberate actions.
  const menu: MenuAction[] = reviewing
    ? []
    : [
        {
          label: "Rename workout",
          icon: "pencil",
          onPress: () => {
            setName(w.name);
            setSheet("name");
          },
        },
        {
          label: "Workout notes",
          icon: "document-text-outline",
          onPress: () => setSheet("notes"),
        },
        ...reorderItem,
      ];
  if (!completed)
    menu.push(
      {
        label: w.status === "paused" ? "Resume workout" : "Pause workout",
        icon: w.status === "paused" ? "play" : "pause",
        onPress: () => mutate(() => r.pauseWorkout(w.id)),
      },
      {
        label: "Default rest",
        icon: "timer-outline",
        onPress: () => setSheet("rest"),
      },
    );
  menu.push(
    {
      label: "Save as template",
      icon: "albums-outline",
      disabled: !rows.length,
      onPress: () => {
        setTemplateName("");
        setSheet("template");
      },
    },
    {
      label: completed ? "Delete session" : "Discard workout",
      icon: "trash-outline",
      destructive: true,
      onPress: () =>
        confirm(
          completed ? "Delete this workout?" : "Discard this workout?",
          completed
            ? "The session and all its sets are removed from your history and progress. This cannot be undone, so export a backup first if you need to keep it."
            : "The workout and the sets logged so far are removed. This cannot be undone.",
          () => {
            // Any saved pre-edit copy goes with it.
            saveWorkoutEdit(r, w.id);
            r.deleteWorkout(w.id);
            returnToTraining();
          },
          { action: completed ? "Delete workout" : "Discard workout" },
        ),
    },
  );
  return (
    <SafeAreaView
      edges={
        reviewing
          ? ["top", "left", "right", "bottom"]
          : ["top", "left", "right"]
      }
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <SetFocusProvider>
        <WeightFillProvider enabled={!completed}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.hairline,
            }}
          >
            <IconButton
              icon="chevron-back"
              label="Back to training"
              onPress={() =>
                editing ? cancelEdit(returnToTraining) : returnToTraining()
              }
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline" header numberOfLines={2}>
                {workoutTitle(w.name)}
              </Txt>
              <Txt
                variant="caption"
                tone={editing ? "accent" : "secondary"}
                // Wrap rather than cut the sets, volume or duration at large
                // text sizes (the clock or Edit shares the row).
                numberOfLines={2}
              >
                {status}
              </Txt>
            </View>
            {completed ? (
              reviewing && (
                <TextButton
                  title="Edit"
                  accessibilityLabel="Edit workout"
                  onPress={startEdit}
                />
              )
            ) : (
              <SessionClock workout={w} />
            )}
            <OverflowMenu
              label="Workout options"
              title={w.name}
              actions={menu}
            />
          </View>
          {/* Android draws edge to edge, so the window no longer shrinks for
            the keyboard: lift the list and dock above it here. iOS insets the
            list instead (automaticallyAdjustKeyboardInsets). */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
            enabled={Platform.OS === "android"}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: theme.spacing.screen,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.xl,
                gap: theme.spacing.group,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
            >
              {reviewing && !!w.notes && (
                <View
                  accessible
                  accessibilityLabel={`Workout notes: ${w.notes}`}
                  style={{ flexDirection: "row", gap: 8 }}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={c.text2}
                  />
                  <Txt variant="caption" tone="secondary" style={{ flex: 1 }}>
                    {w.notes}
                  </Txt>
                </View>
              )}
              {rows.map((row, i) => (
                <WorkoutExerciseCard
                  key={row.id}
                  row={row}
                  index={i}
                  count={rows.length}
                  initialExpanded={
                    reviewing ? i === 0 : row.id === firstUnfinished?.id
                  }
                  completedWorkout={completed}
                  readOnly={reviewing}
                  onReorder={
                    reviewing
                      ? undefined
                      : () => setReorder({ initial: row.id })
                  }
                />
              ))}
              {!rows.length && (
                <Txt tone="secondary">
                  {reviewing
                    ? "No exercises were logged in this workout."
                    : "Add your first exercise to start logging."}
                </Txt>
              )}
              {!reviewing && (
                <Button
                  title="Add exercise"
                  icon="add"
                  variant="secondary"
                  onPress={() => setPicker(true)}
                />
              )}
            </ScrollView>
            {editing && (
              <SafeAreaView
                edges={{ bottom: "maximum" }}
                style={{
                  flexDirection: "row",
                  gap: 10,
                  paddingHorizontal: theme.spacing.screen,
                  paddingVertical: 10,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.hairline,
                  backgroundColor: c.bg,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    accessibilityLabel="Cancel editing"
                    variant="secondary"
                    onPress={() => cancelEdit()}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Save"
                    accessibilityLabel="Save changes"
                    icon="checkmark"
                    onPress={saveEdit}
                  />
                </View>
              </SafeAreaView>
            )}
            {!completed && (
              <SafeAreaView
                edges={{ bottom: "maximum" }}
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: theme.spacing.screen,
                  paddingVertical: 10,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.hairline,
                  backgroundColor: c.bg,
                }}
              >
                {/* A paused workout offers Resume right where the rest timer
                  sits; Finish stays the single primary action. */}
                {w.status === "paused" ? (
                  <View style={{ flexGrow: 1, flexBasis: 120 }}>
                    <Button
                      title="Resume"
                      accessibilityLabel="Resume workout"
                      icon="play"
                      variant="secondary"
                      onPress={() => mutate(() => r.pauseWorkout(w.id))}
                    />
                  </View>
                ) : (
                  <RestTimer />
                )}
                {/* While typing on Android the dock sits on the keyboard: keep
                  the rest timer, hide Finish. On iOS the keyboard covers the
                  dock and its toolbar shows the rest timer. */}
                {!(Platform.OS === "android" && keyboard) && (
                  <View style={{ flexGrow: 1, flexBasis: 120 }}>
                    <Button
                      title="Finish"
                      accessibilityLabel="Finish workout"
                      icon="checkmark"
                      onPress={finish}
                    />
                  </View>
                )}
              </SafeAreaView>
            )}
          </KeyboardAvoidingView>
          <KeyboardBar />
        </WeightFillProvider>
      </SetFocusProvider>
      <Sheet
        visible={sheet === "name"}
        onClose={close}
        title="Rename workout"
        dismissOnBackdrop
      >
        <Field
          label="Workout name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (text.trim())
              mutate(() => r.updateWorkout(w.id, { name: text }));
          }}
        />
      </Sheet>
      <Sheet
        visible={sheet === "notes"}
        onClose={close}
        title="Workout notes"
        dismissOnBackdrop
      >
        <Field
          label="Workout notes"
          value={w.notes}
          multiline
          onChangeText={(notes) =>
            mutate(() => r.updateWorkout(w.id, { notes }))
          }
        />
      </Sheet>
      <Sheet
        visible={sheet === "rest"}
        onClose={close}
        title="Default rest"
        dismissOnBackdrop
      >
        <Txt tone="secondary">
          Used when you start the timer yourself. Completing a set starts that
          set&apos;s own rest.
        </Txt>
        <NumberField
          label="Default rest (seconds)"
          max={3600}
          value={r.profile().rest}
          onSave={(n) => mutate(() => r.saveProfile({ rest: n ?? 90 }))}
        />
      </Sheet>
      <Sheet
        visible={sheet === "template"}
        onClose={close}
        title="Save as template"
        unsaved={!!templateName.trim()}
        footer={
          <Button
            title="Save as template"
            disabled={!templateName.trim() || !rows.length}
            onPress={() => {
              const t = mutate(() => r.templateFromWorkout(w.id, templateName));
              if (t) {
                close();
                Alert.alert("Template saved", t.name);
              }
            }}
          />
        }
      >
        <Field
          label="Template name"
          value={templateName}
          onChangeText={setTemplateName}
        />
      </Sheet>
      <ExercisePicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(e) =>
          mutate(() => {
            const row = r.addExercise(w.id, e.id);
            r.addSet(row.id);
          })
        }
      />
      {finishing && (
        <FinishSheet
          workout={w}
          onClose={() => setFinishing(false)}
          onSaved={() => setFinishedId(w.id)}
          onDone={() => {
            setFinishing(false);
            returnToTraining();
          }}
        />
      )}
      {reorder && (
        <ReorderSheet
          workoutId={w.id}
          initial={reorder.initial}
          onClose={() => setReorder(undefined)}
        />
      )}
    </SafeAreaView>
  );
}
