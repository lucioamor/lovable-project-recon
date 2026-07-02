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

describe("CLI clean", () => {
  it("renders a dry-run clean plan by default", () => {
    const res = runCli(["clean", "--mode", "demo"]);

    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain("# central-genial - Recon Clean Plan");
    expect(res.stdout).toContain("**Mode:** dry-run");
    expect(res.stdout).toContain("Auto-applicable actions: 0");
    expect(res.stdout).toContain("Review-required actions: 5");
  });

  it("prints clean JSON plans", () => {
    const res = runCli(["clean", "--mode", "demo", "--json"]);

    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
    const plan = JSON.parse(res.stdout) as { dryRun: boolean; eligibleActions: unknown[]; blockedActions: unknown[] };
    expect(plan.dryRun).toBe(true);
    expect(plan.eligibleActions).toHaveLength(0);
    expect(plan.blockedActions).toHaveLength(5);
  });

  it("refuses --apply when no confirmed remediation is applySafe", () => {
    const res = runCli(["clean", "--mode", "demo", "--apply"]);

    expect(res.status).toBe(2);
    expect(res.stdout).toContain("**Mode:** apply requested");
    expect(res.stdout).toContain("Auto-applicable actions: 0");
    expect(res.stderr).toContain("clean --apply refused");
  });

  it("rejects unsafe clean invocations", () => {
    const both = runCli(["clean", "--mode", "demo", "--apply", "--dry-run"]);
    expect(both.status).toBe(2);
    expect(both.stderr).toContain("--apply cannot be combined");

    const unknown = runCli(["clean", "--mode", "demo", "--typo"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("unknown flag --typo");

    const corpus = runCli(["clean", "--mode", "corpus", "--dir", "corpus"]);
    expect(corpus.status).toBe(1);
    expect(corpus.stderr).toContain("does not support corpus/portfolio");
  });
});
