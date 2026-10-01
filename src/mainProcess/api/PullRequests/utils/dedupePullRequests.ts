import type { PullRequestList } from "./getDefaultData";

export const dedupePullRequests = (pullRequests: PullRequestList) => {
  const pullRequestsById = new Map<number, PullRequestList[number]>();

  for (const pullRequest of pullRequests) {
    const current = pullRequestsById.get(pullRequest.id);
    const parsedCurrentUpdatedAt = current
      ? Date.parse(current.updated_at)
      : Number.NEGATIVE_INFINITY;
    const currentUpdatedAt = Number.isFinite(parsedCurrentUpdatedAt)
      ? parsedCurrentUpdatedAt
      : Number.NEGATIVE_INFINITY;
    const nextUpdatedAt = Date.parse(pullRequest.updated_at);

    if (
      !current ||
      (Number.isFinite(nextUpdatedAt) && nextUpdatedAt > currentUpdatedAt)
    ) {
      pullRequestsById.set(pullRequest.id, pullRequest);
    }
  }

  return [...pullRequestsById.values()];
};
