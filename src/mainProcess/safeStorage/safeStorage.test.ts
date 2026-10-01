import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

jest.mock("electron", () => ({
  app: { isPackaged: true, whenReady: jest.fn().mockResolvedValue(undefined), getPath: jest.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));
jest.mock("electron-log", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("../diagnostics/diagnostics", () => ({ performanceDiagnostics: { record: jest.fn() } }));

describe("credential storage cleanup", () => {
  let directory: string;
  let primaryPath: string;
  let legacyPath: string;
  let storage: typeof import("./safeStorage");

  beforeEach(async () => {
    jest.resetModules();
    directory = await mkdtemp(path.join(os.tmpdir(), "cozy-storage-test-"));
    jest.spyOn(os, "homedir").mockReturnValue(directory);
    const { app } = await import("electron");
    (app.getPath as jest.Mock).mockReturnValue(path.join(directory, "current"));
    const { APP_NAME } = await import("../keys");
    primaryPath = path.join(directory, "current", "storage", "secure-storage.json");
    legacyPath = path.join(directory, `.${APP_NAME}`, "storage.json");
    await mkdir(path.dirname(legacyPath), { recursive: true });
    storage = await import("./safeStorage");
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  const encryptedToken = Buffer.from(JSON.stringify("test-token")).toString("base64");

  it("preserves migrated credentials in current storage and removes the legacy file", async () => {
    await writeFile(legacyPath, JSON.stringify({ access_token: encryptedToken }));
    expect(await storage.getData("access_token")).toBe("test-token");
    expect(JSON.parse(await readFile(primaryPath, "utf8")).access_token).toBe(encryptedToken);
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes backups created by older versions without restoring their token", async () => {
    await mkdir(path.dirname(primaryPath), { recursive: true });
    await writeFile(primaryPath, "{}");
    await writeFile(legacyPath, JSON.stringify({ access_token: encryptedToken }));
    expect(await storage.getData("access_token")).toBeNull();
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the legacy copy if writing current storage fails", async () => {
    await writeFile(legacyPath, JSON.stringify({ access_token: encryptedToken }));
    await writeFile(path.join(directory, "current"), "blocks directory creation");
    expect(await storage.getData("access_token")).toBeNull();
    await expect(access(legacyPath)).resolves.toBeUndefined();
  });

  it("clears a reappearing legacy file when deleting the access token", async () => {
    await storage.storeData({ name: "access_token", data: "test-token" });
    await writeFile(legacyPath, JSON.stringify({ access_token: encryptedToken }));
    await storage.deleteDataOrThrow("access_token");
    expect(await storage.getData("access_token")).toBeNull();
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("clears the legacy file when deleting all data", async () => {
    await storage.storeData({ name: "access_token", data: "test-token" });
    await writeFile(legacyPath, JSON.stringify({ access_token: encryptedToken }));
    expect(await storage.deleteAllData()).toBe(true);
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails credential deletion if the legacy copy cannot be removed", async () => {
    await storage.storeData({ name: "access_token", data: "test-token" });
    await mkdir(legacyPath);
    await expect(storage.deleteDataOrThrow("access_token")).rejects.toThrow();
    await expect(access(legacyPath)).resolves.toBeUndefined();
    expect(await storage.getData("access_token")).toBe("test-token");
  });
});
