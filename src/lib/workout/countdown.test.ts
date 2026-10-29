import { describe, expect, it } from "vitest";
import { countdownCue, formatClock, setSeconds } from "./countdown";

/** Runs a countdown one second at a time and collects what would be said or beeped. */
function run(total: number, opts: Parameters<typeof countdownCue>[3]) {
  const out: string[] = [];
  for (let left = total - 1; left >= -3; left--) {
    const c = countdownCue(left + 1, left, total, opts);
    if (c) out.push(`${left}:${c.say ?? ""}${c.beep ? `[${c.beep}]` : ""}`);
  }
  return out;
}

describe("set countdown", () => {
  it("sizes a set from the hold time, or about 3 s a rep rounded up to 5 s", () => {
    expect(setSeconds(true, 30)).toBe(30);
    expect(setSeconds(false, 12)).toBe(40);
    expect(setSeconds(false, 10)).toBe(30);
    expect(setSeconds(false, 2)).toBe(10);
  });

  it("speaks the seconds left on a 60 s set: 30, 10, then 5 to 1 with beeps, then Time", () => {
    expect(run(60, { phase: "work" })).toEqual([
      "30:30 seconds left", "10:10 seconds left", "5:5[tick]", "4:4[tick]", "3:3[tick]", "2:2[tick]", "1:1[tick]", "0:Time![go]",
    ]);
  });

  it("is a guide, not a limit: nothing more is said after zero (overtime)", () => {
    expect(run(15, { phase: "work" }).at(-1)).toBe("0:Time![go]");
  });

  it("skips the 30 s cue on short sets and the 10 s cue on very short ones", () => {
    expect(run(30, { phase: "work" })[0]).toBe("10:10 seconds left");
    expect(run(15, { phase: "work" })[0]).toBe("5:5[tick]");
  });

  it("keeps the camera coach quiet: only 10 s left, beeps, and Time", () => {
    expect(run(60, { phase: "work", quiet: true })).toEqual([
      "10:10 seconds left", "5:[tick]", "4:[tick]", "3:[tick]", "2:[tick]", "1:[tick]", "0:Time![go]",
    ]);
  });

  it("counts down rest and says Go", () => {
    expect(run(45, { phase: "rest" })).toEqual([
      "30:30 seconds of rest left", "10:10 seconds of rest left", "5:[tick]", "4:[tick]", "3:3[tick]", "2:2[tick]", "1:1[tick]", "0:Go![go]",
    ]);
  });

  it("fires only the latest cue when ticks were skipped, never a backlog", () => {
    expect(countdownCue(12, 2, 60, { phase: "work" })).toEqual({ say: "2", beep: "tick" });
    expect(countdownCue(5, 5, 60, { phase: "work" })).toBeNull();
  });

  it("formats the clock, with overtime shown as +", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-7)).toBe("+0:07");
  });
});
