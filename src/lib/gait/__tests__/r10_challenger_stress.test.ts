import { describe, it, expect } from "vitest";
import {
  computeFallRiskModelA,
  computeFallRiskModelB,
  evaluatePredictiveAgreement,
  estimateGaitSpeed,
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
} from "../fallrisk";
import { createMockMetrics } from "./testHelpers";
import type { DualTaskCost, GaitMetrics } from "../types";
import type { GaitAngleAnalysis } from "../angles";

describe("R10 Challenger Empirical Stress Suite", () => {
  // =========================================================================
  // Area 1: Dynamic STEADI thresholds with evaluatedCount = 1, 2, 3, 4
  // =========================================================================
  describe("Area 1: Dynamic STEADI Thresholds (evaluatedCount = 1, 2, 3, 4)", () => {
    it("evaluatedCount = 1 (only gait speed available)", () => {
      // gaitSpeedMps present, stepTimeCV=NaN, doubleSupportPct=null, symmetryAngle=null
      const metrics = createMockMetrics({
        gaitSpeedMps: 0.65, // breached (<0.80)
        stepTimeCV: NaN,
        doubleSupportPct: null,
        symmetryAngle: null,
        viewAngle: "frontal",
      });

      const res = computeFallRiskModelA(metrics);
      expect(res.evaluatedCount).toBe(1);
      expect(res.breachedCount).toBe(1);
      expect(res.category).toBe("high"); // highRiskBreachThreshold = Math.ceil(0.6 * 1) = 1
      expect(res.flags.gaitSpeedRisk).toBe(true);

      // Normal speed (no breach)
      const metricsNormal = createMockMetrics({
        gaitSpeedMps: 1.10,
        stepTimeCV: NaN,
        doubleSupportPct: null,
        symmetryAngle: null,
        viewAngle: "frontal",
      });
      const resNormal = computeFallRiskModelA(metricsNormal);
      expect(resNormal.evaluatedCount).toBe(1);
      expect(resNormal.breachedCount).toBe(0);
      expect(resNormal.category).toBe("low");
    });

    it("evaluatedCount = 2 (frontal view: speed + stepTimeCV)", () => {
      // 2 breached out of 2 -> high risk
      const m2Breached = createMockMetrics({
        viewAngle: "frontal",
        gaitSpeedMps: 0.70, // breached
        stepTimeCV: 0.08,   // breached (8% > 6%)
        doubleSupportPct: null,
        symmetryAngle: null,
      });
      const res2B = computeFallRiskModelA(m2Breached);
      expect(res2B.evaluatedCount).toBe(2);
      expect(res2B.breachedCount).toBe(2);
      expect(res2B.category).toBe("high");

      // 1 breached out of 2 -> moderate risk (highRiskThreshold=2, modRiskThreshold=1)
      const m1Breached = createMockMetrics({
        viewAngle: "frontal",
        gaitSpeedMps: 1.10, // normal
        stepTimeCV: 0.08,   // breached
        doubleSupportPct: null,
        symmetryAngle: null,
      });
      const res1B = computeFallRiskModelA(m1Breached);
      expect(res1B.evaluatedCount).toBe(2);
      expect(res1B.breachedCount).toBe(1);
      expect(res1B.category).toBe("moderate");

      // 0 breached out of 2 -> low risk
      const m0Breached = createMockMetrics({
        viewAngle: "frontal",
        gaitSpeedMps: 1.10,
        stepTimeCV: 0.03,
        doubleSupportPct: null,
        symmetryAngle: null,
      });
      const res0B = computeFallRiskModelA(m0Breached);
      expect(res0B.evaluatedCount).toBe(2);
      expect(res0B.breachedCount).toBe(0);
      expect(res0B.category).toBe("low");
    });

    it("evaluatedCount = 3 (speed + stepTimeCV + symmetryAngle, doubleSupportPct missing)", () => {
      // highRiskThreshold = Math.ceil(0.6 * 3) = 2
      // 2 breaches out of 3 -> high risk
      const m2Breached = createMockMetrics({
        gaitSpeedMps: 0.75, // breached
        stepTimeCV: 0.07,   // breached
        symmetryAngle: 4.0,  // normal
        doubleSupportPct: null,
        doubleSupportHint: undefined,
      });
      const res2B = computeFallRiskModelA(m2Breached);
      expect(res2B.evaluatedCount).toBe(3);
      expect(res2B.breachedCount).toBe(2);
      expect(res2B.category).toBe("high");

      // 1 breach out of 3 -> moderate risk
      const m1Breached = createMockMetrics({
        gaitSpeedMps: 1.10,
        stepTimeCV: 0.07,   // breached
        symmetryAngle: 4.0,
        doubleSupportPct: null,
        doubleSupportHint: undefined,
      });
      const res1B = computeFallRiskModelA(m1Breached);
      expect(res1B.evaluatedCount).toBe(3);
      expect(res1B.breachedCount).toBe(1);
      expect(res1B.category).toBe("moderate");
    });

    it("evaluatedCount = 4 (all 4 STEADI metrics evaluated)", () => {
      // highRiskThreshold = Math.ceil(0.6 * 4) = 3
      // 3 breaches -> high risk
      const m3B = createMockMetrics({
        gaitSpeedMps: 0.70, // breached
        stepTimeCV: 0.08,   // breached
        doubleSupportPct: 40.0, // breached
        symmetryAngle: 3.0, // normal
      });
      const res3B = computeFallRiskModelA(m3B);
      expect(res3B.evaluatedCount).toBe(4);
      expect(res3B.breachedCount).toBe(3);
      expect(res3B.category).toBe("high");

      // 2 breaches -> moderate risk
      const m2B = createMockMetrics({
        gaitSpeedMps: 1.10, // normal
        stepTimeCV: 0.08,   // breached
        doubleSupportPct: 40.0, // breached
        symmetryAngle: 3.0, // normal
      });
      const res2B = computeFallRiskModelA(m2B);
      expect(res2B.evaluatedCount).toBe(4);
      expect(res2B.breachedCount).toBe(2);
      expect(res2B.category).toBe("moderate");

      // 1 breach -> moderate risk
      const m1B = createMockMetrics({
        gaitSpeedMps: 1.10, // normal
        stepTimeCV: 0.08,   // breached
        doubleSupportPct: 20.0, // normal
        symmetryAngle: 3.0, // normal
      });
      const res1B = computeFallRiskModelA(m1B);
      expect(res1B.evaluatedCount).toBe(4);
      expect(res1B.breachedCount).toBe(1);
      expect(res1B.category).toBe("moderate");
    });

    it("evaluatedCount = 0 (all metrics unmeasurable/NaN/null)", () => {
      const m0 = createMockMetrics({
        gaitSpeedMps: null,
        cadenceSpm: 0,
        series: [],
        stepTimeCV: NaN,
        doubleSupportPct: null,
        symmetryAngle: null,
        viewAngle: "frontal",
      });
      const res0 = computeFallRiskModelA(m0);
      expect(res0.evaluatedCount).toBe(0);
      expect(res0.breachedCount).toBe(0);
      expect(res0.score).toBe(0);
      expect(res0.category).toBe("low");
    });
  });

  // =========================================================================
  // Area 2: Weight re-normalization when 1, 2, 3, or all 4 sub-scores are null
  // =========================================================================
  describe("Area 2: Weight Re-Normalization on Null Sub-Scores", () => {
    it("1 sub-score null (Single-Task mode: DTE is null)", () => {
      const metrics = createMockMetrics({
        lateralSway: 0.08,
        stepTimeCV: 0.04,
      });

      const res = computeFallRiskModelB(metrics, undefined);
      expect(res.subScores.dteScore).toBeNull();
      expect(res.subScores.kinematicsScore).not.toBeNull();
      expect(res.subScores.trunkSwayScore).not.toBeNull();
      expect(res.subScores.variabilityScore).not.toBeNull();

      // Base weights: kin=0.30, sway=0.25, var=0.20 -> sum=0.75
      // Normalization: kin = 0.30/0.75 = 0.40; sway = 0.25/0.75 = 0.33; var = 0.20/0.75 = 0.27
      expect(res.weights.kinematics).toBe(0.40);
      expect(res.weights.trunkSway).toBeCloseTo(0.33, 2);
      expect(res.weights.variability).toBeCloseTo(0.27, 2);
      expect(res.weights.dte).toBe(0.00);

      const sumWeights = res.weights.kinematics + res.weights.trunkSway + res.weights.dte + res.weights.variability;
      expect(sumWeights).toBeCloseTo(1.0, 2);
    });

    it("2 sub-scores null (Single-Task + Frontal View with pelvicObliquityVar = null)", () => {
      const frontalMetrics = createMockMetrics({
        viewAngle: "frontal",
        pelvicObliquityVar: null, // kinematics becomes null
        lateralSway: 0.10,        // sway valid
        stepTimeCV: 0.05,         // var valid
      });

      const angleAnalysis = {
        viewAngle: "frontal",
        isSuppressed: true,
      } as unknown as GaitAngleAnalysis;

      const res = computeFallRiskModelB(frontalMetrics, undefined, angleAnalysis, "frontal");
      expect(res.subScores.dteScore).toBeNull();
      expect(res.subScores.kinematicsScore).toBeNull();
      expect(res.subScores.trunkSwayScore).not.toBeNull();
      expect(res.subScores.variabilityScore).not.toBeNull();

      // Base weights: sway=0.25, var=0.20 -> sum=0.45
      // wSway = 0.25/0.45 = 0.56, wVar = 0.20/0.45 = 0.44
      expect(res.weights.kinematics).toBe(0.00);
      expect(res.weights.trunkSway).toBeCloseTo(0.56, 2);
      expect(res.weights.variability).toBeCloseTo(0.44, 2);

      const sumWeights = res.weights.kinematics + res.weights.trunkSway + res.weights.dte + res.weights.variability;
      expect(sumWeights).toBeCloseTo(1.0, 2);
    });

    it("3 sub-scores null (Single-Task + Frontal View pelvic=null + lateralSway=null)", () => {
      const metrics = createMockMetrics({
        viewAngle: "frontal",
        pelvicObliquityVar: null, // kin = null
        lateralSway: null,        // sway = null
        stepTimeCV: 0.06,         // var valid
      });

      const angleAnalysis = {
        viewAngle: "frontal",
        isSuppressed: true,
      } as unknown as GaitAngleAnalysis;

      const res = computeFallRiskModelB(metrics, undefined, angleAnalysis, "frontal");
      expect(res.subScores.dteScore).toBeNull();
      expect(res.subScores.kinematicsScore).toBeNull();
      expect(res.subScores.trunkSwayScore).toBeNull();
      expect(res.subScores.variabilityScore).not.toBeNull();

      // Only variability is valid -> weight = 1.00
      expect(res.weights.variability).toBe(1.00);
      expect(res.weights.kinematics).toBe(0.00);
      expect(res.weights.trunkSway).toBe(0.00);
      expect(res.weights.dte).toBe(0.00);
    });

    it("all 4 sub-scores null (no valid domains)", () => {
      const metrics = createMockMetrics({
        viewAngle: "frontal",
        pelvicObliquityVar: null,
        lateralSway: null,
        stepTimeCV: NaN,
      });

      const angleAnalysis = {
        viewAngle: "frontal",
        isSuppressed: true,
      } as unknown as GaitAngleAnalysis;

      const res = computeFallRiskModelB(metrics, undefined, angleAnalysis, "frontal");
      expect(res.subScores.dteScore).toBeNull();
      expect(res.subScores.kinematicsScore).toBeNull();
      expect(res.subScores.trunkSwayScore).toBeNull();
      // subScores.variabilityScore falls back to 0 (number) when unevaluated
      expect(res.subScores.variabilityScore).toBe(0);

      expect(res.compositeScore).toBe(0);
      expect(res.weights.kinematics).toBe(0);
      expect(res.weights.trunkSway).toBe(0);
      expect(res.weights.dte).toBe(0);
      expect(res.weights.variability).toBe(0);
      expect(res.category).toBe("low");
    });
  });

  // =========================================================================
  // Area 3: Height-adjusted gait speed with missing metrics & boundary heights
  // =========================================================================
  describe("Area 3: Height-Adjusted Gait Speed & Boundary Heights", () => {
    it("handles boundary height 0.5m (short/pediatric boundary)", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: 0.50,
      });
      const speed = estimateGaitSpeed(metrics);
      // (100 * (0.414 * 0.50) * 2) / 60 = (100 * 0.207 * 2) / 60 = 0.69
      expect(speed).toBe(0.69);
    });

    it("handles boundary height 2.5m (tall adult boundary)", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: 2.50,
      });
      const speed = estimateGaitSpeed(metrics);
      // (100 * (0.414 * 2.50) * 2) / 60 = (100 * 1.035 * 2) / 60 = 3.45
      expect(speed).toBe(3.45);
    });

    it("handles invalid/negative height (-1.7m) by falling back safely", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: -1.70,
        stepLength: null,
      });
      const speed = estimateGaitSpeed(metrics);
      // Negative height fails >0 check, falls back to default adult height 1.70m: 2.35
      expect(speed).toBe(2.35);
      expect(speed!).toBeGreaterThan(0);
    });

    it("handles height = 0 by falling back safely", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: 0,
        stepLength: null,
      });
      const speed = estimateGaitSpeed(metrics);
      expect(speed).toBe(2.35);
    });

    it("handles height = NaN by falling back safely", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: NaN,
        stepLength: null,
      });
      const speed = estimateGaitSpeed(metrics);
      expect(speed).toBe(2.35);
    });

    it("correctly parses height in centimeters via heightCm property (175 cm -> 1.75 m)", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: null,
        heightCm: 175,
      });
      const speed = estimateGaitSpeed(metrics);
      // (100 * (0.414 * 1.75) * 2) / 60 = 2.415 -> 2.41 (via toFixed(2))
      expect(speed).toBe(2.41);
    });

    it("correctly parses generic height property > 3 as centimeters (180 -> 1.80 m)", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: null,
        height: 180,
      } as any);
      const speed = estimateGaitSpeed(metrics);
      // (100 * (0.414 * 1.80) * 2) / 60 = 2.48
      expect(speed).toBe(2.48);
    });

    it("uses stepLength when height is missing but stepLength is present", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 90,
        gaitSpeedMps: null,
        heightMeters: null,
        stepLength: 0.70,
      });
      const speed = estimateGaitSpeed(metrics);
      // (90 * 0.70 * 2) / 60 = 2.10
      expect(speed).toBe(2.10);
    });
  });

  // =========================================================================
  // Area 4: Orthogonal plane independence
  // =========================================================================
  describe("Area 4: Orthogonal Plane Independence", () => {
    it("trunkSwayScore is null when lateralSway is null, regardless of high verticalBounce", () => {
      const metrics = createMockMetrics({
        lateralSway: null,
        verticalBounce: 0.15, // Extremely high vertical bounce (Y axis)
        stepTimeCV: 0.04,
      });

      const res = computeFallRiskModelB(metrics);
      expect(res.subScores.trunkSwayScore).toBeNull();
      expect(res.weights.trunkSway).toBe(0.00);
      expect(isNaN(res.compositeScore)).toBe(false);
    });

    it("computePatientBaseline excludes sessions with null lateralSway from sway statistics", () => {
      const s1 = {
        id: "s1",
        patientId: "p1",
        createdAt: "2026-01-01T00:00:00Z",
        metricsJson: createMockMetrics({ lateralSway: 0.05, verticalBounce: 0.08 }),
      };
      const s2 = {
        id: "s2",
        patientId: "p1",
        createdAt: "2026-01-02T00:00:00Z",
        metricsJson: createMockMetrics({ lateralSway: null, verticalBounce: 0.12 }),
      };

      const baseline = computePatientBaseline([s1 as any, s2 as any], "p1");
      expect(baseline.metrics.lateralSway.sampleCount).toBe(1);
      expect(baseline.metrics.lateralSway.mean).toBe(0.05);
    });

    it("detectAcuteWeaknessAnomalies does NOT trigger SWAY_SPIKE_ACUTE when lateralSway is null", () => {
      const s1 = {
        id: "s1",
        patientId: "p1",
        createdAt: "2026-01-01T00:00:00Z",
        metricsJson: createMockMetrics({ lateralSway: 0.04 }),
      };
      const baseline = computePatientBaseline([s1 as any], "p1");

      const currentMetrics = createMockMetrics({
        lateralSway: null,
        verticalBounce: 0.20, // Massive vertical bounce
      });

      const result = detectAcuteWeaknessAnomalies(currentMetrics, baseline);
      const swayFlag = result.spikeFlags.find(f => f.ruleId === "SWAY_SPIKE_ACUTE");
      expect(swayFlag).toBeUndefined();
    });
  });
});
