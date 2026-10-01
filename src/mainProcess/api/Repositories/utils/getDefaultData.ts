import Logger from "electron-log";
import { RepositoriesCache } from "../../../safeStorage/safeStorage.types";
import { getData } from "../../../safeStorage/safeStorage";

const defaultData = {
  etagPerPage: {},
  repositoriesByPage: {},
  activeRepositories: {},
};

let localCache: RepositoriesCache | null = null;

export const setLocalCache = (data: RepositoriesCache | null) => {
  Logger.log("[Repositories] saving localCache");
  localCache = data;
};

export const getCachedData = async (): Promise<Required<RepositoriesCache>> => {
  if (localCache !== null) {
    Logger.log("[Repositories] using localCache");
    return {
      ...defaultData,
      ...localCache,
    };
  }

  const [storageCache, activeRepositories] = await Promise.all([
    getData("repositories_cache"),
    getData("active_repositories"),
  ]);

  if (storageCache) {
    Logger.log("[Repositories] using storageCache");
    return {
      ...defaultData,
      ...storageCache,
      ...(activeRepositories ? { activeRepositories } : {}),
    };
  }

  if (activeRepositories) {
    return {
      ...defaultData,
      activeRepositories,
    };
  }

  Logger.log("[Repositories] no cache using defaults");
  return defaultData;
};
