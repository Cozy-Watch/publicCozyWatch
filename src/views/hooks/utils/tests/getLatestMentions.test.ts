import type {
  CacheData,
  PullRequestList,
  ReviewComment,
} from "../../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { createEmptyCache } from "../../../../mainProcess/api/PullRequests/utils/tests/mocks/syntheticCache.mock";
import {
  getLatestMentions,
  isRecentMention,
  mentionKeyForPullRequest,
  MENTION_WINDOW_MS,
} from "../getLatestMentions";

const user = { id: 7, login: "tiago" };
const now = Date.parse("2026-09-28T12:00:00Z");
const pr = (repository: string, number: number) => ({
  number,
  base: { repo: { name: repository.split("/")[1], full_name: repository } },
}) as PullRequestList[number];

const issueComment = (
  repository: string,
  number: number,
  body: string,
  id: number,
  timestamp: number,
  authorId = 9,
) => ({
  body,
  id,
  user: { id: authorId, login: authorId === user.id ? user.login : "reviewer" },
  issue_url: `https://api.github.com/repos/${repository}/issues/${number}`,
  html_url: `https://github.com/${repository}/pull/${number}#issuecomment-${id}`,
  created_at: new Date(timestamp).toISOString(),
  updated_at: new Date(timestamp).toISOString(),
});

describe("latest PR mentions", () => {
  it("matches the exact username, excludes self, and keeps repositories separate", () => {
    const cache = createEmptyCache();
    cache.flatPullRequests = [pr("one/app", 4), pr("two/app", 4)];
    cache.mentions = {
      app: {
        "4_1": [
          issueComment("one/app", 4, "@tiago-old", 1, now - 1000),
          issueComment("one/app", 4, "@TIAGO can you look?", 2, now - 3000),
          issueComment("one/app", 4, "@tiago self", 3, now - 500, user.id),
          issueComment("two/app", 4, "@tiago second repo", 4, now - 2000),
        ],
      },
    } as unknown as CacheData["mentions"];

    const mentions = getLatestMentions(cache, user);
    expect(mentions.get(mentionKeyForPullRequest(cache.flatPullRequests[0]))?.url)
      .toBe("https://github.com/one/app/pull/4#issuecomment-2");
    expect(mentions.get(mentionKeyForPullRequest(cache.flatPullRequests[1]))?.url)
      .toBe("https://github.com/two/app/pull/4#issuecomment-4");
  });

  it("selects the newest direct link across conversation, review, and inline comments", () => {
    const cache = createEmptyCache();
    const pull = pr("one/app", 4);
    cache.flatPullRequests = [pull];
    cache.mentions = { app: { "4_1": [issueComment("one/app", 4, "@tiago", 1, now - 5000)] } } as unknown as CacheData["mentions"];
    cache.reviewPerRepoPerPullNumber = {
      app: {
        4: [{
          body: "@tiago please check this",
          user: { id: 10, login: "reviewer-two" },
          submitted_at: new Date(now - 3000).toISOString(),
          html_url: "https://github.com/one/app/pull/4#pullrequestreview-2",
        }],
      },
    } as unknown as CacheData["reviewPerRepoPerPullNumber"];
    cache.reviewCommentsPerRepo = {
      "one/app": [{
        body: "@tiago latest inline note",
        user: { id: 11, login: "reviewer-three" },
        pull_request_url: "https://api.github.com/repos/one/app/pulls/4",
        html_url: "https://github.com/one/app/pull/4#discussion_r3",
        created_at: new Date(now - 2000).toISOString(),
        updated_at: new Date(now - 2000).toISOString(),
      } as ReviewComment],
    };

    expect(getLatestMentions(cache, user).get(mentionKeyForPullRequest(pull)))
      .toEqual({
        author: "reviewer-three",
        timestamp: now - 2000,
        url: "https://github.com/one/app/pull/4#discussion_r3",
      });
  });

  it("expires at exactly 24 hours", () => {
    const mention = { author: "reviewer", timestamp: now, url: "https://github.com/one/app/pull/4#issuecomment-1" };
    expect(isRecentMention(mention, now + MENTION_WINDOW_MS - 1)).toBe(true);
    expect(isRecentMention(mention, now + MENTION_WINDOW_MS)).toBe(false);
  });
});
