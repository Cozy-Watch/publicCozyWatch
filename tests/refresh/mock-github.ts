import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { commentFixture, pullFixture, reviewFixture, userFixture, workflowFixture } from "./fixtures";
import type { RepositoryFixture } from "./fixtures";

export interface RequestSample {
  path: string;
  query: string;
  page: number;
  operation: string;
  conditional: boolean;
  status: number;
  startedMs: number;
  endedMs: number;
  bytes: number;
}

export interface Fault {
  path: string;
  status: number;
  message: string;
  headers?: Record<string, string>;
  remaining: number;
  page?: number;
}

export class MockGithub {
  readonly samples: RequestSample[] = [];
  readonly unexpectedRequests: string[] = [];
  readonly faults: Fault[] = [];
  readonly reviewStates = new Map<string, string>();
  readonly pullUpdates = new Map<string, string>();
  readonly requestedReviewers = new Map<string, number[]>();
  readonly latencyByOperation: Record<string, number> = {};
  remaining = 5000;
  active = 0;
  maxActive = 0;
  epoch = performance.now();

  constructor(readonly repositories: RepositoryFixture[], readonly latencyMs = 20) {}

  beginMeasurement() {
    if (this.active !== 0) throw new Error("Cannot reset metrics with pending HTTP requests");
    this.samples.length = 0;
    this.maxActive = 0;
    this.epoch = performance.now();
  }

  approve(repo: RepositoryFixture, pull: number) {
    // Deliberately leave PR.updated_at unchanged: detail changes must still be observable.
    this.reviewStates.set(`${repo.owner}/${repo.name}/${pull}`, "APPROVED");
  }

  touch(repo: RepositoryFixture, pull: number, updatedAt = "2026-09-01T12:00:01Z") {
    this.pullUpdates.set(`${repo.owner}/${repo.name}/${pull}`, updatedAt);
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const operation = headers.get("x-operation-name") || url.pathname;
    const sample: RequestSample = {
      path: url.pathname, query: url.search, page: Number(url.searchParams.get("page") || 1),
      operation, conditional: headers.has("if-none-match"), status: 0,
      startedMs: performance.now() - this.epoch, endedMs: 0, bytes: 0,
    };
    this.samples.push(sample);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (url.origin !== "https://api.github.com" || (init?.method || "GET") !== "GET") {
        throw new Error(`Unexpected origin/method: ${url}`);
      }
      await delay(this.latencyByOperation[operation] ?? this.latencyMs);
      const fault = this.faults.find((entry) => entry.remaining > 0 && entry.path === url.pathname && (!entry.page || entry.page === sample.page));
      if (fault) {
        fault.remaining--;
        sample.status = fault.status;
        const json = JSON.stringify({ message: fault.message });
        sample.bytes = Buffer.byteLength(json);
        const response = new Response(json, {
          status: fault.status,
          headers: { "content-type": "application/json", ...fault.headers },
        });
        Object.defineProperty(response, "url", { value: url.href });
        return response;
      }

      const { body, nextPage } = this.respond(url);
      const json = JSON.stringify(body);
      const etag = `"${createHash("sha256").update(url.href).update(json).digest("hex")}"`;
      const responseHeaders = new Headers({
        "content-type": "application/json", etag,
        "x-ratelimit-limit": "5000", "x-ratelimit-remaining": String(this.remaining),
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });
      if (nextPage) {
        const next = new URL(url);
        next.searchParams.set("page", String(nextPage));
        responseHeaders.set("link", `<${next}>; rel="next"`);
      }
      sample.status = headers.get("if-none-match") === etag ? 304 : 200;
      sample.bytes = sample.status === 304 ? 0 : Buffer.byteLength(json);
      const response = new Response(sample.status === 304 ? null : json, {
        status: sample.status, headers: responseHeaders,
      });
      // Native fetch supplies the final URL; a constructed Response otherwise has url="".
      Object.defineProperty(response, "url", { value: url.href });
      return response;
    } catch (error) {
      this.unexpectedRequests.push(`${url}: ${String(error)}`);
      throw error;
    } finally {
      sample.endedMs = performance.now() - this.epoch;
      this.active--;
    }
  };

  private respond(url: URL): { body: unknown; nextPage?: number } {
    if (url.pathname === "/user") return { body: userFixture() };
    if (url.pathname === "/rate_limit") {
      const rate = { limit: 5000, remaining: this.remaining, used: 5000 - this.remaining,
        reset: Math.floor(Date.now() / 1000) + 3600 };
      return { body: { rate, resources: { core: rate } } };
    }
    const match = /^\/repos\/([^/]+)\/([^/]+)\/(.+)$/.exec(url.pathname);
    const repo = match && this.repositories.find((entry) => entry.owner === match[1] && entry.name === match[2]);
    if (!match || !repo) throw new Error(`Unmodelled endpoint: ${url.pathname}`);
    const route = match[3];
    const allowedParameters = new Set(["page", "per_page",
      ...(route === "pulls" ? ["state"] : route === "actions/runs" ? ["event"] : route === "pulls/comments" ? ["since", "sort", "direction"] : [])]);
    for (const key of url.searchParams.keys()) {
      if (!allowedParameters.has(key)) throw new Error(`Unmodelled query parameter: ${key}`);
    }
    const page = Number(url.searchParams.get("page") || 1);
    const perPage = Number(url.searchParams.get("per_page") || 30);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
      throw new Error("Invalid pagination parameters");
    }
    let count: number;
    let makeItem: (index: number) => unknown;
    if (route === "pulls") {
      if (url.searchParams.get("state") !== "open") throw new Error("Fixture models open PRs only");
      count = repo.openPulls;
      makeItem = (index) => {
        const pr = pullFixture(repo, index + 1);
        const key = `${repo.owner}/${repo.name}/${index + 1}`;
        pr.updated_at = this.pullUpdates.get(key) || pr.updated_at;
        const reviewers = this.requestedReviewers.get(key);
        if (reviewers) pr.requested_reviewers = reviewers.map((id) => userFixture(id));
        return pr;
      };
    } else if (route === "pulls/comments") {
      count = 0;
      makeItem = () => null;
    } else if (route === "actions/runs") {
      if (url.searchParams.get("event") !== "pull_request") throw new Error("Unexpected workflow event");
      // GitHub caps filtered workflow-run searches at 1,000 results.
      count = Math.min(repo.workflowRuns, 1000);
      makeItem = (index) => workflowFixture(repo, index);
    } else {
      const detail = /^(pulls|issues)\/(\d+)\/(reviews|comments)$/.exec(route);
      if (!detail || !["pulls/reviews", "issues/comments"].includes(`${detail[1]}/${detail[3]}`)) {
        throw new Error(`Unmodelled detail endpoint: ${route}`);
      }
      const pull = Number(detail[2]);
      if (pull < 1 || pull > repo.openPulls) throw new Error(`Unknown PR ${pull}`);
      const isReview = detail[3] === "reviews";
      count = isReview ? repo.reviewsPerPull : repo.commentsPerPull;
      makeItem = isReview
        ? (index) => reviewFixture(repo, pull, index, this.reviewStates.get(`${repo.owner}/${repo.name}/${pull}`))
        : (index) => commentFixture(repo, pull, index);
    }
    const start = (page - 1) * perPage;
    const items = Array.from({ length: Math.max(0, Math.min(perPage, count - start)) }, (_, index) => makeItem(start + index));
    return {
      body: route === "actions/runs" ? { total_count: repo.workflowRuns, workflow_runs: items } : items,
      nextPage: start + perPage < count ? page + 1 : undefined,
    };
  }
}
