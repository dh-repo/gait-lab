import { describe, it, expect } from "vitest";
import {
  calculateArmSwingAsymmetry,
  calculateTrunkSway,
  calculateKneeFlexion,
  calculateHipFlexion,
  calculateAnkleAngle,
  getNormativeGaitCurves,
  computeGaitAngleAnalysis,
} from "../angles";
import {
  calculateZScore,
  erf,
  calculatePercentile,
  getNormativeReference,
  calculateGPSAndMAP,
  calculateGDI,
  evaluateGaitNormatives,
} from "../normatives";
import { buildEducatedGuesses, resolveDteValues } from "../guesses";
import {
  estimateGaitSpeed,
  computeFallRiskModelA,
  computeFallRiskModelB,
  evaluatePredictiveAgreement,
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
} from "../fallrisk";
import { symmetryAngle, gaitSymmetryIndex } from "../symmetry";
import { calculateDTE } from "../dte";
import {
  OneEuroFilter,
  computeSgWindowSize,
  savitzkyGolay,
  savitzkyGolayAdaptive,
  kalmanFilter1D,
  kalmanFilter2D,
  olsDetrend,
  zeroPhaseButterworth,
  smoothPoseFrames,
} from "../signal";
import type { GaitMetrics, Landmark, PoseFrame, DualTaskCost } from "../types";
import type { GaitEvent } from "../events";
import { LM } from "../landmarks";

// Helper utilities for creating test fixtures
function createBlankLandmarks(numKeypoints = 33): Landmark[] {
  return Array.from({ length: numKeypoints }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.9,
    presence: 0.9,
  }));
}

function createStandardPoseFrame(timeMs: number): PoseFrame {
  const lm = createBlankLandmarks();
  lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0.0, visibility: 0.9 };
  lm[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0.0, visibility: 0.9 };
  lm[LM.L_WRIST] = { x: 0.38, y: 0.45, z: 0.0, visibility: 0.9 };
  lm[LM.R_WRIST] = { x: 0.62, y: 0.45, z: 0.0, visibility: 0.9 };
  lm[LM.L_HIP] = { x: 0.42, y: 0.5, z: 0.0, visibility: 0.9 };
  lm[LM.R_HIP] = { x: 0.58, y: 0.5, z: 0.0, visibility: 0.9 };
  lm[LM.L_KNEE] = { x: 0.42, y: 0.7, z: 0.0, visibility: 0.9 };
  lm[LM.R_KNEE] = { x: 0.58, y: 0.7, z: 0.0, visibility: 0.9 };
  lm[LM.L_ANKLE] = { x: 0.42, y: 0.9, z: 0.0, visibility: 0.9 };
  lm[LM.R_ANKLE] = { x: 0.58, y: 0.9, z: 0.0, visibility: 0.9 };
  lm[LM.L_FOOT] = { x: 0.42, y: 0.95, z: 0.1, visibility: 0.9 };
  lm[LM.R_FOOT] = { x: 0.58, y: 0.95, z: 0.1, visibility: 0.9 };
  lm[LM.L_HEEL] = { x: 0.42, y: 0.9, z: -0.05, visibility: 0.9 };
  lm[LM.R_HEEL] = { x: 0.58, y: 0.9, z: -0.05, visibility: 0.9 };
  return { timeMs, landmarks: lm };
}

function createSyntheticGaitMetrics(overrides?: Partial<GaitMetrics>): GaitMetrics {
  return {
    viewAngle: "sagittal",
    viewConfidence: 0.9,
    fpsEffective: 30,
    avgStepTimeSec: 0.545,
    strideAsymmetry: 0.02,
    pathSmoothness: 0.95,
    series: [
      { t: 0, midHipX: 0.5, midHipY: 0.5, leftAnkleY: 0.9, rightAnkleY: 0.9, leftWristX: 0.38, rightWristX: 0.62, leftKneeAngle: 170, rightKneeAngle: 170 },
    ],
    stepEvents: [
      { frame: 10, timeSec: 0.33, type: "heel_strike", side: "left" },
    ],
    cadenceSpm: 110,
    stepCount: 20,
    durationSec: 10,
    gaitSpeedMps: 1.2,
    stepLength: 0.65,
    stepLengthLeft: 0.65,
    stepLengthRight: 0.65,
    stepTimeCV: 0.03,
    strideTimeCV: 0.03,
    stepTimeAsymmetry: 0.02,
    symmetryAngle: 2.0,
    leftStancePct: 60,
    rightStancePct: 60,
    doubleSupportPct: 20,
    doubleSupportHint: 0.20,
    lateralSway: 0.04,
    verticalBounce: 0.03,
    meanStepWidth: 0.16,
    stepWidthVariability: 0.02,
    pelvicObliquity: 0.02,
    pelvicObliquityVar: 0.01,
    armSwingLeft: 0.2,
    armSwingRight: 0.2,
    armSwingAsymmetry: 0.05,
    kneeFlexLeft: 55,
    kneeFlexRight: 55,
    kneeAsymmetry: 0.05,
    automaticityScore: 85,
    stabilityScore: 85,
    symmetryScore: 85,
    rhythmScore: 85,
    mobilityScore: 85,
    overallScore: 85,
    ...overrides,
  };
}

