// @vitest-environment jsdom
/**
 * GaitApp: loading a stored session must not leave the previous clip on screen,
 * and a save that the server rejects must be visible.
 *
 * 1. A stored session is numbers only — no video, no pose frames. If loading it
 *    leaves `videoUrl` and `scanPoses` in place, the stage-2 canvas paints clip A's
 *    skeleton next to session B's metrics, which reads as if the two belong together.
 * 2. persistence.saveGaitSession throws when the row's user_id ownership guard
 *    rejects the upsert. Swallowing that into console.error told the clinician
 *    nothing, so an unsaved session looked saved.
 *
 * Persistence and the pose model are mocked; no network, no MediaPipe, no database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { computeGaitMetrics } from "@/lib/gait/analysis";
import { buildEducatedGuesses } from "@/lib/gait/guesses";
import { generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";
import type { GaitMetrics } from "@/lib/gait/types";

const saveSpy = vi.hoisted(() =>
  vi.fn(async (args: { data: { id?: string } }) => ({
    id: args.data.id ?? "gs_server_assigned_1",
  })),
);
const listSpy = vi.hoisted(() => vi.fn(async () => [] as unknown[]));

vi.mock("@/lib/gait/persistence", () => ({
  saveGaitSession: saveSpy,
  listGaitSessions: listSpy,
  deleteGaitSession: vi.fn(async () => ({})),
  getGaitSession: vi.fn(async () => null),
  // Durable by default so the ephemeral-storage note stays hidden here.
  getPersistenceMode: vi.fn(async () => ({ source: "neon", durable: true })),
}));

// The upload path only has to get far enough to create the object URL and set the
// file name. jsdom decodes nothing, so videoWidth stays 0 and processFile raises its
// own decode error — which is exactly the state we want: a clip loaded, then a saved
// session loaded on top of it.
vi.mock("@/lib/gait/pose", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gait/pose")>("@/lib/gait/pose");
  return {
    ...actual,
    getPoseLandmarker: vi.fn(async () => ({ detectForVideo: vi.fn(() => ({ landmarks: [] })) })),
    waitForVideoMetadata: vi.fn(async () => undefined),
    waitForVideoData: vi.fn(async () => undefined),
  };
});

const { GaitApp } = await import("../GaitApp");

const OBJECT_URL = "blob:gait-lab/clip-a";

function syntheticMetrics(): GaitMetrics {
  return computeGaitMetrics(
    generateSyntheticWalkingFrames({ fps: 30, durationSec: 24, viewAngle: "sagittal" }),
  );
}

function sessionRecord() {
  const metrics = syntheticMetrics();
  return {
    id: "gs_existing_row",
    sessionName: "Prior Walk",
    taskMode: "single" as const,
    overallScore: metrics.overallScore,
    stabilityScore: metrics.stabilityScore,
    rhythmScore: metrics.rhythmScore,
    symmetryScore: metrics.symmetryScore,
    mobilityScore: metrics.mobilityScore,
    automaticityScore: metrics.automaticityScore,
    cadenceSpm: metrics.cadenceSpm,
    stepCount: metrics.stepCount,
    durationSec: metrics.durationSec,
    viewAngle: metrics.viewAngle,
    metricsJson: metrics,
    guessesJson: buildEducatedGuesses(metrics, { taskMode: "single" }),
    dualTaskJson: null,
    angleAnalysisJson: null,
    patientMetaJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  saveSpy.mockClear();
  saveSpy.mockImplementation(async (args: { data: { id?: string } }) => ({
    id: args.data.id ?? "gs_server_assigned_1",
  }));
  listSpy.mockClear();
  listSpy.mockResolvedValue([sessionRecord()]);

  createObjectURL = vi.fn(() => OBJECT_URL);
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Push a video file through the hidden file input and wait for the object URL. */
async function uploadClip(): Promise<void> {
  const input = screen.getByLabelText(/Upload walking video file/i) as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], "clip-a.mp4", { type: "video/mp4" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
}

/** Load the single stored session through the history drawer. */
async function loadStoredSession(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Open session history/i }));
  });
  const loadButton = await screen.findByRole("button", { name: /^Load$/i });
  await act(async () => {
    fireEvent.click(loadButton);
  });
}

describe("GaitApp clears the previous clip when a stored session is loaded", () => {
  it("revokes the object URL and drops the scanned poses so no stale skeleton survives", async () => {
    render(<GaitApp />);
    await uploadClip();

    // Stage 2 is showing the uploaded clip: the canvas is mounted, not the empty state.
    expect((await screen.findAllByText(/clip-a\.mp4/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No video loaded/i)).toBeNull();

    revokeObjectURL.mockClear();
    await loadStoredSession();

    // The clip's blob URL is released exactly as the reset paths release it.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL));

    // The loaded session took over the workflow.
    expect(await screen.findByText(/Prior Walk/i)).toBeTruthy();

    // Walking back to Process shows no video and no candidate subjects — the
    // previous clip's frames and people are gone, not merely hidden.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Stage 2: Process/i }));
    });
    expect(await screen.findByText(/No video loaded/i)).toBeTruthy();
    expect(screen.queryByRole("listbox", { name: /Candidate subject persons/i })).toBeNull();
  });
});

describe("GaitApp surfaces a rejected save", () => {
  it("shows the thrown ownership-guard message in an alert instead of only logging it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    saveSpy.mockRejectedValue(
      new Error("Session could not be saved: id belongs to another user."),
    );

    render(<GaitApp />);
    await loadStoredSession();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Stage 3: Analyze/i }));
    });

    const saveButton = await screen.findByRole("button", { name: /Save session/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/id belongs to another user/i);
    // The failure must not read as a success.
    expect(screen.queryByRole("button", { name: /^Saved$/i })).toBeNull();
    consoleError.mockRestore();
  });

  it("clears the alert once a later save succeeds", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    saveSpy.mockRejectedValueOnce(new Error("Session could not be saved: id belongs to another user."));

    render(<GaitApp />);
    await loadStoredSession();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Stage 3: Analyze/i }));
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Save session/i }));
    });
    expect(await screen.findByRole("alert")).toBeTruthy();

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Save session/i }));
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    consoleError.mockRestore();
  });
});
