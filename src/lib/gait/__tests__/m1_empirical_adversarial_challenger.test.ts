import { describe, expect, it } from "vitest";
import { savitzkyGolay5, kalmanFilter1D, smoothPoseFrames } from "../signal";
import type { PoseFrame, Landmark } from "../types";

describe("M1 Empirical Adversarial Challenger Stress Suite", () => {
  describe("1. savitzkyGolay5 Array Length & Degenerate Boundary Conditions", () => {
    const lengths = [0, 1, 2, 3, 4, 5, 1000];

    lengths.forEach((len) => {
      it(`handles array length N = ${len} cleanly`, () => {
        const signal = Array.from({ length: len }, (_, i) => Math.sin(i * 0.1) * 10 + 5);
        const result = savitzkyGolay5(signal);
        expect(result).toHaveLength(len);
        result.forEach((val) => {
          expect(Number.isFinite(val)).toBe(true);
        });
      });
    });

    it("handles signal inputs with NaN, Infinity, -Infinity", () => {
      const dirtySignal = [1.0, NaN, 3.0, Infinity, -Infinity, 6.0, 7.0, NaN, 9.0];
      const result = savitzkyGolay5(dirtySignal);
      expect(result).toHaveLength(dirtySignal.length);
      result.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
      });
    });

    it("handles extreme spikes in signal without exploding", () => {
      const spikedSignal = [1.0, 1.0, 1.0, 1e9, 1.0, 1.0, 1.0];
      const result = savitzkyGolay5(spikedSignal);
      expect(result).toHaveLength(7);
      result.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
      });
      // Spike at index 3 should be attenuated by 17/35 weight
      expect(result[3]).toBeCloseTo((17 / 35) * 1e9, -5);
    });

    it("preserves flat zero signal", () => {
      const zeroSignal = [0, 0, 0, 0, 0, 0, 0];
      const result = savitzkyGolay5(zeroSignal);
      expect(result).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it("preserves constant non-zero signal", () => {
      const constSignal = [42, 42, 42, 42, 42, 42, 42];
      const result = savitzkyGolay5(constSignal);
      result.forEach((val) => {
        expect(val).toBeCloseTo(42, 8);
      });
    });
  });

  describe("2. kalmanFilter1D Array Length & Degenerate Boundary Conditions", () => {
    const lengths = [0, 1, 2, 3, 4, 5, 1000];

    lengths.forEach((len) => {
      it(`handles array length N = ${len} cleanly`, () => {
        const signal = Array.from({ length: len }, (_, i) => Math.cos(i * 0.1) * 5 + 2);
        const result = kalmanFilter1D(signal);
        expect(result).toHaveLength(len);
        result.forEach((val) => {
          expect(Number.isFinite(val)).toBe(true);
        });
      });
    });

    it("handles NaN, Infinity, -Infinity via occlusion coasting", () => {
      const dirtySignal = [10.0, NaN, Infinity, 10.2, -Infinity, 10.4, NaN];
      const result = kalmanFilter1D(dirtySignal);
      expect(result).toHaveLength(dirtySignal.length);
      result.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
      });
      // Initial finite is 10.0, NaN and Infinity coast forward from 10.0
      expect(result[0]).toBeCloseTo(10.0, 5);
    });

    it("handles initial elements all NaN gracefully", () => {
      const initialNanSignal = [NaN, NaN, 5.0, 6.0, 7.0];
      const result = kalmanFilter1D(initialNanSignal);
      expect(result).toHaveLength(5);
      result.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
      });
      // First finite is at index 2 (5.0), so indices 0 and 1 coast state initialized to 5.0 (or 0 fallback)
      expect(result[2]).toBeCloseTo(5.0, 4);
    });

    it("handles extreme spikes in signal", () => {
      const spikedSignal = [1.0, 1.0, 1e8, 1.0, 1.0];
      const result = kalmanFilter1D(spikedSignal);
      expect(result).toHaveLength(5);
      result.forEach((val) => {
        expect(Number.isFinite(val)).toBe(true);
      });
    });

    it("handles flat zero and constant signals", () => {
      const zeroes = [0, 0, 0, 0, 0, 0];
      expect(kalmanFilter1D(zeroes)).toEqual([0, 0, 0, 0, 0, 0]);

      const consts = [15, 15, 15, 15, 15];
      const res = kalmanFilter1D(consts);
      res.forEach((v) => expect(v).toBeCloseTo(15, 5));
    });
  });

  describe("3. smoothPoseFrames Structural & Partial Keypoint Handling", () => {
    it("handles frame sequences of lengths 0, 1, 2, 3, 4, 5, 1000", () => {
      const lengths = [0, 1, 2, 3, 4, 5, 1000];
      lengths.forEach((len) => {
        const frames: PoseFrame[] = Array.from({ length: len }, (_, i) => ({
          timeMs: i * 33,
          landmarks: [
            { x: 0.1 * i, y: 0.2 * i, z: 0 },
            { x: 0.3 * i, y: 0.4 * i, z: 0 },
          ],
        }));
        const smoothedSG = smoothPoseFrames(frames, "savitzky-golay");
        const smoothedKalman = smoothPoseFrames(frames, "kalman");
        const smoothedNone = smoothPoseFrames(frames, "none");

        expect(smoothedSG).toHaveLength(len);
        expect(smoothedKalman).toHaveLength(len);
        expect(smoothedNone).toHaveLength(len);
      });
    });

    it("handles empty landmark arrays on frames", () => {
      const emptyLmFrames: PoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [],
      }));
      const res = smoothPoseFrames(emptyLmFrames);
      expect(res).toHaveLength(6);
      res.forEach((f) => expect(f.landmarks).toEqual([]));
    });

    it("handles partial/missing keypoint properties (missing z, visibility, presence, or undefined landmark elements)", () => {
      const frames: PoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [
          { x: i, y: i * 2, z: 0 }, // missing visibility, presence
          { x: i * 3, y: i * 4, z: i, visibility: 0.8 }, // missing presence
          { x: i, y: i, z: i, visibility: 0.9, presence: 0.95 },
        ],
      }));

      const smoothed = smoothPoseFrames(frames);
      expect(smoothed).toHaveLength(6);

      smoothed.forEach((f) => {
        expect(f.landmarks).toHaveLength(3);
        // Landmark 0 has default z=0, no visibility/presence properties attached
        expect(f.landmarks[0].z).toBe(0);
        expect(f.landmarks[0].visibility).toBeUndefined();

        // Landmark 1 has visibility 0.8 preserved, presence undefined
        expect(f.landmarks[1].visibility).toBe(0.8);
        expect(f.landmarks[1].presence).toBeUndefined();

        // Landmark 2 has both preserved
        expect(f.landmarks[2].visibility).toBe(0.9);
        expect(f.landmarks[2].presence).toBe(0.95);
      });
    });

    it("handles varying landmark array lengths across frames (e.g. frame 0 has 5 landmarks, frame 1 has 10 landmarks)", () => {
      const frames: PoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: Array.from({ length: i % 2 === 0 ? 5 : 10 }, (_, j) => ({
          x: i + j,
          y: i - j,
          z: 0,
        })),
      }));

      const smoothed = smoothPoseFrames(frames);
      expect(smoothed).toHaveLength(6);
      smoothed.forEach((f, i) => {
        expect(f.landmarks).toHaveLength(i % 2 === 0 ? 5 : 10);
      });
    });

    it("handles frames with NaN, Infinity, -Infinity landmark coordinates", () => {
      const frames: PoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [
          { x: i === 2 ? NaN : i, y: i === 3 ? Infinity : i, z: i === 4 ? -Infinity : 0 },
        ],
      }));

      const smoothed = smoothPoseFrames(frames, "savitzky-golay");
      expect(smoothed).toHaveLength(6);
      smoothed.forEach((f) => {
        expect(Number.isFinite(f.landmarks[0].x)).toBe(true);
        expect(Number.isFinite(f.landmarks[0].y)).toBe(true);
        expect(Number.isFinite(f.landmarks[0].z)).toBe(true);
      });
    });
  });

  describe("4. Immutability & Metadata Preservation Verification", () => {
    it("does NOT mutate original input PoseFrame objects, landmarks arrays, or landmark objects", () => {
      const originalFrames: PoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: 1000 + i * 33,
        landmarks: [
          { x: 1.0 + i * 0.1, y: 2.0 + i * 0.1, z: 0.5, visibility: 0.95, presence: 0.9 },
          { x: 3.0 + i * 0.1, y: 4.0 + i * 0.1, z: 0.2, visibility: 0.85 },
        ],
        worldLandmarks: [
          { x: 10.0 + i, y: 20.0 + i, z: 5.0, visibility: 0.9 },
        ],
      }));

      // Deep clone to compare after function execution
      const clone = JSON.parse(JSON.stringify(originalFrames));

      const smoothed = smoothPoseFrames(originalFrames, "savitzky-golay");

      // Check input objects were NOT mutated
      expect(originalFrames).toEqual(clone);

      // Check array references are distinct
      expect(smoothed).not.toBe(originalFrames);
      for (let i = 0; i < originalFrames.length; i++) {
        expect(smoothed[i]).not.toBe(originalFrames[i]);
        expect(smoothed[i].landmarks).not.toBe(originalFrames[i].landmarks);
        expect(smoothed[i].landmarks[0]).not.toBe(originalFrames[i].landmarks[0]);
        if (originalFrames[i].worldLandmarks) {
          expect(smoothed[i].worldLandmarks).not.toBe(originalFrames[i].worldLandmarks);
        }
      }
    });

    it("preserves additional PoseFrame fields and metadata", () => {
      type ExtendedPoseFrame = PoseFrame & { customField: string; extraNumber: number };

      const frames: ExtendedPoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [{ x: i, y: i, z: 0, visibility: 0.9 }],
        customField: `frame_${i}`,
        extraNumber: i * 42,
      }));

      const smoothed = smoothPoseFrames(frames);
      expect(smoothed).toHaveLength(6);
      smoothed.forEach((f, i) => {
        expect(f.customField).toBe(`frame_${i}`);
        expect(f.extraNumber).toBe(i * 42);
        expect(f.landmarks[0].visibility).toBe(0.9);
      });
    });
  });
});
