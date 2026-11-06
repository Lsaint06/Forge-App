import React, { useState } from "react";
import { Sheet, confirmDiscard } from "../../components/ui";
import { ProfileForm, type ProfileField } from "../../components/ProfileForm";
import { useRepo, mutate } from "../../state";
import { TARGETS_SAVED } from "../../domain/nutrition";
import { IdentityPreview } from "./sections";

// The focused profile editors (Phase 6; REFORGE since 7.5B.1), shared by You
// (Edit profile, Training focus and the `?edit=` links) and Preferences
// (Phase 7.5D). Each is the same ProfileForm as onboarding, so validation
// and storage are unchanged.

export type Editor = "profile" | "focus" | "training" | "nutrition";
export const editors: Record<
  Editor,
  { title: string; fields: ProfileField[]; save: string }
> = {
  profile: {
    title: "Edit profile",
    // Body fat is not asked here (7.5B.1): a saved value is kept unchanged,
    // and body fat is tracked as a measurement.
    fields: ["name", "height", "weight"],
    save: "Save profile",
  },
  focus: {
    title: "Training focus",
    fields: ["journey"],
    save: "Save training focus",
  },
  training: {
    title: "Training preferences",
    fields: ["frequency", "rest", "increment", "repMin", "repMax", "muscles"],
    save: "Save preferences",
  },
  nutrition: {
    title: "Nutrition targets",
    fields: ["calories", "protein", "carbs", "fat"],
    save: "Save targets",
  },
};
export const isEditor = (value: unknown): value is Editor =>
  typeof value === "string" && value in editors;

/**
 * One editor in a sheet. The sheet and Cancel ask before discarding unsaved
 * changes; a successful nutrition save records the targets as the lifter's
 * own.
 */
export function EditorSheet({
  editor,
  onClose,
}: {
  editor?: Editor;
  onClose: () => void;
}) {
  const r = useRepo();
  const [dirty, setDirty] = useState(false);
  function close() {
    onClose();
    setDirty(false);
  }
  return (
    <Sheet
      visible={!!editor}
      onClose={close}
      title={editor ? editors[editor].title : ""}
      unsaved={dirty}
    >
      {editor && (
        <ProfileForm
          key={editor}
          fields={editors[editor].fields}
          saveLabel={editors[editor].save}
          onDirtyChange={setDirty}
          onCancel={() => (dirty ? confirmDiscard(close) : close())}
          preview={(name) => <IdentityPreview name={name} />}
          onDone={() => {
            // Called only after a successful save: the targets are now the
            // lifter's own, even if they match the suggested defaults.
            if (editor === "nutrition")
              mutate(() => r.setSetting(TARGETS_SAVED, "1"));
            close();
          }}
        />
      )}
    </Sheet>
  );
}
