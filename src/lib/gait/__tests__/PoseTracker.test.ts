import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PoseTracker, parseWebcamError, WebcamError } from "../PoseTracker";
import type { PoseLandmarkerLike } from "../pose";

describe("PoseTracker Engine", () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn>; kind: string; enabled: boolean };
  let mockStream: { getTracks: ReturnType<typeof vi.fn>; getVideoTracks: ReturnType<typeof vi.fn> };
  let mockVideo: HTMLVideoElement;
  let mockLandmarker: PoseLandmarkerLike;

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

    // Global navigator and document mocks for Node test environment
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "cam-01", kind: "videoinput", label: "Front Camera" },
          { deviceId: "cam-02", kind: "videoinput", label: "Back Camera" },
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

    // Mock PoseLandmarker
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

  it("initializes with default target FPS and buffer limits", () => {
    const tracker = new PoseTracker(30, 900);
    expect(tracker.isRunning()).toBe(false);
    expect(tracker.getRollingFrames()).toEqual([]);
    expect(tracker.getEffectiveFps()).toBe(0);
  });

  it("starts webcam stream and configures PoseLandmarker for VIDEO mode", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    const stream = await tracker.startWebcam(mockVideo);

    expect(stream).toBe(mockStream);
    expect(mockLandmarker.setOptions).toHaveBeenCalledWith({ runningMode: "VIDEO" });
    expect(mockVideo.srcObject).toBe(mockStream);
    expect(mockVideo.play).toHaveBeenCalled();
    expect(tracker.isRunning()).toBe(true);
  });

  it("executes frame detection loop and collects frames into rolling buffer", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    const callback = vi.fn();
    tracker.setCallback(callback);

    await tracker.startWebcam(mockVideo);

    // Advance timer to trigger animation loop iterations
    vi.advanceTimersByTime(100);

    expect(mockLandmarker.detectForVideo).toHaveBeenCalled();
    expect(tracker.getRollingFrames().length).toBeGreaterThan(0);
    expect(callback).toHaveBeenCalled();
  });

  it("caps rolling frame buffer at maxBufferFrames limit", async () => {
    const maxBuffer = 10;
    const tracker = new PoseTracker(30, maxBuffer);
    tracker.setLandmarker(mockLandmarker);

    await tracker.startWebcam(mockVideo);

    // Advance timer significantly to produce more frames than buffer limit
    vi.advanceTimersByTime(2000);

    expect(tracker.getRollingFrames().length).toBeLessThanOrEqual(maxBuffer);
  });

  it("cleans up media stream tracks and video element on stopWebcam()", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    await tracker.startWebcam(mockVideo);
    expect(tracker.isRunning()).toBe(true);

    tracker.stopWebcam();

    expect(tracker.isRunning()).toBe(false);
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(mockVideo.srcObject).toBeNull();
    expect(mockVideo.pause).toHaveBeenCalled();
  });

  it("clears rolling buffer on clearBuffer()", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    await tracker.startWebcam(mockVideo);
    vi.advanceTimersByTime(200);

    expect(tracker.getRollingFrames().length).toBeGreaterThan(0);

    tracker.clearBuffer();
    expect(tracker.getRollingFrames()).toEqual([]);
  });

  it("resets the rolling buffer when a new webcam session starts", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    await tracker.startWebcam(mockVideo);
    vi.advanceTimersByTime(200);

    const firstSessionFrames = tracker.getRollingFrames();
    expect(firstSessionFrames.length).toBeGreaterThan(1);

    tracker.stopWebcam();
    // Frames survive the stop so a freeze-after-stop can still be analyzed...
    expect(tracker.getRollingFrames().length).toBe(firstSessionFrames.length);

    const secondVideo = document.createElement("video") as HTMLVideoElement;
    await tracker.startWebcam(secondVideo);

    // ...but the second session must begin from an empty buffer, otherwise the
    // two recordings are concatenated across a fake multi-second gap.
    // startWebcam kicks the loop synchronously, so at most one frame of the
    // NEW session may already be present; none of the old ones may survive.
    const afterRestart = tracker.getRollingFrames();
    expect(afterRestart.length).toBeLessThanOrEqual(1);
    for (const old of firstSessionFrames) {
      expect(afterRestart).not.toContain(old);
    }

    vi.advanceTimersByTime(200);
    expect(tracker.getRollingFrames().length).toBeGreaterThan(1);

    tracker.stopWebcam();
  });

  it("reports ABORTED (not UNKNOWN) when initialization is aborted mid-setOptions", async () => {
    const tracker = new PoseTracker(30, 900);

    let releaseSetOptions!: () => void;
    (mockLandmarker.setOptions as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSetOptions = resolve;
        }),
    );
    tracker.setLandmarker(mockLandmarker);

    const pending = tracker.startWebcam(mockVideo);
    await vi.advanceTimersByTimeAsync(0);

    // Bump the session token while startWebcam is suspended on setOptions.
    tracker.stopWebcam();
    releaseSetOptions();

    await expect(pending).rejects.toMatchObject({
      name: "WebcamError",
      code: "ABORTED",
      message: "Webcam initialization aborted due to rapid state change.",
    });
    await expect(pending).rejects.toBeInstanceOf(WebcamError);
  });

  it("reports ABORTED (not UNKNOWN) when stream acquisition is aborted mid-getUserMedia", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    let releaseStream!: (stream: unknown) => void;
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((resolve) => {
        releaseStream = resolve;
      }),
    );

    const pending = tracker.startWebcam(mockVideo);
    await vi.advanceTimersByTimeAsync(0);

    tracker.stopWebcam();
    releaseStream(mockStream);

    await expect(pending).rejects.toMatchObject({
      name: "WebcamError",
      code: "ABORTED",
      message: "Webcam stream acquisition aborted.",
    });
    await expect(pending).rejects.toBeInstanceOf(WebcamError);
    // The abandoned stream's tracks are still released.
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("parses and handles NotAllowedError camera permission denial", () => {
    const err = new DOMException("Permission denied by user", "NotAllowedError");
    const parsed = parseWebcamError(err);

    expect(parsed).toBeInstanceOf(WebcamError);
    expect(parsed.code).toBe("NOT_ALLOWED");
    expect(parsed.message).toContain("Camera access was denied");
  });

  it("parses and handles NotFoundError when no camera hardware exists", () => {
    const err = new DOMException("Requested device not found", "NotFoundError");
    const parsed = parseWebcamError(err);

    expect(parsed).toBeInstanceOf(WebcamError);
    expect(parsed.code).toBe("NOT_FOUND");
    expect(parsed.message).toContain("No video input camera device detected");
  });

  it("parses and handles NotReadableError when camera is locked by another process", () => {
    const err = new DOMException("Device in use", "NotReadableError");
    const parsed = parseWebcamError(err);

    expect(parsed).toBeInstanceOf(WebcamError);
    expect(parsed.code).toBe("NOT_READABLE");
    expect(parsed.message).toContain("currently in use by another application");
  });

  it("falls back to basic video constraints on OverconstrainedError", async () => {
    const tracker = new PoseTracker(30, 900);
    tracker.setLandmarker(mockLandmarker);

    const overconstrainedErr = new DOMException("Width constraint invalid", "OverconstrainedError");

    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(overconstrainedErr)
      .mockResolvedValueOnce(mockStream);

    const stream = await tracker.startWebcam(mockVideo, { width: 3840, height: 2160 });

    expect(stream).toBe(mockStream);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  });
});
