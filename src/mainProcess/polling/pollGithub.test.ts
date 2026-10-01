jest.mock("electron-log", () => ({ warn: jest.fn() }));
jest.mock("../diagnostics/diagnostics", () => ({
  performanceDiagnostics: { record: jest.fn() },
}));
jest.mock("../api/PullRequests/getPullRequests", () => ({
  getPullRequests: jest.fn(),
}));
jest.mock("../api/PullRequests/queries/reviewDelta", () => ({
  sweepReviewDelta: jest.fn(),
}));
import { RefreshScheduler } from "./pollGithub";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
const setup = () => {
  const jobs = {
    full: jest.fn(async () => undefined),
    sweep: jest.fn(async () => undefined),
    invalidate: jest.fn(),
  };
  return { ...jobs, scheduler: new RefreshScheduler(jobs) };
};

test("starts with full hydration, checks at 60s and reconciles at 5m", async () => {
  const { scheduler, full, sweep } = setup();
  scheduler.start();
  scheduler.start();
  await jest.advanceTimersByTimeAsync(0);
  expect(full).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(sweep).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(240_000);
  expect(full).toHaveBeenCalledTimes(2);
  expect(sweep).toHaveBeenCalledTimes(4);
  scheduler.stop();
});

test("request duration does not drift the minute cadence", async () => {
  const { scheduler, full, sweep } = setup();
  full.mockImplementation(
    async () => new Promise((resolve) => setTimeout(resolve, 20_000)),
  );
  sweep.mockImplementation(
    async () => new Promise((resolve) => setTimeout(resolve, 15_000)),
  );
  scheduler.start();
  await jest.advanceTimersByTimeAsync(119_999);
  expect(sweep).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(sweep).toHaveBeenCalledTimes(2);
  scheduler.stop();
});

test("manual refresh waits for the sweep; stop prevents rearming", async () => {
  const { scheduler, full, sweep } = setup();
  let finish!: () => void;
  sweep.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }),
  );
  scheduler.start();
  await jest.advanceTimersByTimeAsync(60_000);
  scheduler.refresh();
  scheduler.refresh();
  expect(full).toHaveBeenCalledTimes(1);
  finish();
  await jest.advanceTimersByTimeAsync(1);
  expect(full).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(60_000);
  scheduler.stop();
  finish();
  await jest.advanceTimersByTimeAsync(600_000);
  expect(full).toHaveBeenCalledTimes(2);
  expect(sweep).toHaveBeenCalledTimes(2);
});

test("rate limit retry-after also pauses manual refresh", async () => {
  const { scheduler, full, sweep } = setup();
  sweep.mockRejectedValueOnce({
    status: 429,
    response: { headers: { "retry-after": "120" } },
  });
  scheduler.start();
  await jest.advanceTimersByTimeAsync(60_000);
  scheduler.refresh();
  await jest.advanceTimersByTimeAsync(119_999);
  expect(full).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(full).toHaveBeenCalledTimes(2);
  scheduler.stop();
});

test("authentication failure stops both jobs", async () => {
  const { scheduler, full, sweep, invalidate } = setup();
  sweep.mockRejectedValueOnce(
    new Error("Authentication failed. User has been signed out."),
  );
  scheduler.start();
  await jest.advanceTimersByTimeAsync(600_000);
  expect(full).toHaveBeenCalledTimes(1);
  expect(sweep).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledTimes(1);
});

test.each([300_000, 360_000, 599_000])(
  "a %ims full refresh leaves time for sweeps before the next full refresh",
  async (duration) => {
    const { scheduler, full, sweep } = setup();
    full.mockImplementation(
      async () => new Promise((resolve) => setTimeout(resolve, duration)),
    );
    scheduler.start();
    await jest.advanceTimersByTimeAsync(duration);
    expect(full).toHaveBeenCalledTimes(1);
    expect(sweep).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(full).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(240_000);
    expect(full).toHaveBeenCalledTimes(2);
    scheduler.stop();
  },
);

test("a failed overlong full refresh also leaves time for sweeps", async () => {
  const { scheduler, full, sweep } = setup();
  full.mockImplementation(
    async () =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("offline")), 360_000),
      ),
  );
  scheduler.start();
  await jest.advanceTimersByTimeAsync(420_000);
  expect(full).toHaveBeenCalledTimes(1);
  expect(sweep).toHaveBeenCalledTimes(1);
  scheduler.stop();
});
