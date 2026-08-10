import { describe, test, expect } from "vitest";
import {
  calculateArmSwingAsymmetry,
  calculateTrunkSway,
  getNormativeGaitCurves,
  type GaitAngleAnalysis,
} from "../angles";
import { buildEducatedGuesses } from "../guesses";
import {
  calculateGPSAndMAP,
  getNormativeReference,
} from "../normatives";
import { computeFallRiskModelB } from "../fallrisk";
import type { Landmark, GaitMetrics } from "../types";

describe("Milestone 2 Challenger R6–R9 Empirical Challenge Suite", () => {

  // ==========================================
  // R6: Arm Swing Asymmetry Index (ASA)
  // ==========================================
  describe("R6: Arm Swing Asymmetry Index (ASA)", () => {
    function buildArmLandmarks(
      framesCount: number,
      leftArmAmpDeg: number,
      rightArmAmpDeg: number,
      phaseShiftRad: number = 0,
    ): Landmark[][] {
      const frames: Landmark[][] = [];
      for (let i = 0; i < framesCount; i++) {
        const t = (2 * Math.PI * i) / 20; // period of 20 frames
        const lAngleRad = (leftArmAmpDeg * Math.sin(t) * Math.PI) / 180;
        const rAngleRad = (rightArmAmpDeg * Math.sin(t + phaseShiftRad) * Math.PI) / 180;
        const legLAngleRad = (25 * Math.sin(t) * Math.PI) / 180;
        const legRAngleRad = (25 * Math.sin(t + Math.PI) * Math.PI) / 180;

        const lm: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));

        // L_SHOULDER 11, R_SHOULDER 12
        lm[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
        lm[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 };

        // L_WRIST 15, R_WRIST 16
        lm[15] = {
          x: 0.4 + 0.3 * Math.sin(lAngleRad),
          y: 0.3 + 0.3 * Math.cos(lAngleRad),
          z: 0,
          visibility: 0.9,
        };
        lm[16] = {
          x: 0.6 + 0.3 * Math.sin(rAngleRad),
          y: 0.3 + 0.3 * Math.cos(rAngleRad),
          z: 0,
          visibility: 0.9,
        };

        // L_HIP 23, R_HIP 24
        lm[23] = { x: 0.4, y: 0.6, z: 0, visibility: 0.9 };
        lm[24] = { x: 0.6, y: 0.6, z: 0, visibility: 0.9 };

        // L_KNEE 25, R_KNEE 26
        lm[25] = {
          x: 0.4 + 0.4 * Math.sin(legLAngleRad),
          y: 0.6 + 0.4 * Math.cos(legLAngleRad),
          z: 0,
          visibility: 0.9,
        };
        lm[26] = {
          x: 0.6 + 0.4 * Math.sin(legRAngleRad),
          y: 0.6 + 0.4 * Math.cos(legRAngleRad),
          z: 0,
          visibility: 0.9,
        };

        frames.push(lm);
      }
      return frames;
    }

    test("Symmetric arm swing yields ASA ≈ 0%", () => {
      const landmarks = buildArmLandmarks(60, 30, 30);
      const res = calculateArmSwingAsymmetry(landmarks);

      expect(res.leftAmplitude).toBeGreaterThan(50);
      expect(res.rightAmplitude).toBeGreaterThan(50);
      expect(Math.abs(res.leftAmplitude - res.rightAmplitude)).toBeLessThan(2.0);
      expect(res.asymmetryIndex).toBeLessThan(3.0);
    });

    test("One arm stationary (frozen) yields ASA ≈ 100%", () => {
      const landmarks = buildArmLandmarks(60, 40, 0);
      const res = calculateArmSwingAsymmetry(landmarks);

      expect(res.leftAmplitude).toBeGreaterThan(70);
      expect(res.rightAmplitude).toBeLessThan(3.0);
      expect(res.asymmetryIndex).toBeGreaterThan(95.0);
    });

    test("Phase correlation correctly evaluates arm and contralateral leg coupling", () => {
      const landmarks = buildArmLandmarks(60, 30, 30, 0);
      const res = calculateArmSwingAsymmetry(landmarks);

      expect(res.phaseCorrelation).toBeGreaterThanOrEqual(-1);
      expect(res.phaseCorrelation).toBeLessThanOrEqual(1);
      expect(Number.isFinite(res.phaseCorrelation)).toBe(true);
    });

    test("Empty or invalid landmarks return zero ASA structure safely", () => {
      const emptyRes = calculateArmSwingAsymmetry([]);
      expect(emptyRes).toEqual({ leftAmplitude: 0, rightAmplitude: 0, asymmetryIndex: 0, phaseCorrelation: 0 });
    });
  });

  // ==========================================
  // R7: Trunk Sway Quantification & Harmonic Ratio
  // ==========================================
  describe("R7: Trunk Sway Quantification & Harmonic Ratio", () => {
    test("Upright stationary pose gives trunk sway excursion ≈ 0°", () => {
      const staticFrames: Landmark[][] = [];
      for (let i = 0; i < 30; i++) {
        const lm: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
        lm[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
        lm[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 };
        lm[23] = { x: 0.4, y: 0.7, z: 0, visibility: 0.9 };
        lm[24] = { x: 0.6, y: 0.7, z: 0, visibility: 0.9 };
        staticFrames.push(lm);
      }

      const sway = calculateTrunkSway(staticFrames);
      expect(sway.lateralExcursionDeg).toBeCloseTo(0, 1);
      expect(sway.sagittalExcursionDeg).toBeCloseTo(0, 1);
      expect(sway.harmonicRatio).toBe(1.0);
    });

    test("Periodic lateral trunk sway calculates accurate frontal excursion & Harmonic Ratio", () => {
      const swayFrames: Landmark[][] = [];
      for (let i = 0; i < 60; i++) {
        const t = (2 * Math.PI * i) / 15;
        const dx = 0.06 * Math.sin(t);

        const lm: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
        lm[11] = { x: 0.4 + dx, y: 0.3, z: 0, visibility: 0.9 };
        lm[12] = { x: 0.6 + dx, y: 0.3, z: 0, visibility: 0.9 };
        lm[23] = { x: 0.4, y: 0.7, z: 0, visibility: 0.9 };
        lm[24] = { x: 0.6, y: 0.7, z: 0, visibility: 0.9 };
        swayFrames.push(lm);
      }

      const sway = calculateTrunkSway(swayFrames);
      expect(sway.lateralExcursionDeg).toBeGreaterThan(10.0);
      expect(Number.isFinite(sway.harmonicRatio)).toBe(true);
      expect(sway.harmonicRatio).toBeGreaterThan(0);
    });

    test("Fall Risk Model B Sub-Score 2 correctly maps trunk sway lateralExcursionDeg (3°–12° -> 0–100)", () => {
      const mockMetrics: GaitMetrics = {
        cadenceSpm: 100,
        stepTimeCV: 0.03,
        gaitSpeedMps: 1.2,
      } as any;

      const lowSwayAnalysis: GaitAngleAnalysis = {
        trunkSway: { lateralExcursionDeg: 3.0, sagittalExcursionDeg: 2.0, harmonicRatio: 2.0 },
      } as any;

      const highSwayAnalysis: GaitAngleAnalysis = {
        trunkSway: { lateralExcursionDeg: 12.0, sagittalExcursionDeg: 5.0, harmonicRatio: 0.8 },
      } as any;

      const midSwayAnalysis: GaitAngleAnalysis = {
        trunkSway: { lateralExcursionDeg: 7.5, sagittalExcursionDeg: 3.5, harmonicRatio: 1.4 },
      } as any;

      const lowRisk = computeFallRiskModelB(mockMetrics, undefined, lowSwayAnalysis);
      const highRisk = computeFallRiskModelB(mockMetrics, undefined, highSwayAnalysis);
      const midRisk = computeFallRiskModelB(mockMetrics, undefined, midSwayAnalysis);

      expect(lowRisk.subScores.trunkSwayScore).toBeCloseTo(0, 1);
      expect(highRisk.subScores.trunkSwayScore).toBeCloseTo(100, 1);
      expect(midRisk.subScores.trunkSwayScore).toBeCloseTo(50, 1);
    });
  });

  // ==========================================
  // R8: 6 Compensatory Gait Pattern Rules
  // ==========================================
  describe("R8: 6 Compensatory Gait Pattern Rules in guesses.ts", () => {
    const baseMetrics: GaitMetrics = {
      overallScore: 70,
      stabilityScore: 70,
      symmetryScore: 70,
      propulsionScore: 70,
      automaticityScore: 70,
      mobilityScore: 70,
      cadenceSpm: 100,
      gaitSpeedMps: 1.1,
      stepTimeCV: 0.03,
      verticalBounce: 0.03,
      lateralSway: 0.04,
      kneeFlexLeft: 55,
      kneeFlexRight: 55,
      hipRomLeft: 40,
      hipRomRight: 40,
      ankleRomLeft: 25,
      ankleRomRight: 25,
      pelvicObliquity: 0.04,
      meanStepWidth: 0.12,
      armSwingAsymmetry: 0.1,
      stepTimeAsymmetry: 0.05,
      viewAngle: "sagittal",
    } as any;

    test("1. steppage-gait triggers when knee flexion is high (>2 SD / >68°) and ankle dorsiflexion is deficient", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        kneeFlexLeft: 72,
        kneeFlexRight: 50,
        ankleDorsiflexion: -6.0,
      } as any;

      const guesses = buildEducatedGuesses(metrics);
      const steppage = guesses.find((g) => g.id === "steppage-gait");

      expect(steppage).toBeDefined();
      expect(steppage?.category).toBe("neuromotor");
      expect(steppage?.patternTag).toContain("steppage");
      expect(steppage?.evidence.some((e: string) => e.includes("Peak knee flexion"))).toBe(true);
    });

    test("2. festinating-gait triggers on accelerating cadence (>118 spm) with short steps or high ASA", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        cadenceSpm: 125,
        gaitSpeedMps: 0.8, // leads to short step length (<0.48m)
        stepTimeCV: 0.10,
        armSwingAsymmetry: 0.35,
      } as any;

      const armSwingData = { leftAmplitude: 35, rightAmplitude: 10, asymmetryIndex: 35.0, phaseCorrelation: 0.2 };
      const guesses = buildEducatedGuesses(metrics, { angleAnalysis: { armSwing: armSwingData } as any });
      const festinating = guesses.find((g) => g.id === "festinating-gait");

      expect(festinating).toBeDefined();
      expect(festinating?.category).toBe("neuromotor");
      expect(festinating?.patternTag).toContain("festinating");
      expect(festinating?.evidence.some((e: string) => e.includes("Cadence"))).toBe(true);
    });

    test("3. scissoring-gait triggers on narrow/crossing step width (Z < -2.0) and high hip adduction", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        meanStepWidth: 0.04, // very narrow
        viewAngle: "frontal",
        hipAdduction: 8.0,
      } as any;

      const guesses = buildEducatedGuesses(metrics);
      const scissoring = guesses.find((g) => g.id === "scissoring-gait");

      expect(scissoring).toBeDefined();
      expect(scissoring?.category).toBe("neuromotor");
      expect(scissoring?.patternTag).toContain("scissoring");
      expect(scissoring?.evidence.some((e: string) => e.includes("Step width"))).toBe(true);
    });

    test("4. waddling-gait triggers on pelvic obliquity > 8° (> 0.14 rad) and trunk lateral sway > 2 SD", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        pelvicObliquity: 0.16, // ~9.17°
        lateralSway: 0.09,
        viewAngle: "frontal",
      } as any;

      const trunkSwayData = { lateralExcursionDeg: 9.5, sagittalExcursionDeg: 3.0, harmonicRatio: 0.95 };
      const guesses = buildEducatedGuesses(metrics, { angleAnalysis: { trunkSway: trunkSwayData } as any });
      const waddling = guesses.find((g) => g.id === "waddling-gait");

      expect(waddling).toBeDefined();
      expect(waddling?.category).toBe("pattern");
      expect(waddling?.patternTag).toContain("waddling");
      expect(waddling?.evidence.some((e: string) => e.includes("Pelvic obliquity"))).toBe(true);
    });

    test("5. trendelenburg-sign triggers on unilateral pelvic drop > 5° in frontal view when waddling is not present", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        pelvicObliquity: 0.11, // ~6.3° (> 5° but < 8° or without high trunk sway)
        lateralSway: 0.03, // normal sway, so waddling doesn't trigger
        viewAngle: "frontal",
      } as any;

      const trunkSwayData = { lateralExcursionDeg: 3.5, sagittalExcursionDeg: 2.0, harmonicRatio: 1.8 };
      const guesses = buildEducatedGuesses(metrics, { angleAnalysis: { trunkSway: trunkSwayData } as any });
      const trendelenburg = guesses.find((g) => g.id === "trendelenburg-sign");

      expect(trendelenburg).toBeDefined();
      expect(trendelenburg?.category).toBe("pattern");
      expect(trendelenburg?.patternTag).toContain("Trendelenburg");
      expect(guesses.some((g) => g.id === "waddling-gait")).toBe(false);
    });

    test("6. circumduction-gait triggers on stiff knee (min knee flex < 32°) and excessive lateral swing arc", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        kneeFlexLeft: 25, // stiff left knee
        kneeFlexRight: 55,
        swingLateralArc: 0.10, // high lateral arc
        stepTimeAsymmetry: 0.25,
      } as any;

      const guesses = buildEducatedGuesses(metrics);
      const circumduction = guesses.find((g) => g.id === "circumduction-gait");

      expect(circumduction).toBeDefined();
      expect(circumduction?.category).toBe("neuromotor");
      expect(circumduction?.patternTag).toContain("circumduction");
      expect(circumduction?.evidence.some((e: string) => e.includes("Swing lateral arc"))).toBe(true);
    });
  });

  // ==========================================
  // R9: Gait Profile Score (GPS) & MAP
  // ==========================================
  describe("R9: Gait Profile Score (GPS) & MAP", () => {
    test("Normative curve match yields GPS ≈ 0° and all MAP sub-scores ≈ 0°", () => {
      const normCurves = getNormativeGaitCurves();
      const patientPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeMean,
        kneeAngleRight: nc.kneeMean,
        hipAngleLeft: nc.hipMean,
        hipAngleRight: nc.hipMean,
        ankleAngleLeft: nc.ankleMean,
        ankleAngleRight: nc.ankleMean,
      }));

      const angleAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: patientPoints as any,
        normativeData: normCurves,
      } as any;

      const result = calculateGPSAndMAP(angleAnalysis);

      expect(result.gpsScore).toBe(0);
      expect(result.map.kneeFlexionExtension).toBe(0);
      expect(result.map.hipFlexionExtension).toBe(0);
      expect(result.map.ankleDorsiflexionPlantarflexion).toBe(0);
      expect(result.evaluatedJointCount).toBe(3);
      expect(result.interpretation).toContain("Normal normative kinematic profile");
    });

    test("Pathological curve with 15° systematic shift yields GPS > 5° and correct MAP sub-scores", () => {
      const normCurves = getNormativeGaitCurves();
      const patientPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeMean + 15,
        kneeAngleRight: nc.kneeMean + 15,
        hipAngleLeft: nc.hipMean + 15,
        hipAngleRight: nc.hipMean + 15,
        ankleAngleLeft: nc.ankleMean + 15,
        ankleAngleRight: nc.ankleMean + 15,
      }));

      const angleAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: patientPoints as any,
        normativeData: normCurves,
      } as any;

      const result = calculateGPSAndMAP(angleAnalysis);

      expect(result.map.kneeFlexionExtension).toBeCloseTo(15.0, 1);
      expect(result.map.hipFlexionExtension).toBeCloseTo(15.0, 1);
      expect(result.map.ankleDorsiflexionPlantarflexion).toBeCloseTo(15.0, 1);
      expect(result.gpsScore).toBeCloseTo(15.0, 1);
      expect(result.gpsScore).toBeGreaterThan(5.0);
      expect(result.interpretation).toContain("Severe");
    });

    test("MAP sub-scores operate independently per joint when single joint is perturbed", () => {
      const normCurves = getNormativeGaitCurves();
      const patientPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeMean + 12,
        kneeAngleRight: nc.kneeMean + 12,
        hipAngleLeft: nc.hipMean,
        hipAngleRight: nc.hipMean,
        ankleAngleLeft: nc.ankleMean,
        ankleAngleRight: nc.ankleMean,
      }));

      const angleAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: patientPoints as any,
        normativeData: normCurves,
      } as any;

      const result = calculateGPSAndMAP(angleAnalysis);

      expect(result.map.kneeFlexionExtension).toBeCloseTo(12.0, 1);
      expect(result.map.hipFlexionExtension).toBe(0);
      expect(result.map.ankleDorsiflexionPlantarflexion).toBe(0);
      // GPS = sqrt( (12^2 + 0^2 + 0^2) / 3 ) = sqrt(144/3) = sqrt(48) ≈ 6.93
      expect(result.gpsScore).toBeCloseTo(6.93, 1);
      expect(result.interpretation).toContain("Moderate");
    });

    test("Frontal camera view suppression returns GPS = 0 with clear suppression message", () => {
      const angleAnalysis: GaitAngleAnalysis = {
        isSuppressed: true,
        suppressionReason: "Frontal view: Sagittal joint angle kinematics suppressed.",
      } as any;

      const result = calculateGPSAndMAP(angleAnalysis);

      expect(result.gpsScore).toBe(0);
      expect(result.map.kneeFlexionExtension).toBeNull();
      expect(result.map.hipFlexionExtension).toBeNull();
      expect(result.map.ankleDorsiflexionPlantarflexion).toBeNull();
      expect(result.evaluatedJointCount).toBe(0);
      expect(result.interpretation).toContain("Unevaluated");
    });

    test("Age-stratified normatives retrieve valid references across all 7 age tiers", () => {
      const pediatric = getNormativeReference("cadenceSpm", 12);
      const youngAdult = getNormativeReference("cadenceSpm", 25);
      const middleAdult = getNormativeReference("cadenceSpm", 55);
      const senior = getNormativeReference("cadenceSpm", 70);
      const advanced75 = getNormativeReference("cadenceSpm", 80);
      const advanced85 = getNormativeReference("cadenceSpm", 90);

      expect(pediatric.mean).toBeGreaterThan(0);
      expect(youngAdult.mean).toBeGreaterThan(0);
      expect(middleAdult.mean).toBeGreaterThan(0);
      expect(senior.mean).toBeGreaterThan(0);
      expect(advanced75.mean).toBeGreaterThan(0);
      expect(advanced85.mean).toBeGreaterThan(0);
    });
  });
});
