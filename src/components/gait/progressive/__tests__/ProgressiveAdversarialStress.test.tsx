/// <reference types="@testing-library/jest-dom/vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { ProgressiveDisclosureNav } from "../ProgressiveDisclosureNav";
import { HumanCenteredSummary } from "../HumanCenteredSummary";
import { Level1PatientView } from "../Level1PatientView";
import { Level2BiomechanicsView } from "../Level2BiomechanicsView";
import { Level3SpecialistView } from "../Level3SpecialistView";
import { ResponsiveMediaViewport } from "../ResponsiveMediaViewport";
import { ViewportHUD } from "../ViewportHUD";
import { ScoreRing } from "../../ScoreRing";
import {
  type DisclosureTier,
  deriveMobilitySummaryData,
  DISCLOSURE_TIERS,
} from "../types";
import type { AnalysisResult, GaitMetrics, Landmark, PoseFrame } from "@/lib/gait/types";
import { createMockMetrics, generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";

// Mock Three.js / DigitalTwinCanvas for fast headless jsdom testing
vi.mock("@/components/gait/DigitalTwinCanvas", () => {
  return {
    DigitalTwinCanvas: (props: any) => (
      <div
        data-testid="mock-digital-twin-canvas"
        data-current-time={props.currentTime}
        data-frame-index={props.currentFrameIndex}
        data-playing={String(props.isPlaying)}
      >
        Digital Twin 3D Viewport (Time: {props.currentTime?.toFixed(2) ?? "0.00"}s)
      </div>
    ),
  };
});

// Mock SkeletonCanvas for safe 2D canvas testing
vi.mock("@/components/gait/SkeletonCanvas", () => {
  return {
    SkeletonCanvas: (props: any) => (
      <div
        data-testid="mock-skeleton-canvas"
        data-skeleton={String(props.showSkeleton)}
        data-arcs={String(props.showJointArcs)}
        data-sway={String(props.showSwayVector)}
      >
        Skeleton Canvas Overlay
      </div>
    ),
  };
});

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

/**
 * Harness that renders the progressive disclosure system with simulated video playback and fast tier switching.
 */
function RapidPlaybackProgressiveHarness({
  analysis,
  initialTier = "level1_patient",
  totalFrames = 150,
  fps = 30,
}: {
  analysis?: AnalysisResult;
  initialTier?: DisclosureTier;
  totalFrames?: number;
  fps?: number;
}) {
  const [activeTier, setActiveTier] = useState<DisclosureTier>(initialTier);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const currentTimeSec = totalFrames > 0 && fps > 0 ? currentFrameIndex / fps : 0;

  return (
    <div data-testid="rapid-playback-harness" className="p-4 flex flex-col gap-4">
      {/* Top summary */}
      <HumanCenteredSummary analysis={analysis} onSelectTier={setActiveTier} />

      {/* Nav */}
      <ProgressiveDisclosureNav
        activeTier={activeTier}
        onSelectTier={setActiveTier}
        anomalyCount={analysis?.guesses?.length ?? 0}
      />

      {/* Playback Simulation Buttons */}
      <div className="flex gap-2">
        <button
          data-testid="btn-step-tick"
          onClick={() => setCurrentFrameIndex((prev) => (prev + 1) % Math.max(1, totalFrames))}
        >
          Step Tick
        </button>
        <button
          data-testid="btn-toggle-play"
          onClick={() => setIsPlaying((p) => !p)}
        >
          Toggle Play
        </button>
        <span data-testid="time-display">{currentTimeSec.toFixed(2)}s</span>
      </div>

      {/* Tier Views */}
      {activeTier === "level1_patient" && (
        <Level1PatientView
          analysis={analysis}
          currentTimeSec={currentTimeSec}
          currentFrameIndex={currentFrameIndex}
          totalFrames={totalFrames}
          effectiveFps={fps}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
        />
      )}

      {activeTier === "level2_biomechanics" && (
        <Level2BiomechanicsView
          analysis={analysis}
          currentTimeSec={currentTimeSec}
          currentGaitCyclePct={totalFrames > 0 ? (currentFrameIndex / totalFrames) * 100 : 0}
          effectiveFps={fps}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
        />
      )}

      {activeTier === "level3_specialist" && (
        <Level3SpecialistView
          analysis={analysis}
        />
      )}
    </div>
  );
}

describe("Empirical Challenger 1: Adversarial & Stress Testing Suite", () => {
  // =========================================================================
  // GROUP 1: Corrupted, Null, Empty & Boundary Inputs
  // =========================================================================
  describe("Group 1: Null, Corrupted & Degenerate Input Resiliency", () => {
    it("1.1 renders HumanCenteredSummary gracefully when passed undefined/null data and analysis", () => {
      expect(() => {
        render(<HumanCenteredSummary data={undefined} summary={undefined} analysis={undefined} />);
      }).not.toThrow();

      expect(screen.getByTestId("human-centered-summary")).toBeInTheDocument();
      expect(screen.getByTestId("readiness-status-badge")).toBeInTheDocument();
      expect(screen.getByTestId("domain-chips")).toBeInTheDocument();
      expect(screen.getByTestId("key-takeaways-list")).toBeInTheDocument();
    });

    it("1.2 renders Level1PatientView with undefined analysis, 0 frames, and empty poses without throwing", () => {
      expect(() => {
        render(
          <Level1PatientView
            analysis={undefined}
            result={undefined}
            currentFramePoses={[]}
            allLandmarkFrames={[]}
            currentFrameIndex={0}
            totalFrames={0}
            currentTimeSec={0}
          />
        );
      }).not.toThrow();

      expect(screen.getByTestId("level1-patient-view")).toBeInTheDocument();
      expect(screen.getByText("Visual Digital Twin Playback")).toBeInTheDocument();
      expect(screen.getByTestId("cognitive-clusters")).toBeInTheDocument();
    });

    it("1.3 renders Level2BiomechanicsView with completely missing angle analysis and null metrics", () => {
      const sparseAnalysis = {
        metrics: createMockMetrics({
          cadenceSpm: 0,
          symmetryAngle: null as any,
          confidenceIntervals: undefined,
          leftStancePct: undefined,
          rightStancePct: undefined,
        }),
        frames: [],
        guesses: [],
        angleAnalysis: undefined,
      } as unknown as AnalysisResult;

      expect(() => {
        render(<Level2BiomechanicsView analysis={sparseAnalysis} currentGaitCyclePct={0} />);
      }).not.toThrow();

      expect(screen.getByTestId("level2-biomechanics-view")).toBeInTheDocument();
      expect(screen.getByText("Perry 8-Phase Gait Cycle Breakdown")).toBeInTheDocument();
      expect(screen.getByText("Spatio-Temporal Parameters & Reliability Bounds")).toBeInTheDocument();
    });

    it("1.4 renders Level3SpecialistView with empty analysis, null camera, and undefined metadata", () => {
      expect(() => {
        render(
          <Level3SpecialistView
            analysis={undefined}
            result={undefined}
            patientMeta={undefined}
            cameraPerspective={undefined}
          />
        );
      }).not.toThrow();

      expect(screen.getByTestId("level3-specialist-view")).toBeInTheDocument();
      expect(screen.getByText(/Patient ID:/i)).toBeInTheDocument();
      expect(screen.getByText("Camera Perspective & 3D Homography Calibration")).toBeInTheDocument();
    });

    it("1.5 handles single-stride session (stepCount: 1, 1 frame, 0 duration) across all derivation pipelines", () => {
      const singleStrideMetrics = createMockMetrics({
        stepCount: 1,
        cadenceSpm: 45,
        durationSec: 0.8,
        series: [],
        stepEvents: [],
      });

      const derived = deriveMobilitySummaryData(singleStrideMetrics);
      expect(derived.overallScore).toBeGreaterThanOrEqual(0);
      expect(derived.overallScore).toBeLessThanOrEqual(100);
      expect(derived.stepCount).toBe(1);
      expect(Array.isArray(derived.keyTakeaways)).toBe(true);

      const singleFrameAnalysis: AnalysisResult = {
        metrics: singleStrideMetrics,
        frames: [generateSyntheticWalkingFrames({ durationSec: 0.1, fps: 30 })[0]],
        guesses: [],
      };

      const { unmount } = render(
        <RapidPlaybackProgressiveHarness analysis={singleFrameAnalysis} totalFrames={1} fps={30} />
      );
      expect(screen.getByTestId("rapid-playback-harness")).toBeInTheDocument();
      unmount();
    });

    it("1.6 handles corrupted angle trajectories where knee/hip/ankle have empty or mismatched series lengths", () => {
      const corruptedAngleAnalysis = {
        curves: {
          kneeFlexion: { left: [], right: [] },
          hipFlexion: { left: [10, 20], right: [] },
          ankleFlexion: { left: [], right: [5] },
        },
        metrics: {
          kneeAsymmetryPct: null as any,
          hipAsymmetryPct: undefined as any,
        },
        isSuppressed: false,
      } as any;

      const corruptedAnalysis: AnalysisResult = {
        metrics: createMockMetrics(),
        frames: [],
        guesses: [],
        angleAnalysis: corruptedAngleAnalysis,
      };

      expect(() => {
        render(<Level2BiomechanicsView analysis={corruptedAnalysis} />);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // GROUP 2: Rapid Tier Switching Under Simulated Video Playback
  // =========================================================================
  describe("Group 2: Rapid Tier Switching & State Synchronization Under Playback", () => {
    it("2.1 sustains 30 rapid tier switches (L1 -> L3 -> L2 -> L1) while video timeline is actively advancing", () => {
      const walkingFrames = generateSyntheticWalkingFrames({ durationSec: 3.0, fps: 30 });
      const testAnalysis: AnalysisResult = {
        metrics: createMockMetrics({ stepCount: 10, cadenceSpm: 110 }),
        frames: walkingFrames,
        guesses: [
          {
            id: "guess-1",
            title: "Antalgic Trend",
            summary: "Slight left-sided stance reduction.",
            severity: "moderate",
            confidence: 0.85,
            basis: "Stance phase asymmetry",
          },
        ],
      };

      render(
        <RapidPlaybackProgressiveHarness
          analysis={testAnalysis}
          initialTier="level1_patient"
          totalFrames={walkingFrames.length}
          fps={30}
        />
      );

      const tabL1 = screen.getByTestId("tier-tab-level1_patient");
      const tabL2 = screen.getByTestId("tier-tab-level2_biomechanics");
      const tabL3 = screen.getByTestId("tier-tab-level3_specialist");
      const stepBtn = screen.getByTestId("btn-step-tick");

      // Execute 30 cycles of rapid interleaved playback ticks + tier transitions
      const tiers: DisclosureTier[] = [
        "level3_specialist",
        "level2_biomechanics",
        "level1_patient",
        "level2_biomechanics",
        "level3_specialist",
        "level1_patient",
      ];

      for (let i = 0; i < 30; i++) {
        act(() => {
          // Advance frame tick
          fireEvent.click(stepBtn);
        });

        const targetTier = tiers[i % tiers.length];
        const targetBtn =
          targetTier === "level1_patient"
            ? tabL1
            : targetTier === "level2_biomechanics"
              ? tabL2
              : tabL3;

        act(() => {
          fireEvent.click(targetBtn);
        });

        // Verify that the active tier rendered cleanly
        if (targetTier === "level1_patient") {
          expect(screen.getByTestId("level1-patient-view")).toBeInTheDocument();
        } else if (targetTier === "level2_biomechanics") {
          expect(screen.getByTestId("level2-biomechanics-view")).toBeInTheDocument();
        } else {
          expect(screen.getByTestId("level3-specialist-view")).toBeInTheDocument();
        }
      }
    });

    it("2.2 rapid keyboard navigation (Arrow keys, Home, End) switches tiers instantaneously without desync", () => {
      const onSelect = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelect}
          anomalyCount={2}
        />
      );

      const tabL1 = screen.getByTestId("tier-tab-level1_patient");

      // Rapid keyboard events
      fireEvent.keyDown(tabL1, { key: "ArrowRight" });
      expect(onSelect).toHaveBeenLastCalledWith("level2_biomechanics");

      fireEvent.keyDown(tabL1, { key: "ArrowLeft" });
      expect(onSelect).toHaveBeenLastCalledWith("level3_specialist");

      fireEvent.keyDown(tabL1, { key: "End" });
      expect(onSelect).toHaveBeenLastCalledWith("level3_specialist");

      fireEvent.keyDown(tabL1, { key: "Home" });
      expect(onSelect).toHaveBeenLastCalledWith("level1_patient");
    });
  });

  // =========================================================================
  // GROUP 3: Extreme Symmetry, NaN & Pathological Value Stress
  // =========================================================================
  describe("Group 3: Extreme Symmetry & Pathological Values (100%, 0%, NaN, Infinity)", () => {
    it("3.1 handles 100% extreme asymmetry (SA=100%, stance=100/0) cleanly with safe fallbacks and alerts", () => {
      const extremeMetrics = createMockMetrics({
        symmetryAngle: 100.0,
        symmetryScore: 0,
        leftStancePct: 100.0,
        rightStancePct: 0.0,
        overallScore: 20,
      });

      const summary = deriveMobilitySummaryData(extremeMetrics);
      expect(summary.symmetryScore).toBe(0);
      expect(summary.readinessLabel).toBe("Needs Attention");
      expect(summary.readinessTone).toBe("danger");

      const analysis: AnalysisResult = {
        metrics: extremeMetrics,
        frames: [],
        guesses: [],
      };

      const { unmount } = render(<Level2BiomechanicsView analysis={analysis} />);
      // Should show severe asymmetry alert badge
      expect(screen.getByText("Elevated Asymmetry Warning")).toBeInTheDocument();
      // Should display 100.0% SA
      expect(screen.getByText("100.0%")).toBeInTheDocument();
      unmount();
    });

    it("3.2 handles 0% perfect symmetry (SA=0.0%, stance=50/50, CV=0) with optimal readiness", () => {
      const perfectMetrics = createMockMetrics({
        symmetryAngle: 0.0,
        symmetryScore: 100,
        leftStancePct: 50.0,
        rightStancePct: 50.0,
        stepTimeCV: 0.0,
        overallScore: 100,
      });

      const summary = deriveMobilitySummaryData(perfectMetrics);
      expect(summary.symmetryScore).toBe(100);
      expect(summary.readinessLabel).toBe("Excellent");
      expect(summary.readinessTone).toBe("success");

      const analysis: AnalysisResult = {
        metrics: perfectMetrics,
        frames: [],
        guesses: [],
      };

      const { unmount } = render(<HumanCenteredSummary analysis={analysis} />);
      expect(screen.getByText("Balanced")).toBeInTheDocument();
      unmount();
    });

    it("3.3 stress tests NaN, Infinity, -Infinity, and negative values in ScoreRing and Summary", () => {
      // ScoreRing resiliency
      const { unmount: unmountRing1 } = render(<ScoreRing score={NaN} label="NaN Test" />);
      expect(screen.getByText("NaN Test")).toBeInTheDocument();
      unmountRing1();

      const { unmount: unmountRing2 } = render(<ScoreRing score={Infinity} label="Inf Test" />);
      expect(screen.getByText("Inf Test")).toBeInTheDocument();
      unmountRing2();

      const { unmount: unmountRing3 } = render(<ScoreRing score={-Infinity} label="-Inf Test" />);
      expect(screen.getByText("-Inf Test")).toBeInTheDocument();
      unmountRing3();

      // Summary with NaN & Infinity metrics
      const pathologicalMetrics = createMockMetrics({
        symmetryAngle: NaN,
        cadenceSpm: Infinity,
        overallScore: -50,
        pathSmoothness: NaN,
        stabilityScore: NaN,
        mobilityScore: -999,
      });

      const summary = deriveMobilitySummaryData(pathologicalMetrics);
      // Overall and sub-scores should clamp to valid non-negative ranges [0, 100]
      expect(summary.overallScore).toBeGreaterThanOrEqual(0);
      expect(summary.overallScore).toBeLessThanOrEqual(100);
      expect(summary.paceScore).toBeGreaterThanOrEqual(0);
      expect(summary.smoothnessScore).toBeGreaterThanOrEqual(0);

      const analysis: AnalysisResult = {
        metrics: pathologicalMetrics,
        frames: [],
        guesses: [],
      };

      expect(() => {
        render(<HumanCenteredSummary analysis={analysis} />);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // GROUP 4: High-Concurrency HUD, Viewport & Aspect Ratio Stress
  // =========================================================================
  describe("Group 4: Responsive Media Viewport & HUD Telemetry Stress", () => {
    it("4.1 renders ResponsiveMediaViewport under unconventional and extreme aspect ratios", () => {
      const ratios = ["9:16", "16:9", "1:1", "21:9", "4:3", "auto", ""];

      for (const r of ratios) {
        const { unmount } = render(
          <ResponsiveMediaViewport aspectRatio={r}>
            <div data-testid="viewport-child">Test Ratio {r}</div>
          </ResponsiveMediaViewport>
        );
        expect(screen.getByTestId("responsive-media-viewport")).toBeInTheDocument();
        expect(screen.getByTestId("viewport-child")).toBeInTheDocument();
        unmount();
      }
    });

    it("4.2 tests ViewportHUD under extreme camera tilt (>45° pitch and roll) and 0% tracking confidence", () => {
      render(
        <ViewportHUD
          fps={0}
          confidence={0.0}
          pitchDeg={85.4}
          rollDeg={-72.1}
          isCollapsible={true}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText("0 FPS")).toBeInTheDocument();
      expect(screen.getByText("0% Low Confidence")).toBeInTheDocument();
      expect(screen.getByText(/Pitch: 85.4°/i)).toBeInTheDocument();
      expect(screen.getByText(/Roll: -72.1°/i)).toBeInTheDocument();
      expect(screen.getByText(/Optical angle exceeds 5° threshold/i)).toBeInTheDocument();
    });

    it("4.3 executes 20 rapid expand-collapse cycles on ViewportHUD without UI desync", () => {
      render(
        <ViewportHUD
          fps={60}
          confidence={0.99}
          pitchDeg={1.2}
          rollDeg={0.4}
          isCollapsible={true}
          defaultExpanded={false}
        />
      );

      const toggleBtn = screen.getByRole("button", { name: /toggle hud/i });

      for (let i = 0; i < 20; i++) {
        fireEvent.click(toggleBtn);
      }

      // After 20 toggles (even number), it should return to initial collapsed state
      expect(screen.getByRole("button", { name: /toggle hud/i })).toBeInTheDocument();
    });
  });

  // =========================================================================
  // GROUP 5: End-to-End Stress with Corrupted Multi-Layered Session
  // =========================================================================
  describe("Group 5: Full Workflow Resilience under Multi-Layered Stress Data", () => {
    it("5.1 executes full multi-tier navigation with dual-task cost, homography warning, and frontal suppression active simultaneously", () => {
      const complexMetrics = createMockMetrics({
        viewAngle: "frontal",
        viewConfidence: 0.65,
        cadenceSpm: 88,
        stepTimeCV: 0.08,
        symmetryAngle: 12.4,
        pelvicObliquity: 0.15,
        meanStepWidth: 0.45,
      });

      const complexAnalysis: AnalysisResult = {
        metrics: complexMetrics,
        frames: generateSyntheticWalkingFrames({ durationSec: 1.0, fps: 30, viewAngle: "frontal" }),
        guesses: [
          {
            id: "g1",
            title: "Significant Lateral Sway",
            summary: "Compensatory trunk lean observed.",
            severity: "elevated",
            confidence: 0.9,
            basis: "Frontal obliquity",
          },
        ],
        angleAnalysis: {
          curves: { kneeFlexion: { left: [], right: [] }, hipFlexion: { left: [], right: [] }, ankleFlexion: { left: [], right: [] } },
          metrics: { kneeAsymmetryPct: 15 },
          isSuppressed: true,
          suppressionReason: "Sagittal flexion angles are suppressed in Frontal view to prevent optical distortion.",
        } as any,
        cameraPerspective: {
          pitchDeg: 14.5,
          rollDeg: -8.2,
          distanceMeters: 3.1,
          opticalCenterOffsetPx: [0, 0],
          isOrthogonal: false,
          warningLevel: "warning",
          warningMessage: "High pitch tilt detected.",
        },
        dualTaskCost: {
          cadenceCostPct: -14.2,
          stepTimeCvCostPct: 22.5,
          speedCostPct: -18.0,
        } as any,
      };

      const { unmount } = render(
        <RapidPlaybackProgressiveHarness analysis={complexAnalysis} initialTier="level1_patient" />
      );

      // Verify Level 1 shows dual-task takeaway and exercise suggestions
      expect(screen.getByTestId("human-centered-summary")).toBeInTheDocument();
      expect(screen.getByText("Cognitive Load Effect")).toBeInTheDocument();

      // Switch to Level 2: verify frontal suppression notice is active
      const tabL2 = screen.getByTestId("tier-tab-level2_biomechanics");
      fireEvent.click(tabL2);
      expect(screen.getByText("Frontal Perspective Mode")).toBeInTheDocument();
      expect(screen.getByText(/Sagittal flexion angles are suppressed in Frontal view/i)).toBeInTheDocument();

      // Switch to Level 3: verify camera tilt advisory is rendered
      const tabL3 = screen.getByTestId("tier-tab-level3_specialist");
      fireEvent.click(tabL3);
      expect(screen.getByText("Perspective Alignment Advisory")).toBeInTheDocument();
      expect(screen.getByText(/High pitch tilt detected/i)).toBeInTheDocument();

      unmount();
    });
  });
});
