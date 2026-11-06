import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useColors } from "../components/ui";
import { OverflowMenu } from "../components/system";
import {
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeSubScreen,
  OutlineButton,
  SectionLabel,
} from "../components/reforge";
import { useRepo, useApp, mutate, confirm } from "../state";
import { volume } from "../domain/metrics";
import { localDate } from "../domain/types";
import { byMonth, workoutTime } from "../domain/training-display";
import {
  historyRow,
  sharedDays,
  type HistoryRow,
} from "../domain/presentation/history";
import { goBack } from "../navigation";
import { blockIfTraining } from "../startGuard";
import { forge } from "../theme";

const PAGE = 60;

// Workout history (REFORGE, Phase 7.5E): every completed workout, newest
// first and grouped by month, as a training journal. A row opens the
// workout review; Repeat and Delete live in each row's menu. Long histories
// show the newest 60 first; "Show earlier" reveals the rest in the same
// order, so nothing is hidden or reordered.
export default function History() {
  const r = useRepo();
  const revision = useApp((s) => s.revision);
  const units = r.profile().units;
  const [shown, setShown] = useState(PAGE);
  // The repository is mutable; `revision` changes whenever stored data does
  // (a deletion, an edit or a repeat), so the list is rebuilt then.
  const done = useMemo(
    () => r.workouts().filter((w) => w.status === "completed"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, revision],
  );
  // Only the shown page is summarised: two reads per row, never the whole
  // history at once.
  const months = useMemo(() => {
    const shared = sharedDays(done);
    return byMonth(done.slice(0, shown)).map((month) => ({
      key: month.key,
      title: month.title,
      rows: month.items.map((w) =>
        historyRow(
          w,
          {
            exercises: r.workoutExercises(w.id).length,
            volumeKg: volume(r.workoutSets(w.id)),
          },
          units,
          shared.has(localDate(workoutTime(w))),
        ),
      ),
    }));
  }, [r, done, shown, units]);
  return (
    <ForgeSubScreen
      title="Workout history"
      eyebrow={`${done.length} ${done.length === 1 ? "workout" : "workouts"}`}
      onBack={() => goBack("/(tabs)/profile")}
    >
      {!done.length && (
        <ForgeEmpty
          title="No workouts yet"
          detail="Finished workouts appear here with their date, duration and volume."
          action={
            <OutlineButton
              title="Go to Train"
              icon="barbell-outline"
              onPress={() => router.navigate("/(tabs)/train")}
            />
          }
        />
      )}
      {months.map((month) => (
        <View key={month.key} style={{ gap: forge.spacing.tight }}>
          <SectionLabel title={month.title} />
          <ForgeCard padding={0} gap={0}>
            {month.rows.map((row, i) => (
              <HistoryItem
                key={row.id}
                row={row}
                divider={i > 0}
                onRepeat={() => {
                  if (blockIfTraining(r)) return;
                  const copy = mutate(() => r.duplicateWorkout(row.id));
                  if (copy) router.push("/workout");
                }}
                onDelete={() =>
                  confirm(
                    "Delete workout?",
                    "The session and all its sets are removed from your history and progress. This cannot be undone.",
                    () => r.deleteWorkout(row.id),
                    { action: "Delete workout" },
                  )
                }
              />
            ))}
          </ForgeCard>
        </View>
      ))}
      {done.length > shown && (
        <OutlineButton
          title={`Show earlier (${done.length - shown})`}
          onPress={() => setShown((n) => n + PAGE)}
        />
      )}
    </ForgeSubScreen>
  );
}

/**
 * One workout: a date block (weekday and day), the title and what was
 * recorded, opening the review; the row's menu holds Repeat and Delete.
 */
function HistoryItem({
  row,
  divider,
  onRepeat,
  onDelete,
}: {
  row: HistoryRow;
  divider: boolean;
  onRepeat: () => void;
  onDelete: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingRight: 6,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Review ${row.name}, ${row.day}`}
        accessibilityHint={row.meta.join(", ")}
        onPress={() =>
          router.push({ pathname: "/workout", params: { id: row.id } })
        }
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 64,
          flexDirection: "row",
          alignItems: "center",
          gap: forge.spacing.group,
          paddingVertical: 10,
          paddingLeft: forge.spacing.cardPadding,
          backgroundColor: pressed ? c.cardRaised : "transparent",
        })}
      >
        <View style={{ width: 44, alignItems: "center", gap: 1 }}>
          <FText variant="overline" tone="accent" numberOfLines={1}>
            {row.date.weekday}
          </FText>
          <FText variant="cardMetric" numberOfLines={1}>
            {row.date.number}
          </FText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="cardTitle" weight="700" numberOfLines={2}>
            {row.title}
          </FText>
          <FText variant="label" tone="secondary">
            {row.meta.join(" · ")}
          </FText>
        </View>
      </Pressable>
      <OverflowMenu
        label={`Options for ${row.name}, ${row.day}`}
        title={row.name}
        actions={[
          { label: "Repeat workout", icon: "repeat", onPress: onRepeat },
          {
            label: "Delete workout",
            icon: "trash-outline",
            destructive: true,
            onPress: onDelete,
          },
        ]}
      />
    </View>
  );
}
