import { app, BrowserWindow, clipboard, ipcMain, session } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import log from "electron-log/main";
import started from "electron-squirrel-startup";
import { Menubar } from "menubar";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "./background";
import {
  authenticateWithGitHub,
  authenticateWithGitHubApp,
  authenticateWithPAT,
  hasLocalAccessToken,
} from "./mainProcess/api/Authentication/authentication";
import { signOut } from "./mainProcess/api/githubClient";
import { activateLicense } from "./mainProcess/api/LemonSqueezy/activateLicense";
import { deactivateLicense } from "./mainProcess/api/LemonSqueezy/deactivateLicense";
import { validateLicense } from "./mainProcess/api/LemonSqueezy/validateLicense";
import {
  getLicenseState,
  markExpiryReminderShown,
  setLicenseUsage,
} from "./mainProcess/licensing/licenseState";
import {
  getPullRequests,
  getPullRequestSnapshot,
} from "./mainProcess/api/PullRequests/getPullRequests";
import {
  getMergeOptions,
  getMergeStatus,
  isMergePullRequestInput,
  isMergeStatusInput,
  isPullRequestIdentity,
  mergePullRequest,
} from "./mainProcess/api/PullRequests/mergePullRequest";
import { PULL_REQUEST_MERGE_CHANNELS } from "./mainProcess/api/PullRequests/mergePullRequest.types";
import type {
  MergeStatusInput,
  MergeStatusResult,
} from "./mainProcess/api/PullRequests/mergePullRequest.types";
import { getRepositories } from "./mainProcess/api/Repositories/getRepositories";
import { setRepositoryEnableState } from "./mainProcess/api/Repositories/setRepositoryEnableState";
import { getUser } from "./mainProcess/api/User/getUser";
import { getPersonalWeeklyRecap } from "./mainProcess/api/WeeklyRecap/personalWeeklyRecap";
import { appUpdate } from "./mainProcess/appUpdate/appUpdate";
import { createMenu } from "./mainProcess/menu/menu";
import { createMenubar } from "./mainProcess/menubar/menubar";
import { performanceDiagnostics } from "./mainProcess/diagnostics/diagnostics";
import { getNotificationsSettings } from "./mainProcess/notifications/getNotificationSettings";
import { setNotificationSettings } from "./mainProcess/notifications/setNotificationSettings";
import {
  refreshPoll,
  startPolling,
  stopPolling,
} from "./mainProcess/polling/pollGithub";
import {
  disableDerivedCacheWrites,
  enableDerivedCacheWrites,
  getData,
  storeData,
} from "./mainProcess/safeStorage/safeStorage";
import {
  Appearance,
  NOTIFICATION_KEYS,
} from "./mainProcess/safeStorage/safeStorage.types";
import {
  ACCENT_COLOR_CHANNELS,
  DEFAULT_ACCENT_COLOR,
  isAccentColor,
} from "./shared/theme";
import type { AccentColor } from "./shared/theme";
import { setToggleAllNotifications } from "./mainProcess/notifications/setToggleAllNotifications";
import {
  clearNotificationHistory,
  getNotificationHistory,
  markAllNotificationsRead,
  markNotificationRead,
  clearNotificationsOnSignOut,
} from "./mainProcess/notifications/notificationManager";
import {
  isAllowedRendererUrl,
  openExternalUrl,
  protectWebContents,
} from "./mainProcess/security/externalUrl";
import { redactDiagnosticValue } from "./mainProcess/security/redactDiagnosticValue";

const RELEASE_SMOKE_READY_MARKER = "COZYWATCH_RELEASE_SMOKE_RENDERER_READY";
const isReleaseSmokeTest = process.env.COZYWATCH_RELEASE_SMOKE_TEST === "true";
const diagnostics = performanceDiagnostics;

log.info("[App] starting", {
  architecture: process.arch,
  packaged: app.isPackaged,
  platform: process.platform,
  version: app.getVersion(),
});
diagnostics.record("app-start", {
  architecture: process.arch,
  platform: process.platform,
  version: app.getVersion(),
});

