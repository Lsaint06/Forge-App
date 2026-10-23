import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { repository } from "./data/native";

// Expo Go on Android no longer includes expo-notifications' native modules
// (Expo SDK 53+), and loading the module there stops the app. It is skipped
// there and loaded everywhere else (iOS, development and production builds),
// where reminders behave as before.
const unavailable =
  Platform.OS === "android" &&
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
type NotificationsModule = typeof import("expo-notifications");
let loading: Promise<NotificationsModule | null> | undefined;
function notifications() {
  if (unavailable) return Promise.resolve(null);
  loading ??= import("expo-notifications")
    .then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return Notifications;
    })
    .catch(() => null);
  return loading;
}
// Register the foreground handler at startup, as before.
void notifications();

export async function cancelAllNotifications() {
  await (await notifications())?.cancelAllScheduledNotificationsAsync();
}
export async function enableNotifications() {
  const Notifications = await notifications();
  if (!Notifications) return false;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("training", {
      name: "Training reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}
export async function cancelRestNotification() {
  const r = repository();
  const previous = r.setting("restNotification");
  if (previous) {
    await (await notifications())?.cancelScheduledNotificationAsync(previous);
    r.setSetting("restNotification", "");
  }
}
export async function notifyAt(title: string, body: string, at: number) {
  if (!repository().profile().notifications || at <= Date.now()) return null;
  const Notifications = await notifications();
  if (!Notifications) return null;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(at),
      channelId: "training",
    },
  });
}
export async function restNotification(deadline: number) {
  await cancelRestNotification();
  const notificationId = await notifyAt(
    "Rest complete",
    "Ready for your next set?",
    deadline,
  );
  if (notificationId)
    repository().setSetting("restNotification", notificationId);
}
