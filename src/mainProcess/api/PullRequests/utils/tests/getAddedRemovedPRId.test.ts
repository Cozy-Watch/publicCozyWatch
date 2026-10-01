import { getAddedRemovedPRId } from "../getAddedRemovedPRId";
import {
  createSyntheticCacheFixture,
  SYNTHETIC_REPOSITORY_NAME,
  SYNTHETIC_USER_ID,
} from "./mocks/syntheticCache.mock";

describe("getAddedRemovedPRId", () => {
  it("preserves the initial/final cache contract for relevant pull requests", () => {
    const { finalCache, initialCache, pullRequests } =
      createSyntheticCacheFixture();

    expect(
      getAddedRemovedPRId({
        repositoryName: SYNTHETIC_REPOSITORY_NAME,
        initialCache,
        finalCache,
        userId: SYNTHETIC_USER_ID,
      }),
    ).toStrictEqual({
      added: [pullRequests.added.id],
      removed: [],
    });
  });

  it("detects removal across pages for assigned and review-requested users", () => {
    const { finalCache, initialCache, pullRequests } =
      createSyntheticCacheFixture();
    finalCache.pullRequestsPerRepo[SYNTHETIC_REPOSITORY_NAME] = {
      "1": [pullRequests.existing, pullRequests.added],
    };

    expect(
      getAddedRemovedPRId({
        repositoryName: SYNTHETIC_REPOSITORY_NAME,
        initialCache,
        finalCache,
        userId: SYNTHETIC_USER_ID,
      }),
    ).toStrictEqual({
      added: [pullRequests.added.id],
      removed: [pullRequests.assigned.id, pullRequests.reviewRequested.id],
    });
  });

  it("ignores pull requests unrelated to the current user", () => {
    const { finalCache, initialCache } = createSyntheticCacheFixture();

    expect(
      getAddedRemovedPRId({
        repositoryName: SYNTHETIC_REPOSITORY_NAME,
        initialCache,
        finalCache,
        userId: 999,
      }),
    ).toStrictEqual({ added: [], removed: [] });
  });

  it("reports a duplicated pull request only once", () => {
    const { finalCache, initialCache, pullRequests } =
      createSyntheticCacheFixture();
    initialCache.pullRequestsPerRepo[SYNTHETIC_REPOSITORY_NAME] = {
      "1": [pullRequests.existing],
    };
    finalCache.pullRequestsPerRepo[SYNTHETIC_REPOSITORY_NAME] = {
      "1": [pullRequests.existing, pullRequests.added],
      "2": [pullRequests.added],
    };

    expect(
      getAddedRemovedPRId({
        repositoryName: SYNTHETIC_REPOSITORY_NAME,
        initialCache,
        finalCache,
        userId: SYNTHETIC_USER_ID,
      }),
    ).toStrictEqual({ added: [pullRequests.added.id], removed: [] });
  });
});
