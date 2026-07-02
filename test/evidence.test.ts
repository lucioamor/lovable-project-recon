import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectEvidence, listEvidenceFiles, renderReport, runRecon, validateProjectEvidence } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "corpus");
const CENTRAL = join(CORPUS, "central-genial.evidence.json");

describe("ProjectEvidence schema and collector", () => {
  it("rejects invalid evidence with useful errors", () => {
    const validation = validateProjectEvidence({ schemaVersion: 1, project: { name: "x" }, resources: [], observations: [] });

    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.errors.join(" ")).toContain("project.evidenceGenerated");
  });

  it("lists corpus evidence files deterministically", () => {
    expect(listEvidenceFiles(CORPUS).map((p) => p.replace(/\\/g, "/"))).toContain(CENTRAL.replace(/\\/g, "/"));
  });

  it("ingests central-genial evidence and keeps imported actions unscored", async () => {
    const collected = await collectEvidence({ evidencePath: CENTRAL });

    expect(collected.project.mode).toBe("evidence");
    expect(collected.project.evidenceGenerated).toBe("2026-06-30");
    expect(collected.importedActions).toHaveLength(4);
    expect(collected.resources.some((r) => r.id === "cron_job:poll-telegram-updates")).toBe(true);
  });

  it("runs evidence mode through the normal rules and report renderer", async () => {
    const result = await runRecon("evidence", { evidencePath: CENTRAL }, costRules);
    const policies = result.findings.map((f) => f.policy).sort();

    expect(policies).toEqual(["POL-1", "POL-2", "POL-5", "POL-6", "POL-9"]);
    expect(result.score.breakdown.reduce((sum, b) => sum + b.count, 0)).toBe(result.findings.length);
    expect(renderReport(result)).toContain("## Imported audit actions");
  });
});