process.on("uncaughtException", (err) => {
  log.error("[Main] uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("[Main] unhandledRejection", reason);
});

let mainWindow: BrowserWindow | null = null;
let menubar: Menubar | undefined | null = null;
let backgroundTasksStarted = false;
let backgroundTasksInitialization: Promise<void> | null = null;
let licenseValidationStarted = false;
let rendererReady = false;
let mainWindowRendererReady = false;
type MainWindowNavigation = {
  route: "settings" | "signIn" | "notifications";
  notificationId?: string;
};
let pendingMainWindowNavigation: MainWindowNavigation | null = null;
const isDevelopment = !app.isPackaged;

const getRendererUrl = () =>
  MAIN_WINDOW_VITE_DEV_SERVER_URL ??
  pathToFileURL(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  ).toString();

const rendererFailureUrl = `data:text/html;charset=utf-8,${encodeURIComponent(`
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Cozy Watch couldn't load</title>
      <style>
        body {
          align-items: center;
          background: #f8f7ff;
          color: #27233a;
          display: flex;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          justify-content: center;
          margin: 0;
          min-height: 100vh;
        }
        main {
          max-width: 420px;
          padding: 32px;
          text-align: center;
        }
        h1 { font-size: 24px; margin: 0 0 12px; }
        p { color: #625d77; line-height: 1.5; margin: 0; }
      </style>
    </head>
    <body>
      <main>
        <h1>Cozy Watch couldn't load</h1>
        <p>Quit Cozy Watch and open it again. If the problem continues, send the main log to support.</p>
      </main>
    </body>
  </html>
`)}`;

const getTrustedWebContents = () =>
  [mainWindow?.webContents, menubar?.window?.webContents].filter(
    (webContents): webContents is WebContents =>
      Boolean(webContents && !webContents.isDestroyed()),
  );

const assertTrustedIpcSender = (event: IpcMainInvokeEvent) => {
  const isTrustedWebContents = getTrustedWebContents().some(
    ({ id }) => id === event.sender.id,
  );
  const isTrustedUrl = isAllowedRendererUrl(
    event.sender.getURL(),
    getRendererUrl(),
  );

  if (!isTrustedWebContents || !isTrustedUrl) {
    throw new Error("Untrusted IPC sender.");
  }
};

const handleRendererInvoke = <Args extends unknown[], Result>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
) => {
  ipcMain.handle(channel, (event, ...args: Args) => {
    assertTrustedIpcSender(event);
    return handler(event, ...args);
  });
};

const NOTIFICATION_KEY_SET = new Set<string>(NOTIFICATION_KEYS);
const MERGE_STATUS_POLL_INTERVAL_MS = 5_000;
const MERGE_STATUS_MAX_POLLS = 240;
const mergeStatusMonitors = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

const refreshAfterMerge = (message: string) => {
  void getPullRequests().catch((error) => {
    log.warn(message, error);
  });
};

const stopMergeMonitor = (requestId: string) => {
  const timer = mergeStatusMonitors.get(requestId);
  if (timer) clearTimeout(timer);
  mergeStatusMonitors.delete(requestId);
};

const monitorQueuedMerge = (
  input: MergeStatusInput,
  pollCount = 0,
) => {
  if (mergeStatusMonitors.has(input.requestId)) return;

  const poll = async () => {
    stopMergeMonitor(input.requestId);
    const result: MergeStatusResult = await getMergeStatus(input);
    if (
      result.status === "pending" &&
      pollCount + 1 < MERGE_STATUS_MAX_POLLS
    ) {
      monitorQueuedMerge(input, pollCount + 1);
      return;
    }

    if (result.status === "merged") {
      refreshAfterMerge("[PullRequests] refresh after queued merge failed");
      return;
    }

    if (result.status === "pending") {
      log.warn("[PullRequests] stopped monitoring long-running merge", {
        owner: input.owner,
        repository: input.repository,
        pullNumber: input.pullNumber,
      });
    }
  };

  const timer = setTimeout(() => {
    void poll();
  }, MERGE_STATUS_POLL_INTERVAL_MS);
  mergeStatusMonitors.set(input.requestId, timer);
};

const isRepositoryEnableState = (
  data: unknown,
): data is Record<number, boolean> =>
  typeof data === "object" &&
  data !== null &&
  !Array.isArray(data) &&
  Object.entries(data).every(
    ([key, value]) => /^\d+$/.test(key) && typeof value === "boolean",
  );

const isAppearance = (appearance: unknown): appearance is Appearance | null =>
  appearance === null ||
  appearance === Appearance.Light ||
  appearance === Appearance.Dark;

const broadcastAccentColor = (accentColor: AccentColor) => {
  for (const webContents of getTrustedWebContents()) {
    webContents.send(ACCENT_COLOR_CHANNELS.updated, accentColor);
  }
};

const isNotificationSetting = (
  setting: unknown,
): setting is { checked: boolean; key: string } => {
  if (typeof setting !== "object" || setting === null) {
    return false;
  }

  const { checked, key } = setting as Record<string, unknown>;
  return (
    typeof checked === "boolean" &&
    typeof key === "string" &&
    NOTIFICATION_KEY_SET.has(key)
  );
};

const startBackgroundTasks = () => {
  if (!rendererReady) {
    return;
  }

  if (!licenseValidationStarted) {
    licenseValidationStarted = true;
    void validateLicense().catch((error) => {
      log.error("[License] validation failed", error);
    });
  }

  if (backgroundTasksStarted || backgroundTasksInitialization) {
    return;
  }

  diagnostics.record("background-tasks-checking-authentication");
  backgroundTasksInitialization = hasLocalAccessToken()
    .then((isAuthenticated) => {
      if (!isAuthenticated) {
        diagnostics.record("background-tasks-ready", {
          authenticated: false,
        });
        return;
      }

      startAuthenticatedBackgroundTasks();
    })
    .catch((error) => {
      log.error("[App] failed to initialize authenticated background tasks", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    })
    .finally(() => {
      backgroundTasksInitialization = null;
    });
};

const startAuthenticatedBackgroundTasks = () => {
  if (!rendererReady || backgroundTasksStarted) {
    return;
  }
  backgroundTasksStarted = true;
  void getRepositories().catch((error) => {
    log.error("[Repositories] background refresh failed", error);
  });
  startPolling();
  diagnostics.record("background-tasks-ready", { authenticated: true });
};

appUpdate();

if (started) {
  log.info("[App] Electron Squirrel startup, quitting");
  app.quit();
}

export const createWindow = () => {
  log.info("[Window] creating");
  diagnostics.record("main-window-creating");
  mainWindowRendererReady = false;

  // Show dock icon on macOS for the main app
  if (process.platform === "darwin") {
    app.dock?.show();
  }

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hidden",
    show: false,
    ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
    resizable: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
      webSecurity: true,
    },
    icon: path.join(__dirname, "images", "icon.png"),
  });
  mainWindow.webContents.on("did-start-loading", () => {
    mainWindowRendererReady = false;
  });

  protectWebContents(mainWindow.webContents, [
    getRendererUrl(),
    rendererFailureUrl,
  ]);
  diagnostics.attachWebContents(mainWindow.webContents, "main-window");

  let hasShownRendererFailure = false;
  const showRendererFailure = () => {
    const currentWindow = mainWindow;
    if (
      hasShownRendererFailure ||
      !currentWindow ||
      currentWindow.isDestroyed()
    ) {
      return;
    }

    hasShownRendererFailure = true;
    void currentWindow.loadURL(rendererFailureUrl).catch((error) => {
      log.error("[Window] failed to show renderer failure page", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    });
  };

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) {
        return;
      }

      log.error("[Window] renderer failed to load", {
        errorCode,
        errorDescription: redactDiagnosticValue(errorDescription),
        url: redactDiagnosticValue(validatedUrl),
      });
      showRendererFailure();
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("[Window] renderer process exited", {
      exitCode: details.exitCode,
      reason: details.reason,
    });
    showRendererFailure();
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level < 2) {
      return;
    }

    // electron-log's renderer transport writes to console.* as well as its
    // main-process transport. Reporting that output here creates a duplicate
    // log entry whose source is electron-log.js (and object arguments become
    // "[object Object]").
    if (sourceId.includes("electron-log")) {
      return;
    }

    const details = {
      level,
      line,
      message: redactDiagnosticValue(message),
      sourceId: redactDiagnosticValue(sourceId),
    };

    if (level === 3) {
      log.error("[Renderer] console error", details);
    } else {
      log.warn("[Renderer] console warning", details);
    }
  });
  mainWindow.on("unresponsive", () => {
    log.warn("[Window] renderer became unresponsive");
  });

  mainWindow.on("responsive", () => {
    log.info("[Window] renderer became responsive");
  });

  mainWindow.webContents.once("did-finish-load", () => {
    const loadedUrl = mainWindow?.webContents.getURL() ?? "";
    const loadedExpectedRenderer = isAllowedRendererUrl(
      loadedUrl,
      getRendererUrl(),
    );

    log.info("[Window] renderer finished loading", {
      expectedRenderer: loadedExpectedRenderer,
      url: redactDiagnosticValue(loadedUrl),
    });
    diagnostics.record("main-window-finished-load", {
      expectedRenderer: loadedExpectedRenderer,
    });

    if (isReleaseSmokeTest && loadedExpectedRenderer) {
      process.stdout.write(`${RELEASE_SMOKE_READY_MARKER}\n`);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  createMenu();
  log.info("[Menu] created");

  mainWindow.show();

  if (isDevelopment) {
    mainWindow.once("ready-to-show", () => {
      diagnostics.record("main-window-ready-to-show");
      mainWindow?.webContents.openDevTools();
    });
  } else {
    // For production, ensure it shows on ready-to-show
    mainWindow.once("ready-to-show", () => {
      diagnostics.record("main-window-ready-to-show");
      mainWindow?.show();
    });
  }

  mainWindow.on("minimize", () => {
    mainWindow?.hide();
  });

  log.info("[Window] loaded");

  return mainWindow;
};

export const getMainWindow = () => mainWindow;

app.on("did-become-active", () => {
  app.setBadgeCount(0);
});

app.whenReady().then(() => {
  log.info("[App] ready");
  diagnostics.record("app-ready");
  diagnostics.startMetricsCollection();
  log.info("[App] check for updated and notify");

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  createWindow();
  menubar = createMenubar();
  if (menubar?.window) {
    diagnostics.attachWebContents(menubar.window.webContents, "menubar");
  }

  mainWindow?.webContents.once("did-finish-load", () => {
    if (isDevelopment) {
      mainWindow?.webContents.openDevTools();
    }
  });
});

app.on("window-all-closed", () => {
  log.info("[App] all windows closed");
  mainWindow = null;

  if (process.platform !== "darwin") {
    log.info("[App] quitting");
    app.quit();
  }
});

app.on("activate", () => {
  // Hide menubar if it's showing
  if (
    menubar?.window &&
    !menubar.window.isDestroyed() &&
    menubar.window.isVisible()
  ) {
    log.info("[Window] hiding menubar on activate");
    menubar.window.hide();
  }

  // Check if main window exists and is valid
  if (mainWindow && !mainWindow.isDestroyed()) {
    log.info("[Window] showing hidden window on activate");
    mainWindow.show();
    mainWindow.focus();
  } else {
    // Main window doesn't exist, create it
    log.info("[Window] recreate main window on activate");
    createWindow();
    if (!menubar) {
      menubar = createMenubar();
    }
  }
});

// ---- EVENTS ----

export const performSignOut = async () => {
  log.info("[IPC] performSignOut");

  stopPolling();
  disableDerivedCacheWrites();
  const signedOut = await signOut();
  if (signedOut) {
    await clearNotificationsOnSignOut();
  }
  if (!signedOut) {
    enableDerivedCacheWrites();
    startPolling();
  }
  return signedOut;
};

handleRendererInvoke(
  "on-application-sign-user",
  async (_, isSignIn: unknown) => {
    if (typeof isSignIn !== "boolean") {
      throw new Error("Invalid sign-in state.");
    }

    log.info("[IPC] on-application-sign-user", isSignIn);

    if (isSignIn === false) {
      const signedOut = await performSignOut();
      if (!signedOut) {
        throw new Error(
          "Failed to sign out. Local credentials were not removed.",
        );
      }
      return;
    }

    ipcMain.emit("dispatch-application-sign-user", null, isSignIn);
  },
);

ipcMain.on("dispatch-application-sign-user", (_, isSignIn) => {
  log.info("[IPC] dispatch-application-sign-user");

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sign-user", isSignIn);
    mainWindow.show();
  }

  if (menubar?.window && !menubar.window.isDestroyed()) {
    menubar.window.webContents.send("sign-user", isSignIn);
  }

  if (isSignIn === true) {
    enableDerivedCacheWrites();
    startAuthenticatedBackgroundTasks();
  }
});

handleRendererInvoke("open-external-url", async (_, url: unknown) => {
  log.info("[IPC] open-external-url");
  await openExternalUrl(url);
});

handleRendererInvoke("copy-to-clipboard", (_, text: unknown) => {
  if (typeof text !== "string") {
    throw new Error("Invalid clipboard text.");
  }

  log.info("[IPC] copy-to-clipboard", { textLength: text.length });
  clipboard.writeText(text);
});

handleRendererInvoke("weekly-recap-personal", async (_, weekStart: unknown) => {
  if (typeof weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new Error("Invalid weekly recap week.");
  }

  log.info("[IPC] weekly-recap-personal");
  return getPersonalWeeklyRecap(weekStart);
});

// Authentication
handleRendererInvoke("authentication-isStored", async () => {
  const authenticated = await hasLocalAccessToken();
  return authenticated;
});
handleRendererInvoke("authentication-authenticate-github", () => {
  log.info("[IPC] authentication-authenticate-github");
  return authenticateWithGitHub();
});
handleRendererInvoke("authentication-authenticate-github-app", () => {
  log.info("[IPC] authentication-authenticate-github-app");
  return authenticateWithGitHubApp();
});

// Store a Personal Access Token (PAT) as the access token
handleRendererInvoke("authentication-store-pat", async (_, token: unknown) => {
  if (typeof token !== "string") {
    throw new Error("Invalid personal access token.");
  }

  const trimmed = token.trim();

  // Basic sanity checks to avoid obviously bad values
  if (!trimmed) {
    log.warn("[IPC] authentication-store-pat: empty token rejected");
    return {
      success: false,
      reason: "Token can't be empty.",
      isRemoteValidation: false,
    };
  }

  if (trimmed.length < 20) {
    log.warn("[IPC] authentication-store-pat: suspicious length", {
      length: trimmed.length,
    });
    return {
      success: false,
      reason: "Invalid Token.",
      isRemoteValidation: false,
    };
  }

  const response = await authenticateWithPAT(trimmed);

  if (!response.valid) {
    log.warn("[IPC] authentication-store-pat: remote validation failed", {
      reason: response.reason,
    });
    return {
      success: false,
      isRemoteValidation: true,
      reason: response.reason,
    };
  }

  return { success: true };
});

ipcMain.on("dispatch-authentication-invalid-PAT", (_, data) => {
  log.info("[IPC] dispatch-authentication-invalid-PAT", data);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("authentication-invalid-PAT", data);
  }
});

