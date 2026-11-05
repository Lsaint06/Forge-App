import React, { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import { InfoSheet } from "../../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeListRow,
  Gradient,
  InfoChip,
  OutlineButton,
  RowDivider,
  SectionLabel,
} from "../../components/reforge";
import { PhaseTimeline, WorkoutRow } from "../../components/programs";
import { defaults } from "../../domain/types";
import { restDayNames } from "../../domain/profile";
import { rangeText } from "../../domain/programs/presentation";
import type { CuratedProgram } from "../../domain/programs/model";
import {
  afterReveal,
  revealFor,
  revealWorkouts,
  type Progress,
} from "../../domain/onboarding/journey";
import {
  RIR_MEANING,
  RIR_SHORT,
  plainDescription,
  plainSummary,
  progressionParts,
  revealFit,
  revealStats,
  revealTitle,
  revealWeek,
  sentences,
  type FitRow,
  type RevealDay,
  type RevealStat,
} from "../../domain/onboarding/reveal";
import { programLibrary } from "../../programs";
import { forge } from "../../theme";
import type { SetupAccount } from "./account";
import { StepFrame } from "./frame";
import { Entrance } from "./motion";
import type { OnboardingStore } from "./store";

/** "4- and 5-day versions", "a 4-day version". */
function versions(days: number[]) {
  if (days.length === 1) return `a ${days[0]}-day version`;
  return `${days.slice(0, -1).join("-, ")}- and ${days.at(-1)}-day versions`;
}

