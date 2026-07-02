import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "@nxlv-ai/lovable-core";
import { collectStatic, parsePolicies, parseEdgeFunctions } from "../packages/core/src/collect/static.ts";
import { pol3FetchDefaults, pol4AiCost, pol5RlsTenancy } from "@nxlv-ai/lovable-profile-cost";

// --- pure parsers --------------------------------------------------------------------

describe("static — parsePolicies", () => {
  it("extracts an open USING(true) SELECT policy", () => {
    const [p] = parsePolicies(`CREATE POLICY "read all" ON public.analytics_events FOR SELECT TO anon USING (true);`);
    expect(p).toMatchObject({ name: "read all", table: "analytics_events", cmd: "SELECT", qual: "true" });
    expect(p!.roles).toContain("anon");
  });

  it("defaults cmd to ALL when FOR is omitted", () => {
    const [p] = parsePolicies(`CREATE POLICY owner_only ON profiles USING (auth.uid() = user_id);`);
    expect(p!.cmd).toBe("ALL");
    expect(p!.qual).toBe("auth.uid() = user_id");
  });

  it("ignores commented-out policies", () => {
    expect(parsePolicies(`-- CREATE POLICY "x" ON t FOR SELECT USING (true);`)).toHaveLength(0);
  });

  it("parses multiple policies in one migration", () => {
    expect(parsePolicies(`CREATE POLICY a ON t1 FOR SELECT USING (true); CREATE POLICY b ON t2 FOR INSERT TO anon USING (true);`)).toHaveLength(2);
  });
});

describe("static — parseEdgeFunctions", () => {
  it("reads verify_jwt per function block", () => {
    const fns = parseEdgeFunctions(`[functions.telegram-poll]\nverify_jwt = false\n\n[functions.summary]\nverify_jwt = true\n`);
    expect(fns).toEqual([
      { name: "telegram-poll", verifyJwt: false },
      { name: "summary", verifyJwt: true },
    ]);
  });
});

// --- end-to-end collector over a synthetic Lovable repo ------------------------------

describe("static — collectStatic over a fixture repo", () => {
  let repo: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "recon-static-"));
    mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
    mkdirSync(join(repo, "src", "lib"), { recursive: true });
    mkdirSync(join(repo, "src", "integrations"), { recursive: true });

    writeFileSync(join(repo, "supabase", "config.toml"), `project_id = "abcdef123456"\n\n[functions.telegram-poll]\nverify_jwt = false\n\n[functions.morning-summary]\nverify_jwt = true\n`);

    writeFileSync(
      join(repo, "supabase", "migrations", "0001_init.sql"),
      `-- initial policies\nCREATE POLICY "Anyone can insert" ON public.analytics_events FOR INSERT TO anon USING (true);\nCREATE POLICY "owner reads" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);\n`,
    );

    // QueryClient with amplifying defaults (POL-3).
    writeFileSync(join(repo, "src", "lib", "query.ts"), `export const qc = new QueryClient({\n  defaultOptions: { queries: { staleTime: 0, refetchIntervalInBackground: true, refetchInterval: 5000 } },\n});\n`);

    // Auth wiring (POL-3 hypothesis) + a preview model id (POL-4) + a service-role reference (POL-6 static).
    writeFileSync(
      join(repo, "src", "integrations", "auth.ts"),
      `supabase.auth.onAuthStateChange((event, session) => { refetchEverything(); });\nconst MODEL = "google/gemini-2.5-flash-preview";\nconst key = process.env.SERVICE_ROLE_KEY;\n`,
    );
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("inventories cloud, edge functions and the project ref", async () => {
    const c = await collectStatic({ repoPath: repo, projectName: "fixture" });
    expect(c.project.mode).toBe("static");
    expect(c.project.supabaseRef).toBe("abcdef123456");
    expect(c.resources.filter((r) => r.kind === "edge_fn")).toHaveLength(2);
    expect(c.resources.find((r) => r.kind === "cloud")).toBeDefined();
  });

  it("parses migration policies into rls_policy resources that POL-5 flags", async () => {
    const c = await collectStatic({ repoPath: repo });
    const policies = c.resources.filter((r) => r.kind === "rls_policy");
    expect(policies).toHaveLength(2);
    const findings = pol5RlsTenancy.evaluate(buildContext(c));
    // The anon INSERT USING(true) surface must be flagged.
    expect(findings.some((f) => f.title.includes("analytics_events"))).toBe(true);
  });

  it("collects staleTime, background-polling and auth signals that POL-3 turns into findings", async () => {
    const c = await collectStatic({ repoPath: repo });
    const s = c.raw["static"] as { staleTimeSignals: unknown[]; backgroundPolling: unknown[]; authStateSignals: unknown[] };
    expect(s.staleTimeSignals.length).toBeGreaterThan(0);
    expect(s.backgroundPolling.length).toBeGreaterThan(0);
    expect(s.authStateSignals.length).toBeGreaterThan(0);

    const findings = pol3FetchDefaults.evaluate(buildContext(c));
    expect(findings.some((f) => f.id.startsWith("POL-3:staleTime"))).toBe(true);
    expect(findings.some((f) => f.id.startsWith("POL-3:bgpoll"))).toBe(true);
    expect(findings.some((f) => f.id.startsWith("POL-3:authstate"))).toBe(true);
  });

  it("surfaces a preview model id but does NOT raise a false no-cap critical", async () => {
    const c = await collectStatic({ repoPath: repo });
    const ai = c.resources.find((r) => r.kind === "ai_config");
    expect(ai?.attrs["source"]).toBe("static");

    const findings = pol4AiCost.evaluate(buildContext(c));
    expect(findings.some((f) => f.id === "POL-4:broken-model")).toBe(true);
    // Static evidence cannot see the DB cap, so the "no ceiling" critical must NOT fire.
    expect(findings.some((f) => f.id === "POL-4:no-cap")).toBe(false);
  });

  it("records a redacted credential shape without leaking the value", async () => {
    const c = await collectStatic({ repoPath: repo });
    const s = c.raw["static"] as { secretSignals: Array<{ kind: string }> };
    expect(s.secretSignals.some((x) => x.kind === "service-role-ref")).toBe(true);
  });
});

describe("static — graceful degradation", () => {
  it("does not throw when no repo path is given, and warns honestly", async () => {
    const c = await collectStatic({});
    expect(c.warnings.join(" ")).toMatch(/requires --repo/);
    expect(c.resources.every((r) => r.kind === "project")).toBe(true);
  });

  it("warns when the repo path does not exist", async () => {
    const c = await collectStatic({ repoPath: join(tmpdir(), "definitely-not-here-xyz") });
    expect(c.warnings.join(" ")).toMatch(/does not exist/);
  });
});
