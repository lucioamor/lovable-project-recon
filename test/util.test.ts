import { describe, expect, it } from "vitest";
import { cronRunsPerDay, looksLikeLogTable, humanBytes, redactSecrets } from "@nxlv-ai/lovable-core";

describe("cronRunsPerDay — valid schedules", () => {
  it("every-minute = 1440/day", () => expect(cronRunsPerDay("* * * * *")).toBe(1440));
  it("*/15 = 96/day (safe floor)", () => expect(cronRunsPerDay("*/15 * * * *")).toBe(96));
  it("hourly = 24/day", () => expect(cronRunsPerDay("0 * * * *")).toBe(24));
  it("once daily = 1/day", () => expect(cronRunsPerDay("0 11 * * *")).toBe(1));
  it("comma list = each entry", () => expect(cronRunsPerDay("0,30 * * * *")).toBe(48));
  it("range is inclusive", () => expect(cronRunsPerDay("0-4 * * * *")).toBe(120));
  it("monthly (fixed DOM) is well under 1/day", () => {
    const p = cronRunsPerDay("0 8 1 * *");
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.1);
  });

  // regressions from QA:
  it("list containing a range counts the whole range (>96/day)", () => {
    // minutes {0} ∪ {10..20} = 12 values * 24h = 288
    expect(cronRunsPerDay("0,10-20 * * * *")).toBe(288);
  });
  it("range with a step expands correctly", () => {
    // hours 9,11,13,15,17 = 5; minute 0 = 1
    expect(cronRunsPerDay("0 9-17/2 * * *")).toBe(5);
  });
});

describe("cronRunsPerDay — invalid schedules return NaN (no false positives)", () => {
  it.each([
    ["*/0 * * * *", "zero step"],
    ["50-10 * * * *", "inverted range"],
    ["61 * * * *", "minute out of range"],
    ["0 24 * * *", "hour out of range"],
    ["0 0 32 * *", "day-of-month out of range"],
    ["* * *", "too few fields"],
    ["", "empty"],
    ["a b c d e", "non-numeric"],
  ])("%s (%s) => NaN", (schedule) => {
    expect(cronRunsPerDay(schedule)).toBeNaN();
  });
});

describe("looksLikeLogTable", () => {
  it.each(["cron.job_run_details", "analytics_events", "webhook_logs", "delivery_attempts", "page_snapshots", "audit_trail", "app.request_logs"])("flags log/raw table %s", (name) =>
    expect(looksLikeLogTable(name)).toBe(true),
  );

  it.each([
    "users",
    "orders",
    "products",
    "profiles",
    // QA false-positives that must NOT be flagged (log word buried mid-name):
    "order_history",
    "history_lessons",
    "snapshot_tests",
    "user_audit_preferences",
    "telemetry_devices",
  ])("does not flag domain table %s", (name) => expect(looksLikeLogTable(name)).toBe(false));
});

describe("humanBytes", () => {
  it("formats MB and GB", () => {
    expect(humanBytes(121 * 1024 * 1024)).toBe("121 MB");
    expect(humanBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});

describe("redactSecrets", () => {
  it("masks a JWT while leaving surrounding text", () => {
    const out = redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig");
    expect(out).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    expect(out).toContain("eyJ<redacted>");
  });
  it("masks a Postgres connection string", () => {
    const out = redactSecrets("postgresql://readonly:hunter2@db.abc.supabase.co:5432/postgres");
    expect(out).toContain("postgresql://<redacted>");
    expect(out).not.toContain("hunter2");
  });
  it("masks a non-JWT bearer token", () => {
    const out = redactSecrets("bearer sbp_0123456789abcdef0123456789abcdef");
    expect(out).not.toContain("sbp_0123456789abcdef0123456789abcdef");
  });
  it("leaves ordinary text untouched", () => {
    expect(redactSecrets("SELECT * FROM orders;")).toBe("SELECT * FROM orders;");
  });
});