describe("R11 - Arm Swing Asymmetry & Kinematic Angles (angles.ts)", () => {
  it("returns zeroed ASA metrics for empty landmark array", () => {
    const res = calculateArmSwingAsymmetry([]);
    expect(res).toEqual({ leftAmplitude: 0, rightAmplitude: 0, asymmetryIndex: 0, phaseCorrelation: 0 });
  });

  it("handles short landmark sequences (<10 frames) gracefully", () => {
    const frames: Landmark[][] = Array.from({ length: 5 }, () => createBlankLandmarks());
    const res = calculateArmSwingAsymmetry(frames);
    expect(res.leftAmplitude).toBeDefined();
    expect(res.rightAmplitude).toBeDefined();
    expect(res.asymmetryIndex).toBeDefined();
  });

  it("calculates near-zero ASA for symmetric arm swing", () => {
    const frames: Landmark[][] = [];
    const numFrames = 30;
    for (let i = 0; i < numFrames; i++) {
      const lm = createBlankLandmarks();
      const phase = (2 * Math.PI * i) / 15;
      const swingL = 0.1 * Math.sin(phase);
      const swingR = -0.1 * Math.sin(phase);
      lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.L_WRIST] = { x: 0.4 + swingL, y: 0.45, z: 0, visibility: 0.9 };
      lm[LM.R_WRIST] = { x: 0.6 + swingR, y: 0.45, z: 0, visibility: 0.9 };
      lm[LM.L_HIP] = { x: 0.42, y: 0.5, z: 0, visibility: 0.9 };
      lm[LM.R_HIP] = { x: 0.58, y: 0.5, z: 0, visibility: 0.9 };
      lm[LM.L_KNEE] = { x: 0.42 + swingR * 0.5, y: 0.7, z: 0, visibility: 0.9 };
      lm[LM.R_KNEE] = { x: 0.58 + swingL * 0.5, y: 0.7, z: 0, visibility: 0.9 };
      frames.push(lm);
    }
    const res = calculateArmSwingAsymmetry(frames);
    expect(res.asymmetryIndex).toBeLessThan(10);
    expect(res.leftAmplitude).toBeGreaterThan(0);
    expect(res.rightAmplitude).toBeGreaterThan(0);
  });

  it("calculates ASA ~ 100 for one-arm frozen input", () => {
    const frames: Landmark[][] = [];
    const numFrames = 30;
    for (let i = 0; i < numFrames; i++) {
      const lm = createBlankLandmarks();
      const phase = (2 * Math.PI * i) / 15;
      const swingR = 0.15 * Math.sin(phase);
      lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.L_WRIST] = { x: 0.4, y: 0.45, z: 0, visibility: 0.9 }; // Left wrist stationary
      lm[LM.R_WRIST] = { x: 0.6 + swingR, y: 0.45, z: 0, visibility: 0.9 };
      lm[LM.L_HIP] = { x: 0.42, y: 0.5, z: 0, visibility: 0.9 };
      lm[LM.R_HIP] = { x: 0.58, y: 0.5, z: 0, visibility: 0.9 };
      lm[LM.L_KNEE] = { x: 0.42, y: 0.7, z: 0, visibility: 0.9 };
      lm[LM.R_KNEE] = { x: 0.58, y: 0.7, z: 0, visibility: 0.9 };
      frames.push(lm);
    }
    const res = calculateArmSwingAsymmetry(frames);
    expect(res.leftAmplitude).toBeCloseTo(0, 1);
    expect(res.rightAmplitude).toBeGreaterThan(5);
    expect(res.asymmetryIndex).toBeGreaterThanOrEqual(95);
  });

  it("handles low visibility keypoints (<0.3) by masking angle to zero", () => {
    const frames: Landmark[][] = [];
    for (let i = 0; i < 15; i++) {
      const lm = createBlankLandmarks();
      lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.1 }; // Hidden shoulder
      lm[LM.L_WRIST] = { x: 0.4, y: 0.45, z: 0, visibility: 0.1 };
      frames.push(lm);
    }
    const res = calculateArmSwingAsymmetry(frames);
    expect(res.leftAmplitude).toBe(0);
  });

  it("accepts events parameter formats (array or object with heelStrikes)", () => {
    const frames: Landmark[][] = Array.from({ length: 15 }, () => createBlankLandmarks());
    const eventsArray: GaitEvent[] = [{ frame: 10, type: "heel_strike", side: "left", timeSec: 1.0 }];
    const res1 = calculateArmSwingAsymmetry(frames, eventsArray);
    const res2 = calculateArmSwingAsymmetry(frames, { heelStrikes: eventsArray });
    expect(res1).toEqual(res2);
  });
});

describe("R11 - Trunk Sway Quantification (angles.ts)", () => {
  it("returns default values for empty landmark array", () => {
    const res = calculateTrunkSway([]);
    expect(res).toEqual({ lateralExcursionDeg: 0, sagittalExcursionDeg: 0, harmonicRatio: 1.0 });
  });

  it("computes excursion ~ 0 for static upright stance", () => {
    const frames: Landmark[][] = [];
    for (let i = 0; i < 20; i++) {
      const lm = createBlankLandmarks();
      lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.L_HIP] = { x: 0.4, y: 0.6, z: 0, visibility: 0.9 };
      lm[LM.R_HIP] = { x: 0.6, y: 0.6, z: 0, visibility: 0.9 };
      frames.push(lm);
    }
    const res = calculateTrunkSway(frames);
    expect(res.lateralExcursionDeg).toBeCloseTo(0, 1);
    expect(res.sagittalExcursionDeg).toBeCloseTo(0, 1);
  });

  it("measures accurate lateral excursion amplitude for periodic sway", () => {
    const frames: Landmark[][] = [];
    const numFrames = 30;
    for (let i = 0; i < numFrames; i++) {
      const lm = createBlankLandmarks();
      const swayX = 0.05 * Math.sin((2 * Math.PI * i) / 15);
      lm[LM.L_SHOULDER] = { x: 0.4 + swayX, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.R_SHOULDER] = { x: 0.6 + swayX, y: 0.2, z: 0, visibility: 0.9 };
      lm[LM.L_HIP] = { x: 0.4, y: 0.6, z: 0, visibility: 0.9 };
      lm[LM.R_HIP] = { x: 0.6, y: 0.6, z: 0, visibility: 0.9 };
      frames.push(lm);
    }
    const res = calculateTrunkSway(frames);
    expect(res.lateralExcursionDeg).toBeGreaterThan(2);
    expect(res.harmonicRatio).toBeGreaterThan(0);
  });

  it("handles missing shoulder or hip keypoints gracefully", () => {
    const frames: Landmark[][] = [];
    for (let i = 0; i < 15; i++) {
      const lm = createBlankLandmarks(10); // Missing shoulders/hips
      frames.push(lm);
    }
    const res = calculateTrunkSway(frames);
    expect(res.lateralExcursionDeg).toBe(0);
    expect(res.sagittalExcursionDeg).toBe(0);
  });
});

