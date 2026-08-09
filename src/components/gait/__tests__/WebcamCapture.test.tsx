// @vitest-environment jsdom
/**
 * Live webcam capture path (R3) — jsdom integration tests for GaitApp.
 *
 * These tests drive the real GaitApp component with a mocked PoseTracker so no
 * getUserMedia call and no MediaPipe model download is ever attempted. The mock
 * mirrors the real tracker's observable contract:
 *   - startWebcam() is a promise the test resolves/rejects on demand
 *   - the rolling buffer grows from emitted frames, survives stopWebcam(), and is
 *     dropped on a successful startWebcam() — exactly as PoseTracker behaves
 *   - stopWebcam() calls are counted
 *
 * Assertions are on user-visible text / data-testids only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PoseFrame } from "@/lib/gait/types";
import { generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";

/* ------------------------------------------------------------------ */
/* Mock harness                                                        */
/* ------------------------------------------------------------------ */

interface MockTracker {
  buffer: PoseFrame[];
  startCalls: { deviceId?: string }[];
  stopCalls: number;
  clearBufferCalls: number;
  startMode: "resolve" | "manual" | "reject";
  startError: unknown;
  settleStart: (() => void) | null;
  emit: (frames: PoseFrame[], fps?: number) => void;
  setCallback: (cb: unknown) => void;
}

const harness = vi.hoisted(() => ({
  instances: [] as MockTracker[],
  /** Config applied to the next constructed tracker. */
  next: { startMode: "resolve" as "resolve" | "manual" | "reject", startError: null as unknown },
}));

vi.mock("@/lib/gait/PoseTracker", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/gait/PoseTracker")>("@/lib/gait/PoseTracker");

  class FakePoseTracker {
    buffer: PoseFrame[] = [];
    startCalls: { deviceId?: string }[] = [];
    stopCalls = 0;
    clearBufferCalls = 0;
    startMode: "resolve" | "manual" | "reject";
    startError: unknown;
    settleStart: (() => void) | null = null;
    private callback:
      | ((frame: PoseFrame | null, raw: unknown, fps: number) => void)
      | null = null;
    private active = false;

    constructor() {
      this.startMode = harness.next.startMode;
      this.startError = harness.next.startError;
      harness.instances.push(this as unknown as MockTracker);
    }

    setLandmarker(): void {}

    setCallback(cb: ((frame: PoseFrame | null, raw: unknown, fps: number) => void) | null): void {
      this.callback = cb;
    }

    async startWebcam(
      _video: HTMLVideoElement,
      options: { deviceId?: string } = {},
    ): Promise<MediaStream> {
      this.startCalls.push({ deviceId: options.deviceId });
      if (this.startMode === "reject") throw this.startError;
      if (this.startMode === "manual") {
        await new Promise<void>((resolve) => {
          this.settleStart = resolve;
        });
      }
      this.active = true;
      // Mirrors the real PoseTracker: a successful start drops the previous
      // session's rolling buffer (PoseTracker.startWebcam step 6).
      this.clearBuffer();
      const track = {
        kind: "video",
        label: "Front Camera",
        stop: () => {},
        getSettings: () => ({
          deviceId: options.deviceId ?? "cam-1",
          width: 1280,
          height: 720,
          frameRate: 30,
        }),
      };
      return {
        getTracks: () => [track],
        getVideoTracks: () => [track],
        getAudioTracks: () => [],
      } as unknown as MediaStream;
    }

    stopWebcam(): void {
      this.stopCalls++;
      this.active = false;
      // NOTE: deliberately does not clear the buffer — the real stopWebcam()
      // does not either; the reset happens on the next successful start.
    }

    getRollingFrames(): PoseFrame[] {
      return [...this.buffer];
    }

    clearBuffer(): void {
      this.clearBufferCalls++;
      this.buffer = [];
    }

    getEffectiveFps(): number {
      return 30;
    }

    isRunning(): boolean {
      return this.active;
    }

    getStream(): MediaStream | null {
      return null;
    }

    getVideoElement(): HTMLVideoElement | null {
      return null;
    }

    /** Test-only: push synthetic frames through the live callback. */
    emit(frames: PoseFrame[], fps = 30): void {
      for (const f of frames) {
        this.buffer.push(f);
        this.callback?.(f, null, fps);
      }
    }
  }

  return { ...actual, PoseTracker: FakePoseTracker };
});

