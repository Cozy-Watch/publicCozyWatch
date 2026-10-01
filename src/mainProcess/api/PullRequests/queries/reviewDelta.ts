import { app, ipcMain } from "electron";
import pLimit from "p-limit";
import { getGithubClient, isPATAuth } from "../../githubClient";
import { getCachedData as getRepositoriesCache } from "../../Repositories/utils/getDefaultData";
import { getUser } from "../../User/getUser";
import { getNotificationsSettings } from "../../../notifications/getNotificationSettings";
import { batchNotificationManager } from "../../../notifications/notificationManager";
import { storeData } from "../../../safeStorage/safeStorage";
import { performanceDiagnostics } from "../../../diagnostics/diagnostics";
import { refreshCoordinator } from "../../../polling/refreshCoordinator";
import { getCachedData, setLocalCache } from "../utils/getDefaultData";
import type {
  CacheData,
  PullRequestList,
  PullListReview,
} from "../utils/getDefaultData";
import type { Repository } from "../../../safeStorage/safeStorage.types";
import { getReviewStatusUpdate } from "../utils/getReviewStatusUpdate";
import { getReviewNotifications } from "../utils/getReviewNotifications";
import { dedupePullRequests } from "../utils/dedupePullRequests";

const MAX_REVIEW_PRS = 100;
const MAX_REVIEW_PAGES = 200;
const CONCURRENCY = 4;
const QUOTA_MARGIN = 100;
type Pull = PullRequestList[number];
type Page = { data: PullRequestList; etag?: string; next: boolean };
type ReviewDelta = { repo: Repository; pull: Pull; reviews: PullListReview };
type HttpError = {
  status?: number;
  message?: string;
  response?: { headers?: Record<string, string> };
};

export type ReviewSweepResult = {
  requests: number;
  changedPRs: number;
  refreshedPRs: number;
  deferredPRs: number;
  failures: number;
  remainingQuota: number;
  reservedQuota: number;
  publicationLatencyMs: number | null;
  skipped?: string;
};

// These ETags belong to the sweep, not to the full refresh's PR membership cache.
// Pending entries survive successful list reads, 304s and failed review requests.
let epoch = -1;
let pages = new Map<number, Map<number, Page>>();
let pending = new Map<string, { repo: Repository; pull: Pull }>();
const keyOf = (pr: Pull) => `${pr.base.repo.id}/${pr.number}`;
const fingerprint = (pr: Pull) =>
  JSON.stringify([
    pr.id,
    pr.updated_at,
    pr.head.sha,
    (pr.requested_reviewers || []).map((user) => user.id).sort((a, b) => a - b),
  ]);

// Full refresh includes list, reviews, comments and up to ten workflow pages/repo.
// The estimate includes known detail pagination and headroom for growth/retries.
export function estimateFullRefreshReserve(
  cache: CacheData,
  repositories: Repository[],
) {
  let requests = 1;
  for (const repo of repositories) {
    const pulls = Object.values(
      cache.pullRequestsPerRepo[repo.name] || {},
    ).flat();
    requests += Math.max(1, Math.ceil(pulls.length / 100)) + 11;
    for (const pr of pulls) {
      const reviews =
        cache.reviewPerRepoPerPullNumber[repo.name]?.[pr.number]?.length || 0;
      requests += Math.max(1, Math.ceil(reviews / 100)) + 1;
    }
    // Comments are stored in page buckets, including their PR identity.
    const comments = Object.values(cache.mentions[repo.name] || {}).flat();
    requests += Math.ceil(comments.length / 100);
  }
  return Math.ceil(requests * 1.25) + QUOTA_MARGIN;
}

/** Only remove a stale request when a newly submitted review is at least as new
 * as the PR metadata. Older reviews must never erase a subsequent re-request. */
export function reconcileRequestedReviewers(
  pr: Pull,
  previous: PullListReview,
  reviews: PullListReview,
): Pull {
  const completed = new Set(
    reviews
      .filter(
        (review) =>
          review.state !== "PENDING" &&
          review.state !== "DISMISSED" &&
          review.submitted_at &&
          Date.parse(review.submitted_at) >= Date.parse(pr.updated_at) &&
          !previous.some(
            (old) =>
              old.id === review.id &&
              old.state === review.state &&
              old.submitted_at === review.submitted_at,
          ),
      )
      .map((review) => review.user?.id),
  );
  return {
    ...pr,
    requested_reviewers: pr.requested_reviewers?.filter(
      (reviewer) => !completed.has(reviewer.id),
    ),
  };
}

