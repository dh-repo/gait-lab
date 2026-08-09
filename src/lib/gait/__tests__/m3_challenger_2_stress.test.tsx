import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PoseTracker, parseWebcamError, WebcamError } from "../PoseTracker";
import { PoseFrame, Landmark } from "../types";
import { resamplePoseFrames } from "../pose";
import { computeGaitMetrics } from "../analysis";
import { computeGaitAngleAnalysis } from "../angles";
import { buildEducatedGuesses } from "../guesses";
import { GaitApp } from "@/components/gait/GaitApp";

describe("Milestone 3 Challenger 2: Empirical Stress Tests", () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn>; kind: string; enabled: boolean };
  let mockStream: { getTracks: ReturnType<typeof vi.fn>; getVideoTracks: ReturnType<typeof vi.fn> };
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();

    mockTrack = {
      stop: vi.fn(),
      kind: "video",
      enabled: true,
    };

    mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "cam-01", kind: "videoinput", label: "Front Camera" },
        ]),
      },
    });

    const createMockVideo = () => {
      return {
        readyState: 4,
        videoWidth: 1280,
        videoHeight: 720,
        paused: false,
        ended: false,
        srcObject: null as unknown,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLVideoElement;
    };

    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "video") return createMockVideo();
        return {};
      },
    });

    mockVideo = createMockVideo();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // FOCUS AREA 1: DOMException Permission & Device Errors
  // =========================================================================
  describe("Focus Area 1: DOMException Permission & Device Errors", () => {
    it("1.1 Maps NotAllowedError / PermissionDeniedError to NOT_ALLOWED with clear clinical guidance", () => {
      const err1 = new DOMException("User denied permission", "NotAllowedError");
      const parsed1 = parseWebcamError(err1);
      expect(parsed1).toBeInstanceOf(WebcamError);
      expect(parsed1.code).toBe("NOT_ALLOWED");
      expect(parsed1.message).toContain("Camera access was denied");

      const err2 = new DOMException("Permission denied", "PermissionDeniedError");
      const parsed2 = parseWebcamError(err2);
      expect(parsed2.code).toBe("NOT_ALLOWED");
    });

    it("1.2 Maps NotFoundError / DevicesNotFoundError to NOT_FOUND", () => {
      const err1 = new DOMException("Device not found", "NotFoundError");
      const parsed1 = parseWebcamError(err1);
      expect(parsed1.code).toBe("NOT_FOUND");
      expect(parsed1.message).toContain("No video input camera device detected");

      const err2 = new DOMException("No video devices", "DevicesNotFoundError");
      const parsed2 = parseWebcamError(err2);
      expect(parsed2.code).toBe("NOT_FOUND");
    });

    it("1.3 Maps NotReadableError / TrackStartError to NOT_READABLE", () => {
      const err1 = new DOMException("Hardware error", "NotReadableError");
      const parsed1 = parseWebcamError(err1);
      expect(parsed1.code).toBe("NOT_READABLE");
      expect(parsed1.message).toContain("currently in use by another application");

      const err2 = new DOMException("Could not start video source", "TrackStartError");
      const parsed2 = parseWebcamError(err2);
      expect(parsed2.code).toBe("NOT_READABLE");
    });

    it("1.4 Maps OverconstrainedError to OVERCONSTRAINED", () => {
      const err = new DOMException("Resolution not supported", "OverconstrainedError");
      const parsed = parseWebcamError(err);
      expect(parsed.code).toBe("OVERCONSTRAINED");
      expect(parsed.message).toContain("constraints are not supported");
    });

    it("1.5 Maps SecurityError to SECURITY with HTTPS requirement warning", () => {
      const err = new DOMException("Insecure origin", "SecurityError");
      const parsed = parseWebcamError(err);
      expect(parsed.code).toBe("SECURITY");
      expect(parsed.message).toContain("requires a secure HTTPS connection or localhost");
    });

    it("1.6 Handles unknown DOMExceptions, Error instances, strings, and WebcamError passthrough", () => {
      const customErr = new Error("Custom camera malfunction");
      const parsedCustom = parseWebcamError(customErr);
      expect(parsedCustom.code).toBe("UNKNOWN");
      expect(parsedCustom.message).toBe("Custom camera malfunction");

      const stringErr = "Raw string error";
      const parsedString = parseWebcamError(stringErr);
      expect(parsedString.code).toBe("UNKNOWN");
      expect(parsedString.message).toBe("Raw string error");

      const existingWebcamErr = new WebcamError("Already wrapped", "NOT_ALLOWED");
      expect(parseWebcamError(existingWebcamErr)).toBe(existingWebcamErr);
    });

    it("1.7 OverconstrainedError triggers fallback retry with basic video constraints before throwing", async () => {
      const overconstrainedErr = new DOMException("Width 3840 not supported", "OverconstrainedError");
      const getUserMediaMock = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;

      // First call fails with OverconstrainedError, second succeeds with basic constraints
      getUserMediaMock.mockRejectedValueOnce(overconstrainedErr).mockResolvedValueOnce(mockStream);

      const tracker = new PoseTracker();
      tracker.setLandmarker({
        detect: vi.fn(),
        detectForVideo: vi.fn(),
        setOptions: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      });
      const stream = await tracker.startWebcam(mockVideo, { width: 3840 });

      expect(stream).toBe(mockStream);
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
      expect(getUserMediaMock).toHaveBeenLastCalledWith({ video: true, audio: false });
    });

    it("1.8 OverconstrainedError fallback failure throws parsed WebcamError", async () => {
      const overconstrainedErr = new DOMException("Width invalid", "OverconstrainedError");
      const notAllowedErr = new DOMException("User denied fallback", "NotAllowedError");
      const getUserMediaMock = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;

      getUserMediaMock.mockRejectedValueOnce(overconstrainedErr).mockRejectedValueOnce(notAllowedErr);

      const tracker = new PoseTracker();
      tracker.setLandmarker({
        detect: vi.fn(),
        detectForVideo: vi.fn(),
        setOptions: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      });
      await expect(tracker.startWebcam(mockVideo, { width: 3840 })).rejects.toThrow("Camera access was denied");
    });
  });

  // =========================================================================
  // FOCUS AREA 2: Rolling Buffer Edge Cases
  // =========================================================================
  describe("Focus Area 2: Rolling Buffer Edge Cases", () => {
    function generateSyntheticPoseFrame(timeMs: number, yOffset = 0): PoseFrame {
      const landmarks: Landmark[] = Array.from({ length: 33 }, (_, i) => ({
        x: 0.5 + Math.sin(timeMs / 500 + i) * 0.05,
        y: 0.5 + Math.cos(timeMs / 500 + i) * 0.05 + yOffset,
        z: 0.0,
        visibility: 0.9,
      }));
      return { timeMs, landmarks };
    }

    it("2.1 Empty rolling buffer (0 frames) returns empty array without throwing", () => {
      const tracker = new PoseTracker(30, 900);
      expect(tracker.getRollingFrames()).toEqual([]);
      tracker.clearBuffer();
      expect(tracker.getRollingFrames()).toEqual([]);
    });

    it("2.2 Single frame in buffer is stored and retrieved correctly", () => {
      const tracker = new PoseTracker(30, 900);
      const frame = generateSyntheticPoseFrame(1000);
      (tracker as unknown as { addFrameToBuffer: (f: PoseFrame) => void }).addFrameToBuffer(frame);

      const frames = tracker.getRollingFrames();
      expect(frames).toHaveLength(1);
      expect(frames[0].timeMs).toBe(1000);
    });

    it("2.3 Buffer holds exactly 900 frames without overflow when capped at 900", () => {
      const maxFrames = 900;
      const tracker = new PoseTracker(30, maxFrames);

      for (let i = 0; i < 900; i++) {
        (tracker as unknown as { addFrameToBuffer: (f: PoseFrame) => void }).addFrameToBuffer(
          generateSyntheticPoseFrame(1000 + i * 33),
        );
      }

      const frames = tracker.getRollingFrames();
      expect(frames).toHaveLength(900);
      expect(frames[0].timeMs).toBe(1000);
      expect(frames[899].timeMs).toBe(1000 + 899 * 33);
    });

    it("2.4 Caps buffer size at 900 and performs FIFO eviction on 1000+ frames", () => {
      const maxFrames = 900;
      const tracker = new PoseTracker(30, maxFrames);
      const totalFramesPushed = 1250;

      for (let i = 0; i < totalFramesPushed; i++) {
        (tracker as unknown as { addFrameToBuffer: (f: PoseFrame) => void }).addFrameToBuffer(
          generateSyntheticPoseFrame(1000 + i * 33.33),
        );
      }

      const frames = tracker.getRollingFrames();
      expect(frames).toHaveLength(900);

      // Oldest 350 frames (index 0 to 349) should have been evicted
      const expectedFirstFrameTime = 1000 + 350 * 33.33;
      const expectedLastFrameTime = 1000 + 1249 * 33.33;

      expect(frames[0].timeMs).toBeCloseTo(expectedFirstFrameTime, 1);
      expect(frames[frames.length - 1].timeMs).toBeCloseTo(expectedLastFrameTime, 1);

      // Verify strictly monotonic timestamps in buffer after eviction
      for (let k = 1; k < frames.length; k++) {
        expect(frames[k].timeMs).toBeGreaterThan(frames[k - 1].timeMs);
      }
    });

    it("2.5 getRollingFrames returns defensive copy preventing external state mutation", () => {
      const tracker = new PoseTracker(30, 900);
      (tracker as unknown as { addFrameToBuffer: (f: PoseFrame) => void }).addFrameToBuffer(
        generateSyntheticPoseFrame(1000),
      );

      const framesCopy = tracker.getRollingFrames();
      framesCopy.pop();

      expect(tracker.getRollingFrames()).toHaveLength(1);
    });
  });

  // =========================================================================
  // FOCUS AREA 3: Freeze & Analyze Resampling & Kinematic Pipeline Safety
  // =========================================================================
  describe("Focus Area 3: Freeze & Analyze Resampling & Kinematic Pipeline Safety", () => {
    function generateWalkingPoseSequence(
      durationSec: number,
      fps: number,
      gapIntervals: { startSec: number; endSec: number }[] = [],
    ): PoseFrame[] {
      const frames: PoseFrame[] = [];
      const totalFrames = Math.floor(durationSec * fps);
      const dtMs = 1000 / fps;

      let currentTimeMs = 0;

      for (let f = 0; f < totalFrames; f++) {
        const timeSec = currentTimeMs / 1000;

        // Check if inside a drop/gap interval
        const inGap = gapIntervals.some((g) => timeSec >= g.startSec && timeSec < g.endSec);

        if (!inGap) {
          const stridePhase = (timeSec * 1.8 * Math.PI * 2) % (Math.PI * 2);
          const leftAnkleY = 0.8 + Math.sin(stridePhase) * 0.08;
          const rightAnkleY = 0.8 + Math.sin(stridePhase + Math.PI) * 0.08;

          const landmarks: Landmark[] = Array.from({ length: 33 }, (_, i) => {
            if (i === 27 || i === 29 || i === 31) {
              // Left ankle / heel / toe
              return { x: 0.45, y: leftAnkleY, z: 0.0, visibility: 0.95 };
            }
            if (i === 28 || i === 30 || i === 32) {
              // Right ankle / heel / toe
              return { x: 0.55, y: rightAnkleY, z: 0.0, visibility: 0.95 };
            }
            if (i === 23 || i === 25) {
              // Left hip / knee
              return { x: 0.45, y: 0.5 + i * 0.01, z: 0.0, visibility: 0.95 };
            }
            if (i === 24 || i === 26) {
              // Right hip / knee
              return { x: 0.55, y: 0.5 + i * 0.01, z: 0.0, visibility: 0.95 };
            }
            if (i === 11 || i === 12) {
              // Shoulders
              return { x: 0.45 + (i - 11) * 0.1, y: 0.25, z: 0.0, visibility: 0.95 };
            }
            return { x: 0.5, y: 0.5, z: 0.0, visibility: 0.9 };
          });

          frames.push({ timeMs: currentTimeMs, landmarks });
        }

        currentTimeMs += dtMs;
      }

      return frames;
    }

    function assertNoNaNOrInfinity(obj: unknown, path = ""): void {
      if (typeof obj === "number") {
        expect(Number.isNaN(obj)).toBe(false);
        expect(Number.isFinite(obj)).toBe(true);
      } else if (Array.isArray(obj)) {
        obj.forEach((item, idx) => assertNoNaNOrInfinity(item, `${path}[${idx}]`));
      } else if (obj !== null && typeof obj === "object") {
        Object.entries(obj as Record<string, unknown>).forEach(([key, val]) => {
          if (typeof val === "string" || typeof val === "boolean" || val === undefined) return;
          assertNoNaNOrInfinity(val, path ? `${path}.${key}` : key);
        });
      }
    }

    it("3.1 Resamples webcam pose sequence with dropped frame time gaps cleanly", () => {
      const rawGappyFrames = generateWalkingPoseSequence(10, 30, [
        { startSec: 2.0, endSec: 3.5 },
        { startSec: 6.0, endSec: 8.0 },
      ]);

      expect(rawGappyFrames.length).toBeLessThan(300);

      const resampled = resamplePoseFrames(rawGappyFrames, 30.0);

      expect(resampled.length).toBeGreaterThan(250);
      const targetDt = 1000 / 30.0;
      for (let i = 1; i < resampled.length; i++) {
        const dt = resampled[i].timeMs - resampled[i - 1].timeMs;
        expect(dt).toBeCloseTo(targetDt, 2);
      }
    });

    it("3.2 Full kinematic analysis pipeline on resampled gappy webcam stream yields ZERO NaN/Infinity values", () => {
      const rawGappyFrames = generateWalkingPoseSequence(12, 30, [
        { startSec: 3.0, endSec: 4.5 },
        { startSec: 8.0, endSec: 9.2 },
      ]);

      const uniformFrames = resamplePoseFrames(rawGappyFrames, 30.0);

      // 1. Compute Gait Metrics
      const metrics = computeGaitMetrics(uniformFrames);
      assertNoNaNOrInfinity(metrics, "metrics");

      // 2. Compute Joint Angle Analysis
      const angleAnalysis = computeGaitAngleAnalysis(
        uniformFrames,
        metrics.stepEvents || [],
        metrics.viewAngle || "unknown",
      );
      assertNoNaNOrInfinity(angleAnalysis, "angleAnalysis");

      // 3. Build Educated Guesses
      const guesses = buildEducatedGuesses(metrics, { taskMode: "single" });
      assertNoNaNOrInfinity(guesses, "guesses");

      expect(metrics.cadenceSpm).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      expect(metrics.stepTimeCV).toBeGreaterThanOrEqual(0);
      expect(metrics.stepTimeCV).toBeGreaterThanOrEqual(0);
    });

    it("3.3 Handles frames with low-confidence / zero-visibility landmarks without NaN leakage", () => {
      const frames = generateWalkingPoseSequence(8, 30);

      frames.forEach((frame, idx) => {
        if (idx % 5 === 0) {
          frame.landmarks.forEach((lm) => {
            lm.visibility = 0.05;
          });
        }
      });

      const resampled = resamplePoseFrames(frames, 30.0);
      const metrics = computeGaitMetrics(resampled);
      assertNoNaNOrInfinity(metrics, "metrics_with_low_confidence");

      const angleAnalysis = computeGaitAngleAnalysis(
        resampled,
        metrics.stepEvents || [],
        metrics.viewAngle || "unknown",
      );
      assertNoNaNOrInfinity(angleAnalysis, "angleAnalysis_with_low_confidence");
    });
  });

  // =========================================================================
  // UI VERIFICATION: GaitApp Permission Error Card & Fallback Options
  // =========================================================================
  describe("UI Verification: GaitApp Permission Error Card & Fallback Options", () => {
    it("renders GaitApp Stage 1 with input mode switcher and webcam station options", () => {
      const html = renderToStaticMarkup(<GaitApp />);
      expect(html).toContain("Live WebCam Mode");
      expect(html).toContain("Video File Upload");
    });
  });
});
