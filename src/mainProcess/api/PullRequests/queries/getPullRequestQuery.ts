import { app, ipcMain } from "electron";
import Logger from "electron-log";
import pLimit from "p-limit";
import { getNotificationsSettings } from "../../../notifications/getNotificationSettings";
import { batchNotificationManager } from "../../../notifications/notificationManager";
import type { ManagedNotification } from "../../../notifications/notificationManager";
import { storeData } from "../../../safeStorage/safeStorage";
import { getGithubClient } from "../../githubClient";
import { getUser } from "../../User/getUser";
import { registerListIssuesComments } from "../hooks/registerIssuesListComments";
import { registerPullActions } from "../hooks/registerPullActions";
import { registerPullList } from "../hooks/registerPullList";
import { getAddedRemovedPRId } from "../utils/getAddedRemovedPRId";
import { getCIStatusUpdate } from "../utils/getCIStatusUpdate";
import {
  CacheData,
  CIStatus,
  getCachedData,
  ListCommentsData,
  PullRequestList,
  ReviewData,
  setLocalCache,
} from "../utils/getDefaultData";
import { getMentions } from "../utils/getMentions";
import { getRepositoriesData } from "../utils/getRepositoriesData";
import { getReviewStatusUpdate } from "../utils/getReviewStatusUpdate";
import type { Repository } from "../../../safeStorage/safeStorage.types";
import { getIssuesListCommentsQuery } from "./getIssuesListCommentsQuery";
import { pullActionsQuery } from "./pullActionQuery";
import { pullsListQuery } from "./pullListQuery";
import { pullsListReviewsQuery, retainOpenReviewPages } from "./pullListReviewQuery";
import { settleRefreshWork } from "../../../polling/refreshCoordinator";
import { getReviewNotifications } from "../utils/getReviewNotifications";
import { fetchRecentReviewComments } from "./recentReviewCommentsQuery";

const pullListOperationName = "pull-list-requests";
const pullListReviewOperationName = "pull-listReview-requests";
const pullActionsOperationName = "pull-actions-requests";
const issuesListComments = "issues-list-comments";

export type PullRequestQueryResult = CacheData & {
  repositories: Repository[];
};

