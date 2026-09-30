import type {
  CacheData,
  PullRequestList,
} from "../../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { orderPullRequestsByLatestFeedback } from "../sortPullRequestsByLatestFeedback";

const pull = (number: number, repository: string, updatedAt: string) =>
  ({
    id: number,
    number,
    base: { repo: { name: repository } },
    updated_at: updatedAt,
  }) as PullRequestList[0];

it("puts recent feedback first, then falls back to PR updates without changing the input", () => {
  const pulls = [
    pull(1, "app", "2026-09-26T16:00:00Z"),
    pull(2, "app", "2026-09-26T09:00:00Z"),
    pull(3, "app", "2026-09-26T10:00:00Z"),
    pull(1, "other", "2026-09-26T17:00:00Z"),
  ];
  const cache = {
    reviewPerRepoPerPullNumber: {
      app: {
        2: [{ submitted_at: "2026-09-26T12:00:00Z" }],
      },
    },
    mentions: {
      app: {
        "3_1": [
          { pullNumber: "3", updated_at: "2026-09-26T14:00:00Z" },
        ],
      },
    },
  } as unknown as Pick<CacheData, "reviewPerRepoPerPullNumber" | "mentions">;

  const { pullRequests: sorted, latestFeedbackAtByPullRequest } =
    orderPullRequestsByLatestFeedback(pulls, cache);

  expect(sorted.map(({ base, number }) => `${base.repo.name}/${number}`)).toEqual([
    "app/3",
    "app/2",
    "other/1",
    "app/1",
  ]);
  expect(pulls[0].number).toBe(1);
  expect(sorted).not.toBe(pulls);
  expect(latestFeedbackAtByPullRequest.get(pulls[1])).toBe(
    Date.parse("2026-09-26T12:00:00Z"),
  );
});