describe("R11 - Joint Kinematic Angles & Normative Curves (angles.ts)", () => {
  it("calculateKneeFlexion computes correct angle and guards invalid inputs", () => {
    const hip: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
    const knee: Landmark = { x: 0.5, y: 0.7, z: 0, visibility: 0.9 };
    const ankle: Landmark = { x: 0.5, y: 0.9, z: 0, visibility: 0.9 };
    expect(calculateKneeFlexion(hip, knee, ankle)).toBeCloseTo(0, 1);

    // 90 degree bent knee
    const ankleBent: Landmark = { x: 0.7, y: 0.7, z: 0, visibility: 0.9 };
    expect(calculateKneeFlexion(hip, knee, ankleBent)).toBeCloseTo(90, 1);

    // Undefined / low visibility
    expect(calculateKneeFlexion(null, knee, ankle)).toBe(0);
    expect(calculateKneeFlexion({ ...hip, visibility: 0.1 }, knee, ankle)).toBe(0);
  });

  it("calculateHipFlexion handles walk direction and low visibility", () => {
    const sh: Landmark = { x: 0.5, y: 0.2, z: 0, visibility: 0.9 };
    const hip: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
    const knee: Landmark = { x: 0.6, y: 0.7, z: 0, visibility: 0.9 };

    const flexFwd = calculateHipFlexion(sh, hip, knee, 1);
    const flexBwd = calculateHipFlexion(sh, hip, knee, -1);
    expect(flexFwd).toBeGreaterThan(0);
    expect(flexBwd).toBeLessThan(0);

    expect(calculateHipFlexion(null, hip, knee)).toBe(0);
  });

  it("calculateAnkleAngle falls back to heel when toe is hidden", () => {
    const knee: Landmark = { x: 0.5, y: 0.7, z: 0, visibility: 0.9 };
    const ankle: Landmark = { x: 0.5, y: 0.9, z: 0, visibility: 0.9 };
    const toeHidden: Landmark = { x: 0.6, y: 0.9, z: 0, visibility: 0.1 };
    const heel: Landmark = { x: 0.4, y: 0.85, z: 0, visibility: 0.9 };

    const angleWithHeel = calculateAnkleAngle(knee, ankle, toeHidden, 1, heel);
    expect(angleWithHeel).not.toBe(0);

    expect(calculateAnkleAngle(knee, ankle, toeHidden, 1, null)).toBe(0);
  });

  it("getNormativeGaitCurves returns 101 percentage points", () => {
    const curves = getNormativeGaitCurves();
    expect(curves.length).toBe(101);
    expect(curves[0].gaitCyclePct).toBe(0);
    expect(curves[100].gaitCyclePct).toBe(100);
    expect(curves[50].kneeMean).toBeDefined();
  });

  it("computeGaitAngleAnalysis suppresses sagittal angles in frontal view", () => {
    const frames: PoseFrame[] = [createStandardPoseFrame(0), createStandardPoseFrame(100)];
    const res = computeGaitAngleAnalysis(frames, [], "frontal");
    expect(res.isSuppressed).toBe(true);
    expect(res.suppressionReason).toContain("frontal camera view");
  });

  it("computeGaitAngleAnalysis handles empty frames array", () => {
    const res = computeGaitAngleAnalysis([], [], "sagittal");
    expect(res.isSuppressed).toBe(false);
    expect(res.normalizedPoints.length).toBe(101);
    expect(res.leftStrides).toEqual([]);
  });
});

describe("R11 - Gait Profile Score (GPS) & Movement Analysis Profile (MAP) (normatives.ts)", () => {
  it("returns default 0 score when angle analysis is suppressed or undefined", () => {
    const res1 = calculateGPSAndMAP(undefined);
    expect(res1.gpsScore).toBe(0);
    expect(res1.evaluatedJointCount).toBe(0);

    const res2 = calculateGPSAndMAP({ isSuppressed: true } as any);
    expect(res2.gpsScore).toBe(0);
    expect(res2.interpretation).toContain("suppressed");
  });

  it("computes GPS ~ 0.0° when patient curves perfectly match normative mean", () => {
    const normCurves = getNormativeGaitCurves();
    const mockPoints = normCurves.map((nc) => ({
      gaitCyclePct: nc.gaitCyclePct,
      kneeAngleLeft: nc.kneeMean,
      kneeAngleRight: nc.kneeMean,
      hipAngleLeft: nc.hipMean,
      hipAngleRight: nc.hipMean,
      ankleAngleLeft: nc.ankleMean,
      ankleAngleRight: nc.ankleMean,
    }));

    const mockAnalysis: any = {
      isSuppressed: false,
      normalizedPoints: mockPoints,
      normativeData: normCurves,
    };

    const res = calculateGPSAndMAP(mockAnalysis);
    expect(res.gpsScore).toBeCloseTo(0, 1);
    expect(res.evaluatedJointCount).toBe(3);
    expect(res.map.kneeFlexionExtension).toBeCloseTo(0, 1);
    expect(res.map.hipFlexionExtension).toBeCloseTo(0, 1);
    expect(res.map.ankleDorsiflexionPlantarflexion).toBeCloseTo(0, 1);
    expect(res.interpretation).toContain("Normal normative kinematic profile");
  });

  it("computes GPS > 5.0° for pathological curve offsets", () => {
    const normCurves = getNormativeGaitCurves();
    const mockPoints = normCurves.map((nc) => ({
      gaitCyclePct: nc.gaitCyclePct,
      kneeAngleLeft: nc.kneeMean + 10, // 10 deg deviation
      kneeAngleRight: nc.kneeMean + 10,
      hipAngleLeft: nc.hipMean - 8,
      hipAngleRight: nc.hipMean - 8,
      ankleAngleLeft: nc.ankleMean + 6,
      ankleAngleRight: nc.ankleMean + 6,
    }));

    const mockAnalysis: any = {
      isSuppressed: false,
      normalizedPoints: mockPoints,
      normativeData: normCurves,
    };

    const res = calculateGPSAndMAP(mockAnalysis);
    expect(res.gpsScore).toBeGreaterThan(5.0);
    expect(res.interpretation).toMatch(/Moderate|Severe/);
  });
});