handleRendererInvoke("authentication-get-user", async () => {
  log.info("[IPC] get-github-user");
  return getUser();
});

ipcMain.on("dispatch-authentication-auth-code", (_, data) => {
  log.info("[IPC] dispatch-authentication-auth-code", {
    codeLength: data?.length || 0,
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("authentication-auth-code", data);
  }
});

// ---- Repositories ----
handleRendererInvoke("repositories-query", async () => {
  log.info("[IPC] repositories-query");
  return getRepositories();
});

handleRendererInvoke(
  "repository-set-enable-state",
  async (_, data: unknown) => {
    if (!isRepositoryEnableState(data)) {
      throw new Error("Invalid repository enable state.");
    }

    log.info("[IPC] repository-set-enable-state");
    return setRepositoryEnableState(data);
  },
);

ipcMain.on("dispatch-repository-update", (_, data) => {
  log.info("[IPC] repository-update");

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("repository-update", data);
  }
});

// ---- Pull Requests ----
handleRendererInvoke("pull-requests-query", async () => {
  log.info("[IPC] pull-requests-query cached snapshot");
  return getPullRequestSnapshot();
});

handleRendererInvoke(PULL_REQUEST_MERGE_CHANNELS.options, async (_, data: unknown) => {
  if (!isPullRequestIdentity(data)) {
    throw new Error("Invalid pull request identity.");
  }

  log.info("[IPC] pull-request-merge-options", {
    owner: data.owner,
    repository: data.repository,
    pullNumber: data.pullNumber,
  });
  return getMergeOptions(data);
});

