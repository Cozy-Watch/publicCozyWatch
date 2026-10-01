import type {
  CacheData,
  ExtendedComment,
  PullListReview,
  PullRequestList,
  PullsActions,
} from "../../getDefaultData";

export const SYNTHETIC_REPOSITORY_NAME = "synthetic-repository";
export const SYNTHETIC_USER_ID = 7;
export const SYNTHETIC_USERNAME = "synthetic-user";

type PullRequestContract = {
  base: {
    repo: {
      name: string;
    };
  };
  id: number;
  number: number;
  html_url: string;
  user: { id: number } | null;
  assignees: Array<{ id: number }>;
  requested_reviewers: Array<{ id: number }>;
};

type ReviewContract = {
  id: number;
  state: string;
  submitted_at: string;
  html_url: string;
  user: {
    id: number;
    login: string;
    type: string;
  } | null;
};

type WorkflowRunContract = {
  id: number;
  name: string | null;
  conclusion: "failure" | "success";
  created_at: string;
  updated_at: string;
  pull_requests: Array<{ id: number }>;
};

export const createEmptyCache = (): CacheData => ({
  etagPerRepo: {},
  pullRequestsPerRepo: {},
  reviewPerRepoPerPullNumber: {},
  actionsPerRepo: {},
  pullRequestAddedOrRemoved: { added: [], removed: [] },
  reviewUpdateList: { newReview: [], reviewChanged: [] },
  CIStatusUpdatePerRepo: {},
  mentions: {},
  reviewCommentsPerRepo: {},
  flatPullRequests: [],
});

const createPullRequest = ({
  assigneeIds = [],
  authorId,
  id,
  number,
  requestedReviewerIds = [],
}: {
  assigneeIds?: number[];
  authorId: number;
  id: number;
  number: number;
  requestedReviewerIds?: number[];
}) => {
  const pullRequest = {
    base: {
      repo: {
        name: SYNTHETIC_REPOSITORY_NAME,
      },
    },
    id,
    number,
    html_url: `https://github.com/synthetic-org/${SYNTHETIC_REPOSITORY_NAME}/pull/${number}`,
    user: { id: authorId },
    assignees: assigneeIds.map((assigneeId) => ({ id: assigneeId })),
    requested_reviewers: requestedReviewerIds.map((reviewerId) => ({
      id: reviewerId,
    })),
  } satisfies PullRequestContract;

  return pullRequest as PullRequestList[0];
};

const createReview = ({
  id,
  prNumber,
  reviewerId,
  state,
  submittedAt,
}: {
  id: number;
  prNumber: number;
  reviewerId: number;
  state: string;
  submittedAt: string;
}) => {
  const review = {
    id,
    state,
    submitted_at: submittedAt,
    html_url: `https://github.com/synthetic-org/${SYNTHETIC_REPOSITORY_NAME}/pull/${prNumber}#pullrequestreview-${id}`,
    user: {
      id: reviewerId,
      login: `reviewer-${reviewerId}`,
      type: "User",
    },
  } satisfies ReviewContract;

  return review as PullListReview[0];
};

const createWorkflowRun = ({
  conclusion,
  id,
  name,
  pullRequestId,
  updatedAt,
}: {
  conclusion: "failure" | "success";
  id: number;
  name: string | null;
  pullRequestId: number;
  updatedAt: string;
}) => {
  const run = {
    id,
    name,
    conclusion,
    created_at: updatedAt,
    updated_at: updatedAt,
    pull_requests: [{ id: pullRequestId }],
  } satisfies WorkflowRunContract;

  return run as PullsActions[0];
};

