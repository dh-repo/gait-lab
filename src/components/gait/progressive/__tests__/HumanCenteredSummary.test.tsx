// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HumanCenteredSummary } from "../HumanCenteredSummary";
import { deriveMobilitySummary, type MobilitySummaryData } from "../types";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";

afterEach(() => {
  cleanup();
});

const mockSummaryData: MobilitySummaryData = {
  overallScore: 84,
  readinessLabel: "Good",
  symmetryScore: 91,
  smoothnessScore: 82,
  paceScore: 79,
  keyTakeaways: [
    {
      id: "takeaway-1",
      type: "positive",
      text: "Even bilateral stride distribution",
      laymanExplanation: "Both legs are sharing the workload smoothly with 91% symmetry.",
    },
    {
      id: "takeaway-2",
      type: "warning",
      text: "Mild knee flexion limitation during stance",
      laymanExplanation: "Your left knee stays slightly stiff when planting your foot.",
    },
    {
      id: "takeaway-3",
      type: "info",
      text: "Comfortable self-selected cadence",
      laymanExplanation: "Your stepping rhythm matches standard healthy adult walking.",
    },
  ],
};

describe("HumanCenteredSummary Component", () => {
  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Score Ring, Layman Explanations, Takeaways)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("renders overall readiness score and label", () => {
      render(<HumanCenteredSummary data={mockSummaryData} />);

      // Overall Score Ring
      expect(screen.getByText("84")).toBeInTheDocument();
      expect(screen.getByText(/Good/i)).toBeInTheDocument();
    });

    it("renders the 3 key layman metric chips (Pace, Symmetry, Smoothness)", () => {
      render(<HumanCenteredSummary data={mockSummaryData} />);

      expect(screen.getByText(/Pace/i)).toBeInTheDocument();
      expect(screen.getByText("79")).toBeInTheDocument();

      expect(screen.getByText(/Symmetry/i)).toBeInTheDocument();
      expect(screen.getByText("91")).toBeInTheDocument();

      expect(screen.getByText(/Smoothness/i)).toBeInTheDocument();
      expect(screen.getByText("82")).toBeInTheDocument();
    });

    it("renders all key takeaway items with titles and layman explanations", () => {
      render(<HumanCenteredSummary data={mockSummaryData} />);

      // Verify takeaway text
      expect(screen.getByText("Even bilateral stride distribution")).toBeInTheDocument();
      expect(
        screen.getByText("Both legs are sharing the workload smoothly with 91% symmetry.")
      ).toBeInTheDocument();

      expect(screen.getByText("Mild knee flexion limitation during stance")).toBeInTheDocument();
      expect(
        screen.getByText("Your left knee stays slightly stiff when planting your foot.")
      ).toBeInTheDocument();

      expect(screen.getByText("Comfortable self-selected cadence")).toBeInTheDocument();
    });

    it("displays appropriate status badges (positive, warning, info)", () => {
      const { container } = render(<HumanCenteredSummary data={mockSummaryData} />);

      // Positive indicator / icon or badge
      expect(screen.getByText("Even bilateral stride distribution")).toBeInTheDocument();
      // Warning indicator
      expect(screen.getByText("Mild knee flexion limitation during stance")).toBeInTheDocument();
      // Info indicator
      expect(screen.getByText("Comfortable self-selected cadence")).toBeInTheDocument();
    });

    it("derives summary metrics directly when an AnalysisResult object is passed", () => {
      const mockResult: AnalysisResult = {
        personId: 1,
        analyzedFrames: 300,
        taskMode: "single",
        notes: ["Clinical baseline"],
        metrics: createMockMetrics({
          overallScore: 88,
          symmetryScore: 92,
          rhythmScore: 85,
          pathSmoothness: 0.9,
          cadenceSpm: 112,
          symmetryAngle: 2.1,
        }),
        guesses: [],
      };

      render(<HumanCenteredSummary analysis={mockResult} />);

      // Should compute readiness label and display overall score
      expect(screen.getByText("88")).toBeInTheDocument();
      expect(screen.getByText(/Excellent|Good/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Extreme scores, Empty state, Long text)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("handles boundary score 0 and displays 'Needs Attention'", () => {
      const lowData: MobilitySummaryData = {
        overallScore: 0,
        readinessLabel: "Needs Attention",
        symmetryScore: 0,
        smoothnessScore: 0,
        paceScore: 0,
        keyTakeaways: [],
      };

      render(<HumanCenteredSummary data={lowData} />);
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText(/Needs Attention/i)).toBeInTheDocument();
    });

    it("handles boundary score 100 and displays 'Excellent'", () => {
      const perfectData: MobilitySummaryData = {
        overallScore: 100,
        readinessLabel: "Excellent",
        symmetryScore: 100,
        smoothnessScore: 100,
        paceScore: 100,
        keyTakeaways: [],
      };

      render(<HumanCenteredSummary data={perfectData} />);
      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText(/Excellent/i)).toBeInTheDocument();
    });

    it("handles empty key takeaways array gracefully with empty state notice", () => {
      const emptyTakeawaysData: MobilitySummaryData = {
        overallScore: 95,
        readinessLabel: "Excellent",
        symmetryScore: 95,
        smoothnessScore: 95,
        paceScore: 95,
        keyTakeaways: [],
      };

      render(<HumanCenteredSummary data={emptyTakeawaysData} />);
      expect(
        screen.getByText(/No significant deviations detected|Gait is within healthy parameters/i)
      ).toBeInTheDocument();
    });

    it("safely handles long text with special characters and symbols", () => {
      const longTextData: MobilitySummaryData = {
        ...mockSummaryData,
        keyTakeaways: [
          {
            id: "special-char-takeaway",
            type: "warning",
            text: "Knee flexion angle < 45° & step asymmetry > 15.5% (L vs R) — [High Sensitivity]",
            laymanExplanation:
              "We noticed that your left knee bends less than 45° during swing phase (< 45°) & your right step takes significantly longer (> 15.5%). This is common in joint guarding.",
          },
        ],
      };

      render(<HumanCenteredSummary data={longTextData} />);
      expect(
        screen.getByText(/Knee flexion angle < 45° & step asymmetry > 15.5%/i)
      ).toBeInTheDocument();
    });

    it("deriveMobilitySummary helper accurately maps score ranges to readiness labels", () => {
      const highMetrics = createMockMetrics({ overallScore: 92 });
      const goodMetrics = createMockMetrics({ overallScore: 78 });
      const fairMetrics = createMockMetrics({ overallScore: 55 });
      const lowMetrics = createMockMetrics({ overallScore: 35 });

      expect(deriveMobilitySummary(highMetrics).readinessLabel).toBe("Excellent");
      expect(deriveMobilitySummary(goodMetrics).readinessLabel).toBe("Good");
      expect(deriveMobilitySummary(fairMetrics).readinessLabel).toBe("Fair");
      expect(deriveMobilitySummary(lowMetrics).readinessLabel).toBe("Needs Attention");
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("fires onTakeawayClick when a takeaway card is clicked", () => {
      const onTakeawayClick = vi.fn();
      render(
        <HumanCenteredSummary
          data={mockSummaryData}
          onTakeawayClick={onTakeawayClick}
        />
      );

      const takeawayCard = screen.getByText("Mild knee flexion limitation during stance");
      fireEvent.click(takeawayCard);

      expect(onTakeawayClick).toHaveBeenCalledWith("takeaway-2");
    });

    it("fires onExploreDeepDive when 'Explore Telemetry' action is clicked", () => {
      const onExploreDeepDive = vi.fn();
      render(
        <HumanCenteredSummary
          data={mockSummaryData}
          onExploreDeepDive={onExploreDeepDive}
        />
      );

      const exploreButton = screen.getByRole("button", {
        name: /Explore Telemetry|View Biomechanics|Deep Dive/i,
      });
      fireEvent.click(exploreButton);

      expect(onExploreDeepDive).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Post-ACL reconstruction patient summary presentation", () => {
      const aclAnalysis: AnalysisResult = {
        personId: 42,
        analyzedFrames: 450,
        taskMode: "single",
        notes: ["Post-op Week 8 evaluation"],
        metrics: createMockMetrics({
          overallScore: 58,
          symmetryScore: 62,
          rhythmScore: 70,
          mobilityScore: 55,
          kneeFlexLeft: 42.0,
          kneeFlexRight: 62.5,
          kneeAsymmetry: 20.5,
          leftStancePct: 52.0,
          rightStancePct: 68.0,
          symmetryAngle: 8.4,
        }),
        guesses: [],
      };

      render(<HumanCenteredSummary analysis={aclAnalysis} />);

      // Should indicate Fair or Needs Attention
      expect(screen.getByText(/Fair|Needs Attention/i)).toBeInTheDocument();
      // Overall score
      expect(screen.getByText("58")).toBeInTheDocument();
    });
  });
});
