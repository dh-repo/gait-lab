import { describe, it, expect } from "vitest";
import { detectGaitEventsZeni, GaitEvent } from "../events";
import { generateGaussianNoise } from "./testHelpers";
import type { PoseFrame, Landmark } from "../types";

/**
 * Synthetic generator for Frontal View walking frames.
 * Frontal view has minimal AP displacement (apRange < 0.028) triggering the frontal-Y fallback path.
 */
interface FrontalFramesOptions {
  fps?: number;
  durationSec?: number;
  freq?: number; // Step frequency Hz (~1.6 Hz => ~96 spm)
  firstContactSide?: "left" | "right";
  noiseY?: number; // Gaussian noise stddev on Y
  lAnkleVis?: number;
  rAnkleVis?: number;
  occlusionPattern?: "none" | "left_only" | "right_only" | "alternating" | "both";
  dropPeakIndices?: number[]; // Indices of contact peaks to suppress in Y trajectory
}

function generateSyntheticFrontalFrames(opts: FrontalFramesOptions = {}): {
  frames: PoseFrame[];
  groundTruthContacts: Array<{ frame: number; side: "left" | "right" }>;
} {
  const fps = opts.fps ?? 30;
  const durationSec = opts.durationSec ?? 4.0;
  const freq = opts.freq ?? 1.6;
  const firstContactSide = opts.firstContactSide ?? "right";
  const noiseY = opts.noiseY ?? 0;
  const occlusionPattern = opts.occlusionPattern ?? "none";
  const dropPeakIndices = opts.dropPeakIndices ?? [];

  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const groundTruthContacts: Array<{ frame: number; side: "left" | "right" }> = [];

  const phaseOffsetRight = firstContactSide === "right" ? 0 : Math.PI;
  const phaseOffsetLeft = phaseOffsetRight + Math.PI;

  const dt = 1 / fps;
  let lastRightInStance = false;
  let lastLeftInStance = false;

  for (let f = 0; f < totalFrames; f++) {
    const t = f * dt;
    const timeMs = t * 1000;

    const leftPhase = 2 * Math.PI * freq * t + phaseOffsetLeft;
    const rightPhase = 2 * Math.PI * freq * t + phaseOffsetRight;

    const leftLift = Math.max(0, Math.sin(leftPhase));
    const rightLift = Math.max(0, Math.sin(rightPhase));

    let leftAnkleY = 0.85 - 0.05 * leftLift;
    let rightAnkleY = 0.85 - 0.05 * rightLift;

    if (noiseY > 0) {
      leftAnkleY += generateGaussianNoise(noiseY);
      rightAnkleY += generateGaussianNoise(noiseY);
    }

    let lVis = opts.lAnkleVis ?? 0.9;
    let rVis = opts.rAnkleVis ?? 0.9;

    if (occlusionPattern === "left_only") {
      lVis = 0.1;
    } else if (occlusionPattern === "right_only") {
      rVis = 0.1;
    } else if (occlusionPattern === "both") {
      lVis = 0.1;
      rVis = 0.1;
    } else if (occlusionPattern === "alternating") {
      if (Math.floor(t) % 2 === 0) {
        lVis = 0.1;
        rVis = 0.9;
      } else {
        lVis = 0.9;
        rVis = 0.1;
      }
    }

    const rightInStance = rightLift < 0.01;
    const leftInStance = leftLift < 0.01;

    if (rightInStance && !lastRightInStance) {
      groundTruthContacts.push({ frame: f, side: "right" });
    }
    if (leftInStance && !lastLeftInStance) {
      groundTruthContacts.push({ frame: f, side: "left" });
    }

    lastRightInStance = rightInStance;
    lastLeftInStance = leftInStance;

    if (dropPeakIndices.length > 0) {
      const contactIdx = groundTruthContacts.length - 1;
      if (dropPeakIndices.includes(contactIdx)) {
        leftAnkleY = 0.80;
        rightAnkleY = 0.80;
      }
    }

    const midHipX = 0.5;
    const midHipY = 0.5;
    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));

    landmarks[0] = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
    landmarks[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[23] = { x: 0.45, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[24] = { x: 0.55, y: midHipY, z: 0, visibility: 0.9 };

    landmarks[27] = { x: 0.45, y: leftAnkleY, z: 0, visibility: lVis };
    landmarks[28] = { x: 0.55, y: rightAnkleY, z: 0, visibility: rVis };
    landmarks[29] = { x: 0.45, y: leftAnkleY, z: 0, visibility: lVis };
    landmarks[30] = { x: 0.55, y: rightAnkleY, z: 0, visibility: rVis };
    landmarks[31] = { x: 0.45, y: leftAnkleY + 0.01, z: 0, visibility: lVis };
    landmarks[32] = { x: 0.55, y: rightAnkleY + 0.01, z: 0, visibility: rVis };

    frames.push({ timeMs, landmarks });
  }

  return { frames, groundTruthContacts };
}

