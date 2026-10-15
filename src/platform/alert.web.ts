import type { AlertButton, AlertOptions } from "react-native";

// React Native Web's Alert is a no-op. Preserve explicit confirmation before
// finishing, importing or deleting data instead of silently ignoring actions.
export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    _options?: AlertOptions,
  ) {
    const text = [title, message].filter(Boolean).join("\n\n");
    const action = buttons?.find((button) => button.style !== "cancel");
    if (action) {
      const accepted = window.confirm(text);
      const selected = accepted
        ? action
        : buttons?.find((button) => button.style === "cancel");
      selected?.onPress?.();
    } else {
      window.alert(text);
    }
  },
};
