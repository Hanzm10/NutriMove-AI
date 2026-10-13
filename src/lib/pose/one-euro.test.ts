import { describe, expect, it } from "vitest";
import { OneEuroFilter } from "./one-euro";

describe("OneEuroFilter (POSE-06)", () => {
  it("reduces jitter on a still signal", () => {
    const f = new OneEuroFilter(1.0, 0.01);
    const noisy = Array.from({ length: 120 }, (_, i) => 100 + (i % 2 ? 3 : -3));
    const out = noisy.map((v, i) => f.filter(v, i * 33));
    const tail = out.slice(60);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(2);
  });
  it("follows fast real movement with little lag when beta is high", () => {
    const f = new OneEuroFilter(1.0, 0.5);
    let last = 0;
    for (let i = 0; i <= 30; i++) last = f.filter(i * 3, i * 33); // 0 → 90 in 1 s
    expect(last).toBeGreaterThan(80);
  });
});
