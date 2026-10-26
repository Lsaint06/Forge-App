import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Linking,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { useColors } from "../ui";
import { CtaButton, FText, OutlineButton } from "../reforge";
import { forge } from "../../theme";
import { FOOD_BARCODES, scannedCode } from "../../domain/barcode";
import type { LibraryFood } from "../../domain/food-library";
import { brandedByBarcode, brandedProblem } from "../../data/branded-catalog";

type Phase =
  | { kind: "scanning" }
  | { kind: "looking"; code: string }
  | { kind: "not-found"; code: string }
  | { kind: "unreadable" }
  | { kind: "error"; message: string };

/**
 * The barcode scanner (Phase 7.3F): the back camera, a framing guide and a
 * typed fallback. A code is looked up in the bundled USDA Branded Foods
 * catalogue (offline); a match goes to the usual food step, where nothing is
 * logged until the lifter adds it. The camera runs only while this is shown,
 * stops reading once a code is found, and asks for permission only here.
 */
export function BarcodeScanner({
  onFound,
  onSearch,
  onCreate,
}: {
  onFound: (food: LibraryFood, code: string) => void;
  onSearch: () => void;
  onCreate: () => void;
}) {
  const c = useColors();
  const window = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [torch, setTorch] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [typed, setTyped] = useState("");
  // One code at a time: later camera events are ignored until it is answered.
  const busy = useRef(false);
  const asked = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Ask once, when the scanner opens (never earlier).
  useEffect(() => {
    if (
      permission &&
      !permission.granted &&
      permission.canAskAgain &&
      !asked.current
    ) {
      asked.current = true;
      void requestPermission().catch(() => {});
    }
  }, [permission, requestPermission]);

  async function lookUp(type: string | undefined, data: string) {
    if (busy.current) return;
    busy.current = true;
    const code = scannedCode(type, data);
    if (!code.gtin) {
      setPhase({ kind: "unreadable" });
      busy.current = false;
      return;
    }
    setPhase({ kind: "looking", code: code.digits });
    try {
      const food = await brandedByBarcode(code.digits, code.symbology);
      if (!mounted.current) return;
      if (food) {
        void Haptics.selectionAsync().catch(() => {});
        onFound(food, code.digits);
      } else {
        setPhase({ kind: "not-found", code: code.digits });
        AccessibilityInfo.announceForAccessibility("Product not found");
      }
    } catch (e) {
      if (mounted.current)
        setPhase({ kind: "error", message: brandedProblem(e) });
    } finally {
      busy.current = false;
    }
  }
  const onScanned = (result: BarcodeScanningResult) =>
    void lookUp(result.type, result.data);
  const again = () => {
    busy.current = false;
    setPhase({ kind: "scanning" });
  };

  const scanning = phase.kind === "scanning";
  const granted = !!permission?.granted;
  const height = Math.min(360, Math.max(220, window.height * 0.4));

  let viewport: React.ReactNode;
  if (!permission)
    viewport = <Notice icon="camera-outline" title="Starting the camera…" />;
  else if (!granted)
    viewport = (
      <Notice
        icon="camera-outline"
        title="Camera access is off"
        body={
          permission.canAskAgain
            ? "FORGE needs the camera to read barcodes. Nothing is recorded."
            : "Allow camera access for FORGE in Settings to scan barcodes, or type the numbers below."
        }
        action={
          permission.canAskAgain ? (
            <OutlineButton
              title="Allow camera"
              icon="camera-outline"
              accessibilityLabel="Allow camera access"
              onPress={() => void requestPermission().catch(() => {})}
            />
          ) : (
            <OutlineButton
              title="Open Settings"
              icon="settings-outline"
              accessibilityLabel="Open Settings to allow camera access"
              onPress={() => void Linking.openSettings().catch(() => {})}
            />
          )
        }
      />
    );
  else if (unavailable)
    viewport = (
      <Notice
        icon="videocam-off-outline"
        title="Camera unavailable"
        body="The camera can't be used right now. Type the barcode numbers below instead."
      />
    );
  else
    viewport = (
      <>
        <CameraView
          testID="barcode-camera"
          style={{ flex: 1 }}
          facing="back"
          active={scanning}
          enableTorch={torch && scanning}
          barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }}
          onBarcodeScanned={scanning ? onScanned : undefined}
          onMountError={() => setUnavailable(true)}
        />
        <Frame dim={!scanning} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            torch ? "Turn the light off" : "Turn the light on"
          }
          accessibilityState={{ selected: torch }}
          onPress={() => setTorch((t) => !t)}
          style={({ pressed }) => ({
            position: "absolute",
            right: 12,
            bottom: 12,
            width: forge.heights.compact,
            height: forge.heights.compact,
            borderRadius: forge.heights.compact / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: torch ? c.emberHot : "rgba(0,0,0,0.55)",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons
            name={torch ? "flashlight" : "flashlight-outline"}
            size={20}
            color="#FFFFFF"
          />
        </Pressable>
      </>
    );

  return (
    <View style={{ gap: forge.spacing.cardGap }}>
      <View
        style={{
          height,
          borderRadius: forge.radii.card,
          overflow: "hidden",
          backgroundColor: "#050607",
          borderWidth: forge.border.card,
          borderColor: c.cardBorder,
        }}
      >
        {viewport}
      </View>
      <Status
        phase={phase}
        camera={granted && !unavailable}
        onAgain={again}
        onSearch={onSearch}
        onCreate={onCreate}
      />
      <View style={{ gap: 8 }}>
        <FText variant="overline" tone="secondary">
          Or type the barcode
        </FText>
        <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
          <TextInput
            accessibilityLabel="Barcode numbers"
            value={typed}
            onChangeText={(t) => setTyped(t.replace(/[^\d ]/g, ""))}
            placeholder="e.g. 049000028911"
            placeholderTextColor={c.text3}
            keyboardType="number-pad"
            returnKeyType="search"
            maxLength={18}
            onSubmitEditing={() =>
              typed.trim() && void lookUp(undefined, typed)
            }
            maxFontSizeMultiplier={1.6}
            style={{
              flex: 1,
              minHeight: forge.heights.button,
              borderRadius: forge.radii.input,
              borderWidth: forge.border.card,
              borderColor: c.cardBorder,
              backgroundColor: c.cardRaised,
              paddingHorizontal: 14,
              color: c.text,
              fontSize: 16,
              letterSpacing: 1,
            }}
          />
          <View style={{ width: 120 }}>
            <CtaButton
              title="Look up"
              compact
              accessibilityLabel="Look up typed barcode"
              disabled={!typed.trim() || phase.kind === "looking"}
              onPress={() => void lookUp(undefined, typed)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

/** The framing guide: four ember corners, quiet enough to see through. */
function Frame({ dim }: { dim: boolean }) {
  const c = useColors();
  const arm = 26;
  const corner = (v: "top" | "bottom", h: "left" | "right") => ({
    position: "absolute" as const,
    [v]: 0,
    [h]: 0,
    width: arm,
    height: arm,
    borderColor: c.emberHot,
    [`border${v === "top" ? "Top" : "Bottom"}Width`]: 3,
    [`border${h === "left" ? "Left" : "Right"}Width`]: 3,
    [`border${v === "top" ? "Top" : "Bottom"}${h === "left" ? "Left" : "Right"}Radius`]: 10,
  });
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: dim ? "rgba(0,0,0,0.45)" : undefined,
      }}
    >
      <View style={{ width: "78%", aspectRatio: 2.1 }}>
        <View style={corner("top", "left")} />
        <View style={corner("top", "right")} />
        <View style={corner("bottom", "left")} />
        <View style={corner("bottom", "right")} />
      </View>
    </View>
  );
}

/** A message in place of the camera (permission, availability). */
function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: forge.spacing.cardPadding,
        gap: 10,
      }}
    >
      <Ionicons name={icon} size={30} color={c.text2} />
      <FText variant="cardTitle" weight="700" style={{ textAlign: "center" }}>
        {title}
      </FText>
      {body && (
        <FText variant="body" tone="secondary" style={{ textAlign: "center" }}>
          {body}
        </FText>
      )}
      {action && <View style={{ alignSelf: "stretch" }}>{action}</View>}
    </View>
  );
}