handleRendererInvoke(PULL_REQUEST_MERGE_CHANNELS.merge, async (_, data: unknown) => {
  if (!isMergePullRequestInput(data)) {
    throw new Error("Invalid pull request merge request.");
  }

  log.info("[IPC] pull-request-merge", {
    owner: data.owner,
    repository: data.repository,
    pullNumber: data.pullNumber,
    method: data.method,
  });
  const result = await mergePullRequest(data);
  if (result.status === "merged" || result.status === "alreadyMerged") {
    refreshAfterMerge("[PullRequests] refresh after merge failed");
  } else if (
    (result.status === "queued" || result.status === "existingRequest") &&
    result.requestId
  ) {
    monitorQueuedMerge({ ...data, requestId: result.requestId });
  }
  return result;
});

handleRendererInvoke(PULL_REQUEST_MERGE_CHANNELS.status, async (_, data: unknown) => {
  if (!isMergeStatusInput(data)) {
    throw new Error("Invalid pull request merge status request.");
  }

  log.info("[IPC] pull-request-merge-status", {
    owner: data.owner,
    repository: data.repository,
    pullNumber: data.pullNumber,
  });
  const result = await getMergeStatus(data);
  if (result.status !== "pending") {
    stopMergeMonitor(data.requestId);
  }
  if (result.status === "merged") {
    refreshAfterMerge("[PullRequests] refresh after queued merge failed");
  }
  return result;
});

