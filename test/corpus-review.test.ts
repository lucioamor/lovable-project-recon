import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("reviewed evidence corpus", () => {
  it("covers every usage report and has no pending review seeds", () => {
    const corpusDir = join(process.cwd(), "corpus");
    const reportsDir = join(process.cwd(), "usage-reports");
    const reportFiles = readdirSync(reportsDir).filter((file) => /_USAGE_REPORT\.md$/i.test(file));
    const coveredReports = new Set<string>();

    for (const file of readdirSync(corpusDir).filter((name) => name.endsWith(".evidence.json"))) {
      const evidence = JSON.parse(readFileSync(join(corpusDir, file), "utf8")) as {
        raw?: { conversion?: string; usageReportReview?: { reviewedAt?: string; sourceReports?: Array<{ file?: string; sha256?: string; headingCount?: number; headings?: Array<{ title?: string }> }> } };
        warnings?: string[];
      };
      const review = evidence.raw?.usageReportReview;

      expect(review?.reviewedAt, file).toBe("2026-07-02");
      expect(review?.sourceReports?.length, file).toBeGreaterThan(0);
      expect(evidence.raw?.conversion, file).toContain("hand-reviewed corpus fixture");
      expect((evidence.warnings ?? []).join(" "), file).not.toMatch(/pending hand review/i);

      for (const source of review?.sourceReports ?? []) {
        expect(reportFiles, `${file} -> ${source.file}`).toContain(source.file);
        expect(source.sha256, source.file).toMatch(/^[a-f0-9]{64}$/);
        expect(source.headingCount, source.file).toBeGreaterThan(0);
        coveredReports.add(source.file!);

        for (const heading of source.headings ?? []) {
          expect(heading.title ?? "", `${source.file} heading mojibake`).not.toMatch(/\S \? \S/);
        }
      }
    }

    expect([...coveredReports].sort()).toEqual([...reportFiles].sort());
  });

  it("is reconciled with the committed corpus (corpus:check passes)", () => {
    expect(() =>
      execFileSync(process.execPath, ["tools/review_evidence_corpus.mjs", "--check"], {
        cwd: process.cwd(),
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
