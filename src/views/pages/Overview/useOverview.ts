import dayjs from "dayjs";
import { useMemo } from "react";
import { PullsActions } from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { usePullRequestQuery } from "../../api/usePullRequestQuery";
import { useRepositoriesQuery } from "../../api/useRepositoriesQuery";
import { useHeader } from "../Header/useHeader";
import { getReviewsGroupedByUser } from "../../hooks/utils/getReviewsGroupedByUser";
import { orderPullRequestsByLatestFeedback } from "../../hooks/utils/sortPullRequestsByLatestFeedback";
import { getLatestMentions, mentionKeyForPullRequest } from "../../hooks/utils/getLatestMentions";

export const useOverView = () => {
  const headerQueryInfo = useHeader();
  const pullRequestesQueryInfo = usePullRequestQuery();
  const repositoriesQueryInfo = useRepositoriesQuery();

  const data = useMemo(() => {
    if (
      !pullRequestesQueryInfo.data ||
      !headerQueryInfo.data?.id || !headerQueryInfo.data?.login ||
      !repositoriesQueryInfo.data
    ) {
      return null;
    }

    const startOfWeek = dayjs().startOf("week").add(1, "day"); // Monday

    const { flatPullRequests, reviewPerRepoPerPullNumber, actionsPerRepo } =
      pullRequestesQueryInfo.data;
    const latestMentions = getLatestMentions(pullRequestesQueryInfo.data, {
      id: headerQueryInfo.data.id,
      login: headerQueryInfo.data.login,
    });

    const { activeRepositories } = repositoriesQueryInfo.data || {};

    const activeFlatPullRequests = flatPullRequests.filter((pr) => {
      return activeRepositories ? activeRepositories[pr.base.repo.id] : true;
    });

    const reviews = reviewPerRepoPerPullNumber;
    const actionsList = actionsPerRepo;

    const thisWeeksPullRequests = activeFlatPullRequests.filter((pr) => {
      const prDate = dayjs(pr.created_at);
      return prDate.isAfter(startOfWeek) || prDate.isSame(startOfWeek, "day");
    });

    const { pullRequests: sortedPullRequests, latestFeedbackAtByPullRequest } = orderPullRequestsByLatestFeedback(
      thisWeeksPullRequests,
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

      const pendingReviews = (pr?.requested_reviewers || []).map(
        (reviewer) => {
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
        },
      );

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
        labels: pr.labels,
        latestFeedbackAt: latestFeedbackAtByPullRequest.get(pr) || undefined,
        latestMention: latestMentions.get(mentionKeyForPullRequest(pr)),
        assignees,
      };
    });

    return pullRequeststData;
  }, [
    pullRequestesQueryInfo.data,
    headerQueryInfo.data,
    repositoriesQueryInfo.data,
  ]);

  return {
    ...headerQueryInfo,
    ...pullRequestesQueryInfo,
    ...repositoriesQueryInfo,
    isFetching:
      headerQueryInfo.isFetching ||
      pullRequestesQueryInfo.isFetching ||
      repositoriesQueryInfo.isFetching,
    error:
      headerQueryInfo.error ||
      pullRequestesQueryInfo.error ||
      repositoriesQueryInfo.error,
    data,
  };
};
