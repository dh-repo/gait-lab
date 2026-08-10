import { describe, it, expect } from "vitest";
import {
  computeFallRiskModelA,
  computeFallRiskModelB,
  estimateGaitSpeed,
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
} from "../fallrisk";
import { createMockMetrics } from "./testHelpers";
import type { DualTaskCost, GaitMetrics } from "../types";
import type { GaitAngleAnalysis } from "../angles";

describe("R10 Fall Risk Model Robustness Empirical Stress Harness", () => {
  // =========================================================================
  // 1. Dynamic STEADI Thresholds (evaluatedCount = 0, 1, 2, 3, 4)
  // =========================================================================
  describe("1. Dynamic STEADI Thresholds by evaluatedCount", () => {
    it("evaluatedCount = 1: correctly evaluates 1 breached metric as HIGH risk (breached >= Math.ceil(0.6*1) = 1)", () => {
      const metrics = createMockMetrics({
        viewAngle: "frontal",
        doubleSupportPct: null,
        doubleSupportHint: undefined,
        symmetryAngle: null,
        gaitSpeedMps: 1.10, // Normal (not breached)
        stepTimeCV: 0.09,   // Breached (>6.0%)
      });
      // Force gaitSpeedMps to be null to test evaluatedCount = 1
      (metrics as any).gaitSpeedMps = null;
      (metrics as any).cadenceSpm = 0;

      const result = computeFallRiskModelA(metrics);

      expect(result.evaluatedCount).toBe(1);
      expect(result.breachedCount).toBe(1);
      expect(result.category).toBe("high");
    });

    it("evaluatedCount = 1: classifies 0 breached metrics as LOW risk", () => {
      const metrics = createMockMetrics({
        viewAngle: "frontal",
        doubleSupportPct: null,
        doubleSupportHint: undefined,
        symmetryAngle: null,
        stepTimeCV: 0.03, // Normal (3%)
      });
      (metrics as any).gaitSpeedMps = null;
      (metrics as any).cadenceSpm = 0;

      const result = computeFallRiskModelA(metrics);

      expect(result.evaluatedCount).toBe(1);
      expect(result.breachedCount).toBe(0);
      expect(result.category).toBe("low");
    });

    it("evaluatedCount = 2: classifies 0 breaches as LOW, 1 breach (non-speed) as MODERATE, 2 breaches as HIGH", () => {
      // 0 breaches
      const m0 = createMockMetrics({
        viewAngle: "frontal",
        doubleSupportPct: null,
        doubleSupportHint: undefined,
        symmetryAngle: null,
        gaitSpeedMps: 1.10,
        stepTimeCV: 0.03,
      });
      const r0 = computeFallRiskModelA(m0);
      expect(r0.evaluatedCount).toBe(2);
      expect(r0.breachedCount).toBe(0);
      expect(r0.category).toBe("low");

      // 1 breach (step time CV only)
      const m1 = createMockMetrics({
        viewAngle: "frontal",
        doubleSupportPct: null,
        doubleSupportHint: undefined,
        symmetryAngle: null,
        gaitSpeedMps: 1.10,
        stepTimeCV: 0.08, // Breached
      });
      const r1 = computeFallRiskModelA(m1);
      expect(r1.evaluatedCount).toBe(2);
      expect(r1.breachedCount).toBe(1);
      expect(r1.category).toBe("moderate");

      // 2 breaches (speed + step time CV)
      const m2 = createMockMetrics({
        viewAngle: "frontal",
        doubleSupportPct: null,
        doubleSupportHint: undefined,
        symmetryAngle: null,
        gaitSpeedMps: 0.60, // Breached
        stepTimeCV: 0.08,   // Breached
      });
      const r2 = computeFallRiskModelA(m2);
      expect(r2.evaluatedCount).toBe(2);
      expect(r2.breachedCount).toBe(2);
      expect(r2.category).toBe("high");
    });

    it("evaluatedCount = 3: classifies 0 breaches (LOW), 1 breach (MODERATE), 2 breaches (HIGH: ceil(0.6*3)=2), 3 breaches (HIGH)", () => {
      // evaluatedCount = 3 (speed, stepTimeCV, symmetryAngle; doubleSupport null)
      const base = {
        doubleSupportPct: null,
        doubleSupportHint: undefined,
      };

      // 0 breaches
      const r0 = computeFallRiskModelA(createMockMetrics({ ...base, gaitSpeedMps: 1.10, stepTimeCV: 0.03, symmetryAngle: 3.0 }));
      expect(r0.evaluatedCount).toBe(3);
      expect(r0.breachedCount).toBe(0);
      expect(r0.category).toBe("low");

      // 1 breach (symmetry angle only)
      const r1 = computeFallRiskModelA(createMockMetrics({ ...base, gaitSpeedMps: 1.10, stepTimeCV: 0.03, symmetryAngle: 12.0 }));
      expect(r1.evaluatedCount).toBe(3);
      expect(r1.breachedCount).toBe(1);
      expect(r1.category).toBe("moderate");

      // 2 breaches (symmetry angle + CV) -> Math.ceil(0.6 * 3) = 2 breaches threshold
      const r2 = computeFallRiskModelA(createMockMetrics({ ...base, gaitSpeedMps: 1.10, stepTimeCV: 0.08, symmetryAngle: 12.0 }));
      expect(r2.evaluatedCount).toBe(3);
      expect(r2.breachedCount).toBe(2);
      expect(r2.category).toBe("high");

      // 3 breaches
      const r3 = computeFallRiskModelA(createMockMetrics({ ...base, gaitSpeedMps: 0.60, stepTimeCV: 0.08, symmetryAngle: 12.0 }));
      expect(r3.evaluatedCount).toBe(3);
      expect(r3.breachedCount).toBe(3);
      expect(r3.category).toBe("high");
    });

    it("evaluatedCount = 4: classifies 0 (LOW), 1 (MODERATE), 2 (MODERATE), 3 (HIGH: ceil(0.6*4)=3), 4 (HIGH)", () => {
      // 0 breaches
      const r0 = computeFallRiskModelA(createMockMetrics({ gaitSpeedMps: 1.10, stepTimeCV: 0.03, doubleSupportPct: 20, symmetryAngle: 3 }));
      expect(r0.evaluatedCount).toBe(4);
      expect(r0.breachedCount).toBe(0);
      expect(r0.category).toBe("low");

      // 1 breach (DS only)
      const r1 = computeFallRiskModelA(createMockMetrics({ gaitSpeedMps: 1.10, stepTimeCV: 0.03, doubleSupportPct: 40, symmetryAngle: 3 }));
      expect(r1.evaluatedCount).toBe(4);
      expect(r1.breachedCount).toBe(1);
      expect(r1.category).toBe("moderate");

      // 2 breaches (DS + Symmetry) -> 2 < Math.ceil(0.6*4)=3
      const r2 = computeFallRiskModelA(createMockMetrics({ gaitSpeedMps: 1.10, stepTimeCV: 0.03, doubleSupportPct: 40, symmetryAngle: 12 }));
      expect(r2.evaluatedCount).toBe(4);
      expect(r2.breachedCount).toBe(2);
      expect(r2.category).toBe("moderate");

      // 3 breaches -> 3 >= Math.ceil(0.6*4)=3
      const r3 = computeFallRiskModelA(createMockMetrics({ gaitSpeedMps: 0.60, stepTimeCV: 0.08, doubleSupportPct: 40, symmetryAngle: 3 }));
      expect(r3.evaluatedCount).toBe(4);
      expect(r3.breachedCount).toBe(3);
      expect(r3.category).toBe("high");

      // 4 breaches
      const r4 = computeFallRiskModelA(createMockMetrics({ gaitSpeedMps: 0.60, stepTimeCV: 0.08, doubleSupportPct: 40, symmetryAngle: 12 }));
      expect(r4.evaluatedCount).toBe(4);
      expect(r4.breachedCount).toBe(4);
      expect(r4.category).toBe("high");
    });

    it("evaluatedCount = 0: gracefully handles completely empty/missing metrics without crash or NaN", () => {
      const emptyMetrics: GaitMetrics = {
        viewAngle: "unknown",
        viewConfidence: 0,
        durationSec: 0,
        fpsEffective: 0,
        stepCount: 0,
        cadenceSpm: 0,
        avgStepTimeSec: 0,
        stepTimeAsymmetry: null as any,
        strideAsymmetry: null,
        lateralSway: null,
        verticalBounce: 0,
        armSwingLeft: null as any,
        armSwingRight: null as any,
        armSwingAsymmetry: null as any,
        kneeFlexLeft: null,
        kneeFlexRight: null,
        kneeAsymmetry: null,
        stepWidthVariability: null,
        doubleSupportHint: null as any,
        doubleSupportPct: null,
        symmetryAngle: null,
        stepTimeCV: null as any,
        strideTimeCV: 0,
        pelvicObliquity: null,
        pelvicObliquityVar: null,
        meanStepWidth: null,
        pathSmoothness: 0,
        stabilityScore: 0,
        rhythmScore: 0,
        symmetryScore: 0,
        mobilityScore: 0,
        automaticityScore: 0,
        overallScore: 0,
        series: [],
        stepEvents: [],
      } as any;

      const result = computeFallRiskModelA(emptyMetrics);

      expect(result.evaluatedCount).toBe(1); // stepTimeCV defaults to 0% (evaluated as normal, non-breached)
      expect(result.breachedCount).toBe(0);
      expect(result.score).toBe(0);
      expect(result.category).toBe("low");
      expect(isNaN(result.score)).toBe(false);
      expect(isNaN(result.points)).toBe(false);
    });
  });

  // =========================================================================
  // 2. Weight Re-Normalization (1, 2, 3, or 4 Sub-Scores Null)
  // =========================================================================
  describe("2. Weight Re-Normalization with Null Sub-Scores", () => {
    it("0 null sub-scores (Dual-Task): weights sum to 1.0 (kin:0.30, sway:0.25, dte:0.25, var:0.20)", () => {
      const metrics = createMockMetrics({
        lateralSway: 0.08,
        stepTimeCV: 0.05,
      });
      const dte: DualTaskCost = {
        cadenceCostPct: 10,
        stepTimeCvCostPct: 15,
        stabilityCostPts: 5,
        automaticityCostPts: 5,
        summary: "DT present",
        cadenceDTE: -10,
        stepTimeCvDTE: -15,
      };
      const angleAnalysis = {
        viewAngle: "sagittal",
        isSuppressed: false,
        confidence: 0.9,
        metrics: { kneeRomLeft: 50, kneeRomRight: 50, hipRomLeft: 30, hipRomRight: 30, ankleRomLeft: 20, ankleRomRight: 20 },
      } as unknown as GaitAngleAnalysis;

      const res = computeFallRiskModelB(metrics, dte, angleAnalysis);

      expect(res.subScores.kinematicsScore).not.toBeNull();
      expect(res.subScores.trunkSwayScore).not.toBeNull();
      expect(res.subScores.dteScore).not.toBeNull();
      expect(res.subScores.variabilityScore).not.toBeNull();

      expect(res.weights.kinematics).toBe(0.30);
      expect(res.weights.trunkSway).toBe(0.25);
      expect(res.weights.dte).toBe(0.25);
      expect(res.weights.variability).toBe(0.20);

      const sumWeights = res.weights.kinematics + res.weights.trunkSway + res.weights.dte + res.weights.variability;
      expect(sumWeights).toBeCloseTo(1.0, 2);
    });

    it("1 null sub-score (Single-Task, DTE null): valid weights (kin:0.40, sway:0.33, var:0.27) sum to 1.0", () => {
      const metrics = createMockMetrics({
        lateralSway: 0.08,
        stepTimeCV: 0.05,
      });
      const angleAnalysis = {
        viewAngle: "sagittal",
        isSuppressed: false,
        confidence: 0.9,
        metrics: { kneeRomLeft: 50, kneeRomRight: 50, hipRomLeft: 30, hipRomRight: 30, ankleRomLeft: 20, ankleRomRight: 20 },
      } as unknown as GaitAngleAnalysis;

      const res = computeFallRiskModelB(metrics, undefined, angleAnalysis);

      expect(res.subScores.dteScore).toBeNull();
      expect(res.weights.dte).toBe(0);

      expect(res.weights.kinematics).toBe(0.40);
      expect(res.weights.trunkSway).toBeCloseTo(0.33, 2);
      expect(res.weights.variability).toBeCloseTo(0.27, 2);

      const sumWeights = res.weights.kinematics + res.weights.trunkSway + res.weights.dte + res.weights.variability;
      expect(sumWeights).toBeCloseTo(1.0, 2);
    });

    it("2 null sub-scores (Single-Task DTE null + lateralSway null): valid weights (kin:0.60, var:0.40) sum to 1.0", () => {
      const metrics = createMockMetrics({
        lateralSway: null,
        verticalBounce: 0.10, // Must NOT be substituted
        stepTimeCV: 0.05,
      });
      const angleAnalysis = {
        viewAngle: "sagittal",
        isSuppressed: false,
        confidence: 0.9,
        metrics: { kneeRomLeft: 50, kneeRomRight: 50, hipRomLeft: 30, hipRomRight: 30, ankleRomLeft: 20, ankleRomRight: 20 },
      } as unknown as GaitAngleAnalysis;

      const res = computeFallRiskModelB(metrics, undefined, angleAnalysis);

      expect(res.subScores.dteScore).toBeNull();
      expect(res.subScores.trunkSwayScore).toBeNull();

      expect(res.weights.kinematics).toBe(0.60);
      expect(res.weights.trunkSway).toBe(0);
      expect(res.weights.dte).toBe(0);
      expect(res.weights.variability).toBe(0.40);

      const sumWeights = res.weights.kinematics + res.weights.trunkSway + res.weights.dte + res.weights.variability;
      expect(sumWeights).toBeCloseTo(1.0, 2);
    });

    it("3 null sub-scores (Single-Task DTE null + lateralSway null + kinematics null): valid weight (var:1.00) equals 1.0", () => {
      const metrics = createMockMetrics({
        lateralSway: null,
        verticalBounce: 0.10,
        pelvicObliquityVar: null,
        stepTimeCV: 0.06, // 6% variability -> score 60
      });

      const res = computeFallRiskModelB(metrics, undefined, undefined, "frontal");

      expect(res.subScores.dteScore).toBeNull();
      expect(res.subScores.trunkSwayScore).toBeNull();
      expect(res.subScores.kinematicsScore).toBeNull();
      expect(res.subScores.variabilityScore).not.toBeNull();

      expect(res.weights.kinematics).toBe(0);
      expect(res.weights.trunkSway).toBe(0);
      expect(res.weights.dte).toBe(0);
      expect(res.weights.variability).toBe(1.00);

      expect(res.compositeScore).toBe(60.0);
    });

    it("4 null sub-scores (all 4 null): valid weight sum = 0, compositeScore = 0, category = low, no crash", () => {
      const emptyMetrics: GaitMetrics = {
        viewAngle: "unknown",
        viewConfidence: 0,
        durationSec: 0,
        fpsEffective: 0,
        stepCount: 0,
        cadenceSpm: 0,
        avgStepTimeSec: 0,
        stepTimeAsymmetry: null as any,
        strideAsymmetry: null,
        lateralSway: null,
        verticalBounce: 0,
        armSwingLeft: null as any,
        armSwingRight: null as any,
        armSwingAsymmetry: null as any,
        kneeFlexLeft: null,
        kneeFlexRight: null,
        kneeAsymmetry: null,
        stepWidthVariability: null,
        doubleSupportHint: null as any,
        doubleSupportPct: null,
        symmetryAngle: null,
        stepTimeCV: null as any,
        strideTimeCV: 0,
        pelvicObliquity: null,
        pelvicObliquityVar: null,
        meanStepWidth: null,
        pathSmoothness: 0,
        stabilityScore: 0,
        rhythmScore: 0,
        symmetryScore: 0,
        mobilityScore: 0,
        automaticityScore: 0,
        overallScore: 0,
        series: [],
        stepEvents: [],
      } as any;

      const res = computeFallRiskModelB(emptyMetrics);

      expect(res.subScores.kinematicsScore).toBeNull();
      expect(res.subScores.trunkSwayScore).toBeNull();
      expect(res.subScores.dteScore).toBeNull();

      expect(res.weights.kinematics).toBe(0);
      expect(res.weights.trunkSway).toBe(0);
      expect(res.weights.dte).toBe(0);
      expect(res.weights.variability).toBe(0);

      expect(res.compositeScore).toBe(0);
      expect(res.category).toBe("low");
      expect(isNaN(res.compositeScore)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Height-Adjusted Gait Speed Proxies & Boundary Heights
  // =========================================================================
  describe("3. Height-Adjusted Gait Speed Proxies & Boundary Statures", () => {
    it("handles boundary pediatric height 0.50m correctly: (100 * (0.414*0.50) * 2)/60 = 0.69 m/s", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: 0.50,
      });

      const speed = estimateGaitSpeed(metrics);

      expect(speed).toBe(0.69);
    });

    it("handles boundary tall adult height 2.50m correctly: (100 * (0.414*2.50) * 2)/60 = 3.45 m/s", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: 2.50,
      });

      const speed = estimateGaitSpeed(metrics);

      expect(speed).toBe(3.45);
    });

    it("accepts all height metric variants (heightMeters, heightCm, patientHeight, height cm vs m)", () => {
      const cadence = 100;

      // heightMeters: 1.80
      const s1 = estimateGaitSpeed(createMockMetrics({ cadenceSpm: cadence, heightMeters: 1.80 }));
      expect(s1).toBe(2.48);

      // heightCm: 180
      const s2 = estimateGaitSpeed(createMockMetrics({ cadenceSpm: cadence, heightCm: 180 } as any));
      expect(s2).toBe(2.48);

      // patientHeight: 180
      const s3 = estimateGaitSpeed(createMockMetrics({ cadenceSpm: cadence, patientHeight: 180 } as any));
      expect(s3).toBe(2.48);

      // height > 3 (180 cm auto-converted to 1.80m)
      const s4 = estimateGaitSpeed(createMockMetrics({ cadenceSpm: cadence, height: 180 } as any));
      expect(s4).toBe(2.48);

      // height <= 3 (1.80 m)
      const s5 = estimateGaitSpeed(createMockMetrics({ cadenceSpm: cadence, height: 1.80 } as any));
      expect(s5).toBe(2.48);
    });

    it("gracefully falls back when height is negative (-1.7m) or zero (0m) or NaN without returning negative speed", () => {
      const metricsNeg = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: -1.70,
        stepLength: null,
      });

      const speedNeg = estimateGaitSpeed(metricsNeg);

      // Falls back to default adult height 1.70m: (100 * (0.414*1.70) * 2)/60 = 2.35
      expect(speedNeg).toBe(2.35);
      expect(speedNeg!).toBeGreaterThan(0);

      const metricsZero = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: 0,
        stepLength: null,
      });

      const speedZero = estimateGaitSpeed(metricsZero);

      expect(speedZero).toBe(2.35);

      const metricsNaN = createMockMetrics({
        cadenceSpm: 100,
        gaitSpeedMps: null,
        heightMeters: NaN,
        stepLength: null,
      });

      const speedNaN = estimateGaitSpeed(metricsNaN);

      expect(speedNaN).toBe(2.35);
    });

    it("returns null when neither gaitSpeed, cadence, stepLength, height, nor series are available", () => {
      const metricsEmpty = createMockMetrics({
        gaitSpeedMps: null,
        cadenceSpm: 0,
        heightMeters: null,
        stepLength: null,
        series: [],
      });

      const speed = estimateGaitSpeed(metricsEmpty);

      expect(speed).toBeNull();
    });
  });

  // =========================================================================
  // 4. Orthogonal Plane Independence (Lateral Sway vs Vertical Bounce)
  // =========================================================================
  describe("4. Orthogonal Plane Independence (No Vertical Bounce Corruption)", () => {
    it("ensures Model B trunkSwayScore remains NULL when lateralSway is unmeasured, ignoring high verticalBounce", () => {
      const metrics = createMockMetrics({
        lateralSway: null,
        verticalBounce: 0.18, // High vertical bounce (Y axis)
        stepTimeCV: 0.04,
      });

      const result = computeFallRiskModelB(metrics);

      expect(result.subScores.trunkSwayScore).toBeNull();
      expect(result.weights.trunkSway).toBe(0);
      expect(result.reasons.some(r => r.toLowerCase().includes("sway"))).toBe(false);
    });

    it("ensures computePatientBaseline skips unmeasured lateralSway without substituting verticalBounce", () => {
      const session1 = {
        id: "s1",
        patientId: "p1",
        createdAt: new Date().toISOString(),
        metricsJson: createMockMetrics({
          lateralSway: null,
          verticalBounce: 0.15,
        }),
      };

      const session2 = {
        id: "s2",
        patientId: "p1",
        createdAt: new Date().toISOString(),
        metricsJson: createMockMetrics({
          lateralSway: 0.05,
          verticalBounce: 0.12,
        }),
      };

      const baseline = computePatientBaseline([session1 as any, session2 as any], "p1");

      // Only session2 contributed to lateralSway statistics
      expect(baseline.metrics.lateralSway.sampleCount).toBe(1);
      expect(baseline.metrics.lateralSway.mean).toBe(0.05);
    });

    it("ensures detectAcuteWeaknessAnomalies skips SWAY_SPIKE_ACUTE when lateralSway is null", () => {
      const baseline = computePatientBaseline([
        {
          id: "s1",
          patientId: "p1",
          createdAt: new Date().toISOString(),
          metricsJson: createMockMetrics({ lateralSway: 0.04 }),
        } as any,
      ], "p1");

      const currentMetrics = createMockMetrics({
        lateralSway: null, // Unmeasured
        verticalBounce: 0.25, // Massive vertical bounce
      });

      const result = detectAcuteWeaknessAnomalies(currentMetrics, baseline);

      expect(result.spikeFlags.some(f => f.ruleId === "SWAY_SPIKE_ACUTE")).toBe(false);
      expect(result.warningCards.some(c => c.id === "card_metabolic_delirium")).toBe(false);
    });
  });
});
