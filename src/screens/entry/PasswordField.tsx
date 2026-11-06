import React, { useEffect, useState } from "react";
import { Pressable, TextInput, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ForgeField } from "../../components/reforge";
import { useColors } from "../../components/ui";
import { forge } from "../../theme";

/**
 * A password field with a show/hide control (Phase 7.7C): 44 pt, labelled
 * for VoiceOver, and the field stays a password field for iOS autofill.
 */
export function PasswordField({
  ref,
  ...props
}: TextInputProps & {
  label: string;
  ref?: React.Ref<React.ComponentRef<typeof TextInput>>;
}) {
  const c = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <ForgeField
      ref={ref}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          hitSlop={4}
          onPress={() => setVisible((v) => !v)}
          style={({ pressed }) => ({
            width: forge.heights.compact,
            height: forge.heights.compact,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={c.text2}
          />
        </Pressable>
      }
    />
  );
}

/**
 * Seconds left before an email can be sent again, counting down once
 * started. Supabase allows one email to an address about every minute.
 */
export function useCooldown(seconds = 60) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until, now]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    remaining,
    start: () => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
}