export const createSyntheticComment = ({
  body,
  id,
  pullNumber,
}: {
  body: string;
  id: number;
  pullNumber: string;
}): ExtendedComment => ({
  author_association: "COLLABORATOR",
  body,
  created_at: "2026-01-03T00:00:00Z",
  html_url: `https://github.com/synthetic-org/${SYNTHETIC_REPOSITORY_NAME}/pull/${pullNumber}#issuecomment-${id}`,
  id,
  issue_url: `https://api.github.com/repos/synthetic-org/${SYNTHETIC_REPOSITORY_NAME}/issues/${pullNumber}`,
  node_id: `synthetic-comment-${id}`,
  performed_via_github_app: null,
  pullNumber,
  reactions: {
    "+1": 0,
    "-1": 0,
    confused: 0,
    eyes: 0,
    heart: 0,
    hooray: 0,
    laugh: 0,
    rocket: 0,
    total_count: 0,
    url: `https://api.github.com/repos/synthetic-org/${SYNTHETIC_REPOSITORY_NAME}/issues/comments/${id}/reactions`,
  },
  updated_at: "2026-01-03T00:00:00Z",
  url: `https://api.github.com/repos/synthetic-org/${SYNTHETIC_REPOSITORY_NAME}/issues/comments/${id}`,
  user: {
    avatar_url: "https://avatars.githubusercontent.com/u/99?v=4",
    events_url: "https://api.github.com/users/synthetic-reviewer/events{/privacy}",
    followers_url: "https://api.github.com/users/synthetic-reviewer/followers",
    following_url:
      "https://api.github.com/users/synthetic-reviewer/following{/other_user}",
    gists_url: "https://api.github.com/users/synthetic-reviewer/gists{/gist_id}",
    gravatar_id: "",
    html_url: "https://github.com/synthetic-reviewer",
    id: 99,
    login: "synthetic-reviewer",
    node_id: "synthetic-user-99",
    organizations_url: "https://api.github.com/users/synthetic-reviewer/orgs",
    received_events_url:
      "https://api.github.com/users/synthetic-reviewer/received_events",
    repos_url: "https://api.github.com/users/synthetic-reviewer/repos",
    site_admin: false,
    starred_url:
      "https://api.github.com/users/synthetic-reviewer/starred{/owner}{/repo}",
    subscriptions_url:
      "https://api.github.com/users/synthetic-reviewer/subscriptions",
    type: "User",
    url: "https://api.github.com/users/synthetic-reviewer",
  },
});

