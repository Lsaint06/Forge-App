import React, { useState } from "react";
import { View, Platform } from "react-native";
import { Alert } from "../platform/alert";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRepo, mutate } from "../state";
import type { Profile } from "../domain/types";
import { profileSchema } from "../domain/validation";
import { Field, Label, Button, Chips, Card, ProgressBar } from "./ui";

import { enableNotifications, cancelAllNotifications } from "../notifications";
const numeric = new Set([
  "height",
  "weight",
  "frequency",
  "duration",
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
  fields: { key: keyof Profile; label: string; options?: string[] }[];
}[] = [
  {
    title: "Your foundation",
    fields: [
      { key: "name", label: "Display name" },
      {
        key: "experience",
        label: "Training experience",
        options: ["Beginner", "Intermediate", "Advanced"],
      },
      {
        key: "goal",
        label: "Primary goal",
        options: [
          "Build strength",
          "Build muscle",
          "Improve fitness",
          "Manage weight",
        ],
      },
      { key: "units", label: "Load display units", options: ["kg", "lb"] },
      { key: "height", label: "Height (cm, optional; 0 to skip)" },
      { key: "weight", label: "Starting weight (kg, optional; 0 to skip)" },
      { key: "bodyFat", label: "Body fat % (optional; 0 to skip)" },
    ],
  },
  {
    title: "Your training",
    fields: [
      { key: "frequency", label: "Workouts per week (1–7)" },
      { key: "equipment", label: "Available equipment" },
      { key: "duration", label: "Preferred workout duration (minutes)" },
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
export function ProfileForm({
  onDone,
  onboarding = false,
}: {
  onDone: () => void;
  onboarding?: boolean;
}) {
  const r = useRepo();
  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(2, Number(r.setting?.("onboardingStep") ?? 0))),
  );
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Profile>({
    defaultValues: r.profile(),
    resolver: zodResolver(profileSchema),
  });
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
    () =>
      Alert.alert(
        "Check your settings",
        "Review the highlighted fields in each section.",
      ),
  );
  return (
    <View style={{ gap: 18 }}>
      {onboarding && (
        <>
          <Label muted>STEP {step + 1} / 3 · SAVED ON THIS DEVICE</Label>
          <ProgressBar value={(step + 1) / 3} label="Onboarding progress" />
        </>
      )}
      {display.map((section) => (
        <Card key={section.title}>
          <Label size={22} bold>
            {section.title}
          </Label>
          {section.fields.map((f) => (
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
                        onChange(value);
                        if (onboarding)
                          mutate(() => r.saveProfile({ [f.key]: value }));
                      }}
                    />
                  </View>
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
      {onboarding && step < 2 ? (
        <Button
          title="Next"
          onPress={() => {
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
                    Platform.OS === "web"
                      ? "Browser previews support in-app timers. Background reminders are available in the phone app."
                      : "Workouts and in-app timers still work. You can change permissions in phone settings.",
                  );
              })
              .catch((e) =>
                Alert.alert("Notification setup failed", String(e)),
              );
        }}
      />
      {onboarding && (
        <Button
          title="Skip optional setup · use guest defaults"
          secondary
          onPress={() => {
            mutate(() => r.saveProfile({ onboarded: true }));
            onDone();
          }}
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
