// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import * as THREE from "three";
import { DualAvatarCanvas } from "../DualAvatarCanvas";
import type { GaitSessionRecord } from "@/lib/gait/persistence";
import type { GaitMetrics } from "@/lib/gait/types";

// Mock WebGLRenderer at ESM module level with prototype methods for spying
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    setSize(_w: number, _h: number) {}
    setPixelRatio(_r: number) {}
    render(_s: unknown, _c: unknown) {}
    dispose() {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

function createMockSession(id: string, name: string): GaitSessionRecord {
  return {
    id,
    userId: "user-test-1",
    sessionName: name,
    taskMode: "single",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    overallScore: 82.5,
    stabilityScore: 80.0,
    rhythmScore: 85.0,
    symmetryScore: 84.0,
    mobilityScore: 81.0,
    automaticityScore: 82.0,
    cadenceSpm: 108,
    stepCount: 26,
    durationSec: 15,
    viewAngle: "sagittal",
    guessesJson: [],
    metricsJson: ({
      viewAngle: "sagittal",
      viewConfidence: 0.95,
      durationSec: 15,
      fpsEffective: 30,
      stepCount: 26,
      cadenceSpm: 108,
      avgStepTimeSec: 0.55,
      stepTimeAsymmetry: 2.1,
      strideAsymmetry: 1.8,
      lateralSway: 0.02,
      verticalBounce: 0.015,
      armSwingLeft: 22,
      armSwingRight: 24,
      armSwingAsymmetry: 4.5,
      kneeFlexLeft: 58,
      kneeFlexRight: 60,
      kneeAsymmetry: 2.0,
      stepWidthVariability: 0.03,
      doubleSupportHint: 0.22,
      stepTimeCV: 2.1,
      strideTimeCV: 1.9,
      pelvicObliquity: 3.2,
      pelvicObliquityVar: 0.4,
      meanStepWidth: 0.12,
      pathSmoothness: 0.92,
    } as unknown as GaitMetrics),
    angleAnalysisJson: {
      isSuppressed: false,
      normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeAngleLeft: 10 + 40 * Math.sin((i / 100) * Math.PI),
        kneeAngleRight: 10 + 40 * Math.sin(((i + 50) % 100 / 100) * Math.PI),
        hipAngleLeft: 20 * Math.cos((i / 100) * 2 * Math.PI),
        hipAngleRight: -20 * Math.cos((i / 100) * 2 * Math.PI),
        ankleAngleLeft: 5 * Math.sin((i / 100) * 2 * Math.PI),
        ankleAngleRight: -5 * Math.sin((i / 100) * 2 * Math.PI),
      })),
      leftStrides: [],
      rightStrides: [],
      metrics: {
        kneeRomLeft: 40,
        kneeRomRight: 40,
        kneePeakFlexionLeft: 50,
        kneePeakFlexionRight: 50,
        kneeAsymmetryPct: 0,
        hipRomLeft: 40,
        hipRomRight: 40,
        hipPeakFlexionLeft: 20,
        hipPeakExtensionLeft: -20,
        hipPeakFlexionRight: 20,
        hipPeakExtensionRight: -20,
        hipAsymmetryPct: 0,
        ankleRomLeft: 10,
        ankleRomRight: 10,
        anklePeakDorsiflexionLeft: 5,
        anklePeakDorsiflexionRight: 5,
        anklePeakPlantarflexionLeft: -5,
        anklePeakPlantarflexionRight: -5,
        ankleAsymmetryPct: 0,
      },
      normativeData: [],
    },
  };
}

