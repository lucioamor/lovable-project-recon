import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareProject, percentile, rankPortfolio, renderPortfolioReport } from "@nxlv-ai/lovable-benchmarks";
import { runEvidencePortfolio, runIndexPortfolio } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "..", "usage-reports", "lovable_projects_index.json");

async function loadPortfolio() {
  return runIndexPortfolio(INDEX, costRules);
}

describe("portfolio benchmarks", () => {
  it("computes percentiles and project comparisons from normalized observations", async () => {
    const results = await loadPortfolio();
    const central = results.find((r) => r.project.name === "Central Genial")!;

    expect(percentile("public_tables", results, 90)).toBeGreaterThan(0);
    expect(compareProject(central, results).some((c) => c.metric === "pg_cron_active_jobs" && c.value === 5)).toBe(true);
  });

  it("ranks and renders a deterministic portfolio report", async () => {
    const results = await loadPortfolio();
    const ranked = rankPortfolio(results);
    const md = renderPortfolioReport(results);

    expect(ranked).toHaveLength(19);
    expect(ranked[0]!.rankScore).toBeGreaterThanOrEqual(ranked[1]!.rankScore);
    expect(md).toContain("**Projects:** 19");
    expect(md).toContain("## Policy clusters");
    expect(md).toContain("## Idle / baseline candidates");
  });
  it("runs evidence corpus through the reusable portfolio runner", async () => {
    const corpus = join(HERE, "..", "corpus");
    const results = await runEvidencePortfolio(corpus, costRules);

    expect(results).toHaveLength(19);
    expect(results.every((r) => r.project.mode === "evidence")).toBe(true);
    expect(rankPortfolio(results)).toHaveLength(19);
  });
});
