import React, { useState, useEffect, useMemo, useRef } from "react";
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
  useWindowDimensions,
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
  Field,
  NumberField,
  Empty,
  Sheet,
  useColors,
  confirmDiscard,
} from "../components/ui";
import { OverflowMenu, type MenuAction } from "../components/system";
import { ExercisePicker } from "../components/ExercisePicker";
import {
  CtaButton,
  FText,
  OutlineButton,
  SquareIconButton,
} from "../components/reforge";
import { volume, kgToLb } from "../domain/metrics";
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
import { forge } from "../theme";
import {
  MenuSquare,
  ProgressCard,
  RestRing,
  SessionCard,
  WorkoutBackdrop,
  WorkoutHero,
  WorkoutTopBar,
  useNow,
} from "./workout/sections";
import { exerciseProgress, restTotal, workoutPlan } from "./workout/model";

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

// Starts (or restarts) the rest countdown and its reminder. `total` is the
// length the rest ring measures against (local display state only).
function restFor(
  r: ReturnType<typeof useRepo>,
  seconds: number,
  total = seconds,
) {
  mutate(() => {
    r.setSetting("restTotal", String(total));
    r.setSetting("restDeadline", String(Date.now() + seconds * 1000));
  });
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
  const total = restTotal(r.setting("restTotal"), left);
  const change = (seconds: number, length?: number) =>
    restFor(r, seconds, length);
  const rest = r.profile().rest;
  // The reference's rest panel: ring, REST TIMER, time; +30s and Skip.
  const panel = {
    minHeight: 56,
    borderRadius: forge.radii.card,
    borderWidth: forge.border.card,
    borderColor: c.cardBorder,
    paddingLeft: 10,
    paddingRight: 6,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  };
  if (!left)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start rest"
        accessibilityHint={`Starts a ${timer(rest)} rest timer`}
        onPress={() => change(rest)}
        style={({ pressed }) => ({
          ...panel,
          paddingRight: 14,
          backgroundColor: pressed ? c.cardRaised : c.cardBg,
        })}
      >
        <RestRing ratio={0} size={40}>
          <Ionicons name="timer-outline" size={18} color={c.text2} />
        </RestRing>
        <View style={{ flex: 1, gap: 1 }}>
          <FText variant="overline" tone="secondary" numberOfLines={1}>
            Rest timer
          </FText>
          <FText variant="statMetric" tone="secondary" numberOfLines={1}>
            {timer(rest)}
          </FText>
        </View>
        <Ionicons name="play" size={16} color={c.emberHot} />
        <FText variant="cardTitle" tone="accent">
          Start
        </FText>
      </Pressable>
    );
  return (
    <View style={{ ...panel, backgroundColor: c.cardBg }}>
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel="Rest timer"
        accessibilityValue={{ text: `${spokenRest(left)} remaining` }}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <RestRing ratio={left / total} size={40} />
        <View style={{ flexShrink: 1, gap: 1 }}>
          <FText variant="overline" tone="secondary" numberOfLines={1}>
            Rest timer
          </FText>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <FText variant="statMetric" style={{ minWidth: 48 }}>
              {timer(Math.min(left, total))}
            </FText>
            <FText variant="label" tone="secondary" numberOfLines={1}>
              {` / ${timer(total)}`}
            </FText>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+30 sec"
        // Exactly 30 s more on the stored deadline (not on the displayed
        // whole seconds, which may lag the clock by up to a second).
        onPress={() =>
          change((deadline + 30_000 - Date.now()) / 1000, total + 30)
        }
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 12,
          borderRadius: forge.radii.cta,
          borderWidth: forge.border.active,
          borderColor: c.cardBorder,
          backgroundColor: pressed ? c.cardRaised : "transparent",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        })}
      >
        <Ionicons name="play-skip-forward" size={14} color={c.text} />
        <FText variant="label" weight="700">
          +30s
        </FText>
      </Pressable>
      <SquareIconButton
        icon="close"
        label="Skip"
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
            <Ionicons name="timer" size={16} color={c.emberHot} />
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

