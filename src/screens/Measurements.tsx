import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { useColors } from "../components/ui";
import { OverflowMenu } from "../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeListRow,
  ForgeSubScreen,
  OutlineButton,
  SectionLabel,
} from "../components/reforge";
import { SeriesCard } from "../components/measurements/SeriesCard";
import {
  MeasurementSheet,
  type MeasurementTarget,
} from "../components/measurements/MeasurementSheet";
import { useRepo, mutate, confirm } from "../state";
import { goBack } from "../navigation";
import { localDate, type Journal } from "../domain/types";
import { dayTitle } from "../domain/calendar-dates";
import {
  PROFILE_WEIGHT_OFFER,
  changeText,
  entryText,
  familyOfUnit,
  newestFirst,
  profileWeightOffer,
  readable,
  seriesOf,
  sincePrevious,
  valueText,
  type Family,
  type Series,
} from "../domain/measurements";
import { forge } from "../theme";

// Measurements (Phase 7B WP4B; REFORGE since Phase 7.5G.1): the lifter's
// body over time. The newest bodyweight (or most recently updated
// measurement) leads with its trend; every other measurement is one row;
// history lists every entry by day. Records keep their journal shape;
// nothing here renames or rewrites them. 7.5G.1 changed the presentation.

const PAGE = 30;
const ICON: Record<
  Family,
  "scale-outline" | "resize-outline" | "pie-chart-outline"
