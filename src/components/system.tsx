import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, Modal, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "react-native-reanimated";
import { Txt, IconButton, Sheet, useColors, type IconName } from "./ui";
import { theme } from "../theme";

// FORGE Design System 2.0 composite components: grouped list rows, overflow
// menus and information sheets.

// ---- Grouped lists ----------------------------------------------------------

/**
 * A tappable or informational row. Rows replace navigation buttons: title,
 * optional subtitle and trailing value, chevron when it navigates.
 */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  chevron,
  destructive = false,
  disabled = false,
  trailing,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const showChevron = chevron ?? (!!onPress && !destructive && !disabled);
  const content = (
    <>
      {icon && (
        <Ionicons
          name={icon}
          size={22}
          color={destructive ? c.error : c.text2}
          style={{ width: 24 }}
        />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          variant="body"
          weight="600"
          tone={destructive ? "error" : disabled ? "tertiary" : "primary"}
          numberOfLines={2}
        >
          {title}
        </Txt>
        {subtitle && (
          <Txt variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Txt>
        )}
      </View>
      {value !== undefined && (
        <Txt variant="body" tone="secondary" tabular numberOfLines={1}>
          {value}
        </Txt>
      )}
      {trailing}
      {showChevron && (
        <Ionicons name="chevron-forward" size={18} color={c.text3} />
      )}
    </>
  );
  const style = {
    minHeight: subtitle ? theme.heights.rowTall : theme.heights.row,
    paddingHorizontal: theme.spacing.row,
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing.group,
  };
  if (!onPress)
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={style}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        pressed ? { backgroundColor: c.surfaceRaised } : undefined,
      ]}
    >
      {content}
    </Pressable>
  );
}

/**
 * A titled group of rows on one tonal surface, separated by hairlines. Use for
 * navigation, settings and lists of records.
 */
export function ListSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {title && (
        <Txt
          variant="overline"
          tone="secondary"
          header
          style={{ paddingHorizontal: theme.spacing.xs }}
        >
          {title}
        </Txt>
      )}
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: theme.radii.card,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: c.hairline,
                  marginLeft: theme.spacing.row,
                }}
              />
            )}
            {row}
          </View>
        ))}
      </View>
      {footer && (
        <Txt
          variant="caption"
          tone="secondary"
          style={{ paddingHorizontal: theme.spacing.xs }}
        >
          {footer}
        </Txt>
      )}
    </View>
  );
}

// ---- Overflow menus ---------------------------------------------------------

