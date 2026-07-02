import { describe, expect, it } from "vitest";
// Import the collector module directly: `pg` is imported lazily inside collectDb, so loading
// this file for its pure helpers never requires the optional driver.
import { bareName, classifyHttpResponses, deriveIdleDays, tablesPrunedByCron, toInt } from "../packages/core/src/collect/db.ts";

describe("db mode — defensive byte parsing", () => {
  it("parses bigint strings from pg", () => {
    expect(toInt("126877696")).toBe(126877696);
  });
  it("coerces NULL / garbage to 0 instead of NaN", () => {
    expect(toInt(null)).toBe(0);
    expect(toInt(undefined)).toBe(0);
    expect(toInt("not-a-number")).toBe(0);
    expect(toInt(NaN)).toBe(0);
  });
  it("passes through plain numbers", () => {
    expect(toInt(42)).toBe(42);
  });
});

describe("db mode — schema-qualified names", () => {
  it("strips the schema prefix", () => {
    expect(bareName("cron.job_run_details")).toBe("job_run_details");
    expect(bareName("public.orders")).toBe("orders");
    expect(bareName("orders")).toBe("orders");
  });
});

describe("db mode — retention inference from cron commands", () => {
  it("detects a DELETE-based prune job", () => {
    const pruned = tablesPrunedByCron([{ command: "DELETE FROM webhook_logs WHERE created_at < now() - interval '30 days'" }]);
    expect(pruned.has("webhook_logs")).toBe(true);
  });

  it("detects a TRUNCATE and a schema-qualified target", () => {
    const pruned = tablesPrunedByCron([{ command: "truncate table staging_events" }, { command: "delete from public.audit_log where ts < now()" }]);
    expect(pruned.has("staging_events")).toBe(true);
    expect(pruned.has("audit_log")).toBe(true);
  });

  it("returns empty for jobs that never prune", () => {
    const pruned = tablesPrunedByCron([{ command: "SELECT net.http_post(url := '...')" }]);
    expect(pruned.size).toBe(0);
  });

  it("ignores a DELETE that lives inside a string literal (QA false positive)", () => {
    const pruned = tablesPrunedByCron([{ command: "SELECT 'DELETE FROM webhook_logs WHERE old'" }]);
    expect(pruned.has("webhook_logs")).toBe(false);
  });

  it("ignores a DELETE inside a SQL comment", () => {
    const pruned = tablesPrunedByCron([{ command: "-- DELETE FROM webhook_logs WHERE old\nSELECT 1" }]);
    expect(pruned.has("webhook_logs")).toBe(false);
  });

  it("captures the real table after DELETE FROM ONLY, not the ONLY keyword", () => {
    const pruned = tablesPrunedByCron([{ command: "delete from only webhook_logs where ts < now()" }]);
    expect(pruned.has("webhook_logs")).toBe(true);
    expect(pruned.has("only")).toBe(false);
  });
});

describe("db mode - runtime signal helpers", () => {
  it("classifies net._http_response failures by strongest host status", () => {
    const classified = classifyHttpResponses([
      { status_code: 500, created: "2026-07-01T08:00:00.000Z" },
      { status_code: 401, created: "2026-07-01T09:00:00.000Z" },
      { status_code: null, error_msg: "DNS could not resolve host", created: "2026-07-01T10:00:00.000Z" },
    ]);

    expect(classified.hostStatus).toBe("dead");
    expect(classified.statusCodes).toEqual([500, 401]);
    expect(classified.errorCount).toBe(1);
    expect(classified.latestCreated).toBe("2026-07-01T10:00:00.000Z");
  });

  it("derives idle days from the latest DB runtime timestamp", () => {
    expect(deriveIdleDays("2026-07-02T12:00:00.000Z", [{ start_time: "2026-06-29T12:00:00.000Z" }], [{ created: "2026-06-30T12:00:00.000Z" }])).toBe(2);
  });

  it("returns undefined when no runtime timestamp is available", () => {
    expect(deriveIdleDays("2026-07-02T12:00:00.000Z", [], [])).toBeUndefined();
  });
});