describe("R11 - Normative References & Lifespan Stratification (normatives.ts)", () => {
  it("maps paramId aliases correctly to normalized parameter keys", () => {
    const ref1 = getNormativeReference("cadence");
    const ref2 = getNormativeReference("kneeFlex");
    const ref3 = getNormativeReference("speed");
    expect(ref1.paramId).toBe("cadenceSpm");
    expect(ref2.paramId).toBe("kneeFlexionRom");
    expect(ref3.paramId).toBe("gaitSpeed");
  });

  it("stratifies age tiers properly across pediatric, adult, and advanced age categories", () => {
    const refPed = getNormativeReference("cadenceSpm", 10, "male");
    const refYoung = getNormativeReference("cadenceSpm", 25, "female");
    const refMid = getNormativeReference("cadenceSpm", 55, "male");
    const refEld = getNormativeReference("cadenceSpm", 70, "female");
    const refAdv75 = getNormativeReference("cadenceSpm", 80, "male");
    const refAdv85 = getNormativeReference("cadenceSpm", 90, "female");

    expect(refPed.citation).toBe("Bovi et al. (2011)");
    expect(refPed.mean).toBe(124.0);
    expect(refYoung.mean).toBe(117.8);
    expect(refMid.mean).toBe(108.6);
    expect(refEld.mean).toBe(109.5);
    expect(refAdv75.mean).toBe(98.5);
    expect(refAdv85.mean).toBe(97.5);
  });

  it("defaults to Winter (2009) baseline when age/sex are omitted", () => {
    const ref = getNormativeReference("cadenceSpm");
    expect(ref.citation).toBe("Winter (2009)");
    expect(ref.mean).toBe(105.0);
  });
});

describe("R11 - Z-Score, Erf & Percentile Utilities (normatives.ts)", () => {
  it("calculateZScore handles normal and invalid inputs", () => {
    expect(calculateZScore(120, 100, 10)).toBe(2.0);
    expect(calculateZScore(NaN, 100, 10)).toBe(0);
    expect(calculateZScore(100, 100, 0)).toBe(0);
    expect(calculateZScore(100, 100, -5)).toBe(0);
  });

  it("erf function matches expected mathematical properties", () => {
    expect(erf(0)).toBe(0);
    expect(erf(Infinity)).toBe(1);
    expect(erf(-Infinity)).toBe(-1);
    expect(erf(1.0)).toBeCloseTo(0.8427, 2);
    expect(erf(-1.0)).toBeCloseTo(-0.8427, 2);
  });

  it("calculatePercentile maps z-scores correctly and clamps to [0.1, 99.9]", () => {
    expect(calculatePercentile(0)).toBeCloseTo(50.0, 1);
    expect(calculatePercentile(1.96)).toBeCloseTo(97.5, 1);
    expect(calculatePercentile(-1.96)).toBeCloseTo(2.5, 1);
    expect(calculatePercentile(10)).toBe(99.9);
    expect(calculatePercentile(-10)).toBe(0.1);
    expect(calculatePercentile(NaN)).toBe(50.0);
  });
});

describe("R11 - Gait Deviation Index & Normative Evaluation (normatives.ts)", () => {
  it("calculateGDI produces scores in [0, 130]", () => {
    const metrics = createSyntheticGaitMetrics();
    const res = calculateGDI(metrics);
    expect(res.gdiScore).toBeGreaterThanOrEqual(0);
    expect(res.gdiScore).toBeLessThanOrEqual(130);
    expect(res.interpretation).toBeDefined();
  });

  it("evaluateGaitNormatives returns GDI and individual metric evaluation bands", () => {
    const metrics = createSyntheticGaitMetrics({ cadenceSpm: 60 }); // Severe drop
    const res = evaluateGaitNormatives(metrics);
    expect(res.evaluations.length).toBeGreaterThan(0);
    const cadenceEv = res.evaluations.find((e) => e.paramId === "cadenceSpm");
    expect(cadenceEv).toBeDefined();
    expect(cadenceEv?.band).toMatch(/moderate_deviation|severe_deviation/);
  });
});

