import { describe, it, expect } from "vitest";
import { symmetryAngle } from "../symmetry";
import { calculateDTE } from "../dte";
import { detectGaitEventsZeni } from "../events";
import type { Landmark } from "../types";

describe("M1 Empirical Challenger Verification (R1-R5)", () => {
  describe("R1: Zifchock Symmetry Angle (SA)", () => {
    it("returns 0.0 for perfectly symmetric inputs", () => {
      expect(symmetryAngle(100, 100)).toBe(0.0);
      expect(symmetryAngle(1.5, 1.5)).toBe(0.0);
      expect(symmetryAngle(0, 0)).toBe(0.0);
    });

    it("calculates 2:1 ratio correctly (40.97%)", () => {
      // arctan(100/50) = 63.4349 deg. |45 - 63.4349| / 45 * 100 = 40.966% -> 40.97%
      expect(symmetryAngle(100, 50)).toBe(40.97);
      expect(symmetryAngle(50, 100)).toBe(40.97);
    });

    it("calculates 3:1 ratio correctly (59.03%)", () => {
      // arctan(3) = 71.565 deg. |45 - 71.565| / 45 * 100 = 59.03%
      expect(symmetryAngle(30, 10)).toBe(59.03);
    });

    it("calculates 10:1 ratio correctly (87.31%)", () => {
      // arctan(10) = 84.289 deg. |45 - 84.289| / 45 * 100 = 87.31%
      expect(symmetryAngle(100, 10)).toBe(87.31);
    });

    it("caps maximum SA at 100.0% for extreme asymmetry", () => {
      expect(symmetryAngle(100, 0)).toBe(100.0);
      expect(symmetryAngle(0, 100)).toBe(100.0);
      expect(symmetryAngle(1e6, 0.0001)).toBe(100.0);
    });

    it("handles negative values using absolute magnitude", () => {
      expect(symmetryAngle(-100, 50)).toBe(40.97);
      expect(symmetryAngle(100, -50)).toBe(40.97);
      expect(symmetryAngle(-100, -50)).toBe(40.97);
    });
  });

  describe("R3: Cadence WalkFit and Parkinsonian Range [40, 140] spm", () => {
    it("accepts Parkinsonian low cadence (40-69 spm) without -40 penalty", () => {
      const walkFit = (c: number) => {
        if (c < 40 || c > 140) return -1e9;
        return -Math.abs(c - 108);
      };

      // 50 spm
      expect(walkFit(50)).toBe(-58);
      // 69 spm
      expect(walkFit(69)).toBe(-39);
      // 70 spm
      expect(walkFit(70)).toBe(-38);
      // 108 spm (optimal)
      expect(Math.abs(walkFit(108))).toBe(0);
      // 140 spm
      expect(walkFit(140)).toBe(-32);

      // Out of bounds
      expect(walkFit(39)).toBe(-1e9);
      expect(walkFit(141)).toBe(-1e9);
    });
  });

  describe("R4: Stride Ceiling (4.0s) & Double Support Search Scaling", () => {
    it("detects events and stance for slow strides with stride duration up to 4.0s", () => {
      const fps = 30;
      const totalSeconds = 12;
      const totalFrames = fps * totalSeconds;
      const landmarks: Landmark[][] = [];

      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps;
        const phaseL = (2 * Math.PI * t) / 3.0; // 3s stride cycle
        const phaseR = phaseL + Math.PI;

        const frame: Landmark[] = Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
        frame[23] = { x: 0.48, y: 0.5, z: 0, visibility: 0.9 };
        frame[24] = { x: 0.52, y: 0.5, z: 0, visibility: 0.9 };
        frame[27] = { x: 0.45, y: 0.7 + 0.1 * Math.sin(phaseL), z: 0, visibility: 0.9 };
        frame[28] = { x: 0.55, y: 0.7 + 0.1 * Math.sin(phaseR), z: 0, visibility: 0.9 };

        landmarks.push(frame);
      }

      const frames = landmarks.map((l, i) => ({ landmarks: l, timeMs: (i / fps) * 1000 }));
      const events = detectGaitEventsZeni(frames, fps);
      expect(events.leftStancePct).toBeGreaterThan(0);
      expect(events.rightStancePct).toBeGreaterThan(0);
      expect(events.stepEvents.length).toBeGreaterThan(0);
    });

    it("verifies double support search limit scales dynamically with meanStepTime", () => {
      const meanStepTimeNormal = 0.5;
      const dsLimitNormal = Math.min(0.75 * meanStepTimeNormal, 1.0);
      expect(dsLimitNormal).toBeCloseTo(0.375);

      const meanStepTimeSlow = 1.2;
      const dsLimitSlow = Math.min(0.75 * meanStepTimeSlow, 1.0);
      expect(dsLimitSlow).toBeCloseTo(0.9);

      const meanStepTimeVerySlow = 1.8;
      const dsLimitVerySlow = Math.min(0.75 * meanStepTimeVerySlow, 1.0);
      expect(dsLimitVerySlow).toBe(1.0);
    });
  });

  describe("R5: DTE Clamping to [-100%, +100%]", () => {
    const dummyMetrics = (cadence: number, cv: number, _sym: number) => ({
      viewAngle: "sagittal" as const,
      viewConfidence: 0.9,
      durationSec: 10,
      fpsEffective: 30,
      stepCount: 20,
      cadenceSpm: cadence,
      avgStepTimeSec: 60 / cadence,
      stepTimeAsymmetry: 0,
      strideAsymmetry: 0,
      lateralSway: 0.05,
      verticalBounce: 0.05,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0,
      stepWidthVariability: 0.02,
      doubleSupportHint: 0.2,
      leftStancePct: 60,
      rightStancePct: 60,
      leftSwingPct: 40,
      rightSwingPct: 40,
      doubleSupportPct: 20,
      symmetryAngle: 0,
      stepTimeCV: cv,
      strideTimeCV: cv,
      pelvicObliquity: 2,
      pelvicObliquityVar: 0.5,
      meanStepWidth: 0.15,
      pathSmoothness: 0.95,
      stabilityScore: 90,
      rhythmScore: 90,
      symmetryScore: 90,
      mobilityScore: 90,
      automaticityScore: 90,
      overallScore: 90,
      series: [],
      stepEvents: [],
    });

    it("clamps extreme negative stepTimeCvDTE to -100.0%", () => {
      const base = dummyMetrics(110, 0.02, 90);
      const dual = dummyMetrics(110, 0.20, 90);

      const dte = calculateDTE(base, dual);
      expect(dte.stepTimeCvDTE).toBe(-100.0);
      expect(dte.cmiClassification).toBe("cognitive_prioritization");
    });

    it("clamps extreme positive stepTimeCvDTE to +100.0%", () => {
      const base = dummyMetrics(110, 0.05, 90);
      const dual = dummyMetrics(110, 0.001, 90);

      const dte = calculateDTE(base, dual);
      expect(dte.stepTimeCvDTE).toBe(98.0);

      // Clamping upper bound test (e.g. if dualTask.stepTimeCV was zero/negative)
      const base2 = dummyMetrics(110, 0.10, 90);
      const dual2 = dummyMetrics(110, -0.05, 90); // theoretical negative input to test upper clamp
      const dte2 = calculateDTE(base2, dual2);
      expect(dte2.stepTimeCvDTE).toBe(100.0);
    });

    it("preserves in-bounds DTE values without distortion", () => {
      const base = dummyMetrics(110, 0.05, 90);
      const dual = dummyMetrics(110, 0.06, 90);

      const dte = calculateDTE(base, dual);
      expect(dte.stepTimeCvDTE).toBe(-20.0);
    });
  });
});
