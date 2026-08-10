import { describe, it, expect } from "vitest";
import {
  computeBiometricSignature,
  biometricDistance,
  humanLikenessScore,
  isLikelyHumanTrack,
  matchPeople,
  type BiometricSignature,
  type PersonTrack,
} from "../analysis";
import type { Landmark } from "../types";

/** Helper to generate a 33-keypoint Mediapipe landmark array with customized visibility and coords */
function createMockLandmarks(
  overrides?: Partial<Record<number, Partial<Landmark>>>,
  defaultVis = 0.9,
  aspectWidth = 0.3,
  aspectHeight = 1.0
): Landmark[] {
  const landmarks: Landmark[] = [];
  const halfW = aspectWidth / 2;
  const topY = 0.2;
  const midY = 0.5;
  const botY = 0.2 + aspectHeight;

  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: defaultVis,
    });
  }

  // Keypoints required for biometrics:
  // 11: Left Shoulder, 12: Right Shoulder
  // 23: Left Hip, 24: Right Hip
  // 27: Left Ankle, 28: Right Ankle
  landmarks[11] = { x: 0.5 - halfW, y: topY, z: 0, visibility: defaultVis };
  landmarks[12] = { x: 0.5 + halfW, y: topY, z: 0, visibility: defaultVis };
  landmarks[23] = { x: 0.5 - halfW * 0.8, y: midY, z: 0, visibility: defaultVis };
  landmarks[24] = { x: 0.5 + halfW * 0.8, y: midY, z: 0, visibility: defaultVis };
  landmarks[27] = { x: 0.5 - halfW * 0.7, y: botY, z: 0, visibility: defaultVis };
  landmarks[28] = { x: 0.5 + halfW * 0.7, y: botY, z: 0, visibility: defaultVis };

  if (overrides) {
    for (const key of Object.keys(overrides)) {
      const idx = Number(key);
      landmarks[idx] = { ...landmarks[idx], ...overrides[idx] };
    }
  }

  return landmarks;
}

