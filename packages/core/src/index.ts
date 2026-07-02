// Public API of @nxlv-ai/lovable-core.

export * from "./model.ts";
export * from "./engine.ts";
export { scoreFindings } from "./score.ts";
export { renderReport } from "./report.ts";
export { buildCleanPlan, renderCleanPlan } from "./clean.ts";
export type { CleanPlan, CleanPlanAction } from "./clean.ts";
export { AUDIT_QUERIES } from "./queries.ts";
export type { AuditQuery } from "./queries.ts";
export { cronRunsPerDay, looksLikeLogTable, humanBytes, redactSecrets } from "./util.ts";
export type { Collected, Collector, CollectOptions } from "./collect/types.ts";
export { collectDemo } from "./collect/demo.ts";
export { collectDb } from "./collect/db.ts";
export { collectStatic } from "./collect/static.ts";
export { collectIndex, indexCollectedToEvidence, listIndexProjects } from "./collect/index-json.ts";
export { collectEvidence, evidenceToCollected, listEvidenceFiles, readEvidenceFile } from "./collect/evidence.ts";
export { collectPortfolio } from "./collect/portfolio.ts";
export { PROJECT_EVIDENCE_SCHEMA_VERSION, validateProjectEvidence } from "./evidence-schema.ts";
export type { ProjectEvidence } from "./evidence-schema.ts";

import type { Mode, ReconResult } from "./model.ts";
import type { Rule } from "./engine.ts";
import type { Collected, CollectOptions } from "./collect/types.ts";
import { runRules } from "./engine.ts";
import { scoreFindings } from "./score.ts";
import { collectDemo } from "./collect/demo.ts";
import { collectDb } from "./collect/db.ts";
import { collectStatic } from "./collect/static.ts";
import { collectIndex } from "./collect/index-json.ts";
import { collectEvidence } from "./collect/evidence.ts";
import { collectPortfolio } from "./collect/portfolio.ts";

const COLLECTORS: Record<Mode, (o: CollectOptions) => Promise<Collected>> = {
  demo: collectDemo,
  db: collectDb,
  static: collectStatic,
  index: collectIndex,
  evidence: collectEvidence,
  corpus: collectUnsupported("corpus"),
  portfolio: collectPortfolio,
};

/** Orchestrates the read-only pipeline: collect → detect → score. */
export async function runRecon(mode: Mode, opts: CollectOptions, rules: Rule[]): Promise<ReconResult> {
  const collect = COLLECTORS[mode];
  if (!collect) throw new Error(`unknown mode: ${mode}`);
  const collected = await collect(opts);
  const findings = runRules(rules, collected);
  const assessed = collected.assessed !== false;
  const score = scoreFindings(findings, { assessed });
  return {
    project: collected.project,
    resources: collected.resources,
    observations: collected.observations,
    findings,
    score,
    warnings: collected.warnings,
    importedActions: collected.importedActions ?? [],
    intent: collected.intent ?? opts.intent,
    assessed,
  };
}

function collectUnsupported(mode: Mode): (o: CollectOptions) => Promise<Collected> {
  return async () => {
    throw new Error(`${mode} mode is typed for the evidence schema milestone but is not implemented yet`);
  };
}
