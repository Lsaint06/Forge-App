import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Sheet, Txt, useColors } from "../../components/ui";
import { ListRow, ListSection } from "../../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeListRow,
  ForgeProgress,
  HeroCard,
  InfoChip,
  OutlineButton,
  SectionLabel,
  Tile,
} from "../../components/reforge";
import { useRepo } from "../../state";
import { templateLine } from "../../domain/training-display";
import type { Template } from "../../domain/types";
import { forge } from "../../theme";
import { nextWhen, progressText, type PlanNext, type TrainHero } from "./model";

// Train hub (Phase 7.2B): the dynamic hero, Start a workout and Training
// tools, after the Home reference (hero, cards) and the You reference
// (Tools & Settings list).

const Divider = () => {
  const c = useColors();
  return (
    <View
      style={{
        height: forge.border.card,
        marginLeft: forge.spacing.cardPadding,
        backgroundColor: c.cardDivider,
      }}
    />
  );
};

const stateText = {
  active: undefined,
  complete: { program: "Program complete", path: "Cycle complete" },
  paused: { program: "Paused", path: "Paused" },
  unavailable: {
    program: "Not available in this app version",
    path: "Not available in this app version",
  },
} as const;

/**
 * One hero, in priority order: the workout in progress (Resume), the
 * current plan (its next session and View plan), or Forge Paths.
 */
export function TrainHeroCard({
  hero,
  today,
  onResume,
  onStart,
  onOpenPlan,
  onBrowse,
}: {
  hero: TrainHero;
  today: string;
  onResume: () => void;
  onStart: (next: PlanNext) => void;
  onOpenPlan: () => void;
  onBrowse: () => void;
}) {
  const buttons = (children: React.ReactNode) => (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginTop: 4,
      }}
    >
      {children}
    </View>
  );
  const grow = { flexGrow: 1, flexBasis: 140 };
  if (hero.kind === "active")
    return (
      <HeroCard minHeight={0}>
        <FText variant="overline" tone={hero.paused ? "secondary" : "accent"}>
          {hero.paused ? "Workout paused" : "Workout in progress"}
        </FText>
        <FText variant="heroTitle" header numberOfLines={2}>
          {hero.title}
        </FText>
        {hero.plan && (
          <FText variant="body" tone="secondary" numberOfLines={2}>
            {hero.plan}
          </FText>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <InfoChip
            icon="checkmark-circle-outline"
            label={
              hero.sets.total
                ? `${hero.sets.done} of ${hero.sets.total} sets`
                : "No sets yet"
            }
          />
        </View>
        {buttons(
          <View style={grow}>
            <CtaButton title="Resume workout" icon="play" onPress={onResume} />
          </View>,
        )}
      </HeroCard>
    );
  if (hero.kind === "none")
    return (
      <HeroCard minHeight={0}>
        <FText variant="overline" tone="accent">
          No active plan
        </FText>
        <FText variant="heroTitle" header numberOfLines={2}>
          Find your program
        </FText>
        <FText variant="body" tone="secondary">
          {`${hero.programs} curated Forge Paths programs with a structured weekly schedule.`}
        </FText>
        {buttons(
          <View style={grow}>
            <CtaButton
              title="Browse Forge Paths"
              icon="compass-outline"
              onPress={onBrowse}
            />
          </View>,
        )}
      </HeroCard>
    );
  const { plan } = hero;
  const next = plan.next;
  const status = stateText[plan.state]?.[plan.kind];
  const progress = progressText(plan);
  return (
    <HeroCard minHeight={0}>
      <FText variant="overline" tone="accent">
        {plan.kind === "program" ? "Your program" : "Your Path"}
      </FText>
      <FText variant="heroTitle" header numberOfLines={2}>
        {plan.name}
      </FText>
      {(plan.context || status) && (
        <FText variant="body" tone="secondary" numberOfLines={2}>
          {status ?? plan.context}
        </FText>
      )}
      {plan.level && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <InfoChip icon="stats-chart-outline" label={plan.level} />
        </View>
      )}
      <View style={{ gap: 8 }}>
        {plan.total !== undefined && plan.total > 0 && (
          <ForgeProgress
            value={plan.done / plan.total}
            label={`${plan.name}: ${progress}`}
          />
        )}
        <FText variant="label" tone="secondary">
          {progress}
        </FText>
      </View>
      {next && (
        <Tile
          accessibilityLabel={`Up next: ${next.name}, ${nextWhen(next, today)}`}
        >
          <FText variant="overline" tone="secondary">
            Up next
          </FText>
          <FText variant="cardTitle" weight="700" numberOfLines={2}>
            {next.name}
          </FText>
          <FText variant="label" tone="secondary">
            {nextWhen(next, today)}
          </FText>
        </Tile>
      )}
      {buttons(
        next ? (
          <>
            <View style={grow}>
              <CtaButton
                title={
                  next.when === "upcoming" ? "Start early" : "Start workout"
                }
                icon="play"
                accessibilityLabel={
                  next.when === "upcoming"
                    ? `Start ${next.name} early`
                    : `Start ${next.name}`
                }
                onPress={() => onStart(next)}
              />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 110 }}>
              <OutlineButton title="View plan" onPress={onOpenPlan} />
            </View>
          </>
        ) : (
          <View style={grow}>
            <CtaButton title="View plan" onPress={onOpenPlan} />
          </View>
        ),
      )}
    </HeroCard>
  );
}

