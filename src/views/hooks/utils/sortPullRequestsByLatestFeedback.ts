import type {
  CacheData,
  PullRequestList,
} from "../../../mainProcess/api/PullRequests/utils/getDefaultData";

type FeedbackCache = Pick<
  CacheData,
  "reviewPerRepoPerPullNumber" | "mentions"
>;

const timestamp = (date?: string | null) => {
  if (!date) return 0;
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : 0;
};

export const orderPullRequestsByLatestFeedback = (
  pullRequests: PullRequestList,
  cache: FeedbackCache,
): {
  pullRequests: PullRequestList;
  latestFeedbackAtByPullRequest: Map<PullRequestList[number], number>;
} => {
  const latestCommentByPull = new Map<string, number>();

  for (const [repository, pages] of Object.entries(cache.mentions)) {
    for (const comments of Object.values(pages)) {
      for (const comment of comments) {
        const key = `${repository}/${comment.pullNumber}`;
        const latest = latestCommentByPull.get(key) ?? 0;
        latestCommentByPull.set(
          key,
          Math.max(latest, timestamp(comment.updated_at ?? comment.created_at)),
        );
      }
    }
  }

  const latestFeedbackAtByPullRequest = new Map(
    pullRequests.map((pr) => {
      const repository = pr.base.repo.name;
      const key = `${repository}/${pr.number}`;
      const reviews = cache.reviewPerRepoPerPullNumber[repository]?.[pr.number] ?? [];
      const feedbackAt = reviews.reduce(
        (latest, review) => Math.max(latest, timestamp(review.submitted_at)),
        latestCommentByPull.get(key) ?? 0,
      );

      return [pr, feedbackAt] as const;
    }),
  );

  const sortedPullRequests = pullRequests
    .map((pr, index) => ({
      pr,
      index,
      feedbackAt: latestFeedbackAtByPullRequest.get(pr) ?? 0,
      updatedAt: timestamp(pr.updated_at),
    }))
    .sort(
      (a, b) =>
        b.feedbackAt - a.feedbackAt ||
        b.updatedAt - a.updatedAt ||
        a.index - b.index,
    )
    .map(({ pr }) => pr);

  return { pullRequests: sortedPullRequests, latestFeedbackAtByPullRequest };
};