vi.mock("@/lib/gait/pose", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gait/pose")>("@/lib/gait/pose");
  return {
    ...actual,
    getPoseLandmarker: vi.fn(async () => ({
      setOptions: vi.fn(async () => {}),
      detectForVideo: vi.fn(() => ({ landmarks: [], worldLandmarks: [] })),
    })),
  };
});

// Imported after the mocks so GaitApp binds to them.
const { GaitApp } = await import("../GaitApp");
const { WebcamError } = await import("@/lib/gait/PoseTracker");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let fetchSpy: ReturnType<typeof vi.fn>;

/** Comfortably above GaitApp's documented 20 s minimum analysis window. */
const RECORDING_SEC = 24;

function offsetFrames(frames: PoseFrame[], offsetMs: number): PoseFrame[] {
  return frames.map((f) => ({ ...f, timeMs: f.timeMs + offsetMs }));
}

/** Synthetic sagittal walking at 30 fps, timestamps offset by `offsetMs`. */
function walkFrames(durationSec: number, offsetMs = 0): PoseFrame[] {
  return offsetFrames(
    generateSyntheticWalkingFrames({ fps: 30, durationSec, viewAngle: "sagittal" }),
    offsetMs,
  );
}

function tracker(index = 0): MockTracker {
  const t = harness.instances[index];
  if (!t) throw new Error(`No mock PoseTracker instance at index ${index}`);
  return t;
}

function switchToWebcamMode(): void {
  fireEvent.click(screen.getByRole("button", { name: /Live WebCam Mode/i }));
}

function startButton(): HTMLElement {
  return screen.getByRole("button", { name: /Start WebCam/i });
}

async function startLive(): Promise<void> {
  await act(async () => {
    fireEvent.click(startButton());
  });
}

function emitFrames(frames: PoseFrame[], index = 0): void {
  act(() => {
    tracker(index).emit(frames);
  });
}

async function freeze(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Freeze & Analyze Session/i }));
  });
}

