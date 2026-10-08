import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { DriverCat, ImportedAction, Observation, Resource } from "../model.ts";
import type { ProjectEvidence } from "../evidence-schema.ts";
import { looksLikeLogTable } from "../util.ts";
import type { Collected, CollectOptions } from "./types.ts";

const MB = 1024 * 1024;

interface IndexFile {
  meta?: {
    generated?: unknown;
    source_corpus?: unknown;
  };
  policies?: unknown[];
  projects?: IndexProject[];
}

interface IndexProject {
  id?: unknown;
  name?: unknown;
  supabase_ref?: unknown;
  stack?: unknown;
  db_size_mb?: unknown;
  public_tables?: unknown;
  pg_cron?: { installed?: unknown; active_jobs?: unknown; note?: unknown };
  edge_functions?: unknown;
  storage?: { buckets?: unknown; size_mb?: unknown; note?: unknown };
  realtime?: unknown;
  idle?: unknown;
  last_activity?: unknown;
  severity?: unknown;
  severity_note?: unknown;
  driver_categories?: unknown;
  primary_driver_confirmed?: unknown;
  policies?: unknown;
  key_metrics?: Record<string, unknown>;
  top_actions?: unknown[];
}

export async function collectIndex(opts: CollectOptions): Promise<Collected> {
  if (!opts.indexPath) throw new Error("index mode requires --index <lovable_projects_index.json>");
  const data = parseIndex(readFileSync(opts.indexPath, "utf8"));
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const projectId = opts.projectId ?? opts.projectName;
  if (!projectId) throw new Error("index mode requires --project <id> for a single-project scan");

  const project = projects.find((p) => str(p.id) === projectId || str(p.name) === projectId);
  if (!project) {
    const ids = projects
      .map((p) => str(p.id))
      .filter(Boolean)
      .join(", ");
    throw new Error(`project \`${projectId}\` not found in ${opts.indexPath}. Available: ${ids}`);
  }

  const generated = str(data.meta?.generated);
  const measuredAt = generated ? `${generated}T00:00:00.000Z` : new Date().toISOString();
  const scannedAt = new Date().toISOString();
  const warnings: string[] = [];
  const resources: Resource[] = [];
  const observations: Observation[] = [];
  const id = str(project.id) ?? projectId;
  const name = str(project.name) ?? id;
  const dbSizeMb = num(project.db_size_mb);
  const publicTables = num(project.public_tables);
  const edgeFns = num(project.edge_functions);
  const storageBuckets = num(project.storage?.buckets);
  const storageSizeMb = num(project.storage?.size_mb);
  const activeJobs = num(project.pg_cron?.active_jobs);
  const idleDays = generated && str(project.last_activity) ? daysBetween(generated, str(project.last_activity)!) : undefined;
  const importedActions = mapImportedActions(project.top_actions, opts.indexPath);

  if (project.pg_cron?.active_jobs === null) warnings.push(`index: pg_cron.active_jobs is not observed for \`${id}\` (${str(project.pg_cron.note) ?? "no note"})`);
  if (project.storage?.buckets === null) warnings.push(`index: storage.buckets is not observed for \`${id}\``);
  if (project.storage?.size_mb === null) warnings.push(`index: storage.size_mb is not observed for \`${id}\``);
  if (idleDays === undefined && str(project.last_activity)) warnings.push(`index: could not derive idle days from last_activity \`${str(project.last_activity)}\``);

  const supabaseRef = str(project.supabase_ref);
  if (supabaseRef) resources.push({ id: "cloud", kind: "cloud", name: "Lovable Cloud (Supabase)", attrs: { status: "active", ref: supabaseRef } });

  const policyIds = Array.isArray(project.policies) ? project.policies.map((p) => str(p)).filter((p): p is string => Boolean(p)) : [];
  resources.push({
    id: "project",
    kind: "project",
    name,
    attrs: {
      projectId: id,
      tables: publicTables,
      edgeFns,
      dbTotalBytes: dbSizeMb === undefined ? undefined : dbSizeMb * MB,
      storageBuckets,
      storageSizeMb,
      idleState: str(project.idle),
      lastActivity: str(project.last_activity),
      idleDays,
      driverCategories: parseDriverCategories(project.driver_categories),
      indexSeverity: str(project.severity),
      severityNote: str(project.severity_note),
      primaryDriverConfirmed: project.primary_driver_confirmed,
      policyIds,
    },
  });

  if (dbSizeMb !== undefined) observations.push({ resourceId: "project", metric: "db_size_mb", value: dbSizeMb, measuredAt });
  if (publicTables !== undefined) observations.push({ resourceId: "project", metric: "public_tables", value: publicTables, measuredAt });
  if (edgeFns !== undefined) observations.push({ resourceId: "project", metric: "edge_functions", value: edgeFns, measuredAt });
  if (storageBuckets !== undefined) observations.push({ resourceId: "project", metric: "storage_buckets", value: storageBuckets, measuredAt });
  if (storageSizeMb !== undefined) observations.push({ resourceId: "project", metric: "storage_size_mb", value: storageSizeMb, measuredAt });
  if (activeJobs !== undefined) observations.push({ resourceId: "project", metric: "pg_cron_active_jobs", value: activeJobs, measuredAt });
  if (idleDays !== undefined) observations.push({ resourceId: "project", metric: "last_activity_days", value: idleDays, measuredAt });

  if (activeJobs !== undefined && activeJobs > 0) {
    for (let i = 1; i <= activeJobs; i++) {
      resources.push({ id: `cron_job:index-${i}`, kind: "cron_job", name: `index-cron-${i}`, attrs: { active: true, source: "index" } });
    }
  }

  if (project.realtime === true) resources.push({ id: "realtime", kind: "realtime", name: "Realtime", attrs: { source: "index", tables: "observed" } });
  if (storageBuckets !== undefined && storageBuckets > 0) {
    for (let i = 1; i <= storageBuckets; i++) resources.push({ id: `bucket:index-${i}`, kind: "bucket", name: `storage-${i}`, attrs: { source: "index", sizeMb: storageSizeMb } });
  }

  const largestTable = parseLargestTable(str(project.key_metrics?.["largest_table"]));
  if (largestTable) {
    const confirmedRetentionGap = importedActions.some((a) => a.policy === "POL-2" && a.status === "Confirmed");
    resources.push({
      id: `table:${largestTable.name}`,
      kind: "table",
      name: largestTable.name,
      attrs: { totalBytes: largestTable.sizeMb * MB, isLog: looksLikeLogTable(largestTable.name), retention: confirmedRetentionGap ? false : undefined, source: "index" },
    });
    observations.push({ resourceId: `table:${largestTable.name}`, metric: "total_bytes", value: largestTable.sizeMb * MB, measuredAt });
  }

  return {
    project: {
      name,
      supabaseRef,
      stack: str(project.stack),
      mode: "index",
      scannedAt,
      evidenceGenerated: generated,
      evidenceSource: opts.indexPath,
    },
    resources,
    observations,
    raw: {
      index: {
        sourcePath: opts.indexPath,
        generated,
        sourceCorpus: str(data.meta?.source_corpus),
        policyCatalog: data.policies ?? [],
        projectSnapshot: project,
        keyMetrics: project.key_metrics ?? {},
        importedActions,
      },
    },
    warnings,
    importedActions,
  };
}

