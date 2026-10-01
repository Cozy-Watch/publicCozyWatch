import { useMemo } from "react";
import { useUserQuery } from "../api/useUserQuery";
import { usePullRequestQuery } from "../api/usePullRequestQuery";
import { useRepositoriesQuery } from "../api/useRepositoriesQuery";
import { getFullyApproved } from "./utils/getFullyApproved";
import { getLatestMentions, mentionKeyForPullRequest } from "./utils/getLatestMentions";
import {
  getRelevantTeamPullRequests,
  isMyPullRequest,
} from "./utils/getRelevantTeamPullRequests";

export const usePullRequest = () => {
  const pullRequestesQueryInfo = usePullRequestQuery();
  const repositoriesQueryInfo = useRepositoriesQuery();
  const headerQueryInfo = useUserQuery();

  const data = useMemo(() => {
    if (
      !pullRequestesQueryInfo.data ||
      !headerQueryInfo.data ||
      !repositoriesQueryInfo.data
    ) {
      return null;
    }

    const {
      flatPullRequests,
      mentions: mentionsList,
      reviewPerRepoPerPullNumber: reviews,
    } = pullRequestesQueryInfo.data;

    const { activeRepositories } = repositoriesQueryInfo.data;
    const latestMentions = getLatestMentions(pullRequestesQueryInfo.data, headerQueryInfo.data);

    const flatActiveRepositories = flatPullRequests.filter((pr) => {
      return activeRepositories[pr.base.repo.id];
    });

    const myPullRequests = flatActiveRepositories.filter((pr) => {
      return isMyPullRequest(pr, headerQueryInfo.data.id);
    });

    const teamPullRequests = getRelevantTeamPullRequests({
      comments: mentionsList,
      pullRequests: flatActiveRepositories,
      reviews,
      user: headerQueryInfo.data,
      mentionedPullRequests: latestMentions,
    });

    const waitingReview = myPullRequests.filter((pr) => {
      return (pr?.requested_reviewers?.length || 0) > 0;
    });

    const reviewed = myPullRequests
      .filter((pr) => {
        return pr?.requested_reviewers && pr.requested_reviewers.length === 0;
      })
      .filter((pr) => {
        const repositoryName = pr.head.repo?.name;
        if (!repositoryName) return false;
        const pullNumber = pr.number;

        const reviewsForThisPR = reviews?.[repositoryName]?.[pullNumber] || [];

        return reviewsForThisPR.some((review) => {
          return review.user?.id !== headerQueryInfo.data?.id;
        });
      });

    const mentionsInMyPr = myPullRequests.filter((pr) => {
      return latestMentions.has(mentionKeyForPullRequest(pr));
    });

    const waitingMyReview = teamPullRequests.filter((pr) => {
      return pr?.requested_reviewers?.some(
        (reviewer) => reviewer.id === headerQueryInfo.data.id
      );
    });

    const reviewedByMe = teamPullRequests
      .filter((pr) => {
        return pr?.requested_reviewers && pr.requested_reviewers.length === 0;
      })
      .filter((pr) => {
        const repositoryName = pr.head.repo?.name;
        if (!repositoryName) return false;
        const pullNumber = pr.number;

        const reviewsForThisPR = reviews?.[repositoryName]?.[pullNumber] || [];

        return reviewsForThisPR.some((review) => {
          return review.user?.id === headerQueryInfo.data?.id;
        });
      });

    const mentionsInTeamsPr = teamPullRequests.filter((pr) => {
      return latestMentions.has(mentionKeyForPullRequest(pr));
    });

    const teamFullyApproved = getFullyApproved({
      pullRequests: teamPullRequests,
      reviews: reviews,
    });

    const fullyApproved = getFullyApproved({
      pullRequests: myPullRequests,
      reviews: reviews,
    });

    return {
      myPullRequests,
      teamPullRequests,
      headerData: headerQueryInfo.data,
      waitingReview,
      reviewed,
      waitingMyReview,
      reviewedByMe,
      mentionsInMyPr,
      mentionsInTeamsPr,
      fullyApproved,
      teamFullyApproved,
    };
  }, [
    pullRequestesQueryInfo.data,
    headerQueryInfo.data,
    repositoriesQueryInfo.data,
  ]);

  return {
    ...pullRequestesQueryInfo,
    ...headerQueryInfo,
    ...repositoriesQueryInfo,
    error:
      pullRequestesQueryInfo.error ||
      headerQueryInfo.error ||
      repositoriesQueryInfo.error,
    isFetching:
      pullRequestesQueryInfo.isFetching ||
      headerQueryInfo.isFetching ||
      repositoriesQueryInfo.isFetching,
    data,
  };
};
