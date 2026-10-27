import React, { useMemo, useState } from "react";
import { router } from "expo-router";
import {
  CardHeader,
  ForgeEmpty,
  ForgeListRow,
  ForgeSubScreen,
} from "../components/reforge";
import { InfoSheet } from "../components/system";
import { useRepo, useApp } from "../state";
import { progressModel, type ExerciseProgress } from "../data/progress";
import {
  estimateText,
  recordHeadline,
  setText,
} from "../domain/progress/format";
import { dayLabel } from "../domain/training-display";
import { keepSegmentsTogether } from "../domain/workout-display";
import { goBack } from "../navigation";
import { recordInfo } from "../domain/progress/explain";
import { RowsCard } from "./progress/sections";

// Every exercise's current bests and the records set most recently (REFORGE
// since Phase 7.4F). Derived from history on demand: edits and deletions are
// always reflected.

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

function bests(e: ExerciseProgress, units: "kg" | "lb") {
  const r = e.records;
  if (e.kind === "load")
    return [
      r.heaviest && `Heaviest ${setText(r.heaviest, units)}`,
      r.e1rm && `Est. 1RM ${estimateText(r.e1rm.value, units)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  return r.mostReps ? `Most reps ${r.mostReps.reps}` : "";
}

export default function Records() {
  const r = useRepo();
  const revision = useApp((s) => s.revision);
  const units = r.profile().units;
  const [info, setInfo] = useState(false);
  // The repository is mutable; `revision` changes whenever stored data does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => progressModel(r), [r, revision]);
  const exercises = [...model.exercises.values()]
    .filter((e) => bests(e, units))
    .sort((a, b) => a.name.localeCompare(b.name));
  const howRecordsWork = (
    <RowsCard header={<CardHeader title="About records" />}>
      <ForgeListRow
        icon="information-circle-outline"
        title="How records work"
        onPress={() => setInfo(true)}
      />
    </RowsCard>
  );
  return (
    <ForgeSubScreen
      title="Records"
      eyebrow={`${model.events.length} ${model.events.length === 1 ? "record" : "records"} set`}
      eyebrowTone="accent"
      onBack={() => goBack("/(tabs)/progress")}
    >
      {!exercises.length ? (
        <ForgeEmpty
          title="No records yet"
          detail="Your first session with an exercise sets the baseline. Beat it, and your record appears here."
        />
      ) : (
        <>
          {model.events.length > 0 && (
            <RowsCard
              testID="recent-records"
              header={<CardHeader title="Recent records" />}
            >
              {model.events.slice(0, 10).map((e, i) => {
                const h = recordHeadline(e, units);
                const name = model.info(e.exerciseId).name;
                return (
                  <ForgeListRow
                    key={`${e.exerciseId}-${e.workoutId}`}
                    icon="trophy"
                    title={name}
                    description={keepSegmentsTogether(
                      `${h.label} · ${h.value}`,
                    )}
                    value={shortDate(e.date)}
                    divider={i > 0}
                    accessibilityLabel={`${name}, ${h.label} ${h.value}, ${dayLabel(e.date)}. Review workout`}
                    onPress={() =>
                      router.push({
                        pathname: "/workout",
                        params: { id: e.workoutId },
                      })
                    }
                  />
                );
              })}
            </RowsCard>
          )}
          <RowsCard
            testID="your-bests"
            header={
              <CardHeader
                title="Your bests"
                trailing={`${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`}
              />
            }
          >
            {exercises.map((e, i) => (
              <ForgeListRow
                key={e.id}
                icon="podium-outline"
                title={e.name}
                description={keepSegmentsTogether(bests(e, units))}
                divider={i > 0}
                onPress={() =>
                  router.push({ pathname: "/exercise", params: { id: e.id } })
                }
              />
            ))}
          </RowsCard>
        </>
      )}
      {howRecordsWork}
      <InfoSheet
        visible={info}
        onClose={() => setInfo(false)}
        title="How records work"
        paragraphs={recordInfo}
      />
    </ForgeSubScreen>
  );
}
