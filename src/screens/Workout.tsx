import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Platform,
  Keyboard,
  InputAccessoryView,
  KeyboardAvoidingView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../platform/alert";
import { router, useLocalSearchParams } from "expo-router";
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
} from "../components/ui";
import { OverflowMenu, type MenuAction } from "../components/system";
import { ExercisePicker } from "../components/ExercisePicker";
import { elapsedSeconds, volume, kgToLb } from "../domain/metrics";
import { timer, workoutTitle } from "../domain/workout-display";
import { programWorkoutContext } from "../data/programs";
import WorkoutExerciseCard from "../components/WorkoutExerciseCard";
import {
  SetFocusProvider,
  useSetFocus,
  SET_KEYBOARD_ID,
} from "../components/SetGrid";
import { restNotification, cancelRestNotification } from "../notifications";
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
  useEffect(() => {
    if (deadline > 0 && left === 0) {
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
        accessibilityLabel={`Rest, ${timer(left)} remaining`}
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
            accessibilityLabel={`Rest, ${timer(left)} remaining`}
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
  const w = workoutId ? r.workout(workoutId) : r.active();
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState<"name" | "notes" | "rest" | "template">();
  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const keyboard = useKeyboardVisible();
  function returnToTraining() {
    router.back();
  }
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
  const completed = w.status === "completed";
  const units = r.profile().units;
  const moved = volume(sets);
  const volumeText =
    moved > 0
      ? `${Math.round(units === "lb" ? kgToLb(moved) : moved).toLocaleString()} ${units}`
      : undefined;
  const lowerFatigue = !!programWorkoutContext(r, w.id)?.log.lowerFatigue;
  // One short line under the title; the most useful facts first so it fits.
  const status = (
    completed
      ? [
          `Completed ${new Date(w.finishedAt ?? w.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
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
    if (!all.some((s) => s.completed)) {
      Alert.alert(
        "No completed sets",
        "Mark at least one set complete before finishing.",
      );
      return;
    }
    confirm(
      "Finish workout?",
      `${all.filter((s) => s.completed).length} completed sets will be included in your progress.`,
      () => {
        r.finishWorkout(w!.id);
        r.setSetting("restDeadline", "0");
        void cancelRestNotification().catch(() => {});
        returnToTraining();
      },
    );
  }
  const menu: MenuAction[] = [
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
          "Delete this workout?",
          "This cannot be undone. Export a backup first if you need to keep it.",
          () => {
            r.deleteWorkout(w.id);
            returnToTraining();
          },
        ),
    },
  );
  return (
    <SafeAreaView
      edges={
        completed
          ? ["top", "left", "right", "bottom"]
          : ["top", "left", "right"]
      }
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <SetFocusProvider>
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
            onPress={returnToTraining}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" header numberOfLines={1}>
              {workoutTitle(w.name)}
            </Txt>
            <Txt variant="caption" tone="secondary" numberOfLines={1}>
              {status}
            </Txt>
          </View>
          <SessionClock workout={w} />
          <OverflowMenu label="Workout options" title={w.name} actions={menu} />
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
            {rows.map((row, i) => (
              <WorkoutExerciseCard
                key={row.id}
                row={row}
                index={i}
                count={rows.length}
                initialExpanded={row.id === firstUnfinished?.id}
                completedWorkout={completed}
              />
            ))}
            {!rows.length && (
              <Txt tone="secondary">
                Add your first exercise to start logging.
              </Txt>
            )}
            <Button
              title="Add exercise"
              icon="add"
              variant="secondary"
              onPress={() => setPicker(true)}
            />
          </ScrollView>
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
    </SafeAreaView>
  );
}