export async function sweepReviewDelta(): Promise<ReviewSweepResult> {
  const startedAt = performance.now();
  let observedMetrics: ReviewSweepResult | undefined;
  const result = await refreshCoordinator
    .tryDelta(async (isCurrent) => {
      if (epoch !== refreshCoordinator.epoch) {
        epoch = refreshCoordinator.epoch;
        pages = new Map();
        pending = new Map();
      }
      const metrics: ReviewSweepResult = {
        requests: 0,
        changedPRs: 0,
        refreshedPRs: 0,
        deferredPRs: 0,
        failures: 0,
        remainingQuota: 0,
        reservedQuota: 0,
        publicationLatencyMs: null,
      };
      observedMetrics = metrics;
      const [cache, repositoryCache] = await Promise.all([
        getCachedData(),
        getRepositoriesCache(),
      ]);
      const repositories = Object.values(repositoryCache.repositoriesByPage)
        .flat()
        .filter((repo) => repositoryCache.activeRepositories[repo.id]);
      // The legacy cache cannot distinguish same-named repositories. Never compound
      // that defect by publishing review data into an ambiguous cache slot.
      const allRepositories = Object.values(
        repositoryCache.repositoriesByPage,
      ).flat();
      const eligible = repositories.filter(
        (repo) =>
          allRepositories.filter((other) => other.name === repo.name).length ===
            1 &&
          Object.values(cache.pullRequestsPerRepo[repo.name] || {})
            .flat()
            .every((pr) => pr.base.repo.id === repo.id),
      );
      const activeIds = new Set(eligible.map((repo) => repo.id));
      for (const id of pages.keys()) if (!activeIds.has(id)) pages.delete(id);
      for (const [key, item] of pending)
        if (!activeIds.has(item.repo.id)) pending.delete(key);
      if (!isCurrent() || !eligible.length || !cache.flatPullRequests.length) {
        return { ...metrics, skipped: "no-hydrated-repositories" };
      }
      const client = await getGithubClient();
      metrics.requests++;
      const quota = (await client.rateLimit.get()).data.resources.core;
      metrics.remainingQuota = quota.remaining;
      metrics.reservedQuota = estimateFullRefreshReserve(cache, repositories);
      let budget = Math.max(0, quota.remaining - metrics.reservedQuota);
      let blocked = false;
      let terminalError: unknown;
      const requestAllowed = () => {
        if (!isCurrent() || blocked || budget <= 0) return false;
        budget--;
        metrics.requests++;
        return true;
      };
      const observeQuota = (
        headers: Record<string, string | number | undefined>,
      ) => {
        const remaining = Number(headers["x-ratelimit-remaining"]);
        if (Number.isFinite(remaining)) {
          metrics.remainingQuota = Math.min(metrics.remainingQuota, remaining);
          budget = Math.min(
            budget,
            Math.max(0, remaining - metrics.reservedQuota),
          );
        }
      };
      const fail = (error: unknown) => {
        metrics.failures++;
        const err = error as HttpError;
        const headers = err.response?.headers || {};
        observeQuota(headers);
        if (
          err.status === 401 ||
          err.status === 429 ||
          headers["retry-after"] ||
          headers["x-ratelimit-remaining"] === "0" ||
          /Authentication failed|Bad credentials|secondary rate limit/i.test(
            err.message || "",
          )
        ) {
          blocked = true;
          terminalError = error;
        }
        if (err.status === 403 && !blocked && isPATAuth()) {
          ipcMain.emit(
            "dispatch-authentication-invalid-PAT",
            null,
            "Check PAT - Pull Request Access Denied",
          );
        }
        performanceDiagnostics.record("review-sweep-request-failed", {
          status: err.status || 0,
        });
      };
      const estimatedListPages = eligible.reduce(
        (sum, repo) =>
          sum +
          Math.max(
            1,
            pages.get(repo.id)?.size ||
              Object.keys(cache.pullRequestsPerRepo[repo.name] || {}).length,
          ),
        0,
      );
      if (budget < estimatedListPages + 1)
        return { ...metrics, skipped: "quota-reserved-for-full-refresh" };

      const limit = pLimit(CONCURRENCY);
      const successfulLists = new Set<number>();
      await Promise.all(
        eligible.map((repo) =>
          limit(async () => {
            const oldPages =
              pages.get(repo.id) ||
              new Map(
                Object.entries(cache.pullRequestsPerRepo[repo.name] || {}).map(
                  ([number, data]) => [
                    Number(number),
                    {
                      data,
                      etag: cache.etagPerRepo[repo.name]?.list?.[number],
                      next:
                        Number(number) <
                        Object.keys(cache.pullRequestsPerRepo[repo.name] || {})
                          .length,
                    },
                  ],
                ),
              );
            const previous = new Map(
              [...oldPages.values()]
                .flatMap((page) => page.data)
                .map((pr) => [keyOf(pr), pr]),
            );
            const nextPages = new Map<number, Page>();
            try {
              for (let page = 1; ; page++) {
                if (!requestAllowed()) return;
                const old = oldPages.get(page);
                let value: Page;
                try {
                  const response = await client.rest.pulls.list({
                    owner: repo.owner,
                    repo: repo.name,
                    state: "open",
                    per_page: 100,
                    page,
                    headers: {
                      "x-operation-name": "review-delta-list",
                      ...(old?.etag ? { "if-none-match": old.etag } : {}),
                    },
                    request: { timeout: 15000 },
                  });
                  observeQuota(response.headers);
                  value = {
                    data: response.data,
                    etag: response.headers.etag,
                    next: /rel="next"/.test(response.headers.link || ""),
                  };
                } catch (error) {
                  if ((error as HttpError).status !== 304 || !old) throw error;
                  const headers = (error as HttpError).response?.headers || {};
                  observeQuota(headers);
                  value = {
                    ...old,
                    etag: headers.etag ?? old.etag,
                    // A 304 validates the body, not the cached pagination links.
                    next:
                      headers.link !== undefined
                        ? /rel="next"/.test(headers.link)
                        : old.next || old.data.length === 100,
                  };
                }
                nextPages.set(page, value);
                if (!value.next) break;
              }
              if (!isCurrent()) return;
              const pulls = [...nextPages.values()].flatMap(
                (value) => value.data,
              );
              const openKeys = new Set(pulls.map(keyOf));
              for (const [key, item] of pending)
                if (item.repo.id === repo.id && !openKeys.has(key))
                  pending.delete(key);
              for (const pull of pulls) {
                const key = keyOf(pull);
                const old = previous.get(key);
                if (!old || fingerprint(old) !== fingerprint(pull)) {
                  pending.set(key, { repo, pull });
                  metrics.changedPRs++;
                } else if (pending.has(key)) pending.set(key, { repo, pull });
              }
              pages.set(repo.id, nextPages);
              successfulLists.add(repo.id);
            } catch (error) {
              fail(error);
            }
          }),
        ),
      );

      const known = new Set(cache.flatPullRequests.map(keyOf));
      const candidates = [...pending.values()]
        .filter(
          ({ repo, pull }) =>
            successfulLists.has(repo.id) && known.has(keyOf(pull)),
        )
        .sort(
          (a, b) =>
            Date.parse(b.pull.updated_at) - Date.parse(a.pull.updated_at) ||
            a.repo.id - b.repo.id ||
            a.pull.number - b.pull.number,
        )
        .slice(0, MAX_REVIEW_PRS);
      const deltas: ReviewDelta[] = [];
      let reviewPages = 0;
      await Promise.all(
        candidates.map(({ repo, pull }) =>
          limit(async () => {
            const reviews: PullListReview = [];
            try {
              for (let page = 1; ; page++) {
                if (reviewPages >= MAX_REVIEW_PAGES || !requestAllowed())
                  return;
                reviewPages++;
                const response = await client.rest.pulls.listReviews({
                  owner: repo.owner,
                  repo: repo.name,
                  pull_number: pull.number,
                  per_page: 100,
                  page,
                  headers: { "x-operation-name": "review-delta-reviews" },
                  request: { timeout: 15000 },
                });
                observeQuota(response.headers);
                reviews.push(
                  ...response.data.map((review) => ({
                    ...review,
                    commit_id: review.commit_id ?? "",
                  })),
                );
                if (!/rel="next"/.test(response.headers.link || "")) break;
              }
              deltas.push({ repo, pull, reviews });
            } catch (error) {
              fail(error);
            }
          }),
        ),
      );

      if (terminalError) throw terminalError;
      if (!isCurrent()) return { ...metrics, skipped: "cancelled" };
      metrics.deferredPRs = pending.size;
      if (!deltas.length)
        return {
          ...metrics,
          ...(!budget ? { skipped: "quota-budget-exhausted" } : {}),
        };
      // Re-read settings/cache after I/O: a repository may have been disabled.
      const [latest, selection, user, settings] = await Promise.all([
        getCachedData(),
        getRepositoriesCache(),
        getUser(),
        getNotificationsSettings(),
      ]);
      if (!isCurrent()) return { ...metrics, skipped: "cancelled" };
      const next: CacheData = {
        ...latest,
        reviewPerRepoPerPullNumber: { ...latest.reviewPerRepoPerPullNumber },
        pullRequestsPerRepo: { ...latest.pullRequestsPerRepo },
        etagPerRepo: { ...latest.etagPerRepo },
      };
      const replacements = new Map<string, Pull>();
      const changedRepos = new Set<string>();
      for (const { repo, pull, reviews } of deltas) {
        if (!selection.activeRepositories[repo.id]) continue;
        const old = latest.flatPullRequests.find(
          (pr) => pr.id === pull.id && pr.base.repo.id === repo.id,
        );
        if (!old) continue;
        pending.delete(keyOf(pull));
        metrics.refreshedPRs++;
        const previous =
          latest.reviewPerRepoPerPullNumber[repo.name]?.[pull.number] || [];
        // Keep membership/title/SHA reconciliation owned by the full refresh.
        const updated = reconcileRequestedReviewers(
          {
            ...old,
            requested_reviewers: pull.requested_reviewers,
            updated_at: pull.updated_at,
          },
          previous,
          reviews,
        );
        if (
          JSON.stringify(previous) === JSON.stringify(reviews) &&
          JSON.stringify(old.requested_reviewers) ===
            JSON.stringify(updated.requested_reviewers)
        )
          continue;
        changedRepos.add(repo.name);
        replacements.set(keyOf(pull), {
          ...old,
          requested_reviewers: updated.requested_reviewers,
        });
        next.reviewPerRepoPerPullNumber[repo.name] = {
          ...next.reviewPerRepoPerPullNumber[repo.name],
          [pull.number]: reviews,
        };
        // Full REST revalidation must not reuse validators for a different review body.
        next.etagPerRepo[repo.name] = {
          ...next.etagPerRepo[repo.name],
          reviews: {},
        };
      }
      metrics.deferredPRs = pending.size;
      if (changedRepos.size) {
        for (const repo of changedRepos) {
          next.pullRequestsPerRepo[repo] = Object.fromEntries(
            Object.entries(latest.pullRequestsPerRepo[repo] || {}).map(
              ([page, pulls]) => [
                page,
                pulls.map((pr) => replacements.get(keyOf(pr)) || pr),
              ],
            ),
          );
        }
        next.flatPullRequests = dedupePullRequests(
          latest.flatPullRequests
            .filter((pr) => selection.activeRepositories[pr.base.repo.id])
            .map((pr) => replacements.get(keyOf(pr)) || pr),
        );
        next.pullRequestAddedOrRemoved = { added: [], removed: [] };
        next.CIStatusUpdatePerRepo = {};
        next.reviewUpdateList = { newReview: [], reviewChanged: [] };
        for (const repo of changedRepos) {
          const changes = getReviewStatusUpdate({
            repositoryName: repo,
            initialCache: latest,
            finalCache: next,
            userId: user.id,
          });
          if (settings.newReviewsNotification.value)
            next.reviewUpdateList.newReview.push(...changes.newReview);
          if (settings.reviewsUpdateNotification.value)
            next.reviewUpdateList.reviewChanged.push(...changes.reviewChanged);
        }
        setLocalCache(next);
        ipcMain.emit("dispatch-pull-request-update", null, next);
        metrics.publicationLatencyMs = performance.now() - startedAt;
        const notifications = getReviewNotifications(next.reviewUpdateList);
        if (notifications.length) {
          app.setBadgeCount(notifications.length);
          batchNotificationManager(notifications);
        }
        await storeData({ name: "pull_requests_cache", data: next });
      }
      if (!budget) metrics.skipped = "quota-budget-exhausted";
      return metrics;
    })
    .catch((error: unknown) => {
      performanceDiagnostics.record("review-sweep-failed", {
        ...observedMetrics,
        durationMs: performance.now() - startedAt,
        status: (error as HttpError).status || 0,
      });
      throw error;
    });
  const metrics = result || {
    requests: 0,
    changedPRs: 0,
    refreshedPRs: 0,
    deferredPRs: pending.size,
    failures: 0,
    remainingQuota: 0,
    reservedQuota: 0,
    publicationLatencyMs: null,
    skipped: "refresh-in-progress",
  };
  performanceDiagnostics.record("review-sweep-completed", {
    ...metrics,
    durationMs: performance.now() - startedAt,
  });
  return metrics;
}
