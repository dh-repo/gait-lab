import { describe, expect, it } from "vitest";
import {
  butterworthLowPass,
  olsDetrend,
  zeroPhaseButterworth,
} from "../signal";
import { gaitSymmetryIndex, symmetryAngle } from "../symmetry";
import { calculateDTE } from "../dte";
import {
  calculateAnkleAngle,
  calculateHipFlexion,
  calculateKneeFlexion,
  computeGaitAngleAnalysis,
  getNormativeGaitCurves,
} from "../angles";
import { analyzeGait, computeGaitMetrics, detectViewAngle } from "../analysis";
import type { PoseFrame, Landmark } from "../types";
import { LM } from "../landmarks";
import {
  createMockMetrics,
  generateNoisyPoseFrames,
  generateSyntheticWalkingFrames,
} from "./testHelpers";

describe("Challenger M1-1 Empirical Stress Suite", () => {
  describe("1. olsDetrend & Signal Processing Degenerate Inputs", () => {
    it("handles empty and single-element arrays in olsDetrend", () => {
      expect(olsDetrend([])).toEqual([]);
      expect(olsDetrend([42])).toEqual([42]);
      expect(olsDetrend([10, 20])).toHaveLength(2);
    });

    it("handles constant value arrays without division by zero in olsDetrend", () => {
      const constantData = [5, 5, 5, 5, 5, 5];
      const detrended = olsDetrend(constantData);
      expect(detrended).toHaveLength(6);
      detrended.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
        expect(Math.abs(val)).toBeLessThan(1e-5);
      });
    });

    it("handles NaN and Infinite values safely in olsDetrend", () => {
      const dirtyData = [1, 2, NaN, 4, Infinity, -Infinity, 7];
      const result = olsDetrend(dirtyData);
      expect(result).toHaveLength(7);
      result.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
      });
    });

    it("handles all-NaN array in olsDetrend", () => {
      const allNan = [NaN, NaN, NaN];
      const result = olsDetrend(allNan);
      expect(result).toHaveLength(3);
      result.forEach((val) => expect(val).toBe(0));
    });

    it("handles extremely large signals in olsDetrend", () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => i * 0.5 + Math.sin(i));
      const detrended = olsDetrend(largeData);
      expect(detrended).toHaveLength(10000);
      expect(Number.isFinite(detrended[5000])).toBe(true);
    });

    it("handles degenerate FPS values in Butterworth lowpass filters without throwing", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(butterworthLowPass(data, 0)).toEqual(data);
      expect(butterworthLowPass(data, -30)).toEqual(data);

      const nanRes = butterworthLowPass(data, NaN);
      expect(nanRes).toHaveLength(10);
      nanRes.forEach((v) => expect(Number.isFinite(v)).toBe(true));

      expect(zeroPhaseButterworth(data, 0)).toEqual(data);
      expect(zeroPhaseButterworth(data, -30)).toEqual(data);

      const zpNanRes = zeroPhaseButterworth(data, NaN);
      expect(zpNanRes).toHaveLength(10);
      zpNanRes.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });

    it("handles short/empty/NaN signals in zeroPhaseButterworth", () => {
      expect(zeroPhaseButterworth([], 30)).toEqual([]);
      expect(zeroPhaseButterworth([1, 2], 30)).toEqual([1, 2]);
      
      const dirtySignal = [1, NaN, 3, Infinity, 5, -Infinity, 7];
      const filtered = zeroPhaseButterworth(dirtySignal, 30);
      expect(filtered).toHaveLength(7);
      filtered.forEach((val) => expect(Number.isFinite(val)).toBe(true));
    });

    it("handles extreme sample rates (10 FPS and 120 FPS) in zeroPhaseButterworth", () => {
      const data = Array.from({ length: 50 }, (_, i) => Math.sin((i * 2 * Math.PI) / 10));
      const lowFps = zeroPhaseButterworth(data, 10, 6.0);
      const highFps = zeroPhaseButterworth(data, 120, 6.0);
      expect(lowFps).toHaveLength(50);
      expect(highFps).toHaveLength(50);
      lowFps.forEach((v) => expect(Number.isFinite(v)).toBe(true));
      highFps.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });
  });

  describe("2. Empty & Single Frame Edge Cases", () => {
    it("returns valid safe structure for empty frames in computeGaitMetrics", () => {
      const metrics = computeGaitMetrics([]);
      expect(metrics.viewAngle).toBe("unknown");
      expect(metrics.stepCount).toBe(0);
      expect(metrics.cadenceSpm).toBe(0);
      expect(metrics.stepEvents).toEqual([]);
      expect(metrics.series).toEqual([]);
    });

    it("returns valid safe structure for a single frame in computeGaitMetrics", () => {
      const singleFrame: PoseFrame = {
        timeMs: 1000,
        landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
      };
      const metrics = computeGaitMetrics([singleFrame]);
      expect(metrics.stepCount).toBe(0);
      expect(metrics.durationSec).toBe(0);
      expect(metrics.series).toEqual([]);
    });

    it("returns non-crashing safe structure for empty frames in computeGaitAngleAnalysis", () => {
      const analysis = computeGaitAngleAnalysis([], [], "sagittal");
      expect(analysis.isSuppressed).toBe(false);
      expect(analysis.normalizedPoints).toHaveLength(101);
      expect(analysis.leftStrides).toEqual([]);
      expect(analysis.rightStrides).toEqual([]);
      expect(analysis.metrics.kneeRomLeft).toBeNull();
    });

    it("returns non-crashing safe structure for single frame in computeGaitAngleAnalysis", () => {
      const singleFrame: PoseFrame = {
        timeMs: 1000,
        landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
      };
      const analysis = computeGaitAngleAnalysis([singleFrame], [], "sagittal");
      expect(analysis.normalizedPoints).toHaveLength(101);
      expect(analysis.leftStrides).toEqual([]);
    });

    it("returns valid AnalysisResult for empty frames in analyzeGait", () => {
      const result = analyzeGait([], 1, "single");
      expect(result.analyzedFrames).toBe(0);
      expect(result.metrics.stepCount).toBe(0);
      expect(result.angleAnalysis!.normalizedPoints).toHaveLength(101);
    });

    it("returns valid AnalysisResult for single frame in analyzeGait", () => {
      const singleFrame: PoseFrame = {
        timeMs: 1000,
        landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
      };
      const result = analyzeGait([singleFrame], 1, "single");
      expect(result.analyzedFrames).toBe(1);
      expect(result.metrics.stepCount).toBe(0);
    });
  });

  describe("3. Missing & Occluded Landmarks (visibility < 0.3)", () => {
    it("handles occluded landmarks in 3-point joint angle calculations", () => {
      const hipLowVis: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.1 };
      const knee: Landmark = { x: 0.5, y: 0.7, z: 0, visibility: 0.9 };
      const ankle: Landmark = { x: 0.5, y: 0.9, z: 0, visibility: 0.9 };
      const shoulder: Landmark = { x: 0.5, y: 0.3, z: 0, visibility: 0.9 };

      expect(calculateKneeFlexion(hipLowVis, knee, ankle)).toBe(0);
      expect(calculateHipFlexion(shoulder, hipLowVis, knee)).toBe(0);
      expect(calculateAnkleAngle(knee, ankle, { x: 0.6, y: 0.9, z: 0, visibility: 0.1 })).toBe(0);
    });

    it("uses heel fallback in calculateAnkleAngle when toe is occluded", () => {
      const knee: Landmark = { x: 0.5, y: 0.7, z: 0, visibility: 0.9 };
      const ankle: Landmark = { x: 0.5, y: 0.9, z: 0, visibility: 0.9 };
      const toeLowVis: Landmark = { x: 0.6, y: 0.9, z: 0, visibility: 0.1 };
      const heelGoodVis: Landmark = { x: 0.45, y: 0.88, z: 0, visibility: 0.9 };

      const angle = calculateAnkleAngle(knee, ankle, toeLowVis, 1, heelGoodVis);
      expect(Number.isFinite(angle)).toBe(true);
      expect(angle).not.toBe(0);
    });

    it("handles completely occluded synthetic walking sequence gracefully", () => {
      const occludedFrames = generateSyntheticWalkingFrames({ lowVisibilityLandmarks: true });
      const metrics = computeGaitMetrics(occludedFrames);
      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);

      const angleAnalysis = computeGaitAngleAnalysis(occludedFrames, metrics.stepEvents, "sagittal");
      expect(angleAnalysis.normalizedPoints).toHaveLength(101);
    });
  });

  describe("4. Noisy Spatial Trajectories & Camera Shake", () => {
    it("handles high Gaussian noise without crashing or producing NaN", () => {
      const noisyFrames = generateNoisyPoseFrames(30, 3.0, 0.15);
      const metrics = computeGaitMetrics(noisyFrames);
      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
      expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);

      const angleAnalysis = computeGaitAngleAnalysis(noisyFrames, metrics.stepEvents, "sagittal");
      expect(angleAnalysis.normalizedPoints).toHaveLength(101);
      angleAnalysis.normalizedPoints.forEach((pt) => {
        if (pt.kneeAngleLeft !== null) expect(Number.isFinite(pt.kneeAngleLeft)).toBe(true);
        if (pt.hipAngleLeft !== null) expect(Number.isFinite(pt.hipAngleLeft)).toBe(true);
      });
    });

    it("handles single-frame outlier keypoint spikes without filter explosion", () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 3.0 });
      // Inject keypoint glitch at frame 15
      frames[15].landmarks[LM.L_ANKLE] = { x: 999.0, y: -999.0, z: 0, visibility: 0.9 };
      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    });
  });

  describe("5. Extreme FPS Values (10 FPS, 120 FPS)", () => {
    it("computes metrics and angle analysis accurately at 10 FPS", () => {
      const frames10 = generateSyntheticWalkingFrames({ fps: 10, durationSec: 4.0 });
      const metrics = computeGaitMetrics(frames10);
      expect(metrics.fpsEffective).toBeCloseTo(10, 0);

      const angleAnalysis = computeGaitAngleAnalysis(frames10, metrics.stepEvents, "sagittal");
      expect(angleAnalysis.normalizedPoints).toHaveLength(101);
    });

    it("computes metrics and angle analysis accurately at 120 FPS", () => {
      const frames120 = generateSyntheticWalkingFrames({ fps: 120, durationSec: 3.0 });
      const metrics = computeGaitMetrics(frames120);
      expect(metrics.fpsEffective).toBeCloseTo(120, 0);

      const angleAnalysis = computeGaitAngleAnalysis(frames120, metrics.stepEvents, "sagittal");
      expect(angleAnalysis.normalizedPoints).toHaveLength(101);
    });
  });

  describe("6. NaN and Infinite Landmark Coordinates", () => {
    it("handles NaN/Infinity landmark coordinates in computeGaitMetrics", () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 2.0 });
      // Corrupt frame 5 landmarks with NaN and Infinity
      frames[5].landmarks[LM.L_HIP] = { x: NaN, y: Infinity, z: -Infinity, visibility: 0.9 };
      frames[5].landmarks[LM.L_KNEE] = { x: NaN, y: NaN, z: NaN, visibility: 0.9 };

      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
      expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    });

    it("handles NaN/Infinity inputs in symmetry and DTE calculations", () => {
      expect(symmetryAngle(0, 0)).toBe(0.0);
      expect(symmetryAngle(NaN, 10)).toBeDefined();
      expect(symmetryAngle(Infinity, -Infinity)).toBeDefined();

      expect(gaitSymmetryIndex(0, 0)).toBe(100.0);
      expect(gaitSymmetryIndex(NaN, 10)).toBeDefined();

      const baseMetrics = createMockMetrics({ cadenceSpm: 100, stepTimeCV: 0.04 });
      const dualMetrics = createMockMetrics({ cadenceSpm: NaN, stepTimeCV: Infinity });
      const dte = calculateDTE(baseMetrics, dualMetrics);
      expect(dte).toBeDefined();
      expect(dte.cmiClassification).toBeDefined();
    });
  });

  describe("7. Frontal vs Sagittal vs Follow-Cam View Angles", () => {
    it("suppresses joint angle analysis in frontal view angle", () => {
      const frames = generateSyntheticWalkingFrames({ viewAngle: "frontal" });
      const analysis = computeGaitAngleAnalysis(frames, [], "frontal");
      expect(analysis.isSuppressed).toBe(true);
      expect(analysis.suppressionReason).toContain("frontal camera view");
    });

    it("does not suppress joint angle analysis in sagittal view angle", () => {
      const frames = generateSyntheticWalkingFrames({ viewAngle: "sagittal" });
      const analysis = computeGaitAngleAnalysis(frames, [], "sagittal");
      expect(analysis.isSuppressed).toBe(false);
      expect(analysis.suppressionReason).toBeUndefined();
    });

    it("handles follow_cam view angle gracefully", () => {
      const followCamFrames = generateSyntheticWalkingFrames({ followCam: true, viewAngle: "sagittal" });
      const { angle, confidence } = detectViewAngle(followCamFrames);
      expect(angle).toBeDefined();
      expect(confidence).toBeGreaterThan(0);

      const metrics = computeGaitMetrics(followCamFrames);
      expect(metrics).toBeDefined();
    });

    it("returns normative gait reference curves correctly", () => {
      const norm = getNormativeGaitCurves();
      expect(norm).toHaveLength(101);
      expect(norm[0].gaitCyclePct).toBe(0);
      expect(norm[100].gaitCyclePct).toBe(100);
      expect(norm[0].kneeMean).toBe(5.0);
    });
  });

  describe("8. DTE Plummer & Eskes 4-Tier Taxonomy Verification", () => {
    it("classifies no_interference when |DTE| <= 5%", () => {
      const base = createMockMetrics({ cadenceSpm: 100, stepTimeCV: 0.05 });
      const dual = createMockMetrics({ cadenceSpm: 102, stepTimeCV: 0.048 });
      const dte = calculateDTE(base, dual);
      expect(dte.cmiClassification).toBe("no_interference");
    });

    it("classifies mutual_interference when cadenceDTE < -5% AND stepTimeCvDTE < -5%", () => {
      const base = createMockMetrics({ cadenceSpm: 100, stepTimeCV: 0.05 });
      const dual = createMockMetrics({ cadenceSpm: 90, stepTimeCV: 0.08 });
      const dte = calculateDTE(base, dual);
      expect(dte.cmiClassification).toBe("mutual_interference");
    });

    it("classifies cognitive_prioritization when cadenceDTE < -5% OR stepTimeCvDTE < -5%", () => {
      const base = createMockMetrics({ cadenceSpm: 100, stepTimeCV: 0.05 });
      const dual = createMockMetrics({ cadenceSpm: 90, stepTimeCV: 0.05 });
      const dte = calculateDTE(base, dual);
      expect(dte.cmiClassification).toBe("cognitive_prioritization");
    });

    it("classifies motor_prioritization when cadenceDTE > 5% OR stepTimeCvDTE > 5%", () => {
      const base = createMockMetrics({ cadenceSpm: 100, stepTimeCV: 0.05 });
      const dual = createMockMetrics({ cadenceSpm: 108, stepTimeCV: 0.04 });
      const dte = calculateDTE(base, dual);
      expect(dte.cmiClassification).toBe("motor_prioritization");
    });
  });
});
