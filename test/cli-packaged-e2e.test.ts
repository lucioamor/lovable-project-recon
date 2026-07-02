import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const workspaces = ["@nxlv-ai/lovable-core", "@nxlv-ai/lovable-profile-cost", "@nxlv-ai/lovable-benchmarks", "@nxlv-ai/lovable-recon"];

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
}

function runNpm(args: string[], cwd: string) {
  const npmCli = process.env["npm_execpath"];
  if (npmCli) return run(process.execPath, [npmCli, ...args], cwd);
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npmCmd, args, cwd);
}

function packWorkspace(workspace: string, destination: string) {
  const res = runNpm(["pack", "--workspace", workspace, "--pack-destination", destination, "--json"], process.cwd());
  expect(res.status, res.error?.message ?? res.stderr ?? res.stdout).toBe(0);
  const packed = JSON.parse(res.stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
  expect(packed).toHaveLength(1);
  const files = packed[0]!.files.map((f) => f.path);
  expect(files.some((f) => f.startsWith("dist/") && f.endsWith(".js"))).toBe(true);
  expect(files.some((f) => f.startsWith("dist/") && f.endsWith(".d.ts"))).toBe(true);
  expect(files.some((f) => f.startsWith("src/"))).toBe(false);
  expect(files.some((f) => f.endsWith(".tsbuildinfo"))).toBe(false);
  return join(destination, packed[0]!.filename);
}

describe("packaged CLI e2e", () => {
  it("packs dist artifacts and runs the installed recon bin", () => {
    const temp = mkdtempSync(join(tmpdir(), "recon-pack-e2e-"));
    const packDir = join(temp, "packs");
    const appDir = join(temp, "app");
    mkdirSync(packDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });

    const tarballs = workspaces.map((workspace) => packWorkspace(workspace, packDir));
    writeFileSync(join(appDir, "package.json"), JSON.stringify({ name: "recon-e2e", private: true, type: "module" }, null, 2));

    const install = runNpm(["install", "--ignore-scripts", "--omit=optional", ...tarballs], appDir);
    expect(install.status, install.error?.message ?? install.stderr ?? install.stdout).toBe(0);

    const reconPkg = JSON.parse(readFileSync(join(appDir, "node_modules", "@nxlv-ai", "lovable-recon", "package.json"), "utf8")) as { bin: { recon: string } };
    const bin = resolve(appDir, "node_modules", "@nxlv-ai", "lovable-recon", reconPkg.bin.recon);
    const demo = run(process.execPath, [bin, "scan", "--mode", "demo", "--json"], appDir);
    expect(demo.status, demo.stderr).toBe(0);
    expect(demo.stdout).toContain('"project"');

    const failOn = run(process.execPath, [bin, "scan", "--mode", "demo", "--json", "--fail-on", "high"], appDir);
    expect(failOn.status).toBe(1);
    expect(failOn.stdout).toContain('"findings"');

    const indexPath = join(process.cwd(), "usage-reports", "lovable_projects_index.json");
    const index = run(process.execPath, [bin, "scan", "--mode", "index", "--index", indexPath, "--project", "opportunity-monitor", "--json"], appDir);
    expect(index.status, index.stderr).toBe(0);
    expect(index.stdout).toContain("Opportunity Monitor");
  });
});
