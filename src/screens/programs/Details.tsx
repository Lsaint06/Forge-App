import React, { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Txt,
  Button,
  Empty,
  Sheet,
  SegmentedControl,
} from "../../components/ui";
import {
  ListRow,
  ListSection,
  InfoSheet,
  useAfterSheet,
} from "../../components/system";
import {
  PhaseTimeline,
  ProgramStats,
  WeekStrip,
  WorkoutList,
  shortDay,
} from "../../components/programs";
import { useRepo, mutate, confirm } from "../../state";
import { localDate } from "../../domain/types";
import { addDays } from "../../domain/paths/model";
import { restDayName } from "../../domain/profile";
import { programKey, type CuratedProgram } from "../../domain/programs/model";
import { trainingWeekdays } from "../../domain/programs/schedule";
import {
  familyKey,
  programTitle,
  rangeText,
} from "../../domain/programs/presentation";
import { dayLabel } from "../../domain/training-display";
import { libraryPrograms, programLibrary } from "../../programs";
import { draftPreviewEnabled } from "../../programs/preview";
import { currentEnrollment, enrollProgram } from "../../data/programs";
import { currentPath } from "../../data/paths";
import { goBack } from "../../navigation";

// One curated program, exactly as authored: its week, phases, distinct
// workouts and progression, with Start program pinned at the bottom.

/** The program a link names; drafts resolve only in development builds. */
export function resolveProgram(id?: string, version?: string) {
  const candidates = programLibrary.filter(
    (p) => p.id === id && (p.status === "published" || draftPreviewEnabled),
  );
  if (version) return candidates.find((p) => p.version === Number(version));
  return libraryPrograms().find((p) => p.id === id);
}