/** The athlete's answers, each matched by the program: a short spec list. */
function Fit({ rows, reasons }: { rows: FitRow[]; reasons: string[] }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`Why it fits: ${reasons.join(" ")}`}
      style={{ gap: 6 }}
    >
      <FText variant="label" tone="secondary">
        Matched to your answers
      </FText>
      <View
        style={{
          borderRadius: forge.radii.card + 2,
          borderWidth: forge.border.card,
          borderColor: c.cardBorder,
          backgroundColor: c.cardRaised,
          paddingHorizontal: 12,
        }}
      >
        {rows.map((row, i) => (
          <View
            key={row.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              paddingVertical: 8,
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: c.cardBorder,
            }}
          >
            <Ionicons name="checkmark-circle" size={18} color={c.emberHot} />
            <FText variant="label" tone="secondary">
              {row.label}
            </FText>
            <FText
              variant="body"
              weight="700"
              align="right"
              style={{ flex: 1 }}
            >
              {row.value}
            </FText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The program's shape: three numbers between hairlines. */
function Stats({ stats }: { stats: RevealStat[] }) {
  const c = useColors();
  return (
    <View
      testID="onboarding-stats"
      style={{ flexDirection: "row", alignItems: "stretch" }}
    >
      {stats.map((s, i) => (
        <View
          key={s.label}
          accessible
          accessibilityLabel={`${s.label}: ${s.value}`}
          style={{
            flex: 1,
            gap: 2,
            paddingLeft: i === 0 ? 0 : 14,
            borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
            borderLeftColor: c.cardBorder,
          }}
        >
          <FText variant="cardMetric" numberOfLines={1} fit>
            {s.value}
          </FText>
          <FText variant="label" tone="secondary">
            {s.label}
          </FText>
        </View>
      ))}
    </View>
  );
}

/** Monday to Sunday: the session each training day holds, and the rest day. */
function Week({ days }: { days: RevealDay[] }) {
  const c = useColors();
  const training = days.filter((d) => d.session !== undefined);
  const rest = days.find((d) => d.rest);
  return (
    <View
      testID="onboarding-week"
      accessible
      accessibilityLabel={`Training days: ${training
        .map((d) => restDayNames[d.day])
        .join(", ")}.${rest ? ` Rest day: ${restDayNames[rest.day]}.` : ""}`}
      style={{ flexDirection: "row", gap: 6 }}
    >
      {days.map((d) => {
        const on = d.session !== undefined;
        return (
          <View key={d.day} style={{ flex: 1, gap: 6, alignItems: "center" }}>
            <FText
              variant="label"
              weight={on ? "700" : "500"}
              tone={on ? "primary" : "secondary"}
              numberOfLines={1}
            >
              {restDayNames[d.day]!.slice(0, 3)}
            </FText>
            <View
              style={{
                alignSelf: "stretch",
                height: 46,
                borderRadius: forge.radii.card + 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: on ? c.emberTint : "transparent",
                borderWidth: forge.border.active,
                borderColor: on ? c.emberMuted : c.cardBorder,
              }}
            >
              {on ? (
                <FText variant="cardTitle" weight="800" tone="accent">
                  {String(d.session)}
                </FText>
              ) : d.rest ? (
                <Ionicons name="moon-outline" size={16} color={c.text3} />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The first layer: who it's for, what it is, why it fits, its shape. */
function Hero({
  name,
  program,
  restDay,
  reasons,
}: {
  name?: string;
  program: CuratedProgram;
  restDay: number;
  reasons: string[];
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const size = width < 390 ? 32 : 36;
  return (
    <View
      style={{
        borderRadius: forge.radii.card + 6,
        borderWidth: forge.border.active,
        borderColor: c.emberMuted,
        backgroundColor: c.cardBg,
        overflow: "hidden",
      }}
    >
      <Gradient
        kind="radial"
        center={{ x: 0.85, y: 0.1 }}
        radius={{ x: 0.75, y: 0.45 }}
        stops={[
          { offset: 0, color: c.emberHot, opacity: 0.26 },
          { offset: 1, color: c.emberHot, opacity: 0 },
        ]}
      />
      <Gradient
        stops={[
          { offset: 0, color: c.sheen },
          { offset: 0.4, color: c.sheen, opacity: 0 },
        ]}
      />
      <View
        testID="onboarding-reveal"
        style={{ padding: 20, gap: forge.spacing.margin + 4 }}
      >
        <View style={{ gap: 10 }}>
          <FText variant="overline" tone="accent">
            {name ? `Built for ${name}` : "Built for you"}
          </FText>
          <FText
            variant="heroTitle"
            header
            style={{ fontSize: size, lineHeight: size + 1 }}
          >
            {revealTitle(program)}
          </FText>
          <View
            style={{
              width: 44,
              height: 3,
              borderRadius: 2,
              backgroundColor: c.emberHot,
            }}
          />
        </View>
        <Fit rows={revealFit(program, restDay)} reasons={reasons} />
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: c.cardBorder,
          }}
        />
        <Stats stats={revealStats(program)} />
      </View>
    </View>
  );
}

// Step 3 of 3 (Phase 9.2): the Forge Path the real engine recommends for the
// athlete's answers (`recommendProgram`), in layers: who it's for and why it
// fits, then the shape of their week and its phases, then every workout
// with its exercises, sets and reps, and the program's own equipment. Read-
// only: no Start, no logging, no link into Forge Paths. Nothing is enrolled;
// Home keeps it for the athlete to start when they choose.
export function Reveal({
  store,
  progress,
  account,
  banner,
  error,
  onBack,
}: {
  store: OnboardingStore;
  progress: Progress;
  account?: SetupAccount;
  banner?: React.ReactNode;
  error?: string;
  onBack: () => void;
}) {
  const c = useColors();
  const [info, setInfo] = useState<"progression" | "about">();
  const reveal = revealFor(store.profile, progress, programLibrary);
  if (!reveal)
    return (
      <StepFrame
        eyebrow="Your Forge Path"
        step={3}
        onBack={onBack}
        account={account}
        banner={banner}
        error={error}
        footer={<OutlineButton title="Change my answers" onPress={onBack} />}
      >
        <FText variant="body" tone="secondary">
          Forge Paths has no program for these answers. Choose different days a
          week.
        </FText>
      </StepFrame>
    );
  const { program, reasons, alternatives, restDay } = reveal;
  const workouts = revealWorkouts(program);
  const everyPhase = (phases: number[]) =>
    phases.length === program.phases.length;
  const uniform = workouts.every((w) => everyPhase(w.phases));
  const name =
    store.profile.name !== defaults.name ? store.profile.name : undefined;
  const lf = program.lowerFatigue;
  const progression = progressionParts(program.progression);
  const next = afterReveal();

  return (
    <StepFrame
      eyebrow="Your Forge Path"
      step={3}
      onBack={onBack}
      account={account}
      banner={banner}
      error={error}
      footer={
        next === "enterForge" && (
          <>
            <CtaButton
              title="Enter Forge"
              icon="arrow-forward"
              onPress={store.finish}
            />
            <FText variant="label" tone="secondary" align="center">
              Nothing starts until you choose. Your Forge Path waits on Home.
            </FText>
          </>
        )
      }
    >
      <Entrance distance={18}>
        <Hero
          name={name}
          program={program}
          restDay={restDay}
          reasons={reasons}
        />
      </Entrance>
      <Entrance delay={120} style={{ gap: 10 }}>
        <SectionLabel title="Your week" />
        <ForgeCard gap={12}>
          <Week days={revealWeek(program, restDay)} />
          <FText variant="label" tone="secondary">
            {`Your ${program.daysPerWeek} workouts run in order around your rest day on ${restDayNames[restDay]}. They're suggestions: train whenever suits you.`}
          </FText>
          {alternatives.length > 0 && (
            <FText variant="label" tone="secondary">
              {`Forge Paths also has ${versions(
                alternatives.map((p) => p.daysPerWeek).sort((a, b) => a - b),
              )} you can switch to any time.`}
            </FText>
          )}
        </ForgeCard>
      </Entrance>
      {program.phases.length > 1 && (
        <Entrance delay={180} style={{ gap: 10 }}>
          <SectionLabel
            title={
              program.durationWeeks
                ? `${program.durationWeeks}-week structure`
                : "Phases"
            }
          />
          <PhaseTimeline program={program} />
          <FText
            variant="label"
            tone="secondary"
            style={{ paddingHorizontal: 2 }}
          >
            {RIR_SHORT}
          </FText>
        </Entrance>
      )}
      <Entrance delay={240} style={{ gap: 10 }}>
        <SectionLabel title="Your workouts" />
        <ForgeCard padding={0} gap={0}>
          {workouts.map((w, i) => (
            <React.Fragment key={`${w.session.id}-${i}`}>
              {i > 0 && <RowDivider />}
              <WorkoutRow
                session={w.session}
                initiallyOpen={i === 0}
                detail={
                  uniform
                    ? `Day ${w.day}`
                    : `Day ${w.day} · ${
                        everyPhase(w.phases)
                          ? "Every phase"
                          : w.phases
                              .map((p) => program.phases[p]!.name)
                              .join(", ")
                      }`
                }
              />
            </React.Fragment>
          ))}
        </ForgeCard>
        {!uniform && (
          <FText
            variant="label"
            tone="secondary"
            style={{ paddingHorizontal: 2 }}
          >
            Some workouts change between phases; each version is listed with its
            phases.
          </FText>
        )}
      </Entrance>
      <Entrance delay={300} style={{ gap: 10 }}>
        <SectionLabel title="What you'll need" />
        <View
          testID="onboarding-equipment"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {program.equipment.map((item) => (
            <InfoChip key={item} label={item} />
          ))}
        </View>
      </Entrance>
      <Entrance delay={340} style={{ gap: 10 }}>
        <SectionLabel title="More about it" />
        <ForgeCard padding={0} gap={0}>
          <ForgeListRow
            icon="trending-up-outline"
            title="How progression works"
            onPress={() => setInfo("progression")}
          />
          <ForgeListRow
            divider
            icon="document-text-outline"
            title="About this program"
            onPress={() => setInfo("about")}
          />
        </ForgeCard>
      </Entrance>
      <InfoSheet
        visible={info === "progression"}
        onClose={() => setInfo(undefined)}
        title="How progression works"
      >
        <View style={{ gap: forge.spacing.group }}>
          <View
            style={{
              gap: 4,
              padding: 12,
              borderRadius: forge.radii.card + 2,
              borderWidth: forge.border.card,
              borderColor: c.emberMuted,
              backgroundColor: c.emberTint,
            }}
          >
            <FText variant="label" weight="700" tone="accent">
              Effort, measured in RIR
            </FText>
            <FText variant="label">{RIR_MEANING}</FText>
          </View>
          {progression.lead && (
            <FText variant="cardTitle" weight="700">
              {progression.lead}
            </FText>
          )}
          {[
            ...progression.points,
            ...(lf && !/lower-fatigue session/i.test(program.progression)
              ? [
                  `Whenever fatigue builds up you can choose a lower-fatigue session: about ${Math.round(lf.setReduction * 100)}% fewer working sets at ${rangeText(lf.rir)} RIR, with no load increase.`,
                ]
              : []),
          ].map((s) => (
            <View key={s} style={{ flexDirection: "row", gap: 10 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  marginTop: 8,
                  backgroundColor: c.emberHot,
                }}
              />
              <FText variant="body" tone="secondary" style={{ flex: 1 }}>
                {s}
              </FText>
            </View>
          ))}
        </View>
      </InfoSheet>
      <InfoSheet
        visible={info === "about"}
        onClose={() => setInfo(undefined)}
        title={program.name}
        paragraphs={[
          plainSummary(program),
          ...sentences(plainDescription(program)),
          `Equipment: ${program.equipment.join(", ")}.`,
        ]}
      />
    </StepFrame>
  );
}
