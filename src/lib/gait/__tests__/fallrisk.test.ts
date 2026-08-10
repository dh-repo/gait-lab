import { describe, it, expect } from "vitest";
import {
  computeFallRiskModelA,
  computeFallRiskModelB,
  evaluatePredictiveAgreement,
} from "../fallrisk";
import { createMockMetrics } from "./testHelpers";
import type { DualTaskCost, GaitMetrics } from "../types";
import type { GaitAngleAnalysis } from "../angles";

describe("Dual Fall Risk Predictive Engine (fallrisk.ts)", () => {
  // =========================================================================
  // 1. Model A: CDC STEADI / Tinetti Clinical Cutoffs
  // =========================================================================
  describe("computeFallRiskModelA", () => {
    it("classifies LOW risk (score 0, 0 breaches) when all 4 CDC STEADI metrics are normal", () => {
      const metrics = createMockMetrics({
        gaitSpeedMps: 1.15,
        cadenceSpm: 110,
        stepTimeCV: 0.035, // 3.5% (<= 6%)
        doubleSupportPct: 20.0, // <= 35%
        symmetryAngle: 3.2, // <= 10%
      });

      const result = computeFallRiskModelA(metrics);

      expect(result.category).toBe("low");
      expect(result.breachedCount).toBe(0);
      expect(result.evaluatedCount).toBe(4);
      expect(result.score).toBe(0);
      expect(result.flags.gaitSpeedRisk).toBe(false);
      expect(result.flags.stepTimeCvRisk).toBe(false);
      expect(result.flags.doubleSupportRisk).toBe(false);
      expect(result.flags.symmetryRisk).toBe(false);
      expect(result.cutoffsMet.slowSpeed).toBe(false);
      expect(result.cutoffsMet.highStepTimeCV).toBe(false);
      expect(result.cutoffsMet.highDoubleSupport).toBe(false);
      expect(result.cutoffsMet.highAsymmetry).toBe(false);
      expect(result.reasons).toContain("All CDC STEADI gait parameters within normal clinical bounds");
    });

    it("classifies MODERATE risk when 1 cutoff is breached (slow speed <0.8 m/s)", () => {
      const metrics = createMockMetrics({
        gaitSpeedMps: 0.72, // BREACHED (<0.8 m/s)
        stepTimeCV: 0.04,
        doubleSupportPct: 22.0,
        symmetryAngle: 4.0,
      });

      const result = computeFallRiskModelA(metrics);

      expect(result.category).toBe("moderate");
      expect(result.breachedCount).toBe(1);
      expect(result.flags.gaitSpeedRisk).toBe(true);
      expect(result.flags.stepTimeCvRisk).toBe(false);
      expect(result.cutoffsMet.slowSpeed).toBe(true);
      expect(result.flagValues.gaitSpeedMps).toBe(0.72);
    });

    it("classifies MODERATE risk when 2 cutoffs are breached (step CV >6% and symmetry angle >10%)", () => {
      const metrics = createMockMetrics({
        gaitSpeedMps: 1.10,
        stepTimeCV: 0.085, // BREACHED (8.5% > 6.0%)
        doubleSupportPct: 24.0,
        symmetryAngle: 14.2, // BREACHED (14.2% > 10.0%)
      });

      const result = computeFallRiskModelA(metrics);

      expect(result.category).toBe("moderate");
      expect(result.breachedCount).toBe(2);
      expect(result.flags.stepTimeCvRisk).toBe(true);
      expect(result.flags.symmetryRisk).toBe(true);
      expect(result.flags.gaitSpeedRisk).toBe(false);
      expect(result.flags.doubleSupportRisk).toBe(false);
    });

    it("classifies HIGH risk when 3 cutoffs are breached", () => {
      const metrics = createMockMetrics({
        gaitSpeedMps: 0.65, // BREACHED (<0.8 m/s)
        stepTimeCV: 0.09, // BREACHED (9.0% > 6.0%)
        doubleSupportPct: 38.5, // BREACHED (38.5% > 35.0%)
        symmetryAngle: 5.0, // Normal
      });

      const result = computeFallRiskModelA(metrics);

      expect(result.category).toBe("high");
      expect(result.breachedCount).toBe(3);
      expect(result.score).toBeGreaterThanOrEqual(66);
      expect(result.flags.gaitSpeedRisk).toBe(true);
      expect(result.flags.stepTimeCvRisk).toBe(true);
      expect(result.flags.doubleSupportRisk).toBe(true);
      expect(result.flags.symmetryRisk).toBe(false);
    });

    it("classifies HIGH risk when all 4 cutoffs are breached", () => {
      const metrics = createMockMetrics({
        gaitSpeedMps: 0.55, // BREACHED
        stepTimeCV: 0.12, // BREACHED (12%)
        doubleSupportPct: 42.0, // BREACHED (42%)
        symmetryAngle: 18.0, // BREACHED (18%)
      });

      const result = computeFallRiskModelA(metrics);

      expect(result.category).toBe("high");
      expect(result.breachedCount).toBe(4);
      expect(result.score).toBe(100);
    });

    it("handles exact cutoff boundary values correctly (<= thresholds non-breach)", () => {
      const boundaryMetrics = createMockMetrics({
        gaitSpeedMps: 0.80, // EXACT boundary: 0.80 is NOT < 0.80
        stepTimeCV: 0.06, // EXACT boundary: 6.0% is NOT > 6.0%
        doubleSupportPct: 35.0, // EXACT boundary: 35.0% is NOT > 35.0%
        symmetryAngle: 10.0, // EXACT boundary: 10.0% is NOT > 10.0%
      });

      const result = computeFallRiskModelA(boundaryMetrics);

      expect(result.flags.gaitSpeedRisk).toBe(false);
      expect(result.flags.stepTimeCvRisk).toBe(false);
      expect(result.flags.doubleSupportRisk).toBe(false);
      expect(result.flags.symmetryRisk).toBe(false);
      expect(result.breachedCount).toBe(0);
    });

    it("handles null/missing metrics in frontal view clips without throwing errors or returning NaN", () => {
      const frontalMetrics = createMockMetrics({
        viewAngle: "frontal",
        doubleSupportPct: null,
        doubleSupportHint: 0,
        symmetryAngle: null,
        gaitSpeedMps: null,
        cadenceSpm: 90, // Proxy gait speed ~ 1.08 m/s
        stepTimeCV: 0.08, // BREACHED (8%)
      });

      const result = computeFallRiskModelA(frontalMetrics);

      expect(isNaN(result.score)).toBe(false);
      expect(isNaN(result.points)).toBe(false);
      expect(result.flagValues.doubleSupportPct).toBeNull();
      expect(result.flagValues.symmetryAnglePct).toBeNull();
      expect(result.flags.doubleSupportRisk).toBe(false);
      expect(result.flags.symmetryRisk).toBe(false);
      expect(result.flags.stepTimeCvRisk).toBe(true);
      expect(result.evaluatedCount).toBe(2); // gait speed + step time CV
      expect(result.breachedCount).toBe(1);
    });

    it("handles zero speed and zero cadence gracefully without division by zero", () => {
      const zeroMetrics = createMockMetrics({
        stepCount: 0,
        cadenceSpm: 0,
        durationSec: 5.0,
        stepTimeCV: 0,
        doubleSupportPct: null,
        symmetryAngle: null,
        series: [],
      });

      let result: any;
      expect(() => {
        result = computeFallRiskModelA(zeroMetrics);
      }).not.toThrow();

      expect(isNaN(result.score)).toBe(false);
      expect(isNaN(result.points)).toBe(false);
      expect(result.category).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Model B: Dynamic Multi-Factor Composite Index
  // =========================================================================
  describe("computeFallRiskModelB", () => {
    it("computes continuous score in Dual-Task mode with standard weights (30% kin, 25% sway, 25% DTE, 20% var)", () => {
      const metrics = createMockMetrics({
        lateralSway: 0.04,
        stepTimeCV: 0.04,
      });

      const dte: DualTaskCost = {
        cadenceCostPct: 15.0,
        stepTimeCvCostPct: 18.0,
        stabilityCostPts: 10,
        automaticityCostPts: 12,
        summary: "Dual task cost present",
        cadenceDTE: -15.0,
        stepTimeCvDTE: -18.0,
      };

      const result = computeFallRiskModelB(metrics, dte);

      expect(result.isDualTask).toBe(true);
      expect(result.isSingleTaskRenormalized).toBe(false);
      expect(result.weights.kinematics).toBe(0.30);
      expect(result.weights.trunkSway).toBe(0.25);
      expect(result.weights.dte).toBe(0.25);
      expect(result.weights.variability).toBe(0.20);
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
      expect(isNaN(result.compositeScore)).toBe(false);
    });

    it("re-normalizes weights in Single-Task mode (40% kin, 33% sway, 0% DTE, 27% var) when dualTaskCost is absent", () => {
      const metrics = createMockMetrics({
        lateralSway: 0.04,
        stepTimeCV: 0.04,
      });

      const result = computeFallRiskModelB(metrics, undefined);

      expect(result.isDualTask).toBe(false);
      expect(result.isSingleTaskRenormalized).toBe(true);
      expect(result.weights.dte).toBe(0.00);
      expect(result.weights.kinematics).toBe(0.40);
      expect(result.weights.trunkSway).toBeCloseTo(0.33, 2);
      expect(result.weights.variability).toBeCloseTo(0.27, 2);
      expect(result.subScores.dteScore).toBeNull();
    });

    it("activates Frontal View fallback using pelvic obliquity variance & vertical bounce amplitude", () => {
      const frontalMetrics = createMockMetrics({
        viewAngle: "frontal",
        pelvicObliquityVar: 0.06,
        verticalBounce: 0.07,
        lateralSway: 0.09,
      });

      const angleAnalysis = {
        viewAngle: "frontal",
        isSuppressed: true,
        suppressionReason: "Frontal view suppresses sagittal joint flexion",
        confidence: 0.9,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: null,
        normativeData: [],
      } as unknown as GaitAngleAnalysis;

      const result = computeFallRiskModelB(frontalMetrics, undefined, angleAnalysis, "frontal");

      expect(result.isFrontalFallback).toBe(true);
      expect(result.subScores.kinematicsScore).toBeGreaterThan(0);
      expect(isNaN(result.compositeScore)).toBe(false);
      expect(result.reasons.some(r => r.includes("pelvic obliquity"))).toBe(true);
    });

    it("correctly maps composite scores to risk levels (<30 low, 30-60 moderate, >=60 high)", () => {
      // Low risk scenario
      const lowMetrics = createMockMetrics({
        lateralSway: 0.02,
        stepTimeCV: 0.02,
        verticalBounce: 0.02,
        pelvicObliquityVar: 0.01,
      });
      const lowResult = computeFallRiskModelB(lowMetrics);
      expect(lowResult.category).toBe("low");
      expect(lowResult.compositeScore).toBeLessThan(30.0);

      // High risk scenario
      const highMetrics = createMockMetrics({
        lateralSway: 0.16, // > 0.15 high sway
        stepTimeCV: 0.10, // > 8% high variability
        verticalBounce: 0.09,
        pelvicObliquityVar: 0.10,
      });
      const dteHigh: DualTaskCost = {
        cadenceCostPct: 25.0,
        stepTimeCvCostPct: 30.0,
        stabilityCostPts: 20,
        automaticityCostPts: 25,
        summary: "Severe DTE cost",
        stepTimeCvDTE: -30.0,
      };
      const highResult = computeFallRiskModelB(highMetrics, dteHigh);
      expect(highResult.category).toBe("high");
      expect(highResult.compositeScore).toBeGreaterThanOrEqual(60.0);
    });

    it("handles null/missing metric properties without producing NaN or throwing", () => {
      const sparseMetrics: GaitMetrics = {
        viewAngle: "unknown",
        viewConfidence: 0.5,
        durationSec: 4.0,
        fpsEffective: 30,
        stepCount: 4,
        cadenceSpm: 80,
        avgStepTimeSec: 0.75,
        stepTimeAsymmetry: 0,
        strideAsymmetry: null,
        lateralSway: null,
        verticalBounce: 0.03,
        armSwingLeft: 0.2,
        armSwingRight: 0.2,
        armSwingAsymmetry: 0,
        kneeFlexLeft: null,
        kneeFlexRight: null,
        kneeAsymmetry: null,
        stepWidthVariability: null,
        doubleSupportHint: 0.2,
        doubleSupportPct: null,
        symmetryAngle: null,
        stepTimeCV: 0,
        strideTimeCV: 0,
        pelvicObliquity: null,
        pelvicObliquityVar: null,
        meanStepWidth: null,
        pathSmoothness: 0.5,
        stabilityScore: 50,
        rhythmScore: 50,
        symmetryScore: 50,
        mobilityScore: 50,
        automaticityScore: 50,
        overallScore: 50,
        series: [],
        stepEvents: [],
      };

      let result: any;
      expect(() => {
        result = computeFallRiskModelB(sparseMetrics);
      }).not.toThrow();

      expect(isNaN(result.compositeScore)).toBe(false);
      expect(isNaN(result.subScores.kinematicsScore)).toBe(false);
      expect(isNaN(result.subScores.trunkSwayScore)).toBe(false);
      expect(isNaN(result.subScores.variabilityScore)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Cohen's Kappa & Percentage Agreement Evaluation
  // =========================================================================
  describe("evaluatePredictiveAgreement", () => {
    it("returns CONCORDANT (kappa = 1.0, Pa = 100%) when Model A and Model B categories match exactly", () => {
      const modelA = computeFallRiskModelA(createMockMetrics({ stepTimeCV: 0.03 }));
      const modelB = computeFallRiskModelB(createMockMetrics({ stepTimeCV: 0.03 }));

      const agreement = evaluatePredictiveAgreement(modelA, modelB);

      expect(agreement.classification).toBe("concordant");
      expect(agreement.alignmentStatus).toBe("concordant");
      expect(agreement.cohenKappa).toBe(1.0);
      expect(agreement.percentageAgreement).toBe(100.0);
      expect(agreement.modelACategory).toBe(modelA.category);
      expect(agreement.modelBCategory).toBe(modelB.category);
      expect(agreement.summary).toContain("High predictive agreement");
    });

    it("returns MILD_DIVERGENCE (kappa = 0.25, Pa = 50%) when categories differ by 1 ordinal step", () => {
      // Model A = low risk, Model B = moderate risk
      const modelA = {
        score: 10,
        category: "low" as const,
        points: 0,
        breachedCount: 0,
        evaluatedCount: 4,
        flags: { gaitSpeedRisk: false, stepTimeCvRisk: false, doubleSupportRisk: false, symmetryRisk: false },
        flagValues: { gaitSpeedMps: 1.1, stepTimeCvPct: 3.5, doubleSupportPct: 20, symmetryAnglePct: 3 },
        clinicalSummary: "Model A low risk",
        reasons: [],
        cutoffsMet: { slowSpeed: false, highStepTimeCV: false, highDoubleSupport: false, highAsymmetry: false },
        metricsEvaluated: { gaitSpeed: 1.1, stepTimeCV: 3.5, doubleSupportPct: 20, symmetryAngle: 3 },
      };

      const modelB = {
        compositeScore: 45.0,
        score: 45.0,
        category: "moderate" as const,
        isDualTask: false,
        isSingleTaskRenormalized: true,
        isFrontalFallback: false,
        subScores: { kinematicsScore: 45, kinematics: 45, trunkSwayScore: 50, trunkSway: 50, dteScore: null, dualTaskCost: null, variabilityScore: 40, variability: 40 },
        weights: { kinematics: 0.4, trunkSway: 0.33, dte: 0, dualTaskCost: 0, variability: 0.27 },
        clinicalSummary: "Model B moderate risk",
        reasons: ["Elevated trunk sway"],
      };

      const agreement = evaluatePredictiveAgreement(modelA, modelB);

      expect(agreement.classification).toBe("mild_divergence");
      expect(agreement.cohenKappa).toBe(0.25);
      expect(agreement.percentageAgreement).toBe(50.0);
      expect(agreement.divergenceFactors.length).toBeGreaterThan(0);
      expect(agreement.summary).toContain("Mild inter-model divergence");
    });

    it("returns STARK_DIVERGENCE (kappa = -0.50, Pa = 0%) when categories differ by 2 ordinal steps (low vs high)", () => {
      const modelA = {
        score: 0,
        category: "low" as const,
        points: 0,
        breachedCount: 0,
        evaluatedCount: 4,
        flags: { gaitSpeedRisk: false, stepTimeCvRisk: false, doubleSupportRisk: false, symmetryRisk: false },
        flagValues: { gaitSpeedMps: 1.2, stepTimeCvPct: 3.0, doubleSupportPct: 18, symmetryAnglePct: 2 },
        clinicalSummary: "Model A low risk",
        reasons: [],
        cutoffsMet: { slowSpeed: false, highStepTimeCV: false, highDoubleSupport: false, highAsymmetry: false },
        metricsEvaluated: { gaitSpeed: 1.2, stepTimeCV: 3.0, doubleSupportPct: 18, symmetryAngle: 2 },
      };

      const modelB = {
        compositeScore: 78.0,
        score: 78.0,
        category: "high" as const,
        isDualTask: true,
        isSingleTaskRenormalized: false,
        isFrontalFallback: false,
        subScores: { kinematicsScore: 75, kinematics: 75, trunkSwayScore: 80, trunkSway: 80, dteScore: 85, dualTaskCost: 85, variabilityScore: 70, variability: 70 },
        weights: { kinematics: 0.3, trunkSway: 0.25, dte: 0.25, dualTaskCost: 0.25, variability: 0.2 },
        clinicalSummary: "Model B high risk",
        reasons: ["Severe DTE cost"],
      };

      const agreement = evaluatePredictiveAgreement(modelA, modelB);

      expect(agreement.classification).toBe("stark_divergence");
      expect(agreement.cohenKappa).toBe(-0.5);
      expect(agreement.percentageAgreement).toBe(0.0);
      expect(agreement.scoreDifference).toBe(78.0);
      expect(agreement.summary).toContain("Stark inter-model divergence");
    });
  });
});
