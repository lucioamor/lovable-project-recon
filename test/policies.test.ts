import { describe, expect, it } from "vitest";
import { buildContext, type Collected } from "@nxlv-ai/lovable-core";
import { pol1CronHygiene, pol2LogRetention, pol9IdleLifecycle } from "@nxlv-ai/lovable-profile-cost";

const NOW = "2026-07-01T00:00:00.000Z";
const MB = 1024 * 1024;

function collected(partial: Partial<Collected>): Collected {
  return {
    project: { name: "t", mode: "demo", scannedAt: NOW },
    resources: [],
    observations: [],
    raw: {},
    warnings: [],
    ...partial,
  };
}

function cron(name: string, attrs: Record<string, unknown>) {
  return { id: `cron_job:${name}`, kind: "cron_job" as const, name, attrs };
}

describe("POL-1 cron hygiene", () => {
  it("flags an every-minute cron with no proven work (high, driver A)", () => {
    const ctx = buildContext(
      collected({
        resources: [cron("poll", { schedule: "* * * * *", active: true, runsPerDay: 1440, usefulWork: false })],
      }),
    );
    const f = pol1CronHygiene.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.driverCat).toBe("A");
    expect(f[0]!.confidence).toBe("confirmed");
  });

  it("does NOT flag a high-frequency cron that does useful work each tick", () => {
    const ctx = buildContext(
      collected({
        resources: [cron("worker", { schedule: "* * * * *", active: true, runsPerDay: 1440, usefulWork: true })],
      }),
    );
    expect(pol1CronHygiene.evaluate(ctx)).toHaveLength(0);
  });

  it("skips inactive crons", () => {
    const ctx = buildContext(
      collected({
        resources: [cron("off", { schedule: "* * * * *", active: false, runsPerDay: 1440, usefulWork: false })],
      }),
    );
    expect(pol1CronHygiene.evaluate(ctx)).toHaveLength(0);
  });

  it("does NOT flag a healthy once-daily cron", () => {
    const ctx = buildContext(
      collected({
        resources: [cron("daily", { schedule: "0 11 * * *", active: true, runsPerDay: 1, usefulWork: false })],
      }),
    );
    expect(pol1CronHygiene.evaluate(ctx)).toHaveLength(0);
  });

  it("flags an infrequent cron pointed at a dead host", () => {
    const ctx = buildContext(
      collected({
        resources: [cron("ghost", { schedule: "0 11 * * *", active: true, runsPerDay: 1, usefulWork: true, host: "dead" })],
      }),
    );
    expect(pol1CronHygiene.evaluate(ctx)).toHaveLength(1);
  });
});

describe("POL-2 log retention", () => {
  function table(name: string, attrs: Record<string, unknown>) {
    return { id: `table:${name}`, kind: "table" as const, name, attrs };
  }

  it("flags a big unbounded log table (high)", () => {
    const ctx = buildContext(
      collected({
        resources: [table("cron.job_run_details", { totalBytes: 121 * MB, isLog: true, retention: false })],
      }),
    );
    const f = pol2LogRetention.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.driverCat).toBe("C");
  });

  it("ignores a big NON-log domain table", () => {
    const ctx = buildContext(collected({ resources: [table("orders", { totalBytes: 500 * MB, isLog: false })] }));
    expect(pol2LogRetention.evaluate(ctx)).toHaveLength(0);
  });

  it("ignores a log table that already has retention", () => {
    const ctx = buildContext(collected({ resources: [table("logs", { totalBytes: 200 * MB, isLog: true, retention: true })] }));
    expect(pol2LogRetention.evaluate(ctx)).toHaveLength(0);
  });

  it("ignores a small log table below the size floor", () => {
    const ctx = buildContext(collected({ resources: [table("logs", { totalBytes: 1 * MB, isLog: true, retention: false })] }));
    expect(pol2LogRetention.evaluate(ctx)).toHaveLength(0);
  });
});

describe("POL-9 idle lifecycle", () => {
  const project = (idleDays: number) => ({
    id: "project",
    kind: "project" as const,
    name: "p",
    attrs: { idleDays },
  });

  it("flags an idle project that still runs active crons", () => {
    const ctx = buildContext(collected({ resources: [project(101), cron("c", { active: true })] }));
    expect(pol9IdleLifecycle.evaluate(ctx)).toHaveLength(1);
  });

  it("does NOT flag an idle project with nothing burning", () => {
    const ctx = buildContext(collected({ resources: [project(101)] }));
    expect(pol9IdleLifecycle.evaluate(ctx)).toHaveLength(0);
  });

  it("does NOT flag a recently-active project", () => {
    const ctx = buildContext(collected({ resources: [project(10), cron("c", { active: true })] }));
    expect(pol9IdleLifecycle.evaluate(ctx)).toHaveLength(0);
  });
});
