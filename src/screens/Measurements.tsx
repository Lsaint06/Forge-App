import React, { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { Screen, Button, TextButton, Txt, Card, Empty } from "../components/ui";
import { ListRow, ListSection, OverflowMenu } from "../components/system";
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
  type Series,
} from "../domain/measurements";
import { theme } from "../theme";

// Measurements (Phase 7B WP4B): the lifter's body over time. The newest
// bodyweight (or most recently updated measurement) leads with its trend;
// every other measurement is one row; history lists every entry by day.
// Records keep their journal shape; nothing here renames or rewrites them.

const PAGE = 30;

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
    );
  }
  const logFor = (s?: Series): MeasurementTarget =>
    s ? { kind: "new", name: s.name, family: s.family } : { kind: "new" };

  return (
    <Screen
      title={detail ? detail.name : "Measurements"}
      onBack={() => (detail ? setOpen(undefined) : goBack("/(tabs)/profile"))}
      footer={
        <Button
          title={detail ? `Log ${detail.name}` : "Log measurement"}
          icon="add"
          onPress={() => setSheet(logFor(detail))}
        />
      }
    >
      {banner && (
        <Card compact raised>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
            }}
          >
            <Txt style={{ flex: 1 }}>{banner.text}</Txt>
            <TextButton
              title="Undo"
              onPress={() => {
                banner.undo();
                setBanner(undefined);
              }}
            />
          </View>
        </Card>
      )}
      {offer !== undefined && !detail && (
        <Card>
          <Txt weight="600">{`Your profile weight is ${valueText(offer, "mass", units)}.`}</Txt>
          <Txt tone="secondary">
            Log it as your first weigh-in today? Your profile stays as it is.
          </Txt>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Not now"
                variant="secondary"
                onPress={() => mutate(() => settleOffer())}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Log it"
                accessibilityLabel="Log profile weight as first weigh-in"
                onPress={() => acceptOffer(offer)}
              />
            </View>
          </View>
        </Card>
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
        <Empty
          title="Track how your body changes"
          detail="Start with your weight. Add other measurements, like your waist or arms, whenever you take them."
        />
      )}
      {!detail && series.length > 1 && (
        <ListSection title="Other measurements">
          {series
            .filter((s) => s.key !== lead?.key)
            .map((s) => {
              const change = sincePrevious(s);
              const latest = s.days[s.days.length - 1]!;
              const value = valueText(latest.value, s.family, units);
              const sub = change
                ? `${changeText(change.delta, s.family, units)} since ${dayTitle(change.since, today)}`
                : `Logged ${dayTitle(latest.date, today)}`;
              return (
                <ListRow
                  key={s.key}
                  title={s.name}
                  subtitle={sub}
                  value={value}
                  accessibilityLabel={`${s.name}, ${value}, ${sub}`}
                  onPress={() => {
                    setOpen(s.key);
                    setShown(PAGE);
                  }}
                />
              );
            })}
        </ListSection>
      )}
      {history.length > 0 && (
        <View style={{ gap: theme.spacing.md }}>
          <Txt variant="overline" tone="secondary" header>
            History
          </Txt>
          {groupByDay(history.slice(0, shown)).map(([date, list]) => (
            <ListSection key={date} title={dayTitle(date, today)}>
              {list.map((e) => {
                const name = String(e.data.name ?? "");
                const value = readable(e)
                  ? entryText(e, units)
                  : String(e.data.value ?? "");
                const note = String(e.data.notes ?? "").trim();
                return (
                  <ListRow
                    key={e.id}
                    title={name}
                    subtitle={note || undefined}
                    value={value}
                    chevron={false}
                    accessibilityLabel={`${name}, ${value}, ${dayTitle(e.date, today)}${note ? `, ${note}` : ""}. Edit`}
                    onPress={
                      familyOfUnit(e.data.unit)
                        ? () => setSheet({ kind: "edit", entry: e })
                        : undefined
                    }
                    trailing={
                      <OverflowMenu
                        label={`Options for ${name} on ${dayTitle(e.date, today)}`}
                        title={`${name} · ${value}`}
                        actions={[
                          ...(familyOfUnit(e.data.unit)
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
            </ListSection>
          ))}
          {history.length > shown && (
            <TextButton
              title={`Show earlier (${history.length - shown})`}
              neutral
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
    </Screen>
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
