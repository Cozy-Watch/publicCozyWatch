import Logger from "electron-log";
import { storeData } from "../safeStorage/safeStorage";
import {
  NotificationKey,
  NotificationSettingsPerKey,
} from "../safeStorage/safeStorage.types";
import { NOTIFICATION_DEFAULT_SETTINGS } from "./notifications.meta";

export const setToggleAllNotifications = async (enable: boolean) => {
  Logger.info("[Notifications] Setting All Notification");

  const updatedNotifications = (
    Object.keys(NOTIFICATION_DEFAULT_SETTINGS) as NotificationKey[]
  ).reduce((acc, notificationKey) => {
    const notification = NOTIFICATION_DEFAULT_SETTINGS[notificationKey];

    return {
      ...acc,
      [notificationKey]: { ...notification, value: enable },
    };
  }, {} as NotificationSettingsPerKey);

  const saved = await storeData({
    name: "notifications",
    data: updatedNotifications,
  });
  if (!saved) {
    throw new Error("Unable to save notification settings.");
  }
  return updatedNotifications;
};
