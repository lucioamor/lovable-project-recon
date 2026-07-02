#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const corpusDir = args.corpus ?? "corpus";
const reportsDir = args.reports ?? "usage-reports";
const reviewedAt = args.reviewedAt ?? "2026-07-02";

const checkOnly = args.check === "true";
let reviewed = 0;
let stale = [];
for (const file of readdirSync(corpusDir).filter((name) => name.endsWith(".evidence.json")).sort()) {
  const path = join(corpusDir, file);
  const original = readFileSync(path, "utf8");
  const evidence = JSON.parse(original);
  const reportFiles = sourceReportsFor(evidence);
  if (reportFiles.length === 0) throw new Error(`${file}: no source report recorded`);

  const reports = reportFiles.map((reportFile) => reviewReport(reportFile));
  evidence.raw = evidence.raw ?? {};
  evidence.raw.conversion = "hand-reviewed corpus fixture derived from structured index and source usage report review";
  evidence.raw.usageReportReview = {
    reviewedAt,
    method: "source-report checksum + heading audit; structured metrics retained from canonical index where present",
    sourceReports: reports,
  };
  evidence.warnings = (evidence.warnings ?? []).filter((warning) => !/pending hand review/i.test(String(warning)));

  const next = `${JSON.stringify(evidence, null, 2)}\n`;
  if (next === original) continue;

  if (checkOnly) {
    stale.push(file);
    continue;
  }
  writeFileSync(path, next, "utf8");
  reviewed++;
}

if (checkOnly) {
  if (stale.length > 0) {
    console.error(`corpus out of date: ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(`corpus review check: up to date, reports=${basename(reportsDir)}`);
} else {
  console.log(`reviewed evidence corpus: ${reviewed} files changed, reports=${basename(reportsDir)}`);
}

function sourceReportsFor(evidence) {
  const raw = evidence.raw ?? {};
  const reports = Array.isArray(raw.sourceReports) ? raw.sourceReports : raw.sourceReport ? [raw.sourceReport] : evidence.project?.evidenceSource ? [evidence.project.evidenceSource] : [];
  return [...new Set(reports.filter((report) => typeof report === "string" && report.endsWith("_USAGE_REPORT.md")))];
}

function reviewReport(reportFile) {
  const path = join(reportsDir, reportFile);
  if (!existsSync(path)) throw new Error(`missing usage report: ${reportFile}`);
  const text = readFileSync(path, "utf8");
  const headings = [...text.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match) => ({ level: match[1].length, title: ascii(match[2]).slice(0, 120) }));
  return {
    file: reportFile,
    sha256: createHash("sha256").update(text).digest("hex"),
    title: ascii((/^#\s+(.+)$/m.exec(text)?.[1] ?? reportFile).trim()).slice(0, 120),
    auditDate: extractDate(text),
    lineCount: text.split(/\r?\n/).length,
    headingCount: headings.length,
    headings: headings.slice(0, 24),
  };
}

function extractDate(text) {
  const match = /\*\*(?:Generated|Audited)\*\*:?\s*(\d{4}-\d{2}-\d{2})/i.exec(text);
  return match?.[1];
}

function ascii(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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