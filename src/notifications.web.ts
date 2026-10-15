// Browser previews keep the persisted in-app rest timer. Native/background
// reminders require the phone app; never claim a reminder was scheduled here.
export async function enableNotifications() {
  return false;
}
export async function cancelRestNotification() {}
export async function cancelAllNotifications() {}
export async function notifyAt(_title: string, _body: string, _at: number) {
  return null;
}
export async function restNotification(_deadline: number) {}
