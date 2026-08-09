// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionHistoryDrawer } from "../SessionHistoryDrawer";
import type { GaitSessionRecord } from "@/lib/gait/persistence";
import { getPersistenceMode, listGaitSessions, deleteGaitSession } from "@/lib/gait/persistence";
import type { GaitMetrics } from "@/lib/gait/types";

// The drawer calls the persistence server fns directly on open; mock the module
// so the component can be driven without a database or auth context.
vi.mock("@/lib/gait/persistence", () => ({
  listGaitSessions: vi.fn(),
  deleteGaitSession: vi.fn(),
  saveGaitSession: vi.fn(),
  getGaitSession: vi.fn(),
  // Durable by default so the ephemeral-storage banner stays hidden here.
  getPersistenceMode: vi.fn(async () => ({ source: "neon", durable: true })),
}));

const mockList = vi.mocked(
  listGaitSessions as unknown as () => Promise<GaitSessionRecord[]>,
);
const mockDelete = vi.mocked(
  deleteGaitSession as unknown as (args: { data: string }) => Promise<unknown>,
);

function makeSession(
  id: string,
  name: string,
  overrides: Partial<GaitSessionRecord> = {},
): GaitSessionRecord {
  return {
    id,
    userId: "user-1",
    sessionName: name,
    taskMode: "single",
    overallScore: 80,
    stabilityScore: 78,
    rhythmScore: 82,
    symmetryScore: 79,
    mobilityScore: 83,
    automaticityScore: 81,
    cadenceSpm: 106,
    stepCount: 40,
    durationSec: 22.5,
    viewAngle: "sagittal",
    symmetryAngle: 3.2,
    metricsJson: ({
      cadenceSpm: 106,
      stepCount: 40,
      durationSec: 22.5,
      series: [],
      stepEvents: [],
    } as unknown as GaitMetrics),
    guessesJson: [],
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

const s1 = makeSession("sess-1", "Baseline Walk");
const s2 = makeSession("sess-2", "Follow-Up Walk", {
  overallScore: 86,
  cadenceSpm: 112,
  createdAt: "2026-08-15T10:00:00Z",
});
const s3 = makeSession("sess-3", "Discharge Walk", {
  overallScore: 91,
  cadenceSpm: 118,
  createdAt: "2026-09-01T10:00:00Z",
  taskMode: "dual",
});

const allSessions = [s3, s2, s1]; // newest first, as listGaitSessions orders

describe("SessionHistoryDrawer", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockDelete.mockReset();
    mockList.mockResolvedValue(allSessions);
    mockDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  const noop = () => {};

  it("renders nothing while closed and does not fetch", () => {
    const { container } = render(
      <SessionHistoryDrawer isOpen={false} onClose={noop} onLoadSession={noop} />,
    );

    expect(container.firstChild).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("lists saved sessions once opened", async () => {
    render(<SessionHistoryDrawer isOpen onClose={noop} onLoadSession={noop} />);

    await screen.findByTestId("session-card-sess-3");

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-card-sess-1").textContent).toContain(
      "Baseline Walk",
    );
    expect(screen.getByTestId("session-card-sess-2").textContent).toContain(
      "Follow-Up Walk",
    );
    expect(screen.getByTestId("session-card-sess-3").textContent).toContain(
      "Discharge Walk",
    );
  });

  it("renders no comparison checkboxes when onCompareSessions is not supplied", async () => {
    render(<SessionHistoryDrawer isOpen onClose={noop} onLoadSession={noop} />);

    await screen.findByTestId("session-card-sess-1");

    expect(screen.queryByTestId("checkbox-select-sess-1")).toBeNull();
    expect(screen.queryByTestId("compare-selected-button")).toBeNull();
  });

  it("hides the Compare action at 0 and at 1 selected, and shows it at exactly 2", async () => {
    render(
      <SessionHistoryDrawer
        isOpen
        onClose={noop}
        onLoadSession={noop}
        onCompareSessions={noop}
      />,
    );

    await screen.findByTestId("checkbox-select-sess-1");

    // 0 selected
    expect(screen.queryByTestId("compare-selected-button")).toBeNull();
    expect(screen.getByText(/\(0\/2 selected\)/)).toBeTruthy();

    // 1 selected
    fireEvent.click(screen.getByTestId("checkbox-select-sess-1"));
    expect(screen.queryByTestId("compare-selected-button")).toBeNull();
    expect(screen.getByText(/\(1\/2 selected\)/)).toBeTruthy();

    // 2 selected
    fireEvent.click(screen.getByTestId("checkbox-select-sess-2"));
    expect(screen.getByTestId("compare-selected-button")).toBeTruthy();
    expect(screen.getByText(/\(2\/2 selected\)/)).toBeTruthy();

    // Deselecting drops back to 1 and hides the action again.
    fireEvent.click(screen.getByTestId("checkbox-select-sess-1"));
    expect(screen.queryByTestId("compare-selected-button")).toBeNull();
    expect(screen.getByText(/\(1\/2 selected\)/)).toBeTruthy();
  });

  it("caps selection at 2 by evicting the oldest selection (FIFO) on a third pick", async () => {
    const onCompareSessions = vi.fn();
    render(
      <SessionHistoryDrawer
        isOpen
        onClose={noop}
        onLoadSession={noop}
        onCompareSessions={onCompareSessions}
      />,
    );

    await screen.findByTestId("checkbox-select-sess-1");

    fireEvent.click(screen.getByTestId("checkbox-select-sess-1"));
    fireEvent.click(screen.getByTestId("checkbox-select-sess-2"));
    fireEvent.click(screen.getByTestId("checkbox-select-sess-3"));

    // Still capped at two.
    expect(screen.getByText(/\(2\/2 selected\)/)).toBeTruthy();

    // sess-1 (the first pick) was evicted; sess-2 and sess-3 remain, in that order.
    fireEvent.click(screen.getByTestId("compare-selected-button"));
    expect(onCompareSessions).toHaveBeenCalledTimes(1);
    expect(onCompareSessions).toHaveBeenCalledWith(s2, s3);
  });

  it("invokes onCompareSessions with the two selected records in selection order and closes", async () => {
    const onCompareSessions = vi.fn();
    const onClose = vi.fn();
    render(
      <SessionHistoryDrawer
        isOpen
        onClose={onClose}
        onLoadSession={noop}
        onCompareSessions={onCompareSessions}
      />,
    );

    await screen.findByTestId("checkbox-select-sess-3");

    // Pick the newest first, then the oldest: order follows clicks, not list order.
    fireEvent.click(screen.getByTestId("checkbox-select-sess-3"));
    fireEvent.click(screen.getByTestId("checkbox-select-sess-1"));

    fireEvent.click(screen.getByTestId("compare-selected-button"));

    expect(onCompareSessions).toHaveBeenCalledTimes(1);
    const [argA, argB] = onCompareSessions.mock.calls[0];
    expect(argA.id).toBe("sess-3");
    expect(argB.id).toBe("sess-1");
    expect(argA).toEqual(s3);
    expect(argB).toEqual(s1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("loads a session and closes the drawer when Load is clicked", async () => {
    const onLoadSession = vi.fn();
    const onClose = vi.fn();
    render(
      <SessionHistoryDrawer
        isOpen
        onClose={onClose}
        onLoadSession={onLoadSession}
      />,
    );

    const card = await screen.findByTestId("session-card-sess-2");
    const loadButton = Array.from(card.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Load"),
    );
    expect(loadButton).toBeTruthy();

    fireEvent.click(loadButton!);

    expect(onLoadSession).toHaveBeenCalledTimes(1);
    const [result, name] = onLoadSession.mock.calls[0];
    expect(name).toBe("Follow-Up Walk");
    expect(result.metrics).toEqual(s2.metricsJson);
    expect(result.taskMode).toBe("single");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the load-failure message and not the empty-list message when the fetch rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockList.mockRejectedValue(new Error("unauthenticated"));

    render(
      <SessionHistoryDrawer
        isOpen
        onClose={noop}
        onLoadSession={noop}
        onCompareSessions={noop}
      />,
    );

    const message = await screen.findByText(
      "Sign-in required or failed to load sessions.",
    );
    expect(message).toBeTruthy();

    expect(screen.queryByText(/No saved sessions found/i)).toBeNull();
    expect(screen.queryByTestId("session-card-sess-1")).toBeNull();
    expect(screen.queryByTestId("compare-selected-button")).toBeNull();

    consoleError.mockRestore();
  });

  it("renders the empty-list message when the fetch resolves with no sessions", async () => {
    mockList.mockResolvedValue([]);

    render(<SessionHistoryDrawer isOpen onClose={noop} onLoadSession={noop} />);

    const message = await screen.findByText(/No saved sessions found/i);
    expect(message).toBeTruthy();
    expect(
      screen.queryByText("Sign-in required or failed to load sessions."),
    ).toBeNull();
  });

  it("removes a deleted session from the list and drops it from the selection", async () => {
    render(
      <SessionHistoryDrawer
        isOpen
        onClose={noop}
        onLoadSession={noop}
        onCompareSessions={noop}
      />,
    );

    await screen.findByTestId("checkbox-select-sess-2");

    fireEvent.click(screen.getByTestId("checkbox-select-sess-2"));
    fireEvent.click(screen.getByTestId("checkbox-select-sess-3"));
    expect(screen.getByTestId("compare-selected-button")).toBeTruthy();

    const card = screen.getByTestId("session-card-sess-2");
    const deleteButton = Array.from(card.querySelectorAll("button")).at(-1)!;
    fireEvent.click(deleteButton);

    await vi.waitFor(() => {
      expect(screen.queryByTestId("session-card-sess-2")).toBeNull();
    });

    expect(mockDelete).toHaveBeenCalledWith({ data: "sess-2" });
    expect(screen.getByText(/\(1\/2 selected\)/)).toBeTruthy();
    expect(screen.queryByTestId("compare-selected-button")).toBeNull();
  });
});

describe("ephemeral storage disclosure", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("warns that sessions are not stored permanently when the backend is in-memory", async () => {
    // With no DATABASE_URL the app falls back to PGLite with no dataDir: sessions
    // live in one serverless instance's memory and vanish on cold start. The drawer
    // must not present them as durably saved.
    vi.mocked(getPersistenceMode as unknown as () => Promise<{ source: string; durable: boolean }>)
      .mockResolvedValue({ source: "pglite", durable: false });
    mockList.mockResolvedValue([]);

    render(
      <SessionHistoryDrawer isOpen onClose={() => {}} onLoadSession={() => {}} />,
    );

    const warning = await screen.findByTestId("ephemeral-storage-warning");
    expect(warning.textContent).toContain("not stored permanently");
  });

  it("stays silent when a real database is configured", async () => {
    vi.mocked(getPersistenceMode as unknown as () => Promise<{ source: string; durable: boolean }>)
      .mockResolvedValue({ source: "neon", durable: true });
    mockList.mockResolvedValue([]);

    render(
      <SessionHistoryDrawer isOpen onClose={() => {}} onLoadSession={() => {}} />,
    );

    await screen.findByText(/No saved sessions/i);
    expect(screen.queryByTestId("ephemeral-storage-warning")).toBeNull();
  });
});
