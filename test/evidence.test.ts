import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectEvidence, listEvidenceFiles, readEvidenceFile, renderReport, runRecon, validateProjectEvidence } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "corpus");
const CENTRAL = join(CORPUS, "central-genial.evidence.json");

describe("ProjectEvidence schema and collector", () => {
  it("rejects invalid evidence with useful errors", () => {
    const validation = validateProjectEvidence({
      schemaVersion: 1,
      project: { name: "x", evidenceGenerated: "not-a-date" },
      resources: [{ id: "project", kind: "unknown", name: "Project", attrs: {} }],
      observations: [{ resourceId: "missing", metric: "x", value: 1, measuredAt: "not-a-date" }],
      importedActions: [{ rank: "1", action: "" }],
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const errors = validation.errors.join(" ");
      expect(errors).toContain("project.evidenceGenerated");
      expect(errors).toContain("ResourceKind");
      expect(errors).toContain("reference a resource id");
      expect(errors).toContain("importedActions[0].rank");
    }
  });

  it("lists the full corpus deterministically", () => {
    const files = listEvidenceFiles(CORPUS).map((p) => p.replace(/\\/g, "/"));

    expect(files).toHaveLength(19);
    expect(files).toContain(CENTRAL.replace(/\\/g, "/"));
    expect(files).toEqual([...files].sort((a, b) => a.localeCompare(b)));
  });

  it("validates every corpus file and keeps file names aligned with project ids", () => {
    for (const file of listEvidenceFiles(CORPUS)) {
      const evidence = readEvidenceFile(file);
      const expectedName = `${evidence.project.id}.evidence.json`;

      expect(basename(file)).toBe(expectedName);
      expect(evidence.resources.some((resource) => resource.id === "project" || resource.kind === "project")).toBe(true);
    }
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