/**
 * The workout logger (Phase 7.2A, after the approved Train reference): top
 * bar (back, wordmark, menu), the session hero, timer and progress cards,
 * the exercises, and a dock with the rest timer and Finish Workout. Every
 * edit saves immediately, so leaving and resuming never loses logged sets.
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
  // Short screens (iPhone SE class) keep Finish Workout at 48 pt so the dock
  // leaves more room for sets.
  const compactDock = useWindowDimensions().height < 700;
  // Week and phase never change during a session: read once, not on every
  // keystroke.
  const planId = w?.id;
  const plan = useMemo(
    () => (planId ? workoutPlan(r, planId) : undefined),
    [r, planId],
  );
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
  const rowSets = rows.map((row) => r.sets(row.id));
  const firstUnfinished = rows.find((_, i) => {
    const s = rowSets[i]!;
    return !s.length || s.some((set) => !set.completed);
  });
  const progress = exerciseProgress(rowSets);
  const paused = w.status === "paused";
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
  const overline = editing
    ? "Editing session"
    : completed
      ? "Completed session"
      : paused
        ? "Workout paused"
        : "Workout in progress";
  return (
    <SafeAreaView
      edges={
        reviewing
          ? ["top", "left", "right", "bottom"]
          : ["top", "left", "right"]
      }
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <WorkoutBackdrop />
      <SetFocusProvider>
        <WeightFillProvider enabled={!completed}>
          <WorkoutTopBar
            onBack={() =>
              editing ? cancelEdit(returnToTraining) : returnToTraining()
            }
          >
            {reviewing && (
              <OutlineButton
                title="Edit"
                accessibilityLabel="Edit workout"
                icon="create-outline"
                compact
                onPress={startEdit}
              />
            )}
            <OverflowMenu
              label="Workout options"
              title={w.name}
              actions={menu}
              renderTrigger={MenuSquare}
            />
          </WorkoutTopBar>
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
                paddingHorizontal: forge.spacing.margin,
                paddingTop: 4,
                paddingBottom: 24,
                gap: forge.spacing.cardGap,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
            >
              <WorkoutHero
                overline={overline}
                overlineTone={
                  editing || !(completed || paused) ? "accent" : "secondary"
                }
                title={workoutTitle(w.name)}
                plan={plan}
                status={status}
                statusTone={editing ? "accent" : "secondary"}
              />
              {!completed && (
                <SessionCard
                  workout={w}
                  onPause={() => mutate(() => r.pauseWorkout(w.id))}
                />
              )}
              {!completed && rows.length > 0 && (
                <ProgressCard
                  done={progress.done}
                  total={progress.total}
                  ratio={progress.ratio}
                />
              )}
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
                <FText variant="body" tone="secondary">
                  {reviewing
                    ? "No exercises were logged in this workout."
                    : "Add your first exercise to start logging."}
                </FText>
              )}
              {!reviewing && (
                <OutlineButton
                  title="Add exercise"
                  icon="add"
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
                  paddingHorizontal: forge.spacing.margin,
                  paddingVertical: 10,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.cardBorder,
                  backgroundColor: c.bg,
                }}
              >
                <View style={{ flex: 1 }}>
                  <OutlineButton
                    title="Cancel"
                    accessibilityLabel="Cancel editing"
                    onPress={() => cancelEdit()}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CtaButton
                    title="Save"
                    accessibilityLabel="Save changes"
                    icon="checkmark"
                    compact
                    onPress={saveEdit}
                  />
                </View>
              </SafeAreaView>
            )}
            {!completed && (
              <SafeAreaView
                edges={{ bottom: "maximum" }}
                style={{
                  gap: forge.spacing.tight,
                  paddingHorizontal: forge.spacing.margin,
                  paddingVertical: 10,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.cardBorder,
                  backgroundColor: c.bg,
                }}
              >
                {/* A paused workout offers Resume right where the rest timer
                  sits; Finish Workout stays the single primary action. */}
                {paused ? (
                  <OutlineButton
                    title="Resume"
                    accessibilityLabel="Resume workout"
                    icon="play"
                    tone="ember"
                    onPress={() => mutate(() => r.pauseWorkout(w.id))}
                  />
                ) : (
                  <RestTimer />
                )}
                {/* While typing on Android the dock sits on the keyboard: keep
                  the rest timer, hide Finish. On iOS the keyboard covers the
                  dock and its toolbar shows the rest timer. */}
                {!(Platform.OS === "android" && keyboard) && (
                  <CtaButton
                    title="Finish Workout"
                    accessibilityLabel="Finish workout"
                    icon="flag"
                    compact={compactDock}
                    onPress={finish}
                  />
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
