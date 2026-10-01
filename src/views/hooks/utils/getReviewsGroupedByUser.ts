import { PullListReview } from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { getLatestReviewByUser } from "./getLatestReviewByUser";

export const getReviewsGroupedByUser = (reviews: PullListReview) => {
  const reviewsByUserId = getLatestReviewByUser(reviews);

  const latestReviews = Object.values(reviewsByUserId);

  return latestReviews.reduce((acc, review) => {
    return {
      ...acc,
      [review?.user?.login || review?.user?.id.toString() || "NA"]: {
        body: review.body || "",
        html_url: review.html_url,
        date: review.submitted_at || "",
        state: review.state,
        userAvatar: review?.user?.avatar_url,
        userName: review?.user?.login,
      },
    };
  }, {});
};
