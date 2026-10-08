import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Observation, Resource } from "../model.ts";
import type { Collected, CollectOptions } from "./types.ts";

// Real source-of-truth collector (bloco B). Reads a checked-out Lovable/Supabase repo:
//   supabase/config.toml   → project ref + edge-fn verify_jwt inventory
//   supabase/migrations/*  → CREATE POLICY … (feeds POL-5) + AI/ai_config seeds
//   src/**                 → client-amplification & credential signals (feeds POL-3/4/6)
// It is pure read-only: it never runs the source, only pattern-scans it. When no repo is
// available (or the path is not a Lovable repo) it degrades to an empty scan with honest
// warnings rather than throwing — the pipeline stays usable.

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo", ".vercel"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // don't slurp bundles/lockfiles
const MAX_FILES = 5000; // safety bound on pathological trees

export interface StaticSignals {
  staleTimeSignals: Array<{ file: string; snippet: string }>;
  backgroundPolling: Array<{ file: string; intervalMs: number }>;
  authStateSignals: Array<{ file: string; snippet: string }>;
  modelIds: Array<{ file: string; model: string }>;
  dangerousHtml: Array<{ file: string; snippet: string }>;
  secretSignals: Array<{ file: string; kind: string }>;
}

export async function collectStatic(opts: CollectOptions): Promise<Collected> {
  const NOW = new Date().toISOString();
  const repoPath = opts.repoPath;
  const resources: Resource[] = [];
  const observations: Observation[] = [];
  const warnings: string[] = [];
  const signals: StaticSignals = {
    staleTimeSignals: [],
    backgroundPolling: [],
    authStateSignals: [],
    modelIds: [],
    dangerousHtml: [],
    secretSignals: [],
  };

  const projectName = opts.projectName ?? (repoPath ? basename(repoPath) : "local-repo");

  if (!repoPath || !existsSync(repoPath) || !isDir(repoPath)) {
    warnings.push(repoPath ? `static mode: --repo path \`${repoPath}\` does not exist or is not a directory — nothing scanned` : "static mode requires --repo <path-to-lovable-checkout>; nothing scanned");
    return emptyResult(projectName, NOW, warnings, signals);
  }

  // --- capability inventory from supabase/config.toml ---------------------------------
  let supabaseRef: string | undefined;
  const configPath = join(repoPath, "supabase", "config.toml");
  if (existsSync(configPath)) {
    const toml = safeRead(configPath);
    supabaseRef = matchOne(toml, /project_id\s*=\s*["']([^"']+)["']/);
    resources.push({ id: "cloud", kind: "cloud", name: "Lovable Cloud (Supabase)", attrs: { status: "active", ref: supabaseRef } });
    // Edge functions declared as [functions.<name>] with an optional verify_jwt toggle.
    for (const fn of parseEdgeFunctions(toml)) {
      resources.push({ id: `edge_fn:${fn.name}`, kind: "edge_fn", name: fn.name, attrs: { verifyJwt: fn.verifyJwt, source: "static" } });
    }
  } else {
    warnings.push("no `supabase/config.toml` found — this may not be a Lovable/Supabase repo; capability inventory will be thin");
  }

  // --- RLS policies from migrations (feeds POL-5) --------------------------------------
  const migrationsDir = join(repoPath, "supabase", "migrations");
  let migrationFiles = 0;
  if (existsSync(migrationsDir) && isDir(migrationsDir)) {
    for (const file of listFiles(migrationsDir).filter((f) => f.endsWith(".sql"))) {
      migrationFiles++;
      const sql = safeRead(file);
      for (const p of parsePolicies(sql)) {
        resources.push({
          id: `rls_policy:${p.table}.${p.name}`,
          kind: "rls_policy",
          name: `${p.table} — ${p.name}`,
          attrs: { table: p.table, cmd: p.cmd, roles: p.roles, qual: p.qual, source: "static" },
        });
      }
    }
    if (migrationFiles === 0) warnings.push("`supabase/migrations` exists but holds no `.sql` files — POL-5 has nothing to read");
  } else {
    warnings.push("no `supabase/migrations` directory — RLS/tenancy findings (POL-5) will be empty on static evidence");
  }

  // --- source scan (feeds POL-3/4/6) --------------------------------------------------
  const srcRoot = existsSync(join(repoPath, "src")) ? join(repoPath, "src") : repoPath;
  let scanned = 0;
  for (const file of listFiles(srcRoot)) {
    if (scanned >= MAX_FILES) {
      warnings.push(`static scan stopped at ${MAX_FILES} files — tree is larger than expected; results may be partial`);
      break;
    }
    if (!SOURCE_EXT.has(extname(file))) continue;
    const size = safeSize(file);
    if (size < 0 || size > MAX_FILE_BYTES) continue;
    scanned++;
    scanSource(safeRead(file), relOf(repoPath, file), signals);
  }
  if (scanned === 0) warnings.push("no source files scanned — client-amplification signals (POL-3) and model IDs (POL-4) will be empty");

  // ai_config from the first model id seen in source. Marked source:"static" so POL-4 does
  // NOT raise a "no cost cap" critical it cannot actually prove from source alone.
  if (signals.modelIds.length > 0) {
    const first = signals.modelIds[0]!;
    resources.push({ id: "ai_config", kind: "ai_config", name: "ai_config", attrs: { model: first.model, source: "static", sites: signals.modelIds.length } });
  }

  // Project anchor. idleDays is intentionally undefined: source can't observe last-activity,
  // so POL-9 stays silent on static scans (honest, not a false "not idle").
  resources.push({
    id: "project",
    kind: "project",
    name: projectName,
    attrs: { edgeFns: resources.filter((r) => r.kind === "edge_fn").length, rlsPolicies: resources.filter((r) => r.kind === "rls_policy").length, sourceFilesScanned: scanned, idleDays: undefined },
  });
  observations.push({ resourceId: "project", metric: "source_files_scanned", value: scanned, measuredAt: NOW });

  // Honesty about what static evidence cannot see.
  warnings.push("static mode reads source only — it cannot see runtime facts (table sizes, cron run counts, live AI spend). Pair with `--mode db` for those.");
  if (signals.secretSignals.length > 0) warnings.push(`static scan spotted ${signals.secretSignals.length} in-source credential shape(s) — see raw.static.secretSignals (values redacted)`);

  return {
    project: { name: projectName, supabaseRef, stack: "Vite + React (Lovable)", mode: "static", scannedAt: NOW },
    resources,
    observations,
    raw: { static: signals },
    warnings,
  };
}

