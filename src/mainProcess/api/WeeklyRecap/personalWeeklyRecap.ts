import Logger from "electron-log";
import { getGithubClient } from "../githubClient";
import {
  getPreviousWeekStart,
  getWeekRange,
} from "../../../weeklyRecap/metrics";
import type { PersonalWeeklyRecap } from "../../../weeklyRecap/types";

const OPERATION = "weeklyRecapPersonal";
const PER_PAGE = 100;
const MAX_PAGES = 10;

const searchCount = async (query: string) => {
  const octokit = await getGithubClient();
  const repositories = new Set<string>();
  let total = 0;
  let page = 1;

  while (true) {
    const response = await octokit.rest.search.issuesAndPullRequests({
      q: query,
      per_page: PER_PAGE,
      page,
      headers: { "x-operation-name": OPERATION },
    });

    total = response.data.total_count;
    response.data.items.forEach((item) => {
      repositories.add(item.repository_url);
    });

    if (
      response.data.items.length < PER_PAGE ||
      page * PER_PAGE >= total ||
      page >= MAX_PAGES
    ) {
      break;
    }
    page += 1;
  }

  return { total, repositories };
};

const countSubmittedReviews = async (weekStart: string) => {
  const octokit = await getGithubClient();
  const { start, end } = getWeekRange(weekStart);
  const repositories = new Set<string>();
  let total = 0;
  let page = 1;

  while (true) {
    const response = await octokit.rest.search.issuesAndPullRequests({
      q: "is:pr reviewed-by:@me -author:@me",
      per_page: PER_PAGE,
      page,
      headers: { "x-operation-name": OPERATION },
    });

    const candidatePulls = response.data.items;

    await Promise.all(
      candidatePulls.map(async (item) => {
        if (!item.number || !item.repository_url) {
          return;
        }

        const [, , owner, repo] = new URL(item.repository_url).pathname.split(
          "/",
        );
        if (!owner || !repo) {
          return;
        }

        const reviews = await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: item.number,
          per_page: PER_PAGE,
          headers: { "x-operation-name": OPERATION },
        });

        const matchedReviews = reviews.data.filter((review) => {
          const submittedAt = review.submitted_at;
          if (!submittedAt || review.user?.type !== "User") {
            return false;
          }

          const submitted = new Date(submittedAt);
          return submitted >= start && submitted < end;
        });

        if (matchedReviews.length > 0) {
          total += matchedReviews.length;
          repositories.add(item.repository_url);
        }
      }),
    );

    if (
      candidatePulls.length < PER_PAGE ||
      page * PER_PAGE >= response.data.total_count ||
      page >= MAX_PAGES
    ) {
      break;
    }
    page += 1;
  }

  return { total, repositories };
};

const weekQuery = (weekStart: string) => {
  const { weekEnd } = getWeekRange(weekStart);
  return { from: weekStart, to: weekEnd };
};

export const getPersonalWeeklyRecap = async (
  weekStart: string,
): Promise<PersonalWeeklyRecap> => {
  const startedAt = Date.now();
  const current = weekQuery(weekStart);
  const previousWeekStart = getPreviousWeekStart(weekStart);
  const previous = weekQuery(previousWeekStart);

  const [merged, reviewed, previousMerged] = await Promise.all([
    searchCount(
      `is:pr is:merged author:@me merged:${current.from}..${current.to}`,
    ),
    countSubmittedReviews(weekStart),
    searchCount(
      `is:pr is:merged author:@me merged:${previous.from}..${previous.to}`,
    ),
  ]);

  Logger.info(`[WeeklyRecap] personal recap in ${Date.now() - startedAt}ms`);

  return {
    weekStart,
    weekEnd: current.to,
    mergedCount: merged.total,
    reviewedCount: reviewed.total,
    repositoryCount: merged.repositories.size,
    previousMergedCount: previousMerged.total,
    fetchedAt: new Date().toISOString(),
  };
};
