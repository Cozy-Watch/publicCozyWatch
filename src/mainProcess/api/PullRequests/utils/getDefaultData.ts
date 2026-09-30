import Logger from "electron-log";
import { getData } from "../../../safeStorage/safeStorage";
import { PullsList as ResponsePullList } from "../hooks/registerPullList";
import { PullsListReview as ResponsePullsListReview } from "../hooks/registerPullListReviews";
import { PullsActions as ResponsePullsActions } from "../hooks/registerPullActions";
import { Endpoints } from "@octokit/types";

export type PullRequestList = ResponsePullList["data"];
export type PullListReview = ResponsePullsListReview["data"];
export type PullsActions = ResponsePullsActions["data"]["workflow_runs"];

export type ListComments =
  Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"]["response"];

export type ExtendedComment = ListComments["data"][0] & { pullNumber: string };
export type ListCommentsData = ExtendedComment[];
export type ReviewComment = Pick<
  Endpoints["GET /repos/{owner}/{repo}/pulls/comments"]["response"]["data"][number],
  "body" | "updated_at" | "created_at" | "html_url" | "pull_request_url" | "user"
>;

export interface ReviewData {
  reviewId: number;
  login: string | null;
  userType: string | null;
  html_url: string;
  state: string;
  prNumber: string;
  previousState: string | null;
  pullRequestData?: PullRequestList[0];
}

export interface CIStatus {
  initialRun: PullsActions[0];
  finalRun: PullsActions[0];
}

type RepositoryName = string;
type Page = string;
type PullNumber = string;
type RunName = string;

export interface CacheData {
  etagPerRepo: {
    [key: RepositoryName]: {
      list?: Record<Page, string>;
      reviews?: Record<Page, string>;
      actions?: Record<Page, string>;
      issuecomments?: Record<Page, string>;
    };
  };
  pullRequestsPerRepo: {
    [key: RepositoryName]: Record<Page, PullRequestList>;
  };
  reviewPerRepoPerPullNumber: Record<
    RepositoryName,
    Record<PullNumber, PullListReview>
  >;
  actionsPerRepo: Record<RepositoryName, PullsActions>;

  pullRequestAddedOrRemoved: {
    added: PullRequestList;
    removed: PullRequestList;
  };
  reviewUpdateList: {
    newReview: ReviewData[];
    reviewChanged: ReviewData[];
  };

  CIStatusUpdatePerRepo: Record<RepositoryName, Record<RunName, CIStatus>>;

  mentions: Record<RepositoryName, Record<Page, ListCommentsData>>;
  reviewCommentsPerRepo: Record<RepositoryName, ReviewComment[]>;

  flatPullRequests: PullRequestList;
}

const defaultData = {
  etagPerRepo: {},
  pullRequestsPerRepo: {},
  reviewPerRepoPerPullNumber: {},
  actionsPerRepo: {},

  pullRequestAddedOrRemoved: {
    added: [],
    removed: [],
  },

  reviewUpdateList: {
    newReview: [],
    reviewChanged: [],
  },

  CIStatusUpdatePerRepo: {},

  mentions: {},
  reviewCommentsPerRepo: {},

  flatPullRequests: [],
};

let localCache: CacheData | null = null;

export const setLocalCache = (data: CacheData | null) => {
  Logger.log("[Repositories] saving localCache");
  localCache = data;
};

export const getCachedData = async (): Promise<CacheData> => {
  if (localCache !== null) {
    Logger.log("[Repositories] using localCache");
    return {
      ...defaultData,
      ...localCache,
    };
  }

  const storageCache = await getData("pull_requests_cache");

  if (storageCache) {
    Logger.log("[Repositories] using storageCache");
    return {
      ...defaultData,
      ...storageCache,
    };
  }

  Logger.log("[Repositories] no cache using defaults");
  return defaultData;
};