/** Empty workout, up to three template shortcuts and all templates. */
export function StartWorkoutCard({
  training,
  templates,
  total,
  onEmpty,
  onDetails,
  onStartTemplate,
  onAllTemplates,
}: {
  /** A workout is in progress: nothing else can start. */
  training: boolean;
  templates: Template[];
  total: number;
  onEmpty: () => void;
  onDetails: (t: Template) => void;
  onStartTemplate: (t: Template) => void;
  onAllTemplates: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <SectionLabel title="Start a workout" />
      <ForgeCard padding={0} gap={0}>
        <ListRow
          icon="add-circle-outline"
          title="Empty workout"
          subtitle={
            training
              ? "Finish your current workout first"
              : "Log freely, no plan"
          }
          accessibilityLabel="Start empty workout"
          disabled={training}
          chevron={false}
          trailing={
            training ? undefined : (
              <Ionicons name="play" size={18} color={c.emberHot} />
            )
          }
          onPress={onEmpty}
        />
        {templates.map((t) => (
          <React.Fragment key={t.id}>
            <Divider />
            <ListRow
              title={t.name}
              subtitle={templateLine(t.exercises)}
              accessibilityLabel={`${t.name} details`}
              chevron={false}
              onPress={() => onDetails(t)}
              trailing={
                <OutlineButton
                  title="Start"
                  compact
                  // One workout at a time: the hero resumes it.
                  disabled={training}
                  accessibilityLabel={`Start ${t.name}`}
                  onPress={() => onStartTemplate(t)}
                />
              }
            />
          </React.Fragment>
        ))}
        <Divider />
        <ListRow
          icon="copy-outline"
          title="Workout templates"
          subtitle={total ? undefined : "Save a workout you repeat"}
          value={total ? String(total) : undefined}
          onPress={onAllTemplates}
        />
      </ForgeCard>
    </View>
  );
}

/** Secondary training destinations (the You reference's list). */
export function TrainingTools({
  programs,
  exercises,
  onPaths,
  onLibrary,
  onCalendar,
}: {
  programs: number;
  exercises: number;
  onPaths: () => void;
  onLibrary: () => void;
  onCalendar: () => void;
}) {
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <SectionLabel title="Training tools" />
      <ForgeCard padding={0} gap={0}>
        <ForgeListRow
          icon="compass-outline"
          title="Forge Paths"
          description={`${programs} curated programs`}
          onPress={onPaths}
        />
        <ForgeListRow
          divider
          icon="library-outline"
          title="Exercise library"
          description={`${exercises.toLocaleString()} exercises`}
          onPress={onLibrary}
        />
        <ForgeListRow
          divider
          icon="calendar-outline"
          title="Training calendar"
          description="Schedule and past sessions"
          onPress={onCalendar}
        />
      </ForgeCard>
    </View>
  );
}

/** A template's exercises with Start (or Resume) and Edit or schedule. */
export function TemplateSheet({
  template,
  onClose,
  onDismiss,
  onStart,
  onResume,
  onEdit,
}: {
  template: Template | undefined;
  onClose: () => void;
  onDismiss: () => void;
  onStart: (t: Template) => void;
  /** Set while another workout is in progress: it can't start, resume that. */
  onResume?: () => void;
  onEdit: () => void;
}) {
  const r = useRepo();
  return (
    <Sheet
      visible={!!template}
      onClose={onClose}
      onDismiss={onDismiss}
      title={template?.name ?? ""}
      dismissOnBackdrop
    >
      {template && (
        <>
          <Txt tone="secondary">{templateLine(template.exercises)}</Txt>
          {!!template.notes && <Txt>{template.notes}</Txt>}
          <ListSection>
            {template.exercises.map((e, i) => (
              <ListRow
                key={`${e.exerciseId}-${i}`}
                title={r.exercise(e.exerciseId)?.name ?? "Unavailable exercise"}
                subtitle={`${e.sets} × ${e.reps}${e.repMax && e.repMax !== e.reps ? `–${e.repMax}` : ""} reps · ${e.rest}s rest`}
              />
            ))}
          </ListSection>
          <View style={{ gap: 8 }}>
            {onResume ? (
              <>
                <Txt variant="caption" tone="secondary">
                  A workout is already in progress. Finish it before starting
                  this one.
                </Txt>
                <Button
                  title="Resume current workout"
                  icon="play"
                  onPress={onResume}
                />
              </>
            ) : (
              <Button
                title="Start workout"
                icon="play"
                onPress={() => onStart(template)}
              />
            )}
            <Button
              title="Edit or schedule"
              variant="secondary"
              onPress={onEdit}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