ipcMain.on("dispatch-pull-request-update", (_, data) => {
  log.info("[IPC] pull request-update");
  if (mainWindow && !mainWindow.isDestroyed()) {
    log.info("[IPC] main window pull request-update");
    mainWindow.webContents.send("pull-request-update", data);
  }

  if (menubar?.window && !menubar.window.isDestroyed()) {
    log.info("[IPC] menu bar window pull request-update");
    menubar.window.webContents.send("pull-request-update", data);
  }
});

handleRendererInvoke("get-github-repositories", async () => {
  log.info("[IPC] get-github-repositories");
  return getRepositories();
});

handleRendererInvoke("get-github-pull-request", async () => {
  log.info("[IPC] get-github-pull-request");
  return getPullRequests();
});

ipcMain.on("send-updated-list", (_, data) => {
  log.info("[IPC] send-updated-list", { prCount: data?.length || 0 });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pull-request", data);
  }
});

// --- License -----
handleRendererInvoke("license-activate", async (_, licenseKey: unknown) => {
  if (typeof licenseKey !== "string") {
    throw new Error("Invalid license key.");
  }

  log.info("[IPC] license-activate", {
    licenseKeyLength: licenseKey.length,
  });

  return activateLicense(licenseKey);
});

handleRendererInvoke("license-get-status", async () => {
  log.info("[IPC] license-get-status");
  return getLicenseState();
});

