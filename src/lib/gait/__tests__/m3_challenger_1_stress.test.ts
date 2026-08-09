import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PoseTracker } from "../PoseTracker";
import type { PoseLandmarkerLike } from "../pose";

describe("Milestone 3 Challenger 1: Empirical Stress Tests for PoseTracker", () => {
  let mockTrack1: { stop: ReturnType<typeof vi.fn>; kind: string; enabled: boolean };
  let mockTrack2: { stop: ReturnType<typeof vi.fn>; kind: string; enabled: boolean };
  let mockStream1: { getTracks: ReturnType<typeof vi.fn>; getVideoTracks: ReturnType<typeof vi.fn> };
  let mockStream2: { getTracks: ReturnType<typeof vi.fn>; getVideoTracks: ReturnType<typeof vi.fn> };
  let mockVideo: HTMLVideoElement;
  let mockLandmarker: PoseLandmarkerLike;
  let getUserMediaSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();

    mockTrack1 = { stop: vi.fn(), kind: "video", enabled: true };
    mockTrack2 = { stop: vi.fn(), kind: "video", enabled: true };

    mockStream1 = {
      getTracks: vi.fn().mockReturnValue([mockTrack1]),
      getVideoTracks: vi.fn().mockReturnValue([mockTrack1]),
    };

    mockStream2 = {
      getTracks: vi.fn().mockReturnValue([mockTrack2]),
      getVideoTracks: vi.fn().mockReturnValue([mockTrack2]),
    };

    getUserMediaSpy = vi.fn().mockResolvedValue(mockStream1);

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: getUserMediaSpy,
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "cam-01", kind: "videoinput", label: "Front Camera" },
        ]),
      },
    });

    const createMockVideo = () => {
      const v = {
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
      };
      return v as unknown as HTMLVideoElement;
    };

    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "video") return createMockVideo();
        return {};
      },
    });

    mockVideo = createMockVideo();

    mockLandmarker = {
      detect: vi.fn(),
      detectForVideo: vi.fn().mockImplementation(() => ({
        landmarks: [
          Array.from({ length: 33 }, (_, i) => ({
            x: 0.5 + i * 0.01,
            y: 0.5 + i * 0.01,
            z: 0.0,
            visibility: 0.9,
          })),
        ],
        worldLandmarks: [
          Array.from({ length: 33 }, () => ({
            x: 0.5,
            y: 0.5,
            z: 0.0,
            visibility: 0.9,
          })),
        ],
      })),
      setOptions: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // FOCUS AREA 1: Rapid Start/Stop Toggling & Race Conditions
  describe("Focus Area 1: Rapid Start/Stop Toggling & Concurrency", () => {
    it("1.1 Rapid successive startWebcam calls clean up intermediate streams without leaking tracks", async () => {
      let resolveStream1!: (stream: unknown) => void;
      const pendingStream1 = new Promise((resolve) => {
        resolveStream1 = resolve;
      });

      getUserMediaSpy
        .mockReturnValueOnce(pendingStream1)
        .mockResolvedValueOnce(mockStream2);

      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const p1 = tracker.startWebcam(mockVideo);
      await vi.advanceTimersByTimeAsync(0);

      // Start second webcam before first getUserMedia resolves
      const p2 = tracker.startWebcam(mockVideo);

      // Resolve first stream
      resolveStream1(mockStream1);

      await expect(p1).rejects.toThrow("Webcam stream acquisition aborted.");
      const s2 = await p2;

      expect(s2).toBe(mockStream2);
      expect(mockTrack1.stop).toHaveBeenCalled();
      expect(tracker.isRunning()).toBe(true);
      expect(tracker.getStream()).toBe(mockStream2);
    });

    it("1.2 Interleaving startWebcam -> stopWebcam -> startWebcam leaves state consistent", async () => {
      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const p1 = tracker.startWebcam(mockVideo);
      tracker.stopWebcam();

      await expect(p1).rejects.toThrow();

      expect(tracker.isRunning()).toBe(false);
      expect(tracker.getStream()).toBeNull();
      expect(tracker.getVideoElement()).toBeNull();

      // Now start clean again
      getUserMediaSpy.mockResolvedValueOnce(mockStream2);
      const s2 = await tracker.startWebcam(mockVideo);
      expect(s2).toBe(mockStream2);
      expect(tracker.isRunning()).toBe(true);
    });

    it("1.3 Async race condition test: stopWebcam during pending video.play() does NOT leave tracker active", async () => {
      let resolvePlay!: () => void;
      const delayedPlayPromise = new Promise<void>((resolve) => {
        resolvePlay = resolve;
      });

      mockVideo.play = vi.fn().mockReturnValue(delayedPlayPromise);

      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const startPromise = tracker.startWebcam(mockVideo);

      // Wait macro-task to let startWebcam reach videoElement.play()
      await vi.advanceTimersByTimeAsync(0);

      // Now stopWebcam while play() is pending
      tracker.stopWebcam();
      expect(tracker.isRunning()).toBe(false);

      // Now resolve play()
      resolvePlay();
      await startPromise;

      // STRESS CHECK: Does isActive remain false or get corrupted back to true?
      expect(tracker.isRunning()).toBe(false);
      expect(tracker.getStream()).toBeNull();
      expect(tracker.getVideoElement()).toBeNull();
    });

    it("1.4 Rapid toggle 50 times in a row without awaiting ensures no active loops remain", async () => {
      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const promises = [];
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          promises.push(tracker.startWebcam(mockVideo).catch(() => null));
        } else {
          tracker.stopWebcam();
        }
      }
      tracker.stopWebcam();

      await Promise.all(promises);

      expect(tracker.isRunning()).toBe(false);
      expect(tracker.getStream()).toBeNull();
      expect(tracker.getVideoElement()).toBeNull();
    });
  });

  // FOCUS AREA 2: Frame Timestamp Jitter & Out-of-Order Timestamps
  describe("Focus Area 2: Frame Timestamp Jitter & Monotonicity", () => {
    it("2.1 Guarantees strictly monotonic timestamps even when performance.now() regresses", async () => {
      let mockTime = 1000;
      vi.stubGlobal("performance", {
        now: () => mockTime,
      });

      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const detectedTimestamps: number[] = [];
      (mockLandmarker.detectForVideo as ReturnType<typeof vi.fn>).mockImplementation((_vid, ts) => {
        detectedTimestamps.push(ts);
        return { landmarks: [Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))] };
      });

      await tracker.startWebcam(mockVideo);

      // Advance timers and simulate backward time jitter in performance.now
      vi.advanceTimersByTime(40); // ts ~1000
      mockTime = 800; // Regress time backward by 200ms
      vi.advanceTimersByTime(40);
      mockTime = 500; // Regress further
      vi.advanceTimersByTime(40);
      mockTime = 1200; // Jump forward

      // Check all captured timestamp args in detectForVideo
      for (let i = 1; i < detectedTimestamps.length; i++) {
        expect(detectedTimestamps[i]).toBeGreaterThan(detectedTimestamps[i - 1]);
      }
    });

    it("2.2 Handles timestamp freeze without throwing exceptions or executing duplicate timestamps", async () => {
      vi.stubGlobal("performance", {
        now: () => 5000, // Frozen time
      });

      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const detectedTimestamps: number[] = [];
      (mockLandmarker.detectForVideo as ReturnType<typeof vi.fn>).mockImplementation((_vid, ts) => {
        detectedTimestamps.push(ts);
        return { landmarks: [Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))] };
      });

      await tracker.startWebcam(mockVideo);
      vi.advanceTimersByTime(500);

      // Verify all timestamps passed to detectForVideo are strictly increasing
      for (let i = 1; i < detectedTimestamps.length; i++) {
        expect(detectedTimestamps[i]).toBeGreaterThan(detectedTimestamps[i - 1]);
      }
    });

    it("2.3 Handles detectForVideo runtime errors gracefully without breaking the loop", async () => {
      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      let callCount = 0;
      (mockLandmarker.detectForVideo as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error("MediaPipe internal WASM exception");
        }
        return { landmarks: [Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))] };
      });

      await tracker.startWebcam(mockVideo);

      // Should not unhandled reject or crash loop on call #2
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
      expect(callCount).toBeGreaterThan(2);
      expect(tracker.isRunning()).toBe(true);
    });
  });

  // FOCUS AREA 3: Stream Teardown Integrity
  describe("Focus Area 3: Stream Teardown & Resource Cleanup", () => {
    it("3.1 Teardown stops all media tracks, clears srcObject, pauses video, and nullifies references", async () => {
      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      await tracker.startWebcam(mockVideo);
      expect(mockVideo.srcObject).toBe(mockStream1);
      expect(tracker.isRunning()).toBe(true);

      tracker.stopWebcam();

      expect(mockTrack1.stop).toHaveBeenCalled();
      expect(mockVideo.srcObject).toBeNull();
      expect(mockVideo.pause).toHaveBeenCalled();
      expect(tracker.isRunning()).toBe(false);
      expect(tracker.getStream()).toBeNull();
      expect(tracker.getVideoElement()).toBeNull();
    });

    it("3.2 stopWebcam is idempotent and handles multiple consecutive invocations cleanly", async () => {
      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      await tracker.startWebcam(mockVideo);
      tracker.stopWebcam();
      expect(() => tracker.stopWebcam()).not.toThrow();
      expect(() => tracker.stopWebcam()).not.toThrow();

      expect(tracker.isRunning()).toBe(false);
    });

    it("3.3 Frame callbacks are halted immediately upon stopWebcam", async () => {
      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      const callback = vi.fn();
      tracker.setCallback(callback);

      await tracker.startWebcam(mockVideo);
      vi.advanceTimersByTime(100);
      const callsBefore = callback.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      tracker.stopWebcam();
      vi.advanceTimersByTime(200);

      const callsAfter = callback.mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it("3.4 Handles DOMExceptions thrown by track.stop() or video.pause() gracefully", async () => {
      mockTrack1.stop = vi.fn().mockImplementation(() => {
        throw new DOMException("Track stop failed", "InvalidStateError");
      });
      mockVideo.pause = vi.fn().mockImplementation(() => {
        throw new DOMException("Video pause failed", "InvalidStateError");
      });

      const tracker = new PoseTracker(30, 900);
      tracker.setLandmarker(mockLandmarker);

      await tracker.startWebcam(mockVideo);
      expect(() => tracker.stopWebcam()).not.toThrow();

      expect(tracker.isRunning()).toBe(false);
      expect(tracker.getStream()).toBeNull();
    });
  });
});
