import { afterAll, describe, expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createProfile } from "./fixtures";
import { createHarness } from "./harness";
import { MockGithub } from "./mock-github";

const reports: unknown[] = [];
const isBaseline = Boolean(process.env.COZYWATCH_REFRESH_BASELINE);
afterAll(() => {
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { encoding: "utf8" }).trim();
  const report = {
    source: process.env.COZYWATCH_REFRESH_BASELINE || "working-tree",
    commit: git("rev-parse", "--verify", "--end-of-options", `${process.env.COZYWATCH_REFRESH_BASELINE || "HEAD"}^{commit}`),
    productionDiffSha256: isBaseline ? null : createHash("sha256").update(git("diff", "--", "src")).digest("hex"),
    lockfileSha256: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex"),
    node: process.version, platform: process.platform, arch: process.arch,
    latencyMs: 20, reports,
  };
  const json = JSON.stringify(report, null, 2);
  console.log("REFRESH_BASELINE_REPORT", json);
  if (process.env.COZYWATCH_REFRESH_REPORT) {
    const destination = resolve(process.env.COZYWATCH_REFRESH_REPORT);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${json}\n`);
  }
});

describe("production refresh with mocked HTTP (characterization, not optimized behavior)", () => {
  test("reported workload: cold, unchanged and newly approved with unchanged PR metadata", async () => {
    const github = new MockGithub(createProfile("reported"));
    const harness = await createHarness(github);
    try {
      const cold = await harness.run("reported/cold");
      reports.push(cold.metrics);
      expect(cold.data.flatPullRequests).toHaveLength(208);
      expect(cold.metrics.requestsByOperation).toEqual({
        "/rate_limit": 1, "pull-list-requests": 7, "issues-list-comments": 208,
        "pull-listReview-requests": 208, "pull-actions-requests": 15,
        ...(!isBaseline ? Object.fromEntries(
          github.repositories.map((repo) => [`/repos/${repo.owner}/${repo.name}/pulls/comments`, 1]),
        ) : {}),
      });
      expect(cold.metrics.maxConcurrency).toBeGreaterThan(1);
      expect(cold.metrics.maxConcurrency).toBeLessThanOrEqual(10);
      if (!isBaseline) expect(cold.publications).toHaveLength(2);
      expect(cold.publications.length).toBeGreaterThanOrEqual(1);
      expect(cold.publications.length).toBeLessThanOrEqual(2);
      const lastColdPublication = cold.publications.at(-1);
      expect(lastColdPublication?.atMs).toBeGreaterThanOrEqual(
        Math.max(...cold.samples.map((entry) => entry.endedMs)),
      );
      if (cold.publications.length === 2) {
        expect(cold.publications[0].atMs).toBeLessThan(
          Math.max(...cold.samples.map((entry) => entry.endedMs)),
        );
      }

      const warm = await harness.run("reported/unchanged");
      reports.push(warm.metrics);
      expect(warm.data.flatPullRequests).toHaveLength(208);
      expect(warm.metrics.requests).toBe(isBaseline ? 429 : 435);
      // Baseline shares one review ETag between PRs. Accidental matches depend on completion order.
      if (isBaseline) {
        expect(warm.metrics.notModified).toBeGreaterThanOrEqual(220);
        expect(warm.metrics.notModified).toBeLessThan(428);
      } else {
        expect(warm.metrics.notModified).toBe(428);
      }
      expect(warm.metrics.registeredHooks).toBe(isBaseline ? 16 : 12);

      github.approve(github.repositories[0], 1);
      const changed = await harness.run("reported/approval");
      reports.push(changed.metrics);
      expect(changed.data.reviewPerRepoPerPullNumber["service-1"]["1"][0].state).toBe("APPROVED");
      expect(changed.metrics.approvalPublishedMs).not.toBeNull();
      expect(changed.metrics.registeredHooks).toBe(isBaseline ? 24 : 18);
      expect(changed.samples.filter((entry) => entry.operation === "pull-list-requests").every((entry) => entry.status === 304)).toBe(true);
    } finally { await harness.close(); }
  });

  (isBaseline ? test.skip : test)("renderer snapshot reuses fetched data without making a GitHub request", async () => {
    const github = new MockGithub(createProfile("reported"));
    const harness = await createHarness(github);
    try {
      const refreshed = await harness.run("snapshot/setup");
      github.beginMeasurement();

      const snapshot = await harness.getPullRequestSnapshot();

      expect(snapshot.pullRequestsPerRepo).toEqual(
        refreshed.data.pullRequestsPerRepo,
      );
      expect(snapshot.flatPullRequests).toHaveLength(208);
      expect(github.samples).toHaveLength(0);
      expect(github.maxActive).toBe(0);
    } finally { await harness.close(); }
  });

  test("real pagination exposes review-page replacement and older workflow-page retention", async () => {
    const repos = createProfile("small");
    Object.assign(repos[0], { openPulls: 1, reviewsPerPull: 101, commentsPerPull: 101, workflowRuns: 201 });
    const github = new MockGithub(repos);
    const harness = await createHarness(github);
    try {
      const result = await harness.run("pagination");
      reports.push(result.metrics);
      expect(result.metrics.requestsByOperation).toEqual({
        "/rate_limit": 1, "pull-list-requests": 1, "issues-list-comments": 2,
        "pull-listReview-requests": 2, "pull-actions-requests": 3,
        ...(!isBaseline ? { "/repos/synthetic-company/service-1/pulls/comments": 1 } : {}),
      });
      // Known defects, intentionally characterized rather than fixed in package 1.
      expect(result.data.reviewPerRepoPerPullNumber["service-1"]["1"].map((review) => review.id))
        .toEqual(isBaseline ? [101] : Array.from({ length: 101 }, (_, index) => index + 1));
      expect(Object.values(result.data.mentions["service-1"]).flat()).toHaveLength(101);
      expect(result.data.actionsPerRepo["service-1"][0].id).toBe(100200);
      expect(result.data.actionsPerRepo["service-1"].some((run) => run.id === 100000)).toBe(false);
    } finally { await harness.close(); }
  });

  test("low primary quota returns cached data without detail calls", async () => {
    const github = new MockGithub(createProfile("small"));
    const harness = await createHarness(github);
    try {
      await harness.run("quota/setup");
      github.remaining = 50;
      const result = await harness.run("quota/paused");
      reports.push(result.metrics);
      expect(result.metrics.requests).toBe(1);
      expect(result.data.flatPullRequests).toHaveLength(3);
    } finally { await harness.close(); }
  });

  test.each([
    [429, "API rate limit exceeded", { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" }],
    [403, "You have exceeded a secondary rate limit.", { "retry-after": "1" }],
  ] as const)("real throttling retries a %s response", async (status, message, headers) => {
    const github = new MockGithub(createProfile("small"));
    const path = "/repos/synthetic-company/service-1/pulls/1/reviews";
    github.faults.push({ path, status, message, headers, remaining: 1 });
    const harness = await createHarness(github);
    try {
      const result = await harness.run(`retry/${status}`);
      reports.push(result.metrics);
      expect(result.samples.filter((entry) => entry.path === path).map((entry) => entry.status)).toEqual([status, 200]);
      if (status === 403) {
        const attempts = result.samples.filter((entry) => entry.path === path);
        expect(attempts[1].startedMs - attempts[0].endedMs).toBeGreaterThanOrEqual(900);
      }
      expect(result.data.reviewPerRepoPerPullNumber["service-1"]["1"]).toHaveLength(1);
      expect(result.metrics.maxConcurrency).toBeLessThanOrEqual(10);
    } finally { await harness.close(); }
  });

  test("a slow detail endpoint does not delay the PR-list publication", async () => {
    const github = new MockGithub(createProfile("small"));
    github.latencyByOperation["issues-list-comments"] = 150;
    const harness = await createHarness(github);
    try {
      const result = await harness.run("slow-comments");
      reports.push(result.metrics);
      if (!isBaseline) expect(result.publications).toHaveLength(2);
      const lastPublication = result.publications.at(-1);
      expect(lastPublication?.atMs).toBeGreaterThanOrEqual(
        Math.max(...result.samples.map((entry) => entry.endedMs)),
      );
      if (result.publications.length === 2) {
        expect(result.publications[0].atMs).toBeLessThan(
          Math.max(...result.samples.map((entry) => entry.endedMs)),
        );
      }
    } finally { await harness.close(); }
  });

  test("a comments failure is swallowed while other repositories still return data", async () => {
    const repos = createProfile("reported").slice(0, 2).map((repo) => ({ ...repo, openPulls: 2, workflowRuns: 1 }));
    const github = new MockGithub(repos);
    const path = "/repos/synthetic-company/service-1/issues/1/comments";
    github.faults.push({ path, status: 500, message: "Synthetic server failure", remaining: 1 });
    const harness = await createHarness(github);
    try {
      const result = await harness.run("partial-failure/comments");
      reports.push(result.metrics);
      expect(result.data.flatPullRequests).toHaveLength(4);
      expect(result.samples.find((entry) => entry.path === path)?.status).toBe(500);
      expect(result.data.mentions["service-1"]["1_1"]).toBeUndefined();
      expect(Object.values(result.data.mentions["service-2"]).flat()).toHaveLength(2);
    } finally { await harness.close(); }
  });

  test("unmodelled requests fail closed instead of reaching GitHub", async () => {
    const github = new MockGithub(createProfile("small"));
    await expect(github.fetch("https://api.github.com/repos/synthetic-company/service-1/commits"))
      .rejects.toThrow("Unmodelled");
    expect(github.unexpectedRequests).toHaveLength(1);
    expect(github.active).toBe(0);
  });

  const scaleProfile = process.env.COZYWATCH_REFRESH_PROFILE;
  (scaleProfile ? test : test.skip)("opt-in organisation/stress/dense workload", async () => {
    if (scaleProfile !== "organisation" && scaleProfile !== "stress" && scaleProfile !== "dense") {
      throw new Error("Use organisation, stress or dense for COZYWATCH_REFRESH_PROFILE");
    }
    const github = new MockGithub(createProfile(scaleProfile));
    const harness = await createHarness(github);
    try {
      for (const phase of ["cold", "unchanged"]) {
        const result = await harness.run(`${scaleProfile}/${phase}`);
        reports.push(result.metrics);
        expect(result.data.flatPullRequests).toHaveLength({ stress: 10000, organisation: 1000, dense: 1050 }[scaleProfile]);
        expect(result.metrics.maxConcurrency).toBeLessThanOrEqual(10);
      }
    } finally { await harness.close(); }
  });
});
