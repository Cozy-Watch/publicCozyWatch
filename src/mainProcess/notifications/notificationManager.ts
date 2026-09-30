import { Notification, app, ipcMain } from "electron";
import Logger from "electron-log";
import { getData, storeData } from "../safeStorage/safeStorage";
import type {
  NotificationRecord,
  NotificationTone,
  NotificationType,
} from "../safeStorage/safeStorage.types";

export interface ManagedNotification {
  title: string;
  body: string;
  type?: NotificationType;
  tone?: NotificationTone;
  url?: string;
  source?: NotificationRecord["source"];
}

export const formatNotificationSource = (source?: NotificationRecord["source"]) =>
  [source?.repository, source?.pullNumber ? `#${source.pullNumber}` : undefined, source?.branch]
    .filter(Boolean)
    .join(" · ");

const recentNotifications = new Set<string>();
const notificationQueue: ManagedNotification[] = [];
let isProcessingQueue = false;
let notificationSequence = 0;
const NOTIFICATION_DELAY = 3000;
const DEDUPLICATION_WINDOW = 60000;
const MAX_HISTORY = 100;

let activeNotifications: Notification[] = [];
let historyMutation: Promise<void> = Promise.resolve();

function getNotificationHash(notification: ManagedNotification): string {
  const title = (notification.title || "").trim().toLowerCase();
  const body = (notification.body || "").trim().toLowerCase();
  return `${title}::${body}`;
}

const emitHistoryUpdate = (history: NotificationRecord[]) => {
  ipcMain.emit("dispatch-notification-update", null, history);
};

const readHistory = async (): Promise<NotificationRecord[]> =>
  (await getData("notification_history")) ?? [];

const updateHistory = async (
  update: (history: NotificationRecord[]) => NotificationRecord[],
) => {
  historyMutation = historyMutation
    .catch(() => undefined)
    .then(async () => {
      const history = update(await readHistory());
      await storeData({ name: "notification_history", data: history });
      emitHistoryUpdate(history);
    });
  await historyMutation;
};

export const getNotificationHistory = readHistory;

export const markNotificationRead = async (id: string, read = true) => {
  await updateHistory((history) =>
    history.map((notification) =>
      notification.id === id ? { ...notification, read } : notification,
    ),
  );
};

export const markAllNotificationsRead = async () => {
  await updateHistory((history) =>
    history.map((notification) => ({ ...notification, read: true })),
  );
};

export const clearNotificationHistory = async () => {
  await updateHistory(() => []);
};

const createRecord = (notification: ManagedNotification): NotificationRecord => ({
  id: `${Date.now()}-${notificationSequence++}`,
  type: notification.type ?? "system",
  ...(notification.tone ? { tone: notification.tone } : {}),
  title: notification.title,
  body: notification.body,
  createdAt: new Date().toISOString(),
  ...(notification.url ? { url: notification.url } : {}),
  ...(notification.source ? { source: notification.source } : {}),
  read: false,
});

const persistNotification = async (notification: ManagedNotification) => {
  const record = createRecord(notification);
  await updateHistory((history) => [record, ...history].slice(0, MAX_HISTORY));
  return record;
};

export const batchNotificationManager = (notifications: ManagedNotification[]) => {
  notificationQueue.length = 0;

  notifications.forEach((notification) => {
    const hash = getNotificationHash(notification);
    if (!recentNotifications.has(hash)) {
      recentNotifications.add(hash);
      notificationQueue.push(notification);
    }
  });

  if (!isProcessingQueue) {
    void processQueue();
  }
};

setInterval(() => recentNotifications.clear(), DEDUPLICATION_WINDOW);

function clearNotification(notification: Notification) {
  activeNotifications = activeNotifications.filter((item) => item !== notification);
}

async function processQueue() {
  if (notificationQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const notification = notificationQueue.shift();

  if (notification) {
    const record = await persistNotification(notification);
    const electronNotification = new Notification({
      title: notification.title,
      body: [formatNotificationSource(notification.source), notification.body]
        .filter(Boolean)
        .join("\n"),
    });
    activeNotifications.push(electronNotification);

    electronNotification.on("click", () => {
      void markNotificationRead(record.id);
      ipcMain.emit("dispatch-notification-click", null, record.id);
      clearNotification(electronNotification);
    });
    electronNotification.on("close", () => clearNotification(electronNotification));
    electronNotification.show();
  }

  setTimeout(() => void processQueue(), NOTIFICATION_DELAY);
}

export const clearNotificationsOnSignOut = async () => {
  await clearNotificationHistory();
  if (app.isReady()) {
    Logger.info("[Notifications] history cleared on sign out");
  }
};
