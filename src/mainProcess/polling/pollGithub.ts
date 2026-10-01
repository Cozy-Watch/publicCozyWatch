import log from "electron-log";
import { performanceDiagnostics } from "../diagnostics/diagnostics";
import { getPullRequests } from "../api/PullRequests/getPullRequests";
import { sweepReviewDelta } from "../api/PullRequests/queries/reviewDelta";
import { refreshCoordinator } from "./refreshCoordinator";

const FULL_INTERVAL = 300_000;
const SWEEP_INTERVAL = 60_000;
const REFRESH_COOLDOWN = 10_000;

export class RefreshScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private generation = 0;
  private busy = false;
  private nextFull = 0;
  private nextSweep = 0;
  private pausedUntil = 0;
  private lastManual = -Infinity;
  private manualPending = false;

  constructor(
    private readonly jobs: {
      full: () => Promise<unknown>;
      sweep: () => Promise<unknown>;
      invalidate: () => void;
    },
  ) {}

  start = () => {
    if (this.running) return;
    this.running = true;
    this.generation++;
    this.nextFull = Date.now();
    this.nextSweep = Date.now();
    this.pausedUntil = 0;
    this.lastManual = -Infinity;
    this.arm();
  };

  stop = () => {
    this.running = false;
    this.generation++;
    this.manualPending = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.jobs.invalidate();
  };

  refresh = () => {
    if (!this.running || Date.now() - this.lastManual < REFRESH_COOLDOWN)
      return;
    this.lastManual = Date.now();
    this.manualPending = true;
    if (!this.busy) this.arm();
  };

  private arm() {
    if (!this.running || this.busy) return;
    if (this.timer) clearTimeout(this.timer);
    const due = this.manualPending
      ? Date.now()
      : Math.min(this.nextFull, this.nextSweep);
    this.timer = setTimeout(
      () => {
        void this.tick();
      },
      Math.max(0, Math.max(due, this.pausedUntil) - Date.now()),
    );
  }

  private async tick() {
    this.timer = undefined;
    if (!this.running || this.busy) return;
    const generation = this.generation;
    const started = Date.now();
    const full = this.manualPending || started >= this.nextFull;
    this.manualPending = false;
    // Advance from the start, rather than adding refresh duration to the cadence.
    if (full) this.nextFull = started + FULL_INTERVAL;
    this.nextSweep = started + SWEEP_INTERVAL;
    this.busy = true;
    try {
      await (full ? this.jobs.full() : this.jobs.sweep());
      performanceDiagnostics.record(
        full ? "github-poll-completed" : "review-sweep-tick",
        { durationMs: Date.now() - started },
      );
    } catch (error) {
      if (generation !== this.generation) return;
      const err = error as {
        status?: number;
        message?: string;
        response?: { headers?: Record<string, string> };
      };
      performanceDiagnostics.record("github-poll-failed", {
        status: err.status || 0,
        full,
        durationMs: Date.now() - started,
      });
      if (
        err.status === 401 ||
        /Bad credentials|Authentication failed/.test(err.message || "")
      ) {
        this.stop();
      } else {
        const headers = err.response?.headers || {};
        const retryAfter = Number(headers["retry-after"]);
        const reset = Number(headers["x-ratelimit-reset"]) * 1000;
        if (retryAfter > 0) this.pausedUntil = Date.now() + retryAfter * 1000;
        else if (headers["x-ratelimit-remaining"] === "0" && reset > Date.now())
          this.pausedUntil = reset + 1000;
        else if (err.status === 403 || err.status === 429)
          this.pausedUntil = Date.now() + FULL_INTERVAL;
        log.warn("[Polling] Refresh failed", { status: err.status || 0 });
      }
    } finally {
      this.busy = false;
      // No catch-up storm after a slow request, sleep, or a new login session.
      if (generation === this.generation) {
        const now = Date.now();
        // An overlong full refresh must leave room for lightweight sweeps,
        // rather than immediately starting another full refresh forever.
        if (full && this.nextFull <= now) this.nextFull = now + FULL_INTERVAL;
        if (this.nextSweep <= now)
          this.nextSweep +=
            (Math.floor((now - this.nextSweep) / SWEEP_INTERVAL) + 1) *
            SWEEP_INTERVAL;
      }
      this.arm();
    }
  }
}

const scheduler = new RefreshScheduler({
  full: getPullRequests,
  sweep: sweepReviewDelta,
  invalidate: () => refreshCoordinator.invalidate(),
});

export const startPolling = scheduler.start;
export const stopPolling = scheduler.stop;
export const refreshPoll = scheduler.refresh;