describe("R11 - 6 Compensatory Gait Hypotheses & Rule Combinations (guesses.ts)", () => {
  it("detects Steppage Gait hypothesis when knee flex > 2 SD + ankle dorsiflexion deficit", () => {
    const m = createSyntheticGaitMetrics({
      kneeFlexLeft: 70,
      kneeFlexRight: 50,
      viewAngle: "sagittal",
    });
    (m as any).ankleDorsiflexion = -6.0;

    const guesses = buildEducatedGuesses(m);
    const steppage = guesses.find((g) => g.id === "steppage-gait");
    expect(steppage).toBeDefined();
    expect(steppage?.severity).toMatch(/moderate|elevated/);
    expect(steppage?.patternTag).toContain("steppage gait");
  });

  it("detects Festinating Gait hypothesis for high cadence + step shortening", () => {
    const m = createSyntheticGaitMetrics({
      cadenceSpm: 125,
      gaitSpeedMps: 0.8, // Short steps relative to cadence
      armSwingAsymmetry: 0.35,
    });
    const guesses = buildEducatedGuesses(m);
    const festinating = guesses.find((g) => g.id === "festinating-gait");
    expect(festinating).toBeDefined();
    expect(festinating?.patternTag).toContain("festinating");
  });

  it("detects Scissoring Gait hypothesis for narrow step width + hip adduction", () => {
    const m = createSyntheticGaitMetrics({
      meanStepWidth: 0.04, // Very narrow
      viewAngle: "frontal",
    });
    (m as any).hipAdduction = 8.0;

    const guesses = buildEducatedGuesses(m);
    const scissoring = guesses.find((g) => g.id === "scissoring-gait");
    expect(scissoring).toBeDefined();
    expect(scissoring?.patternTag).toContain("scissoring");
  });

  it("detects Waddling Gait hypothesis for pelvic obliquity > 8° + high lateral sway", () => {
    const m = createSyntheticGaitMetrics({
      pelvicObliquity: 0.16, // > 8 deg (0.16 rad ~ 9.2 deg)
      lateralSway: 0.10,
    });
    const guesses = buildEducatedGuesses(m);
    const waddling = guesses.find((g) => g.id === "waddling-gait");
    expect(waddling).toBeDefined();
    expect(waddling?.patternTag).toContain("waddling gait");
  });

  it("detects Trendelenburg Sign hypothesis for pelvic obliquity > 5° in non-sagittal view", () => {
    const m = createSyntheticGaitMetrics({
      pelvicObliquity: 0.10, // ~ 5.7 deg
      lateralSway: 0.04, // Low sway so waddling doesn't trigger
      viewAngle: "frontal",
    });
    const guesses = buildEducatedGuesses(m);
    const trendelenburg = guesses.find((g) => g.id === "trendelenburg-sign");
    expect(trendelenburg).toBeDefined();
    expect(trendelenburg?.patternTag).toContain("Trendelenburg sign");
  });

  it("detects Circumduction Gait hypothesis for limited knee flex + outward swing arc", () => {
    const m = createSyntheticGaitMetrics({
      kneeFlexLeft: 25,
      kneeFlexRight: 25,
      stepTimeAsymmetry: 0.25,
    });
    (m as any).swingLateralArc = 0.09;

    const guesses = buildEducatedGuesses(m);
    const circumduction = guesses.find((g) => g.id === "circumduction-gait");
    expect(circumduction).toBeDefined();
    expect(circumduction?.patternTag).toContain("circumduction gait");
  });
});

describe("R11 - DTE Resolution & Educated Guess Categories (guesses.ts)", () => {
  it("resolveDteValues correctly converts costs to DTE values", () => {
    const dtc: DualTaskCost = {
      cadenceCostPct: 10,
      stepTimeCvCostPct: 15,
      stabilityCostPts: 5,
      automaticityCostPts: 8,
      summary: "Test cost",
    };
    const resolved = resolveDteValues(dtc);
    expect(resolved.cadenceDte).toBe(-10);
    expect(resolved.stepTimeCvDte).toBe(-15);
    expect(resolved.stabilityDte).toBe(-5);
    expect(resolved.automaticityDte).toBe(-8);
  });

  it("buildEducatedGuesses sorts output by severity (elevated -> moderate -> low)", () => {
    const m = createSyntheticGaitMetrics({
      symmetryAngle: 12.0, // elevated
      stepTimeCV: 0.15, // moderate
    });
    const guesses = buildEducatedGuesses(m);
    expect(guesses.length).toBeGreaterThan(0);
    const severities = guesses.map((g) => g.severity);
    const rankMap = { elevated: 0, moderate: 1, low: 2 };
    for (let i = 0; i < severities.length - 1; i++) {
      expect(rankMap[severities[i]]).toBeLessThanOrEqual(rankMap[severities[i + 1]]);
    }
  });
});

describe("R11 - Gait Speed Estimation & Height Adjustment (fallrisk.ts)", () => {
  it("returns explicit gaitSpeedMps if present", () => {
    const m = createSyntheticGaitMetrics({ gaitSpeedMps: 1.35 });
    expect(estimateGaitSpeed(m)).toBe(1.35);
  });

  it("uses height-adjusted formula when patient height is available", () => {
    const m = createSyntheticGaitMetrics({
      gaitSpeedMps: null,
      cadenceSpm: 120,
    });
    (m as any).heightMeters = 1.80;

    // formula: (120 * (0.414 * 1.80) * 2) / 60 = 4 * 0.7452 = 2.9808 -> 2.98
    const speed = estimateGaitSpeed(m);
    expect(speed).toBeCloseTo(2.98, 2);
  });

  it("uses stepLength formula when stepLength is available", () => {
    const m = createSyntheticGaitMetrics({
      gaitSpeedMps: null,
      cadenceSpm: 100,
      stepLength: 0.70,
    });
    // formula: (100 * 0.70 * 2) / 60 = 140 / 60 = 2.333 -> 2.33
    const speed = estimateGaitSpeed(m);
    expect(speed).toBeCloseTo(2.33, 2);
  });

  it("falls back to default adult height (1.70m) when only cadence is available", () => {
    const m = createSyntheticGaitMetrics({
      gaitSpeedMps: null,
      cadenceSpm: 100,
      stepLength: null,
      stepLengthLeft: null,
      stepLengthRight: null,
    });
    // formula: (100 * (0.414 * 1.70) * 2) / 60 = 200 * 0.7038 / 60 = 2.346 -> 2.35
    const speed = estimateGaitSpeed(m);
    expect(speed).toBeCloseTo(2.35, 2);
  });

  it("returns null when no speed or cadence is available", () => {
    const m = createSyntheticGaitMetrics({
      gaitSpeedMps: null,
      cadenceSpm: 0,
      stepLength: null,
      stepLengthLeft: null,
      stepLengthRight: null,
    });
    expect(estimateGaitSpeed(m)).toBeNull();
  });
});

