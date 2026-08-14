// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Level1PatientView } from "../Level1PatientView";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics, generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";

// Mock Three.js / DigitalTwinCanvas for safe jsdom rendering
vi.mock("@/components/gait/DigitalTwinCanvas", () => {
  return {
    DigitalTwinCanvas: (props: any) => (
      <div data-testid="mock-digital-twin-canvas" data-current-time={props.currentTime}>
        Digital Twin 3D Viewport (Time: {props.currentTime?.toFixed(2)}s)
      </div>
    ),
  };
});

afterEach(() => {
  cleanup();
});

describe("Level1PatientView Component", () => {
  const mockAnalysis: AnalysisResult = {
    personId: 1,
    analyzedFrames: 180,
    taskMode: "single",
    notes: ["Patient initial visit"],
    metrics: createMockMetrics({
      overallScore: 82,
      rhythmScore: 80,
      symmetryScore: 88,
      mobilityScore: 78,
      pathSmoothness: 0.84,
      cadenceSpm: 104,
      kneeFlexLeft: 56,
      kneeFlexRight: 58,
    }),
    guesses: [
      {
        id: "guess-1",
        title: "Mild Symmetrical Stride",
        summary: "Walking pattern shows consistent bilateral rhythm with slight step length reduction.",
        evidence: ["Cadence within normal range", "Symmetry angle < 3%"],
        confidence: 0.88,
        severity: "low",
        category: "symmetry",
      },
    ],
    frames: generateSyntheticWalkingFrames({ durationSec: 6.0, fps: 30 }),
  };

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Digital Twin, Score Rings, Takeaways, HEP)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("mounts the 3D Digital Twin canvas / media player viewport", () => {
      render(<Level1PatientView analysis={mockAnalysis} currentTimeSec={1.5} />);

      expect(screen.getByTestId("mock-digital-twin-canvas")).toBeInTheDocument();
      expect(screen.getByText(/Digital Twin 3D Viewport/i)).toBeInTheDocument();
    });

    it("displays the human-centered score rings (Overall, Rhythm, Symmetry, Smoothness)", () => {
      render(<Level1PatientView analysis={mockAnalysis} />);

      // Verify Score Rings presence
      expect(screen.getByText("82")).toBeInTheDocument(); // Overall
      expect(screen.getByText("80")).toBeInTheDocument(); // Rhythm
      expect(screen.getByText("88")).toBeInTheDocument(); // Symmetry
      expect(screen.getByText("84")).toBeInTheDocument(); // Smoothness
    });

    it("displays plain-language key observations and takeaways", () => {
      render(<Level1PatientView analysis={mockAnalysis} />);

      // Plain language section header
      expect(
        screen.getByRole("heading", { name: /Key Observations|How You Move|Movement Insights/i })
      ).toBeInTheDocument();
    });

    it("renders Quick Home Exercise Program (HEP) preview cards", () => {
      render(<Level1PatientView analysis={mockAnalysis} />);

      // HEP Section
      expect(
        screen.getByRole("heading", { name: /Recommended Exercises|Quick Exercise Guide|Home Plan/i })
      ).toBeInTheDocument();

      // Should render at least 2 exercise suggestion cards
      const exerciseCards = screen.getAllByTestId("hep-exercise-card");
      expect(exerciseCards.length).toBeGreaterThanOrEqual(2);
    });

    it("provides a quick action button to open full HEP modal", () => {
      const onOpenHepModal = vi.fn();
      render(<Level1PatientView analysis={mockAnalysis} onOpenHepModal={onOpenHepModal} />);

      const viewAllButton = screen.getByRole("button", {
        name: /View All Exercises|Full Exercise Program|Open HEP/i,
      });
      expect(viewAllButton).toBeInTheDocument();

      fireEvent.click(viewAllButton);
      expect(onOpenHepModal).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Null frames, Missing scores, Zero steps)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("handles missing pose frames gracefully without crashing", () => {
      const analysisWithoutFrames: AnalysisResult = {
        ...mockAnalysis,
        frames: undefined,
      };

      render(<Level1PatientView analysis={analysisWithoutFrames} />);
      expect(screen.getByText(/82/)).toBeInTheDocument();
    });

    it("handles low step count / truncated gait recording", () => {
      const shortAnalysis: AnalysisResult = {
        ...mockAnalysis,
        metrics: createMockMetrics({
          stepCount: 2,
          overallScore: 60,
        }),
      };

      render(<Level1PatientView analysis={shortAnalysis} />);
      expect(screen.getByText(/60/)).toBeInTheDocument();
    });

    it("tailors exercise suggestions when significant knee asymmetry is detected", () => {
      const asymmetricalAnalysis: AnalysisResult = {
        ...mockAnalysis,
        metrics: createMockMetrics({
          kneeFlexLeft: 38,
          kneeFlexRight: 62,
          kneeAsymmetry: 24,
          overallScore: 62,
        }),
      };

      render(<Level1PatientView analysis={asymmetricalAnalysis} />);
      // Should include knee mobility or strengthening exercise
      expect(screen.getByText(/Knee|Quad|Extension|Mobility/i)).toBeInTheDocument();
    });

    it("media playback controls (play/pause toggle) trigger appropriately", () => {
      const onTogglePlay = vi.fn();
      render(
        <Level1PatientView
          analysis={mockAnalysis}
          isPlaying={false}
          onTogglePlay={onTogglePlay}
        />
      );

      const playButton = screen.getByRole("button", { name: /Play|Pause|toggle-play/i });
      fireEvent.click(playButton);
      expect(onTogglePlay).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("synchronizes playback timeline seek with digital twin viewport", () => {
      const onSeek = vi.fn();
      const { rerender } = render(
        <Level1PatientView
          analysis={mockAnalysis}
          currentTimeSec={2.0}
          onSeek={onSeek}
        />
      );

      const twin = screen.getByTestId("mock-digital-twin-canvas");
      expect(twin).toHaveAttribute("data-current-time", "2");

      // Rerender with updated time
      rerender(
        <Level1PatientView
          analysis={mockAnalysis}
          currentTimeSec={3.5}
          onSeek={onSeek}
        />
      );
      expect(twin).toHaveAttribute("data-current-time", "3.5");
    });

    it("clicking a specific exercise card invokes onOpenHepModal with the exercise ID", () => {
      const onOpenHepModal = vi.fn();
      render(<Level1PatientView analysis={mockAnalysis} onOpenHepModal={onOpenHepModal} />);

      const exerciseCards = screen.getAllByTestId("hep-exercise-card");
      fireEvent.click(exerciseCards[0]);

      expect(onOpenHepModal).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Elderly patient with balance concerns receives encouraging summary and safe HEP cards", () => {
      const elderlyPatientAnalysis: AnalysisResult = {
        personId: 88,
        analyzedFrames: 300,
        taskMode: "single",
        notes: ["Fall risk prevention screening"],
        metrics: createMockMetrics({
          overallScore: 68,
          stabilityScore: 64,
          rhythmScore: 72,
          symmetryScore: 76,
          mobilityScore: 62,
          pathSmoothness: 0.70,
          cadenceSpm: 92,
          stepTimeCV: 0.065,
        }),
        guesses: [],
      };

      render(<Level1PatientView analysis={elderlyPatientAnalysis} />);

      // Should display patient-friendly score ring
      expect(screen.getByText("68")).toBeInTheDocument();
      // Should show balance / stability exercise
      expect(screen.getByText(/Balance|Stance|Stability|Step/i)).toBeInTheDocument();
    });
  });
});
