import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const BIG_LOG_BYTES = 20 * 1024 * 1024; // 20 MB

// POL-2 — Log & raw-payload retention. Driver category C (unbounded logs / raw payloads).
export const pol2LogRetention: Rule = {
  id: "POL-2",
  policy: "Log & raw-payload retention",
  evaluate(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const tables = ctx.resourcesByKind("table");

    // Rank by size so we can call out "one table dominates the DB".
    const sized = tables.map((t) => ({ t, bytes: typeof t.attrs["totalBytes"] === "number" ? (t.attrs["totalBytes"] as number) : 0 })).sort((a, b) => b.bytes - a.bytes);
    const sumBytes = sized.reduce((s, x) => s + x.bytes, 0);
    const project = ctx.resourceById("project");
    const dbTotal = typeof project?.attrs["dbTotalBytes"] === "number" ? (project.attrs["dbTotalBytes"] as number) : 0;
    // Prefer a real DB total so "% of DB" is honest even when only a few tables are modeled.
    const totalBytes = Math.max(dbTotal, sumBytes) || 1;

    for (const { t, bytes } of sized) {
      const isLog = t.attrs["isLog"] === true;
      const hasRetention = t.attrs["retention"] === true;
      if (!isLog || hasRetention) continue;
      if (bytes < BIG_LOG_BYTES) continue;

      const share = Math.round((bytes / totalBytes) * 100);
      const mb = Math.round(bytes / 1024 / 1024);
      findings.push({
        id: `POL-2:${t.name}`,
        policy: "POL-2",
        driverCat: "C",
        title: `Unbounded log/raw table \`${t.name}\` (${mb} MB${share >= 40 ? `, ${share}% of DB` : ""})`,
        severity: share >= 50 || mb >= 100 ? "high" : "medium",
        confidence: "confirmed",
        resourceId: t.id,
        rationale:
          `\`${t.name}\` is an append-only log/raw table with no retention policy. Growth here is never ` +
          `healthy data-model growth — it is storage + backup bloat and per-insert index overhead. ` +
          `Almost every larger Lovable DB is dominated by exactly one table like this.`,
        evidence: [{ source: "sql", detail: `${mb} MB, ${share}% of public schema`, snippet: "SELECT relname, pg_total_relation_size(c.oid) FROM pg_class c ... ORDER BY 2 DESC;" }],
        remediation: [
          {
            kind: "sql_migration",
            title: `Add retention to \`${t.name}\``,
            body:
              `-- keep a bounded window (tune interval); schedule as a daily job\n` +
              `DELETE FROM ${t.name} WHERE created_at < now() - interval '30 days';\n` +
              `VACUUM ANALYZE ${t.name};\n` +
              `-- if this is raw HTML/blobs: move payloads to Storage with a file_size_limit instead.`,
            estCreditsSaved: `${mb} MB reclaimed + lower write overhead`,
            applySafe: false,
          },
        ],
        estCreditsSaved: `${mb} MB`,
      });
    }
    return findings;
  },
};