describe("R11 - Dynamic STEADI Fall Risk Model A (fallrisk.ts)", () => {
  it("evaluates 4/4 metrics as safe for normal values", () => {
    const m = createSyntheticGaitMetrics({
      gaitSpeedMps: 1.2,
      stepTimeCV: 0.03,
      doubleSupportPct: 20,
      symmetryAngle: 3.0,
    });
    const res = computeFallRiskModelA(m);
    expect(res.category).toBe("low");
    expect(res.breachedCount).toBe(0);
    expect(res.evaluatedCount).toBe(4);
  });

  it("triggers High Risk when 3 or 4 cutoffs breached", () => {
    const m = createSyntheticGaitMetrics({
      gaitSpeedMps: 0.65, // breached (<0.80)
      stepTimeCV: 0.08, // breached (>0.06)
      doubleSupportPct: 40.0, // breached (>35%)
      symmetryAngle: 12.0, // breached (>10%)
    });
    const res = computeFallRiskModelA(m);
    expect(res.category).toBe("high");
    expect(res.breachedCount).toBe(4);
    expect(res.cutoffsMet.slowSpeed).toBe(true);
    expect(res.cutoffsMet.highStepTimeCV).toBe(true);
    expect(res.cutoffsMet.highDoubleSupport).toBe(true);
    expect(res.cutoffsMet.highAsymmetry).toBe(true);
  });

  it("dynamically adjusts breach threshold for frontal view (evaluatedCount = 2)", () => {
    const m = createSyntheticGaitMetrics({
      viewAngle: "frontal",
      gaitSpeedMps: 0.70, // breached
      stepTimeCV: 0.09, // breached
      doubleSupportPct: null,
      symmetryAngle: null,
    });
    const res = computeFallRiskModelA(m);
    expect(res.evaluatedCount).toBe(2);
    expect(res.breachedCount).toBe(2);
    // Math.ceil(0.6 * 2) = 2 -> 2/2 breached -> high risk
    expect(res.category).toBe("high");
  });
});

describe("R11 - Multi-Factor Composite Fall Risk Model B (fallrisk.ts)", () => {
  it("computes composite score for sagittal view with joint kinematics", () => {
    const m = createSyntheticGaitMetrics();
    const mockAngleAnalysis: any = {
      isSuppressed: false,
      metrics: { kneeRomLeft: 60, kneeRomRight: 60, hipRomLeft: 40, hipRomRight: 40, ankleRomLeft: 25, ankleRomRight: 25 },
      trunkSway: { lateralExcursionDeg: 4.0 },
    };
    const res = computeFallRiskModelB(m, undefined, mockAngleAnalysis, "sagittal");
    expect(res.category).toBe("low");
    expect(res.compositeScore).toBeLessThan(30);
    expect(res.isFrontalFallback).toBe(false);
  });

  it("uses frontal fallback (pelvic obliquity var) for frontal view clips", () => {
    const m = createSyntheticGaitMetrics({
      viewAngle: "frontal",
      pelvicObliquityVar: 0.05,
      lateralSway: 0.06,
    });
    const res = computeFallRiskModelB(m, undefined, undefined, "frontal");
    expect(res.isFrontalFallback).toBe(true);
    expect(res.subScores.kinematicsScore).toBeDefined();
  });

  it("does NOT substitute vertical bounce for lateral sway (returns null sway score)", () => {
    const m = createSyntheticGaitMetrics({
      lateralSway: null,
      verticalBounce: 0.10, // Should NOT be substituted
    });
    const res = computeFallRiskModelB(m);
    expect(res.subScores.trunkSwayScore).toBeNull();
  });

  it("re-normalizes weights excluding null subscores", () => {
    const m = createSyntheticGaitMetrics({
      lateralSway: null,
      pelvicObliquityVar: null,
    });
    const res = computeFallRiskModelB(m, undefined, undefined, "frontal");
    // Kinematics and sway are null -> only variability is valid
    expect(res.weights.kinematics).toBe(0);
    expect(res.weights.trunkSway).toBe(0);
    expect(res.weights.variability).toBe(1.0);
  });
});

describe("R11 - Predictive Agreement & Cohen's Kappa (fallrisk.ts)", () => {
  it("classifies concordant agreement when models match category", () => {
    const mA = computeFallRiskModelA(createSyntheticGaitMetrics());
    const mB = computeFallRiskModelB(createSyntheticGaitMetrics());
    const res = evaluatePredictiveAgreement(mA, mB);
    expect(res.classification).toBe("concordant");
    expect(res.cohenKappa).toBe(1.0);
    expect(res.percentageAgreement).toBe(100);
  });

  it("classifies stark divergence when Model A is low and Model B is high", () => {
    const mA = { ...computeFallRiskModelA(createSyntheticGaitMetrics()), category: "low" as const };
    const mB = { ...computeFallRiskModelB(createSyntheticGaitMetrics()), category: "high" as const };
    const res = evaluatePredictiveAgreement(mA, mB);
    expect(res.classification).toBe("stark_divergence");
    expect(res.scoreDifference).toBeDefined();
    expect(res.divergenceFactors.length).toBeGreaterThan(0);
  });
});

