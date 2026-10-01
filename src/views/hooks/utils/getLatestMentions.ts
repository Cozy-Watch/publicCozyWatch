import type {
  CacheData,
  PullRequestList,
} from "../../../mainProcess/api/PullRequests/utils/getDefaultData";

export interface LatestMention {
  author: string;
  timestamp: number;
  url: string;
}

export const MENTION_WINDOW_MS = 24 * 60 * 60 * 1000;

const mentionPattern = (login: string) =>
  new RegExp(`@${login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zA-Z0-9_-])`, "i");

const key = (repository: string, number: number) =>
  `${repository.toLowerCase()}/${number}`;

export const mentionKeyForPullRequest = (pr: PullRequestList[number]) =>
  key(pr.base.repo.full_name, pr.number);

const repositoryAndNumber = (url: string, kind: "issues" | "pulls" | "pull") => {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const offset = parts[0] === "repos" ? 1 : 0;
    if (parts[offset + 2] !== kind) return null;
    const number = Number(parts[offset + 3]);
    if (!parts[offset] || !parts[offset + 1] || !Number.isInteger(number)) return null;
    return key(`${parts[offset]}/${parts[offset + 1]}`, number);
  } catch {
    return null;
  }
};

export const isRecentMention = (mention: LatestMention | undefined, now: number) =>
  !!mention && mention.timestamp <= now && now - mention.timestamp < MENTION_WINDOW_MS;

export const getLatestMentions = (
  cache: CacheData,
  user: { id: number; login: string },
) => {
  const latest = new Map<string, LatestMention>();
  const pattern = mentionPattern(user.login);

  const add = (
    prKey: string | null,
    body: string | null | undefined,
    author: { id?: number; login?: string } | null | undefined,
    date: string | null | undefined,
    url: string | null | undefined,
  ) => {
    if (!prKey || !body || !url || !date || !pattern.test(body)) return;
    if (author?.id === user.id || author?.login?.toLowerCase() === user.login.toLowerCase()) return;
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp)) return;
    const previous = latest.get(prKey);
    if (!previous || timestamp > previous.timestamp) {
      latest.set(prKey, {
        author: author?.login ?? "Someone",
        timestamp,
        url,
      });
    }
  };

  for (const pages of Object.values(cache.mentions ?? {})) {
    for (const comments of Object.values(pages)) {
      for (const comment of comments) {
        add(
          repositoryAndNumber(comment.issue_url, "issues"),
          comment.body,
          comment.user,
          comment.updated_at ?? comment.created_at,
          comment.html_url,
        );
      }
    }
  }

  for (const pulls of Object.values(cache.reviewPerRepoPerPullNumber ?? {})) {
    for (const reviews of Object.values(pulls)) {
      for (const review of reviews) {
        add(
          repositoryAndNumber(review.html_url, "pull"),
          review.body,
          review.user,
          review.submitted_at,
          review.html_url,
        );
      }
    }
  }

  for (const comments of Object.values(cache.reviewCommentsPerRepo ?? {})) {
    for (const comment of comments) {
      add(
        repositoryAndNumber(comment.pull_request_url, "pulls"),
        comment.body,
        comment.user,
        comment.updated_at ?? comment.created_at,
        comment.html_url,
      );
    }
  }

  return latest;
};
