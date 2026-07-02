import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packages = ["core", "profile-cost", "benchmarks", "recon"];

describe("build output", () => {
  it("emits JavaScript with rewritten relative import extensions", () => {
    const jsFiles = packages.flatMap((name) => listJs(join(process.cwd(), "packages", name, "dist")));

    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["'][.]{1,2}\/[^"']+\.ts["']/);
      expect(text, file).not.toMatch(/import\(["'][.]{1,2}\/[^"']+\.ts["']\)/);
    }
  });
});

function listJs(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...listJs(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}