function startDates(today = localDate()) {
  return [
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
}

function StartSheet({
  program,
  visible,
  onClose,
}: {
  program: CuratedProgram;
  visible: boolean;
  onClose: () => void;
}) {
  const r = useRepo();
  const sheet = useAfterSheet();
  const starts = startDates();
  const [start, setStart] = useState(starts[0]!.label);
  const chosen = starts.find((s) => s.label === start)!;
  const enrolled = currentEnrollment(r);
  const path = currentPath(r);
  const replacing = enrolled?.data.name ?? path?.data.name;
  const days = trainingWeekdays(program.weeklyPattern, r.profile().restDay)
    .slice()
    .sort((a, b) => a - b);
  function begin() {
    sheet.after(onClose, () => {
      const run = () => {
        enrollProgram(r, program, chosen.date, true);
        router.dismissTo("/forge-paths/current");
      };
      if (replacing)
        confirm(
          "Replace your current plan?",
          "Your current plan will be archived. Its history and every recorded workout are preserved.",
          run,
          { action: "Replace plan" },
        );
      else mutate(run);
    });
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismiss={sheet.onDismiss}
      title={programTitle(program.name)}
      dismissOnBackdrop
    >
      <SegmentedControl
        label="Start date"
        options={starts.map((s) => s.label)}
        value={start}
        onChange={setStart}
      />
      <Txt tone="secondary">
        {`Starts ${dayLabel(chosen.date)}. Suggested days: ${days.map(shortDay).join(" · ")}. Train whenever suits you.`}
      </Txt>
      {replacing && (
        <Txt tone="secondary">
          {`${replacing} will be archived. Its history and every recorded workout are preserved.`}
        </Txt>
      )}
      <Button
        title={`Start ${start === "Next Monday" ? "next Monday" : start.toLowerCase()}`}
        icon="play"
        onPress={begin}
      />
    </Sheet>
  );
}

export default function ProgramDetails() {
  const r = useRepo();
  const params = useLocalSearchParams<{
    programId?: string;
    version?: string;
  }>();
  const [program, setProgram] = useState(() =>
    resolveProgram(params.programId, params.version),
  );
  const [starting, setStarting] = useState(false);
  const [info, setInfo] = useState<"progression" | "about">();
  const back = () => goBack("/forge-paths");
  if (!program)
    return (
      <Screen title="Program unavailable" onBack={back}>
        <Empty
          title="This program isn't available"
          detail="It may belong to a newer or older version of Forge. Your history is preserved."
        />
      </Screen>
    );
  const draft = program.status === "draft";
  const variants = draft
    ? [program]
    : libraryPrograms().filter((p) => familyKey(p) === familyKey(program));
  const enrolled = currentEnrollment(r);
  const isCurrent =
    enrolled?.data.programId === program.id &&
    enrolled.data.programVersion === program.version;
  const restDay = restDayName(r.profile());
  const days = trainingWeekdays(program.weeklyPattern, r.profile().restDay)
    .slice()
    .sort((a, b) => a - b);
  const lf = program.lowerFatigue;
  return (
    <Screen
      key={programKey(program)}
      title={programTitle(program.name)}
      eyebrow={
        draft
          ? `Draft preview · version ${program.version}`
          : `${program.experience} · ${program.goal}`
      }
      onBack={back}
      footer={
        isCurrent ? (
          <Button
            title="Open your program"
            variant="secondary"
            onPress={() => router.dismissTo("/forge-paths/current")}
          />
        ) : (
          <Button
            title="Start program"
            icon="play"
            onPress={() => setStarting(true)}
          />
        )
      }
    >
      {variants.length > 1 && (
        <SegmentedControl
          label="Days a week"
          options={variants.map((p) => ({
            value: programKey(p),
            label: `${p.daysPerWeek} days`,
          }))}
          value={programKey(program)}
          onChange={(key) =>
            setProgram(variants.find((p) => programKey(p) === key))
          }
        />
      )}
      <ProgramStats program={program} />
      <View style={{ gap: 10 }}>
        <Txt variant="overline" tone="secondary" header>
          Your week
        </Txt>
        <WeekStrip days={days} restDay={r.profile().restDay} />
        <Txt variant="caption" tone="secondary">
          {days.map(shortDay).join(" · ")}
        </Txt>
        <Txt variant="caption" tone="secondary">
          {restDay
            ? `Arranged so ${restDay} stays a rest day. These are suggestions — train whenever suits you.`
            : "Choose a preferred rest day in your profile to arrange this around it."}
        </Txt>
      </View>
      <View style={{ gap: 10 }}>
        <Txt variant="overline" tone="secondary" header>
          Phases
        </Txt>
        <PhaseTimeline program={program} />
      </View>
      <View style={{ gap: 10 }}>
        <Txt variant="overline" tone="secondary" header>
          Workouts
        </Txt>
        <WorkoutList program={program} />
      </View>
      <ListSection title="About">
        <ListRow
          icon="trending-up-outline"
          title="How progression works"
          onPress={() => setInfo("progression")}
        />
        <ListRow
          icon="document-text-outline"
          title="About this program"
          onPress={() => setInfo("about")}
        />
      </ListSection>
      <InfoSheet
        visible={info === "progression"}
        onClose={() => setInfo(undefined)}
        title="How progression works"
        paragraphs={[
          program.progression,
          ...(lf
            ? [
                `Lower-fatigue sessions: about ${Math.round(lf.setReduction * 100)}% fewer working sets at ${rangeText(lf.rir)} RIR, with no load increase.`,
              ]
            : []),
        ]}
      />
      <InfoSheet
        visible={info === "about"}
        onClose={() => setInfo(undefined)}
        title={program.name}
        paragraphs={[
          program.summary,
          program.description,
          `Equipment: ${program.equipment.join(", ")}`,
          `Version ${program.version}`,
        ]}
      />
      {!isCurrent && (
        <StartSheet
          program={program}
          visible={starting}
          onClose={() => setStarting(false)}
        />
      )}
    </Screen>
  );
}
