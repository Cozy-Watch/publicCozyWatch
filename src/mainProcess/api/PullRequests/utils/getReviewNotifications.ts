import { tryOpenExternalUrl } from "../../../security/externalUrl";
import type { NotificationTone } from "../../../safeStorage/safeStorage.types";
import type { CacheData } from "./getDefaultData";

const toneForReview = (state: string): NotificationTone => {
  if (state === "APPROVED") return "success";
  if (state === "CHANGES_REQUESTED") return "danger";
  return "neutral";
};

export const getReviewNotifications = (
  changes: CacheData["reviewUpdateList"],
) => [
  ...changes.newReview.map((review) => ({
    title: "New Review",
    type: "review" as const,
    tone: toneForReview(review.state),
    body: `${review.userType === "Bot" ? "bot" : review.login} reviewed "${review.pullRequestData?.title}" and ${review.state === "APPROVED" ? "approved it" : review.state === "COMMENTED" ? "left a comment" : review.state === "DISMISSED" ? "had their review dismissed" : "requested some changes"}.`,
    source: {
      repository: review.pullRequestData?.base.repo.full_name,
      pullNumber: Number(review.prNumber),
      branch: review.pullRequestData?.head.ref,
    },
    url: review.pullRequestData?.html_url ?? review.html_url,
    onClick: () => {
      tryOpenExternalUrl(review.html_url);
    },
  })),
  ...changes.reviewChanged.map((review) => ({
    title: "Updated Review",
    type: "review" as const,
    tone: toneForReview(review.state),
    body:
      review.state === "APPROVED"
        ? `"${review.pullRequestData?.title}" is now approved.`
        : `${review.userType === "Bot" ? "bot" : review.login} reviewed "${review.pullRequestData?.title}" and ${review.state === "COMMENTED" ? "left a comment" : review.state === "DISMISSED" ? "had their review dismissed" : "requested some changes"}.`,
    source: {
      repository: review.pullRequestData?.base.repo.full_name,
      pullNumber: Number(review.prNumber),
      branch: review.pullRequestData?.head.ref,
    },
    url: review.pullRequestData?.html_url ?? review.html_url,
    onClick: () => {
      tryOpenExternalUrl(review.html_url);
    },
  })),
];
