import React, { Component, useState } from "react";
import { View, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../platform/alert";
import { Txt, Button, useColors } from "./ui";
import { rescue } from "../platform/rescue";
import type { RescueResult } from "../data/rescue";
import { supportEmail, supportMailto } from "../support";
import { theme } from "../theme";

// Shown when Forge cannot start or a screen fails. It never deletes anything:
// the lifter can try again, or first save a copy of their data.

export function RecoveryScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const c = useColors();
  const email = supportEmail();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RescueResult>();
  async function saveCopy() {
    setBusy(true);
    try {
      setResult(await rescue());
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: theme.spacing.screen,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Ionicons name="alert-circle-outline" size={36} color={c.ember} />
          <Txt variant="title" header>
            FORGE couldn&apos;t open
          </Txt>
          <Txt tone="secondary">
            Your training data has not been deleted. Try again, or save a copy
            of your data first.
          </Txt>
        </View>
        <View
          accessible
          accessibilityLabel={`Error details: ${message}`}
          style={{
            backgroundColor: c.surface,
            borderRadius: theme.radii.card,
            padding: theme.spacing.row,
            gap: 4,
          }}
        >
          <Txt variant="overline" tone="secondary">
            Error details
          </Txt>
          <Txt variant="caption" tone="secondary">
            {message}
          </Txt>
        </View>
        <View style={{ gap: theme.spacing.group }}>
          <Button title="Try again" icon="refresh" onPress={onRetry} />
          <Button
            title={busy ? "Preparing a copy…" : "Save a copy of my data"}
            icon="download-outline"
            variant="secondary"
            disabled={busy}
            onPress={() => void saveCopy()}
          />
        </View>
        {result && (
          <Txt
            variant="caption"
            tone={result.kind === "failed" ? "error" : "secondary"}
          >
            {result.kind === "backup"
              ? "A backup file was handed to the share sheet. Forge can't confirm where it was saved: check it reached Files, Google Drive, iCloud Drive or your email. You can import it later from You → Import backup."
              : result.kind === "database"
                ? "Your records couldn't be read as a backup, so a copy of the database file was handed to the share sheet instead. Check it was saved, and include it if you ask for help."
                : `Couldn't create a copy: ${result.message}`}
          </Txt>
        )}
        <Txt variant="caption" tone="secondary">
          If this keeps happening, keep FORGE installed: deleting the app
          deletes the data stored on this phone.
          {email ? ` Contact FORGE support at ${email}.` : ""}
        </Txt>
        {email && (
          <Button
            title="Email support"
            icon="mail-outline"
            variant="text"
            onPress={() =>
              void Linking.openURL(supportMailto(email, message)).catch(() =>
                Alert.alert("Couldn't open email", `Write to ${email}.`),
              )
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: unknown) {
    return {
      error: (e instanceof Error ? e.message : String(e)) || "Unknown error",
    };
  }
  render() {
    if (this.state.error)
      return (
        <RecoveryScreen
          message={this.state.error}
          // Clearing the error remounts the app, which opens the database
          // again from the start.
          onRetry={() => this.setState({ error: "" })}
        />
      );
    return this.props.children;
  }
}
