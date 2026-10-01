import { useMemo } from "react";
import {
  PullRequestList,
  PullsActions,
} from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { usePullRequestQuery } from "../../../api/usePullRequestQuery";
import { useUserQuery } from "../../../api/useUserQuery";
import { getReviewsGroupedByUser } from "../../../hooks/utils/getReviewsGroupedByUser";
import { orderPullRequestsByLatestFeedback } from "../../../hooks/utils/sortPullRequestsByLatestFeedback";
import { getLatestMentions, mentionKeyForPullRequest } from "../../../hooks/utils/getLatestMentions";

export const useTabs = (pullRequests: PullRequestList) => {
  const pullRequestesQueryInfo = usePullRequestQuery();
  const userQuery = useUserQuery();

  const data = useMemo(() => {
    if (!pullRequestesQueryInfo.data || !userQuery.data) {
      return null;
    }

    const latestMentions = getLatestMentions(pullRequestesQueryInfo.data, userQuery.data);

    const { reviewPerRepoPerPullNumber, actionsPerRepo } =
      pullRequestesQueryInfo.data;

    const reviews = reviewPerRepoPerPullNumber;
    const actionsList = actionsPerRepo;

    const { pullRequests: sortedPullRequests, latestFeedbackAtByPullRequest } = orderPullRequestsByLatestFeedback(
      pullRequests,
      pullRequestesQueryInfo.data,
    );

    const pullRequeststData = sortedPullRequests.map((pr) => {
      const repositoryName = pr.head.repo.name;
      const pullNumber = pr.number;

      const reviewsForThisPR = reviews?.[repositoryName]?.[pullNumber] || [];
      const actionsForThisPr = (actionsList?.[repositoryName] || []).filter(
        (run) => run.head_sha === pr.head.sha,
      );

      const actionByName = actionsForThisPr.reduce(
        (acc: Record<string, PullsActions[0][]>, action) => {
          if (!action.name) return acc;
          return {
            ...acc,
            [action.name]: [...(acc[action.name] || []), action],
          };
        },
        {},
      );

      const pendingReviews = (pr?.requested_reviewers || []).map((reviewer) => {
        const key = reviewer?.login || reviewer?.id.toString();
        return {
          [key]: {
            state: "NO_FEEDBACK",
            userAvatar: reviewer.avatar_url,
            userName: reviewer.login,
            body: "",
            date: "",
          },
        };
      });

      const waitingReviews = pendingReviews.length;

      const reviewsGroupedbyUser = getReviewsGroupedByUser(reviewsForThisPR);

      const reviewsAndWaitingReviews = pendingReviews.reduce(
        (acc, review) => ({ ...acc, ...review }),
        reviewsGroupedbyUser,
      );

      const assignees = (pr.assignees || []).map((assignee) => ({
        login: assignee.login,
        name: assignee.name,
        avatar: assignee.avatar_url,
      }));

      return {
        pr,
        actionByName,
        reviewsAndWaitingReviews,
        waitingReviews,
        pullRequestUrl: pr.html_url,
        assignees,
        latestFeedbackAt: latestFeedbackAtByPullRequest.get(pr) || undefined,
        latestMention: latestMentions.get(mentionKeyForPullRequest(pr)),
      };
    });

    return pullRequeststData;
  }, [pullRequestesQueryInfo.data, pullRequests, userQuery.data]);

  return {
    ...pullRequestesQueryInfo,
    error: pullRequestesQueryInfo.error ?? userQuery.error,
    isFetching: pullRequestesQueryInfo.isFetching || userQuery.isFetching,
    data,
  };
};
