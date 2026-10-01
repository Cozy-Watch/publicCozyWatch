import {
  PullRequestList,
  PullListReview,
} from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { getLatestReviewByUser } from "./getLatestReviewByUser";

interface GetFullyApprovedParams {
  pullRequests: PullRequestList;
  reviews: Record<string, Record<string, PullListReview>>;
}

export const getFullyApproved = ({
  pullRequests,
  reviews,
}: GetFullyApprovedParams) => {
  return pullRequests.filter((pr) => {
    // Exclude closed/merged PRs
    if (pr.state !== "open") {
      return false;
    }
    const repositoryName = pr.head.repo?.name ?? pr.base.repo.name;
    const pullNumber = pr.number;

    const reviewsForThisPR = reviews?.[repositoryName]?.[pullNumber] || [];

    // Filter out bot reviews
    const humanReviews = reviewsForThisPR.filter(
      (review) => review?.user?.type !== "Bot",
    );

    // No human reviews means not approved
    if (humanReviews.length === 0) {
      return false;
    }

    // Get latest review per user (excluding bots)
    const reviewsByUserId = getLatestReviewByUser(humanReviews);

    const latestReviews = Object.values(reviewsByUserId);

    // Check if any human reviewer requested changes
    const hasChangesRequested = latestReviews.some(
      (review) => review.state === "CHANGES_REQUESTED",
    );

    if (hasChangesRequested) {
      return false;
    }

    // Check if all human reviews are approved
    const allApproved = latestReviews.every(
      (review) => review.state === "APPROVED",
    );

    // Optional: also check no pending reviewers (or filter out bot reviewers)
    const humanRequestedReviewers = (pr.requested_reviewers || []).filter(
      (reviewer) => reviewer.type !== "Bot",
    );
    const noPendingHumanReviewers = humanRequestedReviewers.length === 0;

    return allApproved && noPendingHumanReviewers;
  });
};
