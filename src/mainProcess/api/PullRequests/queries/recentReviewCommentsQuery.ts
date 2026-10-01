import type { Octokit } from "@octokit/rest";
import Logger from "electron-log";
import pLimit from "p-limit";
import type { CacheData } from "../utils/getDefaultData";
import type { Repository } from "../../../safeStorage/safeStorage.types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const fetchRecentReviewComments = async (
  octokit: Octokit,
  repositories: Repository[],
  cache: CacheData,
) => {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const limit = pLimit(15);
  const results = await Promise.allSettled(
    repositories.map((repo) => limit(async () => {
      const comments = await octokit.paginate(
        octokit.pulls.listReviewCommentsForRepo,
        {
          owner: repo.owner,
          repo: repo.name,
          since,
          sort: "updated",
          direction: "desc",
          per_page: 100,
        },
      );
      return { repository: `${repo.owner}/${repo.name}`, comments };
    })),
  );

  const next = { ...cache.reviewCommentsPerRepo };
  results.forEach((result, index) => {
    const repository = `${repositories[index].owner}/${repositories[index].name}`;
    if (result.status === "fulfilled") {
      next[repository] = result.value.comments.filter(
        (comment) => Date.parse(comment.updated_at) >= Date.parse(since),
      );
    } else {
      Logger.warn(`[PullRequests] Could not load review comments for ${repository}`, result.reason);
      next[repository] = (next[repository] ?? []).filter(
        (comment) => Date.parse(comment.updated_at) >= Date.parse(since),
      );
    }
  });
  cache.reviewCommentsPerRepo = next;
};
