import { jest } from "@jest/globals";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { CacheData } from "../../src/mainProcess/api/PullRequests/utils/getDefaultData";
import type { StoreDataMap } from "../../src/mainProcess/safeStorage/safeStorage.types";
import type { MockGithub } from "./mock-github";

export const emptyCache = (): CacheData => ({
  etagPerRepo: {}, pullRequestsPerRepo: {}, reviewPerRepoPerPullNumber: {}, actionsPerRepo: {},
  pullRequestAddedOrRemoved: { added: [], removed: [] },
  reviewUpdateList: { newReview: [], reviewChanged: [] }, CIStatusUpdatePerRepo: {},
  mentions: {}, reviewCommentsPerRepo: {}, flatPullRequests: [],
});

export const createHarness = async (github: MockGithub) => {
  // A fresh app/client per scenario, but the same singleton is retained across its polls.
  jest.resetModules();
  jest.mocked(globalThis.fetch).mockImplementation(github.fetch);
  const storage = await import("../../src/mainProcess/safeStorage/safeStorage");
  const repositories = github.repositories.map((repo) => ({
    ...repo, description: "Synthetic", url: `https://api.github.com/repos/${repo.owner}/${repo.name}`,
    htmlUrl: `https://github.com/${repo.owner}/${repo.name}`, avatar: "",
  }));
  const values: Partial<StoreDataMap> = {
    access_token: "synthetic-token-not-a-credential", auth_type: "pat",
    user: { id: 1, login: "engineer-1", name: "Synthetic", company: null, avatarUrl: "" },
    active_repositories: Object.fromEntries(repositories.map((repo) => [repo.id, true])),
    repositories_cache: { etagPerPage: { "1": '"synthetic"' }, repositoriesByPage: { "1": repositories } },
    pull_requests_cache: emptyCache(),
  };
  jest.mocked(storage.getData).mockImplementation(async (key) => values[key] ?? null);
  jest.mocked(storage.storeData).mockImplementation(async ({ name, data }) => {
    Object.assign(values, { [name]: structuredClone(data) });
    return true;
  });
  const { ipcMain } = await import("electron");
  const { getGithubClient } = await import("../../src/mainProcess/api/githubClient");
  const { getPullRequests, getPullRequestSnapshot } =
    await import("../../src/mainProcess/api/PullRequests/getPullRequests");
  const sweepReviewDelta = process.env.COZYWATCH_REFRESH_BASELINE ? undefined :
    (await import("../../src/mainProcess/api/PullRequests/queries/reviewDelta")).sweepReviewDelta;
  const { setLocalCache } = await import("../../src/mainProcess/api/PullRequests/utils/getDefaultData");
  const { batchNotificationManager } = await import("../../src/mainProcess/notifications/notificationManager");
  // Exercise real PAT initialization/validation, but exclude setup from per-refresh metrics.
  const client = await getGithubClient();
  let pendingRequests = 0;
  client.hook.wrap("request", async (request, options) => {
    pendingRequests++;
    try { return await request(options); }
    finally { pendingRequests--; }
  });
  const hookBefore = jest.spyOn(client.hook, "before");
  const hookAfter = jest.spyOn(client.hook, "after");
  let publications: { atMs: number; data: CacheData }[] = [];
  const onUpdate = (_event: unknown, data: CacheData) => {
    publications.push({ atMs: performance.now() - github.epoch, data: structuredClone(data) });
  };
  ipcMain.on("dispatch-pull-request-update", onUpdate);

  return {
    client,
    getPullRequests,
    getPullRequestSnapshot,
    values,
    notifications: jest.mocked(batchNotificationManager),
    setCache: setLocalCache,
    async sweep() {
      if (!sweepReviewDelta) throw new Error("Review sweeps are only available in the working tree");
      github.beginMeasurement();
      publications = [];
      const metrics = await sweepReviewDelta();
      return { metrics, publications, samples: [...github.samples], data: await getPullRequestSnapshot() };
    },
    async run(label: string) {
      github.beginMeasurement();
      publications = [];
      const data = await getPullRequests();
      const durationMs = performance.now() - github.epoch;
      const approval = publications.find((entry) => Object.values(entry.data.reviewPerRepoPerPullNumber)
        .some((pulls) => Object.values(pulls).some((reviews) => reviews.some((review) => review.state === "APPROVED"))));
      const requestsByOperation: Record<string, number> = {};
      for (const sample of github.samples) requestsByOperation[sample.operation] = (requestsByOperation[sample.operation] || 0) + 1;
      return {
        data, publications, samples: [...github.samples],
        metrics: {
          label, requests: github.samples.length, requestsByOperation, maxConcurrency: github.maxActive,
          conditionalRequests: github.samples.filter((entry) => entry.conditional).length,
          notModified: github.samples.filter((entry) => entry.status === 304).length,
          responseBytes: github.samples.reduce((sum, entry) => sum + entry.bytes, 0),
          firstPublishedMs: publications[0]?.atMs ?? null,
          approvalPublishedMs: approval?.atMs ?? null, durationMs,
          publications: publications.length, openPulls: data.flatPullRequests.length,
          registeredHooks: hookBefore.mock.calls.length + hookAfter.mock.calls.length,
        },
      };
    },
    async close() {
      // A production Promise.all rejection can leave sibling requests queued in Octokit.
      const deadline = performance.now() + 30000;
      while (pendingRequests > 0 && performance.now() < deadline) await delay(25);
      ipcMain.removeListener("dispatch-pull-request-update", onUpdate);
      hookBefore.mockRestore();
      hookAfter.mockRestore();
      if (github.active !== 0 || pendingRequests !== 0) throw new Error("Harness closed with pending HTTP requests");
      if (github.unexpectedRequests.length) throw new Error(github.unexpectedRequests.join("\n"));
    },
  };
};
