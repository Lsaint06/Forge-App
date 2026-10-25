import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  TextInput,
  Pressable,
  Platform,
  Keyboard,
  useWindowDimensions,
  type StyleProp,
  type TextInputInstance,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Alert } from "../platform/alert";
import { useRepo, mutate } from "../state";
import {
  Txt,
  IconButton,
  useColors,
  parseNumber,
  formatNumber,
  textWidth,
  useAnnouncedError,
  type NumberRule,
} from "./ui";
import { kgToLb, lbToKg } from "../domain/metrics";
import { previousText } from "../domain/workout-display";
import {
  copyForwardTargets,
  hasPrevious,
  previousValues,
} from "../domain/copy-forward";
import type { WorkoutSet } from "../domain/types";
import { restNotification } from "../notifications";
import { theme } from "../theme";
import {
  setGridLayout,
  SET_COLUMN,
  CHECK_COLUMN,
  GRID_GAP,
  INPUT_MAX_SCALE,
  type GridLayout,
  type GridFields,
} from "./set-grid-layout";

// ---- Keyboard order ---------------------------------------------------------

/** iOS keyboard toolbar shared by every set input (Next / Done). */
export const SET_KEYBOARD_ID = "forge-set-keyboard";

const compareOrder = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

/**
 * Input order across the workout: exercise, then set, then column. "Next"
 * walks weight → reps → RIR → the next set → the next exercise.
 */
export class SetFocusOrder {
  private entries = new Map<
    string,
    { order: number[]; input: TextInputInstance }
  >();
  private current: string | undefined;
  register(key: string, order: number[], input: TextInputInstance) {
    this.entries.set(key, { order, input });
    return () => {
      if (this.entries.get(key)?.input === input) this.entries.delete(key);
    };
  }
  focused(key: string) {
    this.current = key;
  }
  /** Focuses the input after `from`; false when there is none. */
  next(from = this.current) {
    const sorted = [...this.entries].sort((a, b) =>
      compareOrder(a[1].order, b[1].order),
    );
    const index = sorted.findIndex(([key]) => key === from);
    const target = index < 0 ? undefined : sorted[index + 1];
    if (!target) return false;
    target[1].input.focus();
    return true;
  }
}
const FocusContext = createContext<SetFocusOrder | undefined>(undefined);
export function SetFocusProvider({ children }: { children: React.ReactNode }) {
  const order = useMemo(() => new SetFocusOrder(), []);
  return (
    <FocusContext.Provider value={order}>{children}</FocusContext.Provider>
  );
}
export const useSetFocus = () => useContext(FocusContext);

// ---- Weight copy-forward ----------------------------------------------------

/**
 * Remembers, while the logger is open, which loads the lifter typed and which
 * Forge copied (see domain/copy-forward.ts). Provided only for workouts in
 * progress: reviewing or editing history never copies loads.
 */
export class WeightFill {
  touched = new Set<string>();
  filled = new Set<string>();
  /** The lifter chose this set's load: never overwrite it. */
  touch(setId: string) {
    this.touched.add(setId);
    this.filled.delete(setId);
  }
  /** Saves a typed load (kg) and copies it into the empty sets that follow. */
  save(r: ReturnType<typeof useRepo>, s: WorkoutSet, kg: number) {
    this.touch(s.id);
    mutate(() =>
      r.transaction(() => {
        r.editSet(s.id, { weight: kg });
        for (const id of copyForwardTargets(
          r.sets(s.exerciseRowId),
          s.id,
          this,
        )) {
          r.editSet(id, { weight: kg });
          this.filled.add(id);
        }
      }),
    );
  }
}
const FillContext = createContext<WeightFill | undefined>(undefined);
export function WeightFillProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  /** Off for finished workouts, including while editing them. */
  enabled?: boolean;
}) {
  const fill = useMemo(() => new WeightFill(), []);
  return (
    <FillContext.Provider value={enabled ? fill : undefined}>
      {children}
    </FillContext.Provider>
  );
}

// ---- Cells ------------------------------------------------------------------

const column = (min: number): ViewStyle => ({
  flexGrow: min,
  flexBasis: 0,
  minWidth: min,
});

/**
 * A compact numeric input. Saves every valid keystroke (like NumberField);
 * invalid entries are kept as a draft, outlined in red and explained to
 * screen readers. The value is selected on focus for fast replacement.
 *
 * Only text the lifter changed is saved: focusing a cell (for example while
 * stepping through with Next) never writes the rounded display value back,
 * so lb conversions cannot drift and an applied load is never overwritten.
 */
