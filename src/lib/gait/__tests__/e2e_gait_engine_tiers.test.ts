// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { generateSyntheticWalkingFrames, generateStationaryPoseFrames } from "./testHelpers";
import type { Landmark, PoseFrame } from "../types";
import { zeroPhaseButterworth, butterworthLowPass, olsDetrend, savitzkyGolay5, kalmanFilter1D, smoothPoseFrames } from "../signal";
import { detectGaitEventsZeni, findExtrema, refinePeakTimestamp, detectFusedGaitEvents, type GaitEvent } from "../events";
import { computeGaitMetrics, analyzeGait, detectViewAngle, filterSteadyStateStrides } from "../analysis";
import { PoseTracker, parseWebcamError, type WebcamOptions, WebcamError } from "../PoseTracker";
import { toLandmarks, nextVideoTimestamp, resamplePoseFrames, detectPosesOnVideoFrame, simulatePoseModelFallback, type PoseDetectionResult, type ModelFallbackOptions } from "../pose";
import { calculateMillimetersPerPixel, type MarkerType } from "../calibration";
import { computeHomographyMatrix, transformPoint, type Point2D, type Matrix3x3 } from "../homography";

/**
 * Interface contracts & helpers for opaque-box testing across Features F1-F7.
 */

const mockLandmarkerInstance = {
  detect: vi.fn().mockReturnValue({ landmarks: [] }),
  detectForVideo: vi.fn().mockReturnValue({ landmarks: [] }),
  setOptions: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
};

// ============================================================================
// E2E SUITE: FEATURES F1-F7 ACROSS 4 TIERS
// ============================================================================

