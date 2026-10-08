import type { Finding, Resource, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const UPDATE_INSERT_RATIO = 5;
const MIN_UPDATES = 1000;

// POL-7: Write-amplification & trigger discipline. Driver category D.
export const pol7WriteAmplification: Rule = {
  id: "POL-7",
  policy: "Write-amplification & trigger discipline",
  evaluate(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const trigger of ctx.resourcesByKind("trigger")) {
      const fanout = triggerFanout(trigger);
      if (!fanout) continue;
      findings.push({
        id: `POL-7:trigger:${trigger.name}`,
        policy: "POL-7",
        driverCat: "D",
        title: `Trigger fan-out from \`${tableName(trigger)}\` via \`${trigger.name}\``,
        severity: "medium",
        confidence: "confirmed",
        resourceId: trigger.id,
        rationale:
          `Trigger \`${trigger.name}\` performs write fan-out (${fanout.targets.join(", ")}). ` +
          "Per-row trigger writes multiply every insert/update into extra database work and can dominate cost when users or jobs batch changes.",
        evidence: [{ source: "sql", detail: `trigger writes to ${fanout.targets.join(", ")}`, snippet: trimSql(String(trigger.attrs["functionDef"] ?? trigger.attrs["triggerDef"] ?? "")) }],
        remediation: [
          {
            kind: "manual",
            title: "Move trigger fan-out behind a queue or digest",
            body: "Replace per-row trigger fan-out with a queue table, batch job, or digest. Keep only cheap invariant checks in synchronous triggers.",
            applySafe: false,
          },
        ],
      });
    }

    for (const table of ctx.resourcesByKind("table")) {
      const inserted = num(table.attrs["nTupIns"]);
      const updated = num(table.attrs["nTupUpd"]);
      if (inserted === undefined || updated === undefined || updated < MIN_UPDATES) continue;
      const ratio = inserted === 0 ? updated : updated / Math.max(1, inserted);
      if (ratio < UPDATE_INSERT_RATIO) continue;
      findings.push({
        id: `POL-7:update-ratio:${table.name}`,
        policy: "POL-7",
        driverCat: "D",
        title: `High write amplification on \`${table.name}\` (${Math.round(ratio)}x updates/inserts)`,
        severity: "medium",
        confidence: "hypothesis",
        resourceId: table.id,
        rationale:
          `Postgres stats show ${updated} updates vs ${inserted} inserts on \`${table.name}\`. ` +
          "A high update/insert ratio often means progress polling, delete-and-reinsert loops, or trigger-maintained aggregates doing repeated work.",
        evidence: [{ source: "sql", detail: `pg_stat_user_tables n_tup_upd=${updated}, n_tup_ins=${inserted}` }],
        remediation: [
          {
            kind: "manual",
            title: "Batch or upsert repeated writes",
            body: "Inspect the hottest writers for progress loops and aggregate refreshes. Batch updates, use idempotent upserts, and avoid delete-all+reinsert patterns.",
            applySafe: false,
          },
        ],
      });
    }

    return findings;
  },
};

function triggerFanout(trigger: Resource): { targets: string[] } | undefined {
  const table = tableName(trigger).toLowerCase();
  const body = String(trigger.attrs["functionDef"] ?? "");
  if (!body) return undefined;
  if (isUpdatedAtOnly(body)) return undefined;
  const targets = [...body.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/gi)]
    .map((m) => m[1])
    .filter((target): target is string => Boolean(target))
    .filter((target) => target.toLowerCase() !== table);
  return targets.length ? { targets: [...new Set(targets)] } : undefined;
}

function isUpdatedAtOnly(body: string): boolean {
  return /\bnew\.updated_at\b/i.test(body) && !/\b(?:insert\s+into|update|delete\s+from)\s+/i.test(body);
}

function tableName(trigger: Resource): string {
  const table = trigger.attrs["table"];
  return typeof table === "string" ? table : (trigger.name.split(".")[0] ?? trigger.name);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function trimSql(sql: string): string {
  const compact = sql.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? compact.slice(0, 237) + "..." : compact;
}