// --- source pattern scan -------------------------------------------------------------

const STALE_TIME_RX = /staleTime\s*:\s*0\b/;
const PRELOAD_RX = /defaultPreloadStaleTime\s*:\s*0\b/;
const BG_REFETCH_RX = /refetchIntervalInBackground\s*:\s*true\b/;
const REFETCH_INTERVAL_RX = /refetchInterval\s*:\s*(\d+)/;
const AUTH_STATE_RX = /onAuthStateChange\s*\(/;
const DANGEROUS_HTML_RX = /dangerouslySetInnerHTML/;
// Preview/alias model ids rot and still bill on failure (POL-4). Match Lovable AI gateway ids.
const MODEL_RX = /["'`]((?:google\/|openai\/|anthropic\/)?(?:gemini|gpt|claude|o[134])[\w.-]*(?:preview|flash-lite|latest|exp)[\w.-]*)["'`]/gi;
// Credential shapes — we record that one exists, never the value (POL-6 static half).
const JWT_RX = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/;
const SERVICE_KEY_RX = /service_role|SERVICE_ROLE_KEY|supabaseServiceKey/;

function scanSource(text: string, rel: string, s: StaticSignals): void {
  if (!text) return;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (STALE_TIME_RX.test(line) || PRELOAD_RX.test(line)) s.staleTimeSignals.push({ file: `${rel}:${i + 1}`, snippet: trimSnip(line) });
    if (BG_REFETCH_RX.test(line)) s.backgroundPolling.push({ file: `${rel}:${i + 1}`, intervalMs: 0 });
    const ri = REFETCH_INTERVAL_RX.exec(line);
    if (ri && Number(ri[1]) > 0) s.backgroundPolling.push({ file: `${rel}:${i + 1}`, intervalMs: Number(ri[1]) });
    if (AUTH_STATE_RX.test(line)) s.authStateSignals.push({ file: `${rel}:${i + 1}`, snippet: trimSnip(line) });
    if (DANGEROUS_HTML_RX.test(line)) s.dangerousHtml.push({ file: `${rel}:${i + 1}`, snippet: trimSnip(line) });
    if (JWT_RX.test(line)) s.secretSignals.push({ file: `${rel}:${i + 1}`, kind: "jwt-literal" });
    else if (SERVICE_KEY_RX.test(line)) s.secretSignals.push({ file: `${rel}:${i + 1}`, kind: "service-role-ref" });
  }
  // Model ids can span the file; collect uniquely per file.
  const seen = new Set<string>();
  for (const m of text.matchAll(MODEL_RX)) {
    const model = m[1]!;
    if (seen.has(model)) continue;
    seen.add(model);
    s.modelIds.push({ file: rel, model });
  }
}

// --- migration / toml parsing --------------------------------------------------------

interface ParsedPolicy {
  name: string;
  table: string;
  cmd: string;
  roles: string;
  qual: string;
}

// CREATE POLICY "name" ON [schema.]table [AS ...] FOR <cmd> [TO roles] USING (<qual>) [WITH CHECK (...)]
// Policy names may be double-quoted and contain spaces, so match a quoted OR bare token.
const POLICY_RX = /CREATE\s+POLICY\s+(?:"([^"]+)"|([^"\s]+))\s+ON\s+(?:"?[\w]+"?\.)?"?([\w]+)"?([\s\S]*?)(?:;|$)/gi;

