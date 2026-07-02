import { applyCleanPlan, buildCleanPlan, renderCleanPlan, runRecon } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";
import { describe, expect, it } from "vitest";

describe("clean planning", () => {
  it("plans only confirmed findings and keeps current remediations review-required", async () => {
    const result = await runRecon("demo", {}, costRules);
    const plan = buildCleanPlan(result, { generatedAt: "2026-07-02T00:00:00.000Z" });

    expect(plan.dryRun).toBe(true);
    expect(plan.confirmedFindings).toBe(5);
    expect(plan.skippedHypotheses).toBe(0);
    expect(plan.eligibleActions).toHaveLength(0);
    expect(plan.blockedActions).toHaveLength(5);
    expect(plan.blockedActions.every((action) => action.action.applySafe === false)).toBe(true);
  });

  it("renders an auditable dry-run plan", async () => {
    const result = await runRecon("demo", {}, costRules);
    const plan = buildCleanPlan(result, { generatedAt: "2026-07-02T00:00:00.000Z" });
    const md = renderCleanPlan(plan);

    expect(md).toContain("# central-genial - Recon Clean Plan");
    expect(md).toContain("**Mode:** dry-run");
    expect(md).toContain("Auto-applicable actions: 0");
    expect(md).toContain("Review-required actions: 5");
    expect(md).toContain("No changes applied");
  });

  it("records --apply refusal when nothing is applySafe", async () => {
    const result = await runRecon("demo", {}, costRules);
    const plan = buildCleanPlan(result, { apply: true, generatedAt: "2026-07-02T00:00:00.000Z" });

    expect(plan.applyRequested).toBe(true);
    expect(plan.dryRun).toBe(false);
    expect(plan.eligibleActions).toHaveLength(0);
    expect(plan.warnings.join(" ")).toContain("--apply requested");
  });

  it("applies only applySafe actions and verifies with a post-clean scan", async () => {
    const before = await runRecon("demo", {}, costRules);
    const synthetic = {
      ...before,
      findings: before.findings.map((finding, index) =>
        index === 0
          ? {
              ...finding,
              remediation: finding.remediation.map((action, actionIndex) => (actionIndex === 0 ? { ...action, applySafe: true } : action)),
            }
          : finding,
      ),
    };
    const plan = buildCleanPlan(synthetic, { apply: true, generatedAt: "2026-07-02T00:00:00.000Z" });
    const after = { ...before, findings: [], score: { ...before.score, wasteScore: 0 } };

    const result = await applyCleanPlan(plan, {
      before,
      executor: async (action) => ({ detail: `applied ${action.action.title}` }),
      verify: async () => after,
    });

    expect(result.appliedActions).toHaveLength(1);
    expect(result.appliedActions[0]!.detail).toContain("applied");
    expect(result.verification).toEqual({ beforeWasteScore: before.score.wasteScore, afterWasteScore: 0, beforeFindings: before.findings.length, afterFindings: 0, changed: true });
  });
});
