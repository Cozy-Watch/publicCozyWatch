import { describe, expect, jest, test } from "@jest/globals";
import { createHarness, emptyCache } from "./harness";
import { createProfile, pullFixture, reviewFixture } from "./fixtures";
import type { RepositoryFixture } from "./fixtures";
import type {
  CacheData,
  PullRequestList,
  PullListReview,
} from "../../src/mainProcess/api/PullRequests/utils/getDefaultData";
import { MockGithub } from "./mock-github";

const seededCache = (repos: RepositoryFixture[]): CacheData => {
  const cache = emptyCache();
  for (const repo of repos) {
    const pulls = Array.from({ length: repo.openPulls }, (_, i) =>
      pullFixture(repo, i + 1),
    ) as unknown as PullRequestList;
    cache.pullRequestsPerRepo[repo.name] = {};
    for (let i = 0; i < pulls.length; i += 100)
      cache.pullRequestsPerRepo[repo.name][String(i / 100 + 1)] = pulls.slice(
        i,
        i + 100,
      );
    cache.reviewPerRepoPerPullNumber[repo.name] = Object.fromEntries(
      pulls.map((pull) => [
        pull.number,
        Array.from({ length: repo.reviewsPerPull }, (_, i) =>
          reviewFixture(repo, pull.number, i),
        ) as unknown as PullListReview,
      ]),
    );
    cache.flatPullRequests.push(...pulls);
  }
  return cache;
};

const reviewCalls = (samples: MockGithub["samples"]) =>
  samples.filter((s) => s.operation === "review-delta-reviews");

