import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(process.cwd(), "packages", "recon", "src", "cli.ts");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
}

describe("CLI --fail-on", () => {
  it("exits 1 after writing JSON when findings meet the threshold", () => {
    const res = runCli(["scan", "--mode", "demo", "--json", "--fail-on", "critical"]);

    expect(res.status).toBe(1);
    expect(res.stdout).toContain('"findings"');
    expect(res.stderr).toBe("");
  });

  it("exits 0 when there are no findings at or above the threshold", () => {
    const res = runCli(["scan", "--mode", "static", "--json", "--fail-on", "low"]);

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('"findings": []');
  });

  it("rejects an invalid threshold", () => {
    const res = runCli(["scan", "--mode", "demo", "--json", "--fail-on", "blocker"]);

    expect(res.status).toBe(2);
    expect(res.stdout).toContain('"findings"');
    expect(res.stderr).toContain("--fail-on must be one of");
  });
});
