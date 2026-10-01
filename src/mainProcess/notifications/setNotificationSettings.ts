import Logger from "electron-log";
import { getData, storeData } from "../safeStorage/safeStorage";
import { NotificationKey } from "../safeStorage/safeStorage.types";
import { NOTIFICATION_DEFAULT_SETTINGS } from "./notifications.meta";

export const setNotificationSettings = async ({
  checked,
  key,
}: {
  checked: boolean;
  key: string;
}) => {
  Logger.info("[Notifications] Setting notification", { key, checked });
  const notificationKey = key as NotificationKey;
  const storedNotifications = await getData("notifications");

  const selectedNotification =
    storedNotifications?.[notificationKey] ||
    NOTIFICATION_DEFAULT_SETTINGS[notificationKey];

  const saved = await storeData({
    name: "notifications",
    data: {
      ...(storedNotifications ?? NOTIFICATION_DEFAULT_SETTINGS),
      [notificationKey]: { ...selectedNotification, value: checked },
    },
  });
  if (!saved) {
    throw new Error("Unable to save notification settings.");
  }
};
