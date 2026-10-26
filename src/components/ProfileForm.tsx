import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Alert } from "../platform/alert";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRepo, mutate } from "../state";
import type { Profile } from "../domain/types";
import { profileSchema } from "../domain/validation";
import { kgToLb, lbToKg, cmToIn, inToCm } from "../domain/metrics";
import {
  Field,
  Label,
  Button,
  Chips,
  Choices,
  Card,
  ProgressBar,
  Row,
  FieldError,
} from "./ui";
import {
  experienceChoices,
  experienceLevel,
  goalChoices,
  restDayNames,
  trainingGoal,
} from "../domain/profile";

import { enableNotifications, cancelAllNotifications } from "../notifications";
import { Stepper } from "./Stepper";
import { readFormNumber } from "../domain/numbers";
import { TARGET_HELP } from "../domain/targets";
const numeric = new Set([
  "height",
  "weight",
  "frequency",
  "bodyFat",
  "rest",
  "increment",
  "repMin",
  "repMax",
  "calories",
  "protein",
  "carbs",
  "fat",
]);
const sections: {
  title: string;
  // The training-journey step renders descriptive choices, not plain fields.
  journey?: boolean;
  fields: {
    key: keyof Profile;
    label: string;
    options?: string[];
    // Editable in settings, not asked during first-time setup.
    settingsOnly?: boolean;
  }[];
}[] = [
  {
    title: "Your foundation",
    fields: [
      { key: "name", label: "Display name" },
      { key: "units", label: "Load display units", options: ["kg", "lb"] },
      { key: "height", label: "Height (required)" },
      { key: "weight", label: "Starting weight" },
      { key: "bodyFat", label: "Body fat % (optional)" },
    ],
  },
  { title: "Your training journey", journey: true, fields: [] },
  {
    title: "Your training",
    fields: [
      {
        key: "frequency",
        label: "Weekly workout goal",
        settingsOnly: true,
      },
      { key: "muscles", label: "Target muscle groups" },
      { key: "rest", label: "Default rest" },
      { key: "increment", label: "Progression increment" },
      { key: "repMin", label: "Minimum target reps" },
      { key: "repMax", label: "Maximum target reps" },
    ],
  },
  {
    title: "Make it yours",
    fields: [
      {
        key: "theme",
        label: "Appearance",
        options: ["dark", "light", "system"],
      },
      { key: "calories", label: "Daily calorie goal (kcal)" },
      { key: "protein", label: "Protein goal (g)" },
      { key: "carbs", label: "Carbohydrate goal (g)" },
      { key: "fat", label: "Fat goal (g)" },
    ],
  },
];
// Form requirements stay separate from storage validation so older backups and
// existing guest profiles with unset measurements remain readable.
const requiredProfileSchema = profileSchema
  .refine((p) => p.height > 0, {
    path: ["height"],
    message: "Enter your height in feet and inches.",
  })
  .refine((p) => p.weight > 0, {
    path: ["weight"],
    message: "Enter your starting weight.",
  });
// Every editable field, for focused editors that show only some of them.
const fieldDefs = sections.flatMap((s) => s.fields);
export type ProfileField = keyof Profile | "journey";

/**
 * Turns local notifications on (asking for permission) or off (cancelling
 * scheduled reminders). Shared by the settings form and the You tab.
 */
export function toggleNotifications(r: ReturnType<typeof useRepo>) {
  if (r.profile().notifications) {
    mutate(() => r.saveProfile({ notifications: false }));
    void cancelAllNotifications().catch((e) =>
      Alert.alert("Reminder cleanup failed", String(e)),
    );
  } else
    void enableNotifications()
      .then((granted) => {
        mutate(() => r.saveProfile({ notifications: granted }));
        if (!granted)
          Alert.alert(
            "Notifications not enabled",
            "Workouts and in-app timers still work. You can change permissions in phone settings.",
          );
      })
      .catch((e) => Alert.alert("Notification setup failed", String(e)));
}

const displayWeight = (kg: number, units: Profile["units"]) =>
  kg > 0
    ? String(Math.round((units === "lb" ? kgToLb(kg) : kg) * 100) / 100)
    : "";
const round2 = (n: number) => Math.round(n * 100) / 100;
const heightCmText = (cm: number) => (cm > 0 ? String(round2(cm)) : "");
const feetOf = (cm: number) =>
  cm > 0 ? String(Math.floor(Math.round(cmToIn(cm)) / 12)) : "";
const inchesOf = (cm: number) =>
  cm > 0 ? String(Math.round(cmToIn(cm)) % 12) : "";
/** "2,5" or "2.5" → 2.5; "" → 0 (as before); anything else → NaN. */
const readNumber = readFormNumber;
const restText = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

