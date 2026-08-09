import { describe, it, expect } from "vitest";
import {
  buildStructuredReport,
  bandTone,
} from "../ratings";
import { createMockMetrics } from "./testHelpers";
import type { EducatedGuess, DualTaskCost } from "../types";

describe("Clinical Rating Engine (ratings.ts)", () => {
  const mockGuesses: EducatedGuess[] = [
    {
      id: "view",
      title: "Side-view geometry",
      summary: "Good perspective",
      evidence: ["View: sagittal"],
      confidence: 0.9,
      severity: "low",
      category: "view",
    },
    {
      id: "zifchock-sa-deviation",
      title: "Inter-limb symmetry angle deviation",
      summary: "Moderate asymmetry",
      evidence: ["SA: 8.5%"],
      confidence: 0.7,
      severity: "moderate",
      category: "symmetry",
    },
  ];

  describe("buildStructuredReport", () => {
    it("generates a complete structured report with 7 domain ratings and 17 metric ratings", () => {
      const metrics = createMockMetrics({
        overallScore: 84,
        stabilityScore: 85,
        symmetryScore: 88,
        rhythmScore: 82,
        mobilityScore: 80,
        automaticityScore: 84,
      });

      const report = buildStructuredReport(metrics, mockGuesses, {
        taskMode: "single",
        analyzedFrames: 150,
      });

      expect(report.headline).toContain("Strong overall");
      expect(report.oneLiner).toBeTruthy();
      expect(report.taskMode).toBe("single");
      expect(report.viewAngle).toBe("sagittal");
      expect(report.viewConfidence).toBe(0.85);

      // 7 domain ratings
      expect(report.domains.length).toBe(7);
      const domainKeys = report.domains.map((d) => d.key);
      expect(domainKeys).toEqual([
        "overall",
        "stability",
        "symmetry",
        "rhythm",
        "mobility",
        "automaticity",
        "data_quality",
      ]);

      for (const d of report.domains) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
        expect(d.stars).toBeGreaterThanOrEqual(1);
        expect(d.stars).toBeLessThanOrEqual(5);
        expect(["strong", "good", "fair", "watch", "elevated"]).toContain(d.band);
        expect(d.drivers.length).toBeGreaterThan(0);
      }

      // 17 metric ratings
      expect(report.metrics.length).toBe(17);
      for (const m of report.metrics) {
        expect(m.favorability).toBeGreaterThanOrEqual(0);
        expect(m.favorability).toBeLessThanOrEqual(100);
        expect(["strong", "good", "fair", "watch", "elevated"]).toContain(m.band);
        expect(m.note).toBeTruthy();
      }

      // Hypotheses
      expect(report.hypotheses.length).toBe(2);
      expect(report.hypotheses[0].priority).toBeDefined();

      // Dual task omitted when not supplied
      expect(report.dualTask).toBeUndefined();

      expect(report.disclaimer).toBeTruthy();
    });

    it("includes dual-task structured rating when dualTaskCost is provided", () => {
      const metrics = createMockMetrics();
      const dualTaskCost: DualTaskCost = {
        cadenceCostPct: 12.0,
        stepTimeCvCostPct: 40.0,
        stabilityCostPts: 8.0,
        automaticityCostPts: 10.0,
        summary: "Notable dual-task cost",
        cadenceDTE: -12.0,
        stepTimeCvDTE: -40.0,
        symmetryDTE: -5.0,
        cmiClassification: "mutual_interference",
      };

      const report = buildStructuredReport(metrics, [], {
        taskMode: "dual",
        analyzedFrames: 150,
        dualTaskCost,
      });

      expect(report.dualTask).toBeDefined();
      expect(report.dualTask?.cost).toEqual(dualTaskCost);
      expect(report.dualTask?.stars).toBeGreaterThanOrEqual(1);
      expect(report.dualTask?.stars).toBeLessThanOrEqual(5);
      expect(report.dualTask?.blurb).toBeTruthy();
    });

    it("adjusts data quality score and populates quality notes for short clips", () => {
      const metrics = createMockMetrics({
        durationSec: 3.0,
        stepCount: 3,
        fpsEffective: 5.0,
        viewAngle: "unknown",
        viewConfidence: 0.3,
      });

      const report = buildStructuredReport(metrics, [], {
        taskMode: "single",
        analyzedFrames: 15,
      });

      const dqDomain = report.domains.find((d) => d.key === "data_quality")!;
      expect(dqDomain.score).toBeLessThan(65);
      expect(report.qualityNotes.length).toBeGreaterThan(0);
      expect(report.oneLiner).toContain("provisional");
    });
  });

  describe("5-band score classification mapping", () => {
    it("maps scores to 5 rating bands correctly", () => {
      // Test boundaries: 80+ -> strong, 65-79 -> good, 50-64 -> fair, 35-49 -> watch, <35 -> elevated
      const mStrong = createMockMetrics({ overallScore: 85 });
      const mGood = createMockMetrics({ overallScore: 70 });
      const mFair = createMockMetrics({ overallScore: 55 });
      const mWatch = createMockMetrics({ overallScore: 40 });
      const mElevated = createMockMetrics({ overallScore: 25 });

      expect(buildStructuredReport(mStrong, [], { taskMode: "single", analyzedFrames: 100 }).domains[0].band).toBe("strong");
      expect(buildStructuredReport(mGood, [], { taskMode: "single", analyzedFrames: 100 }).domains[0].band).toBe("good");
      expect(buildStructuredReport(mFair, [], { taskMode: "single", analyzedFrames: 100 }).domains[0].band).toBe("fair");
      expect(buildStructuredReport(mWatch, [], { taskMode: "single", analyzedFrames: 100 }).domains[0].band).toBe("watch");
      expect(buildStructuredReport(mElevated, [], { taskMode: "single", analyzedFrames: 100 }).domains[0].band).toBe("elevated");
    });
  });

  describe("bandTone UI color mapping", () => {
    it("maps rating bands to expected UI tones", () => {
      expect(bandTone("strong")).toBe("success");
      expect(bandTone("good")).toBe("primary");
      expect(bandTone("fair")).toBe("neutral");
      expect(bandTone("watch")).toBe("warn");
      expect(bandTone("elevated")).toBe("info");
    });
  });
});