beforeEach(() => {
  harness.instances.length = 0;
  harness.next.startMode = "resolve";
  harness.next.startError = null;

  // jsdom shim: recharts' ResponsiveContainer needs ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );

  fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => [
        { deviceId: "cam-1", kind: "videoinput", label: "Front Camera" },
        { deviceId: "cam-2", kind: "videoinput", label: "Side Camera" },
        { deviceId: "mic-1", kind: "audioinput", label: "Built-in Mic" },
      ]),
      getUserMedia: vi.fn(async () => {
        throw new Error("getUserMedia must never be called from these tests");
      }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* Static markup smoke tests (retained from the original file)         */
/* ------------------------------------------------------------------ */

describe("WebcamCapture UI Mode & Controls", () => {
  it("renders GaitApp Stage 1 with input mode switcher tabs", () => {
    const html = renderToStaticMarkup(<GaitApp />);
    expect(html).toContain("Video File Upload");
    expect(html).toContain("Live WebCam Mode");
    expect(html).toContain("Assessment Protocol Mode");
  });

  it("renders Stage 1 Video File Upload dropzone by default", () => {
    const html = renderToStaticMarkup(<GaitApp />);
    expect(html).toContain("Drop walking video file here");
    expect(html).toContain("Browse Video File");
    expect(html).toContain("Multi-person tracking &amp; candidate selection");
  });
});

/* ------------------------------------------------------------------ */
/* Live capture path                                                   */
/* ------------------------------------------------------------------ */

describe("GaitApp live webcam capture path", () => {
  it("switching to webcam mode renders the capture station with device selector and Start control", async () => {
    render(<GaitApp />);
    switchToWebcamMode();

    expect(screen.getByText("Live WebCam Capture Station")).toBeTruthy();
    expect(startButton()).toBeTruthy();

    const select = screen.getByLabelText("Select camera input device") as HTMLSelectElement;
    await waitFor(() => {
      expect(select.querySelectorAll("option").length).toBe(2);
    });
    const optionLabels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Front Camera", "Side Camera"]);
    // Audio inputs must not be offered as camera devices.
    expect(optionLabels.join(" ")).not.toContain("Mic");
  });

  it("start -> live frames -> Freeze produces a full analysis result (metrics, guesses, angle analysis)", async () => {
    render(<GaitApp />);
    switchToWebcamMode();
    await startLive();

    expect(await screen.findByText("STREAMING LIVE")).toBeTruthy();

    emitFrames(walkFrames(RECORDING_SEC));
    await freeze();

    // Stage 3 clinical insights render only when result.metrics exists.
    const clusters = await screen.findByTestId("cognitive-clusters");
    expect(clusters).toBeTruthy();
    expect(screen.getByText(/Pace: \d+\/100/)).toBeTruthy();
    expect(screen.getByText(/Symmetry: \d+\/100/)).toBeTruthy();
    expect(screen.getByText(/Stability: \d+\/100/)).toBeTruthy();

    // guesses: rendered by the "Guesses & Hypotheses" tab
    fireEvent.click(screen.getByRole("tab", { name: /Guesses & Hypotheses/i }));
    expect(screen.getAllByText(/Educated Guesses|Hypotheses|hypothes/i).length).toBeGreaterThan(0);

    // angleAnalysis: joint kinematics chart tabs
    fireEvent.click(screen.getByRole("tab", { name: /Cognitive Clusters/i }));
    expect(screen.getByTestId("tab-knee")).toBeTruthy();

    // The capture station is gone: the session was frozen.
    expect(screen.queryByText("STREAMING LIVE")).toBeNull();
    expect(tracker().stopCalls).toBeGreaterThanOrEqual(1);
  });

  it("refuses a recording far shorter than the analysis window with a clear message instead of metrics", async () => {
    render(<GaitApp />);
    switchToWebcamMode();
    await startLive();
    await screen.findByText("STREAMING LIVE");

    // 12 frames spanning 0.4 s — enough frames to pass a naive count check,
    // nowhere near a usable gait analysis window.
    const short = walkFrames(RECORDING_SEC).slice(0, 12).map((f, i) => ({ ...f, timeMs: i * 33 }));
    emitFrames(short);
    await freeze();

    const message = await screen.findByText(
      /(too short|not enough|at least|longer)/i,
    );
    expect(message.textContent).toMatch(/second|s\b/i);
    expect(screen.queryByTestId("cognitive-clusters")).toBeNull();
  });

  it("stop pressed while start is still pending ends in the idle state, not streaming", async () => {
    harness.next.startMode = "manual";
    render(<GaitApp />);
    switchToWebcamMode();

    // Fire start but never let it settle yet.
    await act(async () => {
      fireEvent.click(startButton());
    });

    // The user gives up and aborts before the camera comes up. While the app is
    // "requesting" there must be a control to back out of the attempt.
    const stopControl = screen.getByRole("button", { name: /Stop WebCam|Cancel/i });
    await act(async () => {
      fireEvent.click(stopControl);
    });

    // Now the tracker's startWebcam finally resolves.
    await act(async () => {
      tracker().settleStart?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("STREAMING LIVE")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Freeze & Analyze Session/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Start WebCam/i })).toBeTruthy();
  });

  it("an ABORTED tracker error does not surface the camera error banner", async () => {
    harness.next.startMode = "reject";
    harness.next.startError = new WebcamError(
      "Webcam initialization aborted due to rapid state change.",
      "ABORTED" as unknown as import("@/lib/gait/PoseTracker").WebcamErrorCode,
    );

    render(<GaitApp />);
    switchToWebcamMode();
    await startLive();

    await waitFor(() => {
      expect(screen.queryByText("STREAMING LIVE")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Switch to Video File Upload/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retry Camera Access/i })).toBeNull();
    // The user is still left with an actionable control, not a dead station.
    expect(screen.getByRole("button", { name: /Start WebCam|Stop WebCam/i })).toBeTruthy();
  });

  it("a permission denial does surface the camera error banner with recovery actions", async () => {
    harness.next.startMode = "reject";
    harness.next.startError = new DOMException("Permission denied", "NotAllowedError");

    render(<GaitApp />);
    switchToWebcamMode();
    await startLive();

    expect(await screen.findByText(/Camera access was denied/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Switch to Video File Upload/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry Camera Access/i })).toBeTruthy();
  });

  it("stopping clears the live skeleton and telemetry rather than leaving stale values", async () => {
    render(<GaitApp />);
    switchToWebcamMode();
    await startLive();
    await screen.findByText("STREAMING LIVE");

    emitFrames(walkFrames(4));
    expect(screen.getByText("LIVE TELEMETRY")).toBeTruthy();
    const stepsBefore = screen.getByText("Steps:").parentElement?.textContent ?? "";

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Stop WebCam/i }));
    });

    expect(screen.queryByText("LIVE TELEMETRY")).toBeNull();
    expect(tracker().stopCalls).toBeGreaterThanOrEqual(1);

    // Restart: the HUD must come back zeroed, not carrying the old session.
    await startLive();
    await screen.findByText("STREAMING LIVE");
    const stepsAfter = screen.getByText("Steps:").parentElement?.textContent ?? "";
    expect(stepsAfter).toMatch(/Steps:\s*(0|—)$/);
    expect(screen.getByText("FPS:").parentElement?.textContent).toMatch(/0\.0$/);
    expect(stepsBefore).not.toBe(stepsAfter);
  });

  it("stop -> start -> freeze analyzes only the second recording", async () => {
    render(<GaitApp />);
    switchToWebcamMode();

    // Session 1: 6 s of walking, then stopped and discarded.
    await startLive();
    await screen.findByText("STREAMING LIVE");
    emitFrames(walkFrames(RECORDING_SEC, 0));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Stop WebCam/i }));
    });

    // Session 2: another 6 s, timestamps continuing after session 1.
    await startLive();
    await screen.findByText("STREAMING LIVE");
    emitFrames(walkFrames(RECORDING_SEC, (RECORDING_SEC + 5) * 1000));

    // Only the second session is buffered: the first was dropped on restart.
    expect(tracker().buffer.length).toBe(RECORDING_SEC * 30);
    await freeze();

    await screen.findByTestId("cognitive-clusters");
    fireEvent.click(screen.getByRole("tab", { name: /Kinematic Charts & CIs/i }));

    const durationCard = screen.getByText("Clip duration").parentElement;
    const durationSec = parseFloat(
      (durationCard?.textContent ?? "").replace("Clip duration", "").trim(),
    );
    // Session 2 alone spans ~24 s. Both sessions concatenated would span ~53 s.
    expect(durationSec).toBeGreaterThan(RECORDING_SEC - 4);
    expect(durationSec).toBeLessThan(RECORDING_SEC + 6);
  });

  it("uploads no video or pose frames: the live path performs no network I/O", async () => {
    render(<GaitApp />);
    switchToWebcamMode();
    await startLive();
    await screen.findByText("STREAMING LIVE");
    emitFrames(walkFrames(RECORDING_SEC));
    await freeze();
    await screen.findByTestId("cognitive-clusters");

    // Nothing in start -> stream -> freeze may hit the network. The only
    // network call in this feature is the explicit metrics-only save, which
    // the user has not triggered here.
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const body = init?.body;
      expect(body instanceof FormData).toBe(false);
      expect(body instanceof Blob).toBe(false);
      const text = typeof body === "string" ? body : "";
      expect(text).not.toMatch(/landmarks|worldLandmarks|videoUrl|blob:|data:video/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();

    // And getUserMedia is never touched directly by the component.
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
