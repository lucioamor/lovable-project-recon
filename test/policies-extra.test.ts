import { describe, expect, it } from "vitest";
import { buildContext, type Collected } from "@nxlv-ai/lovable-core";
import { pol1CronHygiene, pol3FetchDefaults, pol4AiCost, pol5RlsTenancy, pol6Secrets, pol7WriteAmplification, pol8Observability } from "@nxlv-ai/lovable-profile-cost";

const NOW = "2026-07-01T00:00:00.000Z";

function collected(resources: Collected["resources"], raw: Record<string, unknown> = {}): Collected {
  return { project: { name: "t", mode: "db", scannedAt: NOW }, resources, observations: [], raw, warnings: [] };
}

describe("POL-1 confidence is honest without a useful-work signal", () => {
  it("frequency alone (db mode, no usefulWork attr) => hypothesis", () => {
    const ctx = buildContext(collected([{ id: "cron_job:x", kind: "cron_job", name: "x", attrs: { schedule: "* * * * *", active: true, runsPerDay: 1440 } }]));
    const f = pol1CronHygiene.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.confidence).toBe("hypothesis");
  });

  it("explicit usefulWork=false => confirmed", () => {
    const ctx = buildContext(collected([{ id: "cron_job:x", kind: "cron_job", name: "x", attrs: { schedule: "* * * * *", active: true, runsPerDay: 1440, usefulWork: false } }]));
    expect(pol1CronHygiene.evaluate(ctx)[0]!.confidence).toBe("confirmed");
  });

  it("dead host => confirmed even if infrequent", () => {
    const ctx = buildContext(collected([{ id: "cron_job:x", kind: "cron_job", name: "x", attrs: { schedule: "0 11 * * *", active: true, runsPerDay: 1, usefulWork: true, host: "dead" } }]));
    expect(pol1CronHygiene.evaluate(ctx)[0]!.confidence).toBe("confirmed");
  });

  it("net._http_response auth failures => confirmed even if infrequent", () => {
    const ctx = buildContext(
      collected([{ id: "cron_job:x", kind: "cron_job", name: "x", attrs: { schedule: "0 11 * * *", active: true, runsPerDay: 1, usefulWork: true, hostStatus: "401", httpStatusCodes: [401] } }]),
    );
    const f = pol1CronHygiene.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.confidence).toBe("confirmed");
    expect(f[0]!.evidence.some((e) => e.detail.includes("host status 401"))).toBe(true);
  });
});

describe("POL-3 fetch defaults (static-gated)", () => {
  it("no-op without static evidence (db/demo)", () => {
    expect(pol3FetchDefaults.evaluate(buildContext(collected([])))).toHaveLength(0);
  });
  it("fires on staleTime signals from static mode", () => {
    const ctx = buildContext(
      collected([{ id: "project", kind: "project", name: "p", attrs: {} }], {
        static: { staleTimeSignals: [{ file: "src/queryClient.ts", snippet: "staleTime: 0" }] },
      }),
    );
    const f = pol3FetchDefaults.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.driverCat).toBe("B");
  });
});

describe("POL-4 AI cost governance", () => {
  it("missing cost cap => critical/confirmed", () => {
    const ctx = buildContext(collected([{ id: "ai_config", kind: "ai_config", name: "ai_config", attrs: { model: "gemini", maxCostUsd: null } }]));
    const f = pol4AiCost.evaluate(ctx).find((x) => x.id === "POL-4:no-cap")!;
    expect(f.severity).toBe("critical");
    expect(f.confidence).toBe("confirmed");
  });
  it("broken/preview model id => high/hypothesis", () => {
    const ctx = buildContext(collected([{ id: "ai_config", kind: "ai_config", name: "ai_config", attrs: { model: "gemini-3.1-pro-preview", maxCostUsd: 5 } }]));
    const f = pol4AiCost.evaluate(ctx).find((x) => x.id === "POL-4:broken-model")!;
    expect(f.severity).toBe("high");
    expect(f.confidence).toBe("hypothesis");
  });
  it("no AI configured => no findings", () => {
    expect(pol4AiCost.evaluate(buildContext(collected([])))).toHaveLength(0);
  });
});