export function parsePolicies(sql: string): ParsedPolicy[] {
  const out: ParsedPolicy[] = [];
  // Strip line comments so `-- CREATE POLICY` examples don't register.
  const clean = sql.replace(/--[^\n]*/g, "");
  for (const m of clean.matchAll(POLICY_RX)) {
    const name = (m[1] ?? m[2])!;
    const table = m[3]!;
    const body = m[4] ?? "";
    const cmd = (matchOne(body, /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i) ?? "ALL").toUpperCase();
    const roles =
      matchOne(body, /\bTO\s+([\w",\s]+?)(?:\bUSING\b|\bWITH\b|$)/i)
        ?.replace(/\s+/g, " ")
        .trim() ?? "public";
    const qual =
      matchOne(body, /\bUSING\s*\(([\s\S]*?)\)\s*(?:WITH|$)/i)
        ?.replace(/\s+/g, " ")
        .trim() ?? "";
    out.push({ name, table, cmd, roles, qual });
  }
  return out;
}

export function parseEdgeFunctions(toml: string): Array<{ name: string; verifyJwt: boolean | undefined }> {
  const out: Array<{ name: string; verifyJwt: boolean | undefined }> = [];
  // [functions.<name>] blocks; verify_jwt lives on the following lines until the next [section].
  const blockRx = /\[functions\.([\w-]+)\]([\s\S]*?)(?=\n\[|$)/g;
  for (const m of toml.matchAll(blockRx)) {
    const name = m[1]!;
    const body = m[2] ?? "";
    const vj = matchOne(body, /verify_jwt\s*=\s*(true|false)/i);
    out.push({ name, verifyJwt: vj === undefined ? undefined : vj.toLowerCase() === "true" });
  }
  return out;
}

// --- fs + string helpers -------------------------------------------------------------

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      if (isDir(full)) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeSize(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return -1;
  }
}

function safeRead(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function matchOne(text: string, rx: RegExp): string | undefined {
  const m = rx.exec(text);
  return m?.[1];
}

function trimSnip(line: string): string {
  const t = line.trim();
  return t.length > 160 ? t.slice(0, 157) + "…" : t;
}

function extname(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i) : "";
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function relOf(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

function emptyResult(projectName: string, now: string, warnings: string[], signals: StaticSignals): Collected {
  return {
    project: { name: projectName, mode: "static", scannedAt: now },
    resources: [{ id: "project", kind: "project", name: projectName, attrs: { idleDays: undefined } }],
    observations: [],
    raw: { static: signals },
    warnings,
  };
}
