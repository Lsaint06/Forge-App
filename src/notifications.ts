import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { repository } from "./data/native";
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
export async function enableNotifications() {
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
    await Notifications.cancelScheduledNotificationAsync(previous);
    r.setSetting("restNotification", "");
  }
}
export async function notifyAt(title: string, body: string, at: number) {
  if (!repository().profile().notifications || at <= Date.now()) return null;
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
