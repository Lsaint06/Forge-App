import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import { FText, Gradient, OutlineButton } from "../../components/reforge";
import { planStatus } from "../../components/PlanRow";
import {
  ARRIVAL_KEY,
  programForKey,
  readArrival,
} from "../../domain/onboarding/journey";
import { revealTitle } from "../../domain/onboarding/reveal";
import { durationText } from "../../domain/programs/presentation";
import { programLibrary } from "../../programs";
import { mutate, useRepo } from "../../state";
import { forge } from "../../theme";

/**
 * Home after setup (Phase 9.2): the Forge Path the athlete was just shown,
 * so Forge opens on the moment they had instead of a blank start. It only
 * opens the program's page in Forge Paths, where starting it stays their
 * choice; nothing is enrolled here. It goes when they close it, and stays
 * out of the way while any plan is running.
 */
export function ForgePathArrival() {
  const r = useRepo();
  const c = useColors();
  const key = readArrival(r.setting(ARRIVAL_KEY));
  const program = key ? programForKey(programLibrary, key) : undefined;
  if (!program || planStatus(r)) return null;
  const close = () => mutate(() => r.clearSetting(ARRIVAL_KEY));
  return (
    <View
      testID="forge-path-arrival"
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
        center={{ x: 0.9, y: 0.05 }}
        radius={{ x: 0.7, y: 0.6 }}
        stops={[
          { offset: 0, color: c.emberHot, opacity: 0.22 },
          { offset: 1, color: c.emberHot, opacity: 0 },
        ]}
      />
      <View style={{ padding: 18, gap: forge.spacing.group }}>
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <FText variant="overline" tone="accent">
              Your Forge Path
            </FText>
            <FText variant="heroTitle" header>
              {revealTitle(program)}
            </FText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close your Forge Path card"
            hitSlop={6}
            onPress={close}
            style={({ pressed }) => ({
              width: forge.heights.compact,
              height: forge.heights.compact,
              marginTop: -10,
              marginRight: -10,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="close" size={20} color={c.text2} />
          </Pressable>
        </View>
        <FText variant="body" weight="600">
          {`${program.daysPerWeek} days a week · ${durationText(program)}`}
        </FText>
        <FText variant="label" tone="secondary">
          Matched to your answers during setup. Nothing starts until you choose.
        </FText>
        <OutlineButton
          title="View your Forge Path"
          icon="arrow-forward"
          tone="ember"
          onPress={() =>
            router.push({
              pathname: "/forge-paths/[programId]",
              params: {
                programId: program.id,
                version: String(program.version),
              },
            })
          }
        />
      </View>
    </View>
  );
}