describe("R6 Visibility-Gated Biometrics & Sagittal Fix Empirical Stress Tests (Challenger M1-2)", () => {
  describe("Scenario 1: Low-Visibility & Occlusion Stress Test", () => {
    const REQUIRED_INDICES = [11, 12, 23, 24, 27, 28];

    it("should return undefined when ANY required keypoint has visibility < 0.4", () => {
      for (const idx of REQUIRED_INDICES) {
        for (const vis of [0.39, 0.35, 0.1, 0.0, -0.2]) {
          const lms = createMockLandmarks({ [idx]: { visibility: vis } });
          const sig = computeBiometricSignature(lms);
          expect(sig).toBeUndefined();
        }
      }
    });

    it("should return undefined for random combinations of occluded keypoints", () => {
      // Test multiple simultaneous keypoints with sub-threshold visibility
      const testCombinations = [
        [11, 12],
        [23, 28],
        [11, 24, 27],
        [11, 12, 23, 24, 27, 28],
      ];

      for (const combo of testCombinations) {
        const overrides: Partial<Record<number, Partial<Landmark>>> = {};
        for (const idx of combo) {
          overrides[idx] = { visibility: 0.25 };
        }
        const lms = createMockLandmarks(overrides);
        const sig = computeBiometricSignature(lms);
        expect(sig).toBeUndefined();
      }
    });

    it("should handle missing/undefined visibility property by defaulting to 1.0", () => {
      const lms = createMockLandmarks();
      // Remove visibility from required keypoint 11
      lms[11] = { x: 0.35, y: 0.2, z: 0 }; // visibility is undefined
      const sig = computeBiometricSignature(lms);
      expect(sig).toBeDefined();
      expect(sig?.meanVisibility).toBeGreaterThanOrEqual(0.9);
    });

    it("should return undefined on malformed landmark arrays or invalid coordinates", () => {
      expect(computeBiometricSignature([])).toBeUndefined();
      expect(computeBiometricSignature(null as unknown as Landmark[])).toBeUndefined();
      expect(computeBiometricSignature(undefined as unknown as Landmark[])).toBeUndefined();
      expect(computeBiometricSignature(createMockLandmarks().slice(0, 20))).toBeUndefined();

      // NaN or Infinity coordinates
      const nanLms = createMockLandmarks({ 11: { x: NaN, y: 0.2, visibility: 0.9 } });
      expect(computeBiometricSignature(nanLms)).toBeUndefined();

      const infLms = createMockLandmarks({ 24: { x: 0.6, y: Infinity, visibility: 0.9 } });
      expect(computeBiometricSignature(infLms)).toBeUndefined();
    });

    it("should verify callers handle undefined biometric signatures safely without NaN or exceptions", () => {
      const validSig: BiometricSignature = {
        aspectRatio: 0.35,
        torsoLegRatio: 0.5,
        shoulderHipRatio: 1.1,
        meanVisibility: 0.9,
      };

      // biometricDistance caller checks
      expect(biometricDistance(undefined, undefined)).toBe(0);
      expect(biometricDistance(validSig, undefined)).toBe(0);
      expect(biometricDistance(undefined, validSig)).toBe(0);
      expect(Number.isNaN(biometricDistance(undefined, validSig))).toBe(false);

      // humanLikenessScore caller checks
      const box = { w: 0.3, h: 1.0 };
      const scoreUndef = humanLikenessScore(undefined, box);
      expect(Number.isNaN(scoreUndef)).toBe(false);
      expect(scoreUndef).toBeGreaterThanOrEqual(0);
      expect(scoreUndef).toBeLessThanOrEqual(1);

      // isLikelyHumanTrack caller checks
      expect(isLikelyHumanTrack(undefined, box)).toBe(true);

      // matchPeople with occluded/undefined biometric detections
      const occludedDets = [createMockLandmarks({ 11: { visibility: 0.1 } })];
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };

      const assigned = matchPeople(occludedDets, tracks, nextId, 1);
      expect(assigned).toEqual([1]);
      expect(tracks.length).toBe(1);
      expect(tracks[0].biometrics).toBeUndefined();
      expect(Number.isNaN(tracks[0].velocity?.vx)).toBe(false);
      expect(Number.isNaN(tracks[0].velocity?.vy)).toBe(false);
    });
  });

  describe("Scenario 2: Sagittal View Aspect Ratio Sweep", () => {
    it("should keep biometricDistance stable and non-exploding as aspectRatio sweeps from 0.7 down to 0.1", () => {
      const step = 0.02;
      for (let ar = 0.7; ar >= 0.1; ar -= step) {
        const roundedAr = Number(ar.toFixed(3));
        const sigA: BiometricSignature = {
          aspectRatio: roundedAr,
          torsoLegRatio: 0.5,
          shoulderHipRatio: 1.0,
          meanVisibility: 0.9,
        };

        // Fluctuating shoulder/hip width due to sagittal 2D perspective noise (e.g. shoulderHipRatio varies from 0.6 to 2.8)
        const sigB: BiometricSignature = {
          aspectRatio: roundedAr,
          torsoLegRatio: 0.5,
          shoulderHipRatio: 2.8,
          meanVisibility: 0.9,
        };

        const distVal = biometricDistance(sigA, sigB);
        expect(Number.isNaN(distVal)).toBe(false);
        expect(Number.isFinite(distVal)).toBe(true);
        expect(distVal).toBeGreaterThanOrEqual(0);

        // When aspectRatio < 0.35, sagittal fix downweights shoulderHipRatio to 0.05.
        // dShoulderHip = |1.0 - 2.8| / max(0.1, 1.0, 2.8) = 1.8 / 2.8 = 0.6428
        // In sagittal mode: distVal = 0.6428 * 0.05 = 0.0321
        // In non-sagittal mode: distVal = 0.6428 * 0.30 = 0.1928
        if (roundedAr < 0.35) {
          expect(distVal).toBeLessThan(0.06);
        } else {
          expect(distVal).toBeGreaterThan(0.15);
        }
      }
    });

    it("should handle extreme shoulder/hip fluctuations in sagittal mode without blowing up", () => {
      const sigSagittalBase: BiometricSignature = {
        aspectRatio: 0.25,
        torsoLegRatio: 0.5,
        shoulderHipRatio: 1.0,
        meanVisibility: 0.9,
      };

      const extremeRatios = [0.01, 0.1, 5.0, 10.0, 100.0];
      for (const shRatio of extremeRatios) {
        const sigExtreme: BiometricSignature = {
          aspectRatio: 0.25,
          torsoLegRatio: 0.5,
          shoulderHipRatio: shRatio,
          meanVisibility: 0.9,
        };

        const distVal = biometricDistance(sigSagittalBase, sigExtreme);
        expect(Number.isNaN(distVal)).toBe(false);
        expect(Number.isFinite(distVal)).toBe(true);
        // Even with 100x shoulderHipRatio difference, sagittal weighting (0.05) keeps total distance capped below 0.10
        expect(distVal).toBeLessThan(0.10);
      }
    });

    it("should evaluate behavior around the boundary aspectRatio = 0.35", () => {
      const sigA1: BiometricSignature = { aspectRatio: 0.349, torsoLegRatio: 0.5, shoulderHipRatio: 1.0 };
      const sigB1: BiometricSignature = { aspectRatio: 0.349, torsoLegRatio: 0.5, shoulderHipRatio: 2.0 };
      const distSagittal = biometricDistance(sigA1, sigB1);

      const sigA2: BiometricSignature = { aspectRatio: 0.351, torsoLegRatio: 0.5, shoulderHipRatio: 1.0 };
      const sigB2: BiometricSignature = { aspectRatio: 0.351, torsoLegRatio: 0.5, shoulderHipRatio: 2.0 };
      const distFrontal = biometricDistance(sigA2, sigB2);

      expect(distSagittal).toBeLessThan(distFrontal);
      expect(Number.isFinite(distSagittal)).toBe(true);
      expect(Number.isFinite(distFrontal)).toBe(true);
    });
  });

  describe("Scenario 3: Dynamic Visibility EMA Trajectory", () => {
    it("should ensure high-visibility frames dominate the EMA state over a 50-frame sequence", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };

      // High visibility landmark set (meanVis = 0.95)
      const lmsHigh = createMockLandmarks({}, 0.95, 0.30, 1.0);
      const sigHigh = computeBiometricSignature(lmsHigh)!;

      // Low visibility landmark set (meanVis = 0.42, noisy shoulder/hip width)
      const lmsLow = createMockLandmarks(
        {
          11: { x: 0.1, y: 0.2, visibility: 0.42 },
          12: { x: 0.9, y: 0.2, visibility: 0.42 },
          23: { x: 0.3, y: 0.5, visibility: 0.42 },
          24: { x: 0.7, y: 0.5, visibility: 0.42 },
          27: { x: 0.35, y: 0.8, visibility: 0.42 },
          28: { x: 0.65, y: 0.8, visibility: 0.42 },
        },
        0.42,
        0.70,
        1.0
      );
      const sigLow = computeBiometricSignature(lmsLow)!;

      // Confirm expected initial signatures
      expect(sigHigh.meanVisibility).toBeCloseTo(0.95, 2);
      expect(sigLow.meanVisibility).toBeCloseTo(0.42, 2);

      // Sequence of 50 frames:
      // Pattern repeats every 3 frames:
      // Frame 1: High visibility (vis = 0.95)
      // Frame 2: Low visibility (vis = 0.42)
      // Frame 3: Occluded (vis = 0.20, returns undefined)
      for (let frameIndex = 1; frameIndex <= 50; frameIndex++) {
        let lms: Landmark[];
        const mod = frameIndex % 3;

        if (mod === 1) {
          lms = lmsHigh;
        } else if (mod === 2) {
          lms = lmsLow;
        } else {
          // Occluded frame
          lms = createMockLandmarks({ 27: { visibility: 0.20 } });
        }

        matchPeople([lms], tracks, nextId, frameIndex);

        // Sanity check track biometrics state
        const bio = tracks[0].biometrics;
        if (bio) {
          expect(Number.isNaN(bio.aspectRatio)).toBe(false);
          expect(Number.isNaN(bio.torsoLegRatio)).toBe(false);
          expect(Number.isNaN(bio.shoulderHipRatio)).toBe(false);
          expect(Number.isNaN(bio.meanVisibility ?? 0)).toBe(false);
        }
      }

      const finalBio = tracks[0].biometrics!;
      expect(finalBio).toBeDefined();

      // Calculate midpoint between High Vis signature and Low Vis signature
      const midAspectRatio = (sigHigh.aspectRatio + sigLow.aspectRatio) / 2;

      // Because alpha_high = 0.30 * 0.95 = 0.285 and alpha_low = 0.30 * 0.42 = 0.126,
      // high-visibility updates have over 2.26x higher weight than low-visibility updates.
      // Therefore, the EMA trajectory must be weighted toward sigHigh (aspectRatio < midAspectRatio).
      expect(finalBio.aspectRatio).toBeLessThan(midAspectRatio);

      const distToHigh = Math.abs(finalBio.aspectRatio - sigHigh.aspectRatio);
      const distToLow = Math.abs(finalBio.aspectRatio - sigLow.aspectRatio);
      expect(distToHigh).toBeLessThan(distToLow);

      // Mean visibility tracked by EMA should reflect high-visibility dominance (> 0.65)
      expect(finalBio.meanVisibility).toBeGreaterThan(0.65);
    });

    it("should ignore occluded frames completely, preventing biometric drift", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };

      // Frame 1: High visibility initial frame
      const lmsHigh = createMockLandmarks({}, 0.90, 0.30, 1.0);
      matchPeople([lmsHigh], tracks, nextId, 1);

      const initialBio = { ...tracks[0].biometrics! };

      // Frames 2-20: Completely occluded detections (visibility < 0.4)
      for (let f = 2; f <= 20; f++) {
        const lmsOccluded = createMockLandmarks({ 11: { visibility: 0.1 } }, 0.90, 0.80, 1.0);
        matchPeople([lmsOccluded], tracks, nextId, f);
      }

      // Biometrics should remain identical to initialBio because occluded frames produce undefined signatures
      const currentBio = tracks[0].biometrics!;
      expect(currentBio.aspectRatio).toBeCloseTo(initialBio.aspectRatio, 5);
      expect(currentBio.torsoLegRatio).toBeCloseTo(initialBio.torsoLegRatio, 5);
      expect(currentBio.shoulderHipRatio).toBeCloseTo(initialBio.shoulderHipRatio, 5);
    });
  });
});
