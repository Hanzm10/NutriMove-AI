// Holds the coach's one pose estimator (POSE-02). At most one exists at a time: the old one is disposed before a new
// one is created, and an estimator that is no longer valid (crashed, page hidden too long, page left) is disposed.
// Pure (timers injected) so it can be unit-tested.

export interface SlotEstimator {
  readonly alive: boolean;
  dispose(): void;
}

export type SlotTimers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

/** How long the page may stay hidden before the worker and its model memory are released. */
export const HIDDEN_GRACE_MS = 30_000;

export class EstimatorSlot<T extends SlotEstimator> {
  private current: { key: string; est: T } | null = null;
  private hiddenTimer: unknown = null;
  /** Why the last estimator was released (for diagnostics). */
  lastRelease: string | null = null;

  constructor(
    private readonly timers: SlotTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    private readonly hiddenGraceMs = HIDDEN_GRACE_MS,
  ) {}

  /** The estimator, if it is still usable. An invalid one is released on the spot. */
  get(): T | null {
    if (this.current && !this.current.est.alive) this.release("not alive");
    return this.current?.est ?? null;
  }

  /**
   * Reuses the current estimator when it is alive and was made for the same setup (`key`); otherwise disposes it
   * first and only then creates the new one, so two models are never in memory together.
   */
  acquire(key: string, create: () => T): { est: T; reused: boolean } {
    const cur = this.get();
    if (cur && this.current!.key === key) return { est: cur, reused: true };
    this.release("replaced");
    const est = create();
    this.current = { key, est };
    return { est, reused: false };
  }

  release(reason: string) {
    this.cancelHidden();
    if (!this.current) return;
    const { est } = this.current;
    this.current = null;
    this.lastRelease = reason;
    est.dispose();
  }

  /** Page went to the background: release the estimator if it stays hidden for the grace period. */
  pageHidden() {
    if (!this.current || this.hiddenTimer != null) return;
    this.hiddenTimer = this.timers.set(() => {
      this.hiddenTimer = null;
      this.release("hidden");
    }, this.hiddenGraceMs);
  }

  pageVisible() {
    this.cancelHidden();
  }

  private cancelHidden() {
    if (this.hiddenTimer != null) this.timers.clear(this.hiddenTimer);
    this.hiddenTimer = null;
  }
}