// Plain help shown instead of raw validation text ("Too big: expected …").
const fieldHelp: Partial<Record<keyof Profile, string>> = {
  name: "Enter a name of up to 80 characters.",
  height: "Enter a height up to 300 cm.",
  weight: "Enter a weight up to 700 kg (1,543 lb).",
  bodyFat: "Enter a percentage from 0 to 100, or leave it empty.",
  increment: "Enter an increment greater than 0, up to 100 kg (220 lb).",
  rest: "Choose a rest of up to 60 minutes.",
  repMin: "Choose whole reps from 1 to 100.",
  repMax: "Choose whole reps from 1 to 100.",
  frequency: "Choose 1 to 7 workouts a week.",
  // Shared with the Nutrition targets sheet (7.3G G2).
  ...TARGET_HELP,
};
const rawValidation = /expected|invalid input|too (big|small)/i;
/** A field's error for display: our own messages as written, raw ones replaced. */
export function friendlyError(key: keyof Profile, message: string | undefined) {
  if (!message) return undefined;
  return rawValidation.test(message)
    ? (fieldHelp[key] ?? "Check this value.")
    : message;
}

/**
 * A typed number: keeps exactly what is typed while editing, accepts "," or
 * "." decimals, and converts with `read` (e.g. lb → kg) before storing.
 * `resetKey` re-shows the stored value (e.g. when units change).
 */
function NumberInput({
  label,
  value,
  show,
  read = (n) => n,
  resetKey,
  onChange,
  error,
}: {
  label: string;
  value: number;
  show: (v: number) => string;
  read?: (n: number) => number;
  resetKey?: string;
  onChange: (v: number) => void;
  error?: string;
}) {
  const [text, setText] = useState(() => show(value));
  const [shownFor, setShownFor] = useState(resetKey);
  if (shownFor !== resetKey) {
    setShownFor(resetKey);
    setText(show(value));
  }
  return (
    <Field
      label={label}
      value={text}
      keyboardType="decimal-pad"
      error={error}
      onChangeText={(t) => {
        setText(t);
        const n = readNumber(t);
        onChange(Number.isFinite(n) ? read(n) : NaN);
      }}
    />
  );
}

