import React from "react";
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../ui";
import { forge } from "../../theme";

/**
 * REFORGE search input: a raised, bordered field with a search icon and a
 * clear control once there is text. The label is the field's spoken name
 * and its placeholder.
 */
export function ForgeSearchField({
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        minHeight: 48,
        borderRadius: forge.radii.input,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 14,
        gap: 10,
      }}
    >
      <Ionicons name="search" size={18} color={c.text2} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={c.text3}
        selectionColor={c.emberHot}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        maxFontSizeMultiplier={1.6}
        style={{
          flex: 1,
          minHeight: 46,
          paddingVertical: 10,
          color: c.text,
          fontSize: 16,
        }}
      />
      {!!value && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          style={({ pressed }) => ({
            minWidth: forge.heights.compact,
            minHeight: forge.heights.compact,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="close-circle" size={18} color={c.text2} />
        </Pressable>
      )}
    </View>
  );
}
