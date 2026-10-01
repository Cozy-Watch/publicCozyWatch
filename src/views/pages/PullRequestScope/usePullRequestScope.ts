import { useMemo } from "react";
import type {
  CacheData,
  PullRequestList,
  PullsActions,
} from "../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { usePullRequestQuery } from "../../api/usePullRequestQuery";
import { useRepositoriesQuery } from "../../api/useRepositoriesQuery";
import { useUserQuery } from "../../api/useUserQuery";
import { getReviewsGroupedByUser } from "../../hooks/utils/getReviewsGroupedByUser";
import { orderPullRequestsByLatestFeedback } from "../../hooks/utils/sortPullRequestsByLatestFeedback";
import { getFullyApproved } from "../../hooks/utils/getFullyApproved";
import { getLatestMentions, mentionKeyForPullRequest, type LatestMention } from "../../hooks/utils/getLatestMentions";
import {
  getRelevantTeamPullRequests,
  isMyPullRequest,
} from "../../hooks/utils/getRelevantTeamPullRequests";

export type PullRequestScope = "my" | "relevant";
export type PullRequestFilter =
  | "all"
  | "fullyApproved"
  | "pendingReviews"
  | "reviewed";

const mapPullRequests = (
  pullRequests: PullRequestList,
  cache: CacheData,
  includeMentionActivity: boolean,
  latestMentions: ReadonlyMap<string, LatestMention>,
 ) => {
  const { pullRequests: sortedPullRequests, latestFeedbackAtByPullRequest } =
    orderPullRequestsByLatestFeedback(pullRequests, cache);

  return sortedPullRequests.flatMap((pullRequest) => {
    if (!pullRequest.head.repo) {
      return [];
    }

    const repositoryName = pullRequest.head.repo.name;
    const reviewsForPullRequest =
      cache.reviewPerRepoPerPullNumber[repositoryName]?.[pullRequest.number] ??
      [];
    const actionsForPullRequest = (cache.actionsPerRepo[repositoryName] ?? []).filter(
      (run) => run.head_sha === pullRequest.head.sha,
    );
    const actionsByName = actionsForPullRequest.reduce(
      (actions: Record<string, PullsActions[0][]>, action) => {
        if (!action.name) {
          return actions;
        }

        return {
          ...actions,
          [action.name]: [...(actions[action.name] ?? []), action],
        };
      },
      {},
    );
    const pendingReviews = (pullRequest.requested_reviewers ?? []).map(
      (reviewer) => ({
        [reviewer.login ?? reviewer.id.toString()]: {
          state: "NO_FEEDBACK",
          userAvatar: reviewer.avatar_url,
          userName: reviewer.login,
          body: "",
          date: "",
        },
      }),
    );
    const reviewActivity = pendingReviews.reduce(
      (activity, review) => ({ ...activity, ...review }),
      getReviewsGroupedByUser(reviewsForPullRequest),
    );
    const mentionActivity = includeMentionActivity
      ? Object.values(cache.mentions[pullRequest.base.repo.name] ?? {})
          .flat()
          .filter((mention) => Number(mention.pullNumber) === pullRequest.number)
          .reduce(
            (activity, mention) => ({
              ...activity,
              [mention.user?.login ?? mention.user?.id.toString() ?? "NA"]: {
                state: "COMMENTED",
                body: mention.body ?? "",
                html_url: mention.html_url,
                userAvatar: mention.user?.avatar_url ?? "",
                userName: mention.user?.login ?? "",
                date: mention.updated_at,
              },
            }),
            reviewActivity,
          )
      : reviewActivity;

    return [
      {
        pr: pullRequest,
        actionByName: actionsByName,
        reviewsAndWaitingReviews: mentionActivity,
        waitingReviews: pendingReviews.length,
        pullRequestUrl: pullRequest.html_url,
        labels: pullRequest.labels,
        latestFeedbackAt:
          latestFeedbackAtByPullRequest.get(pullRequest) || undefined,
        latestMention: latestMentions.get(mentionKeyForPullRequest(pullRequest)),
        assignees: (pullRequest.assignees ?? []).map((assignee) => ({
          login: assignee.login,
          name: assignee.name,
          avatar: assignee.avatar_url,
        })),
      },
    ];
  });
};