export function ProfileForm({
  onDone,
  onboarding = false,
  onDirtyChange,
  fields,
  saveLabel = "Save settings",
}: {
  onDone: () => void;
  onboarding?: boolean;
  /** Reports whether the form holds changes that have not been saved. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Shows only these fields ("journey" = experience, goal and rest day), for
   * a focused editor. Every other value is kept and saved unchanged.
   */
  fields?: ProfileField[];
  saveLabel?: string;
}) {
  const r = useRepo();
  const [step, setStep] = useState(() => {
    const profile = r.profile();
    if (!profile.height || !profile.weight) return 0;
    return Math.max(
      0,
      Math.min(sections.length - 1, Number(r.setting?.("onboardingStep") ?? 0)),
    );
  });
  const initial = r.profile();
  const [feet, setFeet] = useState(feetOf(initial.height));
  const [inches, setInches] = useState(inchesOf(initial.height));
  const [cmText, setCmText] = useState(heightCmText(initial.height));
  const [weightText, setWeightText] = useState(() =>
    displayWeight(initial.weight, initial.units),
  );
  const {
    control,
    getValues,
    trigger,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Profile>({
    defaultValues: r.profile(),
    // A focused editor without height or weight cannot fix them, so it only
    // applies the stored-profile rules.
    resolver: zodResolver(
      !fields || fields.includes("height") || fields.includes("weight")
        ? requiredProfileSchema
        : profileSchema,
    ),
  });
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  const units = useWatch({ control, name: "units" });
  const repMin = useWatch({ control, name: "repMin" });
  const repMax = useWatch({ control, name: "repMax" });
  // A field change; during first-time setup each valid value is kept at once.
  function commit(
    key: keyof Profile,
    value: unknown,
    onChange: (v: never) => void,
  ) {
    onChange(value as never);
    if (
      onboarding &&
      profileSchema.safeParse({ ...r.profile(), [key]: value }).success
    )
      mutate(() => r.saveProfile({ [key]: value }));
  }
  const display = fields
    ? [
        {
          title: "",
          journey: fields.includes("journey"),
          fields: fields.flatMap((k) => fieldDefs.filter((d) => d.key === k)),
        },
      ]
    : onboarding
      ? [sections[step]!]
      : sections;
  const submit = handleSubmit(
    (data) => {
      const result = mutate(() =>
        r.saveProfile({
          ...data,
          notifications: r.profile().notifications,
          onboarded: true,
        }),
      );
      if (result) onDone();
    },
    (invalid) => {
      if (onboarding && (invalid.height || invalid.weight || invalid.name)) {
        setStep(0);
        mutate(() => r.setSetting("onboardingStep", "0"));
      }
      Alert.alert(
        "Check your settings",
        "Review the highlighted fields in each section.",
      );
    },
  );
  return (
    <View style={{ gap: 18 }}>
      {onboarding && (
        <>
          <Label muted>
            STEP {step + 1} / {sections.length} · SAVED ON THIS DEVICE
          </Label>
          <ProgressBar
            value={(step + 1) / sections.length}
            label="Onboarding progress"
          />
        </>
      )}
      {display.map((section) => {
        const Wrap = fields ? View : Card;
        return (
          <Wrap key={section.title} style={fields ? { gap: 16 } : undefined}>
            {!!section.title && (
              <Label size={22} bold>
                {section.title}
              </Label>
            )}
            {section.journey && (
              <>
                <Label muted size={13}>
                  Forge uses these to recommend a training program. You can
                  always browse every program and change these later.
                </Label>
                <Controller
                  control={control}
                  name="experience"
                  render={({ field: { value, onChange } }) => (
                    <Choices
                      label="Where are you in your training journey?"
                      options={experienceChoices}
                      value={experienceLevel({ experience: value })}
                      onChange={(choice) => {
                        onChange(choice);
                        if (onboarding)
                          mutate(() => r.saveProfile({ experience: choice }));
                      }}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="goal"
                  render={({ field: { value, onChange } }) => (
                    <Choices
                      label="What are you training toward?"
                      options={goalChoices}
                      value={trainingGoal({ goal: value })}
                      onChange={(choice) => {
                        onChange(choice);
                        if (onboarding)
                          mutate(() => r.saveProfile({ goal: choice }));
                      }}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="restDay"
                  render={({ field: { value, onChange } }) => (
                    <Choices
                      label="Which day would you prefer to rest?"
                      options={restDayNames.map((day, i) => ({
                        value: String(i),
                        title: day,
                      }))}
                      value={value === undefined ? undefined : String(value)}
                      onChange={(choice) => {
                        onChange(Number(choice));
                        if (onboarding)
                          mutate(() =>
                            r.saveProfile({ restDay: Number(choice) }),
                          );
                      }}
                    />
                  )}
                />
                <Label muted size={12}>
                  Your rest day guides how program sessions appear on your
                  calendar. You can still train that day.
                </Label>
              </>
            )}
            {section.fields
              .filter((f) => !(onboarding && f.settingsOnly))
              .map((f) => (
                <Controller
                  key={f.key}
                  control={control}
                  name={f.key}
                  render={({ field: { value, onChange } }) =>
                    f.options ? (
                      <View style={{ gap: 6 }}>
                        <Label muted size={12}>
                          {f.label}
                        </Label>
                        <Chips
                          values={f.options!}
                          value={String(value)}
                          onChange={(value) => {
                            if (f.key === "units") {
                              setWeightText(
                                displayWeight(
                                  getValues("weight"),
                                  value as Profile["units"],
                                ),
                              );
                              // Height follows the chosen units; storage stays cm.
                              const cm = getValues("height");
                              if (Number.isFinite(cm)) {
                                setCmText(heightCmText(cm));
                                setFeet(feetOf(cm));
                                setInches(inchesOf(cm));
                              }
                            }
                            onChange(value);
                            if (onboarding)
                              mutate(() => r.saveProfile({ [f.key]: value }));
                          }}
                        />
                      </View>
                    ) : f.key === "height" && units !== "lb" ? (
                      <View style={{ gap: 8 }}>
                        <Field
                          label="Height (cm, required)"
                          placeholder="178"
                          keyboardType="decimal-pad"
                          value={cmText}
                          onChangeText={(text) => {
                            setCmText(text);
                            onChange(readNumber(text));
                          }}
                        />
                        {errors.height && (
                          <Label size={12}>
                            Enter a valid height in centimetres (up to 300).
                          </Label>
                        )}
                      </View>
                    ) : f.key === "height" ? (
                      <View style={{ gap: 8 }}>
                        <Label muted size={12}>
                          Height (required)
                        </Label>
                        <Row>
                          <Field
                            label="Height (feet)"
                            placeholder="5"
                            keyboardType="number-pad"
                            value={feet}
                            onChangeText={(text) => {
                              setFeet(text);
                              const ft = Number(text),
                                inch = Number(inches);
                              const valid =
                                /^\d+$/.test(text) &&
                                /^(\d+)?$/.test(inches) &&
                                inch <= 11;
                              onChange(
                                valid
                                  ? inToCm(ft * 12 + inch)
                                  : text === "" && inches === ""
                                    ? 0
                                    : NaN,
                              );
                            }}
                          />
                          <Field
                            label="Height (inches)"
                            placeholder="0"
                            keyboardType="number-pad"
                            value={inches}
                            onChangeText={(text) => {
                              setInches(text);
                              const ft = Number(feet),
                                inch = Number(text);
                              const valid =
                                /^\d+$/.test(feet) &&
                                /^(\d+)?$/.test(text) &&
                                inch <= 11;
                              onChange(
                                valid
                                  ? inToCm(ft * 12 + inch)
                                  : feet === "" && text === ""
                                    ? 0
                                    : NaN,
                              );
                            }}
                          />
                        </Row>
                        {errors.height && (
                          <Label size={12}>
                            Enter a valid height in feet and inches (0–11
                            inches).
                          </Label>
                        )}
                      </View>
                    ) : f.key === "weight" ? (
                      <Field
                        label={`Starting weight (${units === "lb" ? "lbs" : "kg"}, required)`}
                        value={weightText}
                        keyboardType="decimal-pad"
                        onChangeText={(text) => {
                          setWeightText(text);
                          const number = readNumber(text);
                          onChange(units === "lb" ? lbToKg(number) : number);
                        }}
                        error={friendlyError("weight", errors.weight?.message)}
                      />
                    ) : f.key === "increment" ? (
                      <NumberInput
                        label={`Progression increment (${units})`}
                        value={value as number}
                        resetKey={units}
                        // Stored in kg, as always; shown and typed in units.
                        show={(kg) =>
                          String(round2(units === "lb" ? kgToLb(kg) : kg))
                        }
                        read={(n) =>
                          units === "lb" ? Math.round(lbToKg(n) * 1e6) / 1e6 : n
                        }
                        onChange={(v) => commit(f.key, v, onChange)}
                        error={friendlyError(f.key, errors[f.key]?.message)}
                      />
                    ) : f.key === "bodyFat" ? (
                      <NumberInput
                        label={f.label}
                        value={value as number}
                        // 0 means "not given" in storage; shown empty.
                        show={(v) => (v > 0 ? String(v) : "")}
                        onChange={(v) => commit(f.key, v, onChange)}
                        error={friendlyError(f.key, errors[f.key]?.message)}
                      />
                    ) : f.key === "frequency" ||
                      f.key === "repMin" ||
                      f.key === "repMax" ||
                      f.key === "rest" ? (
                      <View>
                        <Stepper
                          label={f.label}
                          value={Number(value) || 0}
                          step={f.key === "rest" ? 15 : 1}
                          min={
                            f.key === "rest"
                              ? 0
                              : f.key === "repMax"
                                ? Math.max(1, Number(repMin) || 1)
                                : 1
                          }
                          max={
                            f.key === "frequency"
                              ? 7
                              : f.key === "rest"
                                ? 3600
                                : f.key === "repMin"
                                  ? Math.min(100, Number(repMax) || 100)
                                  : 100
                          }
                          format={f.key === "rest" ? restText : String}
                          onChange={(v) => commit(f.key, v, onChange)}
                        />
                        <FieldError
                          label={f.label}
                          error={
                            errors[f.key]
                              ? friendlyError(f.key, errors[f.key]?.message)
                              : undefined
                          }
                        />
                      </View>
                    ) : numeric.has(f.key) ? (
                      <NumberInput
                        label={f.label}
                        value={value as number}
                        show={String}
                        onChange={(v) => commit(f.key, v, onChange)}
                        error={friendlyError(f.key, errors[f.key]?.message)}
                      />
                    ) : (
                      <Field
                        label={f.label}
                        value={String(value)}
                        onChangeText={(text) => commit(f.key, text, onChange)}
                        error={friendlyError(f.key, errors[f.key]?.message)}
                      />
                    )
                  }
                />
              ))}
          </Wrap>
        );
      })}
      {onboarding && step < sections.length - 1 ? (
        <Button
          title="Next"
          onPress={async () => {
            if (step === 0 && !(await trigger(["name", "height", "weight"])))
              return;
            if (step === 0)
              mutate(() =>
                r.saveProfile({
                  name: getValues("name"),
                  height: getValues("height"),
                  weight: getValues("weight"),
                }),
              );
            setStep((s) => s + 1);
            mutate(() => r.setSetting("onboardingStep", String(step + 1)));
          }}
        />
      ) : (
        <Button
          title={onboarding ? "Enter FORGE" : saveLabel}
          onPress={() => void submit()}
        />
      )}
      {!fields && (
        <Button
          title={
            r.profile().notifications
              ? "Disable notifications"
              : "Enable local notifications"
          }
          secondary
          onPress={() => toggleNotifications(r)}
        />
      )}
      {onboarding && (
        <Button
          title="Skip remaining optional setup"
          secondary
          onPress={() => void submit()}
        />
      )}
      {!fields && (
        <Label muted size={12}>
          Guest data stays on this device. FORGE does not send health data to a
          backend until you configure cloud access and explicitly synchronize.
          Training estimates are guidance, not medical advice.
        </Label>
      )}
    </View>
  );
}
