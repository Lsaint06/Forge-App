import React, { useState } from "react";
import { View } from "react-native";
import { FText } from "../../components/reforge";
import { experienceChoices, goalChoices } from "../../domain/profile";
import { programKey, publishedPrograms } from "../../domain/programs/model";
import {
  revealFor,
  supportedDays,
  trainingAnswers,
  trainingComplete,
  trainingMissing,
  type Progress,
} from "../../domain/onboarding/journey";
import { programLibrary } from "../../programs";
import { forge } from "../../theme";
import type { SetupAccount } from "./account";
import { DayTiles, OptionCards, RestDayPicker } from "./choices";
import { Question, StepFrame } from "./frame";
import { StepCta, StepIssue } from "./parts";
import { tick, type OnboardingStore } from "./store";

const list = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// Step 2 of 3 (Phase 9.2): what Forge Paths' recommendation actually reads:
// experience, goal and days a week, plus the rest day its week is arranged
// around. Only the days a week Forge Paths has programs for are offered.
// Each answer is saved the moment it is chosen. No equipment question:
// equipment isn't an input to the recommendation (decision F13).
export function Training({
  store,
  progress,
  account,
  banner,
  error,
  onBack,
  onChoose,
  onContinue,
}: {
  store: OnboardingStore;
  progress: Progress;
  account?: SetupAccount;
  banner?: React.ReactNode;
  error?: string;
  onBack: () => void;
  onChoose: (progress: Progress) => void;
  onContinue: (revealed: string) => void;
}) {
  const library = programLibrary;
  const answers = trainingAnswers(store.profile, progress, library);
  const days = supportedDays(library, answers.experience, answers.goal);
  const complete = trainingComplete(answers);
  const missing = trainingMissing(answers);
  const count = publishedPrograms(library).length;
  const [problem, setProblem] = useState<string>();

  const choose = (values: Parameters<OnboardingStore["saveProfile"]>[0]) => {
    tick();
    setProblem(undefined);
    return store.saveProfile(values);
  };
  function next() {
    const reveal = revealFor(
      store.profile,
      { ...progress, stage: "reveal" },
      library,
    );
    if (reveal) onContinue(programKey(reveal.program));
    else
      setProblem(
        "Forge Paths has no program for these answers. Choose different days a week.",
      );
  }

  return (
    <StepFrame
      eyebrow="Step 2 of 3"
      title="Your training"
      step={2}
      onBack={onBack}
      account={account}
      banner={banner}
      error={error}
      footer={
        <>
          <StepIssue text={problem} />
          <StepCta
            title="See my Forge Path"
            icon="flame-outline"
            disabled={!complete}
            accessibilityHint={
              complete ? undefined : `Choose ${list(missing)} first`
            }
            onPress={next}
          />
          {!complete && (
            <FText variant="label" tone="secondary" align="center">
              {`Still to choose: ${list(missing)}.`}
            </FText>
          )}
        </>
      }
    >
      <FText variant="body" tone="secondary">
        {`Four answers. Forge matches them to one of its ${count} Forge Paths, and you can change them any time.`}
      </FText>
      <View
        testID="onboarding-training"
        style={{ gap: forge.spacing.group * 2.5, paddingTop: 4 }}
      >
        <Question
          number={1}
          topic="Experience"
          question="Where are you in your training?"
        >
          <OptionCards
            options={experienceChoices}
            value={answers.experience}
            onChange={(experience) => choose({ experience })}
          />
        </Question>
        <Question number={2} topic="Goal" question="What are you training for?">
          <OptionCards
            options={goalChoices}
            value={answers.goal}
            onChange={(goal) => choose({ goal })}
          />
        </Question>
        <Question
          number={3}
          topic="Frequency"
          question="How many days a week can you train?"
          hint={`Every Forge Path is written for ${list(days.map(String))} training days a week.`}
        >
          <DayTiles
            days={days}
            value={answers.days}
            onChange={(d) => {
              if (choose({ frequency: d })) onChoose({ ...progress, days: d });
            }}
          />
        </Question>
        <Question
          number={4}
          topic="Rest day"
          question="Which day would you prefer to rest?"
          hint="Your training days are arranged around it. You can still train that day."
        >
          <RestDayPicker
            value={answers.restDay}
            onChange={(restDay) => choose({ restDay })}
          />
        </Question>
      </View>
    </StepFrame>
  );
}
