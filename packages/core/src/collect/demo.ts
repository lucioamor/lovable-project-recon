import type { Observation, Resource } from "../model.ts";
import type { Collected, CollectOptions } from "./types.ts";

const MB = 1024 * 1024;
const NOW = new Date().toISOString();

// Fixture built from the real central-genial audit (LOVABLE_TECHNICAL_LANDSCAPE.md Part II
// + ENV_CONFIG §6.4). Lets `recon scan --mode demo` reproduce that report with zero setup.
export async function collectDemo(_opts: CollectOptions): Promise<Collected> {
  const resources: Resource[] = [];
  const observations: Observation[] = [];

  resources.push({
    id: "project",
    kind: "project",
    name: "central-genial",
    attrs: { authUsers: 1, idleDays: 101, tables: 27, edgeFns: 25, idleSince: "2026-03-21", dbTotalBytes: 155 * MB },
  });
  resources.push({
    id: "cloud",
    kind: "cloud",
    name: "Lovable Cloud (Supabase)",
    attrs: { status: "active", ref: "ezdckbupdqjrfmoetbjc" },
  });
  observations.push({ resourceId: "project", metric: "last_activity_days", value: 101, measuredAt: NOW });

  // 5 cron jobs (ENV_CONFIG §6.4). The anon JWT is embedded in every command (60-yr expiry).
  const ANON_JWT_CMD =
    `SELECT net.http_post(\n` +
    `  url := 'https://ezdckbupdqjrfmoetbjc.supabase.co/functions/v1/telegram-poll',\n` +
    `  headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIs...<anon JWT, exp 2086>","Content-Type":"application/json"}'\n` +
    `);`;

  const crons: Array<[string, string, number, boolean, Record<string, unknown>]> = [
    ["poll-telegram-updates", "* * * * *", 1440, false, { totalRuns: 150747, host: "prod", command: ANON_JWT_CMD, jwtExpiryYears: 60, longPollMs: 55000 }],
    ["monthly-social-kit-generation", "0 8 1 * *", 0.03, true, { command: ANON_JWT_CMD, jwtExpiryYears: 60 }],
    ["morning-summary-daily", "0 11 * * *", 1, true, { command: ANON_JWT_CMD, jwtExpiryYears: 60, returnsEarly: true }],
    ["stale-lead-alert-daily", "0 12 * * *", 1, true, { command: ANON_JWT_CMD, jwtExpiryYears: 60, returnsEarly: true }],
    ["update-reminder-daily", "0 13 * * *", 1, true, { command: ANON_JWT_CMD, jwtExpiryYears: 60, returnsEarly: true }],
  ];
  for (const [name, schedule, runsPerDay, usefulWork, extra] of crons) {
    resources.push({
      id: `cron_job:${name}`,
      kind: "cron_job",
      name,
      attrs: { schedule, active: true, runsPerDay, usefulWork, ...extra },
    });
    observations.push({
      resourceId: `cron_job:${name}`,
      metric: "runs_per_day",
      value: runsPerDay,
      measuredAt: NOW,
    });
  }

  // Dominant table: cron.job_run_details = 121 MB, no retention (POL-2).
  resources.push({
    id: "table:cron.job_run_details",
    kind: "table",
    name: "cron.job_run_details",
    attrs: { totalBytes: 121 * MB, isLog: true, retention: false, rows: 150747 },
  });
  observations.push({
    resourceId: "table:cron.job_run_details",
    metric: "total_bytes",
    value: 121 * MB,
    measuredAt: NOW,
  });

  // Open anon INSERT surface, no rate limit (POL-5).
  resources.push({
    id: "rls_policy:analytics_events.anon_insert",
    kind: "rls_policy",
    name: "analytics_events — Anyone can insert",
    attrs: { table: "analytics_events", cmd: "INSERT", roles: ["anon"], qual: "true" },
  });

  return {
    project: {
      name: "central-genial",
      supabaseRef: "ezdckbupdqjrfmoetbjc",
      stack: "Vite + React + Shadcn",
      mode: "demo",
      scannedAt: NOW,
    },
    resources,
    observations,
    raw: {},
    warnings: ["demo mode — fixture from the central-genial audit; not a live scan"],
  };
}