export const pullRequestQuery = async (isCurrent = () => true): Promise<PullRequestQueryResult> => {
  const assertCurrent = () => { if (!isCurrent()) throw new Error("Refresh cancelled"); };
  const startTime = Date.now();
  const { repositoriesByPage, activeRepositories } =
    await getRepositoriesData();

  const cache = await getCachedData();
  const initialCache: CacheData = structuredClone(cache);

  const user = await getUser();

  const notificationsSettings = await getNotificationsSettings();

  const repositories = Object.values(repositoriesByPage || {})
    .flat()
    .filter((repo) => (activeRepositories || [])[repo.id]);

  // Keep each request type bounded, while allowing independent GitHub
  // endpoints to make progress at the same time.
  const pullListLimit = pLimit(15);
  const commentsLimit = pLimit(15);
  const reviewsLimit = pLimit(15);
  const actionsLimit = pLimit(15);

  const octokit = await getGithubClient();

  // Check rate limit before proceeding
  try {
    const { data: rateLimit } = await octokit.rateLimit.get();
    Logger.info(
      `[PullRequests] Rate limit remaining: ${rateLimit.rate.remaining}/${rateLimit.rate.limit}`,
    );

    // Rough estimate: 1 repo = ~4 requests (list, actions, reviews per PR, comments per PR)
    const estimatedRequests = repositories.length * 5;

    if (rateLimit.rate.remaining < Math.max(estimatedRequests + 50, 100)) {
      const resetTime = new Date(rateLimit.rate.reset * 1000);
      const waitMinutes = Math.ceil((resetTime.getTime() - Date.now()) / 60000);

      Logger.warn(
        `[PullRequests] Rate limit low (${rateLimit.rate.remaining} remaining, need ~${estimatedRequests}), skipping poll. Resets in ${waitMinutes} minutes.`,
      );

      batchNotificationManager([
        {
          title: "GitHub Rate Limit Reached",
          body: `Pull request updates are paused due to low rate limit. Resets in approximately ${waitMinutes} minutes.`,
          type: "system",
        },
      ]);

      // Return cached data without making new requests
      const flatPullRequests = Object.values(cache.pullRequestsPerRepo || {})
        .flatMap((value) => {
          return Object.values(value).flat();
        })
        .filter((pr) => {
          return activeRepositories?.[pr.base.repo.id];
        })
        .sort((a, b) => {
          const dateA = new Date(a.updated_at);
          const dateB = new Date(b.updated_at);
          return dateB.getTime() - dateA.getTime();
        });

      const cachedData = {
        ...cache,
        pullRequestAddedOrRemoved: { added: [], removed: [] },
        reviewUpdateList: { newReview: [], reviewChanged: [] },
        CIStatusUpdatePerRepo: {},
        flatPullRequests,
      };

      assertCurrent();
      ipcMain.emit("dispatch-pull-request-update", null, cachedData);

      const endTime = Date.now();
      const duration = endTime - startTime;
      Logger.info(
        `[PullRequests] Returned cached data due to rate limit. Execution Time: ${duration}ms`,
      );

      return { ...cachedData, repositories };
    }
  } catch (error) {
    Logger.error("[PullRequests] Error checking rate limit", error);
    // Continue with requests if rate limit check fails
  }

  assertCurrent();
  registerPullList({
    cache,
    octokit,
    operationName: pullListOperationName,
  });

  registerPullActions({
    cache,
    octokit,
    operationName: pullActionsOperationName,
  });

  registerListIssuesComments({
    cache,
    octokit,
    operationName: issuesListComments,
  });

  try {
    await settleRefreshWork(
      repositories.map((repo) =>
        pullListLimit(async () => {
          return await pullsListQuery({
            name: repo.name,
            octokit,
            operationName: pullListOperationName,
            owner: repo.owner,
          });
        }),
      ),
    );
  } catch (error) {
    Logger.error("[PullRequests] Error during pullsListQuery", error);
    throw error;
  } finally {
    Logger.info("[PullRequests] pullsListQuery completed");
  }

  const flatPullRequestsAfterListRefresh = Object.values(
    cache.pullRequestsPerRepo || {},
  )
    .flatMap((value) => Object.values(value).flat())
    .filter((pr) => activeRepositories?.[pr.base.repo.id])
    .sort((first, second) => {
      return (
        new Date(second.updated_at).getTime() -
        new Date(first.updated_at).getTime()
      );
    });

  // Make new pull requests visible before slower comment, review, and CI requests finish.
  assertCurrent();
  const pullRequestsAfterListRefresh = {
    ...cache,
    flatPullRequests: flatPullRequestsAfterListRefresh,
  };
  setLocalCache(pullRequestsAfterListRefresh);
  ipcMain.emit(
    "dispatch-pull-request-update",
    null,
    pullRequestsAfterListRefresh,
  );

  const listOfPullRequests = Object.values(cache.pullRequestsPerRepo).flatMap(
    (page) => {
      const pullRequest = Object.values(page).flat();

      return pullRequest.map((pr) => ({
        pullNumber: pr.number,
        owner: pr.base.repo.owner.login,
        repoName: pr.base.repo.name,
      }));
    },
  );

  const repositoriesWithPullRequestsList = Object.keys(
    cache.pullRequestsPerRepo,
  );

  const pullRequestNumberByRepoName: Record<string, string[]> =
    Object.entries(cache.pullRequestsPerRepo).reduce(
      (acc, [repoName, page]) => {
        const pullRequestsList = Object.values(page).flat();
        const pullNumberList = pullRequestsList.map(({ number }) => number);

        return {
          ...acc,
          [repoName]: pullNumberList,
        };
      },
      {},
    );

  const repositoriesWithPullRequests = repositories.reduce<
    { owner: string; repoName: string; pullNumber: string }[]
  >((acc, repo) => {
    const hasPRs = repositoriesWithPullRequestsList.includes(repo.name);
    if (!hasPRs) {
      return acc;
    }

    const pullNumbersList = pullRequestNumberByRepoName[repo.name] || [];
    const requestParams = pullNumbersList.map((pullNumber) => ({
      owner: repo.owner,
      repoName: repo.name,
      pullNumber,
    }));

    return [...acc, ...requestParams];
  }, []);

  retainOpenReviewPages(octokit, repositoriesWithPullRequests);

  const commentsTask = async () => {
    try {
      await Promise.allSettled(
        listOfPullRequests.map(({ owner, pullNumber, repoName }) =>
          commentsLimit(() =>
            getIssuesListCommentsQuery({
              name: repoName,
              octokit,
              operationName: issuesListComments,
              pullNumber: `${pullNumber}`,
              owner,
            }),
          ),
        ),
      );
    } catch (error) {
      Logger.error(
        "[PullRequests] Error during pullsListCommentsQuery request",
        error,
      );
    } finally {
      Logger.info("[PullRequests] pullsListCommentsQuery completed");
    }
  };

  const reviewsTask = async () => {
    try {
      await settleRefreshWork(
        repositoriesWithPullRequests.map(({ owner, pullNumber, repoName }) =>
          reviewsLimit(() =>
            pullsListReviewsQuery({
              cache,
              name: repoName,
              octokit,
              operationName: pullListReviewOperationName,
              owner,
              pullNumber,
            }),
          ),
        ),
      );
    } catch (error) {
      Logger.error(
        "[PullRequests] Error during pullsListReviewsQuery request",
        error,
      );
      throw error;
    } finally {
      Logger.info("[PullRequests] pullsListReviewsQuery completed");
    }
  };

  const actionsTask = async () => {
    try {
      await settleRefreshWork(
        repositories.map((repo) =>
          actionsLimit(() =>
            pullActionsQuery({
              name: repo.name,
              octokit,
              operationName: pullActionsOperationName,
              owner: repo.owner,
            }),
          ),
        ),
      );
    } catch (error) {
      Logger.error("[PullRequests] Error during pullActionsQuery", error);
      throw error;
    } finally {
      Logger.info("[PullRequests] pullActionsQuery completed");
    }
  };

  await settleRefreshWork([
    commentsTask(),
    reviewsTask(),
    actionsTask(),
    fetchRecentReviewComments(octokit, repositories, cache),
  ]);
  assertCurrent();

  // -----------------------------------------------
  // ------- PULL REQUEST ADDED OR REMOVED  -------
  // -----------------------------------------------
  const pullRequestAddedOrRemoved = repositories.reduce<{
    added: PullRequestList;
    removed: PullRequestList;
  }>(
    (acc, repo) => {
      const repositoryName = repo.name;

      const removedOrAddedPr = getAddedRemovedPRId({
        repositoryName,
        initialCache,
        finalCache: cache,
        userId: user.id,
      });

      const { added, removed } = removedOrAddedPr;

      const pullRequestData = Object.values(
        cache.pullRequestsPerRepo[repositoryName] || {},
      ).flat();

      const initialPullRequestData = Object.values(
        initialCache.pullRequestsPerRepo[repositoryName] || {},
      ).flat();

      const hasAddNotificationEnabled =
        notificationsSettings.pullRequestsAddedNotification.value;

      const addedWithPullRequestsDetails = (
        hasAddNotificationEnabled ? added : []
      )
        .map((prId) => {
          return pullRequestData.find(({ id }) => prId === id);
        })
        .filter((review) => review !== undefined);

      const hasRemovedNotificationEnabled =
        notificationsSettings.pullRequestsRemovedNotification.value;

      const removedWithPullRequestsDetails = (
        hasRemovedNotificationEnabled ? removed : []
      )
        .map((prId) => {
          return initialPullRequestData.find(({ id }) => prId === id);
        })
        .filter((review) => review !== undefined);

      return {
        ...acc,
        added: [...acc.added, ...addedWithPullRequestsDetails],
        removed: [...acc.removed, ...removedWithPullRequestsDetails],
      };
    },
    { added: [], removed: [] },
  );

  // -----------------------------------------------
  // -------- NEW REVIEW OR UPDATE REVIEW  --------
  // -----------------------------------------------

  const hasReviewUpdateNotificationEnabled =
    notificationsSettings.reviewsUpdateNotification.value || notificationsSettings.newReviewsNotification.value;

  const reviewUpdateList = (
    hasReviewUpdateNotificationEnabled ? repositories : []
  ).reduce<{ newReview: ReviewData[]; reviewChanged: ReviewData[] }>(
    (acc, repo) => {
      const repositoryName = repo.name;

      const { newReview, reviewChanged } = getReviewStatusUpdate({
        repositoryName,
        initialCache,
        finalCache: cache,
        userId: user.id,
      });

      return {
        ...acc,
        newReview: [...acc.newReview, ...(notificationsSettings.newReviewsNotification.value ? newReview : [])],
        reviewChanged: [...acc.reviewChanged, ...(notificationsSettings.reviewsUpdateNotification.value ? reviewChanged : [])],
      };
    },
    { newReview: [], reviewChanged: [] },
  );

  // -----------------------------------------------
  // -------- CI STATUS UPDATE  --------
  // -----------------------------------------------

  const hasCIStatusNotificationEnabled =
    notificationsSettings.ciStatusNotification.value;

  const CIStatusUpdatePerRepo = (
    hasCIStatusNotificationEnabled ? repositories : []
  ).reduce((acc: Record<string, Record<string, CIStatus>>, repo) => {
    const repositoryName = repo.name;
    const CIStatus = getCIStatusUpdate({
      repositoryName,
      initialCache,
      finalCache: cache,
      userId: user.id,
    });

    if (Object.values(CIStatus).length !== 0) {
      return {
        ...acc,
        [repo.name]: CIStatus,
      };
    }

    return acc;
  }, {});

  // -----------------------------------------------
  // --------------- MENTIONS  ---------------
  // -----------------------------------------------

  const hasMentionsNotificationEnabled =
    notificationsSettings.mentionsNotification.value;

  const mentions = (hasMentionsNotificationEnabled ? repositories : []).reduce(
    (
      acc: {
        addedMentions: ListCommentsData;
        removedMentions: ListCommentsData;
      },
      repo,
    ) => {
      const { addedMentions, removedMentions } = getMentions({
        finalCache: cache,
        initialCache,
        repositoryName: repo.name,
        username: user.login,
      });

      return {
        ...acc,
        addedMentions: [...acc.addedMentions, ...addedMentions],
        removedMentions: [...acc.removedMentions, ...removedMentions],
      };
    },
    {
      addedMentions: [],
      removedMentions: [],
    },
  );

  const amountOfPullRequestAdded = pullRequestAddedOrRemoved.added.length;
  const amountOfPullRequestRemoved = pullRequestAddedOrRemoved.removed.length;

  const amountOfNewReviews = reviewUpdateList.newReview.length;
  const amountOfUpdatedReviews = reviewUpdateList.reviewChanged.length;

  const amountOfAddedMentions = mentions.addedMentions.length;

  const amountOfCiUpdates = Object.keys(CIStatusUpdatePerRepo).reduce(
    (acc, repoName) => {
      return Object.values(CIStatusUpdatePerRepo[repoName] || {}).length + acc;
    },
    0,
  );

  const totalChanges =
    amountOfPullRequestAdded +
    amountOfPullRequestRemoved +
    amountOfNewReviews +
    amountOfUpdatedReviews +
    amountOfCiUpdates +
    amountOfAddedMentions;

  app.setBadgeCount(totalChanges);

  if (process.platform === "darwin" && totalChanges > 0) {
    app.dock?.bounce("informational");
  }

  const pullRequestsAddedNotification = pullRequestAddedOrRemoved.added.map(
    (pr) => {
      const source = { repository: pr.base.repo.full_name, pullNumber: pr.number, branch: pr.head.ref };
      const owner = pr?.user?.id === user.id;

      const isReviewer = pr?.requested_reviewers?.some(
        (reviewer) => reviewer.id === user.id,
      );

      if (owner) {
        return {
          title: "New Pull Request",
          body: `You have opened "${pr?.title}".`,
          type: "pullRequest",
          url: pr.html_url,
          source,
        };
      }

      if (isReviewer) {
        return {
          title: "New Review Request",
          body: `You have been requested to review "${pr?.title}".`,
          type: "pullRequest",
          url: pr.html_url,
          source,
        };
      }

      return {
        title: "New Pull Request",
        body: `"${pr?.title}" has been assigned to you.`,
        type: "pullRequest",
        url: pr.html_url,
        source,
      };
    },
  );

  const pullRequestsRemovedNotification = pullRequestAddedOrRemoved.removed.map(
    (pr) => {
      const source = { repository: pr.base.repo.full_name, pullNumber: pr.number, branch: pr.head.ref };
      const isReviewer = pr?.requested_reviewers?.some(
        (reviewer) => reviewer.id === user.id,
      );

      if (isReviewer) {
        return {
          title: "Review Request Removed",
          body: `You are no longer a reviewer of "${pr?.title}".`,
          type: "pullRequest",
          url: pr.html_url,
          source,
        };
      }

      return {
        title: "Closed Pull Request",
        body: `Pull Request "${pr?.title}" has been closed.`,
        type: "pullRequest",
        url: pr.html_url,
        source,
      };
    },
  );

  const reviewNotifications = getReviewNotifications(reviewUpdateList);

  const ciStatusNotification = repositories
    .map((repo) => {
      const repositoryName = repo.name;
      const CIStatus = getCIStatusUpdate({
        repositoryName,
        initialCache,
        finalCache: cache,
        userId: user.id,
      });

      const runNames = Object.keys(CIStatus);

      const runUpdates = runNames.map((runName) => {
        const { finalRun, initialRun } = CIStatus[runName];

        const pullRequestList = Object.values(
          cache.pullRequestsPerRepo[repositoryName] || {},
        ).flat();

        const linkedPullRequests = finalRun.pull_requests ?? [];
        const pullRequestData =
          pullRequestList.find((pr) =>
            linkedPullRequests.some(
              (linkedPr) => linkedPr.number === pr.number || linkedPr.id === pr.id,
            ),
          ) ??
          (finalRun.head_sha
            ? pullRequestList.find((pr) => pr.head.sha === finalRun.head_sha)
            : undefined) ??
          (finalRun.head_branch
            ? pullRequestList.find((pr) => pr.head.ref === finalRun.head_branch)
            : undefined);

        const title = pullRequestData?.title;
        const pullNumber = pullRequestData?.number ?? finalRun.pull_requests?.[0]?.number;
        const source = {
          repository: `${repo.owner}/${repo.name}`,
          pullNumber,
          branch: pullRequestData?.head.ref ?? finalRun.head_branch,
        };
        const pullRequestUrl = pullRequestData?.html_url ?? (pullNumber
          ? `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pull/${pullNumber}`
          : finalRun.html_url);
        const subject = title ? `Pull Request "${title}"` : pullNumber ? `Pull Request #${pullNumber}` : "This branch";

        if (finalRun.conclusion === "success") {
          return {
            title: `CI "${runName}" Status Update`,
            body: `${subject} successfully passed the checks.`,
            type: "ci",
            tone: "success",
            url: pullRequestUrl,
            source,
          };
        }
        return {
          title: `CI "${runName}" Status Update`,
          body: `${subject} status changed from ${initialRun.conclusion} to ${finalRun.conclusion}.`,
          type: "ci",
          tone: ["failure", "timed_out", "startup_failure", "action_required"].includes(finalRun.conclusion ?? "")
            ? "danger"
            : "neutral",
          url: pullRequestUrl,
          source,
        };
      });

      return runUpdates;
    })
    .flat();

  const allPullRequests = Object.values(cache.pullRequestsPerRepo).flatMap(
    (page) => Object.values(page).flat(),
  );

  const mentionNotifications = mentions.addedMentions.map((mention) => {
    const { pullNumber, user, html_url } = mention;

    const userLogin = user?.login || user?.name || "Someone";

    const repository = new URL(html_url).pathname.split("/").slice(1, 3).join("/");
    const pullRequest = allPullRequests.find(
      (pr) => pr.number === Number(pullNumber) && pr.base.repo.full_name === repository,
    );

    const pullRequestTitle = pullRequest?.title || "a pull request";

    return {
      title: "You have been mentioned",
      body: `${userLogin} mentioned you in "${pullRequestTitle}".`,
      type: "mention",
      url: pullRequest?.html_url ?? `https://github.com/${repository}/pull/${pullNumber}`,
      source: { repository, pullNumber: Number(pullNumber), branch: pullRequest?.head.ref },
    };
  });

  batchNotificationManager([
    ...pullRequestsAddedNotification,
    ...pullRequestsRemovedNotification,
    ...reviewNotifications,
    ...ciStatusNotification,
    ...mentionNotifications,
  ] as ManagedNotification[]);

  const flatPullRequests = Object.values(cache.pullRequestsPerRepo || {})
    .flatMap((value) => {
      return Object.values(value).flat();
    })
    .filter((pr) => {
      return activeRepositories?.[pr.base.repo.id];
    })
    .sort((a, b) => {
      const dateA = new Date(a.updated_at);
      const dateB = new Date(b.updated_at);
      return dateB.getTime() - dateA.getTime();
    });

  const data = {
    ...cache,
    pullRequestAddedOrRemoved,
    reviewUpdateList,
    CIStatusUpdatePerRepo,
    flatPullRequests,
  };

  await storeData({ name: "pull_requests_cache", data });
  assertCurrent();

  setLocalCache(data);

  ipcMain.emit("dispatch-pull-request-update", null, data);

  const endTime = Date.now(); // Record the end time
  const duration = endTime - startTime; // Calculate the duration
  Logger.info(`[PullRequests] Total Execution Time: ${duration}ms`);
  return { ...data, repositories };
};