describe("DualAvatarCanvas Component & Synchronized 3D Stage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders dual avatar stage with session badges in Side-by-Side mode", () => {
    const sessionA = createMockSession("session-1", "Baseline Session");
    const sessionB = createMockSession("session-2", "Follow-up Session");

    render(
      <DualAvatarCanvas
        sessionA={sessionA}
        sessionB={sessionB}
        currentPhasePct={20}
        viewMode="side-by-side"
      />,
    );

    expect(screen.getByText(/Baseline Session/i)).toBeTruthy();
    expect(screen.getByText(/Follow-up Session/i)).toBeTruthy();
    expect(screen.getByTestId("mode-side-by-side")).toBeTruthy();
    expect(screen.getByTestId("mode-ghost-overlay")).toBeTruthy();
    expect(screen.getByText(/Mid Stance/i)).toBeTruthy(); // 20% is Mid Stance (12-31%)
  });

  it("renders Ghost Overlay mode badge and handles mode toggle clicks", () => {
    const sessionA = createMockSession("session-1", "Baseline Session");
    const sessionB = createMockSession("session-2", "Follow-up Session");
    const onViewModeChange = vi.fn();

    const { rerender } = render(
      <DualAvatarCanvas
        sessionA={sessionA}
        sessionB={sessionB}
        currentPhasePct={0}
        viewMode="ghost-overlay"
        onViewModeChange={onViewModeChange}
      />,
    );

    expect(screen.getByText(/Ghost: A \(Cyan\) · Solid: B \(Emerald\)/i)).toBeTruthy();

    const sbsBtn = screen.getByTestId("mode-side-by-side");
    fireEvent.click(sbsBtn);
    expect(onViewModeChange).toHaveBeenCalledWith("side-by-side");

    rerender(
      <DualAvatarCanvas
        sessionA={sessionA}
        sessionB={sessionB}
        currentPhasePct={0}
        viewMode="side-by-side"
        onViewModeChange={onViewModeChange}
      />,
    );
    expect(screen.getByText(/Baseline Session/i)).toBeTruthy();
  });

  it("switches camera planes and invokes onCameraModeChange callback", () => {
    const sessionA = createMockSession("session-1", "Baseline Session");
    const sessionB = createMockSession("session-2", "Follow-up Session");
    const onCameraModeChange = vi.fn();

    render(
      <DualAvatarCanvas
        sessionA={sessionA}
        sessionB={sessionB}
        currentPhasePct={15}
        onCameraModeChange={onCameraModeChange}
      />,
    );

    fireEvent.click(screen.getByTestId("cam-sagittal"));
    expect(onCameraModeChange).toHaveBeenCalledWith("sagittal");

    fireEvent.click(screen.getByTestId("cam-frontal"));
    expect(onCameraModeChange).toHaveBeenCalledWith("frontal");

    fireEvent.click(screen.getByTestId("cam-transverse"));
    expect(onCameraModeChange).toHaveBeenCalledWith("transverse");

    fireEvent.click(screen.getByTestId("cam-orbit"));
    expect(onCameraModeChange).toHaveBeenCalledWith("orbit");
  });

  it("toggles 3D trajectory joint trails and invokes onTrajectoryJointChange", () => {
    const sessionA = createMockSession("session-1", "Baseline Session");
    const sessionB = createMockSession("session-2", "Follow-up Session");
    const onTrajectoryJointChange = vi.fn();

    render(
      <DualAvatarCanvas
        sessionA={sessionA}
        sessionB={sessionB}
        currentPhasePct={40}
        onTrajectoryJointChange={onTrajectoryJointChange}
      />,
    );

    fireEvent.click(screen.getByTestId("traj-ankle"));
    expect(onTrajectoryJointChange).toHaveBeenCalledWith("ankle");

    fireEvent.click(screen.getByTestId("traj-knee"));
    expect(onTrajectoryJointChange).toHaveBeenCalledWith("knee");

    fireEvent.click(screen.getByTestId("traj-wrist"));
    expect(onTrajectoryJointChange).toHaveBeenCalledWith("wrist");

    fireEvent.click(screen.getByTestId("traj-com"));
    expect(onTrajectoryJointChange).toHaveBeenCalledWith("com");

    fireEvent.click(screen.getByTestId("traj-none"));
    expect(onTrajectoryJointChange).toHaveBeenCalledWith("none");
  });

  it("updates Perry 8-phase ribbon badge across different phase percentages", () => {
    const sessionA = createMockSession("session-1", "Baseline Session");
    const sessionB = createMockSession("session-2", "Follow-up Session");

    const { rerender } = render(
      <DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={1} />,
    );
    expect(screen.getByText(/Initial Contact/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={8} />);
    expect(screen.getByText(/Loading Response/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={25} />);
    expect(screen.getByText(/Mid Stance/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={45} />);
    expect(screen.getByText(/Terminal Stance/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={55} />);
    expect(screen.getByText(/Pre-Swing/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={68} />);
    expect(screen.getByText(/Initial Swing/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={80} />);
    expect(screen.getByText(/Mid Swing/i)).toBeTruthy();

    rerender(<DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={95} />);
    expect(screen.getByText(/Terminal Swing/i)).toBeTruthy();
  });

  it("cleans up Three.js scene, geometries, and materials on unmount without crashing", () => {
    const sessionA = createMockSession("session-1", "Baseline Session");
    const sessionB = createMockSession("session-2", "Follow-up Session");

    const { unmount } = render(
      <DualAvatarCanvas sessionA={sessionA} sessionB={sessionB} currentPhasePct={50} />,
    );

    expect(() => unmount()).not.toThrow();
  });
});
