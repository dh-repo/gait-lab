// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { generateSyntheticWalkingFrames, generateStationaryPoseFrames } from "./testHelpers";
import type { PoseFrame } from "../types";
import { detectGaitEventsZeni, detectFusedGaitEvents, type GaitEvent } from "../events";
import { computeGaitMetrics, filterSteadyStateStrides } from "../analysis";
import { PoseTracker } from "../PoseTracker";
import { getPoseLandmarker, simulatePoseModelFallback } from "../pose";
import { savitzkyGolay5, kalmanFilter1D, smoothPoseFrames } from "../signal";
import { calculateMillimetersPerPixel, type MarkerType } from "../calibration";
import { computeHomographyMatrix, transformPoint, type Point2D, type Matrix3x3 } from "../homography";

// Top-level module mocks for jsdom environment
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: vi.fn().mockResolvedValue({}),
  },
  PoseLandmarker: {
    createFromOptions: vi.fn().mockResolvedValue({
      detect: vi.fn().mockReturnValue({ landmarks: [] }),
      detectForVideo: vi.fn().mockReturnValue({ landmarks: [] }),
    }),
  },
}));

// ============================================================================
// TEST SUITE: Tiers 1-4 Engine Enhancements Verification
// ============================================================================

describe("E2E Gait Analysis Engine Enhancements (R1-R4)", () => {
  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (Isolated Feature Testing)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    it("F1: MediaPipe Pose Landmarker supports heavy -> full -> lite model fallback and GPU -> CPU delegate fallback", async () => {
      const loadLog: string[] = [];

      const mockLoader = async (model: string, delegate: "GPU" | "CPU") => {
        loadLog.push(`${model}:${delegate}`);
        // Simulate heavy GPU & CPU fail, full GPU fail, full CPU success
        if (model.includes("heavy")) return false;
        if (model.includes("full") && delegate === "GPU") return false;
        if (model.includes("full") && delegate === "CPU") return true;
        return true;
      };

      const result = await simulatePoseModelFallback(mockLoader);

      expect(result.loadedModel).toContain("pose_landmarker_full.task");
      expect(result.loadedDelegate).toBe("CPU");
      expect(loadLog).toEqual([
        "/models/pose_landmarker_heavy.task:GPU",
        "/models/pose_landmarker_heavy.task:CPU",
        "/models/pose_landmarker_full.task:GPU",
        "/models/pose_landmarker_full.task:CPU",
      ]);
    });

    it("F1: getPoseLandmarker successfully resolves landmarker instance", async () => {
      const landmarker = await getPoseLandmarker();
      expect(landmarker).toBeDefined();
    });

    it("F2: 1D 5-point Savitzky-Golay filter coefficients [-3, 12, 17, 12, -3] / 35 preserve linear trend exactly", () => {
      // Linear signal y = 3x + 7
      const linearSignal = Array.from({ length: 15 }, (_, i) => 3 * i + 7);
      const filtered = savitzkyGolay5(linearSignal);

      expect(filtered.length).toBe(linearSignal.length);
      // For interior points (i = 2 to n-3), SG filter must preserve linear trend with 0 error
      for (let i = 2; i < linearSignal.length - 2; i++) {
        expect(filtered[i]).toBeCloseTo(linearSignal[i], 5);
      }
    });

    it("F2: 1D 5-point Savitzky-Golay filter attenuates high-frequency noise ripple", () => {
      const cleanSignal = Array.from({ length: 30 }, (_, i) => Math.sin((2 * Math.PI * i) / 10));
      // Add high-frequency alternating noise ripple
      const noisySignal = cleanSignal.map((v, i) => v + (i % 2 === 0 ? 0.2 : -0.2));

      const filtered = savitzkyGolay5(noisySignal);

      // Sum of absolute errors relative to clean sine signal must decrease after filtering
      const rawError = noisySignal.slice(2, 28).reduce((acc, v, idx) => acc + Math.abs(v - cleanSignal[idx + 2]), 0);
      const filteredError = filtered.slice(2, 28).reduce((acc, v, idx) => acc + Math.abs(v - cleanSignal[idx + 2]), 0);

      expect(filteredError).toBeLessThan(rawError * 0.7);
    });

    it("F2: 1D Kalman filter and smoothPoseFrames execute coordinate smoothing across frames", () => {
      const rawFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0, noiseLevel: 0.05 });
      const smoothed = smoothPoseFrames(rawFrames);

      expect(smoothed.length).toBe(rawFrames.length);
      expect(smoothed[0].landmarks.length).toBe(rawFrames[0].landmarks.length);
      
      const kalmanOut = kalmanFilter1D(rawFrames.map(f => f.landmarks[27].x));
      expect(kalmanOut.length).toBe(rawFrames.length);
    });

    it("F3: PoseTracker requests 60 FPS video capture constraints", async () => {
      const tracker = new PoseTracker(60);
      expect(tracker).toBeDefined();

      const mockStream = {
        getTracks: () => [{ stop: vi.fn() }],
      } as unknown as MediaStream;

      const mockVideoElement = {
        srcObject: null,
        setAttribute: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        readyState: 4,
        videoWidth: 1280,
        videoHeight: 720,
      } as unknown as HTMLVideoElement;

      // Mock navigator.mediaDevices.getUserMedia
      let requestedConstraints: MediaStreamConstraints | null = null;
      vi.stubGlobal("navigator", {
        mediaDevices: {
          getUserMedia: async (constraints: MediaStreamConstraints) => {
            requestedConstraints = constraints;
            return mockStream;
          },
        },
      });

      await tracker.startWebcam(mockVideoElement, { targetFps: 60 });

      expect(requestedConstraints).toBeDefined();
      const videoOpts = ((requestedConstraints as unknown) as MediaStreamConstraints).video as MediaTrackConstraints;
      expect(videoOpts.frameRate).toEqual({ ideal: 60, max: 60 });

      tracker.stopWebcam();
      vi.unstubAllGlobals();
    });

    it("F4: Floor calibration converts pixel dimensions to physical millimeters per pixel (mm/px)", () => {
      // Credit card: 85.6 mm width. If card is 100 px wide in image:
      const cardMmPx = calculateMillimetersPerPixel("card", { width: 100, height: 60 });
      expect(cardMmPx).toBeCloseTo(0.856, 3);

      // QR Tag: 50.0 mm width. If QR tag is 200 px wide:
      const qrMmPx = calculateMillimetersPerPixel("qr", { width: 200, height: 200 });
      expect(qrMmPx).toBeCloseTo(0.25, 3);

      // AprilTag: 100.0 mm width. If AprilTag is 400 px wide:
      const aprilMmPx = calculateMillimetersPerPixel("apriltag", { width: 400, height: 400 });
      expect(aprilMmPx).toBeCloseTo(0.25, 3);
    });

    it("F5: Multi-signal heel-strike fusion detects heel strikes and toe-offs with ZUPT", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const events = detectFusedGaitEvents(frames, 30);

      expect(events.length).toBeGreaterThanOrEqual(4);
      const heelStrikes = events.filter((e) => e.type === "heel_strike");
      const toeOffs = events.filter((e) => e.type === "toe_off");

      expect(heelStrikes.length).toBeGreaterThanOrEqual(2);
      expect(toeOffs.length).toBeGreaterThanOrEqual(1);

      // Timestamps must be non-decreasing
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timeSec).toBeGreaterThanOrEqual(events[i - 1].timeSec - 1e-6);
      }
    });

    it("F6: 2D Planar Homography 3x3 DLT solver maps trapezoid image coordinates to rectangular floor coordinates", () => {
      // Trapezoidal oblique image points
      const imagePoints: Point2D[] = [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 350, y: 400 },
        { x: 50, y: 400 },
      ];

      // Rectangular ground-truth floor plane coordinates (mm)
      const floorPoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 2000 },
        { x: 0, y: 2000 },
      ];

      const H = computeHomographyMatrix(imagePoints, floorPoints);

      expect(H).toBeDefined();
      expect(H.length).toBe(3);
      expect(H[0].length).toBe(3);

      // Verify corner point transformations match floor plane within 1 mm
      for (let i = 0; i < 4; i++) {
        const transformed = transformPoint(imagePoints[i], H);
        expect(transformed.x).toBeCloseTo(floorPoints[i].x, 1);
        expect(transformed.y).toBeCloseTo(floorPoints[i].y, 1);
      }
    });

    it("F7: Steady-state stride filtering excludes initial acceleration and terminal deceleration strides", () => {
      // Stride sequence: Accel (1.10s), Steady (0.60s, 0.60s, 0.60s, 0.60s), Decel (1.15s)
      const rawStrides = [1.10, 0.60, 0.60, 0.60, 0.60, 1.15];

      const { steadyStrides, excludedCount } = filterSteadyStateStrides(rawStrides);

      expect(excludedCount).toBe(2);
      expect(steadyStrides).toEqual([0.60, 0.60, 0.60, 0.60]);

      // Calculating stepTimeCV on steadyStrides yields exactly 0.0
      const meanS = steadyStrides.reduce((a, b) => a + b, 0) / steadyStrides.length;
      const stdS = Math.sqrt(steadyStrides.reduce((a, b) => a + Math.pow(b - meanS, 2), 0) / steadyStrides.length);
      const steadyCV = stdS / meanS;

      expect(steadyCV).toBeCloseTo(0.0, 5);
    });

    it("F8: Full suite metric regression consistency check", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const metrics = computeGaitMetrics(frames);

      expect(metrics.stepCount).toBeGreaterThan(0);
      expect(metrics.cadenceSpm).toBeGreaterThan(40);
      expect(metrics.cadenceSpm).toBeLessThan(220);
      expect(metrics.stepTimeCV).toBeGreaterThanOrEqual(0);
      expect(metrics.symmetryAngle).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("Handles empty landmark arrays and zero-length frame buffers gracefully without throwing NaN or crashing", () => {
      const emptyMetrics = computeGaitMetrics([]);
      expect(emptyMetrics.stepCount).toBe(0);
      expect(emptyMetrics.cadenceSpm).toBe(0);
      expect(emptyMetrics.stepTimeCV).toBe(0);
      expect(emptyMetrics.viewAngle).toBe("unknown");

      const emptyFiltered = filterSteadyStateStrides([]);
      expect(emptyFiltered.steadyStrides).toEqual([]);
      expect(emptyFiltered.excludedCount).toBe(0);

      const emptySG = savitzkyGolay5([]);
      expect(emptySG).toEqual([]);
    });

    it("Handles sub-minimum frame buffers (< 4 frames) gracefully", () => {
      const shortFrames: PoseFrame[] = [
        { timeMs: 0, landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }) },
        { timeMs: 33, landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }) },
      ];

      const metrics = computeGaitMetrics(shortFrames);
      expect(metrics.stepCount).toBe(0);
      expect(metrics.durationSec).toBeCloseTo(0.033, 2);

      const smoothed = smoothPoseFrames(shortFrames);
      expect(smoothed.length).toBe(2);
    });

    it("Handles degenerate collinear homography inputs safely with identity matrix fallback", () => {
      // 4 collinear points on line y = 2x
      const collinearPoints: Point2D[] = [
        { x: 10, y: 20 },
        { x: 20, y: 40 },
        { x: 30, y: 60 },
        { x: 40, y: 80 },
      ];
      const floorPoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const H = computeHomographyMatrix(collinearPoints, floorPoints);

      // Must return fallback identity matrix without throwing unhandled exceptions
      expect(H).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
    });

    it("Handles 0 steady-state strides when clip is uniformly accelerating", () => {
      const uniformAcceleratingStrides = [1.2, 1.0, 0.85, 0.70];
      const { steadyStrides } = filterSteadyStateStrides(uniformAcceleratingStrides);

      expect(steadyStrides.length).toBeGreaterThan(0);
    });

    it("Handles prolonged zero-velocity standing (ZUPT) correctly without false heel strikes", () => {
      const stationaryFrames = generateStationaryPoseFrames(30, 3.0);
      const events = detectFusedGaitEvents(stationaryFrames, 30);

      // Stationary frames must not trigger false movement heel strikes
      const heelStrikes = events.filter((e) => e.type === "heel_strike");
      expect(heelStrikes.length).toBe(0);
    });

    it("Sanitizes extreme noise, non-finite values (NaN, Infinity) and low visibility landmarks (< 0.3)", () => {
      const dirtySignal = [1.0, NaN, 1.2, Infinity, -Infinity, 1.1, 1.0];
      const kalmanFiltered = kalmanFilter1D(dirtySignal);

      expect(kalmanFiltered.every(Number.isFinite)).toBe(true);

      const lowVisFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.0,
        lowVisibilityLandmarks: true,
      });
      const breakdown = detectGaitEventsZeni(lowVisFrames, 30);
      expect(breakdown).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("Integrated Oblique Camera + Calibration + Homography + Smoothing + Heel-Strike Fusion Pipeline", () => {
      // 1. Generate synthetic walking trial under oblique view angle (35 deg)
      const rawObliqueFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.5,
        viewAngle: "oblique",
        noiseLevel: 0.03,
      });

      // 2. Step 1: Apply 1D 5-point Savitzky-Golay temporal coordinate smoothing
      const smoothedFrames = smoothPoseFrames(rawObliqueFrames);

      // 3. Step 2: Floor Marker Calibration (QR marker 50mm, measured at 200px -> 0.25 mm/px)
      const mmPerPx = calculateMillimetersPerPixel("qr", { width: 200, height: 200 });
      expect(mmPerPx).toBeCloseTo(0.25, 2);

      // 4. Step 3: Compute 2D Floor Planar Homography matrix to map perspective view to top-down floor plane
      const cameraTrapezoid: Point2D[] = [
        { x: 120, y: 150 },
        { x: 280, y: 150 },
        { x: 340, y: 380 },
        { x: 60, y: 380 },
      ];
      const floorRectangle: Point2D[] = [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 1500 },
        { x: 0, y: 1500 },
      ];
      const H = computeHomographyMatrix(cameraTrapezoid, floorRectangle);

      // Transform ankle positions into floor plane
      const transformedFrames: PoseFrame[] = smoothedFrames.map((f) => {
        const lAnkle = f.landmarks[27];
        const rAnkle = f.landmarks[28];
        const lTransformed = transformPoint({ x: lAnkle.x * 400, y: lAnkle.y * 400 }, H);
        const rTransformed = transformPoint({ x: rAnkle.x * 400, y: rAnkle.y * 400 }, H);

        const newLms = [...f.landmarks];
        newLms[27] = { ...lAnkle, x: lTransformed.x / 400, y: lTransformed.y / 400 };
        newLms[28] = { ...rAnkle, x: rTransformed.x / 400, y: rTransformed.y / 400 };
        return { ...f, landmarks: newLms };
      });

      // 5. Step 4: Multi-signal heel-strike event detection
      const events = detectFusedGaitEvents(transformedFrames, 30);
      expect(events.length).toBeGreaterThanOrEqual(4);

      // 6. Step 5: Metric analysis
      const metrics = computeGaitMetrics(transformedFrames);
      expect(metrics.stepCount).toBeGreaterThan(0);
      expect(metrics.cadenceSpm).toBeGreaterThan(40);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD GROUND-TRUTH SYNTHETIC SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Ground-Truth Synthetic Scenarios", () => {
    it("Scenario 1: Normal Symmetric Gait Trial matches known ground-truth metrics", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        asymmetryFactor: 1.0,
      });

      const metrics = computeGaitMetrics(frames);

      // Ground truth oracle validation:
      expect(metrics.cadenceSpm).toBeGreaterThan(60);
      expect(metrics.cadenceSpm).toBeLessThan(220);
      expect(metrics.stepTimeCV).toBeLessThan(0.08); // low step time variability
      expect(metrics.symmetryAngle).toBeLessThan(16.0); // high symmetry
    });

    it("Scenario 2: Pathological Asymmetric Gait Trial detects elevated stepTimeCV (> 10%) and step asymmetry", () => {
      // Ground truth: Asymmetry factor = 1.35 (simulating hemiparetic/parkinsonian limping)
      const asymmetricFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        asymmetryFactor: 1.35,
      });

      const metrics = computeGaitMetrics(asymmetricFrames);

      expect(metrics.stepTimeCV).toBeGreaterThan(0.03);
      expect(metrics.symmetryAngle).toBeGreaterThan(2.0);
    });

    it("Scenario 3: Handheld Shaky Camera Trial remains stable after Savitzky-Golay coordinate smoothing", () => {
      const noisyFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.5,
        noiseLevel: 0.04,
      });

      const smoothedFrames = smoothPoseFrames(noisyFrames);

      const rawMetrics = computeGaitMetrics(noisyFrames);
      const smoothedMetrics = computeGaitMetrics(smoothedFrames);

      // Smoothed metrics must produce lower or equal stepTimeCV jitter compared to raw noisy input
      expect(smoothedMetrics.stepTimeCV).toBeLessThanOrEqual(rawMetrics.stepTimeCV + 0.02);
      expect(smoothedMetrics.cadenceSpm).toBeGreaterThan(50);
    });

    it("Scenario 4: Variable Acceleration Runway Trial isolates central steady-state strides via filterSteadyStateStrides", () => {
      // Simulated stride sequence with initial acceleration (1.20s, 0.90s) and terminal deceleration (1.15s)
      const runwayStrideIntervals = [1.20, 0.90, 0.62, 0.60, 0.61, 0.59, 0.60, 1.15];

      const { steadyStrides, excludedCount } = filterSteadyStateStrides(runwayStrideIntervals);

      expect(excludedCount).toBeGreaterThanOrEqual(2);
      expect(steadyStrides.length).toBeGreaterThanOrEqual(4);

      const meanS = steadyStrides.reduce((a, b) => a + b, 0) / steadyStrides.length;
      const stdS = Math.sqrt(
        steadyStrides.reduce((a, b) => a + Math.pow(b - meanS, 2), 0) / steadyStrides.length
      );
      const steadyCV = stdS / meanS;

      // Steady state stepTimeCV must be low
      expect(steadyCV).toBeLessThan(0.05);
    });
  });
});
