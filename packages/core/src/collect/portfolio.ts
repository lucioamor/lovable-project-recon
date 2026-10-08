import type { Collected, CollectOptions } from "./types.ts";

// Portfolio is a runner concern, not a single-project collector. The CLI implements
// `scan --mode portfolio --dir <corpus>` as fan-out over ProjectEvidence files.
export async function collectPortfolio(_opts: CollectOptions): Promise<Collected> {
  throw new Error("portfolio collection is a runner, not a single-project collector. Use `recon scan --mode portfolio --dir <evidence-dir>`.");
}