handleRendererInvoke("license-validate", async () => {
  log.info("[IPC] license-validate");
  return validateLicense();
});

handleRendererInvoke("license-set-usage", async (_, usage: unknown) => {
  log.info("[IPC] license-set-usage", { usage });

  if (usage !== "personal" && usage !== "commercial") {
    throw new Error("Invalid license usage selection.");
  }

  return setLicenseUsage(usage);
});

handleRendererInvoke("license-deactivate", async () => {
  log.info("[IPC] license-deactivate");
  return deactivateLicense();
});

handleRendererInvoke("license-mark-expiry-reminder-shown", async () => {
  log.info("[IPC] license-mark-expiry-reminder-shown");
  return markExpiryReminderShown();
});

// ---- End License ----

handleRendererInvoke("set-application-appearance", async (_, appearance) => {
  if (!isAppearance(appearance)) {
    throw new Error("Invalid appearance.");
  }

  log.info("[IPC] set-application-appearance", { appearance });

  const saved = await storeData({ name: "appearance", data: appearance });
  if (!saved) {
    throw new Error("Unable to save appearance.");
  }

  ipcMain.emit("dispatch-application-appearance-update", null, appearance);
  return appearance;
});

handleRendererInvoke("get-application-appearance", async () => {
  log.info("[IPC] get-application-appearance");
  return getData("appearance");
});

