import { describe, expect, it } from "vitest";
import { ISO_ITEMS, isoItemsFor, isoSummary, likertInterpretation, susAdjective, susScore } from "./survey";

describe("SUS", () => {
  it("scores with Brooke's formula", () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2])).toBe(75);
  });
  it("rejects incomplete or out-of-range answers", () => {
    expect(susScore([5, 1, 5])).toBeNull();
    expect(susScore([6, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBeNull();
    expect(susScore([4.5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBeNull();
  });
  it("labels scores", () => {
    expect(susAdjective(90)).toBe("Excellent");
    expect(susAdjective(75)).toBe("Good");
    expect(susAdjective(68)).toBe("OK");
    expect(susAdjective(20)).toBe("Awful");
  });
});

describe("ISO/IEC 25010", () => {
  it("covers the seven characteristics in PRD 12.5, with technical items for IT experts only", () => {
    expect(new Set(ISO_ITEMS.map((i) => i.characteristic)).size).toBe(7);
    expect(isoItemsFor("user").some((i) => i.characteristic === "Maintainability")).toBe(false);
    expect(isoItemsFor("it_expert").some((i) => i.characteristic === "Maintainability")).toBe(true);
    expect(new Set(ISO_ITEMS.map((i) => i.id)).size).toBe(ISO_ITEMS.length);
  });
  it("item ids start with their characteristic's prefix (the results SQL in docs/evaluation.md groups by it)", () => {
    const prefix: Record<string, string> = {
      "Functional suitability": "fs", "Performance efficiency": "pe", Compatibility: "co",
      "Interaction capability (usability)": "us", Reliability: "re", Security: "se", Maintainability: "ma",
    };
    for (const i of ISO_ITEMS) expect(i.id.slice(0, 2)).toBe(prefix[i.characteristic]);
  });
  it("averages per characteristic and interprets the mean", () => {
    const rows = isoSummary([{ fs1: 5, fs2: 4, fs3: 4, se1: 3 }, { fs1: 4, fs2: 4, fs3: 5, se1: 2, bogus: 5 }]);
    expect(rows).toEqual([
      { characteristic: "Functional suitability", n: 6, mean: 4.33, interpretation: "Strongly agree (very high quality)" },
      { characteristic: "Security", n: 2, mean: 2.5, interpretation: "Disagree (low quality)" },
    ]);
    expect(likertInterpretation(3.41)).toBe("Agree (high quality)");
  });
});
