import Logger from "electron-log";
import {
  pullRequestQuery,
  PullRequestQueryResult,
} from "./queries/getPullRequestQuery";
import { getCachedData } from "./utils/getDefaultData";
import type { CacheData } from "./utils/getDefaultData";
import { refreshCoordinator } from "../../polling/refreshCoordinator";

/**
 * Returns the latest app-owned snapshot without starting or waiting for GitHub I/O.
 * Renderers use this for their initial view; polling owns synchronization.
 */
export const getPullRequestSnapshot = async (): Promise<CacheData> => {
  Logger.info("[PullRequests] Returning cached snapshot");
  return getCachedData();
};

export const getPullRequests = async (): Promise<PullRequestQueryResult> => {
  return refreshCoordinator.runFull((isCurrent) => pullRequestQuery(isCurrent));
};
