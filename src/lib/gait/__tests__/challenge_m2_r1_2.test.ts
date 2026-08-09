import { describe, expect, test } from "vitest";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import { computeDualTaskCost } from "../analysis";
import type { GaitMetrics, DualTaskCost } from "../types";

function createDummyMetrics(overrides: Partial<GaitMetrics> = {}): GaitMetrics {
  return {
    viewAngle: "sagittal",
    viewConfidence: 0.85,
    durationSec: 5.0,
    fpsEffective: 30.0,
    stepCount: 10,
    cadenceSpm: 120,
    avgStepTimeSec: 0.5,
    stepTimeAsymmetry: 0.05,
    strideAsymmetry: 0.05,
    lateralSway: 0.03,
    verticalBounce: 0.02,
    armSwingLeft: 0.4,
    armSwingRight: 0.4,
    armSwingAsymmetry: 0.0,
    kneeFlexLeft: 45,
    kneeFlexRight: 45,
    kneeAsymmetry: 0.0,
    stepWidthVariability: 0.02,
    doubleSupportHint: 0.2,
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 1.5,
    stepTimeCV: 0.04,
    strideTimeCV: 0.04,
    pelvicObliquity: 0.02,
    pelvicObliquityVar: 0.01,
    meanStepWidth: 0.35,
    pathSmoothness: 0.9,
    stabilityScore: 85,
    rhythmScore: 85,
    symmetryScore: 90,
    mobilityScore: 80,
    automaticityScore: 88,
    overallScore: 86,
    series: [
      {
        t: 0,
        midHipX: 0.5,
        midHipY: 0.5,
        leftAnkleY: 0.8,
        rightAnkleY: 0.8,
        leftWristX: 0.4,
        rightWristX: 0.6,
        leftKneeAngle: 45,
        rightKneeAngle: 45,
      },
    ],
    stepEvents: [],
    ...overrides,
  };
}