function NumberCell({
  label,
  value,
  onSave,
  rule,
  focusKey,
  order,
  placeholder,
  completed,
  style,
}: {
  label: string;
  value: number | null;
  onSave: (n: number | null) => void;
  rule: NumberRule;
  focusKey: string;
  order: number[];
  placeholder?: string;
  completed: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const focus = useSetFocus();
  const ref = useRef<TextInputInstance>(null);
  const [draft, setDraft] = useState(formatNumber(value));
  const [focused, setFocused] = useState(false);
  // Whether the text was changed during this focus.
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState("");
  useAnnouncedError(label, error);
  const orderKey = order.join(".");
  useEffect(() => {
    if (!focus || !ref.current) return;
    return focus.register(
      focusKey,
      orderKey.split(".").map(Number),
      ref.current,
    );
  }, [focus, focusKey, orderKey]);
  function save(text: string) {
    const result = parseNumber(text, rule);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError("");
    onSave(result.value);
  }
  return (
    <View style={style}>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        value={edited ? draft : formatNumber(value)}
        placeholder={placeholder}
        placeholderTextColor={c.text3}
        keyboardType={rule.integer ? "number-pad" : "decimal-pad"}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => {
          if (!focus?.next(focusKey)) Keyboard.dismiss();
        }}
        inputAccessoryViewID={
          Platform.OS === "ios" && focus ? SET_KEYBOARD_ID : undefined
        }
        selectTextOnFocus
        selectionColor={c.ember}
        maxFontSizeMultiplier={INPUT_MAX_SCALE}
        onFocus={() => {
          setDraft(formatNumber(value));
          setEdited(false);
          setFocused(true);
          focus?.focused(focusKey);
        }}
        onChangeText={(text) => {
          setDraft(text);
          setEdited(true);
          save(text);
        }}
        onEndEditing={() => {
          if (edited) save(draft);
          setEdited(false);
          setFocused(false);
        }}
        style={{
          minHeight: 44,
          borderRadius: 10,
          paddingHorizontal: 4,
          paddingVertical: 6,
          textAlign: "center",
          color: c.text,
          fontSize: 17,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
          backgroundColor:
            completed && !focused ? "transparent" : c.surfaceRaised,
          borderWidth: 1,
          borderColor: error ? c.error : focused ? c.ember : "transparent",
        }}
      />
    </View>
  );
}

