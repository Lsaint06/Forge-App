import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen,
  Card,
  Txt,
  Button,
  Empty,
  useColors,
} from "../../components/ui";
import { ListRow, ListSection } from "../../components/system";
import { PlanRow, planStatus } from "../../components/PlanRow";
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
import { libraryPrograms, programLibrary } from "../../programs";
import { draftPreviewEnabled } from "../../programs/preview";
import { goBack } from "../../navigation";

// Forge Paths library: the recommendation, then the six program families
// (experience × goal). Each family holds distinct authored programs for 3, 4
// and 5 days a week; choosing a family opens one of them, never a blend.

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
      <Card>
        <Txt variant="headline">Tell Forge where you are</Txt>
        <Txt tone="secondary">
          Choose your training experience and goal to get a recommendation. You
          can browse every program either way.
        </Txt>
        <Button
          title="Complete training profile"
          variant="secondary"
          icon="create-outline"
          onPress={() => router.push("/(tabs)/profile")}
        />
      </Card>
    );
  if (rec.kind === "none")
    return (
      <Card>
        <Txt variant="headline">No match yet</Txt>
        <Txt tone="secondary">
          {`No published program is written for ${rec.experience.toLowerCase()} lifters training for ${rec.goal.toLowerCase()} yet.`}
          {libraryPrograms().length ? " Choose any program below." : ""}
        </Txt>
      </Card>
    );
  return (
    <Card style={{ padding: 20, gap: 0 }}>
      <Txt variant="overline" tone="secondary">
        Recommended for you
      </Txt>
      <Txt variant="title" header style={{ marginTop: 6 }}>
        {programTitle(rec.program.name)}
      </Txt>
      <Txt tone="secondary" style={{ marginTop: 4 }}>
        {programFacts(rec.program)}
      </Txt>
      <View style={{ gap: 6, marginTop: 14 }}>
        {rec.reasons.map((reason) => (
          <View key={reason} style={{ flexDirection: "row", gap: 8 }}>
            <Ionicons
              name="checkmark"
              size={16}
              color={c.success}
              style={{ marginTop: 1 }}
            />
            <Txt variant="caption" tone="secondary" style={{ flex: 1 }}>
              {reason}
            </Txt>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 20 }}>
        <Button title="View program" onPress={() => openProgram(rec.program)} />
      </View>
    </Card>
  );
}

// Development builds only: drafts open through the real details, enrollment
// and workout flow. Never rendered in production bundles.
function DraftPreview() {
  const [open, setOpen] = useState(false);
  const drafts = programLibrary.filter((p) => p.status === "draft");
  if (!drafts.length) return null;
  return (
    <ListSection
      title="Development build only"
      footer="Drafts are hidden from users. Preview them to test enrollment and workouts on this device."
    >
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
          <ListRow
            key={`${p.id}@${p.version}`}
            title={p.name}
            subtitle={programFacts(p)}
            accessibilityLabel={`Preview draft ${p.name}`}
            onPress={() => openProgram(p)}
          />
        ))}
    </ListSection>
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
    <Screen
      title="Forge Paths"
      eyebrow={`${published.length} ${published.length === 1 ? "program" : "programs"}`}
      onBack={() => goBack("/(tabs)/train")}
    >
      {plan && (
        <ListSection
          title={plan.kind === "program" ? "Your program" : "Your Path"}
        >
          <PlanRow plan={plan} />
        </ListSection>
      )}
      <Recommendation />
      {published.length ? (
        goals.map((goal) => (
          <ListSection key={goal} title={goal}>
            {families
              .filter((f) => f.goal === goal)
              .map((f) => {
                const first =
                  rec.kind === "match" && familyKey(rec.program) === f.key
                    ? rec.program
                    : preferredVariant(f, profile.frequency);
                return (
                  <ListRow
                    key={f.key}
                    title={f.name}
                    subtitle={familyFacts(f)}
                    accessibilityLabel={`${f.name}, ${familyFacts(f)}`}
                    onPress={() => openProgram(first)}
                  />
                );
              })}
          </ListSection>
        ))
      ) : (
        <Empty
          title="Programs are on the way"
          detail="Forge programs are written and reviewed by hand. Your workouts, templates and history keep working in the meantime."
        />
      )}
      {draftPreviewEnabled && <DraftPreview />}
    </Screen>
  );
}
