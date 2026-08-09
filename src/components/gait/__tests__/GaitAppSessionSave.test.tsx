// @vitest-environment jsdom
/**
 * GaitApp session persistence & dual-task disclosure (R3).
 *
 * Covers two behaviours that the live-capture integration tests do not touch:
 *
 *  1. Saving is an upsert. The first save of a fresh result mints a row; every save
 *     after that must carry the id the server handed back, or the server's
 *     ON CONFLICT (id) DO UPDATE branch is unreachable and editing patient metadata
 *     duplicates the session.
 *  2. A dual-task run with no single-task baseline in the page session yields no
 *     dual-task cost. The UI has to say so, not leave a bare "Baseline" badge.
 *
 * The server function is mocked; no network or database is involved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { computeGaitMetrics } from "@/lib/gait/analysis";
import { buildEducatedGuesses } from "@/lib/gait/guesses";
import { generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";
import type { GaitMetrics, TaskMode } from "@/lib/gait/types";

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
}));

const { GaitApp } = await import("../GaitApp");

function syntheticMetrics(): GaitMetrics {
  return computeGaitMetrics(
    generateSyntheticWalkingFrames({ fps: 30, durationSec: 24, viewAngle: "sagittal" }),
  );
}

function sessionRecord(taskMode: TaskMode) {
  const metrics = syntheticMetrics();
  return {
    id: "gs_existing_row",
    sessionName: "Prior Walk",
    taskMode,
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
    guessesJson: buildEducatedGuesses(metrics, { taskMode }),
    dualTaskJson: null,
    angleAnalysisJson: null,
    patientMetaJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Load the single stored session through the history drawer, then open Stage 3. */
async function loadStoredSessionAndOpenInsights(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Open session history/i }));
  });
  const loadButton = await screen.findByRole("button", { name: /^Load$/i });
  await act(async () => {
    fireEvent.click(loadButton);
  });
  await act(async () => {
    fireEvent.click(screen.getByText(/Clinical Insights/i));
  });
}

beforeEach(() => {
  saveSpy.mockClear();
  listSpy.mockClear();
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
});

describe("GaitApp session save is an upsert, not an insert", () => {
  it("re-saving the same result passes the id the server returned", async () => {
    listSpy.mockResolvedValue([sessionRecord("single")]);
    render(<GaitApp />);
    await loadStoredSessionAndOpenInsights();

    const saveButton = await screen.findByRole("button", { name: /Save Session/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    // First save of a result the app has no row id for: the server mints one.
    expect(saveSpy.mock.calls[0][0].data.id).toBeUndefined();

    // A metadata edit followed by another save must update that same row.
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Save/i }));
    });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    expect(saveSpy.mock.calls[1][0].data.id).toBe("gs_server_assigned_1");
  });
});

describe("GaitApp dual-task run without a baseline", () => {
  it("states plainly that dual-task cost is unavailable instead of showing a bare badge", async () => {
    listSpy.mockResolvedValue([sessionRecord("dual")]);
    render(<GaitApp />);
    await loadStoredSessionAndOpenInsights();

    expect(
      await screen.findByText(/No single-task baseline recorded/i),
    ).toBeTruthy();
    expect(screen.getByText(/Dual-Task: unavailable/i)).toBeTruthy();
    // No substitute baseline and no default effect size is invented.
    expect(screen.queryByText(/Dual-Task: 0\.0%/)).toBeNull();
  });

  it("shows the plain Baseline badge for a single-task run", async () => {
    listSpy.mockResolvedValue([sessionRecord("single")]);
    render(<GaitApp />);
    await loadStoredSessionAndOpenInsights();

    expect(screen.getByText(/Dual-Task: Baseline/i)).toBeTruthy();
    expect(screen.queryByText(/No single-task baseline recorded/i)).toBeNull();
  });
});
