import type { Observation, Resource } from "../model.ts";
import type { Collected, CollectOptions } from "./types.ts";
import { AUDIT_QUERIES } from "../queries.ts";
import { cronRunsPerDay, looksLikeLogTable } from "../util.ts";

// Read-only collector. `pg` is an optional dependency, imported lazily so the demo path
// (and `npm ci --omit=optional`) never needs it.
export async function collectDb(opts: CollectOptions): Promise<Collected> {
  const dbUrl = opts.dbUrl;
  if (!dbUrl) throw new Error("db mode requires --db <connection-string> or SUPABASE_DB_URL");

  const pg = await importPg();
  const client = new pg.Client({ connectionString: dbUrl, application_name: "lovable-recon" });

  const NOW = new Date().toISOString();
  const resources: Resource[] = [];
  const observations: Observation[] = [];
  const raw: Record<string, unknown> = {};
  const warnings: string[] = [];

  await client.connect();
  try {
    // Hard read-only posture: no rule or query may mutate.
    await client.query("SET default_transaction_read_only = on");
    await client.query("SET statement_timeout = '15s'");
    await client.query("BEGIN TRANSACTION READ ONLY");

    for (const q of AUDIT_QUERIES) {
      try {
        const res = await client.query(q.sql);
        raw[q.name] = res.rows;
      } catch (err) {
        warnings.push(`query \`${q.name}\` (needs ${q.needs}) failed: ${(err as Error).message}`);
      }
    }
    await client.query("COMMIT");
  } finally {
    await client.end();
  }

  // --- map raw rows into the normalized model ---
  resources.push({ id: "cloud", kind: "cloud", name: "Lovable Cloud (Supabase)", attrs: { status: "active" } });

  const tables = (raw["tables"] as Array<{ table_name: string }>) ?? [];
  const sizes = (raw["table_sizes"] as Array<{ relname: string; total_bytes: string }>) ?? [];
  const sizeByName = new Map(sizes.map((r) => [r.relname, Number(r.total_bytes)]));
  for (const t of tables) {
    const bytes = sizeByName.get(t.table_name) ?? 0;
    resources.push({
      id: `table:${t.table_name}`,
      kind: "table",
      name: t.table_name,
      attrs: { totalBytes: bytes, isLog: looksLikeLogTable(t.table_name), retention: undefined },
    });
    if (bytes) observations.push({ resourceId: `table:${t.table_name}`, metric: "total_bytes", value: bytes, measuredAt: NOW });
  }

  const crons = (raw["cron_jobs"] as Array<{ jobname: string; schedule: string; active: boolean; command: string }>) ?? [];
  for (const c of crons) {
    resources.push({
      id: `cron_job:${c.jobname}`,
      kind: "cron_job",
      name: c.jobname,
      attrs: { schedule: c.schedule, active: c.active, command: c.command, runsPerDay: cronRunsPerDay(c.schedule) },
    });
  }

  const policies = (raw["rls_policies"] as Array<{ tablename: string; policyname: string; cmd: string; roles: string; qual: string }>) ?? [];
  for (const p of policies) {
    resources.push({
      id: `rls_policy:${p.tablename}.${p.policyname}`,
      kind: "rls_policy",
      name: `${p.tablename} — ${p.policyname}`,
      attrs: { table: p.tablename, cmd: p.cmd, roles: p.roles, qual: p.qual },
    });
  }

  const aiCfg = (raw["ai_config"] as Array<Record<string, unknown>>) ?? [];
  if (aiCfg.length && aiCfg[0]) {
    resources.push({
      id: "ai_config",
      kind: "ai_config",
      name: "ai_config",
      attrs: { model: aiCfg[0]["model"], maxCostUsd: aiCfg[0]["max_cost_usd"] ?? null },
    });
  }

  return {
    project: {
      name: opts.projectName ?? "lovable-project",
      stack: "Lovable Cloud (Supabase)",
      mode: "db",
      scannedAt: NOW,
    },
    resources,
    observations,
    raw,
    warnings,
  };
}

type PgModule = { Client: new (cfg: Record<string, unknown>) => PgClient };
type PgClient = {
  connect(): Promise<void>;
  query(sql: string): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
};

async function importPg(): Promise<PgModule> {
  try {
    const mod = (await import("pg")) as unknown as { default?: PgModule } & PgModule;
    return (mod.default ?? mod) as PgModule;
  } catch {
    throw new Error("`pg` is not installed. Run `npm install` (it is an optional dependency used only by db mode).");
  }
}
