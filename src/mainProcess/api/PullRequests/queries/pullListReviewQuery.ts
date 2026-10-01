import { Octokit } from "@octokit/rest";
import { ipcMain } from "electron";
import Logger from "electron-log";
import { isPATAuth } from "../../githubClient";
import type { CacheData, PullListReview } from "../utils/getDefaultData";

type ReviewPage = { data: PullListReview; etag?: string; next: boolean };
// Client-scoped validators prevent a new account inheriting another account's pages.
const pageCaches = new WeakMap<Octokit, Map<string, ReviewPage[]>>();

export const retainOpenReviewPages = (
  octokit: Octokit,
  pulls: { owner: string; repoName: string; pullNumber: string }[],
) => {
  const retained = new Set(
    pulls.map(
      ({ owner, repoName, pullNumber }) => `${owner}/${repoName}/${pullNumber}`,
    ),
  );
  const pages = pageCaches.get(octokit);
  if (pages)
    for (const key of pages.keys()) if (!retained.has(key)) pages.delete(key);
};

export const pullsListReviewsQuery = async ({
  name,
  octokit,
  operationName,
  owner,
  pullNumber,
  cache,
}: {
  name: string;
  octokit: InstanceType<typeof Octokit>;
  operationName: string;
  owner: string;
  pullNumber: string;
  cache: CacheData;
}) => {
  try {
    let clientPages = pageCaches.get(octokit);
    if (!clientPages) {
      clientPages = new Map();
      pageCaches.set(octokit, clientPages);
    }
    const key = `${owner}/${name}/${pullNumber}`;
    const oldPages = clientPages.get(key) || [];
    const pages: ReviewPage[] = [];
    for (let page = 1; ; page++) {
      const old = oldPages[page - 1];
      let value: ReviewPage;
      try {
        const response = await octokit.rest.pulls.listReviews({
          owner,
          repo: name,
          pull_number: parseInt(pullNumber),
          per_page: 100,
          page,
          headers: {
            "x-operation-name": operationName,
            ...(old?.etag ? { "if-none-match": old.etag } : {}),
          },
        });
        value = {
          data: response.data.map((review) => ({
            ...review,
            commit_id: review.commit_id ?? "",
          })),
          etag: response.headers.etag,
          next: /rel="next"/.test(response.headers.link || ""),
        };
      } catch (error) {
        if ((error as { status?: number }).status !== 304 || !old) throw error;
        const headers = (
          error as { response?: { headers?: Record<string, string> } }
        ).response?.headers;
        value = {
          ...old,
          etag: headers?.etag ?? old.etag,
          // An unchanged page body can still acquire a new following page.
          // Without Link, probe beyond a full page rather than hide new reviews.
          next:
            headers?.link !== undefined
              ? /rel="next"/.test(headers.link)
              : old.next || old.data.length === 100,
        };
      }
      pages.push(value);
      if (!value.next) break;
    }
    clientPages.set(key, pages);
    // Commit only complete responses, including empty arrays and all pages.
    cache.reviewPerRepoPerPullNumber = {
      ...cache.reviewPerRepoPerPullNumber,
      [name]: {
        ...cache.reviewPerRepoPerPullNumber[name],
        [pullNumber]: pages.flatMap((page) => page.data),
      },
    };
  } catch (error) {
    const httpError = error as { status?: number };
    if (httpError.status === 304) {
      // Don't do anything, we already handle 304 in the after hook
      Logger.log(`[PullRequests] pullsListReviewsQuery not modified (304)`);
    } else if (httpError.status === 404) {
      Logger.log(`[PullRequests] pullsListReviewsQuery probably deleted (404)`);
    } else if (httpError.status === 403) {
      Logger.log(
        `[PullRequests] pullsListReviewsQuery forbidden (403) - likely insufficient repo access`,
      );

      if (isPATAuth()) {
        ipcMain.emit(
          "dispatch-authentication-invalid-PAT",
          null,
          "Check PAT - Pull Request Access Denied",
        );
      }

      // Treat as "no PR review data available" and don't rethrow
    } else {
      Logger.error(error);
      throw error;
    }
  }
};
