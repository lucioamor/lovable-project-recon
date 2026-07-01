// Normalized evidence model — do not conflate resource, measured fact, finding, and fix.
// (Matches LOVABLE_CLEANUP_ARCHITECTURE.md §5.)

export type Mode = "db" | "static" | "portfolio" | "demo";

export type Severity = "critical" | "high" | "medium" | "low";

/** Credit-burn taxonomy A–F (LOVABLE_TECHNICAL_LANDSCAPE.md §7). */
export type DriverCat = "A" | "B" | "C" | "D" | "E" | "F";

export type Confidence = "confirmed" | "hypothesis";

export type ResourceKind =
  | "project"
  | "cloud"
  | "db"
  | "table"
  | "cron_job"
  | "edge_fn"
  | "bucket"
  | "realtime"
  | "ai_config"
  | "rls_policy"
  | "secret";

/** Something that exists in the project. */
export interface Resource {
  /** stable within a scan, e.g. "cron_job:poll-telegram-updates" */
  id: string;
  kind: ResourceKind;
  name: string;
  attrs: Record<string, unknown>;
}

/** A measured fact about a resource (read-only). */
export interface Observation {
  /** FK -> Resource.id, or "project" for project-scope metrics */
  resourceId: string;
  metric: string;
  value: unknown;
  measuredAt: string; // ISO
}

export interface Evidence {
  source: "sql" | "rg" | "api" | "demo";
  detail: string;
  snippet?: string;
}

export interface RemediationAction {
  kind: "sql_migration" | "lovable_prompt" | "manual";
  title: string;
  body: string;
  estCreditsSaved?: string;
  /** Whether a future `recon clean --apply` may run this unattended. M0: always false. */
  applySafe: boolean;
}

/** A rule violation, tied to the evidence that proves it. */
export interface Finding {
  id: string;
  policy: string; // "POL-1"
  driverCat: DriverCat | null;
  title: string;
  severity: Severity;
  confidence: Confidence;
  resourceId: string;
  /** Why this is waste — the "runtime sem intenção" argument. */
  rationale: string;
  evidence: Evidence[];
  remediation: RemediationAction[];
  estCreditsSaved?: string;
}

export interface RiskScore {
  wasteScore: number; // 0..100
  breakdown: { policy: string; points: number; count: number }[];
  headline: string;
}

export interface ProjectMeta {
  name: string;
  supabaseRef?: string;
  stack?: string;
  mode: Mode;
  scannedAt: string; // ISO
}

export interface ReconResult {
  project: ProjectMeta;
  resources: Resource[];
  observations: Observation[];
  findings: Finding[];
  score: RiskScore;
  warnings: string[];
}
