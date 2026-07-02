#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { collectIndex, indexCollectedToEvidence, listIndexProjects, validateProjectEvidence } from "../packages/core/src/index.ts";

const args = parseArgs(process.argv.slice(2));
const indexPath = args.index ?? "usage-reports/lovable_projects_index.json";
const outDir = args.out ?? "corpus";
const reportsDir = args.reports ?? "usage-reports";
const force = args.force === "true";

mkdirSync(outDir, { recursive: true });
const reports = listUsageReports(reportsDir);
let written = 0;
let skipped = 0;

for (const project of listIndexProjects(indexPath)) {
  const outPath = join(outDir, `${project.id}.evidence.json`);
  if (existsSync(outPath) && !force) {
    skipped++;
    continue;
  }

  const collected = await collectIndex({ indexPath, projectId: project.id });
  const evidence = indexCollectedToEvidence(collected, {
    projectId: project.id,
    indexPath,
    sourceReports: reportsForProject(project.id, reports),
  });
  const validation = validateProjectEvidence(evidence);
  if (!validation.ok) throw new Error(`generated invalid evidence for ${project.id}: ${validation.errors.join("; ")}`);
  writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");
  written++;
}

console.log(`seeded evidence corpus: ${written} written, ${skipped} skipped, source=${basename(indexPath)}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

function listUsageReports(dir) {
  return readdirSync(dir)
    .filter((file) => /_USAGE_REPORT\.md$/i.test(file))
    .map((file) => ({ file, slug: slug(file.replace(/_USAGE_REPORT\.md$/i, "")) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function reportsForProject(projectId, reports) {
  const aliases = {
    "go-do-it": ["Go_Do_It_USAGE_REPORT.md", "godoit_USAGE_REPORT.md"],
    "lucio-amorim": ["Lucio_Amorim_USAGE_REPORT.md"],
    nxlv: ["nxlv_USAGE_REPORT.md"],
  };
  const aliased = aliases[projectId];
  if (aliased) return aliased.filter((file) => reports.some((report) => report.file === file));
  return reports.filter((report) => report.slug === projectId).map((report) => report.file);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
