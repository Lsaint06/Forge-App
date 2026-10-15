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
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import { useApp } from "../state";
import { defaults } from "../domain/types";
export const dark = {
  background: "#080A0D",
  surface: "#12161C",
  elevated: "#1A2028",
  accent: "#FF5A36",
  text: "#F5F7FA",
  muted: "#9CA6B4",
  success: "#35C98A",
  border: "#28303B",
  warning: "#F5B942",
};
export function useColors() {
  const p = useApp((s) => s.profile) ?? defaults;
  const os = useColorScheme();
  return p.theme === "light" || (p.theme === "system" && os === "light")
    ? {
        ...dark,
        background: "#F2F4F7",
        surface: "#FFFFFF",
        elevated: "#E7EBF1",
        text: "#12161C",
        muted: "#505C6C",
        border: "#CFD6DF",
        accent: "#B83215",
      }
    : dark;
}
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
  style?: StyleProp<import("react-native").TextStyle>;
}) {
  const c = useColors();
  return (
    <Text
      style={[
        {
          color: muted ? c.muted : c.text,
          fontSize: size,
          fontWeight: bold ? "700" : "400",
          lineHeight: size * 1.45,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Screen({
  title,
  eyebrow,
  children,
  scroll = true,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const c = useColors();
  const body = (
    <View style={{ padding: 20, gap: 18, paddingBottom: 100 }}>
      {eyebrow && (
        <Label size={11} bold style={{ color: c.accent, letterSpacing: 3 }}>
          {eyebrow.toUpperCase()}
        </Label>
      )}
      <Label size={32} bold>
        {title}
      </Label>
      {children}
    </View>
  );
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: 20,
          padding: 18,
          gap: 12,
          borderWidth: 1,
          borderColor: c.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 14,
        backgroundColor: secondary ? c.elevated : danger ? "#A72C3A" : c.accent,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      })}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={20}
          color={
            secondary
              ? c.text
              : danger || c.background !== dark.background
                ? "#FFF"
                : dark.background
          }
        />
      )}
      <Text
        style={{
          color: secondary
            ? c.text
            : danger || c.background !== dark.background
              ? "#FFF"
              : dark.background,
          fontWeight: "700",
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
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
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 5, flexGrow: 1 }}>
      <Label size={12} muted>
        {label}
      </Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          {
            minHeight: 48,
            color: c.text,
            backgroundColor: c.elevated,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 16,
            borderWidth: 1,
            borderColor: error ? "#F05D65" : c.border,
          },
          props.style,
        ]}
      />
      {error && (
        <Label size={12} style={{ color: "#F05D65" }}>
          {error}
        </Label>
      )}
    </View>
  );
}
export function NumberField({
  label,
  value,
  onSave,
  nullable = false,
  min = 0,
  max = Infinity,
  integer = false,
}: {
  label: string;
  value: number | null;
  onSave: (n: number | null) => void;
  nullable?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  const format = (n: number | null) =>
    n == null ? "" : String(Math.round(n * 100) / 100);
  const [draft, setDraft] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  function save(text: string) {
    if (nullable && text.trim() === "") {
      onSave(null);
      setError("");
      return;
    }
    const number = Number(text);
    if (
      !text.trim() ||
      !Number.isFinite(number) ||
      number < min ||
      number > max ||
      (integer && !Number.isInteger(number))
    ) {
      setError(
        `Enter ${integer ? "a whole number" : "a number"} from ${min}${Number.isFinite(max) ? ` to ${max}` : " or greater"}`,
      );
      return;
    }
    onSave(number);
    setError("");
  }
  return (
    <Field
      label={label}
      keyboardType="decimal-pad"
      value={focused ? draft : format(value)}
      onFocus={() => {
        setDraft(format(value));
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
export function Chips({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (s: string) => void;
}) {
  const c = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Row>
        {values.map((v) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: v === value }}
            onPress={() => onChange(v)}
            style={{
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: 14,
              borderRadius: 22,
              backgroundColor: v === value ? c.accent : c.elevated,
            }}
          >
            <Text
              style={{
                color:
                  v === value
                    ? c.background === dark.background
                      ? dark.background
                      : "#FFF"
                    : c.text,
                fontWeight: "600",
              }}
            >
              {v}
            </Text>
          </Pressable>
        ))}
      </Row>
    </ScrollView>
  );
}
export function Stat({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 100, gap: 4 }}>
      <Label size={26} bold>
        {value}
      </Label>
      <Label size={12} muted>
        {label}
      </Label>
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
  return (
    <Card>
      <Ionicons name="barbell-outline" size={30} color={dark.accent} />
      <Label bold size={20}>
        {title}
      </Label>
      <Label muted>{detail}</Label>
      {action}
    </Card>
  );
}
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#0009",
        }}
      >
        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "90%",
            padding: 20,
            paddingBottom: 40,
            gap: 16,
          }}
        >
          <Row>
            <View style={{ flex: 1 }}>
              <Label size={23} bold>
                {title}
              </Label>
            </View>
            <Button title="Close" onPress={onClose} secondary />
          </Row>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 16 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
        progress.value = reduced ? value : withTiming(value, { duration: 450 });
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
        height: 8,
        backgroundColor: c.elevated,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          { height: 8, backgroundColor: c.accent, borderRadius: 8 },
          style,
        ]}
      />
    </View>
  );
}
export function Loading() {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: dark.background,
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        },
      ]}
    >
      <ActivityIndicator color={dark.accent} />
      <Text style={{ color: dark.text, fontSize: 22 }}>Opening FORGE…</Text>
    </View>
  );
}
