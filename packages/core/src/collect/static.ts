import type { Collected, CollectOptions } from "./types.ts";

// M1 stub. Will read `supabase/config.toml`, `supabase/migrations/*`, and `rg` the source for
// client-amplification signals (staleTime, refetchIntervalInBackground, onAuthStateChange) and
// broken/preview model IDs — feeding POL-3 and the static half of POL-4/POL-6.
export async function collectStatic(opts: CollectOptions): Promise<Collected> {
  return {
    project: {
      name: opts.projectName ?? "local-repo",
      mode: "static",
      scannedAt: new Date().toISOString(),
    },
    resources: [],
    observations: [],
    raw: { static: { staleTimeSignals: [], modelIds: [] } },
    warnings: ["static mode is a stub (M1) — no source scan performed yet"],
  };
}