describe("M4 Pass 2 Challenger 2: Empirical Stress Test Suite", () => {
  describe("1. Frontal-Y Lateral Ankle Position Disambiguation under Noise", () => {
    it("diagnoses strike sequence under low noise (sigma = 0.001)", () => {
      const { frames, groundTruthContacts } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        firstContactSide: "right",
        noiseY: 0.001,
      });

      const result = detectGaitEventsZeni(frames, 30);
      const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

      expect(strikes.length).toBeGreaterThan(0);

      // Verify strict side-alternation (no consecutive same-side strikes within a stride cycle)
      for (let i = 1; i < strikes.length; i++) {
        const prev = strikes[i - 1];
        const curr = strikes[i];
        if (curr.side === prev.side) {
          const dtSec = curr.timeSec - prev.timeSec;
          // Consecutive same-side strikes must be separated by a full stride cycle (>= 0.6s)
          expect(dtSec).toBeGreaterThanOrEqual(0.60);
        }
      }
    });

    it("evaluates side disambiguation tolerance under moderate noise (sigma = 0.005)", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        firstContactSide: "left",
        noiseY: 0.005,
      });

      const result = detectGaitEventsZeni(frames, 30);
      const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

      expect(strikes.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThan(0);
      expect(result.rightStancePct).toBeGreaterThan(0);
    });

    it("evaluates side disambiguation degradation under high noise (sigma = 0.015)", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        firstContactSide: "right",
        noiseY: 0.015,
      });

      const result = detectGaitEventsZeni(frames, 30);
      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(Array.isArray(result.stepEvents)).toBe(true);
    });
  });

  describe("2. Occluded Ankle Joint Stress Testing (Tiers 2, 3, 4 Fallbacks)", () => {
    it("handles persistent left ankle occlusion gracefully (Tier 2B right visible, left occluded)", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        occlusionPattern: "left_only",
      });

      const result = detectGaitEventsZeni(frames, 30);
      const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

      expect(strikes.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThan(0);
      expect(result.rightStancePct).toBeGreaterThan(0);
    });

    it("handles persistent right ankle occlusion gracefully (Tier 2A left visible, right occluded)", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        occlusionPattern: "right_only",
      });

      const result = detectGaitEventsZeni(frames, 30);
      const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

      expect(strikes.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThan(0);
      expect(result.rightStancePct).toBeGreaterThan(0);
    });

    it("handles alternating occlusion patterns across stance phases", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 5.0,
        occlusionPattern: "alternating",
      });

      const result = detectGaitEventsZeni(frames, 30);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(Number.isNaN(result.leftStancePct)).toBe(false);
    });

    it("handles complete bilateral ankle occlusion via Tier 3/4 alternation memory without NaN", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        occlusionPattern: "both",
      });

      const result = detectGaitEventsZeni(frames, 30);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
    });
  });

  describe("3. Variable Frame Rate Input Timestamps (15 to 60 FPS)", () => {
    const fpsList = [15, 24, 30, 45, 60];

    fpsList.forEach((fps) => {
      it(`detects gait events correctly at ${fps} FPS in frontal view`, () => {
        const { frames } = generateSyntheticFrontalFrames({
          fps,
          durationSec: 4.0,
          firstContactSide: "right",
        });

        const result = detectGaitEventsZeni(frames, fps);
        const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

        expect(strikes.length).toBeGreaterThanOrEqual(3);
        expect(result.leftStancePct).toBeGreaterThanOrEqual(30);
        expect(result.leftStancePct).toBeLessThanOrEqual(85);
        expect(result.rightStancePct).toBeGreaterThanOrEqual(30);
        expect(result.rightStancePct).toBeLessThanOrEqual(85);
      });
    });

    it("handles non-uniform / jittered frame rate timestamps without error", () => {
      const { frames: baseFrames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
      });

      const jitteredFrames: PoseFrame[] = baseFrames.map((f, idx) => ({
        timeMs: f.timeMs + (idx % 2 === 0 ? 5 : -5),
        landmarks: f.landmarks,
      }));

      const result = detectGaitEventsZeni(jitteredFrames, 30);
      expect(result.stepEvents.length).toBeGreaterThan(0);
    });
  });

  describe("4. Single-Contact Peak Drops & Parity Flip Recovery Verification", () => {
    it("diagnoses dropped contact peak behavior", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        firstContactSide: "right",
      });

      const modifiedFrames = frames.map((f, idx) => {
        if (idx >= 38 && idx <= 44) {
          const newLms = f.landmarks.map((lm, lIdx) => {
            if (lIdx === 27 || lIdx === 28) {
              return { ...lm, y: 0.80 };
            }
            return lm;
          });
          return { ...f, landmarks: newLms };
        }
        return f;
      });

      const result = detectGaitEventsZeni(modifiedFrames, 30);
      const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

      expect(strikes.length).toBeGreaterThan(0);

      // Verify that after the dropped peak (frame 38-44), post-drop contacts maintain correct physical side labeling
      const postDropStrikes = strikes.filter((s) => s.frame > 44);
      expect(postDropStrikes.length).toBeGreaterThan(0);

      postDropStrikes.forEach((s) => {
        const frame = modifiedFrames[s.frame];
        const lY = frame.landmarks[27].y;
        const rY = frame.landmarks[28].y;
        // If height difference is spatial, side must match spatial lower ankle
        if (Math.abs(lY - rY) > 0.003) {
          const expectedSide = lY > rY ? "left" : "right";
          expect(s.side).toBe(expectedSide);
        }
      });
    });

    it("proves Tier 1 direct spatial height inspection prevents parity inversion cascade", () => {
      const { frames } = generateSyntheticFrontalFrames({
        fps: 30,
        durationSec: 4.0,
        firstContactSide: "left",
      });

      const result = detectGaitEventsZeni(frames, 30);
      const strikes = result.stepEvents.filter((e) => e.type === "heel_strike");

      strikes.forEach((strike) => {
        const frame = frames[strike.frame];
        const lY = frame.landmarks[27].y;
        const rY = frame.landmarks[28].y;
        const spatialSide = lY > rY ? "left" : "right";
        expect(strike.side).toBe(spatialSide);
      });
    });
  });
});
