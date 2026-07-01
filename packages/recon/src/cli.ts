#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { runRecon, renderReport, type Mode } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const VALID_MODES: Mode[] = ["demo", "db", "static", "portfolio"];

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const HELP = `recon — runtime-waste recon for Lovable Cloud portfolios

Usage:
  recon scan [options]

Options:
  --mode <demo|db|static|portfolio>   evidence source (default: demo)
  --db <connection-string>            read-only Postgres URL (or env SUPABASE_DB_URL)
  --project <name>                    project label for the report
  --out <file>                        write the Markdown report to a file
  --json                              print raw ReconResult as JSON instead of a report
  --help                              show this help

Examples:
  recon scan --mode demo --out ./central-genial_USAGE_REPORT.md
  recon scan --mode db --project my-app --db "postgresql://readonly:...@db.<ref>.supabase.co:5432/postgres"
`;

async function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "--help" || command === "help") {
    console.log(HELP);
    process.exit(command ? 0 : 1);
  }
  if (command !== "scan") {
    console.error(`unknown command: ${command}\n`);
    console.log(HELP);
    process.exit(1);
  }

  const args = parseArgs(rest);
  if (args["help"]) {
    console.log(HELP);
    process.exit(0);
  }

  const mode = (args["mode"] as Mode) || "demo";
  if (!VALID_MODES.includes(mode)) {
    console.error(`invalid --mode '${mode}'. Valid: ${VALID_MODES.join(", ")}`);
    process.exit(1);
  }

  const dbUrl = (args["db"] as string) || process.env["SUPABASE_DB_URL"];
  const opts = {
    projectName: args["project"] as string | undefined,
    dbUrl,
    repoPath: args["repo"] as string | undefined,
    token: process.env["LOVABLE_TOKEN"],
  };

  const result = await runRecon(mode, opts, costRules);

  if (args["json"]) {
    const json = JSON.stringify(result, null, 2);
    if (typeof args["out"] === "string") writeFileSync(args["out"], json);
    else console.log(json);
    return;
  }

  const md = renderReport(result);
  if (typeof args["out"] === "string") {
    writeFileSync(args["out"], md);
    printSummary(result, args["out"] as string);
  } else {
    console.log(md);
  }
}

function printSummary(result: Awaited<ReturnType<typeof runRecon>>, outFile: string) {
  const { project, findings, score } = result;
  const bySev = (s: string) => findings.filter((f) => f.severity === s).length;
  console.log(`\n  recon · ${project.name} (${project.mode})`);
  console.log(`  waste-score ${score.wasteScore}/100 — ${score.headline}`);
  console.log(
    `  findings: ${findings.length}  (🔴 ${bySev("critical")}  🟠 ${bySev("high")}  🟡 ${bySev("medium")}  ⚪ ${bySev("low")})`,
  );
  if (result.warnings.length) console.log(`  warnings: ${result.warnings.length}`);
  console.log(`  report → ${outFile}\n`);
}

main().catch((err) => {
  console.error(`recon failed: ${(err as Error).message}`);
  process.exit(1);
});
