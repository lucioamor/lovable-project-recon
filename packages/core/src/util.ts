/** Approximate invocations/day for a standard 5-field cron schedule. Good enough to flag
 * sub-15-min pollers; not a full cron semantics engine (DOM+DOW is treated as AND, a slight
 * under-count). Returns NaN for any field that is malformed or out of range. */
export function cronRunsPerDay(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return NaN;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];

  const minCount = countField(min, 0, 59);
  const hourCount = countField(hour, 0, 23);
  const domCount = countField(dom, 1, 31);
  const monCount = countField(mon, 1, 12);
  const dowCount = countField(dow, 0, 7);
  if ([minCount, hourCount, domCount, monCount, dowCount].some(Number.isNaN)) return NaN;

  let perDay = minCount * hourCount;
  if (dom !== "*") perDay = perDay * (domCount / 31);
  if (mon !== "*") perDay = perDay * (monCount / 12);
  if (dow !== "*") perDay = perDay * (dowCount / 7);
  return perDay;
}

/** Count distinct values a cron field matches within [lo, hi]. NaN if any part is invalid. */
function countField(f: string, lo: number, hi: number): number {
  if (f === "*") return hi - lo + 1;
  let total = 0;
  for (const part of f.split(",")) {
    const c = countPart(part, lo, hi);
    if (Number.isNaN(c)) return NaN;
    total += c;
  }
  return total;
}

function countPart(part: string, lo: number, hi: number): number {
  let base = part;
  let step = 1;
  if (part.includes("/")) {
    const bits = part.split("/");
    if (bits.length !== 2) return NaN;
    step = Number(bits[1]);
    if (!Number.isInteger(step) || step <= 0) return NaN;
    base = bits[0] ?? "";
  }

  let start: number;
  let end: number;
  if (base === "*") {
    start = lo;
    end = hi;
  } else if (base.includes("-")) {
    const bits = base.split("-");
    if (bits.length !== 2) return NaN;
    start = Number(bits[0]);
    end = Number(bits[1]);
  } else {
    start = Number(base);
    end = start;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return NaN;
  if (start < lo || end > hi || start > end) return NaN;

  let count = 0;
  for (let i = start; i <= end; i += step) count++;
  return count;
}

// Log/raw tables are named by convention: the value is in the trailing token (`*_logs`,
// `*_events`) or a known infra table — NOT in a domain word buried mid-name (`user_audit_prefs`).
const LOG_LAST_TOKEN = new Set(["log", "logs", "event", "events", "attempts", "snapshots", "telemetry", "trail"]);
const KNOWN_LOG_TABLES = new Set(["job_run_details", "audit_trail", "audit_log", "cron_logs"]);

export function looksLikeLogTable(name: string): boolean {
  const bare = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (KNOWN_LOG_TABLES.has(bare)) return true;
  const tokens = bare.split(/[_.]/).filter(Boolean);
  if (tokens.includes("log") || tokens.includes("logs")) return true;
  const last = tokens[tokens.length - 1];
  return last !== undefined && LOG_LAST_TOKEN.has(last);
}

export function humanBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

// --- secret redaction (egress only): never let a token/credential reach JSON/report output ---

const JWT_RX = /eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+){0,2}/g;
const PG_URL_RX = /postgres(?:ql)?:\/\/[^\s'"]+/gi;
const BEARER_RX = /(bearer\s+)(?!<)[A-Za-z0-9._~+/=-]{16,}/gi;

/** Mask JWTs, Postgres connection strings and bearer tokens. Shape-preserving, value-erasing. */
export function redactSecrets(text: string): string {
  return text.replace(JWT_RX, "eyJ<redacted>").replace(PG_URL_RX, "postgresql://<redacted>").replace(BEARER_RX, "$1<redacted>");
}