export type MenuAction = {
  label: string;
  icon?: IconName;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * A "•••" button that opens a list of secondary actions. Destructive actions
 * render last in red. The chosen action runs exactly once, after the menu has
 * closed, so it may open another sheet, a confirmation or a new screen.
 */
export function OverflowMenu({
  actions,
  label = "More options",
  title,
  icon = "ellipsis-horizontal",
  renderTrigger: Trigger,
}: {
  actions: MenuAction[];
  label?: string;
  title?: string;
  icon?: IconName;
  /** A custom trigger (e.g. a REFORGE bordered square); default: icon button. */
  renderTrigger?: React.ComponentType<{ onPress: () => void; label: string }>;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const pending = useRef<MenuAction | undefined>(undefined);
  const [closing, setClosing] = useState(0);
  const ordered = [
    ...actions.filter((a) => !a.destructive),
    ...actions.filter((a) => a.destructive),
  ];
  // Idempotent: whichever of onDismiss or the fallback fires first runs the
  // action; the other finds nothing pending.
  const run = useCallback(() => {
    const action = pending.current;
    pending.current = undefined;
    action?.onPress();
  }, []);
  // iOS cannot present a new modal until the menu has finished dismissing, so
  // it waits for onDismiss; the timer only covers a missed dismissal event.
  // Other platforms run the action as soon as the menu has closed.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(
      run,
      Platform.OS === "ios" ? (reduced ? 150 : 700) : 0,
    );
    return () => clearTimeout(t);
  }, [closing, run, reduced]);
  function choose(action: MenuAction) {
    // A second tap while the first choice is closing the menu is ignored.
    if (pending.current || action.disabled) return;
    pending.current = action;
    setOpen(false);
    setClosing((n) => n + 1);
  }
  const openMenu = () => {
    if (!pending.current) setOpen(true);
  };
  return (
    <>
      {Trigger ? (
        <Trigger onPress={openMenu} label={label} />
      ) : (
        <IconButton icon={icon} label={label} onPress={openMenu} />
      )}
      <Modal
        visible={open}
        transparent
        animationType={reduced ? "none" : "fade"}
        onRequestClose={() => setOpen(false)}
        onDismiss={run}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            accessible={false}
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          />
          <SafeAreaView
            edges={["bottom"]}
            accessibilityViewIsModal
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingBottom: theme.spacing.sm,
              gap: theme.spacing.sm,
            }}
          >
            <View
              accessibilityRole="menu"
              accessibilityLabel={title ?? label}
              style={{
                backgroundColor: c.surface,
                borderRadius: theme.radii.card,
                overflow: "hidden",
                ...theme.elevation.floating,
              }}
            >
              {title && (
                <View
                  style={{
                    paddingHorizontal: theme.spacing.row,
                    paddingVertical: theme.spacing.group,
                  }}
                >
                  <Txt variant="caption" tone="secondary" align="center">
                    {title}
                  </Txt>
                </View>
              )}
              {ordered.map((action, i) => (
                <View key={action.label}>
                  {(i > 0 || title) && (
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: c.hairline,
                      }}
                    />
                  )}
                  <Pressable
                    accessibilityRole="menuitem"
                    accessibilityLabel={action.label}
                    accessibilityState={{ disabled: !!action.disabled }}
                    disabled={action.disabled}
                    onPress={() => choose(action)}
                    style={({ pressed }) => ({
                      minHeight: theme.heights.row,
                      paddingHorizontal: theme.spacing.row,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.group,
                      backgroundColor: pressed ? c.surfaceRaised : undefined,
                    })}
                  >
                    {action.icon && (
                      <Ionicons
                        name={action.icon}
                        size={20}
                        color={
                          action.disabled
                            ? c.text3
                            : action.destructive
                              ? c.error
                              : c.text
                        }
                      />
                    )}
                    <Txt
                      variant="body"
                      weight="600"
                      tone={
                        action.disabled
                          ? "tertiary"
                          : action.destructive
                            ? "error"
                            : "primary"
                      }
                    >
                      {action.label}
                    </Txt>
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setOpen(false)}
              style={({ pressed }) => ({
                minHeight: theme.heights.row,
                borderRadius: theme.radii.card,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? c.surfaceRaised : c.surface,
              })}
            >
              <Txt variant="body" weight="700">
                Cancel
              </Txt>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

// ---- Information sheets -----------------------------------------------------

/**
 * Runs an action chosen inside a sheet once the sheet has closed. iOS cannot
 * present a screen or alert while a sheet is still dismissing, so it waits
 * for the sheet's `onDismiss` (with a fallback timer); other platforms run it
 * right after closing. Pass `onDismiss` to the Sheet.
 */
export function useAfterSheet() {
  const pending = useRef<(() => void) | undefined>(undefined);
  const onDismiss = useCallback(() => {
    const action = pending.current;
    pending.current = undefined;
    action?.();
  }, []);
  const after = useCallback(
    (close: () => void, action: () => void) => {
      pending.current = action;
      close();
      setTimeout(onDismiss, Platform.OS === "ios" ? 700 : 0);
    },
    [onDismiss],
  );
  return { after, onDismiss };
}

/**
 * Educational content kept out of primary surfaces. Paragraphs render as
 * readable body text; nothing is lost, it is one tap away.
 */
export function InfoSheet({
  visible,
  onClose,
  title,
  paragraphs,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  paragraphs?: string[];
  children?: React.ReactNode;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} dismissOnBackdrop>
      {paragraphs?.map((p, i) => (
        <Txt key={i} tone="secondary">
          {p}
        </Txt>
      ))}
      {children}
    </Sheet>
  );
}

/** A small "i" button that opens an information sheet. */
export function InfoButton({
  title,
  paragraphs,
  children,
  label,
}: {
  title: string;
  paragraphs?: string[];
  children?: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon="information-circle-outline"
        label={label ?? `About ${title}`}
        size={20}
        onPress={() => setOpen(true)}
      />
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        paragraphs={paragraphs}
      >
        {children}
      </InfoSheet>
    </>
  );
}
