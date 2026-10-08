import type { Observation, Resource } from "../model.ts";
import type { Collected, CollectOptions } from "./types.ts";
import { AUDIT_QUERIES } from "../queries.ts";
import { cronRunsPerDay, looksLikeLogTable } from "../util.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  // --- map raw rows into the normalized model (defensive: shapes are best-effort) ---
  resources.push({ id: "cloud", kind: "cloud", name: "Lovable Cloud (Supabase)", attrs: { status: "active" } });

  const tables = rowsOf(raw["tables"]);
  const sizes = rowsOf(raw["table_sizes"]);
  const crons = rowsOf(raw["cron_jobs"]);
  const cronRunDetails = rowsOf(raw["cron_run_details"]);
  const httpResponses = rowsOf(raw["http_responses"]);
  const tableStats = rowsOf(raw["table_stats"]);
  const triggers = rowsOf(raw["triggers"]);
  const policies = rowsOf(raw["rls_policies"]);
  const aiCfg = rowsOf(raw["ai_config"]);

  // Honesty about coverage: an empty result usually means the query was blocked or the
  // extension/schema is not exposed to the read-only role — not that the resource is absent.
  if (tables.length === 0) warnings.push("no rows from `tables` — public schema may be inaccessible to this role; table findings will be empty");
  if (crons.length === 0) warnings.push("no rows from `cron_jobs` — the `cron` schema (pg_cron) may not be exposed; POL-1/POL-6 cannot run");
  // A DB scan cannot see the dominant credit driver (Build-mode, ~62% of spend per the
  // landscape §9). Be explicit rather than implying the report is the whole cost picture.
  warnings.push("db mode measures runtime waste only — Build-mode credit burn (the largest cost line) is not visible without the credits API");

  // Tables + sizes. Guard against NULL/non-numeric byte counts from pg_total_relation_size.
  const sizeByName = new Map<string, number>();
  for (const r of sizes) {
    const name = str(r["relname"]);
    if (name) sizeByName.set(name, toInt(r["total_bytes"]));
  }
  const statsByName = new Map<string, Record<string, unknown>>();
  for (const r of tableStats) {
    const name = str(r["relname"]);
    if (name) statsByName.set(name, r);
  }

  // Infer retention: a table referenced by a DELETE/TRUNCATE in any cron command is being
  // actively pruned, so it should not be flagged as "unbounded" by POL-2.
  const prunedTables = tablesPrunedByCron(crons);

  for (const t of tables) {
    const name = str(t["table_name"]);
    if (!name) continue;
    const bytes = sizeByName.get(name) ?? 0;
    const stats = statsByName.get(bareName(name));
    const hasRetention = prunedTables.has(bareName(name).toLowerCase());
    const nLiveTup = toInt(stats?.["n_live_tup"]);
    const nTupIns = toInt(stats?.["n_tup_ins"]);
    const nTupUpd = toInt(stats?.["n_tup_upd"]);
    const nTupDel = toInt(stats?.["n_tup_del"]);
    resources.push({
      id: `table:${name}`,
      kind: "table",
      name,
      attrs: {
        totalBytes: bytes,
        isLog: looksLikeLogTable(name),
        retention: hasRetention ? true : undefined,
        rows: nLiveTup || undefined,
        nTupIns: nTupIns || undefined,
        nTupUpd: nTupUpd || undefined,
        nTupDel: nTupDel || undefined,
      },
    });
    if (bytes > 0) observations.push({ resourceId: `table:${name}`, metric: "total_bytes", value: bytes, measuredAt: NOW });
    if (nLiveTup > 0) observations.push({ resourceId: `table:${name}`, metric: "n_live_tup", value: nLiveTup, measuredAt: NOW });
    if (nTupIns > 0) observations.push({ resourceId: `table:${name}`, metric: "n_tup_ins", value: nTupIns, measuredAt: NOW });
    if (nTupUpd > 0) observations.push({ resourceId: `table:${name}`, metric: "n_tup_upd", value: nTupUpd, measuredAt: NOW });
    if (nTupDel > 0) observations.push({ resourceId: `table:${name}`, metric: "n_tup_del", value: nTupDel, measuredAt: NOW });
  }

  const runStats = summarizeCronRuns(cronRunDetails);
  const httpStatus = classifyHttpResponses(httpResponses);
  for (const c of crons) {
    const jobname = str(c["jobname"]);
    if (!jobname) continue;
    const jobid = str(c["jobid"]);
    const schedule = str(c["schedule"]) ?? "";
    const runsPerDay = cronRunsPerDay(schedule);
    if (Number.isNaN(runsPerDay)) warnings.push(`cron \`${jobname}\` has an unparseable schedule \`${schedule}\` — frequency-based rules will skip it`);
    const command = str(c["command"]) ?? "";
    const attrs: Record<string, unknown> = { jobid, schedule, active: c["active"] !== false, command, runsPerDay };
    const runs = jobid ? runStats.get(jobid) : undefined;
    if (runs) {
      attrs["totalRuns"] = runs.totalRuns;
      attrs["failedRuns"] = runs.failedRuns;
      attrs["lastRunAt"] = runs.lastRunAt;
    }
    if (httpStatus.hostStatus && isNetHttpCommand(command)) {
      attrs["hostStatus"] = httpStatus.hostStatus;
      attrs["httpStatusCodes"] = httpStatus.statusCodes;
      attrs["httpErrorCount"] = httpStatus.errorCount;
      attrs["lastHttpAt"] = httpStatus.latestCreated;
    }
    resources.push({
      id: `cron_job:${jobname}`,
      kind: "cron_job",
      name: jobname,
      // `active` defaults to true: pg_cron rows without the column present are live jobs.
      attrs,
    });
    if (runs) observations.push({ resourceId: `cron_job:${jobname}`, metric: "total_runs", value: runs.totalRuns, measuredAt: NOW });
  }

  for (const p of policies) {
    const table = str(p["tablename"]);
    const policyname = str(p["policyname"]);
    if (!table || !policyname) continue;
    resources.push({
      id: `rls_policy:${table}.${policyname}`,
      kind: "rls_policy",
      name: `${table} — ${policyname}`,
      attrs: { table, cmd: str(p["cmd"]), roles: p["roles"], qual: str(p["qual"]) },
    });
  }

  if (aiCfg.length && aiCfg[0]) {
    resources.push({
      id: "ai_config",
      kind: "ai_config",
      name: "ai_config",
      attrs: { model: aiCfg[0]["model"], maxCostUsd: aiCfg[0]["max_cost_usd"] ?? null },
    });
  }

  for (const t of triggers) {
    const table = str(t["table_name"]);
    const name = str(t["trigger_name"]);
    if (!table || !name) continue;
    resources.push({
      id: `trigger:${table}.${name}`,
      kind: "trigger",
      name: `${table}.${name}`,
      attrs: {
        table,
        triggerDef: str(t["trigger_def"]) ?? "",
        functionDef: str(t["function_def"]) ?? "",
      },
    });
  }

  const idleDays = deriveIdleDays(NOW, cronRunDetails, httpResponses);
  if (idleDays === undefined) {
    warnings.push("db mode could not derive `idleDays` from cron_run_details or net._http_response timestamps; POL-9 will skip idle lifecycle");
  } else {
    observations.push({ resourceId: "project", metric: "last_activity_days", value: idleDays, measuredAt: NOW });
  }

  // Anchor a project resource so project-scoped rules (capability matrix, POL-9) have a target.
  resources.push({
    id: "project",
    kind: "project",
    name: opts.projectName ?? "lovable-project",
    attrs: { tables: tables.length, crons: crons.length, edgeFns: undefined, idleDays },
  });

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