/** A logged value in review mode: the same cell, but read-only text. */
function ValueCell({
  label,
  text,
  style,
}: {
  label: string;
  text: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${text || "not logged"}`}
      style={[{ minHeight: 44, justifyContent: "center" }, style]}
    >
      <Txt variant="body" weight="600" tabular align="center" numberOfLines={1}>
        {text || "–"}
      </Txt>
    </View>
  );
}

/** "135 pounds for 8 reps", for the "use previous" control. */
function spokenPrevious(s: WorkoutSet, category: string, units: "kg" | "lb") {
  if (category === "duration") return `${s.duration} seconds`;
  if (category === "distance")
    return `${s.distance} meters in ${s.duration} seconds`;
  if (s.weight === 0) return `${s.reps} reps`;
  const load =
    Math.round((units === "lb" ? kgToLb(s.weight) : s.weight) * 10) / 10;
  return `${load} ${units === "lb" ? "pounds" : "kilograms"} for ${s.reps} reps`;
}

/**
 * The previous result as a button that fills this set with it. Outlined so it
 * reads as an action, distinct from the filled input cells.
 */
function UsePrevious({
  text,
  spoken,
  onPress,
  wide,
  inline = false,
  style,
}: {
  text: string;
  spoken: string;
  onPress: () => void;
  wide: boolean;
  /** Beside the set number (stacked layout), in a 44 pt row. */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  // In a 44 pt row (the wide grid's Prev column, or beside the set number
  // when stacked) the whole row height is the target, so nothing overlaps.
  // Under the cells (compact grid) a hitSlop extends the 24 pt chip.
  const row = wide || inline;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use previous ${spoken}`}
      accessibilityHint="Fills this set with your last result. You can still change it."
      hitSlop={row ? undefined : { top: 10, bottom: 10 }}
      onPress={onPress}
      style={[
        {
          justifyContent: "center",
          alignSelf: wide ? "stretch" : "flex-start",
          minHeight: row ? 44 : 24,
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            minHeight: wide ? 32 : 24,
            paddingHorizontal: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.hairline,
            backgroundColor: pressed ? c.selected : "transparent",
          }}
        >
          {!wide && (
            <Ionicons name="arrow-redo-outline" size={12} color={c.text2} />
          )}
          <Txt
            variant="caption"
            tone="secondary"
            tabular
            align="center"
            numberOfLines={1}
            fit={wide}
          >
            {wide ? text : `Previous ${text}`}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

const kindTag: Record<WorkoutSet["kind"], string> = {
  working: "",
  warmup: "W",
  drop: "D",
  failure: "F",
};
const kindName: Record<WorkoutSet["kind"], string> = {
  working: "",
  warmup: "warm-up",
  drop: "drop set",
  failure: "to failure",
};

/**
 * The set number doubles as the Set Details control. Dots (or a set-type
 * letter: W, D, F) under the number mark it as tappable.
 */
function SetNumber({
  set: s,
  onPress,
}: {
  set: WorkoutSet;
  onPress?: () => void;
}) {
  const c = useColors();
  const n = s.position + 1;
  const side = s.side === "left" ? "L" : s.side === "right" ? "R" : "";
  const tag = `${kindTag[s.kind]}${side}`;
  const described = [
    kindName[s.kind],
    side && `${s.side === "left" ? "left" : "right"} side`,
  ]
    .filter(Boolean)
    .join(", ");
  const content = (
    <>
      <Txt variant="headline" tabular>
        {n}
      </Txt>
      {tag ? (
        <Txt variant="overline" tone="secondary">
          {tag}
        </Txt>
      ) : onPress ? (
        <Ionicons name="ellipsis-horizontal" size={12} color={c.text3} />
      ) : null}
    </>
  );
  const box: ViewStyle = {
    width: SET_COLUMN,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  };
  if (!onPress) return <View style={box}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Set ${n} details`}
      accessibilityHint="Set type, side, RPE, RIR, rest, tempo, notes or remove"
      accessibilityValue={described ? { text: described } : undefined}
      hitSlop={{ left: 6, right: GRID_GAP }}
      onPress={onPress}
      style={({ pressed }) => [
        box,
        { backgroundColor: pressed ? c.selected : "transparent" },
      ]}
    >
      {content}
    </Pressable>
  );
}

// ---- Rows -------------------------------------------------------------------

export const gridFields = (category: string, showRir: boolean): GridFields => ({
  secondary: category !== "duration",
  rir: category === "strength" && showRir,
});

/**
 * One set: number (opens Set Details), previous result, inputs and the
 * completion check. Completing a set saves it, starts the rest timer and
 * gives a light haptic. `readOnly` shows the logged values without any
 * control (reviewing a finished workout).
 */
export function SetRow({
  set: s,
  category,
  showRir = false,
  previous,
  layout,
  order = [0],
  rirPlaceholder,
  onDetails,
  startsRest = true,
  readOnly = false,
}: {
  set: WorkoutSet;
  category: string;
  showRir?: boolean;
  previous?: WorkoutSet;
  layout?: GridLayout;
  order?: number[];
  rirPlaceholder?: string;
  onDetails?: () => void;
  readOnly?: boolean;
  /** False when reviewing a finished workout: no rest timer or reminder. */
  startsRest?: boolean;
}) {
  const r = useRepo();
  const p = r.profile();
  const c = useColors();
  const n = s.position + 1;
  const fields = gridFields(category, showRir);
  const grid = layout ?? setGridLayout(Infinity, 1, fields);
  const prev = previousText(previous, category, p.units);
  const strength = category === "strength";
  const fill = useContext(FillContext);
  function save(patch: Partial<WorkoutSet>) {
    mutate(() => r.editSet(s.id, patch));
  }
  function saveWeight(kg: number) {
    if (fill && !readOnly) fill.save(r, s, kg);
    else save({ weight: kg });
  }
  // Last session's matching set fills this one (only this one, never
  // marked done) while it is still open for logging.
  const usePrevious =
    !readOnly && !s.completed && hasPrevious(previous, category)
      ? () => {
          fill?.touch(s.id);
          save(previousValues(previous!, category));
        }
      : undefined;
  function toggle() {
    mutate(() => r.editSet(s.id, { completed: !s.completed }));
    if (
      startsRest &&
      !s.completed &&
      r.sets(s.exerciseRowId).find((x) => x.id === s.id)?.completed
    ) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => {},
      );
      const deadline = Date.now() + s.rest * 1000;
      mutate(() => r.setSetting("restDeadline", String(deadline)));
      void restNotification(deadline).catch((e) =>
        Alert.alert("Rest saved; notification unavailable", String(e)),
      );
    }
  }
  const stacked = grid.mode === "stacked";
  const inputs: {
    key: string;
    caption: string;
    min: number;
    cell: Omit<
      React.ComponentProps<typeof NumberCell>,
      "focusKey" | "order" | "completed" | "style"
    >;
  }[] = strength
    ? [
        {
          key: "weight",
          caption: p.units,
          min: grid.min.primary,
          cell: {
            label: `Set ${n} weight (${p.units})`,
            value: p.units === "lb" ? kgToLb(s.weight) : s.weight,
            rule: {},
            onSave: (v) =>
              saveWeight(p.units === "lb" ? lbToKg(v ?? 0) : (v ?? 0)),
          },
        },
        {
          key: "reps",
          caption: "Reps",
          min: grid.min.secondary,
          cell: {
            label: `Set ${n} reps`,
            value: s.reps,
            rule: { integer: true, max: 10000 },
            onSave: (v) => save({ reps: v ?? 0 }),
          },
        },
        ...(fields.rir
          ? [
              {
                key: "rir",
                caption: "RIR",
                min: grid.min.rir,
                cell: {
                  label: `Set ${n} RIR`,
                  value: s.rir,
                  rule: { nullable: true, max: 20 },
                  placeholder: rirPlaceholder,
                  onSave: (v: number | null) => save({ rir: v }),
                },
              },
            ]
          : []),
      ]
    : [
        {
          key: "duration",
          caption: "Sec",
          min: grid.min.primary,
          cell: {
            label: `Set ${n} duration (seconds)`,
            value: s.duration,
            rule: {},
            onSave: (v) => save({ duration: v ?? 0 }),
          },
        },
        ...(category === "distance"
          ? [
              {
                key: "distance",
                caption: "M",
                min: grid.min.secondary,
                cell: {
                  label: `Set ${n} distance (meters)`,
                  value: s.distance,
                  rule: {},
                  onSave: (v: number | null) => save({ distance: v ?? 0 }),
                },
              },
            ]
          : []),
      ];
  const cells = inputs.map((input, i) => (
    <View key={input.key} style={[column(input.min), { gap: 2 }]}>
      {stacked && (
        <Txt variant="overline" tone="secondary" align="center">
          {input.caption}
        </Txt>
      )}
      {readOnly ? (
        <ValueCell
          label={input.cell.label}
          text={formatNumber(input.cell.value)}
        />
      ) : (
        <NumberCell
          {...input.cell}
          focusKey={`${s.id}:${input.key}`}
          order={[...order, s.position, i]}
          completed={s.completed}
        />
      )}
    </View>
  ));
  const check = readOnly ? (
    <View
      accessible
      accessibilityLabel={`Set ${n} ${s.completed ? "done" : "not done"}`}
      style={{
        width: CHECK_COLUMN,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={s.completed ? "checkmark-circle" : "remove-outline"}
        size={s.completed ? 28 : 20}
        color={s.completed ? c.success : c.text3}
      />
    </View>
  ) : (
    <IconButton
      label={s.completed ? `Mark set ${n} incomplete` : `Complete set ${n}`}
      selected={s.completed}
      tone={s.completed ? "success" : "secondary"}
      icon={s.completed ? "checkmark-circle" : "ellipse-outline"}
      size={28}
      onPress={toggle}
    />
  );
  const spoken = previous ? spokenPrevious(previous, category, p.units) : "";
  const captionStyle: ViewStyle = stacked
    ? { flex: 1 }
    : { marginLeft: SET_COLUMN + GRID_GAP };
  const previousCaption =
    previous &&
    (usePrevious ? (
      <View style={captionStyle}>
        <UsePrevious
          text={prev.text}
          spoken={spoken}
          onPress={usePrevious}
          wide={false}
          inline={stacked}
        />
      </View>
    ) : (
      <View accessible accessibilityLabel={prev.spoken} style={captionStyle}>
        <Txt variant="caption" tone="secondary" tabular numberOfLines={1}>
          {`Previous ${prev.text}`}
        </Txt>
      </View>
    ));
  return (
    <View
      style={{
        gap: 2,
        marginHorizontal: -6,
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: s.completed ? c.successSubtle : "transparent",
      }}
    >
      {stacked ? (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: GRID_GAP,
            }}
          >
            <SetNumber set={s} onPress={onDetails} />
            {previousCaption ?? <View style={{ flex: 1 }} />}
            {check}
          </View>
          <View style={{ flexDirection: "row", gap: GRID_GAP }}>{cells}</View>
        </>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: GRID_GAP,
            }}
          >
            <SetNumber set={s} onPress={onDetails} />
            {grid.mode === "wide" &&
              (usePrevious ? (
                <View
                  style={[column(grid.min.prev), { justifyContent: "center" }]}
                >
                  <UsePrevious
                    text={prev.text}
                    spoken={spoken}
                    onPress={usePrevious}
                    wide
                  />
                </View>
              ) : (
                <View
                  accessible
                  accessibilityLabel={prev.spoken}
                  style={column(grid.min.prev)}
                >
                  <Txt
                    variant="caption"
                    tone="secondary"
                    tabular
                    align="center"
                    numberOfLines={1}
                    fit
                  >
                    {prev.text}
                  </Txt>
                </View>
              ))}
            {cells}
            {check}
          </View>
          {grid.mode === "compact" && previousCaption}
        </>
      )}
    </View>
  );
}

function GridHeader({
  layout,
  category,
  showRir,
}: {
  layout: GridLayout;
  category: string;
  showRir: boolean;
}) {
  const r = useRepo();
  const c = useColors();
  const { fontScale } = useWindowDimensions();
  const fields = gridFields(category, showRir);
  const strength = category === "strength";
  // A caption wider than its column (e.g. "SET" at large text) overflows it,
  // centred, instead of breaking mid-word. The header is hidden from screen
  // readers; every cell has its own label.
  const label = (text: string, style: ViewStyle) => (
    <View style={[style, { alignItems: "center" }]}>
      <Txt
        variant="overline"
        tone="secondary"
        align="center"
        numberOfLines={1}
        style={{
          width: Math.ceil(
            textWidth(text.toUpperCase(), 11, fontScale || 1, 1.6) + 4,
          ),
        }}
      >
        {text}
      </Txt>
    </View>
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", gap: GRID_GAP }}
    >
      {label("Set", { width: SET_COLUMN })}
      {layout.mode === "wide" && label("Prev", column(layout.min.prev))}
      {label(strength ? r.profile().units : "Sec", column(layout.min.primary))}
      {fields.secondary &&
        label(strength ? "Reps" : "M", column(layout.min.secondary))}
      {fields.rir && label("RIR", column(layout.min.rir))}
      <View style={{ width: CHECK_COLUMN, alignItems: "center" }}>
        <Ionicons name="checkmark" size={14} color={c.text3} />
      </View>
    </View>
  );
}

/**
 * The set grid for one exercise. It measures its own width and picks the
 * wide, compact or stacked layout (see set-grid-layout.ts).
 */
export function SetGrid({
  sets,
  category,
  showRir,
  previous,
  rirPlaceholder,
  order,
  onDetails,
  startsRest = true,
  readOnly = false,
}: {
  sets: WorkoutSet[];
  category: string;
  showRir: boolean;
  previous: (WorkoutSet | undefined)[];
  rirPlaceholder?: string;
  order: number;
  onDetails: (s: WorkoutSet) => void;
  startsRest?: boolean;
  /** Reviewing a finished workout: values only, no controls. */
  readOnly?: boolean;
}) {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  // Until measured: the screen minus its margins and the card's padding.
  const [width, setWidth] = useState(
    windowWidth - 2 * theme.spacing.screen - 2 * theme.spacing.group,
  );
  const layout = setGridLayout(width, fontScale, gridFields(category, showRir));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ gap: 2 }}
    >
      {layout.mode !== "stacked" && (
        <GridHeader layout={layout} category={category} showRir={showRir} />
      )}
      {sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          category={category}
          showRir={showRir}
          previous={previous[i]}
          layout={layout}
          order={[order]}
          rirPlaceholder={rirPlaceholder}
          onDetails={readOnly ? undefined : () => onDetails(s)}
          startsRest={startsRest}
          readOnly={readOnly}
        />
      ))}
    </View>
  );
}
