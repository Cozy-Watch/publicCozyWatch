/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { Theme } from "@radix-ui/themes";
import type { PullRequestList } from "../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { MENTION_WINDOW_MS } from "../../hooks/utils/getLatestMentions";
import { PullRequestCard } from "./PullRequestsCard";

const now = Date.parse("2026-09-28T12:00:00Z");
const mentionUrl = "https://github.com/one/app/pull/4#discussion_r3";
const openExternalLink = jest.fn<(url: string) => Promise<void>>();
let container: HTMLDivElement;
let root: Root;

const pullRequest = {
  number: 4,
  title: "Update app",
  html_url: "https://github.com/one/app/pull/4",
  updated_at: new Date(now).toISOString(),
  draft: false,
  base: { ref: "main", repo: { name: "app", full_name: "one/app", owner: { login: "one" } } },
  head: { ref: "feature", repo: { name: "app" } },
  user: { login: "author", avatar_url: "" },
  requested_reviewers: [],
  assignees: [],
  labels: [],
} as unknown as PullRequestList[number];

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(now);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(window, { electronAPI: { openExternalLink } });
  openExternalLink.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

it.each([false, true])("shows a direct mention link in %s compact mode and expires it", async (isCompact) => {
  await act(async () => {
    root.render(
      <Theme>
        <PullRequestCard
          isCompact={isCompact}
          pullRequest={pullRequest}
          waitingReviews={0}
          title={pullRequest.title}
          htmlUrl={pullRequest.html_url}
          baseBranchName="main"
          branchName="feature"
          repositoryName="app"
          updatedAt={pullRequest.updated_at}
          actionsByName={{}}
          pullRequestLink={pullRequest.html_url}
          labels={[]}
          latestMention={{ author: "reviewer", timestamp: now - 1000, url: mentionUrl }}
        />
      </Theme>,
    );
  });

  expect(container.querySelector(".pr-card")?.getAttribute("data-density"))
    .toBe(isCompact ? "compact" : "standard");
  const link = container.querySelector("a.pr-card-mention");
  expect(link?.getAttribute("href")).toBe(mentionUrl);
  await act(async () => {
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  expect(openExternalLink).toHaveBeenCalledWith(mentionUrl);

  await act(async () => {
    jest.advanceTimersByTime(MENTION_WINDOW_MS - 1000);
  });
  expect(container.querySelector("a.pr-card-mention")).toBeNull();
});
