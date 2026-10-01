import { RefreshCoordinator, settleRefreshWork } from "./refreshCoordinator";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("full/manual callers coalesce and wait for a running delta", async () => {
  const coordinator = new RefreshCoordinator();
  const gate = deferred();
  const events: string[] = [];
  const delta = coordinator.tryDelta(async () => {
    events.push("delta");
    await gate.promise;
    events.push("delta done");
  });
  const full = jest.fn(async () => {
    events.push("full");
    return 42;
  });
  const one = coordinator.runFull(full);
  const two = coordinator.runFull(full);
  expect(one).toBe(two);
  expect(await coordinator.tryDelta(async () => "extra")).toBeUndefined();
  await Promise.resolve();
  expect(full).not.toHaveBeenCalled();
  gate.resolve();
  await delta;
  expect(await one).toBe(42);
  expect(events).toEqual(["delta", "delta done", "full"]);
});

test("a rejected job drains siblings before the next writer starts", async () => {
  const coordinator = new RefreshCoordinator();
  const gate = deferred();
  const events: string[] = [];
  const first = coordinator.runFull(async () =>
    settleRefreshWork([
      Promise.reject(new Error("HTTP failure")),
      gate.promise.then(() => {
        events.push("drained");
      }),
    ]),
  );
  const rejection = expect(first).rejects.toThrow("HTTP failure");
  await Promise.resolve();
  expect(
    await coordinator.tryDelta(async () => events.push("unsafe")),
  ).toBeUndefined();
  gate.resolve();
  await rejection;
  await coordinator.runFull(async () => events.push("safe"));
  expect(events).toEqual(["drained", "safe"]);
});

test("invalidation cancels queued work and marks running work stale", async () => {
  const coordinator = new RefreshCoordinator();
  const gate = deferred();
  let current = () => true;
  const delta = coordinator.tryDelta(async (isCurrent) => {
    current = isCurrent;
    await gate.promise;
  });
  await Promise.resolve();
  const queued = coordinator.runFull(async () => "old account");
  const rejected = expect(queued).rejects.toThrow("Refresh cancelled");
  coordinator.invalidate();
  expect(current()).toBe(false);
  const next = coordinator.runFull(async () => "new account");
  gate.resolve();
  await delta;
  await rejected;
  expect(await next).toBe("new account");
});