export const createSyntheticCacheFixture = () => {
  const pullRequests = {
    existing: createPullRequest({
      authorId: SYNTHETIC_USER_ID,
      id: 101,
      number: 1,
    }),
    added: createPullRequest({
      authorId: SYNTHETIC_USER_ID,
      id: 102,
      number: 2,
    }),
    assigned: createPullRequest({
      assigneeIds: [SYNTHETIC_USER_ID],
      authorId: 8,
      id: 103,
      number: 3,
    }),
    reviewRequested: createPullRequest({
      authorId: 8,
      id: 104,
      number: 4,
      requestedReviewerIds: [SYNTHETIC_USER_ID],
    }),
    unrelated: createPullRequest({
      assigneeIds: [9],
      authorId: 8,
      id: 105,
      number: 5,
      requestedReviewerIds: [9],
    }),
  };

  const reviews = {
    initialReviewer20Older: createReview({
      id: 200,
      prNumber: 1,
      reviewerId: 20,
      state: "COMMENTED",
      submittedAt: "2026-01-01T00:00:00Z",
    }),
    initialReviewer20Latest: createReview({
      id: 201,
      prNumber: 1,
      reviewerId: 20,
      state: "CHANGES_REQUESTED",
      submittedAt: "2026-01-02T00:00:00Z",
    }),
    finalReviewer20Older: createReview({
      id: 205,
      prNumber: 1,
      reviewerId: 20,
      state: "COMMENTED",
      submittedAt: "2026-01-02T12:00:00Z",
    }),
    finalReviewer20Latest: createReview({
      id: 202,
      prNumber: 1,
      reviewerId: 20,
      state: "APPROVED",
      submittedAt: "2026-01-03T00:00:00Z",
    }),
    newReviewer30: createReview({
      id: 203,
      prNumber: 1,
      reviewerId: 30,
      state: "COMMENTED",
      submittedAt: "2026-01-03T00:00:00Z",
    }),
    newReviewer40: createReview({
      id: 204,
      prNumber: 2,
      reviewerId: 40,
      state: "APPROVED",
      submittedAt: "2026-01-03T00:00:00Z",
    }),
    unchangedReviewer50Initial: createReview({
      id: 206,
      prNumber: 1,
      reviewerId: 50,
      state: "APPROVED",
      submittedAt: "2026-01-02T00:00:00Z",
    }),
    unchangedReviewer50Final: createReview({
      id: 207,
      prNumber: 1,
      reviewerId: 50,
      state: "APPROVED",
      submittedAt: "2026-01-03T00:00:00Z",
    }),
    unrelatedPullRequest: createReview({
      id: 208,
      prNumber: 5,
      reviewerId: 60,
      state: "APPROVED",
      submittedAt: "2026-01-03T00:00:00Z",
    }),
  };

  const workflowRuns = {
    initialBuildOlder: createWorkflowRun({
      conclusion: "success",
      id: 301,
      name: "build",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-01T00:00:00Z",
    }),
    initialBuildLatest: createWorkflowRun({
      conclusion: "failure",
      id: 302,
      name: "build",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-02T00:00:00Z",
    }),
    finalBuildOlder: createWorkflowRun({
      conclusion: "failure",
      id: 303,
      name: "build",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-02T12:00:00Z",
    }),
    finalBuildLatest: createWorkflowRun({
      conclusion: "success",
      id: 304,
      name: "build",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-03T00:00:00Z",
    }),
    initialLint: createWorkflowRun({
      conclusion: "success",
      id: 305,
      name: "lint",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-02T00:00:00Z",
    }),
    finalLint: createWorkflowRun({
      conclusion: "success",
      id: 306,
      name: "lint",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-03T00:00:00Z",
    }),
    finalOnly: createWorkflowRun({
      conclusion: "success",
      id: 307,
      name: "new-check",
      pullRequestId: pullRequests.existing.id,
      updatedAt: "2026-01-03T00:00:00Z",
    }),
    unrelated: createWorkflowRun({
      conclusion: "failure",
      id: 308,
      name: "unrelated",
      pullRequestId: pullRequests.unrelated.id,
      updatedAt: "2026-01-03T00:00:00Z",
    }),
  };

  const comments = {
    existing: createSyntheticComment({
      body: `Existing mention for @${SYNTHETIC_USERNAME}`,
      id: 401,
      pullNumber: "1",
    }),
    added: createSyntheticComment({
      body: `Please review, @${SYNTHETIC_USERNAME}`,
      id: 402,
      pullNumber: "2",
    }),
    prefixOnly: createSyntheticComment({
      body: `@${SYNTHETIC_USERNAME}-bot is not the requested user`,
      id: 403,
      pullNumber: "2",
    }),
  };

  const initialCache = createEmptyCache();
  initialCache.pullRequestsPerRepo[SYNTHETIC_REPOSITORY_NAME] = {
    "1": [pullRequests.existing, pullRequests.assigned],
    "2": [pullRequests.reviewRequested, pullRequests.unrelated],
  };
  initialCache.reviewPerRepoPerPullNumber[SYNTHETIC_REPOSITORY_NAME] = {
    "1": [
      reviews.initialReviewer20Older,
      reviews.initialReviewer20Latest,
      reviews.unchangedReviewer50Initial,
    ],
    "5": [],
  };
  initialCache.actionsPerRepo[SYNTHETIC_REPOSITORY_NAME] = [
    workflowRuns.initialBuildOlder,
    workflowRuns.initialBuildLatest,
    workflowRuns.initialLint,
  ];
  initialCache.mentions[SYNTHETIC_REPOSITORY_NAME] = {
    "1": [comments.existing],
  };

  const finalCache = createEmptyCache();
  finalCache.pullRequestsPerRepo[SYNTHETIC_REPOSITORY_NAME] = {
    "1": [pullRequests.existing, pullRequests.added, pullRequests.assigned],
    "2": [pullRequests.reviewRequested, pullRequests.unrelated],
  };
  finalCache.reviewPerRepoPerPullNumber[SYNTHETIC_REPOSITORY_NAME] = {
    "1": [
      reviews.finalReviewer20Older,
      reviews.finalReviewer20Latest,
      reviews.newReviewer30,
      reviews.unchangedReviewer50Final,
    ],
    "2": [reviews.newReviewer40],
    "5": [reviews.unrelatedPullRequest],
  };
  finalCache.actionsPerRepo[SYNTHETIC_REPOSITORY_NAME] = [
    workflowRuns.finalBuildOlder,
    workflowRuns.finalBuildLatest,
    workflowRuns.finalLint,
    workflowRuns.finalOnly,
    workflowRuns.unrelated,
  ];
  finalCache.mentions[SYNTHETIC_REPOSITORY_NAME] = {
    "1": [comments.existing],
    "2": [comments.added, comments.prefixOnly],
  };

  return {
    comments,
    finalCache,
    initialCache,
    pullRequests,
    reviews,
    workflowRuns,
  };
};