// --- defensive helpers: pg rows are `unknown` until proven otherwise ---

function rowsOf(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === "object") as Array<Record<string, unknown>>) : [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : v == null ? undefined : String(v);
}

/** Parse a byte count that pg may return as a bigint string, number, or NULL. */
export function toInt(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function deriveIdleDays(nowIso: string, cronRuns: Array<Record<string, unknown>>, httpResponses: Array<Record<string, unknown>>): number | undefined {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return undefined;
  let latest = 0;
  for (const r of cronRuns) {
    const ts = Date.parse(str(r["start_time"]) ?? "");
    if (Number.isFinite(ts) && ts > latest) latest = ts;
  }
  for (const r of httpResponses) {
    const ts = Date.parse(str(r["created"]) ?? "");
    if (Number.isFinite(ts) && ts > latest) latest = ts;
  }
  return latest > 0 ? Math.max(0, Math.floor((now - latest) / MS_PER_DAY)) : undefined;
}

export function classifyHttpResponses(rows: Array<Record<string, unknown>>): { hostStatus?: "dead" | "401" | "5xx"; statusCodes: number[]; errorCount: number; latestCreated?: string } {
  const statusCodes: number[] = [];
  let hasDead = false;
  let has401 = false;
  let has5xx = false;
  let latest = "";
  let latestMs = 0;
  let errorCount = 0;

  for (const r of rows) {
    const code = toInt(r["status_code"]);
    if (code > 0) statusCodes.push(code);
    if (code === 401 || code === 403) has401 = true;
    if (code >= 500 && code <= 599) has5xx = true;
    const msg = str(r["error_msg"]) ?? "";
    if (msg) {
      errorCount++;
      if (/\b(dns|enotfound|eai_again|could not resolve|connection refused|timeout|timed out|unreachable)\b/i.test(msg)) hasDead = true;
    }
    const created = str(r["created"]);
    const ts = Date.parse(created ?? "");
    if (created && Number.isFinite(ts) && ts > latestMs) {
      latest = created;
      latestMs = ts;
    }
  }

  const hostStatus = hasDead ? "dead" : has401 ? "401" : has5xx ? "5xx" : undefined;
  return { hostStatus, statusCodes: [...new Set(statusCodes)], errorCount, latestCreated: latest || undefined };
}

/** `schema.table` -> `table`, for matching a cron DELETE target against a table name. */
export function bareName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1) : name;
}

