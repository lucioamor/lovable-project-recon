import type { Finding, RiskScore, Severity } from "./model.ts";

const WEIGHT: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
};

// Hypotheses count less than confirmed evidence.
const CONFIDENCE_FACTOR = { confirmed: 1, hypothesis: 0.5 } as const;

/**
 * Waste-score 0..100. Deliberately saturating: a handful of confirmed high/critical
 * findings should already read as "clean now". The absolute number matters less than
 * the ranking across a portfolio (that comparison is the M2 benchmarks job).
 */
export function scoreFindings(findings: Finding[], opts?: { assessed?: boolean }): RiskScore {
  const byPolicy = new Map<string, { points: number; count: number }>();
  let raw = 0;

  for (const f of findings) {
    const pts = WEIGHT[f.severity] * CONFIDENCE_FACTOR[f.confidence];
    raw += pts;
    const cur = byPolicy.get(f.policy) ?? { points: 0, count: 0 };
    cur.points += pts;
    cur.count += 1;
    byPolicy.set(f.policy, cur);
  }

  // squashing curve so the score is bounded and comparable
  const wasteScore = Math.round(100 * (1 - Math.exp(-raw / 60)));

  const breakdown = [...byPolicy.entries()].map(([policy, v]) => ({ policy, points: Math.round(v.points), count: v.count })).sort((a, b) => b.points - a.points);

  return { wasteScore, breakdown, headline: headlineFor(wasteScore, findings, opts?.assessed !== false) };
}

function headlineFor(score: number, findings: Finding[], assessed: boolean): string {
  if (!assessed && findings.length === 0) return "Not assessed — collector is incomplete (stub). Runtime was not evaluated.";
  const crit = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  if (findings.length === 0) return "No waste findings — runtime looks clean.";
  if (score >= 70 || crit > 0) return `Clean up now — ${crit} critical, ${high} high finding(s).`;
  if (score >= 35) return `Worth a pass — ${high} high finding(s).`;
  return "Mostly healthy — minor hygiene only.";
}