describe("Milestone 2 Challenge Suite - Challenger 2 (m2_r1_2)", () => {
  describe("Task 2.1: buildStructuredReport Score Output Bounds & Quality Notes", () => {
    test("Score outputs strictly bounded within [0, 100] for standard metrics", () => {
      const metrics = createDummyMetrics();
      const report = buildStructuredReport(metrics, [], {
        taskMode: "single",
        analyzedFrames: 150,
      });

      for (const d of report.domains) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
        expect(Number.isNaN(d.score)).toBe(false);
        expect(d.stars).toBeGreaterThanOrEqual(1);
        expect(d.stars).toBeLessThanOrEqual(5);
      }
    });

    test("Score outputs bounded when input GaitMetrics has extreme out-of-range scores", () => {
      const metrics = createDummyMetrics({
        overallScore: 150,
        stabilityScore: -50,
        symmetryScore: 999,
        rhythmScore: -100,
        mobilityScore: 500,
        automaticityScore: -20,
      });

      const report = buildStructuredReport(metrics, [], {
        taskMode: "single",
        analyzedFrames: 150,
      });

      for (const d of report.domains) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
        expect(Number.isNaN(d.score)).toBe(false);
      }
    });

    test("Metric ratings favorability scores bounded strictly within [0, 100]", () => {
      const metrics = createDummyMetrics({
        cadenceSpm: 500, // extreme cadence
        symmetryAngle: 80.0, // extreme asymmetry
        stepTimeCV: 1.5, // extreme CV
        lateralSway: 0.8, // extreme sway
      });

      const report = buildStructuredReport(metrics, [], {
        taskMode: "single",
        analyzedFrames: 100,
      });

      for (const m of report.metrics) {
        expect(m.favorability).toBeGreaterThanOrEqual(0);
        expect(m.favorability).toBeLessThanOrEqual(100);
        expect(Number.isNaN(m.favorability)).toBe(false);
      }
    });

    test("Gracefully handles missing / undefined optional SOTA metrics", () => {
      const metrics = createDummyMetrics({
        symmetryAngle: undefined,
        leftStancePct: undefined,
        rightStancePct: undefined,
        doubleSupportPct: undefined,
      });

      const report = buildStructuredReport(metrics, [], {
        taskMode: "single",
        analyzedFrames: 150,
      });

      expect(report.domains.length).toBeGreaterThan(0);
      for (const d of report.domains) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Task 2.2: guesses.ts Decision Tree & Rule Paths", () => {
    test("Evaluates all SOTA rule paths with extreme metric inputs without throwing or producing NaN/undefined strings", () => {
      const extremeMetrics = createDummyMetrics({
        symmetryAngle: 12.5, // triggers zifchock-sa-deviation
        leftStancePct: 72.0,
        rightStancePct: 58.0, // stanceDiff = 14 > 6 -> triggers zeni-stance-breakdown
        doubleSupportPct: 29.0,
        armSwingAsymmetry: 0.6,
        armSwingLeft: 0.1,
        armSwingRight: 0.5,
        stepTimeCV: 0.25,
        lateralSway: 0.15,
        meanStepWidth: 0.6,
        stepTimeAsymmetry: 0.25,
        strideAsymmetry: 0.3,
        kneeAsymmetry: 0.3,
        pelvicObliquity: 0.1,
        pelvicObliquityVar: 0.05,
        cadenceSpm: 70,
        kneeFlexLeft: 20,
        kneeFlexRight: 20,
        rhythmScore: 30,
        automaticityScore: 30,
        stabilityScore: 35,
        overallScore: 40,
      });

      const dtc: DualTaskCost = {
        cadenceCostPct: 20.0,
        stepTimeCvCostPct: 30.0,
        stabilityCostPts: 15.0,
        automaticityCostPts: 18.0,
        summary: "Dual-Task Effect summary text",
        cadenceDTE: -20.0,
        stepTimeCvDTE: -30.0,
        symmetryDTE: -10.0,
        cmiClassification: "mutual_interference",
      };

      const guesses = buildEducatedGuesses(extremeMetrics, {
        taskMode: "dual",
        dualTaskCost: dtc,
      });

      expect(guesses.length).toBeGreaterThan(0);

      for (const g of guesses) {
        expect(g.id).toBeTruthy();
        expect(g.title).toBeTruthy();
        expect(g.summary).toBeTruthy();
        expect(g.confidence).toBeGreaterThanOrEqual(0);
        expect(g.confidence).toBeLessThanOrEqual(1);
        expect(["low", "moderate", "elevated"]).toContain(g.severity);

        for (const ev of g.evidence) {
          expect(ev).not.toContain("undefined");
          expect(ev).not.toContain("NaN");
          expect(ev).not.toContain("null");
        }
      }
    });

    test("Handles missing/undefined optional fields in guesses.ts gracefully", () => {
      const sparseMetrics = createDummyMetrics({
        symmetryAngle: undefined,
        leftStancePct: undefined,
        rightStancePct: undefined,
        doubleSupportPct: undefined,
      });

      const guesses = buildEducatedGuesses(sparseMetrics);

      for (const g of guesses) {
        for (const ev of g.evidence) {
          expect(ev).not.toContain("undefined");
          expect(ev).not.toContain("NaN");
        }
      }
    });
  });

  describe("Task 2.3: DualTaskCost & Plummer & Eskes CMI Classification", () => {
    test("Calculates DTE correctly for various single vs dual metric pairs", () => {
      const single = createDummyMetrics({
        cadenceSpm: 120,
        stepTimeCV: 0.04,
        stabilityScore: 85,
        automaticityScore: 85,
      });

      const dualDegraded = createDummyMetrics({
        cadenceSpm: 100, // DTE = -16.67%
        stepTimeCV: 0.07, // DTE = -75%
        stabilityScore: 70,
        automaticityScore: 65,
      });

      const dtc = computeDualTaskCost(single, dualDegraded);

      expect(dtc.cmiClassification).toBe("mutual_interference");
      expect(dtc.cadenceDTE).toBeCloseTo(-16.7, 1);
      expect(dtc.stepTimeCvDTE).toBeCloseTo(-75.0, 1);
    });
  });

  describe("Task 2.4: Session Persistence RPC Data Serialization & Verification", () => {
    test("GaitSessionRecord handles JSON serialization of metrics with undefined SOTA properties", () => {
      const metrics = createDummyMetrics();
      // Omit optional fields to test JSON behavior
      delete (metrics as any).symmetryAngle;
      delete (metrics as any).harmonicRatio;

      const serialized = JSON.stringify(metrics);
      const parsed: GaitMetrics = JSON.parse(serialized);

      expect(parsed.cadenceSpm).toBe(120);
      expect(parsed.symmetryAngle).toBeUndefined();

      // Verify buildStructuredReport works fine on deserialized object
      const report = buildStructuredReport(parsed, [], {
        taskMode: "single",
        analyzedFrames: 100,
      });

      expect(report.domains.length).toBeGreaterThan(0);
    });
  });
});
