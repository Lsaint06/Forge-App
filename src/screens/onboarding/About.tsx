import React, { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeField,
} from "../../components/reforge";
import { readFormNumber } from "../../domain/numbers";
import type { Profile } from "../../domain/types";
import {
  aboutIssues,
  nameInput,
  nameValue,
} from "../../domain/onboarding/journey";
import {
  ABOUT_HELP,
  bodyFatText,
  feetInches,
  heightCmText,
  readFeetInches,
  readWeight,
  weightText,
} from "../../domain/onboarding/about";
import { forge } from "../../theme";
import type { SetupAccount } from "./account";
import { Segmented } from "./choices";
import { StepFrame } from "./frame";
import { StepIssue } from "./parts";
import { tick, warn, type OnboardingStore } from "./store";

const MAX_NAME = 80;
const MAX_HEIGHT_CM = 300;
const MAX_WEIGHT_KG = 700;

const UNITS = [
  { value: "kg", title: "kg · cm", spoken: "Kilograms and centimetres" },
  { value: "lb", title: "lb · ft & in", spoken: "Pounds, feet and inches" },
] as const;

/** A field's unit, inside its right edge. */
function Unit({ text }: { text: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ minWidth: forge.heights.compact, paddingRight: 14 }}
    >
      <FText variant="label" weight="600" tone="secondary" align="right">
        {text}
      </FText>
    </View>
  );
}

