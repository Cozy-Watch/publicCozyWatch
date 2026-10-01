import { ipcMain } from "electron";
import Logger from "electron-log";
import { storeData } from "../../safeStorage/safeStorage";
import { getCachedData as pullRequestCachedData } from "../PullRequests/utils/getDefaultData";
import { dedupePullRequests } from "../PullRequests/utils/dedupePullRequests";
import { getCachedData, setLocalCache } from "./utils/getDefaultData";

export const setRepositoryEnableState = async (
  activeRepository: Record<string, boolean>,
) => {
  Logger.log("[Repositories] setRepositoryEnableState");

  const currentCache = await getCachedData();
  const pullRequestsCache = await pullRequestCachedData();

  const activeRepositories: Record<number, boolean> = {
    ...currentCache.activeRepositories,
    ...activeRepository,
  };

  const data = {
    ...currentCache,
    activeRepositories,
  };

  const flatPullRequests = dedupePullRequests(
    Object.values(pullRequestsCache.pullRequestsPerRepo || {}).flatMap(
      (value) => Object.values(value).flat(),
    ),
  )
    .filter((pr) => {
      return activeRepositories?.[pr.base.repo.id];
    })
    .sort((a, b) => {
      const dateA = new Date(a.updated_at);
      const dateB = new Date(b.updated_at);
      return dateB.getTime() - dateA.getTime();
    });

  const pullRequestsData = {
    ...pullRequestsCache,
    flatPullRequests,
  };

  const selectionSaved = await storeData({
    name: "active_repositories",
    data: activeRepositories,
  });
  if (!selectionSaved) {
    throw new Error("Failed to save active repository selections.");
  }

  setLocalCache(data);
  ipcMain.emit("dispatch-repository-update", null, data);
  ipcMain.emit("dispatch-pull-request-update", null, pullRequestsData);

  void storeData({ name: "pull_requests_cache", data: pullRequestsData });
  void storeData({ name: "repositories_cache", data });
};
