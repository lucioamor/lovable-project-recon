import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectIndex, listIndexProjects, renderReport, runRecon } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "..", "usage-reports", "lovable_projects_index.json");

describe("index mode - structured project index", () => {
  it("has the expected corpus shape", () => {
    const parsed = JSON.parse(readFileSync(INDEX, "utf8")) as { meta: { generated: string }; policies: unknown[]; projects: unknown[] };

    expect(parsed.meta.generated).toBe("2026-06-30");
    expect(parsed.policies).toHaveLength(9);
    expect(parsed.projects).toHaveLength(19);
  });

  it("lists projects for the CLI discovery path", () => {
    const projects = listIndexProjects(INDEX);

    expect(projects).toHaveLength(19);
    expect(projects.some((p) => p.id === "opportunity-monitor")).toBe(true);
  });

  it("maps one project while keeping imported actions out of findings", async () => {
    const c = await collectIndex({ indexPath: INDEX, projectId: "opportunity-monitor" });

    expect(c.project.mode).toBe("index");
    expect(c.project.evidenceGenerated).toBe("2026-06-30");
    expect(c.resources.find((r) => r.kind === "project")?.attrs["tables"]).toBe(15);
    expect(c.importedActions).toHaveLength(5);
    expect(c.warnings.join(" ")).toMatch(/active_jobs is not observed/);
  });

  it("lets rules run on normalized index evidence without scoring imported actions", async () => {
    const result = await runRecon("index", { indexPath: INDEX, projectId: "central-genial" }, costRules);

    expect(result.importedActions.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.policy === "POL-9")).toBe(true);
    expect(result.score.breakdown.reduce((sum, b) => sum + b.count, 0)).toBe(result.findings.length);

    const md = renderReport(result);
    expect(md).toContain("evidence 2026-06-30");
    expect(md).toContain("## Imported audit actions");
    expect(md).toContain("not counted in the waste-score");
  });
});
