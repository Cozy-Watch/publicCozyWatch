import type {
  ListCommentsData,
  PullListReview,
  PullRequestList,
} from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { mentionKeyForPullRequest, type LatestMention } from "./getLatestMentions";

interface GetRelevantTeamPullRequestsParams {
  comments: Record<string, Record<string, ListCommentsData>>;
  pullRequests: PullRequestList;
  reviews: Record<string, Record<string, PullListReview>>;
  mentionedPullRequests?: ReadonlyMap<string, LatestMention>;
  user: {
    id: number;
    login: string;
  };
}

const isMentioned = (body: string | null | undefined, login: string) => {
  return new RegExp(`@${login}(?![a-zA-Z0-9_-])`, "i").test(body ?? "");
};

export const isMyPullRequest = (
  pullRequest: PullRequestList[0],
  userId: number,
) => {
  return (
    pullRequest.user?.id === userId ||
    pullRequest.assignees?.some(({ id }) => id === userId)
  );
};

export const getRelevantTeamPullRequests = ({
  comments,
  pullRequests,
  reviews,
  mentionedPullRequests,
  user,
}: GetRelevantTeamPullRequestsParams) => {
  return pullRequests.filter((pullRequest) => {
    if (isMyPullRequest(pullRequest, user.id)) {
      return false;
    }

    if (pullRequest.requested_reviewers?.some(({ id }) => id === user.id)) {
      return true;
    }

    if (mentionedPullRequests?.has(mentionKeyForPullRequest(pullRequest))) {
      return true;
    }

    const repositoryName = pullRequest.base.repo.name;
    const reviewsForPullRequest =
      reviews[repositoryName]?.[pullRequest.number] ?? [];

    if (reviewsForPullRequest.some((review) => review.user?.id === user.id)) {
      return true;
    }

    for (const commentsPage of Object.values(
      comments[repositoryName] ?? {},
    )) {
      for (const comment of commentsPage) {
        if (
          Number(comment.pullNumber) === pullRequest.number &&
          (comment.user?.id === user.id ||
            isMentioned(comment.body, user.login))
        ) {
          return true;
        }
      }
    }

    return false;
  });
};
