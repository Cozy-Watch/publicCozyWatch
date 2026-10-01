import { Octokit } from "@octokit/rest";
import { Endpoints } from "@octokit/types";
import { after, before } from "../../hooks/hooksCallback";
import { CacheData } from "../utils/getDefaultData";

export type PullsListReview =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews"]["response"];

interface Args {
  octokit: Octokit;
  operationName: string;
  cache: CacheData;
}

export const registerPullListReviews = ({
  octokit,
  operationName,
  cache,
}: Args) => {
  octokit.hook.before(
    "request",
    before({
      name: operationName,
      callback: (options, page) => {
        const urlParts = options.url.split("/");

        const repoName = urlParts[5];
        const pullNumber = urlParts[7];

        if (
          page &&
          (cache.etagPerRepo?.[repoName]?.reviews?.[`${pullNumber}_${page}`] ||
            cache.etagPerRepo?.[repoName]?.reviews?.[page])
        ) {
          options.headers["if-none-match"] =
            cache.etagPerRepo?.[repoName]?.reviews?.[`${pullNumber}_${page}`] ??
            cache.etagPerRepo?.[repoName]?.reviews?.[page];
        }
      },
    })
  );

  octokit.hook.after(
    "request",
    after<PullsListReview["data"]>({
      name: operationName,
      callback: (response, options, page) => {
        const etag = response.headers?.etag;

        if (page) {
          const urlParts = options.url.split("/");
          const repoName = urlParts[5];
          const pullNumber = urlParts[7];

          if (etag) {
            cache.etagPerRepo = {
              ...cache.etagPerRepo,
              [repoName]: {
                ...(cache.etagPerRepo?.[repoName] ?? {}),
                reviews: {
                  ...(cache.etagPerRepo?.[repoName]?.reviews ?? {}),
                  [`${pullNumber}_${page}`]: etag,
                },
              },
            };
          }

          if (response.data.length > 0) {
            cache.reviewPerRepoPerPullNumber = {
              ...cache.reviewPerRepoPerPullNumber,
              [repoName]: {
                ...cache.reviewPerRepoPerPullNumber?.[repoName],
                [pullNumber]: response.data,
              },
            };
          }
        }
      },
    })
  );

  // TODO - CLEAN WHAT WAS DELETED
  // octokit.hook.error(
  //   "request",
  //   error({
  //     name: operationName,
  //     callback: (error, options) => {
  //       if (error.status === 404) {
  //         Logger.error(
  //           `[PullRequests] ${operationName} not found (404) probably deleted`,
  //           options.url
  //         );
  //       }
  //     },
  //   })
  // );
};