(process.env.COZYWATCH_REFRESH_BASELINE ? describe.skip : describe)(
  "REST review delta using the real Octokit client",
  () => {
    test("reported workload: seven list calls, one changed review, immediate publication and no duplicate full-refresh notification", async () => {
      const github = new MockGithub(createProfile("reported"));
      const h = await createHarness(github);
      try {
        const cold = await h.run("delta/setup");
        h.values.notifications = {
          reviewsUpdateNotification: { value: true },
        } as never;
        const unchanged = await h.sweep();
        expect(
          unchanged.samples.filter((s) => s.operation === "review-delta-list"),
        ).toHaveLength(7);
        expect(reviewCalls(unchanged.samples)).toHaveLength(0);
        expect(unchanged.publications).toHaveLength(0);
        expect(unchanged.metrics.requests).toBe(8); // includes the quota check
        const conditional = await h.sweep();
        expect(
          conditional.samples.filter((s) => s.status === 304),
        ).toHaveLength(7);

        github.approve(github.repositories[0], 1);
        github.touch(github.repositories[0], 1);
        github.requestedReviewers.set("synthetic-company/service-1/1", []);
        h.notifications.mockClear();
        const changed = await h.sweep();
        expect(changed.metrics.requests).toBe(9);
        expect(reviewCalls(changed.samples)).toHaveLength(1);
        expect(changed.publications).toHaveLength(1);
        expect(changed.metrics.publicationLatencyMs).toBeLessThan(2000);
        expect(
          changed.data.reviewPerRepoPerPullNumber["service-1"]["1"][0].state,
        ).toBe("APPROVED");
        expect(
          changed.data.flatPullRequests.find((pr) => pr.number === 1)
            ?.requested_reviewers,
        ).toEqual([]);
        expect(changed.data.flatPullRequests).toHaveLength(208);
        expect(changed.data.actionsPerRepo).toEqual(cold.data.actionsPerRepo);
        expect(changed.data.mentions).toEqual(cold.data.mentions);
        expect(
          h.notifications.mock.calls.flatMap(
            ([notifications]) => notifications,
          ),
        ).toHaveLength(1);
        h.notifications.mockClear();
        await h.run("delta/fallback-after-approval");
        expect(
          h.notifications.mock.calls.flatMap(
            ([notifications]) => notifications,
          ),
        ).toHaveLength(0);
      } finally {
        await h.close();
      }
    });

    test("fallback detects approval when metadata and list ETags do not change", async () => {
      const github = new MockGithub(createProfile("small"));
      const h = await createHarness(github);
      try {
        await h.run("fallback/setup");
        await h.sweep();
        github.approve(github.repositories[0], 1);
        const missed = await h.sweep();
        expect(reviewCalls(missed.samples)).toHaveLength(0);
        expect(
          missed.data.reviewPerRepoPerPullNumber["service-1"]["1"][0].state,
        ).toBe("COMMENTED");
        const reconciled = await h.run("fallback/review-only-change");
        expect(
          reconciled.data.reviewPerRepoPerPullNumber["service-1"]["1"][0].state,
        ).toBe("APPROVED");
      } finally {
        await h.close();
      }
    });

    test("101 changed PRs are deferred deterministically across 304 list responses", async () => {
      const repos = createProfile("small");
      repos[0].openPulls = 101;
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        for (let n = 1; n <= 101; n++) {
          github.touch(repos[0], n);
          github.approve(repos[0], n);
        }
        const first = await h.sweep();
        expect(first.metrics.refreshedPRs).toBe(100);
        expect(first.metrics.deferredPRs).toBe(1);
        expect(
          reviewCalls(first.samples).map((s) => Number(s.path.split("/")[5])),
        ).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
        const second = await h.sweep();
        expect(
          second.samples
            .filter((s) => s.operation === "review-delta-list")
            .every((s) => s.status === 304),
        ).toBe(true);
        expect(reviewCalls(second.samples)).toHaveLength(1);
        expect(reviewCalls(second.samples)[0].path).toContain("/101/reviews");
        expect(second.metrics.deferredPRs).toBe(0);
        expect(second.data.flatPullRequests).toHaveLength(101);
      } finally {
        await h.close();
      }
    });

    test("partial repository and review failures retain queued work and last good reviews", async () => {
      const repos = createProfile("reported");
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        for (const repo of repos.slice(0, 3)) {
          github.touch(repo, 1);
          github.approve(repo, 1);
        }
        github.faults.push({
          path: "/repos/synthetic-company/service-1/pulls",
          page: 2,
          status: 500,
          message: "unavailable",
          remaining: 1,
        });
        github.faults.push({
          path: "/repos/synthetic-company/service-2/pulls/1/reviews",
          status: 500,
          message: "unavailable",
          remaining: 1,
        });
        const failed = await h.sweep();
        expect(failed.metrics.failures).toBe(2);
        expect(
          failed.data.reviewPerRepoPerPullNumber["service-1"]["1"][0].state,
        ).toBe("COMMENTED");
        expect(
          failed.data.reviewPerRepoPerPullNumber["service-2"]["1"][0].state,
        ).toBe("COMMENTED");
        expect(
          failed.data.reviewPerRepoPerPullNumber["service-3"]["1"][0].state,
        ).toBe("APPROVED");
        const recovered = await h.sweep();
        expect(recovered.metrics.refreshedPRs).toBe(2);
        expect(recovered.metrics.deferredPRs).toBe(0);
      } finally {
        await h.close();
      }
    });

    test("all review pages commit atomically; dismissed and deleted reviews replace the previous snapshot", async () => {
      const repos = createProfile("small");
      repos[0].reviewsPerPull = 101;
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        github.touch(repos[0], 1);
        github.approve(repos[0], 1);
        github.faults.push({
          path: "/repos/synthetic-company/service-1/pulls/1/reviews",
          page: 2,
          status: 500,
          message: "failed second page",
          remaining: 1,
        });
        const failed = await h.sweep();
        expect(
          failed.data.reviewPerRepoPerPullNumber["service-1"]["1"].every(
            (r) => r.state === "COMMENTED",
          ),
        ).toBe(true);
        const recovered = await h.sweep();
        expect(
          recovered.data.reviewPerRepoPerPullNumber["service-1"]["1"],
        ).toHaveLength(101);
        expect(
          recovered.data.reviewPerRepoPerPullNumber["service-1"]["1"].every(
            (r) => r.state === "APPROVED",
          ),
        ).toBe(true);
        github.reviewStates.set("synthetic-company/service-1/1", "DISMISSED");
        github.touch(repos[0], 1, "2026-09-01T12:00:02Z");
        expect(
          (await h.sweep()).data.reviewPerRepoPerPullNumber["service-1"]["1"][0]
            .state,
        ).toBe("DISMISSED");
        repos[0].reviewsPerPull = 0;
        github.touch(repos[0], 1, "2026-09-01T12:00:03Z");
        expect(
          (await h.sweep()).data.reviewPerRepoPerPullNumber["service-1"]["1"],
        ).toEqual([]);
      } finally {
        await h.close();
      }
    });

    test("low quota reserves full-refresh capacity; recovery does not lose the change", async () => {
      const repos = createProfile("reported");
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        github.approve(repos[0], 1);
        github.touch(repos[0], 1);
        github.remaining = 600;
        const skipped = await h.sweep();
        expect(skipped.metrics.skipped).toBe("quota-reserved-for-full-refresh");
        expect(skipped.samples).toHaveLength(1);
        expect(skipped.publications).toHaveLength(0);
        github.remaining = 5000;
        expect((await h.sweep()).metrics.refreshedPRs).toBe(1);
      } finally {
        await h.close();
      }
    });

    test.each(["organisation", "stress"] as const)(
      "%s: 1,000/10,000 cached PRs do not trigger per-PR review fanout",
      async (profile) => {
        const repos = createProfile(profile);
        const github = new MockGithub(repos, 0);
        const h = await createHarness(github);
        try {
          h.setCache(seededCache(repos));
          if (profile === "stress") {
            const limited = await h.sweep();
            expect(limited.metrics.skipped).toBe(
              "quota-reserved-for-full-refresh",
            );
            expect(limited.samples).toHaveLength(1);
            // Synthetic capacity only: this is not a claim about a real PAT's quota.
            github.remaining = 100_000;
          }
          github.touch(repos[0], 1);
          github.approve(repos[0], 1);
          const sweep = await h.sweep();
          expect(sweep.metrics.refreshedPRs).toBe(1);
          expect(reviewCalls(sweep.samples)).toHaveLength(1);
          expect(
            sweep.samples.filter((s) => s.operation === "review-delta-list"),
          ).toHaveLength(repos.length);
          expect(sweep.data.flatPullRequests).toHaveLength(
            profile === "stress" ? 10_000 : 1000,
          );
          expect(github.maxActive).toBeLessThanOrEqual(4);
        } finally {
          await h.close();
        }
      },
    );

    test("PAT permission errors preserve cached state and retry without losing a changed PR", async () => {
      const repos = createProfile("small");
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        github.touch(repos[0], 1);
        github.approve(repos[0], 1);
        github.faults.push({
          path: "/repos/synthetic-company/service-1/pulls/1/reviews",
          status: 403,
          message: "Resource not accessible by personal access token",
          remaining: 1,
        });
        const failed = await h.sweep();
        expect(failed.metrics.deferredPRs).toBe(1);
        expect(failed.publications).toHaveLength(0);
        expect((await h.sweep()).metrics.refreshedPRs).toBe(1);
      } finally {
        await h.close();
      }
    });

    test("requested-reviewer change alone triggers a check; old reviews do not erase a re-request", async () => {
      const repos = createProfile("small");
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        github.requestedReviewers.set("synthetic-company/service-1/1", [2, 3]);
        const changed = await h.sweep();
        expect(changed.metrics.refreshedPRs).toBe(1);
        expect(
          changed.data.flatPullRequests[0].requested_reviewers?.map(
            (u) => u.id,
          ),
        ).toEqual([2, 3]);
        const { reconcileRequestedReviewers } =
          await import("../../src/mainProcess/api/PullRequests/queries/reviewDelta");
        const old = changed.data.flatPullRequests[0];
        const review = {
          ...changed.data.reviewPerRepoPerPullNumber["service-1"]["1"][0],
          state: "APPROVED",
          submitted_at: "2026-09-01T12:00:02Z",
        };
        expect(
          reconcileRequestedReviewers(
            old,
            [],
            [review],
          ).requested_reviewers?.map((u) => u.id),
        ).toEqual([3]);
        expect(
          reconcileRequestedReviewers(
            { ...old, updated_at: "2026-09-01T12:00:03Z" },
            [],
            [review],
          ).requested_reviewers?.map((u) => u.id),
        ).toEqual([2, 3]);
      } finally {
        await h.close();
      }
    });

    test("offline transport failures retain data and recover on the next sweep", async () => {
      const repos = createProfile("small");
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        github.touch(repos[0], 1);
        github.approve(repos[0], 1);
        jest
          .mocked(globalThis.fetch)
          .mockRejectedValueOnce(new TypeError("Network unavailable"));
        await expect(h.sweep()).rejects.toThrow();
        expect(
          (await h.getPullRequestSnapshot()).flatPullRequests,
        ).toHaveLength(3);
        expect((await h.sweep()).metrics.refreshedPRs).toBe(1);
      } finally {
        await h.close();
      }
    });

    test.each(["disable", "cancel"] as const)(
      "%s during review I/O prevents stale publication",
      async (action) => {
        const repos = createProfile("small");
        const github = new MockGithub(repos, 0);
        const h = await createHarness(github);
        try {
          h.setCache(seededCache(repos));
          github.touch(repos[0], 1);
          github.approve(repos[0], 1);
          const { refreshCoordinator } =
            await import("../../src/mainProcess/polling/refreshCoordinator");
          h.client.hook.wrap("request", async (request, options) => {
            const response = await request(options);
            if (
              options.headers["x-operation-name"] === "review-delta-reviews"
            ) {
              if (action === "disable")
                h.values.active_repositories = { [repos[0].id]: false };
              else refreshCoordinator.invalidate();
            }
            return response;
          });
          const sweep = await h.sweep();
          expect(sweep.publications).toHaveLength(0);
          expect(
            sweep.data.reviewPerRepoPerPullNumber["service-1"]["1"][0].state,
          ).toBe("COMMENTED");
        } finally {
          await h.close();
        }
      },
    );

    test("full refresh waits for the real delta HTTP work and does not send a duplicate approval notification", async () => {
      const repos = createProfile("small");
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await h.run("overlap/setup");
        h.values.notifications = {
          reviewsUpdateNotification: { value: true },
        } as never;
        h.notifications.mockClear();
        github.touch(repos[0], 1);
        github.approve(repos[0], 1);
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });
        h.client.hook.wrap("request", async (request, options) => {
          if (options.headers["x-operation-name"] === "review-delta-reviews") {
            entered();
            await gate;
          }
          return request(options);
        });
        const delta = h.sweep();
        await started;
        const full = h.getPullRequests();
        const manual = h.getPullRequests();
        await Promise.resolve();
        expect(
          github.samples.some((s) => s.operation === "pull-list-requests"),
        ).toBe(false);
        release();
        await delta;
        await Promise.all([full, manual]);
        expect(
          github.samples.filter((s) => s.operation === "pull-list-requests"),
        ).toHaveLength(1);
        expect(
          h.notifications.mock.calls.flatMap(
            ([notifications]) => notifications,
          ),
        ).toHaveLength(1);
        const deltaEnded = Math.max(
          ...reviewCalls(github.samples).map((s) => s.endedMs),
        );
        expect(
          github.samples.find((s) => s.operation === "pull-list-requests")!
            .startedMs,
        ).toBeGreaterThanOrEqual(deltaEnded);
      } finally {
        release();
        await h.close();
      }
    });

    test("full fallback visits later review pages when the first page is 304, then clears an empty review list", async () => {
      const repos = createProfile("small");
      repos[0].openPulls = 1;
      repos[0].reviewsPerPull = 101;
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        await h.run("pages/setup");
        repos[0].reviewsPerPull = 102;
        const more = await h.run("pages/additional-review");
        expect(
          more.samples
            .filter((s) => s.operation === "pull-listReview-requests")
            .map((s) => s.status),
        ).toEqual([304, 200]);
        expect(
          more.data.reviewPerRepoPerPullNumber["service-1"]["1"],
        ).toHaveLength(102);
        repos[0].reviewsPerPull = 0;
        const empty = await h.run("pages/deleted-reviews");
        expect(empty.data.reviewPerRepoPerPullNumber["service-1"]["1"]).toEqual(
          [],
        );
      } finally {
        await h.close();
      }
    });

    test("same-named repositories from different owners are excluded from the delta's legacy cache writes", async () => {
      const repos = createProfile("small");
      repos.push({ ...repos[0], id: 2, owner: "another-owner" });
      const github = new MockGithub(repos, 0);
      const h = await createHarness(github);
      try {
        h.setCache(seededCache(repos));
        const sweep = await h.sweep();
        expect(sweep.metrics.skipped).toBe("no-hydrated-repositories");
        expect(sweep.samples).toHaveLength(0);
        expect(sweep.publications).toHaveLength(0);
      } finally {
        await h.close();
      }
    });

    test.each([false, true])(
      "sweep discovers PR list pages after a terminal-page 304 (omitted Link: %s)",
      async (omitLink) => {
        const repos = createProfile("small");
        repos[0].openPulls = 100;
        const github = new MockGithub(repos, 0);
        const h = await createHarness(github);
        try {
          h.setCache(seededCache(repos));
          if (omitLink) {
            jest
              .mocked(globalThis.fetch)
              .mockImplementation(async (input, init) => {
                const response = await github.fetch(input, init);
                if (response.status === 304) response.headers.delete("link");
                return response;
              });
          }
          await h.sweep();
          repos[0].openPulls = 101;
          const grown = await h.sweep();
          const calls = grown.samples.filter(
            (s) => s.operation === "review-delta-list",
          );
          expect(calls.map((s) => s.page)).toEqual([1, 2]);
          expect(calls[0].status).toBe(304);
          expect(grown.metrics.changedPRs).toBe(1);
          // Membership stays owned by the full refresh, not the approval sweep.
          expect(grown.data.flatPullRequests).toHaveLength(100);
        } finally {
          await h.close();
        }
      },
    );

    test.each([false, true])(
      "new review pages after a terminal-page 304 (omitted Link: %s)",
      async (omitLink) => {
        const repos = createProfile("small");
        repos[0].openPulls = 1;
        repos[0].reviewsPerPull = 100;
        const github = new MockGithub(repos, 0);
        const h = await createHarness(github);
        try {
          if (omitLink) {
            jest
              .mocked(globalThis.fetch)
              .mockImplementation(async (input, init) => {
                const response = await github.fetch(input, init);
                if (response.status === 304) response.headers.delete("link");
                return response;
              });
          }
          await h.run("boundary/setup");
          for (const count of [101, 200, 201, 100]) {
            repos[0].reviewsPerPull = count;
            const result = await h.run(`boundary/${count}`);
            expect(
              result.data.reviewPerRepoPerPullNumber["service-1"]["1"],
            ).toHaveLength(count);
            const calls = result.samples.filter(
              (s) => s.operation === "pull-listReview-requests",
            );
            expect(calls[0].status).toBe(304);
            expect(calls.some((s) => s.page === 2)).toBe(true);
            if (count === 201)
              expect(calls.some((s) => s.page === 3)).toBe(true);
          }
        } finally {
          await h.close();
        }
      },
    );
  },
);
