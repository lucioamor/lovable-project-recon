import type { Evidence, Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const MAX_SAFE_RUNS_PER_DAY = 96; // */15 == 96/day is the floor from the backlog

// POL-1 — Scheduled-job (cron) hygiene. Driver category A (perpetual scheduled work).
export const pol1CronHygiene: Rule = {
  id: "POL-1",
  policy: "Scheduled-job (cron) hygiene",
  evaluate(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];
    for (const job of ctx.resourcesByKind("cron_job")) {
      const a = job.attrs;
      if (a["active"] === false) continue;

      const runsPerDay = typeof a["runsPerDay"] === "number" ? (a["runsPerDay"] as number) : NaN;
      const usefulWork = a["usefulWork"] === true;
      const hostStatus = String(a["hostStatus"] ?? a["host"] ?? "");
      const deadCause = a["deadlinePassed"]
        ? "is past a hard-coded deadline"
        : a["host"] === "preview"
          ? "targets a preview host, not production"
          : hostStatus === "dead"
            ? "targets an unresolvable host (DNS fails)"
            : hostStatus === "401"
              ? "receives auth failures from net._http_response"
              : hostStatus === "5xx"
                ? "receives server errors from net._http_response"
                : null;

      const tooFrequent = Number.isFinite(runsPerDay) && runsPerDay > MAX_SAFE_RUNS_PER_DAY && !usefulWork;
      if (!tooFrequent && !deadCause) continue;

      const reasons: string[] = [];
      if (tooFrequent) reasons.push(`fires ~${Math.round(runsPerDay)}×/day (finer than \`*/15\`) with no proven work per tick`);
      if (deadCause) reasons.push(deadCause);

      const heavy = tooFrequent && runsPerDay >= 1000;
      // Frequency alone is a hypothesis: without an explicit "no useful work per tick" signal
      // (only demo/static provide it) or a dead-host cause, a fast cron is suspicious, not proven.
      const confidence: "confirmed" | "hypothesis" = deadCause || a["usefulWork"] === false ? "confirmed" : "hypothesis";
      findings.push({
        id: `POL-1:${job.name}`,
        policy: "POL-1",
        driverCat: "A",
        title: `Perpetual cron \`${job.name}\``,
        severity: heavy ? "high" : "medium",
        confidence,
        resourceId: job.id,
        rationale:
          `This job ${reasons.join(", and ")}. Scheduled work that runs regardless of state is ` +
          `"runtime without intention" — it bills edge/Worker invocations and writes cron-history rows ` +
          `indefinitely, fully decoupled from real usage. Health must be judged from ` +
          `\`net._http_response\`, not \`cron.job_run_details.status\`.`,
        evidence: cronEvidence(job),
        remediation: [
          {
            kind: "sql_migration",
            title: `Unschedule (or gate) \`${job.name}\``,
            body:
              `-- verify: SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='${job.name}';\n` +
              `SELECT cron.unschedule('${job.name}');\n` +
              `-- or, if still needed: repoint to */15 and add a "queue non-empty / user-active" sentinel.`,
            estCreditsSaved: Number.isFinite(runsPerDay) ? `~${Math.round(runsPerDay)} invocations/day` : "unknown",
            applySafe: false,
          },
        ],
        estCreditsSaved: Number.isFinite(runsPerDay) ? `~${Math.round(runsPerDay)} inv/day` : undefined,
      });
    }
    return findings;
  },
};

function cronEvidence(job: { attrs: Record<string, unknown> }): Evidence[] {
  const a = job.attrs;
  const ev: Evidence[] = [{ source: "sql", detail: `schedule \`${a["schedule"]}\`, active=${a["active"] !== false}`, snippet: "SELECT jobname,schedule,active FROM cron.job;" }];
  if (typeof a["totalRuns"] === "number") {
    ev.push({ source: "sql", detail: `${a["totalRuns"]} cumulative runs recorded in cron.job_run_details` });
  }
  if (a["hostStatus"]) {
    const codes = Array.isArray(a["httpStatusCodes"]) && a["httpStatusCodes"].length ? `; status codes ${a["httpStatusCodes"].join(", ")}` : "";
    ev.push({ source: "sql", detail: `net._http_response indicates host status ${a["hostStatus"]}${codes}` });
  }
  return ev;
}
