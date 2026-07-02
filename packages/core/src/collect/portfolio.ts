import type { Collected, CollectOptions } from "./types.ts";

// M4 stub. Will fan out across a whole portfolio using an authorized Lovable token
// (captured with explicit consent via the extension, browser-first). It should collect
// inventory + per-project deep signals and emit findings — never store the raw token.
export async function collectPortfolio(_opts: CollectOptions): Promise<Collected> {
  throw new Error("portfolio mode is a stub (M4). It will require an authorized token and browser-first execution; " + "not implemented in M0.");
}
