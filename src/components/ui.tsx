import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  AccessibilityInfo,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Alert } from "../platform/alert";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import { useApp } from "../state";
import { defaults } from "../domain/types";
import {
  theme,
  textRoleFor,
  maxFontScale,
  legacySizeRole,
  withLegacyAliases,
  type Colors,
  type TextVariant,
} from "../theme";

// FORGE Design System 2.0 primitives. Every screen builds on these; tokens
// live in src/theme.ts. See docs/redesign/DESIGN_SYSTEM_2.md.

export const dark = theme.colors;
const lightColors = withLegacyAliases(theme.palettes.light);
export function useColors(): Colors {
  const p = useApp((s) => s.profile) ?? defaults;
  const os = useColorScheme();
  return p.theme === "light" || (p.theme === "system" && os === "light")
    ? lightColors
    : dark;
}

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Role = {
  size: number;
  lineHeight: number;
  weight: TextStyle["fontWeight"];
  tracking: number;
  uppercase?: boolean;
  tabular?: boolean;
};
function useRole(variant: TextVariant): Role {
  const { width } = useWindowDimensions();
  return textRoleFor(variant, width) as Role;
}

/**
 * Uppercase is visual only. Screen readers get the text in natural case so
 * "NEXT SESSION" is read as words, not spelled out. Returns undefined when
 * the content is not plain text, leaving the platform default in place.
 */
export function spokenText(children: React.ReactNode): string | undefined {
  const parts = React.Children.toArray(children);
  if (!parts.every((p) => typeof p === "string" || typeof p === "number"))
    return undefined;
  const text = parts.join("");
  if (!/[A-Za-z]/.test(text)) return text;
  return text === text.toUpperCase()
    ? text.charAt(0) + text.slice(1).toLowerCase()
    : text;
}

// ---- Typography -------------------------------------------------------------

export type Tone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "success"
  | "error"
  | "onAccent";
export function toneColor(c: Colors, tone: Tone) {
  return {
    primary: c.text,
    secondary: c.text2,
    tertiary: c.text3,
    accent: c.ember,
    success: c.success,
    error: c.error,
    onAccent: c.onEmber,
  }[tone];
}

