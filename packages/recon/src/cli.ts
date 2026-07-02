#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { renderPortfolioReport } from "@nxlv-ai/lovable-benchmarks";
import { applyCleanPlan, buildCleanPlan, runEvidencePortfolio, runIndexPortfolio, runRecon, renderCleanPlan, renderReport, redactSecrets, type Mode } from "@nxlv-ai/lovable-core";
import { costRules } from "@nxlv-ai/lovable-profile-cost";

const VALID_MODES: Mode[] = ["demo", "db", "static", "index", "evidence", "corpus", "portfolio"];

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

const HELP = `recon - runtime-waste recon for Lovable Cloud portfolios

Usage:
  recon scan [options]
  recon clean [options]

Options:
  --mode <demo|db|static|index|evidence|corpus|portfolio>   evidence source (default: demo)
  --db <connection-string>            read-only Postgres URL (or env SUPABASE_DB_URL)
  --repo <path>                       path to a Lovable checkout (required by --mode static)
  --index <file>                      structured lovable_projects_index.json (required by --mode index)
  --evidence <file>                   ProjectEvidence JSON (required by --mode evidence)
  --dir <dir>                         directory of *.evidence.json files (required by --mode corpus/portfolio)
  --project <name|id>                 project label or index project id
  --intent <file>                     project intent / roadmap context to attach to the result
  --fail-on <critical|high|medium|low> exit 1 when findings meet or exceed severity
  --apply                             request clean apply; refused unless actions are auto-applicable
  --dry-run                           force planning only (default for clean)
  --out <file>                        write the Markdown report to a file
  --json                              print raw result/plan as JSON instead of Markdown
  --help                              show this help

Examples:
  recon scan --mode demo --out ./central-genial_USAGE_REPORT.md
  recon scan --mode db --project my-app --db "postgresql://readonly:...@db.<ref>.supabase.co:5432/postgres"
  recon scan --mode static --repo ./my-lovable-app --out ./my-app_STATIC_REPORT.md
  recon scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor
  recon scan --mode index --index usage-reports/lovable_projects_index.json --out ./PORTFOLIO_REPORT.md
  recon scan --mode evidence --evidence corpus/central-genial.evidence.json
  recon scan --mode corpus --dir corpus --out ./CORPUS_REPORT.md
  recon scan --mode portfolio --dir corpus --out ./PORTFOLIO_REPORT.md
  recon clean --mode demo
  recon clean --mode evidence --evidence corpus/central-genial.evidence.json
`;