> = {
  mass: "scale-outline",
  length: "resize-outline",
  percent: "pie-chart-outline",
};
export default function Measurements() {
  const r = useRepo();
  const today = localDate();
  const units = r.profile().units;
  const entries = r.journal("measurement");
  const series = seriesOf(entries);
  const [open, setOpen] = useState<string>();
  const [sheet, setSheet] = useState<MeasurementTarget>();
  const [shown, setShown] = useState(PAGE);
  const [banner, setBanner] = useState<{ text: string; undo: () => void }>();
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(undefined), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const detail = open ? series.find((s) => s.key === open) : undefined;
  const lead = detail ?? series.find((s) => s.bodyweight) ?? series[0];
  const offer = profileWeightOffer(
    entries,
    r.profile().weight,
    r.setting(PROFILE_WEIGHT_OFFER) === "settled",
  );
  const history = [...(detail ? detail.entries : entries)].sort(
    newestFirst,
  ) as Journal[];

  function saved(id: string, text: string) {
    setBanner({
      text: `Saved ${text}`,
      undo: () => mutate(() => r.deleteJournal(id)),
    });
    AccessibilityInfo.announceForAccessibility(
      `Saved ${text}. Undo available.`,
    );
  }
  function settleOffer() {
    r.setSetting(PROFILE_WEIGHT_OFFER, "settled");
  }
  function acceptOffer(kg: number) {
    const entry = mutate(() => {
      const e = r.addJournal(
        "measurement",
        { name: "Bodyweight", value: kg, unit: "kg" },
        today,
      );
      settleOffer();
      return e;
    });
    if (entry) saved(entry.id, `Bodyweight ${valueText(kg, "mass", units)}`);
  }
  function remove(e: Journal) {
    const what = readable(e)
      ? `${String(e.data.name)} ${entryText(e, units)}`
      : String(e.data.name);
    confirm(
      "Delete measurement?",
      `${what} from ${dayTitle(e.date, today)} will be removed.`,
      () => r.deleteJournal(e.id),
      { action: "Delete measurement" },
    );
  }
  const logFor = (s?: Series): MeasurementTarget =>
    s ? { kind: "new", name: s.name, family: s.family } : { kind: "new" };

  return (
    <ForgeSubScreen
      title={detail ? detail.name : "Measurements"}
      eyebrow={
        detail
          ? `${detail.entries.length} ${detail.entries.length === 1 ? "entry" : "entries"}`
          : entries.length
            ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`
            : undefined
      }
      onBack={() => (detail ? setOpen(undefined) : goBack("/(tabs)/profile"))}
      footer={
        <CtaButton
          title={detail ? `Log ${detail.name}` : "Log measurement"}
          icon="add"
          compact
          onPress={() => setSheet(logFor(detail))}
        />
      }
    >
      {banner && (
        <UndoBanner
          text={banner.text}
          onUndo={() => {
            banner.undo();
            setBanner(undefined);
          }}
        />
      )}
      {offer !== undefined && !detail && (
        <ForgeCard testID="profile-weight-offer" gap={10}>
          <FText variant="overline" tone="secondary">
            From your profile
          </FText>
          <FText variant="cardTitle" weight="700">
            {`Your profile weight is ${valueText(offer, "mass", units)}.`}
          </FText>
          <FText variant="label" tone="secondary">
            Log it as your first weigh-in today? Your profile stays as it is.
          </FText>
          <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
            <View style={{ flex: 1 }}>
              <OutlineButton
                title="Not now"
                compact
                onPress={() => mutate(() => settleOffer())}
              />
            </View>
            <View style={{ flex: 1 }}>
              <CtaButton
                title="Log it"
                compact
                accessibilityLabel="Log profile weight as first weigh-in"
                onPress={() => acceptOffer(offer)}
              />
            </View>
          </View>
        </ForgeCard>
      )}
      {lead ? (
        <SeriesCard
          key={lead.key}
          series={lead}
          units={units}
          today={today}
          showName={!detail}
          onLog={detail ? undefined : () => setSheet(logFor(lead))}
        />
      ) : (
        <ForgeEmpty
          title="Track how your body changes"
          detail="Start with your weight. Add other measurements, like your waist or arms, whenever you take them."
        />
      )}
      {!detail && series.length > 1 && (
        <View style={{ gap: forge.spacing.tight }}>
          <SectionLabel title="Other measurements" />
          <ForgeCard padding={0} gap={0}>
            {series
              .filter((s) => s.key !== lead?.key)
              .map((s, i) => {
                const change = sincePrevious(s);
                const latest = s.days[s.days.length - 1]!;
                const value = valueText(latest.value, s.family, units);
                const sub = change
                  ? `${changeText(change.delta, s.family, units)} since ${dayTitle(change.since, today)}`
                  : `Logged ${dayTitle(latest.date, today)}`;
                return (
                  <ForgeListRow
                    key={s.key}
                    icon={ICON[s.family]}
                    title={s.name}
                    description={sub}
                    value={value}
                    divider={i > 0}
                    accessibilityLabel={`${s.name}, ${value}, ${sub}`}
                    onPress={() => {
                      setOpen(s.key);
                      setShown(PAGE);
                    }}
                  />
                );
              })}
          </ForgeCard>
        </View>
      )}
      {history.length > 0 && (
        <View style={{ gap: forge.spacing.tight, marginTop: 6 }}>
          <SectionLabel title="History" />
          {groupByDay(history.slice(0, shown)).map(([date, list]) => (
            <ForgeCard key={date} padding={0} gap={0}>
              <View
                style={{
                  paddingHorizontal: forge.spacing.cardPadding,
                  paddingTop: 12,
                  paddingBottom: 4,
                }}
              >
                <FText variant="label" weight="700" tone="secondary" header>
                  {dayTitle(date, today)}
                </FText>
              </View>
              {list.map((e) => {
                const name = String(e.data.name ?? "");
                const value = readable(e)
                  ? entryText(e, units)
                  : String(e.data.value ?? "");
                const note = String(e.data.notes ?? "").trim();
                const editable = !!familyOfUnit(e.data.unit);
                return (
                  <EntryRow
                    key={e.id}
                    name={name}
                    value={value}
                    note={note}
                    label={`${name}, ${value}, ${dayTitle(e.date, today)}${note ? `, ${note}` : ""}. Edit`}
                    onPress={
                      editable
                        ? () => setSheet({ kind: "edit", entry: e })
                        : undefined
                    }
                    menu={
                      <OverflowMenu
                        label={`Options for ${name} on ${dayTitle(e.date, today)}`}
                        title={`${name} · ${value}`}
                        actions={[
                          ...(editable
                            ? [
                                {
                                  label: "Edit",
                                  icon: "create-outline" as const,
                                  onPress: () =>
                                    setSheet({ kind: "edit", entry: e }),
                                },
                              ]
                            : []),
                          {
                            label: "Delete",
                            icon: "trash-outline",
                            destructive: true,
                            onPress: () => remove(e),
                          },
                        ]}
                      />
                    }
                  />
                );
              })}
            </ForgeCard>
          ))}
          {history.length > shown && (
            <OutlineButton
              title={`Show earlier (${history.length - shown})`}
              onPress={() => setShown((n) => n + PAGE)}
            />
          )}
        </View>
      )}
      {sheet && (
        <MeasurementSheet
          target={sheet}
          series={series}
          units={units}
          onClose={() => setSheet(undefined)}
          onSaved={saved}
        />
      )}
    </ForgeSubScreen>
  );
}

/** The Undo offer after logging a measurement. */
function UndoBanner({ text, onUndo }: { text: string; onUndo: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingLeft: forge.spacing.cardPadding,
        paddingRight: 6,
        minHeight: 52,
        borderRadius: forge.radii.card,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
      }}
    >
      <FText variant="body" weight="600" style={{ flex: 1 }}>
        {text}
      </FText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        onPress={onUndo}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 64,
          paddingHorizontal: 12,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <FText variant="cardTitle" weight="700" tone="accent">
          Undo
        </FText>
      </Pressable>
    </View>
  );
}

/** One recorded entry: what, its note, the value in the lifter's units. */
function EntryRow({
  name,
  value,
  note,
  label,
  onPress,
  menu,
}: {
  name: string;
  value: string;
  note: string;
  label: string;
  onPress?: () => void;
  menu: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingRight: 6,
        borderTopWidth: forge.border.card,
        borderTopColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={label}
        accessible
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 52,
          paddingVertical: 10,
          paddingLeft: forge.spacing.cardPadding,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: pressed ? c.cardRaised : "transparent",
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="body" weight="700" numberOfLines={2}>
            {name}
          </FText>
          {!!note && (
            <FText variant="label" tone="secondary">
              {note}
            </FText>
          )}
        </View>
        <FText variant="cardTitle" weight="700" align="right">
          {value}
        </FText>
      </Pressable>
      {menu}
    </View>
  );
}
function groupByDay(list: Journal[]) {
  const days: [string, Journal[]][] = [];
  for (const e of list) {
    const last = days[days.length - 1];
    if (last && last[0] === e.date) last[1].push(e);
    else days.push([e.date, [e]]);
  }
  return days;
}