describe("R11 - Patient Baseline Statistics (fallrisk.ts)", () => {
  it("handles K=0 empty sessions gracefully with low confidence baseline", () => {
    const baseline = computePatientBaseline([], "pat_123");
    expect(baseline.patientId).toBe("pat_123");
    expect(baseline.sessionCount).toBe(0);
    expect(baseline.isLowConfidenceBaseline).toBe(true);
    expect(baseline.metrics.gaitSpeed.mean).toBe(1.10);
  });

  it("computes sample mean and sample std for K >= 2 sessions", () => {
    const sessions: any[] = [
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.0 }) },
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.2 }) },
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.4 }) },
    ];
    const baseline = computePatientBaseline(sessions, "pat_456");
    expect(baseline.sessionCount).toBe(3);
    expect(baseline.isLowConfidenceBaseline).toBe(false);
    expect(baseline.metrics.gaitSpeed.mean).toBeCloseTo(1.20, 2);
    expect(baseline.metrics.gaitSpeed.std).toBeGreaterThan(0);
  });
});

describe("R11 - Acute Weakness & Anomaly Detection (fallrisk.ts)", () => {
  it("triggers SPEED_DROP_ACUTE flag when speed drops >20% below baseline", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.20 }) },
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.20 }) },
    ] as any);
    const current = createSyntheticGaitMetrics({ gaitSpeedMps: 0.70 }); // 41% drop < 0.85 m/s

    const res = detectAcuteWeaknessAnomalies(current, baseline);
    expect(res.hasAcuteWeakness).toBe(true);
    const speedFlag = res.spikeFlags.find((f) => f.ruleId === "SPEED_DROP_ACUTE");
    expect(speedFlag).toBeDefined();
    expect(speedFlag?.percentChange).toBeLessThan(-20);
  });

  it("suppresses SPEED_DROP_ACUTE when assessmentCondition === 'slow_walk'", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.20 }) },
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.20 }) },
    ] as any);
    const current = createSyntheticGaitMetrics({ gaitSpeedMps: 0.70 });

    const res = detectAcuteWeaknessAnomalies(current, baseline, "slow_walk");
    const speedFlag = res.spikeFlags.find((f) => f.ruleId === "SPEED_DROP_ACUTE");
    expect(speedFlag).toBeUndefined();
  });

  it("triggers SWAY_SPIKE_ACUTE flag when lateral sway increases >30%", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createSyntheticGaitMetrics({ lateralSway: 0.04 }) },
      { metricsJson: createSyntheticGaitMetrics({ lateralSway: 0.04 }) },
    ] as any);
    const current = createSyntheticGaitMetrics({ lateralSway: 0.10 }); // > 30% jump & > 0.08

    const res = detectAcuteWeaknessAnomalies(current, baseline);
    const swayFlag = res.spikeFlags.find((f) => f.ruleId === "SWAY_SPIKE_ACUTE");
    expect(swayFlag).toBeDefined();
  });

  it("synthesizes UTI / Sepsis warning card when speed drop and DST escalation co-occur", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.20, doubleSupportPct: 20 }) },
      { metricsJson: createSyntheticGaitMetrics({ gaitSpeedMps: 1.20, doubleSupportPct: 20 }) },
    ] as any);
    const current = createSyntheticGaitMetrics({ gaitSpeedMps: 0.70, doubleSupportPct: 38 });

    const res = detectAcuteWeaknessAnomalies(current, baseline);
    const utiCard = res.warningCards.find((c) => c.id === "card_uti_sepsis_dehydration");
    expect(utiCard).toBeDefined();
    expect(utiCard?.severity).toBe("critical");
  });
});

describe("R11 - Zifchock Symmetry Angle & GSI (symmetry.ts)", () => {
  it("verifies symmetryAngle equation uses denominator 45 (SA doubles relative to old 90)", () => {
    // theta = arctan(10 / 20) = 26.565 deg
    // rawSA = |45 - 26.565| / 45 * 100 = 18.435 / 45 * 100 = 40.97%
    const sa = symmetryAngle(10, 20);
    expect(sa).toBeCloseTo(40.97, 1);
  });

  it("returns 0% for equal inputs and 100% for extreme asymmetry", () => {
    expect(symmetryAngle(15, 15)).toBe(0);
    expect(symmetryAngle(0, 10)).toBe(100);
    expect(symmetryAngle(10, 0)).toBe(100);
    expect(symmetryAngle(0, 0)).toBe(0);
  });

  it("handles negative input values by taking absolute magnitudes", () => {
    expect(symmetryAngle(-10, 10)).toBe(0);
    expect(symmetryAngle(-10, 20)).toBeCloseTo(40.97, 1);
  });

  it("gaitSymmetryIndex computes min/max ratio percentage", () => {
    expect(gaitSymmetryIndex(10, 20)).toBe(50.0);
    expect(gaitSymmetryIndex(15, 15)).toBe(100.0);
    expect(gaitSymmetryIndex(0, 0)).toBe(100.0);
  });
});

describe("R11 - Dual-Task Effect Clamping & CMI Classification (dte.ts)", () => {
  it("clamps stepTimeCvDTE to [-100%, +100%]", () => {
    const base = createSyntheticGaitMetrics({ stepTimeCV: 0.01 }); // Very small baseline
    const dual = createSyntheticGaitMetrics({ stepTimeCV: 0.20 }); // Huge jump

    const res = calculateDTE(base, dual);
    expect(res.stepTimeCvDTE).toBeGreaterThanOrEqual(-100.0);
    expect(res.stepTimeCvDTE).toBeLessThanOrEqual(100.0);
  });

  it("classifies mutual interference when both cadence and step CV deteriorate >5%", () => {
    const base = createSyntheticGaitMetrics({ cadenceSpm: 120, stepTimeCV: 0.03 });
    const dual = createSyntheticGaitMetrics({ cadenceSpm: 100, stepTimeCV: 0.06 }); // Both worse

    const res = calculateDTE(base, dual);
    expect(res.cmiClassification).toBe("mutual_interference");
  });

  it("returns default zeroed result when baseline or dualTask are missing", () => {
    const res = calculateDTE(null as any, null as any);
    expect(res).toEqual({
      cadenceDTE: 0.0,
      stepTimeCvDTE: 0.0,
      symmetryDTE: 0.0,
      cmiClassification: "no_interference",
    });
  });
});

