/** One writer for full/manual refreshes and opportunistic review sweeps. */
export class RefreshCoordinator {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private generation = 0;
  private full: Promise<unknown> | null = null;

  invalidate() {
    this.generation++;
    this.full = null;
  }

  get epoch() {
    return this.generation;
  }

  runFull<T>(work: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
    if (this.full) return this.full as Promise<T>;
    const result = this.enqueue(work);
    this.full = result;
    const clear = () => {
      if (this.full === result) this.full = null;
    };
    void result.then(clear, clear);
    return result;
  }

  tryDelta<T>(
    work: (isCurrent: () => boolean) => Promise<T>,
  ): Promise<T | undefined> {
    if (this.pending) return Promise.resolve(undefined);
    return this.enqueue(work);
  }

  private enqueue<T>(
    work: (isCurrent: () => boolean) => Promise<T>,
  ): Promise<T> {
    const generation = this.generation;
    this.pending++;
    const result = this.tail.then(() => {
      if (generation !== this.generation) throw new Error("Refresh cancelled");
      return work(() => generation === this.generation);
    });
    this.tail = result
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        this.pending--;
      });
    return result;
  }
}

export const refreshCoordinator = new RefreshCoordinator();

/** Promise.all rejects before its sibling HTTP requests have drained. */
export async function settleRefreshWork<T>(tasks: Promise<T>[]): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
