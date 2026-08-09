// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { defaultFacingMode, longestContinuousRun } from "@/lib/gait/liveCapture";
import type { PoseFrame } from "@/lib/gait/types";

/**
 * The live-capture admission gate used to measure the buffer's first-to-last
 * timestamp span. That is not a continuity test: a subject who walks out of frame
 * and returns leaves two small clusters whose span reads as a long recording,
 * and resamplePoseFrames then fabricates the hole between them onto the uniform
 * 30 Hz grid. The gate must run on the longest CONTINUOUS run instead.
 */
function frames(timesSec: number[]): PoseFrame[] {
  return timesSec.map((t) => ({ timeMs: t * 1000, landmarks: [] }));
}
const span = (f: PoseFrame[]) =>
  f.length < 2 ? 0 : (f[f.length - 1].timeMs - f[0].timeMs) / 1000;

describe("live capture continuity gate", () => {
  it("returns the whole buffer when sampling is continuous", () => {
    const f = frames(Array.from({ length: 60 }, (_, i) => i / 30));
    expect(longestContinuousRun(f)).toHaveLength(60);
  });

  it("tolerates a few dropped frames without splitting the run", () => {
    // 0.1 s gap = 3 dropped frames at 30 Hz, well inside the 0.35 s tolerance.
    const f = frames([0, 0.033, 0.066, 0.166, 0.2, 0.233]);
    expect(longestContinuousRun(f)).toHaveLength(6);
  });

  it("rejects the span of a buffer with a long hole in the middle", () => {
    // Two 0.5 s clusters separated by 19 s out of frame. Naive span = ~20 s and
    // would have passed a 20 s admission gate on ~30 real frames.
    const before = Array.from({ length: 15 }, (_, i) => i / 30);
    const after = Array.from({ length: 15 }, (_, i) => 20 + i / 30);
    const f = frames([...before, ...after]);
    expect(span(f)).toBeGreaterThan(19);
    const run = longestContinuousRun(f);
    expect(run).toHaveLength(15);
    expect(span(run)).toBeLessThan(1);
  });

  it("picks the longer side when the buffer is split unevenly", () => {
    const short = Array.from({ length: 5 }, (_, i) => i / 30);
    const long = Array.from({ length: 40 }, (_, i) => 10 + i / 30);
    expect(longestContinuousRun(frames([...short, ...long]))).toHaveLength(40);
  });

  it("handles empty and single-frame buffers without throwing", () => {
    expect(longestContinuousRun([])).toEqual([]);
    expect(longestContinuousRun(frames([1]))).toHaveLength(1);
  });
});

describe("default camera facing (mobile)", () => {
  const original = window.matchMedia;
  const setPointer = (coarse: boolean) => {
    // @ts-expect-error jsdom does not implement matchMedia; install a stub.
    window.matchMedia = (q: string) => ({ matches: coarse && q.includes("coarse") });
  };
  afterEach(() => {
    window.matchMedia = original;
  });

  it("opens the REAR camera on touch devices", () => {
    // A phone defaulting to the selfie camera cannot see the person walking.
    setPointer(true);
    expect(defaultFacingMode()).toBe("environment");
  });

  it("keeps the user-facing camera on desktops", () => {
    setPointer(false);
    expect(defaultFacingMode()).toBe("user");
  });

  it("falls back safely where matchMedia is unavailable (SSR/jsdom)", () => {
    // @ts-expect-error deliberately removing the API to exercise the guard.
    window.matchMedia = undefined;
    expect(defaultFacingMode()).toBe("user");
  });
});
