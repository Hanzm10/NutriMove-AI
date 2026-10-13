import { describe, expect, it } from "vitest";
import { mhr70ToCanonical } from "./adapter";

describe("mhr70ToCanonical", () => {
  it("picks MHR70 indices into named joints", () => {
    const j2 = new Float32Array(140).map((_, i) => i);
    const j3 = new Float32Array(210).map((_, i) => i / 10);
    const p = mhr70ToCanonical(j2, j3, [0, 0, 10, 10], 5);
    expect(p.joints2d.l_knee).toEqual([22, 23]); // index 11
    expect(p.joints2d.r_wrist).toEqual([82, 83]); // index 41
    expect(p.joints3d!.neck[0]).toBeCloseTo(20.7); // index 69 → 207/10
    expect(mhr70ToCanonical(j2, null, [0, 0, 1, 1], 0).joints3d).toBeNull();
  });
});
