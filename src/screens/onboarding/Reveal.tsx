import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import {
  CtaButton,
  FText,
  ForgeCard,
  Gradient,
  InfoChip,
  OutlineButton,
  SectionLabel,
} from "../../components/reforge";
import { defaults } from "../../domain/types";
import { restDayNames } from "../../domain/profile";
import type { CuratedProgram } from "../../domain/programs/model";
import {
  afterReveal,
  revealFor,
  type Progress,
} from "../../domain/onboarding/journey";
import {
  revealFit,
  revealSessions,
  revealStats,
  revealTitle,
  revealWeek,
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
import { PhaseStrip, SessionDays } from "./week";

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
// fits, then the shape of their week, each training day by its focus and
// size, its phases, and the program's own equipment. Before a membership it
// is a preview (Phase 9.3, founder rule): no exercise, set, rep, effort or
// progression is shown; the program itself comes with Forge Premium. Read-
// only: no Start, no logging, no link into Forge Paths. Nothing is enrolled;
// Home keeps it for the athlete to start when they choose.
export function Reveal({
  store,
  progress,
  account,
  banner,
  error,
  onBack,
  onContinue,
}: {
  store: OnboardingStore;
  progress: Progress;
  account?: SetupAccount;
  banner?: React.ReactNode;
  error?: string;
  onBack: () => void;
  /** To the membership step, when there is one (Phase 9.3). */
  onContinue?: () => void;
}) {
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
  const name =
    store.profile.name !== defaults.name ? store.profile.name : undefined;
  const next = afterReveal(!!onContinue);

  return (
    <StepFrame
      eyebrow="Your Forge Path"
      step={3}
      onBack={onBack}
      account={account}
      banner={banner}
      error={error}
      footer={
        next === "enterForge" ? (
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
        ) : (
          <CtaButton
            title="Continue"
            icon="arrow-forward"
            onPress={onContinue!}
          />
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
          <SessionDays
            days={revealSessions(program, restDay)}
            testID="onboarding-sessions"
          />
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
          <ForgeCard gap={12}>
            <PhaseStrip phases={program.phases} />
          </ForgeCard>
        </Entrance>
      )}
      <Entrance delay={240} style={{ gap: 10 }}>
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
    </StepFrame>
  );
}
