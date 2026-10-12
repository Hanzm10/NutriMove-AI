import { describe, expect, it } from "vitest";
import { ageFromBirthdate, screen } from "./guardrails";

describe("screen", () => {
  it("blocks under-18s (ONB-02)", () => {
    const r = screen({ ageYears: 17, pregnantOrBreastfeeding: false, parq: {} });
    expect(r.status).toBe("blocked");
    expect(r.ruleIds).toEqual(["ONB-02"]);
  });

  it("passes a healthy adult", () => {
    const r = screen({ ageYears: 21, pregnantOrBreastfeeding: false, parq: { chest_pain: false } });
    expect(r).toMatchObject({ status: "ok", maintenanceOnly: false, beginnerCap: false });
  });

  it("flags pregnancy: maintenance, beginner, low impact (ONB-03)", () => {
    const r = screen({ ageYears: 28, pregnantOrBreastfeeding: true, parq: {} });
    expect(r).toMatchObject({
      status: "flagged", maintenanceOnly: true, beginnerCap: true, lowImpactOnly: true,
    });
  });

  it("flags any PAR-Q yes and requires clearance acknowledgement (ONB-04)", () => {
    const r = screen({ ageYears: 45, pregnantOrBreastfeeding: false, parq: { bone_joint: true } });
    expect(r).toMatchObject({ status: "flagged", beginnerCap: true, requiresClearanceAck: true });
    expect(r.ruleIds).toContain("ONB-04");
  });
});

describe("ageFromBirthdate", () => {
  const today = new Date(2026, 9, 12); // 12 Oct 2026
  it("counts whole years", () => {
    expect(ageFromBirthdate("2008-10-12", today)).toBe(18);
    expect(ageFromBirthdate("2008-10-13", today)).toBe(17);
    expect(ageFromBirthdate("1990-01-01", today)).toBe(36);
  });
});