handleRendererInvoke(ACCENT_COLOR_CHANNELS.get, async () => {
  log.info("[IPC] get-application-accent-color");
  const accentColor = await getData("accentColor");
  return isAccentColor(accentColor) ? accentColor : DEFAULT_ACCENT_COLOR;
});

handleRendererInvoke(ACCENT_COLOR_CHANNELS.set, async (_, accentColor) => {
  if (!isAccentColor(accentColor)) {
    throw new Error("Invalid accent color.");
  }

  log.info("[IPC] set-application-accent-color", { accentColor });
  const wasStored = await storeData({ name: "accentColor", data: accentColor });
  if (!wasStored) {
    throw new Error("Unable to save accent color.");
  }

  broadcastAccentColor(accentColor);
  return accentColor;
});

handleRendererInvoke("get-application-version", () => app.getVersion());

ipcMain.on("dispatch-application-appearance-update", (_, data) => {
  log.info("[IPC] dispatch-application-appearance-update");

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pull-application-appearance-update", data);
  }
});

handleRendererInvoke("get-application-notification", async () => {
  log.info("[IPC] get-application-notification");
  return getNotificationsSettings();
});

handleRendererInvoke("get-notification-history", () => getNotificationHistory());
handleRendererInvoke("mark-notification-read", async (_, id: unknown) => {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Invalid notification id.");
  }
  return markNotificationRead(id);
});
handleRendererInvoke("mark-all-notifications-read", () => markAllNotificationsRead());
handleRendererInvoke("clear-notification-history", () => clearNotificationHistory());

ipcMain.on("dispatch-notification-update", (_, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("notification-update", data);
  }
});

ipcMain.on("dispatch-notification-click", (_, notificationId: unknown) => {
  if (typeof notificationId !== "string") return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  queueOrSendMainWindowNavigation({ route: "notifications", notificationId });
  mainWindow?.show();
  mainWindow?.focus();
});

handleRendererInvoke("set-application-toggle-notification", async (_, enable) => {
  if (typeof enable !== "boolean") {
    throw new Error("Invalid notification setting.");
  }

    log.info("[IPC] set-application-notification");
    return setToggleAllNotifications(enable);
  },
);

handleRendererInvoke(
  "set-application-notification",
  async (_, notificationKey) => {
    if (!isNotificationSetting(notificationKey)) {
      throw new Error("Invalid notification setting.");
    }

    log.info("[IPC] set-application-notification");
    return setNotificationSettings(notificationKey);
  },
);

handleRendererInvoke("get-application-start-at-login", async () => {
  log.info("[IPC] get-application-start-at-login");

  if (process.platform === "darwin" || process.platform === "win32") {
    return app.getLoginItemSettings().openAtLogin;
  }

  return (await getData("open_at_login")) ?? false;
});

// ---- Menubar Density ----
handleRendererInvoke("get-menubar-density", async () => {
  log.info("[IPC] get-menubar-density");
  const appSettings = await getData("appSettings");
  // Default to 'default' if not set
  return appSettings?.menubarDensity || "default";
});