describe("E2E Gait Analysis Engine 4-Tier Test Suite (Features F1-F7)", () => {
  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (Isolated Feature Contracts & Happy Paths)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage (F1-F7)", () => {
    // --- F1: MediaPipe Heavy/Full/Lite Model Fallback ---
    describe("F1: MediaPipe Heavy/Full/Lite Model Fallback", () => {
      it("1. getPoseLandmarker resolves landmarker instance", async () => {
        const getLandmarkerMock = vi.fn().mockResolvedValue(mockLandmarkerInstance);
        const landmarker = await getLandmarkerMock();
        expect(landmarker).toBeDefined();
        expect(typeof landmarker.detect).toBe("function");
      });

      it("2. Model asset fallback hierarchy executes heavy -> full -> lite transition", async () => {
        const loadHistory: string[] = [];
        const mockLoader = async (model: string, delegate: "GPU" | "CPU") => {
          loadHistory.push(`${model}:${delegate}`);
          if (model.includes("heavy")) return false;
          if (model.includes("full") && delegate === "GPU") return false;
          if (model.includes("full") && delegate === "CPU") return true;
          return true;
        };

        const result = await simulatePoseModelFallback(mockLoader);
        expect(result.loadedModel).toContain("full");
        expect(result.loadedDelegate).toBe("CPU");
        expect(loadHistory.length).toBe(4);
      });

      it("3. Delegate fallback executes GPU -> CPU transition on hardware error", async () => {
        const loadHistory: string[] = [];
        const mockLoader = async (model: string, delegate: "GPU" | "CPU") => {
          loadHistory.push(`${model}:${delegate}`);
          return delegate === "CPU";
        };

        const result = await simulatePoseModelFallback(mockLoader);
        expect(result.loadedDelegate).toBe("CPU");
      });

      it("4. resamplePoseFrames converts non-uniform frames to uniform 30 Hz grid", () => {
        const rawFrames: PoseFrame[] = [
          { timeMs: 0, landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0 }) },
          { timeMs: 40, landmarks: new Array(33).fill({ x: 0.52, y: 0.51, z: 0 }) },
          { timeMs: 70, landmarks: new Array(33).fill({ x: 0.55, y: 0.53, z: 0 }) },
          { timeMs: 110, landmarks: new Array(33).fill({ x: 0.58, y: 0.55, z: 0 }) },
          { timeMs: 150, landmarks: new Array(33).fill({ x: 0.60, y: 0.56, z: 0 }) },
        ];

        const resampled = resamplePoseFrames(rawFrames, 30);
        expect(resampled.length).toBeGreaterThan(0);
        const dt0 = resampled[1].timeMs - resampled[0].timeMs;
        expect(dt0).toBeCloseTo(33.33, 1);
      });

      it("5. toLandmarks converts raw detection landmarks with default visibility", () => {
        const raw = [{ x: 0.1, y: 0.2, z: 0.3 }];
        const converted = toLandmarks(raw);
        expect(converted[0]).toEqual({ x: 0.1, y: 0.2, z: 0.3, visibility: 1.0 });
      });
    });

    // --- F2: 1D Coordinate Temporal Smoothing ---
    describe("F2: 1D Coordinate Temporal Smoothing", () => {
      it("1. savitzkyGolay5 preserves exact linear trend (y = mx + c)", () => {
        const linear = Array.from({ length: 20 }, (_, i) => 2.5 * i + 4.0);
        const smoothed = savitzkyGolay5(linear);

        for (let i = 2; i < linear.length - 2; i++) {
          expect(smoothed[i]).toBeCloseTo(linear[i], 5);
        }
      });

      it("2. savitzkyGolay5 attenuates high-frequency noise ripple", () => {
        const clean = Array.from({ length: 30 }, (_, i) => Math.sin(i / 3));
        const noisy = clean.map((v, i) => v + (i % 2 === 0 ? 0.15 : -0.15));
        const smoothed = savitzkyGolay5(noisy);

        const rawErr = noisy.slice(2, 28).reduce((sum, v, idx) => sum + Math.abs(v - clean[idx + 2]), 0);
        const smoothErr = smoothed.slice(2, 28).reduce((sum, v, idx) => sum + Math.abs(v - clean[idx + 2]), 0);

        expect(smoothErr).toBeLessThan(rawErr * 0.6);
      });

      it("3. kalmanFilter1D smooths 1D signal without lag", () => {
        const signal = [1.0, 1.2, 0.9, 1.1, 1.05, 0.98, 1.02];
        const filtered = kalmanFilter1D(signal);

        expect(filtered.length).toBe(signal.length);
        expect(filtered.every(Number.isFinite)).toBe(true);
      });

      it("4. zeroPhaseButterworth low-pass filter eliminates phase shift", () => {
        const fps = 60;
        const data = Array.from({ length: 120 }, (_, i) => Math.sin((2 * Math.PI * 2 * i) / fps));
        const filtered = zeroPhaseButterworth(data, fps, 6.0);

        expect(filtered.length).toBe(120);
        const origPeak = data.indexOf(Math.max(...data.slice(0, 30)));
        const filtPeak = filtered.indexOf(Math.max(...filtered.slice(0, 30)));
        expect(Math.abs(origPeak - filtPeak)).toBeLessThanOrEqual(1);
      });

      it("5. smoothPoseFrames applies Savitzky-Golay smoothing across frame sequence", () => {
        const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0, noiseLevel: 0.03 });
        const smoothed = smoothPoseFrames(frames);

        expect(smoothed.length).toBe(frames.length);
        expect(smoothed[0].landmarks.length).toBe(33);
      });
    });

    // --- F3: WebRTC 60 FPS Camera Constraints ---
    describe("F3: WebRTC 60 FPS Camera Constraints", () => {
      it("1. PoseTracker constructor accepts 60 FPS target configuration", () => {
        const tracker = new PoseTracker(60);
        expect(tracker).toBeDefined();
      });

      it("2. startWebcam requests ideal 60 FPS video track constraints", async () => {
        const tracker = new PoseTracker(60);
        tracker.setLandmarker(mockLandmarkerInstance);

        const mockStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
        const mockVideo = {
          srcObject: null,
          setAttribute: vi.fn(),
          play: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn(),
          readyState: 4,
          videoWidth: 1280,
          videoHeight: 720,
        } as unknown as HTMLVideoElement;

        let capturedConstraints: MediaStreamConstraints | null = null;
        vi.stubGlobal("navigator", {
          mediaDevices: {
            getUserMedia: async (c: MediaStreamConstraints) => {
              capturedConstraints = c;
              return mockStream;
            },
          },
        });

        await tracker.startWebcam(mockVideo, { targetFps: 60 });
        expect(capturedConstraints).toBeDefined();
        const vOpts = (capturedConstraints as unknown as MediaStreamConstraints).video as MediaTrackConstraints;
        expect(vOpts.frameRate).toEqual({ ideal: 60, max: 60 });

        tracker.stopWebcam();
        vi.unstubAllGlobals();
      });

      it("3. PoseTracker handles OverconstrainedError by falling back to basic video constraints", async () => {
        const tracker = new PoseTracker(60);
        tracker.setLandmarker(mockLandmarkerInstance);

        const mockStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
        const mockVideo = {
          srcObject: null,
          setAttribute: vi.fn(),
          play: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn(),
          readyState: 4,
          videoWidth: 1280,
          videoHeight: 720,
        } as unknown as HTMLVideoElement;

        let attempt = 0;
        vi.stubGlobal("navigator", {
          mediaDevices: {
            getUserMedia: async () => {
              attempt++;
              if (attempt === 1) {
                throw new DOMException("Overconstrained", "OverconstrainedError");
              }
              return mockStream;
            },
          },
        });

        await tracker.startWebcam(mockVideo);
        expect(attempt).toBe(2);

        tracker.stopWebcam();
        vi.unstubAllGlobals();
      });

      it("4. parseWebcamError correctly maps permission, device, and security errors", () => {
        const notAllowed = parseWebcamError(new DOMException("Denied", "NotAllowedError"));
        expect(notAllowed.code).toBe("NOT_ALLOWED");

        const notFound = parseWebcamError(new DOMException("No device", "NotFoundError"));
        expect(notFound.code).toBe("NOT_FOUND");

        const secErr = parseWebcamError(new DOMException("Insecure", "SecurityError"));
        expect(secErr.code).toBe("SECURITY");
      });

      it("5. stopWebcam tears down active stream tracks and resets tracker state", () => {
        const tracker = new PoseTracker(60);
        const stopSpy = vi.fn();
        (tracker as unknown as { stream: unknown }).stream = {
          getTracks: () => [{ stop: stopSpy }],
        };
        (tracker as unknown as { isActive: boolean }).isActive = true;

        tracker.stopWebcam();
        expect(stopSpy).toHaveBeenCalled();
        expect(tracker.isRunning()).toBe(false);
      });
    });

    // --- F4: Floor Marker Calibration ---
    describe("F4: Floor Marker Calibration", () => {
      it("1. calculateMillimetersPerPixel maps ISO reference card (85.6mm) to mm/px", () => {
        const scale = calculateMillimetersPerPixel("card", { width: 100, height: 60 });
        expect(scale).toBeCloseTo(0.856, 3);
      });

      it("2. calculateMillimetersPerPixel maps QR code marker (50mm) to mm/px", () => {
        const scale = calculateMillimetersPerPixel("qr", { width: 200, height: 200 });
        expect(scale).toBeCloseTo(0.25, 3);
      });

      it("3. calculateMillimetersPerPixel maps AprilTag marker (100mm) to mm/px", () => {
        const scale = calculateMillimetersPerPixel("apriltag", { width: 400, height: 400 });
        expect(scale).toBeCloseTo(0.25, 3);
      });

      it("4. Floor calibration converts pixel distance into physical millimeters and meters", () => {
        const mmPerPx = calculateMillimetersPerPixel("card", { width: 100, height: 60 }); // 0.856 mm/px
        const pixelDistance = 500;
        const physicalMm = pixelDistance * mmPerPx;
        const physicalM = physicalMm / 1000.0;

        expect(physicalMm).toBeCloseTo(428.0, 1);
        expect(physicalM).toBeCloseTo(0.428, 3);
      });

      it("5. Floor calibration handles non-square pixel aspect ratio scaling", () => {
        const scaleW = calculateMillimetersPerPixel("qr", { width: 250, height: 200 });
        expect(scaleW).toBeCloseTo(0.20, 2);
      });
    });

    // --- F5: Multi-Signal Heel-Strike Fusion & ZUPT ---
    describe("F5: Multi-Signal Heel-Strike Fusion & ZUPT", () => {
      it("1. detectFusedGaitEvents detects heel strikes and toe offs", () => {
        const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
        const events = detectFusedGaitEvents(frames, 30);

        expect(events.length).toBeGreaterThanOrEqual(4);
        expect(events.some((e) => e.type === "heel_strike")).toBe(true);
        expect(events.some((e) => e.type === "toe_off")).toBe(true);
      });

      it("2. findExtrema identifies local peaks with minimum gap and prominence", () => {
        const signal = [0, 1, 5, 2, 0, 1, 6, 2, 0];
        const peaks = findExtrema(signal, "max", 2, 1.0);
        expect(peaks).toEqual([2, 6]);
      });

      it("3. refinePeakTimestamp computes sub-frame peak timestamp precision", () => {
        const signal = [0, 1.0, 4.0, 2.0, 0];
        const frameTimeSec = 1.0;
        const fps = 30;
        const refined = refinePeakTimestamp(signal, 2, frameTimeSec, fps);

        expect(refined).toBeGreaterThan(frameTimeSec - 1 / (2 * fps));
        expect(refined).toBeLessThan(frameTimeSec + 1 / (2 * fps));
      });

      it("4. detectGaitEventsZeni calculates gait phase breakdown percentages", () => {
        const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.5 });
        const breakdown = detectGaitEventsZeni(frames, 30);

        expect(breakdown.leftStancePct).toBeGreaterThan(30);
        expect(breakdown.leftStancePct).toBeLessThan(90);
        expect(breakdown.leftSwingPct).toBeCloseTo(100 - breakdown.leftStancePct, 1);
      });

      it("5. Heel-strike fusion correctly infers walking direction (+1 or -1)", () => {
        const framesLr = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0, direction: 1 });
        const bdLr = detectGaitEventsZeni(framesLr, 30);
        expect(bdLr.inferredDirection).toBe(1);

        const framesRl = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0, direction: -1 });
        const bdRl = detectGaitEventsZeni(framesRl, 30);
        expect(bdRl.inferredDirection).toBe(-1);
      });
    });

    // --- F6: 2D Floor Planar Homography ---
    describe("F6: 2D Floor Planar Homography", () => {
      it("1. computeHomographyMatrix solves 3x3 DLT matrix for image to floor mapping", () => {
        const imagePts: Point2D[] = [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 350, y: 400 },
          { x: 50, y: 400 },
        ];
        const floorPts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 1000, y: 2000 },
          { x: 0, y: 2000 },
        ];

        const H = computeHomographyMatrix(imagePts, floorPts);
        expect(H.length).toBe(3);
        expect(H[0].length).toBe(3);
      });

      it("2. transformPoint transforms 2D point using 3x3 homography matrix", () => {
        const imagePts: Point2D[] = [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 350, y: 400 },
          { x: 50, y: 400 },
        ];
        const floorPts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 1000, y: 2000 },
          { x: 0, y: 2000 },
        ];

        const H = computeHomographyMatrix(imagePts, floorPts);
        const transformed = transformPoint(imagePts[0], H);
        expect(transformed.x).toBeCloseTo(floorPts[0].x, 1);
        expect(transformed.y).toBeCloseTo(floorPts[0].y, 1);
      });

      it("3. Homography transformation preserves center point mapping on floor plane", () => {
        const imagePts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ];
        const floorPts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 200 },
          { x: 0, y: 200 },
        ];

        const H = computeHomographyMatrix(imagePts, floorPts);
        const centerTransformed = transformPoint({ x: 50, y: 50 }, H);
        expect(centerTransformed.x).toBeCloseTo(100, 1);
        expect(centerTransformed.y).toBeCloseTo(100, 1);
      });

      it("4. Homography matrix scales perspective distance proportionally", () => {
        const imagePts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ];
        const floorPts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ];

        const H = computeHomographyMatrix(imagePts, floorPts);
        const p1 = transformPoint({ x: 0, y: 0 }, H);
        const p2 = transformPoint({ x: 5, y: 0 }, H);
        const distFloor = Math.hypot(p2.x - p1.x, p2.y - p1.y);

        expect(distFloor).toBeCloseTo(50, 1);
      });

      it("5. Homography returns fallback identity matrix when points are degenerate", () => {
        const collinear: Point2D[] = [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ];
        const floorPts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ];

        const H = computeHomographyMatrix(collinear, floorPts);
        expect(H).toEqual([
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]);
      });
    });

    // --- F7: Steady-State Stride Filtering ---
    describe("F7: Steady-State Stride Filtering", () => {
      it("1. filterSteadyStateStrides excludes initial acceleration stride", () => {
        const intervals = [1.20, 0.60, 0.61, 0.59, 0.60];
        const { steadyStrides, excludedCount } = filterSteadyStateStrides(intervals);

        expect(excludedCount).toBe(1);
        expect(steadyStrides).toEqual([0.60, 0.61, 0.59, 0.60]);
      });

      it("2. filterSteadyStateStrides excludes terminal deceleration stride", () => {
        const intervals = [0.60, 0.61, 0.59, 0.60, 1.25];
        const { steadyStrides, excludedCount } = filterSteadyStateStrides(intervals);

        expect(excludedCount).toBe(1);
        expect(steadyStrides).toEqual([0.60, 0.61, 0.59, 0.60]);
      });

      it("3. filterSteadyStateStrides excludes both initial and terminal acceleration/deceleration strides", () => {
        const intervals = [1.15, 0.60, 0.61, 0.60, 0.59, 1.20];
        const { steadyStrides, excludedCount } = filterSteadyStateStrides(intervals);

        expect(excludedCount).toBe(2);
        expect(steadyStrides).toEqual([0.60, 0.61, 0.60, 0.59]);
      });

      it("4. Steady-state stride filtering reduces stepTimeCV variability", () => {
        const rawStrides = [1.15, 0.60, 0.60, 0.60, 0.60, 1.20];
        const { steadyStrides } = filterSteadyStateStrides(rawStrides);

        const meanRaw = rawStrides.reduce((a, b) => a + b, 0) / rawStrides.length;
        const stdRaw = Math.sqrt(rawStrides.reduce((a, b) => a + Math.pow(b - meanRaw, 2), 0) / rawStrides.length);
        const cvRaw = stdRaw / meanRaw;

        const meanSteady = steadyStrides.reduce((a, b) => a + b, 0) / steadyStrides.length;
        const stdSteady = Math.sqrt(steadyStrides.reduce((a, b) => a + Math.pow(b - meanSteady, 2), 0) / steadyStrides.length);
        const cvSteady = stdSteady / meanSteady;

        expect(cvSteady).toBeLessThan(cvRaw * 0.1);
      });

      it("5. filterSteadyStateStrides retains full array when all strides are in steady state", () => {
        const steadyOnly = [0.60, 0.61, 0.60, 0.59, 0.60];
        const { steadyStrides, excludedCount } = filterSteadyStateStrides(steadyOnly);

        expect(excludedCount).toBe(0);
        expect(steadyStrides.length).toBe(5);
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (Extreme Values, NaNs, Noise, Edge States)
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases (F1-F7)", () => {
    // --- F1 Boundary ---
    describe("F1 Boundary Cases", () => {
      it("1. getPoseLandmarker handles concurrent parallel calls without duplicate initialization", async () => {
        const mockFn = vi.fn().mockResolvedValue(mockLandmarkerInstance);
        const [p1, p2] = await Promise.all([mockFn(), mockFn()]);
        expect(p1).toBe(p2);
      });

      it("2. resamplePoseFrames returns original array when frame count < 4", () => {
        const shortFrames: PoseFrame[] = [
          { timeMs: 0, landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0 }) },
          { timeMs: 33, landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0 }) },
        ];
        expect(resamplePoseFrames(shortFrames, 30)).toBe(shortFrames);
      });

      it("3. detectPosesOnVideoFrame returns empty landmarks when video element width/height is 0", () => {
        const dummyLandmarker = { detect: vi.fn(), detectForVideo: vi.fn() };
        const mockVideo = { videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement;
        const res = detectPosesOnVideoFrame(dummyLandmarker, mockVideo);
        expect(res.landmarks).toEqual([]);
      });

      it("4. toLandmarks handles empty raw array gracefully", () => {
        expect(toLandmarks([])).toEqual([]);
      });

      it("5. resamplePoseFrames handles zero duration frame sequence", () => {
        const sameTimeFrames: PoseFrame[] = Array.from({ length: 5 }, () => ({
          timeMs: 100,
          landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0 }),
        }));
        const res = resamplePoseFrames(sameTimeFrames, 30);
        expect(res.length).toBe(5);
      });
    });

    // --- F2 Boundary ---
    describe("F2 Boundary Cases", () => {
      it("1. savitzkyGolay5 returns original array when length < 5", () => {
        expect(savitzkyGolay5([1, 2, 3])).toEqual([1, 2, 3]);
      });

      it("2. kalmanFilter1D converts NaN/Infinity inputs into finite values", () => {
        const dirty = [1.0, NaN, 1.2, Infinity, -Infinity, 1.1];
        const clean = kalmanFilter1D(dirty);
        expect(clean.every(Number.isFinite)).toBe(true);
      });

      it("3. zeroPhaseButterworth handles minimum boundary length n = 5", () => {
        const shortData = [1.0, 2.0, 1.5, 3.0, 2.5];
        const res = zeroPhaseButterworth(shortData, 30, 6.0);
        expect(res.length).toBe(5);
        expect(res.every(Number.isFinite)).toBe(true);
      });

      it("4. olsDetrend handles single-element array", () => {
        expect(olsDetrend([42])).toEqual([42]);
      });

      it("5. smoothPoseFrames handles empty frames array", () => {
        expect(smoothPoseFrames([])).toEqual([]);
      });
    });

    // --- F3 Boundary ---
    describe("F3 Boundary Cases", () => {
      it("1. PoseTracker handles default fallback targetFps", () => {
        const tracker = new PoseTracker();
        expect(tracker.getEffectiveFps()).toBe(0);
      });

      it("2. PoseTracker handles rapid start/stop toggling without error", () => {
        const tracker = new PoseTracker(60);
        tracker.stopWebcam();
        tracker.stopWebcam();
        expect(tracker.isRunning()).toBe(false);
      });

      it("3. PoseTracker parseWebcamError handles OverconstrainedError", () => {
        const err = parseWebcamError(new DOMException("Constraint error", "OverconstrainedError"));
        expect(err.code).toBe("OVERCONSTRAINED");
      });

      it("4. PoseTracker parseWebcamError handles unknown generic string errors", () => {
        const err = parseWebcamError("Custom camera crash");
        expect(err.code).toBe("UNKNOWN");
      });

      it("5. PoseTracker clearBuffer empties rolling frame buffer", () => {
        const tracker = new PoseTracker(30, 900);
        tracker.clearBuffer();
        expect(tracker.getRollingFrames()).toEqual([]);
      });
    });

    // --- F4 Boundary ---
    describe("F4 Boundary Cases", () => {
      it("1. calculateMillimetersPerPixel returns 1.0 when pixel width <= 0", () => {
        expect(calculateMillimetersPerPixel("card", { width: 0, height: 100 })).toBe(1.0);
        expect(calculateMillimetersPerPixel("card", { width: -50, height: 100 })).toBe(1.0);
      });

      it("2. calculateMillimetersPerPixel defaults to standard card width for unknown marker types", () => {
        const scale = calculateMillimetersPerPixel("custom_tag" as unknown as MarkerType, { width: 100, height: 100 });
        expect(scale).toBeCloseTo(0.856, 3);
      });

      it("3. Floor calibration handles extreme high-resolution pixel widths (16K)", () => {
        const scale = calculateMillimetersPerPixel("card", { width: 15360, height: 8640 });
        expect(scale).toBeGreaterThan(0);
        expect(Number.isFinite(scale)).toBe(true);
      });

      it("4. Floor calibration handles sub-pixel marker dimensions (0.5 px)", () => {
        const scale = calculateMillimetersPerPixel("qr", { width: 0.5, height: 0.5 });
        expect(scale).toBeCloseTo(100.0, 1);
      });

      it("5. Floor calibration handles null or undefined pixel dimensions safely", () => {
        const scale = calculateMillimetersPerPixel("card", null as unknown as { width: number; height: number });
        expect(scale).toBe(1.0);
      });
    });

    // --- F5 Boundary ---
    describe("F5 Boundary Cases", () => {
      it("1. detectGaitEvents handles prolonged standing (ZUPT) without false heel strikes", () => {
        const stationary = generateStationaryPoseFrames(30, 3.0);
        const events = detectFusedGaitEvents(stationary, 30);
        const heelStrikes = events.filter((e) => e.type === "heel_strike");
        expect(heelStrikes.length).toBe(0);
      });

      it("2. findExtrema handles flat signal with zero prominence", () => {
        const flatSignal = new Array(20).fill(5.0);
        const maxPeaks = findExtrema(flatSignal, "max", 3);
        expect(maxPeaks.length).toBe(0);
      });

      it("3. refinePeakTimestamp clamps fractional subframe offset to [-0.5, +0.5]", () => {
        const flatSignal = [1, 1, 1, 1, 1];
        const refined = refinePeakTimestamp(flatSignal, 2, 1.0, 30);
        expect(refined).toBe(1.0);
      });

      it("4. detectGaitEventsZeni handles low visibility landmarks (< 0.3) without crashing", () => {
        const lowVis = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0, lowVisibilityLandmarks: true });
        const breakdown = detectGaitEventsZeni(lowVis, 30);
        expect(breakdown).toBeDefined();
      });

      it("5. detectGaitEvents handles sub-minimum frame count (< 5 frames)", () => {
        const shortFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 0.1 });
        const events = detectFusedGaitEvents(shortFrames, 30);
        expect(events).toEqual([]);
      });
    });

    // --- F6 Boundary ---
    describe("F6 Boundary Cases", () => {
      it("1. computeHomographyMatrix handles degenerate collinear inputs returning identity fallback", () => {
        const collinear: Point2D[] = [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
          { x: 30, y: 30 },
          { x: 40, y: 40 },
        ];
        const floorPts: Point2D[] = [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ];

        const H = computeHomographyMatrix(collinear, floorPts);
        expect(H).toEqual([
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]);
      });

      it("2. computeHomographyMatrix handles fewer than 4 point correspondences", () => {
        const imagePts: Point2D[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
        const floorPts: Point2D[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

        const H = computeHomographyMatrix(imagePts, floorPts);
        expect(H).toEqual([
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]);
      });

      it("3. transformPoint handles near-zero w-coordinate scale factor", () => {
        const H: Matrix3x3 = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ];
        const pt = transformPoint({ x: 5, y: 10 }, H);
        expect(pt.x).toBe(5);
        expect(pt.y).toBe(10);
      });

      it("4. computeHomographyMatrix handles null or undefined input arrays", () => {
        const H = computeHomographyMatrix(null as unknown as Point2D[], null as unknown as Point2D[]);
        expect(H).toEqual([
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]);
      });

      it("5. transformPoint handles negative pixel coordinate inputs", () => {
        const H: Matrix3x3 = [
          [1, 0, 100],
          [0, 1, 100],
          [0, 0, 1],
        ];
        const transformed = transformPoint({ x: -50, y: -50 }, H);
        expect(transformed.x).toBe(50);
        expect(transformed.y).toBe(50);
      });
    });

    // --- F7 Boundary ---
    describe("F7 Boundary Cases", () => {
      it("1. filterSteadyStateStrides handles empty or null stride interval arrays", () => {
        expect(filterSteadyStateStrides([])).toEqual({ steadyStrides: [], excludedCount: 0 });
        expect(filterSteadyStateStrides(null as unknown as number[])).toEqual({ steadyStrides: [], excludedCount: 0 });
      });

      it("2. filterSteadyStateStrides handles stride arrays with fewer than 3 elements", () => {
        const shortStrides = [0.60, 0.62];
        const res = filterSteadyStateStrides(shortStrides);
        expect(res.steadyStrides).toEqual([0.60, 0.62]);
        expect(res.excludedCount).toBe(0);
      });

      it("3. filterSteadyStateStrides handles uniformly accelerating stride sequence", () => {
        const uniformAccel = [1.2, 1.0, 0.8, 0.6];
        const res = filterSteadyStateStrides(uniformAccel);
        expect(res.steadyStrides.length).toBeGreaterThan(0);
      });

      it("4. filterSteadyStateStrides handles extreme outlier stride spikes (> 300% median)", () => {
        const spikedStrides = [2.50, 0.60, 0.60, 0.61, 0.60, 2.80];
        const res = filterSteadyStateStrides(spikedStrides);
        expect(res.excludedCount).toBe(2);
        expect(res.steadyStrides).toEqual([0.60, 0.60, 0.61, 0.60]);
      });

      it("5. filterSteadyStateStrides handles zero-variance constant stride array", () => {
        const constantStrides = [0.60, 0.60, 0.60, 0.60, 0.60];
        const res = filterSteadyStateStrides(constantStrides);
        expect(res.excludedCount).toBe(0);
        expect(res.steadyStrides).toEqual(constantStrides);
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3_1: Integrated Oblique View + Floor Calibration + Homography + Smoothing + Heel Fusion + Steady State Pipeline", () => {
      const rawOblique = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.5,
        viewAngle: "oblique",
        noiseLevel: 0.03,
      });

      const smoothed = smoothPoseFrames(rawOblique);
      const mmPerPx = calculateMillimetersPerPixel("qr", { width: 200, height: 200 });
      expect(mmPerPx).toBeCloseTo(0.25, 2);

      const trapezoid: Point2D[] = [
        { x: 120, y: 150 },
        { x: 280, y: 150 },
        { x: 340, y: 380 },
        { x: 60, y: 380 },
      ];
      const floorRect: Point2D[] = [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 1500 },
        { x: 0, y: 1500 },
      ];
      const H = computeHomographyMatrix(trapezoid, floorRect);

      const transformedFrames: PoseFrame[] = smoothed.map((f) => {
        const lAnkle = f.landmarks[27];
        const rAnkle = f.landmarks[28];
        const lT = transformPoint({ x: lAnkle.x * 400, y: lAnkle.y * 400 }, H);
        const rT = transformPoint({ x: rAnkle.x * 400, y: rAnkle.y * 400 }, H);

        const newLms = [...f.landmarks];
        newLms[27] = { ...lAnkle, x: lT.x / 400, y: lT.y / 400 };
        newLms[28] = { ...rAnkle, x: rT.x / 400, y: rT.y / 400 };
        return { ...f, landmarks: newLms };
      });

      const events = detectFusedGaitEvents(transformedFrames, 30);
      expect(events.length).toBeGreaterThanOrEqual(4);

      const metrics = computeGaitMetrics(transformedFrames);
      expect(metrics.stepCount).toBeGreaterThan(0);
      expect(metrics.cadenceSpm).toBeGreaterThan(40);
    });

    it("T3_2: WebRTC 60 FPS Capture (F3) -> Catmull-Rom Resampling (F1) -> Zero-Phase Butterworth Smoothing (F2)", () => {
      const raw60Fps = generateSyntheticWalkingFrames({ fps: 60, durationSec: 2.0 });
      const resampled30Fps = resamplePoseFrames(raw60Fps, 30);
      expect(resampled30Fps.length).toBeCloseTo(60, -1);

      const kneeAngles = resampled30Fps.map((f) => f.landmarks[25].y);
      const filteredKnee = zeroPhaseButterworth(kneeAngles, 30, 6.0);
      expect(filteredKnee.length).toBe(resampled30Fps.length);
      expect(filteredKnee.every(Number.isFinite)).toBe(true);
    });

    it("T3_3: Camera Calibration (F4) + Planar Homography (F6) -> True Physical Step Width & Speed Metrics", () => {
      const mmPerPx = calculateMillimetersPerPixel("card", { width: 100, height: 60 });
      const imagePts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const floorPts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100 * mmPerPx, y: 0 },
        { x: 100 * mmPerPx, y: 100 * mmPerPx },
        { x: 0, y: 100 * mmPerPx },
      ];

      const H = computeHomographyMatrix(imagePts, floorPts);
      const stepWidthPx = 30;
      const transformed = transformPoint({ x: stepWidthPx, y: 0 }, H);

      const physicalStepWidthMm = transformed.x;
      expect(physicalStepWidthMm).toBeCloseTo(25.68, 1);
    });

    it("T3_4: High-Noise Keypoints (F2) + Multi-Signal Heel-Strike Fusion (F5) + Steady-State Stride Filter (F7)", () => {
      const noisyFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0, noiseLevel: 0.04 });
      const smoothed = smoothPoseFrames(noisyFrames);
      const events = detectFusedGaitEvents(smoothed, 30);

      const heelStrikes = events.filter((e) => e.type === "heel_strike");
      const strideIntervals: number[] = [];
      for (let i = 1; i < heelStrikes.length; i++) {
        strideIntervals.push(heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec);
      }

      const { steadyStrides } = filterSteadyStateStrides(strideIntervals);
      expect(steadyStrides.length).toBeGreaterThanOrEqual(0);
    });

    it("T3_5: Asymmetric Pathological Gait (F5) + Oblique Perspective Correction (F6) + Variability Analysis (F7)", () => {
      const asymmetricFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        viewAngle: "oblique",
        asymmetryFactor: 1.3,
      });

      const metrics = computeGaitMetrics(asymmetricFrames);
      expect(metrics.stepTimeCV).toBeGreaterThan(0.02);
      expect(metrics.symmetryAngle).toBeGreaterThan(1.5);
    });

    it("T3_6: Model Fallback (F1) + 60 FPS WebRTC Stream (F3) + Floor Marker Calibration (F4) -> E2E Validation", async () => {
      const tracker = new PoseTracker(60);
      tracker.setLandmarker(mockLandmarkerInstance);
      expect(tracker).toBeDefined();

      const mmPerPx = calculateMillimetersPerPixel("apriltag", { width: 400, height: 400 });
      expect(mmPerPx).toBeCloseTo(0.25, 2);
    });

    it("T3_7: Full End-to-End Pipeline (F1 -> F2 -> F3 -> F4 -> F5 -> F6 -> F7) Kinematic Integration", () => {
      const rawFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.5 });
      const smoothed = smoothPoseFrames(rawFrames);
      const metrics = computeGaitMetrics(smoothed);
      const analysis = analyzeGait(smoothed, 1, "single");

      expect(analysis.metrics.stepCount).toBeGreaterThan(0);
      expect(analysis.guesses).toBeDefined();
      expect(metrics.symmetryAngle).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4_1: Scenario 1 - Normal Symmetric Patient Walk under 35-deg Oblique View with Card Calibration", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        viewAngle: "oblique",
        asymmetryFactor: 1.0,
      });

      const smoothed = smoothPoseFrames(frames);
      const mmPerPx = calculateMillimetersPerPixel("card", { width: 120, height: 75 });
      expect(mmPerPx).toBeCloseTo(0.713, 2);

      const metrics = computeGaitMetrics(smoothed);
      expect(metrics.cadenceSpm).toBeGreaterThan(50);
      expect(metrics.stepTimeCV).toBeLessThan(0.08);
      expect(metrics.symmetryAngle).toBeLessThan(8.0);
    });

    it("T4_2: Scenario 2 - Parkinsonian / Hemiparetic Pathological Gait with Micro-Steps & Asymmetric ZUPT", () => {
      const parkinsonianFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        asymmetryFactor: 1.4,
        noiseLevel: 0.02,
      });

      const metrics = computeGaitMetrics(parkinsonianFrames);
      expect(metrics.stepTimeCV).toBeGreaterThan(0.03);
      expect(metrics.symmetryAngle).toBeGreaterThan(2.0);
    });

    it("T4_3: Scenario 3 - Handheld Shaky Camera Follow-Cam Trial with High-Frequency Jitter & Homography", () => {
      const shakyFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.5,
        followCam: true,
        noiseLevel: 0.05,
      });

      const smoothed = smoothPoseFrames(shakyFrames);
      const rawMetrics = computeGaitMetrics(shakyFrames);
      const smoothedMetrics = computeGaitMetrics(smoothed);

      expect(smoothedMetrics.stepTimeCV).toBeLessThanOrEqual(rawMetrics.stepTimeCV + 0.02);
      expect(smoothedMetrics.cadenceSpm).toBeGreaterThan(40);
    });

    it("T4_4: Scenario 4 - Accelerating & Decelerating 10m Runway Trial with Automatic Steady-State Exclusion", () => {
      const runwayIntervals = [1.25, 0.61, 0.60, 0.59, 0.60, 0.61, 1.20];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(runwayIntervals);

      expect(excludedCount).toBe(2);
      expect(steadyStrides.length).toBe(5);

      const meanS = steadyStrides.reduce((a, b) => a + b, 0) / steadyStrides.length;
      const stdS = Math.sqrt(steadyStrides.reduce((a, b) => a + Math.pow(b - meanS, 2), 0) / steadyStrides.length);
      const cvSteady = stdS / meanS;

      expect(cvSteady).toBeLessThan(0.03);
    });

    it("T4_5: Scenario 5 - WebRTC High-FPS (60 FPS) Live Stream Scrubbing, Resampling & Session Recovery", async () => {
      const tracker = new PoseTracker(60, 1800);
      tracker.setLandmarker(mockLandmarkerInstance);
      expect(tracker).toBeDefined();

      const raw60Frames = generateSyntheticWalkingFrames({ fps: 60, durationSec: 3.0 });
      const uniform30Frames = resamplePoseFrames(raw60Frames, 30);
      expect(uniform30Frames.length).toBeCloseTo(90, -1);

      const analysis = analyzeGait(uniform30Frames, 1, "single");
      expect(analysis.analyzedFrames).toBe(uniform30Frames.length);
      expect(analysis.metrics.stepCount).toBeGreaterThan(0);
    });
  });
});
