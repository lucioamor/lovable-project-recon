/** Approximate invocations/day for a standard 5-field cron schedule. Good enough to flag
 * sub-15-min pollers; not a full cron semantics engine. */
export function cronRunsPerDay(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return NaN;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  let perDay = countField(min, 60) * countField(hour, 24);
  if (dom !== "*" && !dom.includes("*")) perDay = perDay / 30; // specific day-of-month
  if (mon !== "*" && !mon.includes("*")) perDay = perDay / 12; // specific month
  if (dow !== "*" && !dow.includes("*")) perDay = perDay * (countField(dow, 7) / 7);
  return perDay;
}

function countField(f: string, size: number): number {
  if (f === "*") return size;
  if (f.startsWith("*/")) {
    const n = parseInt(f.slice(2), 10);
    return n > 0 ? Math.floor(size / n) : size;
  }
  if (f.includes(",")) return f.split(",").length;
  if (f.includes("-")) {
    const [a, b] = f.split("-").map((x) => parseInt(x, 10));
    return Number.isFinite(a) && Number.isFinite(b) ? b! - a! + 1 : 1;
  }
  return 1;
}

const LOG_TABLE_RX =
  /(_|\b)(log|logs|events|event_log|cron_logs|job_run_details|audit|history|attempts|snapshots?|telemetry)(_|\b)/i;

export function looksLikeLogTable(name: string): boolean {
  return LOG_TABLE_RX.test(name);
}

export function humanBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
