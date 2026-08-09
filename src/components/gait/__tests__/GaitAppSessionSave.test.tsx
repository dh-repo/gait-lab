// @vitest-environment jsdom
/**
 * GaitApp session persistence & dual-task disclosure.
 *
 * History UI is gone — sessions are reached via live capture freeze, not a drawer.
 * Covers:
 *  1. Saving is an upsert (second save carries the server-minted id).
 *  2. Dual-task without a baseline discloses unavailability; single-task shows Baseline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import type { PoseFrame } from "@/lib/gait/types";
import { generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";

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
  next: { startMode: "resolve" as "resolve" | "manual" | "reject", startError: null as unknown },
}));

const saveSpy = vi.hoisted(() =>
  vi.fn(async (args: { data: { id?: string } }) => ({
    id: args.data.id ?? "gs_server_assigned_1",
  })),
);

vi.mock("@/lib/gait/persistence", () => ({
  saveGaitSession: saveSpy,
  listGaitSessions: vi.fn(async () => []),
  deleteGaitSession: vi.fn(async () => ({})),
  getGaitSession: vi.fn(async () => null),
  getPersistenceMode: vi.fn(async () => ({ source: "neon", durable: true })),
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
      this.stopCalls += 1;
      this.active = false;
    }

    clearBuffer(): void {
      this.clearBufferCalls += 1;
      this.buffer = [];
    }

    getRollingFrames(): PoseFrame[] {
      return this.buffer.slice();
    }

    getBufferedSpanSec(): number {
      if (this.buffer.length < 2) return 0;
      const a = this.buffer[0] as PoseFrame & { t?: number; timestamp?: number };
      const b = this.buffer[this.buffer.length - 1] as PoseFrame & {
        t?: number;
        timestamp?: number;
      };
      const t0 = a.t ?? a.timestamp ?? 0;
      const t1 = b.t ?? b.timestamp ?? 0;
      return t1 - t0;
    }

    getEffectiveFps(): number {
      return 30;
    }

    emit(frames: PoseFrame[], fps = 30): void {
      for (const f of frames) {
        this.buffer.push(f);
        if (this.active && this.callback) this.callback(f, null, fps);
      }
    }
  }

  return {
    ...actual,
    PoseTracker: FakePoseTracker,
  };
});

vi.mock("@/lib/gait/pose", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gait/pose")>("@/lib/gait/pose");
  return {
    ...actual,
    getPoseLandmarker: vi.fn(async () => ({ detectForVideo: vi.fn(() => ({ landmarks: [] })) })),
  };
});

const { GaitApp } = await import("../GaitApp");

const RECORDING_SEC = 22;

function tracker(index = 0): MockTracker {
  const t = harness.instances[index];
  if (!t) throw new Error(`No mock PoseTracker at ${index}`);
  return t;
}

function switchToWebcamMode(): void {
  const toggle = screen.getAllByRole("button").find((el) => el.textContent?.trim() === "Webcam");
  if (!toggle) throw new Error("Webcam source toggle not found");
  fireEvent.click(toggle);
}

async function captureAndAnalyze(taskMode: "single" | "dual"): Promise<void> {
  if (taskMode === "dual") {
    const protocol = screen
      .getAllByRole("button")
      .find((el) => el.textContent?.includes("Dual-Task (Walk + Cognitive)"));
    if (!protocol) throw new Error("Dual-task protocol control not found");
    fireEvent.click(protocol);
  }
  switchToWebcamMode();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Start camera/i }));
  });
  await screen.findByText("Camera on");
  const frames = generateSyntheticWalkingFrames({
    fps: 30,
    durationSec: RECORDING_SEC,
    viewAngle: "sagittal",
  });
  act(() => {
    tracker().emit(frames);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Stop & analyze|Freeze/i }));
  });
  await screen.findByTestId("cognitive-clusters");
}

beforeEach(() => {
  harness.instances.length = 0;
  harness.next = { startMode: "resolve", startError: null };
  saveSpy.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("MediaStream", class {});
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => [
        { kind: "videoinput", deviceId: "cam-1", label: "Front Camera", groupId: "g1" },
      ]),
      getUserMedia: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GaitApp session save is an upsert, not an insert", () => {
  it("re-saving the same result passes the id the server returned", async () => {
    render(<GaitApp />);
    await captureAndAnalyze("single");

    const saveButton = await screen.findByRole("button", { name: /Save session/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(saveSpy.mock.calls[0][0].data.id).toBeUndefined();

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Save/i }));
    });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    expect(saveSpy.mock.calls[1][0].data.id).toBe("gs_server_assigned_1");
  });
});

describe("GaitApp dual-task run without a baseline", () => {
  it("states plainly that dual-task cost is unavailable instead of showing a bare badge", async () => {
    render(<GaitApp />);
    await captureAndAnalyze("dual");

    expect(await screen.findByText(/No single-task baseline recorded/i)).toBeTruthy();
    expect(screen.getByText(/Dual-Task: unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/Dual-Task: 0\.0%/)).toBeNull();
  });

  it("shows the plain Baseline badge for a single-task run", async () => {
    render(<GaitApp />);
    await captureAndAnalyze("single");

    expect(screen.getByText(/Dual-Task: Baseline/i)).toBeTruthy();
    expect(screen.queryByText(/No single-task baseline recorded/i)).toBeNull();
  });
});
