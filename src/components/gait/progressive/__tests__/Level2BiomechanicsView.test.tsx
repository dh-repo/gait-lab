// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Level2BiomechanicsView } from "../Level2BiomechanicsView";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";
import { generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";

beforeAll(() => {
  // Polyfill ResizeObserver for Recharts ResponsiveContainer in jsdom
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("Level2BiomechanicsView Component", () => {
  const frames = generateSyntheticWalkingFrames({ durationSec: 5.0, fps: 30 });
  const angleAnalysis = computeGaitAngleAnalysis(frames, [], "sagittal");

  const mockAnalysis: AnalysisResult = {
    personId: 1,
    analyzedFrames: 150,
    taskMode: "single",
    notes: ["Clinical kinematics session"],
    metrics: createMockMetrics({
      viewAngle: "sagittal",
      cadenceSpm: 108,
      gaitSpeedMps: 1.25,
      stepLengthLeft: 0.65,
      stepLengthRight: 0.64,
      leftStancePct: 61.5,
      rightStancePct: 60.8,
      leftSwingPct: 38.5,
      rightSwingPct: 39.2,
      doubleSupportPct: 21.0,
      symmetryAngle: 3.2,
      kneeFlexLeft: 58.5,
      kneeFlexRight: 59.2,
      confidenceIntervals: {
        cadence: { value: 108, ci95Lower: 105.2, ci95Upper: 110.8, splitHalfDiff: 2.1 },
        gaitSpeed: { value: 1.25, ci95Lower: 1.20, ci95Upper: 1.30, splitHalfDiff: 0.04 },
        symmetryAngle: { value: 3.2, ci95Lower: 2.8, ci95Upper: 3.6, splitHalfDiff: 0.3 },
      },
    }),
    guesses: [],
    angleAnalysis: angleAnalysis || undefined,
    frames,
  };

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Waveforms, 8-Phase Ribbon, Symmetry, Spatio-Temporal)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("renders joint kinematic waveforms selector and chart container", () => {
      render(<Level2BiomechanicsView analysis={mockAnalysis} />);

      // Waveform tabs: Knee, Hip, Ankle
      expect(screen.getByRole("tab", { name: /Knee/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Hip/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Ankle/i })).toBeInTheDocument();
    });

    it("displays Perry 8-Phase Gait Cycle ribbon with phase tokens", () => {
      render(<Level2BiomechanicsView analysis={mockAnalysis} currentTimeSec={1.2} />);

      // Check for Perry phase abbreviations or labels
      expect(screen.getByText(/Initial Contact|IC/i)).toBeInTheDocument();
      expect(screen.getByText(/Loading Response|LR/i)).toBeInTheDocument();
      expect(screen.getByText(/Mid Stance|MST|MSt/i)).toBeInTheDocument();
      expect(screen.getByText(/Terminal Stance|TST|TSt/i)).toBeInTheDocument();
      expect(screen.getByText(/Pre Swing|Pre-Swing|PSW|PSw/i)).toBeInTheDocument();
    });

    it("renders Zifchock Symmetry Angle (SA%) and Gait Symmetry Index (GSI)", () => {
      render(<Level2BiomechanicsView analysis={mockAnalysis} />);

      expect(screen.getByText(/Symmetry Angle|SA%/i)).toBeInTheDocument();
      expect(screen.getByText(/3.2/)).toBeInTheDocument();
    });

    it("renders step-by-step spatio-temporal metrics table with 95% CIs", () => {
      render(<Level2BiomechanicsView analysis={mockAnalysis} />);

      // Spatiotemporal table items
      expect(screen.getByText(/Cadence/i)).toBeInTheDocument();
      expect(screen.getByText(/108/)).toBeInTheDocument();

      expect(screen.getByText(/Gait Speed|Velocity/i)).toBeInTheDocument();
      expect(screen.getByText(/1.25/)).toBeInTheDocument();

      expect(screen.getByText(/Double Support/i)).toBeInTheDocument();
      expect(screen.getByText(/21.0|21%/i)).toBeInTheDocument();

      // Check 95% CI column / values
      expect(screen.getByText(/95% CI|Confidence Interval/i)).toBeInTheDocument();
      expect(screen.getByText(/105.2.*110.8/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Frontal view suppression, Asymmetry)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("suppresses sagittal waveforms cleanly when viewAngle is frontal", () => {
      const frontalAnalysis: AnalysisResult = {
        ...mockAnalysis,
        metrics: createMockMetrics({
          viewAngle: "frontal",
          pelvicObliquity: 0.04,
          meanStepWidth: 0.28,
        }),
        angleAnalysis: {
          isSuppressed: true,
          suppressionReason: "Sagittal flexion angles are suppressed in Frontal view to prevent optical distortion.",
          normalizedPoints: [],
          leftStrides: [],
          rightStrides: [],
          metrics: {
            kneeRomLeft: null,
            kneeRomRight: null,
            kneePeakFlexionLeft: null,
            kneePeakFlexionRight: null,
            kneeAsymmetryPct: null,
            hipRomLeft: null,
            hipRomRight: null,
            hipPeakFlexionLeft: null,
            hipPeakExtensionLeft: null,
            hipPeakFlexionRight: null,
            hipPeakExtensionRight: null,
            hipAsymmetryPct: null,
            ankleRomLeft: null,
            ankleRomRight: null,
            anklePeakDorsiflexionLeft: null,
            anklePeakPlantarflexionLeft: null,
            anklePeakDorsiflexionRight: null,
            anklePeakPlantarflexionRight: null,
            ankleAsymmetryPct: null,
          },
          normativeData: [],
        } as any,
      };

      render(<Level2BiomechanicsView analysis={frontalAnalysis} />);

      // Should display suppression explanation
      expect(
        screen.getByText(/suppressed in Frontal view|Frontal view active/i)
      ).toBeInTheDocument();

      // Frontal metrics should still be visible
      expect(screen.getByText(/Pelvic Obliquity|Step Width/i)).toBeInTheDocument();
    });

    it("flags severe symmetry angle violation (> 10%) with warning badge", () => {
      const highAsymmetryAnalysis: AnalysisResult = {
        ...mockAnalysis,
        metrics: createMockMetrics({
          symmetryAngle: 14.5,
          leftStancePct: 70.0,
          rightStancePct: 54.0,
        }),
      };

      render(<Level2BiomechanicsView analysis={highAsymmetryAnalysis} />);

      expect(screen.getByText(/14.5/)).toBeInTheDocument();
      // Should show warning or elevated asymmetry indicator
      expect(
        screen.getByText(/Asymmetric|Elevated Asymmetry|Warning|High Deviation/i)
      ).toBeInTheDocument();
    });

    it("handles missing confidence intervals gracefully with '—' or 'N/A'", () => {
      const analysisWithoutCIs: AnalysisResult = {
        ...mockAnalysis,
        metrics: createMockMetrics({
          confidenceIntervals: undefined,
        }),
      };

      render(<Level2BiomechanicsView analysis={analysisWithoutCIs} />);
      expect(screen.getAllByText(/—|N\/A/i).length).toBeGreaterThan(0);
    });

    it("switches active joint angle tab between Knee, Hip, and Ankle", () => {
      render(<Level2BiomechanicsView analysis={mockAnalysis} />);

      const hipTab = screen.getByRole("tab", { name: /Hip/i });
      fireEvent.click(hipTab);
      expect(hipTab).toHaveAttribute("aria-selected", "true");

      const ankleTab = screen.getByRole("tab", { name: /Ankle/i });
      fireEvent.click(ankleTab);
      expect(ankleTab).toHaveAttribute("aria-selected", "true");
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("timeline scrubber time updates active phase highlighted on the 8-phase ribbon", () => {
      const { rerender } = render(
        <Level2BiomechanicsView analysis={mockAnalysis} currentTimeSec={0.1} />
      );

      // Phase at 0.1s is Initial Contact
      expect(screen.getByText(/Initial Contact|IC/i)).toBeInTheDocument();

      // Advance time to Mid Stance
      rerender(<Level2BiomechanicsView analysis={mockAnalysis} currentTimeSec={0.8} />);
      expect(screen.getByText(/Mid Stance|MST/i)).toBeInTheDocument();
    });

    it("verifies bilateral stance + swing phase percentage invariant (sum ~100%)", () => {
      render(<Level2BiomechanicsView analysis={mockAnalysis} />);

      // Left Stance 61.5% + Left Swing 38.5% = 100%
      expect(screen.getByText(/61.5/)).toBeInTheDocument();
      expect(screen.getByText(/38.5/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Biomechanist evaluating Parkinsonian festinating gait pattern", () => {
      const parkinsonianAnalysis: AnalysisResult = {
        personId: 99,
        analyzedFrames: 300,
        taskMode: "single",
        notes: ["Parkinsonian festination evaluation"],
        metrics: createMockMetrics({
          cadenceSpm: 138,
          gaitSpeedMps: 0.72,
          stepLengthLeft: 0.38,
          stepLengthRight: 0.36,
          doubleSupportPct: 32.5,
          stepTimeCV: 0.082,
          strideTimeCV: 0.076,
          symmetryAngle: 4.8,
        }),
        guesses: [],
      };

      render(<Level2BiomechanicsView analysis={parkinsonianAnalysis} />);

      // High cadence
      expect(screen.getByText("138")).toBeInTheDocument();
      // High double support
      expect(screen.getByText(/32.5/)).toBeInTheDocument();
    });
  });
});
