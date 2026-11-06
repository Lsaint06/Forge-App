import React, { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { TextButton, useColors } from "../ui";
import { InfoSheet } from "../system";
import { FText } from "../reforge";
import { forge } from "../../theme";
import { front, back } from "../../anatomy/atlas.generated";
import { litRegions, spokenMuscles } from "../../anatomy/mapping";
import { ANATOMY_CREDIT } from "../../anatomy/credits";
import type {
  AtlasSide,
  AtlasView,
  MuscleEntry,
  MuscleMap,
  RegionId,
} from "../../anatomy/types";

// FORGE anatomy atlas on screen (Phase 7.2C-3B). Each figure is a stack of
// plain images: the flat body, the lit regions, then the lighting overlay,
// so primary (ember) and secondary (copper) muscles keep their sculpting.
// Anatomy illustration: CC BY-SA 4.0, see assets/anatomy/LICENSE.md.

const VIEWS: Record<AtlasSide, AtlasView> = { front, back };
// Legend swatches: the highlights' mid tones, edged with their darker tone
// so each swatch keeps 3:1 contrast on light and dark cards (7.2C-3D).
export const PRIMARY_SWATCH = "#F47522";
export const SECONDARY_SWATCH = "#7A3A1A";
const PRIMARY_EDGE = "#D24A14";
const SECONDARY_EDGE = "#C0662C";
const GAP = 14;
const MAX_HEIGHT = 300;

/** Figure height that fits both views side by side in `width`. */
export function figureHeight(width: number) {
  const ratio = front.width / front.height + back.width / back.height;
  return Math.max(160, Math.min(MAX_HEIGHT, Math.floor((width - GAP) / ratio)));
}

function Figure({
  side,
  height,
  lit,
}: {
  side: AtlasSide;
  height: number;
  lit: Map<RegionId, "primary" | "secondary">;
}) {
  const view = VIEWS[side];
  const s = height / view.height;
  // Unrounded, so the base, shade and region layers share one scale.
  const width = view.width * s;
  const layers = Object.entries(view.regions).flatMap(([id, images]) => {
    const role = lit.get(`${side}.${id}` as RegionId);
    if (!role) return [];
    const image = images[role];
    return [
      <Image
        key={id}
        testID={`atlas-${side}-${id}-${role}`}
        source={image.source}
        fadeDuration={0}
        style={{
          position: "absolute",
          left: image.x * s,
          top: image.y * s,
          width: image.width * s,
          height: image.height * s,
        }}
      />,
    ];
  });
  const full = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width,
    height,
  };
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <View style={{ width, height }}>
        <Image source={view.base} fadeDuration={0} style={full} />
        {layers}
        <Image source={view.shade} fadeDuration={0} style={full} />
      </View>
      <FText variant="overline" tone="secondary">
        {side === "front" ? "Front" : "Back"}
      </FText>
    </View>
  );
}

function LegendRow({
  role,
  entries,
}: {
  role: "primary" | "secondary";
  entries: MuscleEntry[];
}) {
  const title = role === "primary" ? "Primary" : "Secondary";
  const muscles = entries.flatMap((x) => x.muscles);
  // Muscles the figures cannot show (e.g. under the shoulder blade).
  const hidden = entries
    .filter((x) => x.muscles.length && !x.regions.length)
    .flatMap((x) => x.muscles);
  const note = !hidden.length
    ? ""
    : hidden.length === muscles.length
      ? "Not highlighted on the figures"
      : `${hidden.join(", ")} not highlighted`;
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${entries
        .map((x) =>
          x.muscles.length
            ? `${x.label}, ${x.muscles.join(", ").toLowerCase()}`
            : x.label,
        )
        .join("; ")}`}
      style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
    >
      <View
        testID={`legend-${role}`}
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          marginTop: 3,
          borderWidth: 1,
          borderColor: role === "primary" ? PRIMARY_EDGE : SECONDARY_EDGE,
          backgroundColor:
            role === "primary" ? PRIMARY_SWATCH : SECONDARY_SWATCH,
        }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <FText variant="overline" tone="secondary">
          {title}
        </FText>
        <FText variant="cardTitle">
          {entries.map((x) => x.label).join(" · ")}
        </FText>
        {(muscles.length > 0 || !!note) && (
          <FText variant="label" tone="secondary">
            {[muscles.join(" · "), note].filter(Boolean).join(" — ")}
          </FText>
        )}
      </View>
    </View>
  );
}

/**
 * "Muscles worked": front and back figures and the legend. The figures are
 * one image for screen readers, labelled with the same text as the legend.
 */
export function MuscleAtlas({ map }: { map: MuscleMap }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const height = figureHeight(
    width - 2 * forge.spacing.margin - 2 * forge.spacing.cardPadding,
  );
  const lit = litRegions(map);
  const empty = !map.fullBody && !map.primary.length && !map.secondary.length;
  return (
    <View style={{ gap: forge.spacing.group }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Muscle diagram, front and back. ${
          empty ? "No muscle group recorded." : spokenMuscles(map)
        }`}
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: GAP,
        }}
      >
        <Figure side="front" height={height} lit={lit} />
        <Figure side="back" height={height} lit={lit} />
      </View>
      <View
        style={{
          gap: 10,
          paddingTop: forge.spacing.group,
          borderTopWidth: forge.border.card,
          borderTopColor: c.cardDivider,
        }}
      >
        {map.fullBody ? (
          <FText variant="body" tone="secondary">
            Full body · conditioning. Muscle use depends on the machine and
            technique, so no single group is highlighted.
          </FText>
        ) : empty ? (
          <FText variant="body" tone="secondary">
            No muscle group recorded for this exercise.
          </FText>
        ) : (
          <>
            {map.primary.length > 0 && (
              <LegendRow role="primary" entries={map.primary} />
            )}
            {map.secondary.length > 0 && (
              <LegendRow role="secondary" entries={map.secondary} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * The atlas's licence credit (CC BY-SA 4.0): a quiet link that opens the
 * full attribution, the source and the licence.
 */
export function AnatomyCredits() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Anatomy illustration credits"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: forge.heights.compact,
          justifyContent: "center",
          alignSelf: "flex-start",
          paddingHorizontal: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <FText variant="label" tone="secondary">
          Anatomy illustration credits
        </FText>
      </Pressable>
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={ANATOMY_CREDIT.title}
        paragraphs={[...ANATOMY_CREDIT.paragraphs]}
      >
        {ANATOMY_CREDIT.links.map((link) => (
          <TextButton
            key={link.url}
            title={link.label}
            icon="open-outline"
            onPress={() => void Linking.openURL(link.url).catch(() => {})}
          />
        ))}
      </InfoSheet>
    </>
  );
}
