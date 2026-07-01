import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const IDLE_DAYS = 30;

// POL-9 — Idle-project lifecycle. "Idle in the app tables" != "not billing":
// cron/pg_net/Realtime keep consuming while monitoring_runs looks frozen.
export const pol9IdleLifecycle: Rule = {
  id: "POL-9",
  policy: "Idle-project lifecycle",
  evaluate(ctx: RuleContext): Finding[] {
    const project = ctx.resourceById("project");
    const fromAttr = project && typeof project.attrs["idleDays"] === "number" ? (project.attrs["idleDays"] as number) : undefined;
    const fromObs = ctx.observationFor("project", "last_activity_days");
    const idleDays = fromAttr ?? (typeof fromObs?.value === "number" ? (fromObs.value as number) : undefined);
    if (idleDays === undefined || idleDays <= IDLE_DAYS) return [];

    const activeCrons = ctx.resourcesByKind("cron_job").filter((j) => j.attrs["active"] !== false);
    const realtime = ctx.resourcesByKind("realtime").length > 0;
    if (activeCrons.length === 0 && !realtime) return [];

    const burners: string[] = [];
    if (activeCrons.length) burners.push(`${activeCrons.length} active cron job(s)`);
    if (realtime) burners.push("Realtime");

    return [
      {
        id: "POL-9:idle",
        policy: "POL-9",
        driverCat: "A",
        title: `Idle ${idleDays} days, still burning (${burners.join(" + ")})`,
        severity: "medium",
        confidence: "confirmed",
        resourceId: "project",
        rationale:
          `No real user activity for ${idleDays} days, yet ${burners.join(" and ")} keep consuming compute. ` +
          "Runtime cost here is decoupled from usage — this is the portfolio-wide silent baseline (the 2nd-largest " +
          "credit line after Build-mode). Scheduled/background work should auto-pause past 30 idle days.",
        evidence: [{ source: "sql", detail: `last activity ~${idleDays}d ago; ${activeCrons.length} active cron(s)` }],
        remediation: [
          {
            kind: "manual",
            title: "Auto-pause idle work + flag the Cloud instance",
            body: "Add an 'idle > 30d -> auto-unschedule scheduled work' rule; consider pausing/consolidating the Cloud instance to drop the per-instance baseline.",
            applySafe: false,
          },
        ],
      },
    ];
  },
};