async function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "--help" || command === "help") {
    console.log(HELP);
    process.exit(command ? 0 : 1);
  }
  if (command !== "scan" && command !== "clean") {
    console.error(`unknown command: ${command}\n`);
    console.log(HELP);
    process.exit(1);
  }

  const args = parseArgs(rest);
  const KNOWN = new Set(["mode", "db", "project", "out", "json", "repo", "index", "evidence", "dir", "intent", "fail-on", "apply", "dry-run", "help"]);
  for (const k of Object.keys(args)) {
    if (!KNOWN.has(k)) {
      const msg = `unknown flag --${k}`;
      if (command === "clean") {
        console.error(msg);
        process.exit(2);
      }
      console.error(`warning: ${msg} (ignored)`);
    }
  }
  if (args["out"] === true) {
    console.error("--out requires a file path");
    process.exit(1);
  }
  if (args["intent"] === true) {
    console.error("--intent requires a file path");
    process.exit(1);
  }
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
  const intent = typeof args["intent"] === "string" ? { source: args["intent"], body: readFileSync(args["intent"], "utf8") } : undefined;
  if (mode === "index" && args["index"] === true) {
    console.error("--index requires a file path");
    process.exit(1);
  }
  if (mode === "evidence" && args["evidence"] === true) {
    console.error("--evidence requires a file path");
    process.exit(1);
  }
  if ((mode === "corpus" || mode === "portfolio") && args["dir"] === true) {
    console.error("--dir requires a directory path");
    process.exit(1);
  }
  if (args["apply"] && args["dry-run"]) {
    console.error("--apply cannot be combined with --dry-run");
    process.exit(2);
  }

  const opts = {
    projectName: args["project"] as string | undefined,
    projectId: args["project"] as string | undefined,
    dbUrl,
    repoPath: args["repo"] as string | undefined,
    indexPath: args["index"] as string | undefined,
    evidencePath: args["evidence"] as string | undefined,
    intent,
    token: process.env["LOVABLE_TOKEN"],
  };

  if (command === "clean") {
    if (mode === "corpus" || mode === "portfolio") {
      console.error("clean does not support corpus/portfolio fan-out; run clean against one project evidence source at a time");
      process.exit(1);
    }
    if (mode === "index" && typeof args["index"] === "string" && !args["project"]) {
      console.error("clean index mode requires --project <id>");
      process.exit(1);
    }

    const result = await runRecon(mode, opts, costRules);
    const plan = buildCleanPlan(result, { apply: args["apply"] === true });
    const output = args["json"] ? redactSecrets(JSON.stringify(plan, null, 2)) : renderCleanPlan(plan);
    if (typeof args["out"] === "string") writeFileSync(args["out"], output);
    else console.log(output);

    if (args["apply"] === true) {
      if (plan.eligibleActions.length === 0) {
        console.error("clean --apply refused: no confirmed remediation is marked auto-applicable");
        process.exit(2);
      }
      try {
        await applyCleanPlan(plan, { before: result, verify: () => runRecon(mode, opts, costRules) });
      } catch (err) {
        console.error((err as Error).message);
        process.exit(2);
      }
    }
    return;
  }
  if (mode === "index" && typeof args["index"] === "string" && !args["project"]) {
    const results = await runIndexPortfolio(args["index"], costRules, { intent });
    if (args["json"]) {
      const json = redactSecrets(JSON.stringify(results, null, 2));
      if (typeof args["out"] === "string") writeFileSync(args["out"], json);
      else console.log(json);
      exitForFailOn(
        results.flatMap((r) => r.findings),
        args["fail-on"],
      );
      return;
    }
    const md = renderPortfolioReport(results, { sourceMode: "index" });
    if (typeof args["out"] === "string") {
      writeFileSync(args["out"], md);
      printPortfolioSummary(results, args["out"]);
    } else {
      console.log(md);
    }
    exitForFailOn(
      results.flatMap((r) => r.findings),
      args["fail-on"],
    );
    return;
  }
  if (mode === "corpus" || mode === "portfolio") {
    if (typeof args["dir"] !== "string") {
      console.error(`${mode} mode requires --dir <corpus-directory>`);
      process.exit(1);
    }
    const results = await runEvidencePortfolio(args["dir"], costRules, { intent });
    if (args["json"]) {
      const json = redactSecrets(JSON.stringify(results, null, 2));
      if (typeof args["out"] === "string") writeFileSync(args["out"], json);
      else console.log(json);
      exitForFailOn(
        results.flatMap((r) => r.findings),
        args["fail-on"],
      );
      return;
    }
    const md = renderPortfolioReport(results, { sourceMode: mode });
    if (typeof args["out"] === "string") {
      writeFileSync(args["out"], md);
      printPortfolioSummary(results, args["out"]);
    } else {
      console.log(md);
    }
    exitForFailOn(
      results.flatMap((r) => r.findings),
      args["fail-on"],
    );
    return;
  }
  const result = await runRecon(mode, opts, costRules);

  if (args["json"]) {
    const json = redactSecrets(JSON.stringify(result, null, 2));
    if (typeof args["out"] === "string") writeFileSync(args["out"], json);
    else console.log(json);
    exitForFailOn(result.findings, args["fail-on"]);
    return;
  }

  const md = renderReport(result);
  if (typeof args["out"] === "string") {
    writeFileSync(args["out"], md);
    printSummary(result, args["out"] as string);
  } else {
    console.log(md);
  }
  exitForFailOn(result.findings, args["fail-on"]);
}

function printSummary(result: Awaited<ReturnType<typeof runRecon>>, outFile: string) {
  const { project, findings, score } = result;
  const bySev = (s: string) => findings.filter((f) => f.severity === s).length;
  console.log(`\n  recon - ${project.name} (${project.mode})`);
  console.log(`  waste-score ${score.wasteScore}/100 - ${score.headline}`);
  console.log(`  findings: ${findings.length}  (critical ${bySev("critical")}  high ${bySev("high")}  medium ${bySev("medium")}  low ${bySev("low")})`);
  if (result.warnings.length) console.log(`  warnings: ${result.warnings.length}`);
  console.log(`  report -> ${outFile}\n`);
}

function printPortfolioSummary(results: Array<Awaited<ReturnType<typeof runRecon>>>, outFile: string) {
  const findings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const actions = results.reduce((sum, r) => sum + r.importedActions.length, 0);
  console.log(`\n  recon portfolio - ${results.length} projects`);
  console.log(`  findings: ${findings}  imported actions: ${actions}`);
  console.log(`  report -> ${outFile}\n`);
}

type FindingLike = Awaited<ReturnType<typeof runRecon>>["findings"][number];

const FAIL_ON_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

function exitForFailOn(findings: FindingLike[], failOn: string | boolean | undefined): void {
  if (failOn === undefined || failOn === false) return;
  if (failOn === true || !(failOn in FAIL_ON_ORDER)) {
    console.error(`--fail-on must be one of: ${Object.keys(FAIL_ON_ORDER).join(", ")}`);
    process.exit(2);
  }
  const threshold = FAIL_ON_ORDER[failOn as keyof typeof FAIL_ON_ORDER];
  if (findings.some((finding) => FAIL_ON_ORDER[finding.severity] <= threshold)) process.exit(1);
}

main().catch((err) => {
  console.error(`recon failed: ${(err as Error).message}`);
  process.exit(1);
});
