import { describe, it, expect, vi, afterEach } from "vitest";
import {
  bufferedSpanSec,
  longestContinuousRun,
  defaultFacingMode,
} from "../liveCapture";
import type { PoseFrame } from "../types";

describe("Live Capture Buffer & Device Module (liveCapture.ts)", () => {
  describe("bufferedSpanSec()", () => {
    it("calculates wall-clock time span in seconds for multi-frame buffer", () => {
      const frames: PoseFrame[] = [
        { timeMs: 1000, landmarks: [] },
        { timeMs: 2500, landmarks: [] },
        { timeMs: 4000, landmarks: [] },
      ];
      expect(bufferedSpanSec(frames)).toBeCloseTo(3.0);
    });

    it("returns 0 for empty array or single frame buffer", () => {
      expect(bufferedSpanSec([])).toBe(0);
      expect(bufferedSpanSec([{ timeMs: 1000, landmarks: [] }])).toBe(0);
    });

    it("handles sub-millisecond and fractional time values correctly", () => {
      const frames: PoseFrame[] = [
        { timeMs: 100.5, landmarks: [] },
        { timeMs: 450.25, landmarks: [] },
      ];
      expect(bufferedSpanSec(frames)).toBeCloseTo(0.34975);
    });
  });

  describe("longestContinuousRun()", () => {
    it("returns copy of entire array when all gaps are <= MAX_LIVE_GAP_SEC (0.35s)", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 100, landmarks: [] },
        { timeMs: 200, landmarks: [] },
        { timeMs: 300, landmarks: [] },
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(4);
      expect(run).toEqual(frames);
      expect(run).not.toBe(frames); // Returns shallow copy
    });

    it("treats exact boundary gap of 0.35s (350ms) as continuous", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 350, landmarks: [] },
        { timeMs: 700, landmarks: [] },
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(3);
      expect(run).toEqual(frames);
    });

    it("splits buffer and extracts longest run when gap exceeds 0.35s (e.g. 0.351s or 20s gap)", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 100, landmarks: [] }, // Run 1 (2 frames)
        { timeMs: 1000, landmarks: [] }, // Gap 0.9s > 0.35s
        { timeMs: 1100, landmarks: [] },
        { timeMs: 1200, landmarks: [] },
        { timeMs: 1300, landmarks: [] }, // Run 2 (4 frames)
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(4);
      expect(run[0].timeMs).toBe(1000);
      expect(run[3].timeMs).toBe(1300);
    });

    it("selects longer run when multiple gaps divide buffer into unequal segments", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 100, landmarks: [] },
        { timeMs: 200, landmarks: [] },
        { timeMs: 300, landmarks: [] },
        { timeMs: 400, landmarks: [] }, // Run 1: 5 frames
        { timeMs: 1000, landmarks: [] }, // Gap 0.6s
        { timeMs: 1100, landmarks: [] },
        { timeMs: 1200, landmarks: [] }, // Run 2: 3 frames
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(5);
      expect(run[0].timeMs).toBe(0);
      expect(run[4].timeMs).toBe(400);
    });

    it("preserves earlier run when two continuous segments have equal frame counts", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 100, landmarks: [] }, // Segment 1: 2 frames
        { timeMs: 1000, landmarks: [] },
        { timeMs: 1100, landmarks: [] }, // Segment 2: 2 frames
      ];
      const run = longestContinuousRun(frames);
      expect(run.length).toBe(2);
      expect(run[0].timeMs).toBe(0);
      expect(run[1].timeMs).toBe(100);
    });

    it("handles empty array or single frame array safely", () => {
      expect(longestContinuousRun([])).toEqual([]);
      const single: PoseFrame[] = [{ timeMs: 500, landmarks: [] }];
      expect(longestContinuousRun(single)).toEqual(single);
      expect(longestContinuousRun(single)).not.toBe(single);
    });
  });

  describe("defaultFacingMode()", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns 'user' when window is undefined (SSR / Node environment)", () => {
      expect(defaultFacingMode()).toBe("user");
    });

    it("returns 'environment' for coarse pointer devices (handheld / mobile)", () => {
      vi.stubGlobal("window", {
        matchMedia: vi.fn().mockImplementation((query: string) => ({
          matches: query.includes("pointer: coarse"),
          media: query,
        })),
      });
      expect(defaultFacingMode()).toBe("environment");
    });

    it("returns 'user' for fine pointer devices (desktop / laptop)", () => {
      vi.stubGlobal("window", {
        matchMedia: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
        })),
      });
      expect(defaultFacingMode()).toBe("user");
    });

    it("returns 'user' when window.matchMedia is undefined", () => {
      vi.stubGlobal("window", { matchMedia: undefined });
      expect(defaultFacingMode()).toBe("user");
    });
  });
});
