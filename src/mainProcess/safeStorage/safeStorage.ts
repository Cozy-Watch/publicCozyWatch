import { app, safeStorage } from "electron";
import log from "electron-log";
import { readFile, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_NAME } from "../keys";
import { performanceDiagnostics } from "../diagnostics/diagnostics";
import { AtomicFileWriter } from "./atomicFileWriter";
import {
  type EncryptedStorageObject,
  getActiveRepositories,
  isDerivedCacheKey,
  parseEncryptedStorage,
  withoutDerivedCaches,
} from "./storageMigration";
import { decodeStorageValue, encodeStorageValue } from "./storageEncoding";
import type {
  StoreDataMap,
  StoreDataName,
  StoreDataParams,
} from "./safeStorage.types";

const isDevelopment = !app.isPackaged;
const PRIMARY_STORAGE_FILE = isDevelopment
  ? "dev-secure-storage.json"
  : "secure-storage.json";
const CACHE_FILES = {
  pull_requests_cache: isDevelopment
    ? "dev-pull-requests-cache.json"
    : "pull-requests-cache.json",
  repositories_cache: isDevelopment
    ? "dev-repositories-cache.json"
    : "repositories-cache.json",
} as const;
const LEGACY_STORAGE_PATH = path.join(
  os.homedir(),
  `.${APP_NAME}`,
  `${isDevelopment ? "dev-" : ""}storage.json`,
);

let primaryStoragePromise: Promise<EncryptedStorageObject> | null = null;
let derivedCacheWriteGeneration = 0;
let derivedCacheWritesEnabled = true;
const cacheStoragePromises = new Map<
  "pull_requests_cache" | "repositories_cache",
  Promise<EncryptedStorageObject>
>();
const atomicFileWriter = new AtomicFileWriter();
const storageMutationQueues = new Map<string, Promise<void>>();

const getStorageDirectory = () => path.join(app.getPath("userData"), "storage");
const getPrimaryStoragePath = () =>
  path.join(getStorageDirectory(), PRIMARY_STORAGE_FILE);
const getCacheStoragePath = (
  name: "pull_requests_cache" | "repositories_cache",
) => path.join(getStorageDirectory(), CACHE_FILES[name]);

const pathExists = async (filePath: string) => {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
};

const parseStorage = (
  contents: string,
  filePath: string,
): EncryptedStorageObject => {
  try {
    return parseEncryptedStorage(contents);
  } catch {
    throw new Error(`Invalid storage object in ${path.basename(filePath)}.`);
  }
};

