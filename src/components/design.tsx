import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import {
  Label,
  Card,
  Button,
  Row,
  Txt,
  IconButton,
  useColors,
  Sheet as BottomSheet,
} from "./ui";
export {
  Screen as AppScreen,
  Field as FormField,
  Field as SearchField,
  FilterChips,
  SegmentedControl,
  Sheet as BottomSheet,
  Empty as EmptyState,
  ProgressBar,
  IconButton,
  TextButton,
} from "./ui";
export {
  ListRow,
  ListSection,
  OverflowMenu,
  InfoButton,
  InfoSheet,
} from "./system";
export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="display" header>
        {title}
      </Txt>
      {subtitle && <Txt tone="secondary">{subtitle}</Txt>}
    </View>
  );
}
export function SectionHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="title" header>
        {title}
      </Txt>
      {detail && (
        <Txt variant="caption" tone="secondary">
          {detail}
        </Txt>
      )}
    </View>
  );
}
export function PrimaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} />;
}
export function SecondaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} secondary />;
}
export function MetricCard({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 120 }}>
      <Txt variant="metric" style={{ fontSize: 28, lineHeight: 32 }}>
        {value}
      </Txt>
      <Txt variant="caption" tone="secondary">
        {label}
      </Txt>
    </Card>
  );
}
export function StatRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Row>
      <View style={{ flex: 1 }}>
        <Label muted>{label}</Label>
      </View>
      <Label bold>{value}</Label>
    </Row>
  );
}
export function ProgressRing({
  value,
  label,
  size = 72,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const c = useColors();
  const ratio = Math.max(0, Math.min(1, value));
  const circumference = 2 * Math.PI * 28;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <Svg width={size} height={size} viewBox="0 0 72 72">
        <Circle
          cx={36}
          cy={36}
          r={28}
          stroke={c.elevated}
          strokeWidth={5}
          fill="none"
        />
        <Circle
          cx={36}
          cy={36}
          r={28}
          stroke={c.accent}
          strokeWidth={5}
          fill="none"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          rotation={-90}
          origin="36,36"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
export function WorkoutCard({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <Label size={20} bold>
        {title}
      </Label>
      <Label muted size={13}>
        {detail}
      </Label>
      {children}
    </Card>
  );
}
export const ProgramCard = WorkoutCard;
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <Label bold>Something needs attention</Label>
      <Label muted>{message}</Label>
      <SecondaryButton title="Try again" onPress={onRetry} />
    </Card>
  );
}
export function LoadingSkeleton() {
  const c = useColors();
  return (
    <View accessibilityLabel="Loading content" style={{ gap: 12 }}>
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          style={{ height: 48, backgroundColor: c.elevated, borderRadius: 8 }}
        />
      ))}
    </View>
  );
}
export function ChartContainer({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <SectionHeader title={title} />
      {children}
    </Card>
  );
}
export function NumericStepper({
  value,
  label,
  onChange,
  min = 0,
  max = 100,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Row>
      <IconButton
        icon="remove"
        label={`Decrease ${label}`}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <Label>
        {label}: {value}
      </Label>
      <IconButton
        icon="add"
        label={`Increase ${label}`}
        onPress={() => onChange(Math.min(max, value + 1))}
      />
    </Row>
  );
}

/** Local calendar dates prevent UTC midnight from shifting a training day. */
export function WeeklyConsistency({
  workouts,
}: {
  workouts: import("../domain/types").Workout[];
}) {
  const c = useColors();
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const dates = workouts
    .filter((w) => w.status === "completed")
    .map((w) => new Date(w.finishedAt ?? w.startedAt).toDateString());
  return (
    <View
      style={{ flexDirection: "row", gap: 4, justifyContent: "space-between" }}
    >
      {Array.from({ length: 7 }, (_, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const done = dates.includes(date.toDateString());
        return (
          <View
            key={i}
            accessible
            accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${done ? "workout completed" : "no completed workout"}`}
            style={{ flex: 1, alignItems: "center", gap: 8 }}
          >
            <Label muted size={12}>
              {date
                .toLocaleDateString(undefined, { weekday: "short" })
                .slice(0, 1)}
            </Label>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: done ? c.success : c.elevated,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {done && (
                <Ionicons name="checkmark" size={18} color={c.background} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onCancel}>
      <Label>{message}</Label>
      <SecondaryButton title="Cancel" onPress={onCancel} />
      <PrimaryButton title="Confirm" onPress={onConfirm} />
    </BottomSheet>
  );
}
