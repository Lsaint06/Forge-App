import React, { useState } from "react";
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
} from "./ui";
import {
  experienceChoices,
  experienceLevel,
  goalChoices,
  restDayNames,
  trainingGoal,
} from "../domain/profile";

import { enableNotifications, cancelAllNotifications } from "../notifications";
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
      { key: "bodyFat", label: "Body fat % (optional; 0 to skip)" },
    ],
  },
  { title: "Your training journey", journey: true, fields: [] },
  {
    title: "Your training",
    fields: [
      {
        key: "frequency",
        label: "Weekly workout goal (1–7)",
        settingsOnly: true,
      },
      { key: "muscles", label: "Target muscle groups" },
      { key: "rest", label: "Default rest (seconds)" },
      { key: "increment", label: "Progression increment (kg)" },
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
const displayWeight = (kg: number, units: Profile["units"]) =>
  kg > 0
    ? String(Math.round((units === "lb" ? kgToLb(kg) : kg) * 100) / 100)
    : "";

export function ProfileForm({
  onDone,
  onboarding = false,
}: {
  onDone: () => void;
  onboarding?: boolean;
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
  const totalInches = Math.round(cmToIn(initial.height));
  const [feet, setFeet] = useState(
    initial.height > 0 ? String(Math.floor(totalInches / 12)) : "",
  );
  const [inches, setInches] = useState(
    initial.height > 0 ? String(totalInches % 12) : "",
  );
  const [weightText, setWeightText] = useState(() =>
    displayWeight(initial.weight, initial.units),
  );
  const {
    control,
    getValues,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<Profile>({
    defaultValues: r.profile(),
    resolver: zodResolver(requiredProfileSchema),
  });
  const units = useWatch({ control, name: "units" });
  const display = onboarding ? [sections[step]!] : sections;
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
      {display.map((section) => (
        <Card key={section.title}>
          <Label size={22} bold>
            {section.title}
          </Label>
          {section.journey && (
            <>
              <Label muted size={13}>
                Forge uses these to recommend a training program. You can always
                browse every program and change these later.
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
                          if (f.key === "units")
                            setWeightText(
                              displayWeight(
                                getValues("weight"),
                                value as Profile["units"],
                              ),
                            );
                          onChange(value);
                          if (onboarding)
                            mutate(() => r.saveProfile({ [f.key]: value }));
                        }}
                      />
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
                          Enter a valid height in feet and inches (0–11 inches).
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
                        const number = text.trim() === "" ? 0 : Number(text);
                        onChange(units === "lb" ? lbToKg(number) : number);
                      }}
                      error={errors.weight?.message}
                    />
                  ) : (
                    <Field
                      label={f.label}
                      value={String(value)}
                      keyboardType={
                        numeric.has(f.key) ? "decimal-pad" : "default"
                      }
                      onChangeText={(text) => {
                        onChange(numeric.has(f.key) ? Number(text) : text);
                        const patch = {
                          [f.key]: numeric.has(f.key) ? Number(text) : text,
                        };
                        if (
                          onboarding &&
                          profileSchema.safeParse({ ...r.profile(), ...patch })
                            .success
                        )
                          mutate(() => r.saveProfile(patch));
                      }}
                      error={errors[f.key]?.message}
                    />
                  )
                }
              />
            ))}
        </Card>
      ))}
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
          title={onboarding ? "Enter FORGE" : "Save settings"}
          onPress={() => void submit()}
        />
      )}
      <Button
        title={
          r.profile().notifications
            ? "Disable notifications"
            : "Enable local notifications"
        }
        secondary
        onPress={() => {
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
              .catch((e) =>
                Alert.alert("Notification setup failed", String(e)),
              );
        }}
      />
      {onboarding && (
        <Button
          title="Skip remaining optional setup"
          secondary
          onPress={() => void submit()}
        />
      )}
      <Label muted size={12}>
        Guest data stays on this device. FORGE does not send health data to a
        backend until you configure cloud access and explicitly synchronize.
        Training estimates are guidance, not medical advice.
      </Label>
    </View>
  );
}
