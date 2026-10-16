import { describe, expect, it } from "vitest";
import { EstimatorSlot, type SlotTimers } from "./estimator-slot";

class FakeEst {
  static live = 0;
  alive = true;
  constructor(readonly name: string, private log: string[]) {
    FakeEst.live++;
    log.push(`create ${name}`);
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    FakeEst.live--;
    this.log.push(`dispose ${this.name}`);
  }
  crash() {
    this.alive = false;
    FakeEst.live--;
  }
}

function fakeTimers() {
  let t = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  let next = 1;
  const timers: SlotTimers = {
    set: (fn, ms) => {
      pending.set(next, { at: t + ms, fn });
      return next++;
    },
    clear: (h) => void pending.delete(h as number),
  };
  const advance = (ms: number) => {
    t += ms;
    for (const [h, p] of [...pending]) {
      if (p.at > t) continue;
      pending.delete(h);
      p.fn();
    }
  };
  return { timers, advance };
}

function setup() {
  FakeEst.live = 0;
  const log: string[] = [];
  const clock = fakeTimers();
  const slot = new EstimatorSlot<FakeEst>(clock.timers, 30_000);
  const make = (name: string) => () => new FakeEst(name, log);
  return { slot, log, make, ...clock };
}

describe("EstimatorSlot: one estimator at a time", () => {
  it("reuses the estimator for the same setup (Stop → Start does not load a second model)", () => {
    const { slot, make } = setup();
    const a = slot.acquire("full|wasm", make("a"));
    const b = slot.acquire("full|wasm", make("b"));
    expect(b.reused).toBe(true);
    expect(b.est).toBe(a.est);
    expect(FakeEst.live).toBe(1);
  });

  it("disposes the old estimator before creating the new one", () => {
    const { slot, log, make } = setup();
    slot.acquire("full|webgpu", make("a"));
    slot.acquire("lite|wasm", make("b"));
    expect(log).toEqual(["create a", "dispose a", "create b"]);
  });

  it("never has more than one alive over a long random sequence of acquire / release / hide / crash", () => {
    const { slot, make, advance } = setup();
    const keys = ["full|webgpu", "full|wasm", "lite|wasm", "lite|1t", "remote|laptop"];
    let maxLive = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const r = rnd();
      if (r < 0.5) slot.acquire(keys[Math.floor(rnd() * keys.length)]!, make(`e${i}`));
      else if (r < 0.6) slot.release("test");
      else if (r < 0.7) slot.pageHidden();
      else if (r < 0.8) slot.pageVisible();
      else if (r < 0.9) advance(10_000);
      else (slot.get() as FakeEst | null)?.crash();
      maxLive = Math.max(maxLive, FakeEst.live);
    }
    expect(maxLive).toBe(1);
  });
});

describe("EstimatorSlot: invalid estimators are stopped", () => {
  it("drops a crashed estimator and creates a fresh one on the next Start", () => {
    const { slot, make } = setup();
    const { est } = slot.acquire("full|wasm", make("a"));
    est.crash();
    expect(slot.get()).toBeNull();
    expect(slot.lastRelease).toBe("not alive");
    const again = slot.acquire("full|wasm", make("b"));
    expect(again.reused).toBe(false);
  });

  it("releases the estimator when the tab stays hidden past the grace period", () => {
    const { slot, make, advance, log } = setup();
    slot.acquire("full|wasm", make("a"));
    slot.pageHidden();
    advance(29_000);
    expect(slot.get()).not.toBeNull();
    advance(1_000);
    expect(slot.get()).toBeNull();
    expect(slot.lastRelease).toBe("hidden");
    expect(log.at(-1)).toBe("dispose a");
  });

  it("keeps the estimator when the user comes back within the grace period", () => {
    const { slot, make, advance } = setup();
    slot.acquire("full|wasm", make("a"));
    slot.pageHidden();
    advance(20_000);
    slot.pageVisible();
    advance(60_000);
    expect(slot.get()).not.toBeNull();
  });

  it("releases immediately when the page is left", () => {
    const { slot, make } = setup();
    slot.acquire("full|wasm", make("a"));
    slot.release("page left");
    expect(FakeEst.live).toBe(0);
    expect(slot.get()).toBeNull();
  });
});
