import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Collected, CollectOptions } from "./types.ts";
import { validateProjectEvidence, type ProjectEvidence } from "../evidence-schema.ts";

export async function collectEvidence(opts: CollectOptions): Promise<Collected> {
  if (!opts.evidencePath) throw new Error("evidence mode requires --evidence <project.evidence.json>");
  return evidenceToCollected(readEvidenceFile(opts.evidencePath), opts.evidencePath);
}

export function readEvidenceFile(path: string): ProjectEvidence {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const validation = validateProjectEvidence(parsed);
  if (!validation.ok) throw new Error(`invalid ProjectEvidence in ${path}: ${validation.errors.join("; ")}`);
  return validation.evidence;
}

export function listEvidenceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isFile() && entry.endsWith(".evidence.json")) files.push(full);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function evidenceToCollected(evidence: ProjectEvidence, sourcePath: string): Collected {
  const scannedAt = new Date().toISOString();
  const warnings = [...(evidence.warnings ?? [])];
  const generated = evidence.project.evidenceGenerated;
  const ageDays = evidenceAgeDays(generated, scannedAt);
  if (ageDays !== undefined && ageDays > 30) warnings.push(`evidence generated ${generated} is ${ageDays} days old; idle/baseline conclusions may be stale`);

  return {
    project: {
      name: evidence.project.name,
      supabaseRef: evidence.project.supabaseRef,
      stack: evidence.project.stack,
      mode: "evidence",
      scannedAt,
      evidenceGenerated: generated,
      evidenceSource: evidence.project.evidenceSource ?? sourcePath,
    },
    resources: evidence.resources,
    observations: evidence.observations,
    raw: { evidence: { sourcePath, schemaVersion: evidence.schemaVersion, ...(evidence.raw ?? {}) } },
    warnings,
    importedActions: evidence.importedActions ?? [],
  };
}

function evidenceAgeDays(generated: string, scannedAt: string): number | undefined {
  const generatedMs = Date.parse(`${generated.slice(0, 10)}T00:00:00.000Z`);
  const scannedMs = Date.parse(`${scannedAt.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(generatedMs) || !Number.isFinite(scannedMs)) return undefined;
  return Math.max(0, Math.floor((scannedMs - generatedMs) / (24 * 60 * 60 * 1000)));
}
