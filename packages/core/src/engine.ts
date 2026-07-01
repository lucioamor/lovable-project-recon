import type { Finding, Observation, Resource, ResourceKind } from "./model.ts";
import type { Collected } from "./collect/types.ts";

/** Read-only view of collected evidence, handed to each rule. */
export interface RuleContext {
  collected: Collected;
  resourcesByKind(kind: ResourceKind): Resource[];
  resourceById(id: string): Resource | undefined;
  observations(metric?: string): Observation[];
  observationFor(resourceId: string, metric: string): Observation | undefined;
  raw<T = unknown>(key: string): T | undefined;
}

export interface Rule {
  id: string; // e.g. "POL-1"
  policy: string; // human title of the policy
  /** Pure: reads context, returns findings. Never mutates anything. */
  evaluate(ctx: RuleContext): Finding[];
}

export function buildContext(collected: Collected): RuleContext {
  const byId = new Map(collected.resources.map((r) => [r.id, r]));
  return {
    collected,
    resourcesByKind: (kind) => collected.resources.filter((r) => r.kind === kind),
    resourceById: (id) => byId.get(id),
    observations: (metric) =>
      metric === undefined
        ? collected.observations
        : collected.observations.filter((o) => o.metric === metric),
    observationFor: (resourceId, metric) =>
      collected.observations.find((o) => o.resourceId === resourceId && o.metric === metric),
    raw: <T = unknown>(key: string) => collected.raw[key] as T | undefined,
  };
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function runRules(rules: Rule[], collected: Collected): Finding[] {
  const ctx = buildContext(collected);
  const findings: Finding[] = [];
  for (const rule of rules) {
    try {
      findings.push(...rule.evaluate(ctx));
    } catch (err) {
      // A broken rule must never abort the scan.
      collected.warnings.push(`rule ${rule.id} threw: ${(err as Error).message}`);
    }
  }
  return findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