const readStorageFile = async (
  filePath: string,
  tolerateCorruption: boolean,
): Promise<EncryptedStorageObject> => {
  const startedAt = performance.now();
  try {
    const contents = await readFile(filePath, "utf8");
    const storage = parseStorage(contents, filePath);
    performanceDiagnostics.record("storage-file-loaded", {
      durationMs: performance.now() - startedAt,
      file: path.basename(filePath),
      sizeBytes: Buffer.byteLength(contents),
    });
    return storage;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    if (tolerateCorruption) {
      log.warn("[Storage] Ignoring invalid derived cache; it will be rebuilt", {
        file: path.basename(filePath),
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return {};
    }
    throw error;
  }
};

const writeStorageFile = async (
  filePath: string,
  storage: EncryptedStorageObject,
) => {
  const snapshot = JSON.stringify(storage);
  const startedAt = performance.now();
  await atomicFileWriter.write(filePath, snapshot);
  performanceDiagnostics.record("storage-file-written", {
    durationMs: performance.now() - startedAt,
    file: path.basename(filePath),
    sizeBytes: Buffer.byteLength(snapshot),
  });
};

const mutateStorageFile = async <Result>(
  filePath: string,
  storage: EncryptedStorageObject,
  mutate: (draft: EncryptedStorageObject) => Result,
): Promise<Result> => {
  const previousMutation =
    storageMutationQueues.get(filePath) ?? Promise.resolve();
  let result: Result;
  const nextMutation = previousMutation
    .catch(() => undefined)
    .then(async () => {
      const draft = { ...storage };
      result = mutate(draft);
      await writeStorageFile(filePath, draft);
      for (const key of Object.keys(storage)) {
        delete storage[key as StoreDataName];
      }
      Object.assign(storage, draft);
    });
  storageMutationQueues.set(filePath, nextMutation);
  try {
    await nextMutation;
    return result!;
  } finally {
    if (storageMutationQueues.get(filePath) === nextMutation) {
      storageMutationQueues.delete(filePath);
    }
  }
};

const waitForStorageMutations = async (filePath: string) => {
  const pendingMutation = storageMutationQueues.get(filePath);
  if (pendingMutation) {
    await pendingMutation;
  }
};

const removeLegacyStorage = async () => {
  try {
    await unlink(LEGACY_STORAGE_PATH);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
};

const migrateLegacyStorage = async (): Promise<EncryptedStorageObject> => {
  const primaryPath = getPrimaryStoragePath();
  if (await pathExists(primaryPath)) {
    const storage = await readStorageFile(primaryPath, false);
    await removeLegacyStorage();
    return storage;
  }

  if (!(await pathExists(LEGACY_STORAGE_PATH))) {
    await writeStorageFile(primaryPath, {});
    return {};
  }

  const startedAt = performance.now();
  const legacyStorage = await readStorageFile(LEGACY_STORAGE_PATH, false);
  const migratedStorage = withoutDerivedCaches(legacyStorage);
  const encryptedRepositoryCache = legacyStorage.repositories_cache;
  if (encryptedRepositoryCache) {
    try {
      let serializedRepositoryCache: string;
      try {
        serializedRepositoryCache = safeStorage.decryptString(
          Buffer.from(encryptedRepositoryCache, "base64"),
        );
      } catch (error) {
        if (!isDevelopment) {
          throw error;
        }
        serializedRepositoryCache = encryptedRepositoryCache;
      }
      const activeRepositories = getActiveRepositories(
        JSON.parse(serializedRepositoryCache),
      );
      if (activeRepositories) {
        migratedStorage.active_repositories = safeStorage
          .encryptString(JSON.stringify(activeRepositories))
          .toString("base64");
      }
    } catch (error) {
      log.warn(
        "[Storage] Could not preserve active repository selections during migration",
        {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      );
    }
  }
  await writeStorageFile(primaryPath, migratedStorage);
  await removeLegacyStorage();
  performanceDiagnostics.record("storage-migration-completed", {
    discardedCacheCount:
      Object.keys(legacyStorage).length - Object.keys(migratedStorage).length,
    durationMs: performance.now() - startedAt,
    preservedValueCount: Object.keys(migratedStorage).length,
  });
  return migratedStorage;
};

const getPrimaryStorage = () => {
  primaryStoragePromise ??= migrateLegacyStorage().catch((error) => {
    primaryStoragePromise = null;
    throw error;
  });
  return primaryStoragePromise;
};

const getCacheStorage = (
  name: "pull_requests_cache" | "repositories_cache",
) => {
  const existing = cacheStoragePromises.get(name);
  if (existing) {
    return existing;
  }
  const storagePromise = readStorageFile(getCacheStoragePath(name), true).catch(
    (error) => {
      cacheStoragePromises.delete(name);
      throw error;
    },
  );
  cacheStoragePromises.set(name, storagePromise);
  return storagePromise;
};

const getStorageForName = async (name: StoreDataName) => {
  if (isDerivedCacheKey(name)) {
    return {
      filePath: getCacheStoragePath(name),
      storage: await getCacheStorage(name),
    };
  }
  return {
    filePath: getPrimaryStoragePath(),
    storage: await getPrimaryStorage(),
  };
};

const assertEncryptionAvailable = () => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-backed encryption is not available.");
  }
};

export const disableDerivedCacheWrites = () => {
  derivedCacheWritesEnabled = false;
  derivedCacheWriteGeneration += 1;
};

export const enableDerivedCacheWrites = () => {
  derivedCacheWritesEnabled = true;
};

export const storeData = async <T extends keyof StoreDataMap>({
  name,
  data,
}: StoreDataParams<T>): Promise<boolean> => {
  try {
    await app.whenReady();
    assertEncryptionAvailable();
    const isDerivedCache = isDerivedCacheKey(name);
    const writeGeneration = derivedCacheWriteGeneration;
    if (isDerivedCache && !derivedCacheWritesEnabled) {
      return false;
    }
    const startedAt = performance.now();
    const valueToEncrypt = await encodeStorageValue(data, isDerivedCache);
    const encryptedData = safeStorage
      .encryptString(valueToEncrypt)
      .toString("base64");
    const { filePath, storage } = await getStorageForName(name);
    if (
      isDerivedCache &&
      (!derivedCacheWritesEnabled ||
        writeGeneration !== derivedCacheWriteGeneration)
    ) {
      return false;
    }
    await mutateStorageFile(filePath, storage, (draft) => {
      draft[name] = encryptedData;
    });
    log.info(`[Storage] storeData ${name} duration: ${Math.round(performance.now() - startedAt)}ms`);
    return true;
  } catch (error) {
    log.error(`Failed to store ${name}:`, error);
    return false;
  }
};

export const getData = async <T extends StoreDataName>(
  name: T,
): Promise<StoreDataMap[T] | null> => {
  try {
    await app.whenReady();
    assertEncryptionAvailable();
    const startedAt = performance.now();
    const { filePath, storage } = await getStorageForName(name);
    await waitForStorageMutations(filePath);
    const encryptedBase64 = storage[name];
    if (!encryptedBase64) {
      log.warn(`[Storage] No data found for key: ${name}`);
      return null;
    }
    const decryptStartedAt = performance.now();
    let decryptedData: string;
    try {
      decryptedData = safeStorage.decryptString(
        Buffer.from(encryptedBase64, "base64"),
      );
    } catch (error) {
      if (!isDevelopment) {
        throw error;
      }
      JSON.parse(encryptedBase64);
      decryptedData = encryptedBase64;
      const migratedValue = safeStorage
        .encryptString(decryptedData)
        .toString("base64");
      const filePath = isDerivedCacheKey(name)
        ? getCacheStoragePath(name)
        : getPrimaryStoragePath();
      await mutateStorageFile(filePath, storage, (draft) => {
        draft[name] = migratedValue;
      });
      log.info(`[Storage] migrated legacy development value for ${name}`);
    }
    performanceDiagnostics.record("storage-value-decrypted", {
      durationMs: performance.now() - decryptStartedAt,
      name,
      sizeBytes: Buffer.byteLength(decryptedData),
    });
    const decodeStartedAt = performance.now();
    const value = await decodeStorageValue<StoreDataMap[T]>(decryptedData);
    performanceDiagnostics.record("storage-value-decoded", {
      durationMs: performance.now() - decodeStartedAt,
      name,
    });
    log.info(`[Storage] getData ${name} duration: ${Math.round(performance.now() - startedAt)}ms`);
    return value;
  } catch (error) {
    log.error(`Failed to get ${name}:`, error);
    return null;
  }
};

export const deleteDataOrThrow = async (name: StoreDataName) => {
  await app.whenReady();
  const { filePath, storage } = await getStorageForName(name);
  if (name === "access_token") {
    await removeLegacyStorage();
  }
  return mutateStorageFile(filePath, storage, (draft) => {
    if (!draft[name]) {
      log.warn(`[Storage] No data found for key: ${name}`);
      return false;
    }
    delete draft[name];
    return true;
  });
};

export const deleteData = async (name: StoreDataName) => {
  try {
    return await deleteDataOrThrow(name);
  } catch (error) {
    log.error(`Failed to delete ${name}:`, error);
    return false;
  }
};

export const deleteAllData = async () => {
  try {
    await app.whenReady();
    const primaryStorage = await getPrimaryStorage();
    await removeLegacyStorage();
    await mutateStorageFile(
      getPrimaryStoragePath(),
      primaryStorage,
      (draft) => {
        for (const key of Object.keys(draft)) {
          delete draft[key as StoreDataName];
        }
      },
    );
    await Promise.all(
      (["pull_requests_cache", "repositories_cache"] as const).map(
        async (name) => {
          const storage = await getCacheStorage(name);
          await mutateStorageFile(
            getCacheStoragePath(name),
            storage,
            (draft) => {
              for (const key of Object.keys(draft)) {
                delete draft[key as StoreDataName];
              }
            },
          );
        },
      ),
    );
    return true;
  } catch (error) {
    log.error("Failed to delete all data:", error);
    return false;
  }
};
