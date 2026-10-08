import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packagePaths = ["packages/core", "packages/profile-cost", "packages/benchmarks", "packages/recon"];

describe("release metadata", () => {
  it("configures release-please for every publishable workspace", () => {
    const config = JSON.parse(readFileSync("release-please-config.json", "utf8")) as { packages: Record<string, unknown> };
    const manifest = JSON.parse(readFileSync(".release-please-manifest.json", "utf8")) as Record<string, string>;

    expect(Object.keys(config.packages).sort()).toEqual(packagePaths.sort());
    expect(Object.keys(manifest).sort()).toEqual(packagePaths.sort());
  });

  it("marks all scoped packages as public npm packages", () => {
    for (const path of packagePaths) {
      const pkg = JSON.parse(readFileSync(`${path}/package.json`, "utf8")) as { publishConfig?: { access?: string }; files?: string[] };

      expect(pkg.publishConfig?.access).toBe("public");
      expect(pkg.files).toEqual(["dist"]);
    }
  });

  it("pins GitHub Actions by full commit SHA", () => {
    const release = readFileSync(".github/workflows/release.yml", "utf8");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const workflowText = `${release}\n${ci}`;
    const actionRefs = [...workflowText.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/g)].map((m) => m[1]);

    expect(actionRefs.length).toBeGreaterThan(0);
    for (const ref of actionRefs) expect(ref).toMatch(/^[a-f0-9]{40}$/);
  });
});
