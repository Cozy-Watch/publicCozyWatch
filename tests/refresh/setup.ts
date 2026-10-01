import { jest } from "@jest/globals";
import { EventEmitter } from "node:events";

// Installed before Octokit is imported: its request defaults capture fetch at import time.
// No request ever falls through to the network, including unexpected auth/repository calls.
globalThis.fetch = jest.fn<typeof fetch>(async () => {
  throw new Error("Unexpected network request: install the mock GitHub transport first");
});

jest.mock("electron", () => ({
  ipcMain: new EventEmitter(),
  app: { setBadgeCount: jest.fn(), relaunch: jest.fn(), exit: jest.fn() },
}));
jest.mock("electron-log", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));
jest.mock("../../src/mainProcess/safeStorage/safeStorage", () => ({
  getData: jest.fn(), storeData: jest.fn(),
  deleteData: jest.fn(), deleteDataOrThrow: jest.fn(),
}));
jest.mock("../../src/mainProcess/notifications/notificationManager", () => ({
  batchNotificationManager: jest.fn(),
}));
jest.mock("../../src/mainProcess/security/externalUrl", () => ({
  tryOpenExternalUrl: jest.fn(),
}));
jest.mock("../../src/mainProcess/diagnostics/diagnostics", () => ({
  performanceDiagnostics: { record: jest.fn(), isEnabled: () => true },
}));