/** What the scanner is doing, and what to do next. */
function Status({
  phase,
  camera,
  onAgain,
  onSearch,
  onCreate,
}: {
  phase: Phase;
  camera: boolean;
  onAgain: () => void;
  onSearch: () => void;
  onCreate: () => void;
}) {
  if (phase.kind === "scanning")
    return (
      <FText variant="body" tone="secondary">
        {camera
          ? "Line up the barcode inside the frame. It scans on its own."
          : "Type the numbers under the barcode to look the product up."}
      </FText>
    );
  if (phase.kind === "looking")
    return (
      <FText variant="body" tone="secondary">
        {`Looking up ${phase.code}…`}
      </FText>
    );
  const again = (
    <OutlineButton
      title={camera ? "Scan again" : "Try another code"}
      icon="scan-outline"
      onPress={onAgain}
    />
  );
  if (phase.kind === "unreadable")
    return (
      <View style={{ gap: 10 }}>
        <FText variant="cardTitle" weight="700">
          {"That barcode couldn’t be read"}
        </FText>
        <FText variant="body" tone="secondary">
          Hold the phone steady with the whole barcode inside the frame, or type
          all of its numbers.
        </FText>
        {again}
      </View>
    );
  if (phase.kind === "error")
    return (
      <View style={{ gap: 10 }}>
        <FText variant="body" tone="secondary">
          {phase.message}
        </FText>
        {again}
      </View>
    );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <FText variant="cardTitle" weight="700" header>
          Product not found
        </FText>
        <FText variant="body" tone="secondary">
          {`Barcode ${phase.code} isn't in FORGE's offline USDA branded foods. Search for it by name, or create it from its label.`}
        </FText>
      </View>
      {again}
      <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
        <View style={{ flex: 1 }}>
          <OutlineButton
            title="Search foods"
            icon="search"
            onPress={onSearch}
          />
        </View>
        <View style={{ flex: 1 }}>
          <OutlineButton
            title="Create food"
            icon="create-outline"
            onPress={onCreate}
          />
        </View>
      </View>
    </View>
  );
}
