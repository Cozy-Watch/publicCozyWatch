import type { PullRequestList } from "../getDefaultData";
import { dedupePullRequests } from "../dedupePullRequests";

const pullRequest = (
  id: number,
  updatedAt: string,
  title: string,
): PullRequestList[number] =>
  ({ id, updated_at: updatedAt, title }) as PullRequestList[number];

describe("dedupePullRequests", () => {
  it("keeps one copy of each pull request and retains the newest cached copy", () => {
    const first = pullRequest(1, "2026-09-30T10:00:00Z", "Older title");
    const second = pullRequest(2, "2026-09-30T11:00:00Z", "Another PR");
    const refreshed = pullRequest(1, "2026-09-30T12:00:00Z", "Latest title");

    const result = dedupePullRequests([first, second, refreshed]);

    expect(result).toHaveLength(2);
    expect(result.find(({ id }) => id === 1)).toBe(refreshed);
  });
});