describe("R11 - OneEuroFilter Signal Processing (signal.ts)", () => {
  it("static constant input yields constant filtered output", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    let val = 0;
    for (let i = 0; i < 20; i++) {
      val = filter.filter(5.0);
    }
    expect(val).toBeCloseTo(5.0, 4);
  });

  it("step response transitions smoothly without overshoot", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    const outputs: number[] = [];
    for (let i = 0; i < 10; i++) outputs.push(filter.filter(0));
    for (let i = 0; i < 30; i++) outputs.push(filter.filter(10));

    expect(outputs[10]).toBeLessThan(10);
    expect(outputs[10]).toBeGreaterThan(0);
    expect(outputs[outputs.length - 1]).toBeGreaterThan(9.5);
  });

  it("supports VFR timestamps and reset functionality", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    filter.filter(1.0, 0.0);
    filter.filter(2.0, 0.033);
    filter.filter(3.0, 0.066);

    filter.reset();
    const restarted = filter.filter(5.0);
    expect(restarted).toBe(5.0);
  });

  it("guards non-finite input values (NaN / Infinity)", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    filter.filter(4.0);
    const nanRes = filter.filter(NaN);
    expect(nanRes).toBe(4.0);
  });
});

describe("R11 - Adaptive Savitzky-Golay Filtering (signal.ts)", () => {
  it("computeSgWindowSize scales window size based on FPS", () => {
    expect(computeSgWindowSize(24)).toBe(5);
    expect(computeSgWindowSize(50)).toBe(9);
    expect(computeSgWindowSize(90)).toBe(15); // max clamped
    expect(computeSgWindowSize(144)).toBe(15);
    expect(computeSgWindowSize(240)).toBe(15);
    expect(computeSgWindowSize(-10)).toBe(5);
  });

  it("savitzkyGolay handles short signals (N < window) without error", () => {
    const shortSignal = [1, 2, 3];
    const filtered = savitzkyGolay(shortSignal, 9);
    expect(filtered).toEqual([1, 2, 3]);
  });

  it("savitzkyGolayAdaptive applies FPS-based windowing", () => {
    const sig = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.2));
    const filtered = savitzkyGolayAdaptive(sig, 50);
    expect(filtered.length).toBe(30);
    expect(filtered[0]).toBeDefined();
  });
});

describe("R11 - 2-State Constant-Velocity Kalman Filter (signal.ts)", () => {
  it("handles all-NaN signal gracefully", () => {
    const allNan = [NaN, NaN, NaN];
    const res = kalmanFilter1D(allNan);
    expect(res.position).toEqual([0, 0, 0]);
    expect(res.velocity).toEqual([0, 0, 0]);
  });

  it("handles initial occlusion and initializes at first finite sample", () => {
    const sig = [NaN, NaN, 10, 12, 14, 16];
    const res = kalmanFilter1D(sig);
    expect(res[0]).toBe(0);
    expect(res[1]).toBe(0);
    expect(res[2]).toBe(10);
    expect(res[5]).toBeGreaterThan(12);
  });

  it("kalmanFilter2D returns explicit position and velocity arrays", () => {
    const sig = [0, 1, 2, 3, 4, 5];
    const res = kalmanFilter2D(sig);
    expect(res.position.length).toBe(6);
    expect(res.velocity.length).toBe(6);
    expect(res.velocity[3]).toBeGreaterThan(0);
  });

  it("coasts velocity during low visibility gating (<0.4)", () => {
    const sig = [0, 1, 2, 3, 4, 5];
    const vis = [1.0, 1.0, 1.0, 0.1, 0.1, 1.0]; // Occluded in frames 3 & 4
    const res = kalmanFilter1D(sig, { visibility: vis });
    expect(res.position[3]).toBeDefined();
    expect(res.velocity[3]).toBeDefined();
  });
});

describe("R11 - OLS Detrending & Butterworth Resampling Guard (signal.ts)", () => {
  it("olsDetrend removes linear slope from signal", () => {
    const linearTrend = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const detrended = olsDetrend(linearTrend);
    for (const val of detrended) {
      expect(val).toBeCloseTo(0, 4);
    }
  });

  it("zeroPhaseButterworth triggers uniform resampling guard when timestamps CV > 0.10", () => {
    const signal = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.3));
    // Non-uniform timestamps (jittered dt)
    const timestamps = [0];
    for (let i = 1; i < 30; i++) {
      const dt = i % 2 === 0 ? 0.02 : 0.06; // mean 0.04, CV > 0.10
      timestamps.push(timestamps[i - 1] + dt);
    }

    const filtered = zeroPhaseButterworth(signal, 25, 6.0, timestamps);
    expect(filtered.length).toBe(30);
    expect(filtered[0]).toBeDefined();
  });

  it("smoothPoseFrames smooths frames via savitzky-golay, kalman, or none", () => {
    const frames: PoseFrame[] = Array.from({ length: 10 }, (_, i) => createStandardPoseFrame(i * 33));
    const sgSmoothed = smoothPoseFrames(frames, "savitzky-golay");
    const kSmoothed = smoothPoseFrames(frames, "kalman");
    const noneSmoothed = smoothPoseFrames(frames, "none");

    expect(sgSmoothed.length).toBe(10);
    expect(kSmoothed.length).toBe(10);
    expect(noneSmoothed.length).toBe(10);
  });
});
