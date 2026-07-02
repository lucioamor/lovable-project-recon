import { describe, expect, it } from "vitest";
import { scoreFindings, type Finding, type Severity, type Confidence } from "@nxlv-ai/lovable-core";

function finding(policy: string, severity: Severity, confidence: Confidence = "confirmed"): Finding {
  return {
    id: `${policy}:x`,
    policy,
    driverCat: null,
    title: "t",
    severity,
    confidence,
    resourceId: "project",
    rationale: "r",
    evidence: [],
    remediation: [],
  };
}

describe("scoreFindings", () => {
  it("no findings => 0 and a clean headline", () => {
    const s = scoreFindings([]);
    expect(s.wasteScore).toBe(0);
    expect(s.headline).toMatch(/clean/i);
    expect(s.breakdown).toEqual([]);
  });

  it("score is bounded to 0..100 even with many criticals", () => {
    const many = Array.from({ length: 20 }, () => finding("POL-1", "critical"));
    const s = scoreFindings(many);
    expect(s.wasteScore).toBeGreaterThan(90);
    expect(s.wasteScore).toBeLessThanOrEqual(100);
  });

  it("a hypothesis weighs less than a confirmed finding", () => {
    const confirmed = scoreFindings([finding("POL-1", "high", "confirmed")]).wasteScore;
    const hypothesis = scoreFindings([finding("POL-1", "high", "hypothesis")]).wasteScore;
    expect(hypothesis).toBeLessThan(confirmed);
  });

  it("higher severity yields a higher score", () => {
    const low = scoreFindings([finding("POL-1", "low")]).wasteScore;
    const critical = scoreFindings([finding("POL-1", "critical")]).wasteScore;
    expect(critical).toBeGreaterThan(low);
  });

  it("breakdown groups by policy and ranks by points", () => {
    const s = scoreFindings([finding("POL-1", "critical"), finding("POL-2", "low"), finding("POL-2", "low")]);
    expect(s.breakdown[0]!.policy).toBe("POL-1");
    const pol2 = s.breakdown.find((b) => b.policy === "POL-2")!;
    expect(pol2.count).toBe(2);
  });

  it("a critical finding forces a 'clean up now' headline", () => {
    const s = scoreFindings([finding("POL-6", "critical")]);
    expect(s.headline).toMatch(/clean up now/i);
  });

  it("assessed=false with no findings => 'not assessed', never 'clean'", () => {
    const s = scoreFindings([], { assessed: false });
    expect(s.headline).toMatch(/not assessed/i);
    expect(s.headline).not.toMatch(/clean/i);
  });

  it("score is monotonic in the number of findings", () => {
    const one = scoreFindings([finding("POL-1", "high")]).wasteScore;
    const three = scoreFindings([finding("POL-1", "high"), finding("POL-2", "high"), finding("POL-5", "high")]).wasteScore;
    expect(three).toBeGreaterThan(one);
  });
});