export const usePullRequestScope = (
  scope: PullRequestScope,
  filter: PullRequestFilter,
) => {
  const userQuery = useUserQuery();
  const pullRequestsQuery = usePullRequestQuery();
  const repositoriesQuery = useRepositoriesQuery();

  const data = useMemo(() => {
    const cache = pullRequestsQuery.data;
    const user = userQuery.data;
    const repositories = repositoriesQuery.data;

    if (!cache || !user || !repositories) {
      return null;
    }

    const activePullRequests = cache.flatPullRequests.filter(
      (pullRequest) => repositories.activeRepositories[pullRequest.base.repo.id],
    );
    const myPullRequests = activePullRequests.filter((pullRequest) =>
      isMyPullRequest(pullRequest, user.id),
    );
    const latestMentions = getLatestMentions(cache, user);
    const relevantPullRequests = getRelevantTeamPullRequests({
      comments: cache.mentions,
      pullRequests: activePullRequests,
      reviews: cache.reviewPerRepoPerPullNumber,
      user,
      mentionedPullRequests: latestMentions,
    });
    const scopePullRequests =
      scope === "my" ? myPullRequests : relevantPullRequests;
    const fullyApproved = getFullyApproved({
      pullRequests: scopePullRequests,
      reviews: cache.reviewPerRepoPerPullNumber,
    });
    const pendingReviews = scopePullRequests.filter((pullRequest) =>
      scope === "my"
        ? (pullRequest.requested_reviewers?.length ?? 0) > 0
        : pullRequest.requested_reviewers?.some(
            (reviewer) => reviewer.id === user.id,
          ),
    );
    const reviewed = scopePullRequests.filter((pullRequest) => {
      const reviews =
        cache.reviewPerRepoPerPullNumber[pullRequest.base.repo.name]?.[
          pullRequest.number
        ] ?? [];

      return reviews.some((review) =>
        scope === "my"
          ? review.user?.id !== user.id
          : review.user?.id === user.id,
      );
    });
    const filteredPullRequests =
      filter === "fullyApproved"
        ? fullyApproved
        : filter === "pendingReviews"
          ? pendingReviews
          : filter === "reviewed"
            ? reviewed
            : scopePullRequests;

    return {
      cards: mapPullRequests(filteredPullRequests, cache, false, latestMentions),
      counts: {
        all: scopePullRequests.length,
        fullyApproved: fullyApproved.length,
        pendingReviews: pendingReviews.length,
        reviewed: reviewed.length,
      },
    };
  }, [pullRequestsQuery.data, repositoriesQuery.data, scope, filter, userQuery.data]);

  return {
    data,
    error:
      userQuery.error ?? pullRequestsQuery.error ?? repositoriesQuery.error,
    isFetching:
      userQuery.isFetching ||
      pullRequestsQuery.isFetching ||
      repositoriesQuery.isFetching,
  };
};

export const useMentionedPullRequests = () => {
  const userQuery = useUserQuery();
  const pullRequestsQuery = usePullRequestQuery();
  const repositoriesQuery = useRepositoriesQuery();

  const data = useMemo(() => {
    const cache = pullRequestsQuery.data;
    const user = userQuery.data;
    const repositories = repositoriesQuery.data;

    if (!cache || !user || !repositories) {
      return null;
    }

    const activePullRequests = cache.flatPullRequests.filter(
      (pullRequest) => repositories.activeRepositories[pullRequest.base.repo.id],
    );
    const myPullRequests = activePullRequests.filter((pullRequest) =>
      isMyPullRequest(pullRequest, user.id),
    );
    const latestMentions = getLatestMentions(cache, user);
    const relevantPullRequests = getRelevantTeamPullRequests({
      comments: cache.mentions,
      pullRequests: activePullRequests,
      reviews: cache.reviewPerRepoPerPullNumber,
      user,
      mentionedPullRequests: latestMentions,
    });
    const uniqueMentionedPullRequests = Array.from(
      new Map(
        [...myPullRequests, ...relevantPullRequests]
          .filter((pullRequest) =>
            latestMentions.has(mentionKeyForPullRequest(pullRequest)),
          )
          .map((pullRequest) => [pullRequest.id, pullRequest]),
      ).values(),
    );

    return {
      cards: mapPullRequests(uniqueMentionedPullRequests, cache, true, latestMentions),
      count: uniqueMentionedPullRequests.length,
    };
  }, [pullRequestsQuery.data, repositoriesQuery.data, userQuery.data]);

  return {
    data,
    error:
      userQuery.error ?? pullRequestsQuery.error ?? repositoriesQuery.error,
    isFetching:
      userQuery.isFetching ||
      pullRequestsQuery.isFetching ||
      repositoriesQuery.isFetching,
  };
};