describe("POL-5 RLS / anon write surface", () => {
  it("flags an open anon INSERT", () => {
    const ctx = buildContext(collected([{ id: "rls_policy:a", kind: "rls_policy", name: "anon_insert", attrs: { table: "events", cmd: "INSERT", roles: ["anon"], qual: "true" } }]));
    expect(pol5RlsTenancy.evaluate(ctx)).toHaveLength(1);
  });
  it("does not flag an owner-scoped SELECT", () => {
    const ctx = buildContext(collected([{ id: "rls_policy:b", kind: "rls_policy", name: "own_rows", attrs: { table: "notes", cmd: "SELECT", roles: ["authenticated"], qual: "user_id = auth.uid()" } }]));
    expect(pol5RlsTenancy.evaluate(ctx)).toHaveLength(0);
  });
});

describe("POL-6 secrets — case/spacing tolerant", () => {
  it("detects lowercase 'bearer' (QA gap)", () => {
    const ctx = buildContext(collected([{ id: "cron_job:x", kind: "cron_job", name: "x", attrs: { command: "authorization: bearer eyJabc123" } }]));
    expect(pol6Secrets.evaluate(ctx)).toHaveLength(1);
  });
  it("does not fire when no token is present", () => {
    const ctx = buildContext(collected([{ id: "cron_job:x", kind: "cron_job", name: "x", attrs: { command: "SELECT net.http_post(url := '...')" } }]));
    expect(pol6Secrets.evaluate(ctx)).toHaveLength(0);
  });

  it("detects static source credential shapes without leaking values", () => {
    const ctx = buildContext(
      collected([{ id: "project", kind: "project", name: "p", attrs: {} }], {
        static: { secretSignals: [{ file: "src/server.ts:7", kind: "service-role-ref" }] },
      }),
    );
    const f = pol6Secrets.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.title).toContain("in-source credential shape");
    expect(JSON.stringify(f[0])).not.toContain("SERVICE_ROLE_KEY=");
  });
});

describe("POL-7 write amplification", () => {
  it("flags trigger fan-out to another table", () => {
    const ctx = buildContext(
      collected([
        {
          id: "trigger:orders.notify",
          kind: "trigger",
          name: "orders.notify",
          attrs: { table: "orders", functionDef: "BEGIN INSERT INTO notifications(order_id) VALUES (NEW.id); RETURN NEW; END;" },
        },
      ]),
    );

    const f = pol7WriteAmplification.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.policy).toBe("POL-7");
  });

  it("does not flag updated_at-only housekeeping triggers", () => {
    const ctx = buildContext(
      collected([
        {
          id: "trigger:orders.touch",
          kind: "trigger",
          name: "orders.touch",
          attrs: { table: "orders", functionDef: "BEGIN NEW.updated_at = now(); RETURN NEW; END;" },
        },
      ]),
    );

    expect(pol7WriteAmplification.evaluate(ctx)).toHaveLength(0);
  });

  it("flags a high update/insert ratio from table stats", () => {
    const ctx = buildContext(collected([{ id: "table:jobs", kind: "table", name: "jobs", attrs: { nTupIns: 100, nTupUpd: 2000 } }]));

    const f = pol7WriteAmplification.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.id).toContain("update-ratio");
  });
});

describe("POL-8 observability", () => {
  it("flags static AI call sites when no ledger table exists", () => {
    const ctx = buildContext(
      collected([{ id: "project", kind: "project", name: "p", attrs: {} }], {
        static: { modelIds: [{ file: "src/ai.ts", model: "google/gemini-2.5-flash-preview" }] },
      }),
    );

    const f = pol8Observability.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.title).toContain("AI call sites");
  });

  it("does not flag AI when a ledger table exists", () => {
    const ctx = buildContext(
      collected([
        { id: "ai_config", kind: "ai_config", name: "ai_config", attrs: { model: "gemini" } },
        { id: "table:ai_usage_logs", kind: "table", name: "ai_usage_logs", attrs: {} },
      ]),
    );

    expect(pol8Observability.evaluate(ctx)).toHaveLength(0);
  });
});
