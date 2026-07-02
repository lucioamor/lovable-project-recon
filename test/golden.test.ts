import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRecon, renderReport } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, "__golden__", "demo-report.md");

// The demo fixture is deterministic except for the scan timestamp; normalize it.
function normalize(md: string): string {
  return md.replace(/scanned \d{4}-\d{2}-\d{2}/g, "scanned <DATE>");
}

describe("demo report (golden file)", () => {
  it("reproduces the central-genial audit byte-for-byte (minus the timestamp)", async () => {
    const result = await runRecon("demo", {}, costRules);
    const actual = normalize(renderReport(result));
    const expected = readFileSync(GOLDEN, "utf8");
    expect(actual).toBe(expected);
  });

  it("carries the M0 signature findings and waste-score", async () => {
    const result = await runRecon("demo", {}, costRules);
    const policies = result.findings.map((f) => f.policy).sort();
    expect(policies).toEqual(["POL-1", "POL-2", "POL-5", "POL-6", "POL-9"]);
    expect(result.score.wasteScore).toBe(83);
    expect(result.importedActions).toHaveLength(4);
    expect(result.findings.filter((f) => f.severity === "critical")).toHaveLength(1);
  });
});
