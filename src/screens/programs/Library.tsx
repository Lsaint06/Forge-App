import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import { ListRow } from "../../components/system";
import { planStatus } from "../../components/PlanRow";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeListRow,
  ForgeSubScreen,
  HeroCard,
  OutlineButton,
  RowDivider,
  SectionLabel,
} from "../../components/reforge";
import { useRepo } from "../../state";
import type { CuratedProgram } from "../../domain/programs/model";
import { recommendProgram } from "../../domain/programs/recommend";
import {
  familyFacts,
  familyKey,
  preferredVariant,
  programFacts,
  programFamilies,
  programTitle,
} from "../../domain/programs/presentation";
import { keepSegmentsTogether } from "../../domain/workout-display";
import { libraryPrograms, programLibrary } from "../../programs";
import { draftPreviewEnabled } from "../../programs/preview";
import { goBack } from "../../navigation";

// Forge Paths library (REFORGE, Phase 7.2C): your current plan, the
// recommendation as the hero, then the six program families (experience ×
// goal) by goal. Each family holds distinct authored programs for 3, 4 and 5
// days a week; choosing a family opens one of them, never a blend.

export function openProgram(p: Pick<CuratedProgram, "id" | "version">) {
  router.push({
    pathname: "/forge-paths/[programId]",
    params: { programId: p.id, version: String(p.version) },
  });
}

function Recommendation() {
  const r = useRepo();
  const c = useColors();
  const rec = recommendProgram(r.profile(), programLibrary);
  if (rec.kind === "incomplete")
    return (
      <ForgeEmpty
        title="Tell Forge where you are"
        detail="Choose your training experience and goal to get a recommendation. You can browse every program either way."
        action={
          <OutlineButton
            title="Complete training profile"
            icon="create-outline"
            onPress={() =>
              router.navigate({
                pathname: "/(tabs)/profile",
                params: { edit: "focus" },
              })
            }
          />
        }
      />
    );
  if (rec.kind === "none")
    return (
      <ForgeEmpty
        title="No match yet"
        detail={`No published program is written for ${rec.experience.toLowerCase()} lifters training for ${rec.goal.toLowerCase()} yet.${libraryPrograms().length ? " Choose any program below." : ""}`}
      />
    );
  return (
    <HeroCard minHeight={0}>
      <FText variant="overline" tone="accent">
        Recommended for you
      </FText>
      <FText variant="heroTitle" header numberOfLines={3}>
        {programTitle(rec.program.name)}
      </FText>
      <FText variant="body" tone="secondary">
        {keepSegmentsTogether(programFacts(rec.program))}
      </FText>
      <View style={{ gap: 6 }}>
        {rec.reasons.map((reason) => (
          <View key={reason} style={{ flexDirection: "row", gap: 8 }}>
            <Ionicons
              name="checkmark"
              size={16}
              color={c.emberHot}
              style={{ marginTop: 1 }}
            />
            <FText variant="label" tone="secondary" style={{ flex: 1 }}>
              {reason}
            </FText>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 4 }}>
        <CtaButton
          title="View program"
          onPress={() => openProgram(rec.program)}
        />
      </View>
    </HeroCard>
  );
}

// Development builds only: drafts open through the real details, enrollment
// and workout flow. Never rendered in production bundles.
function DraftPreview() {
  const [open, setOpen] = useState(false);
  const drafts = programLibrary.filter((p) => p.status === "draft");
  if (!drafts.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel title="Development build only" />
      <ForgeCard padding={0} gap={0}>
        <ListRow
          icon="flask-outline"
          title={
            open
              ? "Hide draft programs"
              : `Preview draft programs (${drafts.length})`
          }
          chevron={false}
          onPress={() => setOpen(!open)}
        />
        {open &&
          drafts.map((p) => (
            <React.Fragment key={`${p.id}@${p.version}`}>
              <RowDivider />
              <ListRow
                title={p.name}
                subtitle={programFacts(p)}
                accessibilityLabel={`Preview draft ${p.name}`}
                onPress={() => openProgram(p)}
              />
            </React.Fragment>
          ))}
      </ForgeCard>
      <FText variant="label" tone="secondary" style={{ paddingHorizontal: 2 }}>
        Drafts are hidden from users. Preview them to test enrollment and
        workouts on this device.
      </FText>
    </View>
  );
}

export default function Library() {
  const r = useRepo();
  const profile = r.profile();
  const published = libraryPrograms();
  const families = programFamilies(published);
  const rec = recommendProgram(profile, programLibrary);
  const plan = planStatus(r);
  const goals = [...new Set(families.map((f) => f.goal))];
  return (
    <ForgeSubScreen
      title="Forge Paths"
      eyebrow={`${published.length} ${published.length === 1 ? "program" : "programs"}`}
      onBack={() => goBack("/(tabs)/train")}
    >
      {plan && (
        <ForgeCard padding={0} gap={0}>
          <ForgeListRow
            icon="trail-sign-outline"
            title={plan.title}
            description={keepSegmentsTogether(plan.subtitle)}
            accessibilityLabel={`${plan.kind === "program" ? "Your program" : "Your Path"}: ${plan.title}`}
            onPress={plan.open}
          />
        </ForgeCard>
      )}
      <Recommendation />
      {published.length ? (
        goals.map((goal) => (
          <View key={goal} style={{ gap: 8 }}>
            <SectionLabel title={goal} />
            <ForgeCard padding={0} gap={0}>
              {families
                .filter((f) => f.goal === goal)
                .map((f, i) => {
                  const first =
                    rec.kind === "match" && familyKey(rec.program) === f.key
                      ? rec.program
                      : preferredVariant(f, profile.frequency);
                  return (
                    <ForgeListRow
                      key={f.key}
                      divider={i > 0}
                      icon={
                        goal === "Strength" ? "barbell-outline" : "body-outline"
                      }
                      title={f.name}
                      description={familyFacts(f)}
                      accessibilityLabel={`${f.name}, ${familyFacts(f)}`}
                      onPress={() => openProgram(first)}
                    />
                  );
                })}
            </ForgeCard>
          </View>
        ))
      ) : (
        <ForgeEmpty
          title="Programs are on the way"
          detail="Forge programs are written and reviewed by hand. Your workouts, templates and history keep working in the meantime."
        />
      )}
      {draftPreviewEnabled && <DraftPreview />}
    </ForgeSubScreen>
  );
}