handleRendererInvoke("set-menubar-density", async (_, density: unknown) => {
  if (density !== "compact" && density !== "default") {
    throw new Error("Invalid menubar density.");
  }

  const validatedDensity = density as "compact" | "default";

  log.info("[IPC] set-menubar-density", validatedDensity);
  const prev = await getData("appSettings");
  const newSettings = { ...prev, menubarDensity: validatedDensity };
  const saved = await storeData({ name: "appSettings", data: newSettings });
  if (!saved) {
    throw new Error("Unable to save menu bar settings.");
  }
  ipcMain.emit("dispatch-menubar-density-update", null, validatedDensity);
  return validatedDensity;
});
// ---- End Menubar Density ----

handleRendererInvoke(
  "set-application-start-at-login",
  async (_, isStartingAtLogin) => {
    if (typeof isStartingAtLogin !== "boolean") {
      throw new Error("Invalid start-at-login setting.");
    }

    log.info("[IPC] set-application-start-at-login", isStartingAtLogin);

    if (process.platform !== "darwin" && process.platform !== "win32") {
      throw new Error("Open at login is supported only on macOS and Windows.");
    }

    const previousValue = app.getLoginItemSettings().openAtLogin;
    try {
      app.setLoginItemSettings({ openAtLogin: isStartingAtLogin });
      const actualValue = app.getLoginItemSettings().openAtLogin;
      if (actualValue !== isStartingAtLogin) {
        throw new Error(
          process.platform === "darwin"
            ? "macOS did not enable this login item. Use the signed and notarized Cozy Watch app, then try again."
            : "Windows did not update the startup setting. Please try again.",
        );
      }

      const saved = await storeData({
        name: "open_at_login",
        data: isStartingAtLogin,
      });
      if (!saved) {
        throw new Error("Unable to save the Open at login setting.");
      }

      return actualValue;
    } catch (error) {
      try {
        app.setLoginItemSettings({ openAtLogin: previousValue });
      } catch (restoreError) {
        log.warn("[IPC] unable to restore start-at-login setting", restoreError);
      }
      throw error;
    }
  },
);

handleRendererInvoke("get-application-refresh-pool", () => {
  log.info("[IPC] get-application-refresh-pool");

  return refreshPoll();
});

handleRendererInvoke("diagnostics-get-status", () => ({
  enabled: diagnostics.isEnabled(),
}));

handleRendererInvoke("diagnostics-export-bundle", () =>
  diagnostics.exportBundle(mainWindow),
);

handleRendererInvoke("diagnostics-renderer-ready", (event) => {
  diagnostics.record("renderer-first-paint");
  rendererReady = true;
  if (event.sender === mainWindow?.webContents) {
    mainWindowRendererReady = true;
    if (pendingMainWindowNavigation) {
      mainWindow.webContents.send(
        "navigate-to-route",
        pendingMainWindowNavigation,
      );
      pendingMainWindowNavigation = null;
    }
  }
  startBackgroundTasks();
});

const queueOrSendMainWindowNavigation = (navigation: MainWindowNavigation) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingMainWindowNavigation = navigation;
    return;
  }

  if (!mainWindowRendererReady || mainWindow.webContents.isLoading()) {
    pendingMainWindowNavigation = navigation;
    return;
  }

  mainWindow.webContents.send("navigate-to-route", navigation);
};

handleRendererInvoke("on-application-navigate-to-route", (_, route) => {
  if (route !== "settings" && route !== "signIn" && route !== "notifications") {
    throw new Error("Invalid navigation route.");
  }

  log.info("[IPC] on-application-navigate-to-route", route);

  if (!mainWindow || mainWindow.isDestroyed()) {
    log.info("[IPC] mainWindow doesn't exist, creating it");
    createWindow();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    log.info("[IPC] mainWindow send navigate-to-route", route);
    queueOrSendMainWindowNavigation({ route });
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", () => {
  log.info("[App] stopping polling before quit");
  diagnostics.record("app-before-quit");
  diagnostics.stopMetricsCollection();
  stopPolling();
});