const PRUNE_RX = /\b(?:delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?(?:"?\w+"?\.)?"?(\w+)"?/gi;

/** Strip comments, string literals and dollar-quoted bodies so a `DELETE` mentioned inside a
 * string or comment is not mistaken for an executable prune statement. */
function stripSqlNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/'(?:[^']|'')*'/g, " ");
}

export function tablesPrunedByCron(crons: Array<Record<string, unknown>>): Set<string> {
  const pruned = new Set<string>();
  for (const c of crons) {
    const cmd = str(c["command"]);
    if (!cmd) continue;
    for (const m of stripSqlNoise(cmd).matchAll(PRUNE_RX)) {
      if (m[1]) pruned.add(m[1].toLowerCase());
    }
  }
  return pruned;
}

function summarizeCronRuns(rows: Array<Record<string, unknown>>): Map<string, { totalRuns: number; failedRuns: number; lastRunAt?: string }> {
  const byJob = new Map<string, { totalRuns: number; failedRuns: number; lastRunAt?: string; lastRunMs: number }>();
  for (const r of rows) {
    const jobid = str(r["jobid"]);
    if (!jobid) continue;
    const current = byJob.get(jobid) ?? { totalRuns: 0, failedRuns: 0, lastRunMs: 0 };
    current.totalRuns++;
    const status = String(r["status"] ?? "").toLowerCase();
    if (status && status !== "succeeded" && status !== "success") current.failedRuns++;
    const start = str(r["start_time"]);
    const ts = Date.parse(start ?? "");
    if (start && Number.isFinite(ts) && ts > current.lastRunMs) {
      current.lastRunAt = start;
      current.lastRunMs = ts;
    }
    byJob.set(jobid, current);
  }

  const out = new Map<string, { totalRuns: number; failedRuns: number; lastRunAt?: string }>();
  for (const [jobid, value] of byJob) out.set(jobid, { totalRuns: value.totalRuns, failedRuns: value.failedRuns, lastRunAt: value.lastRunAt });
  return out;
}

function isNetHttpCommand(command: string): boolean {
  return /\bnet\.(?:http_get|http_post|http_delete)\b/i.test(command) || /\bhttp_(?:get|post|delete)\s*\(/i.test(command);
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