/** Text in one of the Design System 2.0 roles. */
export function Txt({
  children,
  variant = "body",
  tone = "primary",
  weight,
  tabular,
  align,
  numberOfLines,
  header = false,
  fit = false,
  style,
}: {
  children: React.ReactNode;
  variant?: TextVariant;
  tone?: Tone;
  weight?: TextStyle["fontWeight"];
  tabular?: boolean;
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  header?: boolean;
  /** Shrink slightly (to 80%) rather than truncate when space is tight. */
  fit?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  const r = useRole(variant);
  return (
    <Text
      accessibilityRole={header ? "header" : undefined}
      accessibilityLabel={r.uppercase ? spokenText(children) : undefined}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontScale[variant]}
      adjustsFontSizeToFit={fit || undefined}
      minimumFontScale={fit ? 0.8 : undefined}
      style={[
        {
          color: toneColor(c, tone),
          fontSize: r.size,
          lineHeight: r.lineHeight,
          fontWeight: weight ?? r.weight,
          letterSpacing: r.tracking,
          ...(r.uppercase ? { textTransform: "uppercase" as const } : {}),
          ...((tabular ?? r.tabular)
            ? { fontVariant: ["tabular-nums" as const] }
            : {}),
          ...(align ? { textAlign: align } : {}),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * Earlier text component. Arbitrary sizes snap to the 2.0 type scale so every
 * existing screen shares one hierarchy until it is redesigned.
 */
export function Label({
  children,
  muted = false,
  size = 15,
  bold = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  bold?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  const variant = legacySizeRole(size);
  const r = useRole(variant);
  const weight: TextStyle["fontWeight"] = bold
    ? variant === "body" || variant === "caption"
      ? "600"
      : r.weight
    : variant === "overline"
      ? "600"
      : variant === "display" || variant === "title"
        ? "700"
        : "400";
  return (
    <Text
      accessibilityLabel={r.uppercase ? spokenText(children) : undefined}
      maxFontSizeMultiplier={maxFontScale[variant]}
      style={[
        {
          color: muted ? c.text2 : c.text,
          fontSize: r.size,
          lineHeight: r.lineHeight,
          fontWeight: weight,
          letterSpacing: r.tracking,
          ...(r.uppercase ? { textTransform: "uppercase" as const } : {}),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---- Layout -----------------------------------------------------------------

/**
 * A screen with consistent margins and safe areas. `eyebrow` is a factual
 * overline (date, context); `title` is the screen's single display heading.
 */
export function Screen({
  title,
  eyebrow,
  children,
  scroll = true,
  header,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  scroll?: boolean;
  header?: React.ReactNode;
}) {
  const c = useColors();
  const body = (
    <View
      style={{
        paddingHorizontal: theme.spacing.screen,
        paddingTop: theme.spacing.md,
        gap: theme.spacing.lg,
        paddingBottom: scroll ? theme.spacing.xxl : 0,
        ...(scroll ? {} : { flex: 1 }),
      }}
    >
      {!(header && !scroll) && (
        <View style={{ gap: theme.spacing.xs }}>
          {eyebrow && (
            <Txt variant="overline" tone="secondary">
              {eyebrow}
            </Txt>
          )}
          <Txt variant="display" header numberOfLines={2} fit>
            {title}
          </Txt>
        </View>
      )}
      {children}
    </View>
  );
  return (
    <SafeAreaView
      edges={
        scroll ? ["top", "left", "right"] : ["top", "bottom", "left", "right"]
      }
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {header}
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Tonal surface. `compact` for dense content, `raised` inside other surfaces. */
export function Card({
  children,
  style,
  compact = false,
  raised = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  raised?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: raised ? c.surfaceRaised : c.surface,
          borderRadius: theme.radii.card,
          padding: compact ? theme.spacing.group : theme.spacing.md,
          gap: compact ? theme.spacing.sm : theme.spacing.group,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}

// ---- Actions ----------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "text" | "destructive";

/**
 * Primary: the screen's single dominant action (flat ember). Secondary: tonal.
 * Text: low-emphasis inline action. Destructive: tonal with error label.
 */
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  icon,
  variant,
  compact = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: IconName;
  variant?: ButtonVariant;
  compact?: boolean;
  /** Spoken label when the visible title relies on context (default: title). */
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const kind: ButtonVariant =
    variant ?? (danger ? "destructive" : secondary ? "secondary" : "primary");
  const height = compact
    ? theme.heights.compact
    : kind === "primary"
      ? theme.heights.primary - 2
      : kind === "text"
        ? theme.heights.compact
        : theme.heights.control;
  // Disabled buttons keep their variant colours, faded, so they still read as
  // a button (never as an empty field) that is unavailable.
  const fg =
    kind === "primary"
      ? c.onEmber
      : kind === "destructive"
        ? c.error
        : kind === "text"
          ? c.ember
          : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: height,
        paddingVertical: kind === "text" ? 8 : 12,
        paddingHorizontal: kind === "text" ? 8 : 18,
        borderRadius: theme.radii.control,
        backgroundColor:
          kind === "text"
            ? "transparent"
            : kind === "primary"
              ? pressed
                ? c.emberPressed
                : c.ember
              : pressed
                ? c.selected
                : c.surfaceRaised,
        opacity: disabled ? 0.4 : pressed && kind === "text" ? 0.6 : 1,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      })}
    >
      {icon && <Ionicons name={icon} size={20} color={fg} />}
      <Text
        style={{
          flexShrink: 1,
          textAlign: "center",
          color: fg,
          fontWeight: "600",
          fontSize: kind === "text" ? 15 : 16,
          letterSpacing: 0.1,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function TextButton(
  props: Omit<React.ComponentProps<typeof Button>, "variant">,
) {
  return <Button {...props} variant="text" />;
}

/** Icon-only action with a 44 pt target. Always pass a descriptive label. */
export function IconButton({
  icon,
  label,
  onPress,
  selected = false,
  filled = false,
  tone,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  filled?: boolean;
  tone?: Tone;
  size?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={
          filled
            ? {
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: c.surfaceRaised,
                alignItems: "center",
                justifyContent: "center",
              }
            : undefined
        }
      >
        <Ionicons
          name={icon}
          size={filled ? Math.min(size, 18) : size}
          color={tone ? toneColor(c, tone) : selected ? c.ember : c.text2}
        />
      </View>
    </Pressable>
  );
}

// ---- Inputs -----------------------------------------------------------------

export function Field({
  label,
  error,
  compact = false,
  ...props
}: TextInputProps & { label: string; error?: string; compact?: boolean }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const numeric = /decimal|number|numeric/.test(props.keyboardType ?? "");
  return (
    <View
      style={{
        gap: compact ? 0 : 6,
        flexGrow: 1,
        flexShrink: 1,
        minWidth: compact ? 0 : 100,
        ...(compact ? { flexBasis: 0 } : {}),
      }}
    >
      {!compact && (
        <Txt variant="caption" tone="secondary">
          {label}
        </Txt>
      )}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.text2}
        selectionColor={c.ember}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            minHeight: theme.heights.control,
            color: c.text,
            backgroundColor: c.surfaceRaised,
            borderRadius: theme.radii.control,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 16,
            borderWidth: 1,
            borderColor: error ? c.error : focused ? c.ember : "transparent",
            ...(numeric ? { fontVariant: ["tabular-nums" as const] } : {}),
          },
          props.style,
        ]}
      />
      {!!error && (
        <Txt variant="caption" tone="error">
          {error}
        </Txt>
      )}
    </View>
  );
}
export type NumberRule = {
  nullable?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
};
/** Shared numeric-entry validation for fields and set-grid cells. */
export function parseNumber(
  text: string,
  { nullable = false, min = 0, max = Infinity, integer = false }: NumberRule,
): { value: number | null } | { error: string } {
  if (nullable && text.trim() === "") return { value: null };
  const number = Number(text);
  if (
    !text.trim() ||
    !Number.isFinite(number) ||
    number < min ||
    number > max ||
    (integer && !Number.isInteger(number))
  )
    return {
      error: `Enter ${integer ? "a whole number" : "a number"} from ${min}${Number.isFinite(max) ? ` to ${max}` : " or greater"}`,
    };
  return { value: number };
}
export const formatNumber = (n: number | null) =>
  n == null ? "" : String(Math.round(n * 100) / 100);

export function NumberField({
  label,
  value,
  onSave,
  nullable = false,
  min = 0,
  max = Infinity,
  integer = false,
  compact = false,
}: {
  label: string;
  value: number | null;
  onSave: (n: number | null) => void;
  nullable?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(formatNumber(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  function save(text: string) {
    const result = parseNumber(text, { nullable, min, max, integer });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSave(result.value);
    setError("");
  }
  return (
    <Field
      label={label}
      compact={compact}
      keyboardType="decimal-pad"
      value={focused ? draft : formatNumber(value)}
      onFocus={() => {
        setDraft(formatNumber(value));
        setFocused(true);
      }}
      onChangeText={(text) => {
        setDraft(text);
        save(text);
      }}
      onEndEditing={() => {
        save(draft);
        setFocused(false);
      }}
      error={error}
    />
  );
}

/**
 * Horizontally scrolling filter chips. `bleed` lets the row run to the screen
 * edge (pass the surrounding horizontal padding) so chips never look clipped.
 */
export function Chips({
  values,
  value,
  onChange,
  bleed = 0,
}: {
  values: string[];
  value: string;
  onChange: (s: string) => void;
  bleed?: number;
}) {
  const c = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={bleed ? { marginHorizontal: -bleed } : undefined}
      contentContainerStyle={{
        paddingHorizontal: bleed,
        gap: theme.spacing.sm,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {values.map((v) => {
        const selected = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onChange(v)}
            style={({ pressed }) => ({
              minHeight: 40,
              justifyContent: "center",
              paddingHorizontal: 16,
              borderRadius: theme.radii.pill,
              backgroundColor: selected ? c.text : c.surfaceRaised,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text
              style={{
                color: selected ? c.bg : c.text2,
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {v}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
/** Screen-level filter chips that run edge to edge. */
export function FilterChips(
  props: Omit<React.ComponentProps<typeof Chips>, "bleed"> & {
    bleed?: number;
  },
) {
  return <Chips bleed={theme.spacing.screen} {...props} />;
}

/** Two to five mutually exclusive options of equal weight. */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: {
  options: (string | { value: string; label: string })[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        backgroundColor: c.surfaceRaised,
        borderRadius: theme.radii.control,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const o =
          typeof option === "string"
            ? { value: option, label: option }
            : option;
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: theme.radii.control - 3,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 6,
              backgroundColor: selected ? c.selected : "transparent",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: selected ? c.text : c.text2,
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function Choices({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; title?: string; detail?: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ gap: 8 }}
    >
      <Txt variant="headline">{label}</Txt>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.title ?? o.value}
            accessibilityHint={o.detail}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              minHeight: theme.heights.row,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: theme.radii.control,
              borderWidth: 1.5,
              borderColor: selected ? c.ember : "transparent",
              backgroundColor: c.surfaceRaised,
              opacity: pressed ? 0.85 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? c.ember : c.text3}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="body" weight="600">
                {o.title ?? o.value}
              </Txt>
              {o.detail && (
                <Txt variant="caption" tone="secondary">
                  {o.detail}
                </Txt>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Data display -----------------------------------------------------------

export function Stat({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${spokenText(label) ?? label}`}
      style={{ flex: 1, minWidth: 96, gap: 2 }}
    >
      <Txt variant="metric">{value}</Txt>
      <Txt variant="overline" tone="secondary">
        {label}
      </Txt>
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Card>
      <Ionicons name="barbell-outline" size={28} color={c.text3} />
      <Txt variant="title">{title}</Txt>
      <Txt tone="secondary">{detail}</Txt>
      {action}
    </Card>
  );
}
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const c = useColors();
  const progress = useSharedValue(0);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (alive)
        progress.value = reduced
          ? value
          : withTiming(value, { duration: theme.motion.progress });
    });
    return () => {
      alive = false;
    };
  }, [value, progress]);
  const style = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%` as `${number}%`,
  }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.min(1, value) * 100),
      }}
      style={{
        height: 6,
        backgroundColor: c.surfaceRaised,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          { height: 6, backgroundColor: c.ember, borderRadius: 3 },
          style,
        ]}
      />
    </View>
  );
}

// ---- Sheets -----------------------------------------------------------------

/** Sheet title with a consistent close control (labelled "Close"). */
export function SheetHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="title" header numberOfLines={2}>
          {title}
        </Txt>
      </View>
      <IconButton icon="close" label="Close" filled onPress={onClose} />
    </View>
  );
}

/**
 * Asks before discarding unsaved input. "Keep editing" is the cancel action,
 * so dismissing the alert itself never discards anything.
 */
export function confirmDiscard(discard: () => void) {
  Alert.alert("Discard changes?", "Your unsaved changes will be lost.", [
    { text: "Keep editing", style: "cancel" },
    { text: "Discard", style: "destructive", onPress: discard },
  ]);
}

/**
 * Bottom sheet: grabber, title, close control, scrollable content and an
 * optional pinned footer for the sheet's single action.
 *
 * The close control, Android back and the VoiceOver escape gesture close the
 * sheet. Tapping the backdrop closes only sheets that opt in with
 * `dismissOnBackdrop` (information and action lists); sheets holding form
 * input or confirmations stay open so a stray tap cannot discard work. Sheets
 * have no swipe-to-dismiss gesture. Pass `unsaved` while a form holds changes:
 * every close path then asks before discarding them. Saving should hide the
 * sheet directly rather than through `onClose`.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = true,
  footer,
  dismissOnBackdrop = false,
  unsaved = false,
}: {
  visible: boolean;
  scroll?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissOnBackdrop?: boolean;
  unsaved?: boolean;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const requestClose = () => (unsaved ? confirmDiscard(onClose) : onClose());
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          accessible={false}
          testID="sheet-backdrop"
          onPress={dismissOnBackdrop ? requestClose : undefined}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        />
        <SafeAreaView
          edges={["bottom"]}
          onAccessibilityEscape={requestClose}
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            maxHeight: "90%",
            paddingHorizontal: theme.spacing.screen,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.md,
            ...theme.elevation.floating,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 5,
              borderRadius: 3,
              backgroundColor: c.hairline,
            }}
          />
          <SheetHeader title={title} onClose={requestClose} />
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                gap: theme.spacing.md,
                paddingBottom: theme.spacing.sm,
              }}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
          {footer}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Loading() {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: dark.bg,
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        },
      ]}
    >
      <ActivityIndicator color={dark.text2} />
      <Text style={{ color: dark.text, fontSize: 22 }}>Opening FORGE…</Text>
    </View>
  );
}
