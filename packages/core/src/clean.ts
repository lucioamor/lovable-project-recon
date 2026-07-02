import type { Finding, ProjectMeta, RemediationAction, Severity } from "./model.ts";
import type { ReconResult } from "./model.ts";

export interface CleanPlanAction {
  findingId: string;
  policy: string;
  findingTitle: string;
  severity: Severity;
  resourceId: string;
  action: RemediationAction;
}

export interface CleanPlan {
  project: ProjectMeta;
  generatedAt: string;
  applyRequested: boolean;
  dryRun: boolean;
  confirmedFindings: number;
  skippedHypotheses: number;
  eligibleActions: CleanPlanAction[];
  blockedActions: CleanPlanAction[];
  warnings: string[];
}

export function buildCleanPlan(result: ReconResult, opts: { apply?: boolean; generatedAt?: string } = {}): CleanPlan {
  const eligibleActions: CleanPlanAction[] = [];
  const blockedActions: CleanPlanAction[] = [];
  let confirmedFindings = 0;
  let skippedHypotheses = 0;

  for (const finding of result.findings) {
    if (finding.confidence !== "confirmed") {
      skippedHypotheses++;
      continue;
    }
    confirmedFindings++;
    for (const action of finding.remediation) {
      const planAction = toPlanAction(finding, action);
      if (action.applySafe) eligibleActions.push(planAction);
      else blockedActions.push(planAction);
    }
  }

  const applyRequested = opts.apply === true;
  const warnings = [...result.warnings];
  if (applyRequested && eligibleActions.length === 0) warnings.push("--apply requested, but no confirmed remediation is marked applySafe");

  return {
    project: result.project,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    applyRequested,
    dryRun: !applyRequested,
    confirmedFindings,
    skippedHypotheses,
    eligibleActions,
    blockedActions,
    warnings,
  };
}

export function renderCleanPlan(plan: CleanPlan): string {
  const L: string[] = [];
  L.push(`# ${plan.project.name} - Recon Clean Plan`);
  L.push("");
  L.push(`**Mode:** ${plan.applyRequested ? "apply requested" : "dry-run"}`);
  L.push(`**Generated:** ${plan.generatedAt.slice(0, 10)}`);
  L.push("");
  L.push(`Confirmed findings: ${plan.confirmedFindings}`);
  L.push(`Skipped hypotheses: ${plan.skippedHypotheses}`);
  L.push(`Auto-applicable actions: ${plan.eligibleActions.length}`);
  L.push(`Review-required actions: ${plan.blockedActions.length}`);
  L.push("");
  if (plan.dryRun) {
    L.push("No changes applied. Use `--apply` only after reviewing this plan.");
    L.push("");
  }

  L.push("## Auto-applicable actions");
  L.push("");
  if (plan.eligibleActions.length === 0) {
    L.push("_None._");
  } else {
    L.push(renderActions(plan.eligibleActions));
  }
  L.push("");

  L.push("## Review-required actions");
  L.push("");
  if (plan.blockedActions.length === 0) {
    L.push("_None._");
  } else {
    L.push(renderActions(plan.blockedActions));
  }
  L.push("");

  if (plan.warnings.length) {
    L.push("## Warnings");
    L.push("");
    for (const warning of plan.warnings) L.push(`- ${warning}`);
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("_`recon clean` only plans confirmed remediations. Hypotheses and review-required actions are never applied automatically._");
  L.push("");
  return L.join("\n");
}

function toPlanAction(finding: Finding, action: RemediationAction): CleanPlanAction {
  return {
    findingId: finding.id,
    policy: finding.policy,
    findingTitle: finding.title,
    severity: finding.severity,
    resourceId: finding.resourceId,
    action,
  };
}

function renderActions(actions: CleanPlanAction[]): string {
  const rows = ["| Policy | Severity | Finding | Action | Kind | Apply |", "|---|---|---|---|---|---|"];
  for (const item of actions) {
    rows.push(`| ${item.policy} | ${item.severity} | ${escapeCell(item.findingTitle)} | ${escapeCell(item.action.title)} | ${item.action.kind} | ${item.action.applySafe ? "yes" : "review"} |`);
  }
  return rows.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}