export function listIndexProjects(indexPath: string): Array<{ id: string; name: string }> {
  const data = parseIndex(readFileSync(indexPath, "utf8"));
  return (data.projects ?? []).flatMap((p) => {
    const id = str(p.id);
    if (!id) return [];
    return [{ id, name: str(p.name) ?? id }];
  });
}

export function indexCollectedToEvidence(collected: Collected, opts: { projectId?: string; indexPath: string; sourceReports?: string[] }): ProjectEvidence {
  const projectResource = collected.resources.find((resource) => resource.id === "project");
  const projectId = opts.projectId ?? str(projectResource?.attrs["projectId"]) ?? slug(collected.project.name);
  const sourceReports = opts.sourceReports ?? [];
  const evidenceSource = sourceReports[0] ?? basename(opts.indexPath);
  const rawIndex = collected.raw["index"];

  return {
    schemaVersion: 1,
    project: {
      id: projectId,
      name: collected.project.name,
      supabaseRef: collected.project.supabaseRef,
      stack: collected.project.stack,
      evidenceGenerated: collected.project.evidenceGenerated ?? collected.project.scannedAt.slice(0, 10),
      evidenceSource,
    },
    resources: collected.resources,
    observations: collected.observations,
    importedActions: collected.importedActions ?? [],
    raw: {
      sourceIndex: basename(opts.indexPath),
      sourceReports,
      conversion: "index-derived corpus seed; enrich with hand-reviewed usage report evidence before treating as complete",
      index: rawIndex,
    },
    warnings: ["index-derived corpus seed - structured baseline, pending hand review against source usage report", ...collected.warnings],
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseIndex(text: string): IndexFile {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("index file must be a JSON object");
  return parsed as IndexFile;
}

function mapImportedActions(actions: unknown[] | undefined, sourcePath: string): ImportedAction[] {
  if (!Array.isArray(actions)) return [];
  const seen = new Set<string>();
  const out: ImportedAction[] = [];
  for (const item of actions) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const action = str(a["action"]);
    if (!action) continue;
    const mapped: ImportedAction = {
      rank: num(a["rank"]),
      action,
      severity: str(a["severity"]),
      effort: str(a["effort"]),
      status: str(a["status"]),
      policy: str(a["policy"]),
      source: basename(sourcePath),
    };
    const key = `${mapped.policy ?? ""}:${action.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mapped);
  }
  return out.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

function parseLargestTable(value: string | undefined): { name: string; sizeMb: number } | undefined {
  if (!value) return undefined;
  const m = /^([A-Za-z0-9_.-]+)\s+(\d+(?:\.\d+)?)\s*MB\b/i.exec(value.trim());
  if (!m) return undefined;
  return { name: m[1]!, sizeMb: Number(m[2]) };
}

function parseDriverCategories(value: unknown): DriverCat[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is DriverCat => v === "A" || v === "B" || v === "C" || v === "D" || v === "E" || v === "F");
}

function daysBetween(laterDate: string, earlierDate: string): number | undefined {
  const later = Date.parse(`${laterDate}T00:00:00.000Z`);
  const earlier = Date.parse(`${earlierDate}T00:00:00.000Z`);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return undefined;
  return Math.max(0, Math.floor((later - earlier) / (24 * 60 * 60 * 1000)));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : v == null ? undefined : String(v);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