// Step 1 of 3 (Phase 9.2): who the athlete is. The same profile fields and
// rules setup has always used (name, units, height, starting weight, body
// fat), each saved the moment it is valid. Placeholders never look like
// answers: numbers start empty, with their unit beside them.
export function About({
  store,
  account,
  banner,
  error,
  onContinue,
}: {
  store: OnboardingStore;
  account?: SetupAccount;
  banner?: React.ReactNode;
  error?: string;
  onContinue: () => void;
}) {
  const p = store.profile;
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [bodyY, setBodyY] = useState(0);
  const [name, setName] = useState(() => nameInput(p));
  const [cm, setCm] = useState(() => heightCmText(p.height));
  const [ft, setFt] = useState(() => feetInches(p.height).feet);
  const [inch, setInch] = useState(() => feetInches(p.height).inches);
  const [weight, setWeight] = useState(() => weightText(p.weight, p.units));
  const [bodyFat, setBodyFat] = useState(() => bodyFatText(p.bodyFat));
  const [tried, setTried] = useState(false);
  const units = p.units;
  const lb = units === "lb";

  const save = (values: Partial<Profile>) => store.saveProfile(values);
  const heightValue = lb ? readFeetInches(ft, inch) : readFormNumber(cm);
  const weightValue = readWeight(weight, units);
  const fatValue = readFormNumber(bodyFat);
  const errors = {
    name: name.trim().length > MAX_NAME ? ABOUT_HELP.name : undefined,
    height:
      !Number.isFinite(heightValue) || heightValue > MAX_HEIGHT_CM
        ? lb
          ? ABOUT_HELP.heightFtIn
          : ABOUT_HELP.heightCm
        : tried && !(heightValue > 0)
          ? ABOUT_HELP.height
          : undefined,
    weight:
      !Number.isFinite(weightValue) || weightValue > MAX_WEIGHT_KG
        ? ABOUT_HELP.weightRange
        : tried && !(weightValue > 0)
          ? ABOUT_HELP.weight
          : undefined,
    bodyFat:
      !Number.isFinite(fatValue) || fatValue > 100
        ? ABOUT_HELP.bodyFat
        : undefined,
  };
  const ready =
    !Object.values(errors).some(Boolean) &&
    heightValue > 0 &&
    weightValue > 0 &&
    !aboutIssues(store.profile).length;
  const issue =
    !tried || ready
      ? undefined
      : heightValue > 0 && weightValue > 0
        ? "Check the highlighted fields to continue."
        : "Add your height and starting weight to continue.";

  function setHeight(value: number) {
    if (Number.isFinite(value) && value >= 0 && value <= MAX_HEIGHT_CM)
      save({ height: value });
  }
  function chooseUnits(next: Profile["units"]) {
    if (next === units) return;
    tick();
    if (!save({ units: next })) return;
    // Shown again in the new units from what is stored (kg and cm).
    setWeight(weightText(p.weight, next));
    setCm(heightCmText(p.height));
    setFt(feetInches(p.height).feet);
    setInch(feetInches(p.height).inches);
  }
  function next() {
    setTried(true);
    if (ready) {
      onContinue();
      return;
    }
    // What needs attention is on screen, however small the phone.
    warn();
    scroll.current?.scrollTo?.({
      y: Math.max(0, bodyY - forge.spacing.group),
      animated: true,
    });
  }

  return (
    <StepFrame
      eyebrow="Step 1 of 3"
      title="About you"
      step={1}
      account={account}
      banner={banner}
      error={error}
      scrollRef={scroll}
      footer={
        <>
          <StepIssue text={issue} />
          <CtaButton
            title="Continue"
            accessibilityHint="Next: your training"
            onPress={next}
          />
        </>
      }
    >
      <FText variant="body" tone="secondary">
        The basics for your profile. They stay on this phone until you choose to
        synchronize.
      </FText>
      <ForgeCard gap={8} testID="onboarding-about">
        <ForgeField
          label="Your name"
          placeholder="First name"
          value={name}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          maxLength={MAX_NAME + 20}
          error={errors.name}
          onChangeText={(text) => {
            setName(text);
            if (text.trim().length <= MAX_NAME) save({ name: nameValue(text) });
          }}
        />
        <FText variant="label" tone="secondary">
          Optional. Forge uses it to greet you.
        </FText>
      </ForgeCard>
      <View onLayout={(e) => setBodyY(e.nativeEvent.layout.y)}>
        <ForgeCard gap={16}>
          <FText variant="overline" tone="secondary" header>
            Body
          </FText>
          <Segmented
            label="Units"
            options={UNITS}
            value={units}
            onChange={(v) => chooseUnits(v as Profile["units"])}
          />
          {lb ? (
            <View style={{ gap: 6 }}>
              <FText variant="label" tone="secondary">
                Height
              </FText>
              <View style={{ flexDirection: "row", gap: forge.spacing.group }}>
                <ForgeField
                  label="Height (ft)"
                  hideLabel
                  keyboardType="number-pad"
                  value={ft}
                  trailing={<Unit text="ft" />}
                  onChangeText={(text) => {
                    setFt(text);
                    setHeight(readFeetInches(text, inch));
                  }}
                />
                <ForgeField
                  label="Height (in)"
                  hideLabel
                  keyboardType="number-pad"
                  value={inch}
                  trailing={<Unit text="in" />}
                  onChangeText={(text) => {
                    setInch(text);
                    setHeight(readFeetInches(ft, text));
                  }}
                />
              </View>
              <FieldIssue text={errors.height} />
            </View>
          ) : (
            <ForgeField
              label="Height"
              accessibilityLabel="Height (cm)"
              keyboardType="decimal-pad"
              value={cm}
              error={errors.height}
              trailing={<Unit text="cm" />}
              onChangeText={(text) => {
                setCm(text);
                setHeight(readFormNumber(text));
              }}
            />
          )}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: forge.spacing.group,
            }}
          >
            <ForgeField
              label="Starting weight"
              accessibilityLabel={`Starting weight (${lb ? "lb" : "kg"})`}
              keyboardType="decimal-pad"
              value={weight}
              error={errors.weight}
              trailing={<Unit text={lb ? "lb" : "kg"} />}
              style={{ minWidth: 120 }}
              onChangeText={(text) => {
                setWeight(text);
                const kg = readWeight(text, units);
                if (Number.isFinite(kg) && kg >= 0 && kg <= MAX_WEIGHT_KG)
                  save({ weight: kg });
              }}
            />
            <ForgeField
              label="Body fat"
              accessibilityLabel="Body fat % (optional)"
              placeholder="Optional"
              keyboardType="decimal-pad"
              value={bodyFat}
              error={errors.bodyFat}
              trailing={<Unit text="%" />}
              style={{ minWidth: 120 }}
              onChangeText={(text) => {
                setBodyFat(text);
                const v = readFormNumber(text);
                if (Number.isFinite(v) && v >= 0 && v <= 100)
                  save({ bodyFat: v });
              }}
            />
          </View>
        </ForgeCard>
      </View>
    </StepFrame>
  );
}

/** A field group's own error, in the fields' error style. */
function FieldIssue({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityRole="alert">
      <FText variant="label" weight="600" tone="error">
        {text}
      </FText>
    </View>
  );
}
